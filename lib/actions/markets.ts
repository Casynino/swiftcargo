"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { recordAudit } from "@/lib/audit";
import { composeMarketBody, slugifyMarket, splitLines } from "@/lib/markets";
import { prisma } from "@/lib/prisma";
import { authorize, type SessionUser } from "@/lib/session";

export type MarketActionState = { error?: string; ok?: string };

/**
 * The China markets directory.
 *
 * Guarded by content.manage, the same authority as the public sailing schedule:
 * the desk reads this out to customers as advice, so a wrong line here is
 * repeated on every call until somebody corrects it.
 */

const schema = z.object({
  id: z.string().trim().optional(),
  name: z.string().trim().min(2, "Give the market a name.").max(120),
  city: z.string().trim().min(2, "Which city?").max(120),
  category: z.string().trim().min(2, "Which kind of goods is this market for?").max(80),
  summary: z.string().trim().min(4, "One line: who should go here.").max(200),
  description: z.string().trim().min(10, "Describe the market.").max(1200),
  district: z.string().trim().max(160).optional(),
  hours: z.string().trim().max(200).optional(),
  products: z.string().optional(),
  tips: z.string().optional(),
  verify: z.string().trim().max(400).optional(),
  sortOrder: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v && v.length > 0 ? Number(v) : 0))
    .refine((v) => Number.isInteger(v), "Position must be a whole number."),
});

function denied(error: unknown): MarketActionState {
  return { error: error instanceof Error ? error.message : "Not permitted." };
}

function revalidateMarkets() {
  revalidatePath("/app/admin/markets");
  revalidatePath("/app/support/markets");
}

export async function saveMarket(
  _prev: MarketActionState,
  formData: FormData
): Promise<MarketActionState> {
  let actor: SessionUser;
  try {
    actor = await authorize("content.manage");
  } catch (error) {
    return denied(error);
  }

  const parsed = schema.safeParse(Object.fromEntries(formData) as Record<string, string>);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the market details." };
  }
  const input = parsed.data;

  const data = {
    name: input.name,
    city: input.city,
    category: input.category,
    summary: input.summary,
    body: composeMarketBody({
      description: input.description,
      district: input.district ?? "",
      hours: input.hours ?? "",
      products: splitLines(input.products),
      tips: splitLines(input.tips),
      verify: input.verify ?? "",
    }),
    sortOrder: input.sortOrder,
  };

  try {
    const market = input.id
      ? await prisma.marketInformation.update({
          where: { id: input.id },
          data,
          select: { id: true, name: true },
        })
      : await prisma.marketInformation.create({
          // The slug is only minted on create. Renaming a market later must not
          // break a link somebody has already sent a customer.
          data: { ...data, slug: await uniqueSlug(slugifyMarket(input.name)) },
          select: { id: true, name: true },
        });

    await recordAudit({
      actor,
      action: input.id ? "market.update" : "market.create",
      entity: "MarketInformation",
      entityId: market.id,
      summary: `${input.id ? "Updated" : "Added"} market "${market.name}"`,
    });

    revalidateMarkets();
    return { ok: input.id ? "Market saved." : "Market added." };
  } catch {
    return { error: "That market could not be saved. Try again." };
  }
}

async function uniqueSlug(base: string) {
  let candidate = base || "market";
  let suffix = 2;
  // Two markets in different cities can genuinely share a name.
  while (await prisma.marketInformation.findUnique({ where: { slug: candidate } })) {
    candidate = `${base || "market"}-${suffix++}`;
  }
  return candidate;
}

export async function setMarketPublished(
  marketId: string,
  published: boolean
): Promise<MarketActionState> {
  let actor: SessionUser;
  try {
    actor = await authorize("content.manage");
  } catch (error) {
    return denied(error);
  }

  const id = z.string().trim().min(1).safeParse(marketId);
  if (!id.success) return { error: "Which market?" };

  try {
    const market = await prisma.marketInformation.update({
      where: { id: id.data },
      data: { published: Boolean(published) },
      select: { name: true },
    });

    await recordAudit({
      actor,
      action: published ? "market.publish" : "market.unpublish",
      entity: "MarketInformation",
      entityId: id.data,
      summary: `${published ? "Published" : "Unpublished"} market "${market.name}"`,
    });

    revalidateMarkets();
    return { ok: published ? "Published." : "Unpublished." };
  } catch {
    return { error: "That market no longer exists." };
  }
}
