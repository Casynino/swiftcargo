"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { recordAudit } from "@/lib/audit";
import { setCargoStatus } from "@/lib/cargo";
import { announceIfReady } from "@/lib/clearance";
import { nextDeliveryReference, nextReleaseNumber } from "@/lib/ids";
import { notifyCustomer, notifyStaff, staffInDepartment } from "@/lib/notify";
import { prisma } from "@/lib/prisma";
import { checkRelease, RELEASE_INCLUDE } from "@/lib/release";
import { authorize, authorizeCustomer } from "@/lib/session";
import { store, UploadError } from "@/lib/storage";
import { formMessage } from "@/lib/safe-error";

export type ActionState = { error?: string; ok?: string; id?: string };

const releaseSchema = z.object({
  cargoId: z.string().min(1),
  method: z.enum(["COLLECTION", "DELIVERY"]),
  packagesReleased: z.coerce.number().int().min(1, "How many packages went?"),
  collectedByName: z.string().trim().min(2, "Who took them?"),
  collectedByPhone: z.string().trim().optional(),
  collectedByIdNo: z.string().trim().optional(),
  relationship: z.string().trim().optional(),
  notes: z.string().trim().optional(),
});

/**
 * Hand the boxes over.
 *
 * THE CHECK IS RUN AGAIN HERE, INSIDE THE TRANSACTION. The screen already ran
 * it to decide whether to show the button, and that is not enough: a payment
 * can be reversed, a case reopened or a hold placed in the seconds between the
 * page rendering and somebody pressing it. Re-running it against the live rows
 * is the difference between a form that looked safe and cargo that was safe to
 * release.
 *
 * There is no override. If a manager genuinely needs to release unpaid cargo,
 * the way to do it is to record the decision that makes it releasable — a
 * credit, a written-off balance, a lifted hold — so the reason survives in the
 * record instead of living in somebody's memory.
 */
