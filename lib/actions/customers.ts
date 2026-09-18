"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { recordAudit } from "@/lib/audit";
import { nextCustomerCode, shippingMarkFor } from "@/lib/ids";
import { normaliseAnyPhone, normaliseTzPhone, tzPhoneProblem } from "@/lib/phone";
import { prisma } from "@/lib/prisma";
import { authorize } from "@/lib/session";

export type ActionState = { error?: string; ok?: string; customerId?: string };

const customerSchema = z.object({
  fullName: z.string().trim().min(2, "Name is too short."),
  businessName: z.string().trim().optional(),
  phone: z.string().trim().min(6, "A phone number is required."),
  altPhone: z.string().trim().optional(),
  email: z.string().trim().toLowerCase().email().optional().or(z.literal("")),
  address: z.string().trim().optional(),
  city: z.string().trim().optional(),
  taxId: z.string().trim().optional(),
  notes: z.string().trim().optional(),
});

/**
 * Register a customer.
 *
 * The shipping mark is minted here and not typed. It is the only thing that
 * connects a box in Guangzhou to an owner, so two customers must never be able
 * to end up sharing one — the column is unique and the generator appends the
 * customer's own sequence number to make sure of it.
 */
export async function createCustomer(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const actor = await authorize("customer.manage");

  const parsed = customerSchema.safeParse({
    fullName: formData.get("fullName"),
    businessName: formData.get("businessName") || undefined,
    phone: formData.get("phone"),
    altPhone: formData.get("altPhone") || undefined,
    email: formData.get("email") || "",
    address: formData.get("address") || undefined,
    city: formData.get("city") || undefined,
    taxId: formData.get("taxId") || undefined,
    notes: formData.get("notes") || undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the form." };
  }
  const data = parsed.data;
  const phone = normaliseTzPhone(data.phone);
  if (!phone) return { error: tzPhoneProblem(data.phone) ?? "Check the phone number." };

  const duplicate = await prisma.customer.findFirst({
    where: { phone, deletedAt: null },
    select: { id: true, fullName: true, code: true },
  });
  if (duplicate) {
    return {
      error: `${duplicate.fullName} (${duplicate.code}) already uses that number.`,
    };
  }

  const customer = await prisma.$transaction(async (tx) => {
    const code = await nextCustomerCode(tx);
    return tx.customer.create({
      data: {
        code,
        fullName: data.fullName,
        businessName: data.businessName || null,
        phone,
        altPhone: data.altPhone ? normaliseAnyPhone(data.altPhone) : null,
        email: data.email || null,
        address: data.address || null,
        city: data.city || null,
        taxId: data.taxId || null,
        notes: data.notes || null,
        shippingMark: await shippingMarkFor(tx, data.fullName, code),
      },
    });
  });

  await recordAudit({
    actor,
    action: "customer.create",
    entity: "Customer",
    entityId: customer.id,
    summary: `Registered ${customer.fullName} (${customer.code}), mark ${customer.shippingMark}`,
  });

  revalidatePath("/app/customers");
  return { ok: `${customer.fullName} registered.`, customerId: customer.id };
}

export async function updateCustomer(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const actor = await authorize("customer.manage");

  const id = String(formData.get("customerId") ?? "");
  const parsed = customerSchema.safeParse({
    fullName: formData.get("fullName"),
    businessName: formData.get("businessName") || undefined,
    phone: formData.get("phone"),
    altPhone: formData.get("altPhone") || undefined,
    email: formData.get("email") || "",
    address: formData.get("address") || undefined,
    city: formData.get("city") || undefined,
    taxId: formData.get("taxId") || undefined,
    notes: formData.get("notes") || undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the form." };
  }

  const before = await prisma.customer.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, fullName: true, code: true },
  });
  if (!before) return { error: "That customer no longer exists." };

  const data = parsed.data;
  const phone = normaliseTzPhone(data.phone);
  if (!phone) return { error: tzPhoneProblem(data.phone) ?? "Check the phone number." };
  /* Registering refuses a number another customer already uses; an edit must
     too, or the phone lookup at the counter finds two people for one call. */
  const duplicate = await prisma.customer.findFirst({
    where: { phone, deletedAt: null, id: { not: id } },
    select: { fullName: true, code: true },
  });
  if (duplicate) {
    return {
      error: `${duplicate.fullName} (${duplicate.code}) already uses that number.`,
    };
  }

  await prisma.customer.update({
    where: { id },
    data: {
      fullName: data.fullName,
      businessName: data.businessName || null,
      phone,
      altPhone: data.altPhone ? normaliseAnyPhone(data.altPhone) : null,
      email: data.email || null,
      address: data.address || null,
      city: data.city || null,
      taxId: data.taxId || null,
      notes: data.notes || null,
      /* The shipping mark is deliberately NOT recomputed from a changed name.
         Boxes already in Guangzhou carry the old mark in marker pen, and a mark
         that changes under them is a consignment nobody can match to an owner. */
    },
  });

  await recordAudit({
    actor,
    action: "customer.update",
    entity: "Customer",
    entityId: id,
    summary: `Updated ${before.fullName} (${before.code})`,
  });

  revalidatePath("/app/customers");
  revalidatePath(`/app/customers/${id}`);
  return { ok: "Saved.", customerId: id };
}

/**
 * Type-ahead for the cargo form.
 *
 * Searches the four things a clerk actually has in front of them: the name, the
 * number the customer just called from, the code on their paperwork, and the
 * mark written on the box.
 */
