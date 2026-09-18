import "server-only";

import { Prisma } from "@prisma/client";

import { generateQrToken, nextPickupNoteNumber } from "@/lib/ids";
import { balanceOf, outstandingOf, owedAcross } from "@/lib/invoice-balance";
import { announceIfReady } from "@/lib/clearance";
import { notifyCustomer } from "@/lib/notify";
import type { TxClient } from "@/lib/prisma";

type LiveInvoice = Parameters<typeof balanceOf>[0] & { status: string };

/**
 * WRITING THE PERMISSION TO COLLECT.
 *
 * One place that turns a consignment's bills into a pickup note, whether
 * Finance pressed the button or the last payment was just verified. The
 * figures on it are a snapshot of what was settled that day; the decision
 * whether it may be written at all is the caller's.
 *
 * A note that was withdrawn is replaced in place — one consignment, one live
 * permission — and it gets a NEW code. The withdrawn one may still be printed
 * in somebody's hand, and re-activating the old code would make that paper
 * good again.
 */
export async function writePickupNote(
  tx: TxClient,
  input: {
    cargo: { id: string; reference: string; receiverId: string };
    live: LiveInvoice[];
    actorId: string;
    credit: { reason: string; dueAt: Date | null } | null;
  }
) {
  const { cargo, live } = input;

  const owing = live.reduce(
    (sum, invoice) => sum.add(outstandingOf(invoice)),
    new Prisma.Decimal(0)
  );
  const owed = owedAcross(live);
  const onCredit = owing.greaterThan(0);

  /* What was actually settled, not what was billed. On a credit release those
     are different numbers, and the note has to say the true one. */
  const paid = live
    .reduce((sum, i) => sum.add(i.total), new Prisma.Decimal(0))
    .sub(owing);
  /* Shillings actually received against these bills, capped at each bill —
     an overpayment is a credit on the bill, not money for the release. */
  const paidTzs = live.reduce((sum, i) => {
    const b = balanceOf(i);
    return b.paidTzs && b.totalTzs ? sum.add(Prisma.Decimal.min(b.paidTzs, b.totalTzs)) : sum;
  }, new Prisma.Decimal(0));

  /* Minted inside the transaction, like every other document number: two
     clerks pressing at once cannot be handed the same one. */
  const noteNumber = await nextPickupNoteNumber(tx);
  const figures = {
    noteNumber,
    amountPaid: paid,
    currency: live[0].currency,
    amountTzs: paidTzs.greaterThan(0) ? paidTzs : null,
    onCredit,
    creditReason: onCredit ? (input.credit?.reason ?? null) : null,
    creditDueAt: onCredit ? (input.credit?.dueAt ?? null) : null,
    issuedById: input.actorId,
  };

  const note = await tx.pickupNote.upsert({
    where: { cargoId: cargo.id },
    create: {
      ...figures,
      cargoId: cargo.id,
      customerId: cargo.receiverId,
      qrToken: generateQrToken(),
    },
    update: {
      ...figures,
      customerId: cargo.receiverId,
      qrToken: generateQrToken(),
      status: "ACTIVE",
      issuedAt: new Date(),
      usedAt: null,
      cancelledAt: null,
      cancelReason: null,
    },
  });

  /*
    A PICKUP NOTE IS NOT "COME AND COLLECT".

    Finance writes it the moment the money is settled, which can be while the
    ship is still at sea or the boxes are in customs. The customer is told the
    goods are ready only when they are — cleared as well as paid — and that is
    announceIfReady's call, made here and again when clearance completes.
  */
  const announced = await announceIfReady(tx, cargo.id, { id: input.actorId });
  if (!announced) {
    await notifyCustomer(
      [cargo.receiverId],
      {
        kind: "pickup.issued",
        title: `Pickup note ${noteNumber} issued for ${cargo.reference}`,
        body: onCredit
          ? `Released on credit; ${owed.primary} is still owing. We will tell you as soon as it has arrived and cleared in Dar and is ready to collect.`
          : "Payment complete. We will tell you as soon as it has arrived and cleared in Dar and is ready to collect.",
        href: `/portal/cargo/${encodeURIComponent(cargo.reference)}`,
      },
      tx
    );
  }

  return { note, owing, owed };
}

/**
 * THE NOTE FOLLOWS THE MONEY.
 *
 * Called when a payment is verified. The moment every live bill on the
 * consignment is settled, the customer's permission to collect is written in
 * the same transaction — nobody has to remember to press a second button while
 * the customer stands at the counter. Nothing is written for a consignment that
 * still owes, has no issued bill, already has a note out, or has already gone.
 */
export async function issuePickupNoteIfSettled(
  tx: TxClient,
  cargoId: string,
  actorId: string
) {
  const cargo = await tx.cargo.findFirst({
    where: { id: cargoId, deletedAt: null },
    select: {
      id: true,
      reference: true,
      receiverId: true,
      release: { select: { id: true } },
      pickupNote: { select: { status: true } },
      invoices: {
        where: { status: { notIn: ["DRAFT", "CANCELLED"] } },
        include: { payments: true },
      },
    },
  });
  if (!cargo || cargo.release) return null;
  if (cargo.pickupNote && cargo.pickupNote.status !== "CANCELLED") return null;
  if (cargo.invoices.length === 0) return null;
  if (owedAcross(cargo.invoices).owes) return null;

  const { note } = await writePickupNote(tx, {
    cargo,
    live: cargo.invoices,
    actorId,
    credit: null,
  });
  return note;
}

/**
 * THE PERMISSION GOES WITH THE MONEY.
 *
 * Called when a verified payment is taken back. A pickup note written because
 * the bills were paid says the customer may collect; once the money is gone
 * that is no longer true, and a note left active is a printout that still reads
 * "paid and cleared" at the counter. A note on credit stays — it never rested on
 * the payment. A note already used is history: the goods have gone and the debt
 * is chased, not un-released.
 */
export async function withdrawPickupNoteIfOwing(
  tx: TxClient,
  cargoId: string,
  reason: string
) {
  const cargo = await tx.cargo.findUnique({
    where: { id: cargoId },
    select: {
      pickupNote: { select: { id: true, status: true, onCredit: true, noteNumber: true } },
      invoices: {
        where: { status: { notIn: ["DRAFT", "CANCELLED"] } },
        include: { payments: true },
      },
    },
  });
  const note = cargo?.pickupNote;
  if (!cargo || !note || note.status !== "ACTIVE" || note.onCredit) return null;
  if (!owedAcross(cargo.invoices).owes) return null;

  await tx.pickupNote.update({
    where: { id: note.id },
    data: { status: "CANCELLED", cancelledAt: new Date(), cancelReason: reason },
  });
  return { id: note.id, noteNumber: note.noteNumber };
}
