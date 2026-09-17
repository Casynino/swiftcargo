"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma } from "@prisma/client";

import { formatRate } from "@/lib/currency";
import { recordAudit, recordFieldChange } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { authorize } from "@/lib/session";

export type ActionState = { error?: string; ok?: string };

const rateSchema = z.object({
  service: z.enum(["LCL", "FCL"]),
  cargoType: z.string().trim().optional(),
  basis: z.enum(["PER_CBM", "PER_KG", "FLAT"]),
  rate: z.coerce.number().positive("A rate has to be above zero."),
  currency: z.string().trim().default("USD"),
  minimumCbm: z.coerce.number().min(0).optional(),
  minimumKg: z.coerce.number().min(0).optional(),
  published: z.coerce.boolean().optional(),
});

/**
 * Publish a rate.
 *
 * A NEW ROW, NEVER AN EDIT. Superseding the old rate rather than overwriting it
 * is what lets an invoice raised last month still explain the figure it charged
 * — and what stops a rate change quietly restating every historical bill.
 */
export async function createRate(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const actor = await authorize("rate.manage");

  const parsed = rateSchema.safeParse({
    service: formData.get("service") || "LCL",
    cargoType: formData.get("cargoType") || undefined,
    basis: formData.get("basis") || "PER_CBM",
    rate: formData.get("rate"),
    currency: formData.get("currency") || "USD",
    minimumCbm: formData.get("minimumCbm") || undefined,
    minimumKg: formData.get("minimumKg") || undefined,
    published: formData.get("published") === "on",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the form." };
  }
  const data = parsed.data;

  await prisma.$transaction(async (tx) => {
    /* Close the rate this one replaces, rather than deleting it. */
    await tx.shippingRate.updateMany({
      where: {
        service: data.service,
        cargoType: data.cargoType || null,
        active: true,
      },
      data: { active: false, effectiveTo: new Date() },
    });

    await tx.shippingRate.create({
      data: {
        service: data.service,
        cargoType: data.cargoType || null,
        basis: data.basis,
        rate: data.rate,
        currency: data.currency,
        minimumCbm: data.minimumCbm ?? null,
        minimumKg: data.minimumKg ?? null,
        published: data.published ?? true,
      },
    });
  });

  await recordAudit({
    actor,
    action: "rate.publish",
    entity: "ShippingRate",
    summary: `Published ${data.service}${data.cargoType ? ` / ${data.cargoType}` : ""} at ${data.currency} ${data.rate} ${data.basis.replace("_", " ").toLowerCase()}`,
  });

  revalidatePath("/app/finance/rates");
  revalidatePath("/rates");
  return { ok: "Rate published. Invoices already raised keep the rate they used." };
}

const customerRateSchema = z.object({
  customerId: z.string().min(1),
  service: z.enum(["LCL", "FCL"]),
  cargoType: z.string().trim().optional(),
  basis: z.enum(["PER_CBM", "PER_KG", "FLAT"]),
  rate: z.coerce.number().positive(),
  reason: z.string().trim().min(3, "Say why this customer has their own rate."),
});

/**
 * Agree a rate with one customer.
 *
 * It does NOT touch the standard rate — the standard is what the discount is
 * measured against, and overwriting it destroys the only evidence a discount
 * was ever given.
 */
export async function createCustomerRate(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const actor = await authorize("customerRate.manage");

  const parsed = customerRateSchema.safeParse({
    customerId: formData.get("customerId"),
    service: formData.get("service") || "LCL",
    cargoType: formData.get("cargoType") || undefined,
    basis: formData.get("basis") || "PER_CBM",
    rate: formData.get("rate"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the form." };
  }
  const data = parsed.data;

  const customer = await prisma.customer.findUnique({
    where: { id: data.customerId },
    select: { fullName: true },
  });
  if (!customer) return { error: "That customer no longer exists." };

  await prisma.$transaction(async (tx) => {
    await tx.customerRate.updateMany({
      where: {
        customerId: data.customerId,
        service: data.service,
        cargoType: data.cargoType || null,
        active: true,
      },
      data: { active: false, effectiveTo: new Date() },
    });
    await tx.customerRate.create({
      data: {
        customerId: data.customerId,
        service: data.service,
        cargoType: data.cargoType || null,
        basis: data.basis,
        rate: data.rate,
        reason: data.reason,
        approvedById: actor.id,
      },
    });
  });

  await recordAudit({
    actor,
    action: "customerRate.set",
    entity: "Customer",
    entityId: data.customerId,
    summary: `${customer.fullName}: ${data.service} at ${data.rate} — ${data.reason}`,
  });

  revalidatePath("/app/finance/rates");
  return { ok: "Agreed rate recorded." };
}

/**
 * Publish a new USD → TZS rate.
 *
 * A new row every time; the one it replaces is closed rather than edited, so the
 * history reads as a line of dated rates. Invoices and payments pin the row they
 * used, so publishing never moves a bill that has already been issued or a
 * payment that has already been taken.
 *
 * Finance and the owner only. A manager runs the business on this rate; the
 * people accountable for the books are the ones who move it, and a reason is
 * required because "why did the rate change on Tuesday" is always asked later.
 */
export async function setExchangeRate(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const actor = await authorize("fx.manage");

  const raw = String(formData.get("rate") ?? "").replace(/,/g, "").trim();
  const reason = String(formData.get("notes") ?? "").trim();
  const confirmed = formData.get("confirm") === "on";

  if (!/^\d+(\.\d{1,6})?$/.test(raw)) {
    return { error: "Enter the rate as a number of shillings, e.g. 2700." };
  }
  const rate = new Prisma.Decimal(raw);
  /* A USD → TZS rate in single digits or in the millions is a slipped key, not
     a market. Refused rather than published to every new bill. */
  if (rate.lessThan(100) || rate.greaterThan(100000)) {
    return { error: "That rate is outside any sensible USD → TZS range." };
  }
  if (reason.length < 3) {
    return { error: "Say why the rate is changing." };
  }
  if (!confirmed) {
    return { error: "Tick the box to confirm the new rate." };
  }

  const previous = await prisma.exchangeRate.findFirst({
    where: { fromCurrency: "USD", toCurrency: "TZS", active: true },
    orderBy: { effectiveFrom: "desc" },
  });
  if (previous && previous.rate.equals(rate)) {
    return { error: `The rate is already ${formatRate(rate)}.` };
  }

  const now = new Date();
  const created = await prisma.$transaction(async (tx) => {
    await tx.exchangeRate.updateMany({
      where: { fromCurrency: "USD", toCurrency: "TZS", active: true },
      data: { active: false, effectiveTo: now },
    });
    const row = await tx.exchangeRate.create({
      data: {
        fromCurrency: "USD",
        toCurrency: "TZS",
        rate,
        effectiveFrom: now,
        notes: reason,
        createdById: actor.id,
      },
    });
    await recordAudit(
      {
        actor,
        action: "fx.set",
        entity: "ExchangeRate",
        entityId: row.id,
        summary: `USD → TZS ${previous ? `${previous.rate.toString()} → ` : ""}${rate.toString()} — ${reason}`,
        metadata: {
          oldValue: previous?.rate.toString() ?? null,
          newValue: rate.toString(),
          previousRateId: previous?.id ?? null,
          reason,
        },
      },
      tx
    );
    return row;
  });

  revalidatePath("/app/finance/rates");
  revalidatePath("/app/finance");
  return {
    ok: `Published ${formatRate(created.rate)}. Bills already issued keep ${previous ? formatRate(previous.rate) : "their own rate"}.`,
  };
}

/**
 * WHAT EACH SETTING IS CALLED WHEN SOMEBODY READS THE LOG.
 *
 * Also the list of what the form may write: a field that is not named here is
 * not taken from the request, however it arrived.
 */
const SETTING_FIELDS = {
  name: "Trading name",
  tagline: "Tagline",
  chinaEntity: "Guangzhou company",
  darEntity: "Tanzania company",
  tin: "TIN",
  vrn: "VRN",
  phone: "Main phone",
  altPhone: "Second phone",
  whatsapp: "WhatsApp number",
  email: "Email",
  chinaAddress: "Guangzhou warehouse address",
  darAddress: "Dar es Salaam office address",
  darPostal: "Dar es Salaam postal address",
  vatPercent: "VAT",
  freeStorageDays: "Free storage days",
  storagePerDay: "Storage per day",
  invoiceTerms: "Invoice terms",
} as const;
type SettingField = keyof typeof SETTING_FIELDS;

const DECIMAL = /^\d+(\.\d{1,2})?$/;

const settingsSchema = z.object({
  name: z.string().trim().min(2, "The company needs a name to print on its documents."),
  tagline: z.string().trim().optional(),
  chinaEntity: z.string().trim().optional(),
  darEntity: z.string().trim().optional(),
  tin: z.string().trim().optional(),
  vrn: z.string().trim().optional(),
  phone: z.string().trim().optional(),
  altPhone: z.string().trim().optional(),
  whatsapp: z
    .string()
    .trim()
    .regex(/^\d{9,15}$/, "WhatsApp is digits only, with the country code — 255767852126.")
    .or(z.literal(""))
    .optional(),
  email: z.string().trim().email("That is not an email address.").or(z.literal("")).optional(),
  chinaAddress: z.string().trim().optional(),
  darAddress: z.string().trim().optional(),
  darPostal: z.string().trim().optional(),
  vatPercent: z
    .string()
    .trim()
    .regex(DECIMAL, "VAT is a percentage, e.g. 18.")
    .refine((v) => Number(v) <= 100, "VAT cannot be more than 100%."),
  freeStorageDays: z.coerce
    .number({ invalid_type_error: "Free storage days is a whole number." })
    .int("Free storage days is a whole number.")
    .min(0, "Free storage days cannot be negative.")
    .max(365, "More than a year free is not a storage policy."),
  storagePerDay: z.string().trim().regex(DECIMAL, "Storage per day is an amount in dollars, e.g. 5."),
  invoiceTerms: z.string().optional(),
});

/**
 * Change what every document and every customer message says.
 *
 * Every field is read live by what prints it — the invoice and its PDF, the
 * delivery note, the packing list, the collections message, the storage clock,
 * the public site — so a save here is a change everywhere at once. Bills
 * already issued keep the VAT rate and exchange rate they were raised with.
 *
 * ONE TRANSACTION, AND EVERY CHANGED FIELD WITH BOTH VALUES. "The number
 * changed and nobody knows when" is the question this row will be asked, so
 * each field that moved writes a FieldChange, and the log line carries the
 * before and after of all of them together.
 */
export async function updateCompanySettings(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const actor = await authorize("settings.manage");

  const read = (key: string) => {
    const value = formData.get(key);
    return typeof value === "string" ? value : undefined;
  };
  const parsed = settingsSchema.safeParse({
    ...Object.fromEntries(Object.keys(SETTING_FIELDS).map((key) => [key, read(key)])),
    storagePerDay: read("storagePerDay") || "0",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the form." };
  }
  const input = parsed.data;

  /* Terms are kept one line each, without the blank lines a paste brings. */
  const terms = (input.invoiceTerms ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n");

  /* A field emptied on the form is cleared on the row. Left undefined, Prisma
     skips it and the old phone number stays printed on every document while
     the form says "Saved." */
  const next = {
    name: input.name,
    tagline: input.tagline || null,
    chinaEntity: input.chinaEntity || null,
    darEntity: input.darEntity || null,
    tin: input.tin || null,
    vrn: input.vrn || null,
    phone: input.phone || null,
    altPhone: input.altPhone || null,
    whatsapp: input.whatsapp || null,
    email: input.email || null,
    chinaAddress: input.chinaAddress || null,
    darAddress: input.darAddress || null,
    darPostal: input.darPostal || null,
    vatPercent: new Prisma.Decimal(input.vatPercent),
    freeStorageDays: input.freeStorageDays,
    /* Quoted in dollars only. The storage line is added to a dollar bill as it
       stands, so a shilling rate here would be billed as that many dollars. */
    storagePerDay: new Prisma.Decimal(input.storagePerDay),
    invoiceTerms: terms || null,
  } satisfies Record<SettingField, unknown>;
  const nextValue = next as Record<SettingField, unknown>;

  const shown = (value: unknown) =>
    value === null || value === undefined ? null : String(value);
  const same = (a: unknown, b: unknown) => {
    if (a instanceof Prisma.Decimal && b instanceof Prisma.Decimal) return a.equals(b);
    return shown(a) === shown(b);
  };

  const result = await prisma.$transaction(async (tx) => {
    const before = await tx.companySetting.findUnique({ where: { id: "singleton" } });

    const changes = (Object.keys(SETTING_FIELDS) as SettingField[])
      .filter((field) => !same(before?.[field] ?? null, nextValue[field]))
      .map((field) => ({
        field,
        label: SETTING_FIELDS[field],
        from: shown(before?.[field] ?? null),
        to: shown(nextValue[field]),
      }));
    if (before && changes.length === 0) return null;

    await tx.companySetting.upsert({
      where: { id: "singleton" },
      create: { id: "singleton", ...next, storageCurrency: "USD" },
      update: { ...next, storageCurrency: "USD" },
    });

    for (const change of changes) {
      await recordFieldChange(
        {
          actor,
          entity: "CompanySetting",
          entityId: "singleton",
          field: change.field,
          oldValue: change.from,
          newValue: change.to,
          reason: "Company settings updated",
        },
        tx
      );
    }

    /* Short fields are said with both values; an address or the terms are
       named only, and their before and after live in the metadata. */
    const said = changes.map((c) => {
      if (c.field === "vatPercent") return `VAT ${c.from ?? "—"}% → ${c.to}%`;
      if (c.field === "storagePerDay") return `storage USD ${c.from ?? "0"} → USD ${c.to} a day`;
      if (c.field === "freeStorageDays") return `free storage ${c.from ?? "—"} → ${c.to} days`;
      return `${c.label.toLowerCase()} changed`;
    });
    await recordAudit(
      {
        actor,
        action: "settings.update",
        entity: "CompanySetting",
        entityId: "singleton",
        summary: `Company settings: ${said.join("; ")}`,
        metadata: { changes },
      },
      tx
    );
    return changes;
  });

  if (result === null) return { ok: "Nothing had changed, so nothing was saved." };

  /* Every document and the public site read these. */
  revalidatePath("/", "layout");
  return {
    ok: `Saved — ${result.length} ${result.length === 1 ? "change" : "changes"}. New invoices, messages and documents use them from now on.`,
  };
}

const editRateSchema = z.object({
  id: z.string().min(1),
  cargoType: z.string().trim().optional(),
  basis: z.enum(["PER_CBM", "PER_KG", "FLAT"]),
  rate: z.coerce.number().positive("A rate has to be above zero."),
  minimumCbm: z.coerce.number().min(0).optional(),
  minimumKg: z.coerce.number().min(0).optional(),
  published: z.boolean(),
  reason: z.string().trim().min(3, "Say why the rate is changing."),
});

/**
 * Change a live rate.
 *
 * To the desk it is an edit; underneath it closes the row and writes the new
 * figures as the next one, so a bill priced last week can still show the rate
 * it was charged at, and the change history shows both with a reason.
 */
export async function updateRate(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const actor = await authorize("rate.manage");

  const parsed = editRateSchema.safeParse({
    id: formData.get("id"),
    cargoType: formData.get("cargoType") || undefined,
    basis: formData.get("basis") || "PER_CBM",
    rate: formData.get("rate"),
    minimumCbm: formData.get("minimumCbm") || undefined,
    minimumKg: formData.get("minimumKg") || undefined,
    published: formData.get("published") === "on",
    reason: formData.get("reason"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the form." };
  }
  const data = parsed.data;

  const current = await prisma.shippingRate.findUnique({ where: { id: data.id } });
  if (!current || !current.active) {
    return { error: "That rate is no longer live. Refresh the page." };
  }

  const cargoType = data.cargoType || null;
  const next = {
    cargoType,
    basis: data.basis,
    rate: new Prisma.Decimal(data.rate),
    minimumCbm: data.minimumCbm ? new Prisma.Decimal(data.minimumCbm) : null,
    minimumKg: data.minimumKg ? new Prisma.Decimal(data.minimumKg) : null,
    published: data.published,
  };

  const changes: string[] = [];
  const same = (a: Prisma.Decimal | null, b: Prisma.Decimal | null) =>
    a === null || b === null ? a === b : a.equals(b);
  if ((current.cargoType ?? null) !== cargoType) {
    changes.push(`name ${current.cargoType ?? "General"} → ${cargoType ?? "General"}`);
  }
  if (current.basis !== next.basis) changes.push(`charged by ${current.basis} → ${next.basis}`);
  if (!current.rate.equals(next.rate)) {
    changes.push(`${current.currency} ${current.rate.toFixed(2)} → ${next.rate.toFixed(2)}`);
  }
  if (!same(current.minimumCbm, next.minimumCbm)) {
    changes.push(`minimum CBM ${current.minimumCbm ?? "none"} → ${next.minimumCbm ?? "none"}`);
  }
  if (!same(current.minimumKg, next.minimumKg)) {
    changes.push(`minimum kg ${current.minimumKg ?? "none"} → ${next.minimumKg ?? "none"}`);
  }
  if (current.published !== next.published) {
    changes.push(next.published ? "now public" : "no longer public");
  }
  if (changes.length === 0) return { error: "Nothing was changed." };

  if (cargoType !== (current.cargoType ?? null)) {
    const clash = await prisma.shippingRate.findFirst({
      where: { service: current.service, cargoType, active: true, id: { not: current.id } },
    });
    if (clash) {
      return {
        error: `${cargoType ?? "The general rate"} already has a live ${current.service} rate. Edit that one instead.`,
      };
    }
  }

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    const closed = await tx.shippingRate.updateMany({
      where: { id: current.id, active: true },
      data: { active: false, effectiveTo: now },
    });
    if (closed.count === 0) throw new Error("Somebody else changed this rate first.");

    const created = await tx.shippingRate.create({
      data: {
        origin: current.origin,
        destination: current.destination,
        service: current.service,
        currency: current.currency,
        effectiveFrom: now,
        notes: data.reason,
        ...next,
      },
    });
    /* Agreed customer rates hang off the book rate they discount. */
    await tx.customerRate.updateMany({
      where: { shippingRateId: current.id, active: true },
      data: { shippingRateId: created.id },
    });

    await recordAudit(
      {
        actor,
        action: "rate.edit",
        entity: "ShippingRate",
        entityId: created.id,
        summary: `Edited ${current.service} / ${current.cargoType ?? "General rate"}: ${changes.join(", ")} — ${data.reason}`,
        metadata: {
          previousRateId: current.id,
          oldValue: {
            cargoType: current.cargoType,
            basis: current.basis,
            rate: current.rate.toString(),
            minimumCbm: current.minimumCbm?.toString() ?? null,
            minimumKg: current.minimumKg?.toString() ?? null,
            published: current.published,
          },
          newValue: {
            cargoType,
            basis: next.basis,
            rate: next.rate.toString(),
            minimumCbm: next.minimumCbm?.toString() ?? null,
            minimumKg: next.minimumKg?.toString() ?? null,
            published: next.published,
          },
          reason: data.reason,
        },
      },
      tx
    );
  });

  revalidatePath("/app/finance/rates");
  revalidatePath("/rates");
  return { ok: "Rate updated. Bills already raised keep the rate they were priced at." };
}

/**
 * Take a rate out of the book.
 *
 * Retired, not erased: bills priced at it still have to explain their figure,
 * so the row moves to the superseded list with the date it stopped and why.
 * Goods of that kind fall back to the general rate — or, with none, reach
 * Finance unpriced and are reported as such.
 */
export async function deleteRate(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const actor = await authorize("rate.manage");

  const id = String(formData.get("id") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  if (reason.length < 3) return { error: "Say why this rate is being removed." };

  const current = await prisma.shippingRate.findUnique({ where: { id } });
  if (!current || !current.active) {
    return { error: "That rate is no longer live. Refresh the page." };
  }

  await prisma.$transaction(async (tx) => {
    const closed = await tx.shippingRate.updateMany({
      where: { id: current.id, active: true },
      data: { active: false, effectiveTo: new Date(), notes: reason },
    });
    if (closed.count === 0) throw new Error("Somebody else changed this rate first.");
    await recordAudit(
      {
        actor,
        action: "rate.delete",
        entity: "ShippingRate",
        entityId: current.id,
        summary: `Removed ${current.service} / ${current.cargoType ?? "General rate"} (${current.currency} ${current.rate.toFixed(2)}) — ${reason}`,
        metadata: { oldValue: current.rate.toString(), newValue: null, reason },
      },
      tx
    );
  });

  revalidatePath("/app/finance/rates");
  revalidatePath("/rates");
  return {
    ok: current.cargoType
      ? `Removed. ${current.cargoType} is charged at the general rate from now on.`
      : "Removed. Goods with no rate of their own now reach Finance unpriced.",
  };
}

/** Change one customer's agreed rate. Closes the row and writes the next one. */
export async function updateCustomerRate(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const actor = await authorize("customerRate.manage");

  const id = String(formData.get("id") ?? "");
  const rate = Number(formData.get("rate"));
  const basis = String(formData.get("basis") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  if (!(rate > 0)) return { error: "A rate has to be above zero." };
  if (!["PER_CBM", "PER_KG", "FLAT"].includes(basis)) return { error: "Choose how it is charged." };
  if (reason.length < 3) return { error: "Say why the agreed rate is changing." };

  const current = await prisma.customerRate.findUnique({
    where: { id },
    include: { customer: { select: { fullName: true } } },
  });
  if (!current || !current.active) return { error: "That agreed rate is no longer live." };
  if (current.rate.equals(rate) && current.basis === basis) return { error: "Nothing was changed." };

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    const closed = await tx.customerRate.updateMany({
      where: { id: current.id, active: true },
      data: { active: false, effectiveTo: now },
    });
    if (closed.count === 0) throw new Error("Somebody else changed this rate first.");
    await tx.customerRate.create({
      data: {
        customerId: current.customerId,
        shippingRateId: current.shippingRateId,
        service: current.service,
        cargoType: current.cargoType,
        basis: basis as "PER_CBM" | "PER_KG" | "FLAT",
        rate,
        currency: current.currency,
        effectiveFrom: now,
        reason,
        approvedById: actor.id,
      },
    });
    await recordAudit(
      {
        actor,
        action: "customerRate.edit",
        entity: "Customer",
        entityId: current.customerId,
        summary: `${current.customer.fullName}: ${current.cargoType ?? "every cargo type"} ${current.rate.toFixed(2)} → ${rate.toFixed(2)} — ${reason}`,
        metadata: { oldValue: current.rate.toString(), newValue: String(rate), reason },
      },
      tx
    );
  });

  revalidatePath("/app/finance/rates");
  return { ok: "Agreed rate updated." };
}

/** End one customer's agreed rate. They pay the book from now on. */
export async function deleteCustomerRate(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const actor = await authorize("customerRate.manage");

  const id = String(formData.get("id") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  if (reason.length < 3) return { error: "Say why the agreed rate is ending." };

  const current = await prisma.customerRate.findUnique({
    where: { id },
    include: { customer: { select: { fullName: true } } },
  });
  if (!current || !current.active) return { error: "That agreed rate is no longer live." };

  await prisma.$transaction(async (tx) => {
    await tx.customerRate.updateMany({
      where: { id: current.id, active: true },
      data: { active: false, effectiveTo: new Date() },
    });
    await recordAudit(
      {
        actor,
        action: "customerRate.delete",
        entity: "Customer",
        entityId: current.customerId,
        summary: `${current.customer.fullName}: agreed rate ${current.rate.toFixed(2)} removed — ${reason}`,
        metadata: { oldValue: current.rate.toString(), newValue: null, reason },
      },
      tx
    );
  });

  revalidatePath("/app/finance/rates");
  return { ok: `Removed. ${current.customer.fullName} pays the book rate from now on.` };
}

/**
 * Withdraw an exchange rate published by mistake.
 *
 * Only the live one, and only while nothing depends on it: once a bill has been
 * issued or a payment taken at it, it is part of somebody's books and the
 * correction is to publish the right rate, not to pretend this one never was.
 * The rate before it becomes live again.
 */
export async function deleteExchangeRate(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const actor = await authorize("fx.manage");

  const id = String(formData.get("id") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  if (reason.length < 3) return { error: "Say why this rate is being withdrawn." };

  const current = await prisma.exchangeRate.findUnique({ where: { id } });
  if (!current || !current.active) {
    return { error: "Only the live rate can be withdrawn." };
  }

  const [bills, payments, previous] = await Promise.all([
    prisma.invoice.count({ where: { exchangeRateId: id, status: { not: "DRAFT" } } }),
    prisma.payment.count({ where: { exchangeRateId: id } }),
    prisma.exchangeRate.findFirst({
      where: {
        fromCurrency: current.fromCurrency,
        toCurrency: current.toCurrency,
        id: { not: id },
        effectiveFrom: { lte: current.effectiveFrom },
      },
      orderBy: { effectiveFrom: "desc" },
    }),
  ]);
  if (bills > 0 || payments > 0) {
    return {
      error: `${bills} bill(s) and ${payments} payment(s) already use ${formatRate(current.rate)}. Publish the correct rate instead.`,
    };
  }
  if (!previous) {
    return { error: "This is the only rate. Publish the correct one instead of removing it." };
  }

  await prisma.$transaction(async (tx) => {
    await tx.exchangeRate.update({
      where: { id: current.id },
      data: { active: false, effectiveTo: new Date() },
    });
    await tx.exchangeRate.update({
      where: { id: previous.id },
      data: { active: true, effectiveTo: null },
    });
    await recordAudit(
      {
        actor,
        action: "fx.delete",
        entity: "ExchangeRate",
        entityId: current.id,
        summary: `Withdrew USD → TZS ${current.rate.toString()}; ${previous.rate.toString()} is live again — ${reason}`,
        metadata: {
          oldValue: current.rate.toString(),
          newValue: previous.rate.toString(),
          restoredRateId: previous.id,
          reason,
        },
      },
      tx
    );
  });

  revalidatePath("/app/finance/rates");
  revalidatePath("/app/finance");
  return { ok: `Withdrawn. ${formatRate(previous.rate)} is live again.` };
}
