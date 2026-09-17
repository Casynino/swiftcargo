"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";

import { recordAudit, recordFieldChange } from "@/lib/audit";
import { parseAmount, valuePayment } from "@/lib/payment-value";
import { prisma } from "@/lib/prisma";
import { authorize } from "@/lib/session";
import { verifyPayment } from "@/lib/actions/payments";

export type ClaimState = { error?: string; ok?: string };

class StaleClaim extends Error {}

function refresh() {
  revalidatePath("/app/finance/collections", "layout");
  revalidatePath("/app/finance/verify");
}

/**
 * VERIFY SEVERAL AT ONCE.
 *
 * Each one still goes through the single-payment verification — its own
 * conditional claim, its own receipt number, its own audit line. Batching the
 * button does not batch the checks: a payment somebody else verified a second
 * ago is skipped and named, not verified twice.
 */
export async function verifyClaims(
  _prev: ClaimState,
  formData: FormData
): Promise<ClaimState> {
  await authorize("payment.verify");

  const ids = [...new Set(formData.getAll("paymentIds").map(String))].filter(
    Boolean
  );
  if (ids.length === 0) return { error: "Pick the payments to verify." };

  let done = 0;
  const failed: string[] = [];
  for (const id of ids) {
    const one = new FormData();
    one.set("paymentId", id);
    const result = await verifyPayment({}, one);
    if (result.error) failed.push(result.error);
    else done += 1;
  }

  refresh();
  if (done === 0) return { error: failed[0] ?? "Nothing was verified." };
  return {
    ok: `${done} verified${failed.length ? ` · ${failed.length} skipped: ${failed[0]}` : ""}.`,
  };
}

/**
 * CORRECT A CLAIM BEFORE IT COUNTS.
 *
 * Only while nobody has verified it — a verified payment has a receipt in the
 * customer's hand and is reversed, never edited. Every change is written to
 * FieldChange first. A claim that was sent back goes back into the queue in
 * the same press, because "fix and send again" is one thought, not two.
 */
export async function editClaim(
  _prev: ClaimState,
  formData: FormData
): Promise<ClaimState> {
  const actor = await authorize("payment.submit");

  const id = String(formData.get("paymentId") ?? "");
  const amount = Number(formData.get("amount") ?? 0);
  const transactionRef = String(formData.get("transactionRef") ?? "").trim();
  if (!(amount > 0)) return { error: "An amount is required." };

  const payment = await prisma.payment.findUnique({
    where: { id },
    include: { invoice: { select: { currency: true, fxRate: true } } },
  });
  if (!payment) return { error: "That payment no longer exists." };
  if (payment.status !== "PENDING" && payment.status !== "REJECTED") {
    return { error: `It is already ${payment.status.toLowerCase()} and cannot be edited.` };
  }

  const parsedAmount = parseAmount(formData.get("amount"), payment.currency);
  if ("error" in parsedAmount) return { error: parsedAmount.error };
  const next = parsedAmount.amount;
  /* Valued at the rate pinned on THIS payment — the same rule it was recorded
     under, so an edit cannot quietly re-rate it. */
  const { baseCurrencyAmount, creditedAmount } = valuePayment(
    next,
    payment.currency,
    payment.invoice.currency,
    payment.fxRate ?? payment.invoice.fxRate
  );

  const resubmit = payment.status === "REJECTED";

  const moved = await prisma.$transaction(async (tx) => {
    if (!next.equals(payment.amount)) {
      await recordFieldChange(
        {
          entity: "Payment",
          entityId: payment.id,
          field: "amount",
          oldValue: payment.amount,
          newValue: next,
          reason: resubmit ? "Fixed and sent again" : "Corrected before verification",
          actor,
        },
        tx
      );
    }
    if ((payment.transactionRef ?? "") !== transactionRef) {
      await recordFieldChange(
        {
          entity: "Payment",
          entityId: payment.id,
          field: "transactionRef",
          oldValue: payment.transactionRef,
          newValue: transactionRef || null,
          reason: resubmit ? "Fixed and sent again" : "Corrected before verification",
          actor,
        },
        tx
      );
    }
    const { count } = await tx.payment.updateMany({
      where: { id: payment.id, status: payment.status },
      data: {
        amount: next,
        baseCurrencyAmount,
        creditedAmount,
        transactionRef: transactionRef || null,
        ...(resubmit
          ? { status: "PENDING", rejectedReason: null, verifiedById: null }
          : {}),
      },
    });
    /* Throwing rolls back the FieldChange rows written above; the form is told
       in words rather than shown an error page. */
    if (count === 0) throw new StaleClaim();
    return true;
  }).catch((error) => {
    if (error instanceof StaleClaim) return false;
    throw error;
  });
  if (!moved) return { error: "Somebody else changed it first. Reload the page." };

  await recordAudit({
    actor,
    action: resubmit ? "payment.resubmit" : "payment.edit",
    entity: "Payment",
    entityId: payment.id,
    summary: `${resubmit ? "Fixed and sent again" : "Edited"} ${payment.reference}: ${payment.currency} ${next}`,
  });

  refresh();
  return { ok: resubmit ? "Sent back to Finance." : "Saved." };
}

/**
 * WITHDRAW A CLAIM.
 *
 * "Cancel it" on the queue, "Delete" on the sent-back list — the same act.
 * Nothing is removed: the row becomes CANCELLED, stops counting and leaves
 * every working list, and can still be found by anybody asking what happened
 * to it. A payment that was verified is reversed instead, never cancelled.
 */
export async function cancelClaims(
  _prev: ClaimState,
  formData: FormData
): Promise<ClaimState> {
  const actor = await authorize("payment.submit");

  const ids = [...new Set(formData.getAll("paymentIds").map(String))].filter(
    Boolean
  );
  if (ids.length === 0) return { error: "Pick what to remove." };

  const claims = await prisma.payment.findMany({
    where: { id: { in: ids } },
    select: { id: true, reference: true, status: true },
  });

  let done = 0;
  for (const claim of claims) {
    if (claim.status !== "PENDING" && claim.status !== "REJECTED") continue;
    const { count } = await prisma.payment.updateMany({
      where: { id: claim.id, status: claim.status },
      data: { status: "CANCELLED" },
    });
    if (count === 0) continue;
    done += 1;
    await recordAudit({
      actor,
      action: "payment.cancel",
      entity: "Payment",
      entityId: claim.id,
      summary: `Withdrew ${claim.reference} (was ${claim.status.toLowerCase()})`,
    });
  }

  refresh();
  if (done === 0) return { error: "None of those could be removed." };
  return { ok: `${done} removed.` };
}
