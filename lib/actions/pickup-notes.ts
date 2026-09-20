"use server";

import { revalidatePath } from "next/cache";

import { recordAudit } from "@/lib/audit";
import { owedAcross } from "@/lib/invoice-balance";
import { writePickupNote } from "@/lib/pickup-note";
import { prisma } from "@/lib/prisma";
import { formMessage } from "@/lib/safe-error";
import { authorize } from "@/lib/session";

export type ActionState = { error?: string; ok?: string; id?: string };

/**
 * THE NOTE THAT LETS SOMEBODY COLLECT.
 *
 * Finance issues it the moment a consignment is settled, and it is what the
 * customer brings to the Dar counter. The warehouse does not decide whether
 * goods may go — it reads the note and checks the box against it.
 *
 * Settled is COMPUTED, never asserted: every live invoice on the consignment,
 * less every verified payment. A note cannot be written for a consignment that
 * still owes money, and no permission grants an exception — that is the whole
 * point of the note existing.
 *
 * The amount on it is a snapshot. A note in somebody's hand has to stay
 * truthful about what was settled on the day it was written, even if the
 * invoice is adjusted afterwards.
 */
export async function issuePickupNote(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const actor = await authorize("payment.verify");

  const cargoId = String(formData.get("cargoId") ?? "");
  /*
    LETTING IT GO BEFORE THE MONEY ARRIVES.

    The rule is that nothing leaves unpaid. This is the recorded exception: a
    named person decided, for a stated reason, and the debt stays on the books.
    It is never silent — the note itself says "released on credit", so the
    counter and the customer are both looking at the same fact.
  */
  const onCredit = String(formData.get("onCredit") ?? "") === "1";
  const creditReason = String(formData.get("creditReason") ?? "").trim();
  /* Terms in days, counted from the release. Blank on an ordinary note. */
  const creditDays = Number(formData.get("creditDays") ?? 0);
  const creditDueAt =
    onCredit && Number.isInteger(creditDays) && creditDays > 0 && creditDays <= 180
      ? new Date(Date.now() + creditDays * 86_400_000)
      : null;
  const cargo = await prisma.cargo.findFirst({
    where: { id: cargoId, deletedAt: null },
    include: {
      receiver: { select: { id: true, fullName: true } },
      pickupNote: true,
      release: { select: { id: true } },
      invoices: { include: { payments: true } },
    },
  });
  if (!cargo) return { error: "That cargo no longer exists." };

  if (cargo.pickupNote && cargo.pickupNote.status === "ACTIVE") {
    return {
      ok: `${cargo.pickupNote.noteNumber} is already out with the customer.`,
      id: cargo.pickupNote.id,
    };
  }
  /* A spent note is the record that the boxes went. Writing over it would
     re-open a permission for goods that are no longer on the floor. */
  if (cargo.release || cargo.pickupNote?.status === "USED") {
    return { error: `${cargo.reference} has already been collected.` };
  }

  const live = cargo.invoices.filter(
    (i) => i.status !== "DRAFT" && i.status !== "CANCELLED"
  );
  if (live.length === 0) {
    return { error: "Nothing has been billed on this consignment yet." };
  }

  const owed = owedAcross(live);
  if (owed.owes && !onCredit) {
    return {
      error: `Still owing ${owed.primary}${owed.equivalent ? ` (${owed.equivalent})` : ""}. A pickup note cannot be written until it is settled — or released on credit, with a reason.`,
    };
  }
  if (owed.owes && creditReason.length < 3) {
    return { error: "Say why it is going out before it is paid for." };
  }

  let written: Awaited<ReturnType<typeof writePickupNote>>;
  try {
    written = await prisma.$transaction(async (tx) => {
      /* Two presses at once both pass the check above; only one may write,
         or the second quietly replaces the code the first just printed. */
      const current = await tx.pickupNote.findUnique({
        where: { cargoId: cargo.id },
        select: { status: true },
      });
      if (current && current.status !== "CANCELLED") {
        throw new Error("A pickup note was written for this consignment a moment ago.");
      }
      return writePickupNote(tx, {
        cargo,
        live,
        actorId: actor.id,
        credit: owed.owes ? { reason: creditReason, dueAt: creditDueAt } : null,
      });
    });
  } catch (error) {
    return { error: formMessage(error, "That note was not written.") };
  }
  const { note, owing } = written;

  await recordAudit({
    actor,
    action: "pickupNote.issue",
    entity: "PickupNote",
    entityId: note.id,
    summary: owing.greaterThan(0)
      ? `Released ${cargo.reference} ON CREDIT as ${note.noteNumber} — ${cargo.receiver.fullName} still owes ${live[0].currency} ${owing.toFixed(2)}: ${creditReason}`
      : `Issued ${note.noteNumber} for ${cargo.reference} — ${cargo.receiver.fullName}`,
    /* The one way goods leave before the money does. The credit decision is
       the thing the books are later reconciled against, so it is a field and
       not a phrase inside a sentence. */
    metadata: {
      cargoId: cargo.id,
      noteNumber: note.noteNumber,
      onCredit: owing.greaterThan(0),
      owing: owing.toFixed(2),
      currency: live[0]?.currency ?? null,
      creditDueAt: creditDueAt?.toISOString() ?? null,
      reason: owing.greaterThan(0) ? creditReason : null,
    },
  });

  revalidatePath("/app/finance/pickup-notes");
  revalidatePath("/app/finance/collections");
  revalidatePath("/app/finance/credit");
  revalidatePath(`/app/cargo/${cargo.id}`);
  revalidatePath("/app/release");
  return { ok: `${note.noteNumber} issued.`, id: note.id };
}

/**
 * Withdraw one.
 *
 * A note that was written in error, or against a payment that has since been
 * reversed. It is never deleted: the customer may be holding a printout, and
 * the counter has to be able to see that the note it is looking at is dead.
 */
export async function cancelPickupNote(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const actor = await authorize("payment.verify");

  const id = String(formData.get("noteId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim() || "No reason given";

  const claim = await prisma.pickupNote.updateMany({
    where: { id, status: "ACTIVE" },
    data: { status: "CANCELLED", cancelledAt: new Date(), cancelReason: reason },
  });
  if (claim.count === 0) {
    return { error: "That note is not active — it may already be used." };
  }

  const note = await prisma.pickupNote.findUnique({
    where: { id },
    select: { noteNumber: true, cargoId: true },
  });

  await recordAudit({
    actor,
    action: "pickupNote.cancel",
    entity: "PickupNote",
    entityId: id,
    summary: `Withdrew ${note?.noteNumber ?? id}: ${reason}`,
    metadata: {
      cargoId: note?.cargoId ?? null,
      noteNumber: note?.noteNumber ?? null,
      oldValue: "ACTIVE",
      newValue: "CANCELLED",
      reason,
    },
  });

  revalidatePath("/app/finance/pickup-notes");
  if (note) revalidatePath(`/app/cargo/${note.cargoId}`);
  return { ok: "Withdrawn." };
}
