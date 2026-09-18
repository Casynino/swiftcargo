"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { recordAudit, recordFieldChange } from "@/lib/audit";
import { SERVICE_LABEL } from "@/lib/constants";
import { formDate } from "@/lib/dates";
import { nextCustomerCode, shippingMarkFor } from "@/lib/ids";
import { notifyStaff, staffInDepartment } from "@/lib/notify";
import { prisma } from "@/lib/prisma";
import { formMessage } from "@/lib/safe-error";
import { authorize, type SessionUser } from "@/lib/session";

export type DeskState = { error?: string; ok?: string };

/**
 * WHAT STAFF DO WITH A WEBSITE REQUEST.
 *
 * The public forms in lib/actions/requests.ts write a request and nothing else.
 * Everything that moves one along lives here, behind `authorize`, and every one
 * of these leaves a line: a request is the first thing a customer will quote
 * back at you in an argument, and "who assigned it, who priced it, who turned
 * it into a customer" has to be answerable from the record rather than from
 * memory.
 *
 * NOTHING HERE MAKES CARGO. A request becomes operational in exactly two ways:
 * it is attached to a customer already on the books (or one created here, found
 * by phone first so the same enquiry answered twice cannot mint two), or — for
 * a collection in China — it is attached to the receiving record the counter
 * raised when the boxes physically arrived. Both are links, and the operational
 * record is still made by the desk that makes operational records.
 */

const REQUEST_KINDS = ["pickup", "booking", "quote"] as const;
type Kind = (typeof REQUEST_KINDS)[number];

const ENTITY: Record<Kind, string> = {
  pickup: "PickupRequest",
  booking: "ContainerBooking",
  quote: "QuoteRequest",
};

function paths() {
  revalidatePath("/app/support/requests");
  revalidatePath("/app/receive/pickups");
}

const kindOf = (raw: FormDataEntryValue | null): Kind | null => {
  const value = String(raw ?? "");
  return (REQUEST_KINDS as readonly string[]).includes(value) ? (value as Kind) : null;
};

/** Authorise, or hand back the refusal as a message the form can print. */
async function desk(permission: Parameters<typeof authorize>[0]) {
  try {
    return { actor: await authorize(permission) };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Not permitted." };
  }
}

/**
 * Hand a request to somebody.
 *
 * Only to a member of staff who could work it — an assignment to an account
 * that cannot open the queue is a request nobody is looking at while the board
 * says somebody is.
 */
export async function assignRequest(
  _prev: DeskState,
  formData: FormData
): Promise<DeskState> {
  const gate = await desk("request.manage");
  if (!gate.actor) return { error: gate.error };
  const actor: SessionUser = gate.actor;

  const kind = kindOf(formData.get("kind"));
  if (kind !== "pickup" && kind !== "booking") {
    return { error: "Only pickups and service requests are assigned." };
  }
  const id = String(formData.get("id") ?? "");
  const assignedToId = String(formData.get("assignedToId") ?? "").trim() || null;

  if (assignedToId) {
    const staff = await prisma.user.findFirst({
      where: { id: assignedToId, active: true, status: "ACTIVE" },
      select: { id: true, name: true },
    });
    if (!staff) return { error: "That member of staff is not on the system." };
  }

  const before =
    kind === "pickup"
      ? await prisma.pickupRequest.findUnique({
          where: { id },
          select: { reference: true, assignedToId: true },
        })
      : await prisma.containerBooking.findUnique({
          where: { id },
          select: { reference: true, assignedToId: true },
        });
  if (!before) return { error: "That request no longer exists." };

  if (kind === "pickup") {
    await prisma.pickupRequest.update({ where: { id }, data: { assignedToId } });
  } else {
    await prisma.containerBooking.update({ where: { id }, data: { assignedToId } });
  }

  await recordFieldChange({
    actor,
    entity: ENTITY[kind],
    entityId: id,
    field: "assignedToId",
    oldValue: before.assignedToId,
    newValue: assignedToId,
  });
  await recordAudit({
    actor,
    action: "request.assign",
    entity: ENTITY[kind],
    entityId: id,
    summary: `${before.reference} ${assignedToId ? "assigned" : "unassigned"}`,
  });

  if (assignedToId) {
    await notifyStaff([assignedToId], {
      kind: "request.assigned",
      title: `${before.reference} is yours`,
      body: "A website request has been assigned to you.",
      href: "/app/support/requests",
    });
  }

  paths();
  return { ok: assignedToId ? "Assigned." : "Unassigned." };
}