export async function releaseCargo(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const actor = await authorize("release.execute");

  const parsed = releaseSchema.safeParse({
    cargoId: formData.get("cargoId"),
    method: formData.get("method") || "COLLECTION",
    packagesReleased: formData.get("packagesReleased"),
    collectedByName: formData.get("collectedByName"),
    collectedByPhone: formData.get("collectedByPhone") || undefined,
    collectedByIdNo: formData.get("collectedByIdNo") || undefined,
    relationship: formData.get("relationship") || undefined,
    notes: formData.get("notes") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the form." };
  }
  const data = parsed.data;

  const files = formData
    .getAll("signature")
    .filter((f): f is File => f instanceof File && f.size > 0);
  let signatureUrl: string | null = null;
  try {
    if (files[0]) signatureUrl = await store(files[0], "releases");
  } catch (error) {
    return {
      error: error instanceof UploadError ? error.message : "That upload failed.",
    };
  }

  let number: string;
  try {
    number = await prisma.$transaction(async (tx) => {
      const cargo = await tx.cargo.findFirst({
        where: { id: data.cargoId, deletedAt: null },
        include: { ...RELEASE_INCLUDE, release: true },
      });
      if (!cargo) throw new Error("That cargo no longer exists.");
      if (cargo.release) throw new Error("This consignment has already been handed over.");

      const check = checkRelease(cargo);
      if (!check.ok) {
        throw new Error(check.blockedBy ?? "This cargo cannot be released.");
      }

      /* Every box goes out under its own scan. A box reported missing that
         never turned up at Dar is not waited for — it is a case, not a box
         somebody can carry out. */
      const boxes = await tx.cargoBox.findMany({
        where: { cargoId: cargo.id, voidedAt: null },
        select: { collectedAt: true, missingAt: true, darReceivedAt: true },
      });
      const toScan = boxes.filter((b) => !b.collectedAt && !(b.missingAt && !b.darReceivedAt));
      if (toScan.length > 0) {
        throw new Error(
          `Scan every box out first — ${toScan.length} of ${boxes.length} box${boxes.length === 1 ? "" : "es"} still to scan.`
        );
      }

      /* The note is spent by the handover, claimed rather than assumed: a
         second press, or the same paper at a second counter, finds it USED
         and the transaction unwinds before anything is released twice. */
      const spent = await tx.pickupNote.updateMany({
        where: { cargoId: cargo.id, status: "ACTIVE" },
        data: { status: "USED", usedAt: new Date() },
      });
      if (spent.count === 0) {
        throw new Error("The pickup note for this consignment has just been used or withdrawn.");
      }

      const ref = await nextReleaseNumber(tx);
      await tx.release.create({
        data: {
          number: ref,
          cargoId: cargo.id,
          method: data.method,
          packagesReleased: data.packagesReleased,
          collectedByName: data.collectedByName,
          collectedByPhone: data.collectedByPhone || null,
          collectedByIdNo: data.collectedByIdNo || null,
          relationship: data.relationship || null,
          signatureUrl,
          notes: data.notes || null,
          releasedById: actor.id,
        },
      });

      await setCargoStatus(
        tx,
        cargo.id,
        data.method === "COLLECTION" ? "COLLECTED" : "DELIVERED",
        actor,
        `Handed to ${data.collectedByName}`
      );

      return ref;
    });
  } catch (error) {
    return {
      error: formMessage(error, "That did not work."),
    };
  }

  const cargo = await prisma.cargo.findUnique({
    where: { id: data.cargoId },
    select: { reference: true, senderId: true, receiverId: true },
  });

  if (cargo) {
    await notifyCustomer([cargo.senderId, cargo.receiverId], {
      kind: "cargo.released",
      title: `${cargo.reference} has been ${
        data.method === "COLLECTION" ? "collected" : "delivered"
      }`,
      body: `Released to ${data.collectedByName}. Release note ${number}.`,
      href: "/portal",
    });
  }

  await recordAudit({
    actor,
    action: "cargo.release",
    entity: "Cargo",
    entityId: data.cargoId,
    summary: `Released ${cargo?.reference} as ${number} to ${data.collectedByName} (${data.packagesReleased} package(s))`,
    metadata: {
      method: data.method,
      collectedBy: data.collectedByName,
      idNumber: data.collectedByIdNo ?? null,
    },
  });

  revalidatePath("/app/release");
  revalidatePath(`/app/cargo/${data.cargoId}`);
  return { ok: `Released. Note ${number}.` };
}

/**
 * Mark cargo ready, once everything clears.
 *
 * Purely a convenience for the floor's own list — the release check is the real
 * gate and is run again at handover, so this status can never let anything out
 * that the check would refuse.
 */
export async function markReadyForRelease(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const actor = await authorize("release.execute");

  const cargoId = String(formData.get("cargoId") ?? "");
  const cargo = await prisma.cargo.findFirst({
    where: { id: cargoId, deletedAt: null },
    include: RELEASE_INCLUDE,
  });
  if (!cargo) return { error: "That cargo no longer exists." };

  const check = checkRelease(cargo);
  if (!check.ok) return { error: check.blockedBy ?? "Not ready." };

  const moved = await prisma.$transaction(async (tx) => {
    /* Told once, by the one function that tells it; a consignment whose
       customer already heard is only moved on the floor's list. */
    if (await announceIfReady(tx, cargoId, actor)) return true;
    return setCargoStatus(tx, cargoId, "READY_FOR_RELEASE", actor, "Paid, verified and cleared");
  });

  /* The status history carries the move; this carries the person and the
     moment they told a customer to come for their goods. A consignment that
     was announced as ready and then turned away at the counter is a question
     somebody has to be able to answer by name. */
  if (moved) {
    await recordAudit({
      actor,
      action: "cargo.readyForRelease",
      entity: "Cargo",
      entityId: cargo.id,
      summary: `${cargo.reference} marked ready to collect and the customer told`,
      metadata: { oldValue: cargo.status, newValue: "READY_FOR_RELEASE" },
    });
  }

  revalidatePath("/app/release");
  return { ok: "Marked ready." };
}

const deliverySchema = z.object({
  cargoId: z.string().min(1),
  address: z.string().trim().min(5, "Where is it going?"),
  contactName: z.string().trim().min(2, "Who receives it?"),
  contactPhone: z.string().trim().min(6, "A phone number is required."),
  preferredDate: z.string().trim().optional(),
  notes: z.string().trim().optional(),
});

/** A customer asks for delivery instead of collecting. */
export async function requestDelivery(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const customer = await authorizeCustomer();

  const parsed = deliverySchema.safeParse({
    cargoId: formData.get("cargoId"),
    address: formData.get("address"),
    contactName: formData.get("contactName"),
    contactPhone: formData.get("contactPhone"),
    preferredDate: formData.get("preferredDate") || undefined,
    notes: formData.get("notes") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the form." };
  }
  const data = parsed.data;

  /* Scoped by the session's own customer, so an id from the form can only ever
     find cargo that belongs to them. The sender may follow the cargo, but only
     the receiver may have it brought to an address: sending the boxes where
     the sender says is releasing them to the wrong person. */
  const cargo = await prisma.cargo.findFirst({
    where: {
      id: data.cargoId,
      deletedAt: null,
      OR: [
        { senderId: customer.customerId },
        { receiverId: customer.customerId },
      ],
    },
    select: {
      id: true,
      reference: true,
      receiverId: true,
      deliveryRequest: { select: { id: true } },
    },
  });
  if (!cargo) return { error: "We cannot find that consignment on your account." };
  if (cargo.receiverId !== customer.customerId) {
    return { error: "Only the person receiving this cargo can ask for it to be delivered." };
  }
  if (cargo.deliveryRequest) {
    return { ok: "You have already asked us to deliver this one." };
  }

  const created = await prisma.$transaction(async (tx) => {
    const reference = await nextDeliveryReference(tx);
    const request = await tx.deliveryRequest.create({
      data: {
        reference,
        cargoId: cargo.id,
        customerId: customer.customerId,
        address: data.address,
        contactName: data.contactName,
        contactPhone: data.contactPhone,
        preferredDate: data.preferredDate ? new Date(data.preferredDate) : null,
        notes: data.notes || null,
      },
    });

    await notifyStaff(
      [
        ...(await staffInDepartment("DAR_WAREHOUSE", tx)),
        ...(await staffInDepartment("CUSTOMER_SUPPORT", tx)),
      ],
      {
        kind: "delivery.requested",
        title: `Delivery requested for ${cargo.reference}`,
        body: `${data.contactName} · ${data.address}`,
        href: "/app/deliveries",
      },
      tx
    );
    return request;
  });

  /* A customer asking for their goods to be taken somewhere is an instruction
     about where cargo goes, and the only record of it was the row itself. The
     desk that later has to answer "who asked for this address" reads the log
     like every other instruction in the system. */
  await recordAudit({
    actor: customer,
    action: "delivery.request",
    entity: "DeliveryRequest",
    entityId: created.id,
    summary: `${created.reference}: delivery asked for on ${cargo.reference}`,
    metadata: {
      cargoId: cargo.id,
      contactName: data.contactName,
      preferredDate: data.preferredDate ?? null,
    },
  });

  revalidatePath("/portal");
  return { ok: "Requested. We will call you to confirm a time and the charge." };
}

const deliveryUpdateSchema = z.object({
  requestId: z.string().min(1),
  status: z.enum([
    "REQUESTED",
    "CONFIRMED",
    "ASSIGNED",
    "OUT_FOR_DELIVERY",
    "DELIVERED",
    "FAILED",
    "CANCELLED",
  ]),
  charge: z.coerce.number().min(0).optional(),
  driverName: z.string().trim().optional(),
  driverPhone: z.string().trim().optional(),
  failedReason: z.string().trim().optional(),
});

export async function updateDelivery(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const actor = await authorize("delivery.manage");

  const parsed = deliveryUpdateSchema.safeParse({
    requestId: formData.get("requestId"),
    status: formData.get("status"),
    charge: formData.get("charge") || undefined,
    driverName: formData.get("driverName") || undefined,
    driverPhone: formData.get("driverPhone") || undefined,
    failedReason: formData.get("failedReason") || undefined,
  });
  if (!parsed.success) return { error: "Check the form." };
  const data = parsed.data;

  const request = await prisma.deliveryRequest.findUnique({
    where: { id: data.requestId },
    include: { cargo: { select: { id: true, reference: true } } },
  });
  if (!request) return { error: "That request no longer exists." };

  /* The same form saves a driver's name or a charge without touching the
     status. Only a real move stamps its time or tells the customer — otherwise
     every correction re-dates the dispatch and sends "out for delivery" again. */
  const moving = data.status !== request.status;

  await prisma.$transaction(async (tx) => {
    await tx.deliveryRequest.update({
      where: { id: request.id },
      data: {
        status: data.status,
        ...(data.charge !== undefined ? { charge: data.charge } : {}),
        ...(data.driverName ? { driverName: data.driverName } : {}),
        ...(data.driverPhone ? { driverPhone: data.driverPhone } : {}),
        ...(moving && data.status === "OUT_FOR_DELIVERY" ? { dispatchedAt: new Date() } : {}),
        ...(moving && data.status === "DELIVERED" ? { deliveredAt: new Date() } : {}),
        ...(data.status === "FAILED" && data.failedReason ? { failedReason: data.failedReason } : {}),
      },
    });

    if (!moving) return;
    await notifyCustomer(
      [request.customerId],
      {
        kind: `delivery.${data.status.toLowerCase()}`,
        title: `Delivery update for ${request.cargo.reference}`,
        body: data.status.replace(/_/g, " ").toLowerCase(),
        href: "/portal",
      },
      tx
    );
  });

  await recordAudit({
    actor,
    action: "delivery.update",
    entity: "DeliveryRequest",
    entityId: request.id,
    summary: moving
      ? `${request.reference}: ${request.status} → ${data.status}`
      : `Updated delivery ${request.reference}`,
    /* The summary reads well and greps badly. The figures go in beside it, so
       "what has this delivery been charged" is a question about a field rather
       than about a sentence. */
    metadata: {
      cargoId: request.cargoId,
      oldValue: request.status,
      newValue: data.status,
      charge: data.charge ?? null,
      driverName: data.driverName ?? null,
      reason: data.failedReason ?? null,
    },
  });

  revalidatePath("/app/deliveries");
  return { ok: "Updated." };
}
