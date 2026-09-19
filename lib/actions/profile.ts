"use server";

import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { z } from "zod";

import { recordAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";

export type ProfileState = { error?: string; ok?: string };

/*
  YOUR OWN ROW, AND ONLY YOUR OWN.

  Neither action takes an id. The user being edited is the one in the session,
  every time — an id in a form field is a number somebody can change, and the
  only defence that works against that is never reading one.

  What a person may change about themselves is deliberately short: their name,
  their phone and the language the screens speak. Role, department, warehouse
  and status are employment facts, set by a manager, and a screen that let
  somebody promote themselves would be the whole permission system undone.
*/
const detailsSchema = z.object({
  name: z.string().trim().min(2, "Your name is needed."),
  phone: z.string().trim().max(30).optional(),
  locale: z.enum(["en", "sw", "zh"]),
});

export async function updateMyProfile(
  _prev: ProfileState | undefined,
  formData: FormData
): Promise<ProfileState> {
  const user = await requireUser();

  const parsed = detailsSchema.safeParse({
    name: formData.get("name")?.toString() ?? "",
    phone: formData.get("phone")?.toString() ?? "",
    locale: formData.get("locale")?.toString() ?? "en",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the details." };
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      name: parsed.data.name,
      phone: parsed.data.phone || null,
      locale: parsed.data.locale,
    },
  });

  await recordAudit({
    actor: user,
    action: "profile.update",
    entity: "User",
    entityId: user.id,
    summary: `${parsed.data.name} updated their own details`,
  });

  /* The name is in the sidebar and the top bar on every screen. */
  revalidatePath("/app", "layout");
  return { ok: "Saved." };
}

const passwordSchema = z
  .object({
    current: z.string().min(1, "Enter your current password."),
    next: z
      .string()
      .min(
        10,
        "Use at least 10 characters — this account moves other people's money and cargo."
      ),
    confirm: z.string().min(1, "Type the new password twice."),
  })
  .refine((v) => v.next === v.confirm, {
    message: "The two new passwords do not match.",
    path: ["confirm"],
  });

export async function changeMyPassword(
  _prev: ProfileState | undefined,
  formData: FormData
): Promise<ProfileState> {
  const user = await requireUser();

  const parsed = passwordSchema.safeParse({
    current: formData.get("current")?.toString() ?? "",
    next: formData.get("next")?.toString() ?? "",
    confirm: formData.get("confirm")?.toString() ?? "",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the details." };
  }

  const record = await prisma.user.findUnique({
    where: { id: user.id },
    select: { passwordHash: true },
  });
  if (!record) return { error: "Your account no longer exists." };

  /* Proving they know the current one is what stops a walk-up at an unlocked
     screen from becoming a locked-out employee. */
  const matches = await bcrypt.compare(parsed.data.current, record.passwordHash);
  if (!matches) return { error: "That is not your current password." };

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await bcrypt.hash(parsed.data.next, 12) },
  });

  /* The new password itself is never written anywhere — only that it changed,
     and by whom, so a locked-out employee can be told when it happened. */
  await recordAudit({
    actor: user,
    action: "profile.password",
    entity: "User",
    entityId: user.id,
    summary: `${user.name} changed their own password`,
  });

  return { ok: "Password changed. It applies the next time you sign in." };
}

/**
 * Switch the language this person reads the system in.
 *
 * Stored on the user rather than in a cookie: a Guangzhou packer on the bench
 * computer in the morning and a phone in the afternoon should not set it twice.
 * Every signed-in member of staff may choose it; it changes what the screens
 * say and nothing about what the person may do.
 */
export async function setLanguage(locale: string): Promise<ProfileState> {
  const user = await requireUser();
  if (locale !== "en" && locale !== "zh") return { error: "That is not a language this system speaks." };
  await prisma.user.update({ where: { id: user.id }, data: { locale } });
  await recordAudit({
    actor: user,
    action: "profile.language",
    entity: "User",
    entityId: user.id,
    summary: `${user.name} now reads the system in ${locale === "zh" ? "Chinese" : "English"}`,
  });
  /* Every server-rendered screen says something different now, so the whole
     shell is stale — not just the page the switch was pressed on. */
  revalidatePath("/app", "layout");
  return { ok: "Saved." };
}
