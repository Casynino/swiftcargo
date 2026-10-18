"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { recordAudit } from "@/lib/audit";
import { startWorkingAs, stopWorkingAs, workingAs } from "@/lib/developer";
import { prisma } from "@/lib/prisma";
import { realDeveloper } from "@/lib/session";

/**
 * WORK AS A STAFF MEMBER.
 *
 * Only a developer in developer mode can start it — the server reads that from
 * the session row, never from the request. While it lasts the session is that
 * person: their menu, their permissions, their refusals. Everything done is
 * recorded under the developer, with the person's name beside it, and it ends
 * by Stop, by four hours, or by the person becoming ineligible.
 */
export async function startWorkAs(formData: FormData) {
  const dev = await realDeveloper();
  if (!dev) redirect("/login");
  const targetId = String(formData.get("userId") ?? "");
  const target = await startWorkingAs(dev.user.id, dev.sid, targetId);
  if (!target) redirect("/app/developer/users?refused=1");
  await recordAudit({
    actor: dev.user,
    action: "developer.work_as.start",
    entity: "User",
    entityId: target.id,
    summary: `${dev.user.name} started working as ${target.name} (${target.role})`,
    metadata: { target: { id: target.id, name: target.name, role: target.role } },
  });
  redirect("/app/dashboard");
}

export async function stopWorkAs() {
  const dev = await realDeveloper();
  if (!dev) redirect("/login");
  const target = await workingAs(dev.user.id, dev.sid);
  await stopWorkingAs(dev.user.id, dev.sid);
  await recordAudit({
    actor: dev.user,
    action: "developer.work_as.stop",
    entity: "User",
    entityId: target?.id ?? null,
    summary: `${dev.user.name} stopped working as ${target?.name ?? "a staff member"}`,
  });
  redirect("/app/developer/users");
}

export type AccessState = { error?: string; ok?: string };

/**
 * SUSPEND A STAFF ACCOUNT, AND ONLY WITH A REASON AND A CONFIRMATION.
 *
 * Blocks the account at once — every request re-reads it, so an open session
 * stops with the next click. Never the owner, never another developer, never
 * oneself, and never while working as somebody. Recorded under the developer.
 */
export async function suspendAccount(_prev: AccessState, formData: FormData): Promise<AccessState> {
  const dev = await realDeveloper();
  if (!dev) return { error: "Not allowed." };
  if (await workingAs(dev.user.id, dev.sid)) return { error: "Stop working as someone first." };
  const id = String(formData.get("userId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim().slice(0, 300);
  if (String(formData.get("confirm") ?? "").trim() !== "CONFIRM") return { error: "Type CONFIRM to suspend." };
  if (reason.length < 3) return { error: "Say why." };
  const target = await prisma.user.findUnique({ where: { id }, select: { id: true, name: true, role: true, status: true } });
  if (!target || ["ADMIN", "DEVELOPER", "CUSTOMER"].includes(target.role) || target.id === dev.user.id) {
    return { error: "That account cannot be suspended here." };
  }
  if (target.status !== "ACTIVE") return { error: "It is not active." };
  await prisma.user.update({ where: { id: target.id }, data: { status: "SUSPENDED" } });
  await recordAudit({
    actor: dev.user,
    action: "developer.suspend",
    entity: "User",
    entityId: target.id,
    summary: `${dev.user.name} suspended ${target.name} — ${reason}`,
    metadata: { reason },
  });
  revalidatePath("/app/developer/users");
  return { ok: `${target.name} is suspended.` };
}

/** Re-activate — only an account this developer suspended and nobody has touched since. */
export async function reactivateAccount(_prev: AccessState, formData: FormData): Promise<AccessState> {
  const dev = await realDeveloper();
  if (!dev) return { error: "Not allowed." };
  if (await workingAs(dev.user.id, dev.sid)) return { error: "Stop working as someone first." };
  const id = String(formData.get("userId") ?? "");
  const target = await prisma.user.findUnique({ where: { id }, select: { id: true, name: true, status: true } });
  if (!target || target.status !== "SUSPENDED") return { error: "It is not suspended." };
  const last = await prisma.auditLog.findFirst({
    where: { entityId: id, action: { in: ["developer.suspend", "developer.reactivate"] }, actorId: dev.user.id },
    orderBy: { createdAt: "desc" },
    select: { action: true },
  });
  if (last?.action !== "developer.suspend") return { error: "You can only re-activate accounts you suspended yourself." };
  await prisma.user.update({ where: { id }, data: { status: "ACTIVE" } });
  await recordAudit({
    actor: dev.user,
    action: "developer.reactivate",
    entity: "User",
    entityId: id,
    summary: `${dev.user.name} re-activated ${target.name}`,
  });
  revalidatePath("/app/developer/users");
  return { ok: `${target.name} can sign in again.` };
}
