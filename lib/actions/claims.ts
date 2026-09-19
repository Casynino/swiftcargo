"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";

import { recordAudit, recordFieldChange } from "@/lib/audit";
import { parseAmount, valuePayment } from "@/lib/payment-value";
import { prisma } from "@/lib/prisma";
import { store, UploadError } from "@/lib/storage";
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
  /* Left alone when the form does not carry it — the edit dialog no longer
     asks for a slip number, and not asking must not mean erasing one. */
  const transactionRefSent = formData.has("transactionRef");
  const transactionRefIn = String(formData.get("transactionRef") ?? "").trim();
  if (!(amount > 0)) return { error: "An amount is required." };

  const payment = await prisma.payment.findUnique({
    where: { id },
    include: { invoice: { select: { currency: true, fxRate: true } } },
  });
  if (!payment) return { error: "That payment no longer exists." };
  if (payment.status !== "PENDING" && payment.status !== "REJECTED") {
    return { error: `It is already ${payment.status.toLowerCase()} and cannot be edited.` };
  }

  const transactionRef = transactionRefSent ? transactionRefIn : (payment.transactionRef ?? "");

  /* What it was paid in may be corrected too: shillings typed as dollars is
     the commonest slip at the counter. */
  const currencyIn = String(formData.get("currency") ?? "").trim().toUpperCase();
  const currency = currencyIn === "TZS" || currencyIn === "USD" ? currencyIn : payment.currency;

  const parsedAmount = parseAmount(formData.get("amount"), currency);
  if ("error" in parsedAmount) return { error: parsedAmount.error };
  const next = parsedAmount.amount;
  /* Valued at the rate pinned on THIS payment — the same rule it was recorded
     under, so an edit cannot quietly re-rate it. */
  let valued;
  try {
    valued = valuePayment(next, currency, payment.invoice.currency, payment.fxRate ?? payment.invoice.fxRate);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "That amount cannot be valued." };
  }
  const { baseCurrencyAmount, creditedAmount } = valued;

  const resubmit = payment.status === "REJECTED";
  /* "What was wrong with it?" — the desk's own words go on every change. */
  const wrong = String(formData.get("wrong") ?? "").trim().slice(0, 300);
  const reason = wrong || (resubmit ? "Fixed and sent again" : "Corrected before verification");

  /* Everything else the record says, as the form sent it back. A field the
     form did not send stays as it was. */
  const text = (name: string) => {
    if (!formData.has(name)) return undefined;
    const value = String(formData.get(name) ?? "").trim();
    return value === "" ? null : value.slice(0, 200);
  };
  const METHODS = ["CASH", "BANK_TRANSFER", "MOBILE_MONEY", "CHEQUE", "OTHER"] as const;
  const methodRaw = text("method");
  const method = methodRaw && (METHODS as readonly string[]).includes(methodRaw)
    ? (methodRaw as (typeof METHODS)[number])
    : undefined;
  let derivedMethod: (typeof METHODS)[number] | undefined;
  const accountRaw = text("accountId");
  let accountId: string | null | undefined = accountRaw === undefined ? undefined : accountRaw;
  if (accountId) {
    const account = await prisma.bankAccount.findFirst({
      where: { id: accountId, active: true },
      select: { currency: true, bankName: true, kind: true },
    });
    if (!account) return { error: "That account is not one we collect into." };
    if (account.currency !== currency) {
      return { error: `${account.bankName} holds ${account.currency}; this payment is in ${currency}.` };
    }
    /* How it was paid follows where it landed — nobody is asked to say
       "bank transfer" about money that landed in a bank. */
    derivedMethod =
      account.kind === "CASH" ? "CASH" : account.kind === "MOBILE_MONEY" ? "MOBILE_MONEY" : "BANK_TRANSFER";
  }
  const paidAtRaw = text("paidAt");
  let paidAt: Date | null | undefined = undefined;
  if (paidAtRaw) {
    const d = new Date(`${paidAtRaw}T12:00:00Z`);
    if (Number.isNaN(d.getTime())) return { error: "That date is not a date." };
    if (d.getTime() > Date.now() + 86400000) return { error: "A payment cannot be dated in the future." };
    paidAt = d;
  }

  const files = formData.getAll("proof").filter((f): f is File => f instanceof File && f.size > 0);
  const proofs: string[] = [];
  try {
    for (const file of files.slice(0, 3)) proofs.push(await store(file, "payments"));
  } catch (error) {
    return { error: error instanceof UploadError ? error.message : "That upload failed." };
  }

  const methodNext = method ?? derivedMethod;
  const others: [string, string | null, string | null | undefined][] = [
    ["currency", payment.currency, currency],
    ["method", payment.method, methodNext],
    ["accountId", payment.accountId, accountId],
    ["paidAt", payment.paidAt?.toISOString().slice(0, 10) ?? null, paidAt === undefined ? undefined : paidAt?.toISOString().slice(0, 10) ?? null],
    ["payerName", payment.payerName, text("payerName")],
    ["payerBank", payment.payerBank, text("payerBank")],
    ["payerAccount", payment.payerAccount, text("payerAccount")],
    ["notes", payment.notes, text("notes")],
  ];

  const moved = await prisma.$transaction(async (tx) => {
    if (!next.equals(payment.amount)) {
      await recordFieldChange(
        { entity: "Payment", entityId: payment.id, field: "amount", oldValue: payment.amount, newValue: next, reason, actor },
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
          reason,
          actor,
        },
        tx
      );
    }
    for (const [field, from, to] of others) {
      if (to === undefined || (from ?? null) === (to ?? null)) continue;
      await recordFieldChange(
        { entity: "Payment", entityId: payment.id, field, oldValue: from, newValue: to, reason, actor },
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
        currency,
        ...(methodNext !== undefined ? { method: methodNext } : {}),
        ...(accountId !== undefined ? { accountId } : {}),
        ...(paidAt !== undefined ? { paidAt: paidAt ?? payment.paidAt } : {}),
        ...(text("payerName") !== undefined ? { payerName: text("payerName") } : {}),
        ...(text("payerBank") !== undefined ? { payerBank: text("payerBank") } : {}),
        ...(text("payerAccount") !== undefined ? { payerAccount: text("payerAccount") } : {}),
        ...(text("notes") !== undefined ? { notes: text("notes") } : {}),
        ...(resubmit
          ? { status: "PENDING", rejectedReason: null, verifiedById: null }
          : {}),
      },
    });
    /* Throwing rolls back the FieldChange rows written above; the form is told
       in words rather than shown an error page. */
    if (count === 0) throw new StaleClaim();
    for (const url of proofs) {
      await tx.paymentProof.create({ data: { paymentId: payment.id, url } });
    }
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