/**
 * The day Guangzhou is actually going.
 *
 * Kept apart from the day the customer asked for, which stays on the row as
 * they typed it. Overwriting the request with the answer loses the only
 * evidence of whether we went when we said we would.
 */
export async function schedulePickup(
  _prev: DeskState,
  formData: FormData
): Promise<DeskState> {
  const gate = await desk("request.manage");
  if (!gate.actor) return { error: gate.error };
  const actor: SessionUser = gate.actor;

  const id = String(formData.get("id") ?? "");
  let scheduledDate: Date | null;
  try {
    scheduledDate = formDate(String(formData.get("scheduledDate") ?? ""), "collection date");
  } catch (error) {
    return { error: formMessage(error, "Check the collection date.") };
  }

  const before = await prisma.pickupRequest.findUnique({
    where: { id },
    select: { reference: true, scheduledDate: true, status: true },
  });
  if (!before) return { error: "That request no longer exists." };

  await prisma.pickupRequest.update({
    where: { id },
    data: {
      scheduledDate,
      /* Putting a van in the diary is what SCHEDULED means. A request already
         completed or refused keeps the answer it was given. */
      status:
        scheduledDate && ["SUBMITTED", "UNDER_REVIEW", "APPROVED"].includes(before.status)
          ? "SCHEDULED"
          : before.status,
    },
  });

  await recordFieldChange({
    actor,
    entity: "PickupRequest",
    entityId: id,
    field: "scheduledDate",
    oldValue: before.scheduledDate,
    newValue: scheduledDate,
  });
  await recordAudit({
    actor,
    action: "request.pickup.schedule",
    entity: "PickupRequest",
    entityId: id,
    summary: `${before.reference} collection ${scheduledDate ? `set for ${scheduledDate.toISOString().slice(0, 10)}` : "cleared"}`,
  });

  paths();
  return { ok: "Saved." };
}

const quoteSchema = z.object({
  amount: z.coerce.number().min(0).max(100_000_000),
  currency: z.enum(["USD", "TZS"]),
  notes: z.string().trim().max(2000).optional(),
});

/**
 * What we came back to the customer with.
 *
 * A figure here is an ANSWER TO AN ENQUIRY and never a bill. Nothing is owed
 * until cargo exists and Finance issues an invoice against it, which is a
 * different act by a different desk with its own numbering and its own pinned
 * exchange rate.
 */