export async function searchCustomers(query: string) {
  await authorize("customer.view");

  const q = query.trim();
  if (q.length < 2) return [];

  /* 0712…, 712…, +255 712 … all find the one stored +255712… */
  const phone = normaliseTzPhone(q);
  const digits = q.replace(/\D/g, "");

  return prisma.customer.findMany({
    where: {
      deletedAt: null,
      OR: [
        { fullName: { contains: q, mode: "insensitive" } },
        { businessName: { contains: q, mode: "insensitive" } },
        { code: { contains: q, mode: "insensitive" } },
        { shippingMark: { contains: q, mode: "insensitive" } },
        ...(phone
          ? [{ phone }, { altPhone: phone }]
          : digits.length >= 4
            ? [
                { phone: { contains: digits.replace(/^0/, "") } },
                { altPhone: { contains: digits.replace(/^0/, "") } },
              ]
            : []),
        { email: { contains: q, mode: "insensitive" } },
        /* The reference on a receipt or a delivery note leads to its owner. */
        { cargoSent: { some: { reference: { contains: q, mode: "insensitive" }, deletedAt: null } } },
        { cargoReceived: { some: { reference: { contains: q, mode: "insensitive" }, deletedAt: null } } },
      ],
    },
    take: 10,
    orderBy: { fullName: "asc" },
    select: {
      id: true,
      code: true,
      fullName: true,
      businessName: true,
      phone: true,
      shippingMark: true,
    },
  });
}

/**
 * WHOSE NUMBER IS THIS?
 *
 * The phone number is the customer's identity. Names are written down as they
 * are said over a counter or a phone line — "Mama Zainab" today, "Zainab Ally"
 * next month, "zainab" when somebody is in a hurry — and three spellings of one
 * trader become three customers, three shipping marks, and an invoice sent to
 * whichever of them was picked last.
 *
 * So the number is looked up as it is typed, and the desk is shown who it
 * already belongs to BEFORE anything is saved. Nothing is decided here: the
 * clerk sees the name on file and chooses. What they must not be able to do is
 * create a second one by accident.
 */
export async function customerByPhone(raw: string) {
  await authorize("customer.view");

  /* Not yet a whole Tanzanian number: still typing. */
  const phone = normaliseTzPhone(raw);
  if (!phone) return null;

  return prisma.customer.findFirst({
    where: {
      deletedAt: null,
      OR: [{ phone }, { altPhone: phone }],
    },
    select: {
      id: true,
      code: true,
      fullName: true,
      businessName: true,
      phone: true,
      shippingMark: true,
      _count: { select: { cargoSent: true } },
    },
  });
}

/**
 * REGISTER A CUSTOMER AT THE COUNTER.
 *
 * The receiving clerk creates one all the time — somebody rings, or turns up
 * with boxes and has never shipped with us. Until now that only happened as a
 * side effect of saving a whole consignment, so a customer registered over the
 * phone could not be written down at all until their cargo arrived.
 *
 * Guarded by `receiving.china` rather than `customer.manage`: the desk that may
 * take somebody's goods may certainly write down whose they are. It creates and
 * nothing else — editing, merging and deleting stay with the office.
 */
export async function registerCustomerAtCounter(input: {
  fullName: string;
  phone: string;
  shippingMark?: string;
}) {
  const actor = await authorize("receiving.china");

  const fullName = input.fullName.trim();
  const phone = normaliseTzPhone(input.phone);

  if (fullName.length < 2) return { error: "A name is needed." };
  if (!phone) return { error: tzPhoneProblem(input.phone) ?? "Check the phone number." };

  /* The number is the identity. Somebody typing a new name against a number we
     already hold is handed the customer we already hold, not a second one. */
  const existing = await prisma.customer.findFirst({
    where: { deletedAt: null, OR: [{ phone }, { altPhone: phone }] },
    select: {
      id: true,
      code: true,
      fullName: true,
      businessName: true,
      phone: true,
      shippingMark: true,
    },
  });
  if (existing) {
    return {
      customer: existing,
      ok: `That number is already ${existing.fullName} (${existing.code}).`,
    };
  }

  const customer = await prisma.$transaction(async (tx) => {
    const code = await nextCustomerCode(tx);

    /*
      THE MARK IS USUALLY JUST THEIR NAME.

      It is what is written on the boxes in Guangzhou, and what is written on
      the boxes is whatever the customer told the supplier to write — nearly
      always their own name or trading name. So the counter's suggestion is
      taken as it stands.

      The column is unique, though: two traders called NINO cannot share one
      mark, or a box belongs to both of them. The second one gets their customer
      number appended, which is ugly and correct — and either of them can be
      given a better mark later from the customer record.
    */
    const shippingMark = await shippingMarkFor(tx, fullName, code, input.shippingMark);

    return tx.customer.create({
      data: {
        code,
        fullName,
        phone,
        country: "Tanzania",
        shippingMark,
      },
      select: {
        id: true,
        code: true,
        fullName: true,
        businessName: true,
        phone: true,
        shippingMark: true,
      },
    });
  });

  await recordAudit({
    actor,
    action: "customer.create",
    entity: "Customer",
    entityId: customer.id,
    summary: `Registered ${customer.fullName} (${customer.code}) at the receiving counter, mark ${customer.shippingMark}`,
  });

  revalidatePath("/app/customers");
  return { customer, ok: `${customer.fullName} saved as ${customer.code}.` };
}