export async function quoteServiceRequest(
  _prev: DeskState,
  formData: FormData
): Promise<DeskState> {
  const gate = await desk("request.manage");
  if (!gate.actor) return { error: gate.error };
  const actor: SessionUser = gate.actor;

  const id = String(formData.get("id") ?? "");
  const parsed = quoteSchema.safeParse({
    amount: formData.get("amount") ?? "",
    currency: formData.get("currency") || "USD",
    notes: formData.get("notes") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the figure." };
  }

  const before = await prisma.containerBooking.findUnique({
    where: { id },
    select: { reference: true, quotedAmount: true, status: true },
  });
  if (!before) return { error: "That request no longer exists." };

  await prisma.containerBooking.update({
    where: { id },
    data: {
      quotedAmount: parsed.data.amount,
      quotedCurrency: parsed.data.currency,
      quotedAt: new Date(),
      staffNotes: parsed.data.notes ?? null,
      status: before.status === "SUBMITTED" ? "UNDER_REVIEW" : before.status,
    },
  });

  await recordFieldChange({
    actor,
    entity: "ContainerBooking",
    entityId: id,
    field: "quotedAmount",
    oldValue: before.quotedAmount,
    newValue: parsed.data.amount,
  });
  await recordAudit({
    actor,
    action: "request.quote",
    entity: "ContainerBooking",
    entityId: id,
    summary: `${before.reference} quoted ${parsed.data.currency} ${parsed.data.amount}`,
  });

  paths();
  return { ok: "Quotation recorded." };
}

/**
 * TURN AN APPROVED REQUEST INTO A CUSTOMER ON THE BOOKS.
 *
 * The phone number is the identity, exactly as it is at the Guangzhou counter,
 * so a customer who asked for a quote in March and a container in June is one
 * customer with two requests against them. Nothing about cargo happens here:
 * boxes become cargo at a receiving counter and nowhere else.
 */
export async function convertBookingToCustomer(
  _prev: DeskState,
  formData: FormData
): Promise<DeskState> {
  const gate = await desk("customer.manage");
  if (!gate.actor) return { error: gate.error };
  const actor: SessionUser = gate.actor;

  const id = String(formData.get("id") ?? "");

  const request = await prisma.containerBooking.findUnique({
    where: { id },
    select: {
      id: true,
      reference: true,
      type: true,
      status: true,
      contactName: true,
      contactPhone: true,
      contactEmail: true,
      customerId: true,
      convertedCustomerId: true,
    },
  });
  if (!request) return { error: "That request no longer exists." };
  if (request.convertedCustomerId) {
    return { error: "This request has already been converted." };
  }
  if (request.status !== "APPROVED") {
    return { error: "Approve the request before converting it." };
  }

  const result = await prisma.$transaction(async (tx) => {
    /* Already ours, either because they were signed in when they asked or
       because somebody with the same number is on the books. */
    const existing =
      (request.customerId
        ? await tx.customer.findFirst({
            where: { id: request.customerId, deletedAt: null },
            select: { id: true, code: true, fullName: true },
          })
        : null) ??
      (await tx.customer.findFirst({
        where: {
          deletedAt: null,
          OR: [{ phone: request.contactPhone }, { altPhone: request.contactPhone }],
        },
        select: { id: true, code: true, fullName: true },
      }));

    const customer =
      existing ??
      (await (async () => {
        const code = await nextCustomerCode(tx);
        const shippingMark = await shippingMarkFor(tx, request.contactName, code);
        return tx.customer.create({
          data: {
            code,
            fullName: request.contactName,
            phone: request.contactPhone,
            email: request.contactEmail,
            country: "Tanzania",
            shippingMark,
          },
          select: { id: true, code: true, fullName: true },
        });
      })());

    await tx.containerBooking.update({
      where: { id },
      data: {
        customerId: request.customerId ?? customer.id,
        convertedCustomerId: customer.id,
        convertedAt: new Date(),
      },
    });

    await recordAudit(
      {
        actor,
        action: "request.convert",
        entity: "ContainerBooking",
        entityId: id,
        summary: `${request.reference} (${SERVICE_LABEL[request.type]}) attached to ${customer.fullName} (${customer.code})${existing ? "" : " — customer created"}`,
      },
      tx
    );

    return { customer, created: !existing };
  });

  paths();
  revalidatePath("/app/customers");
  return {
    ok: result.created
      ? `Converted. ${result.customer.fullName} is now customer ${result.customer.code}.`
      : `Attached to ${result.customer.fullName} (${result.customer.code}).`,
  };
}

/**
 * THE BOXES TURNED UP, AND THIS IS THE CONSIGNMENT THEY BECAME.
 *
 * Called after Guangzhou has taken the goods in through the receiving counter
 * in the ordinary way — the counter is what measures, photographs, numbers and
 * values a delivery, and none of that can be short-circuited from a request. So
 * this attaches a consignment that already exists and closes the request; it
 * cannot create one.
 */
export async function linkPickupToCargo(
  _prev: DeskState,
  formData: FormData
): Promise<DeskState> {
  const gate = await desk("request.manage");
  if (!gate.actor) return { error: gate.error };
  const actor: SessionUser = gate.actor;

  const id = String(formData.get("id") ?? "");
  const reference = String(formData.get("cargoReference") ?? "").trim().toUpperCase();
  if (!reference) return { error: "Which consignment?" };

  const request = await prisma.pickupRequest.findUnique({
    where: { id },
    select: { reference: true, cargoId: true, status: true },
  });
  if (!request) return { error: "That request no longer exists." };
  if (request.cargoId) return { error: "This request is already linked to a consignment." };

  const cargo = await prisma.cargo.findFirst({
    where: { reference, deletedAt: null },
    select: { id: true, reference: true, description: true },
  });
  if (!cargo) {
    return {
      error: `No consignment ${reference}. Take the goods in at the receiving counter first.`,
    };
  }

  await prisma.pickupRequest.update({
    where: { id },
    data: { cargoId: cargo.id, status: "COMPLETED", completedAt: new Date() },
  });

  await recordAudit({
    actor,
    action: "request.pickup.convert",
    entity: "PickupRequest",
    entityId: id,
    summary: `${request.reference} completed — goods received as ${cargo.reference}`,
  });

  paths();
  revalidatePath(`/app/cargo/${cargo.reference}`);
  return { ok: `Linked to ${cargo.reference}.` };
}
