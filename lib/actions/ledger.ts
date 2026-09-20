"use server";

import { revalidatePath } from "next/cache";

import { recordAudit, recordFieldChange } from "@/lib/audit";
import { formatCurrency } from "@/lib/currency";
import { withdrawPickupNoteIfOwing } from "@/lib/pickup-note";
import { prisma } from "@/lib/prisma";
import { authorize } from "@/lib/session";

import { refreshInvoiceStatus } from "@/lib/invoice-status";

export type LedgerActionState = { error?: string; ok?: string };

const METHODS = ["CASH", "BANK_TRANSFER", "MOBILE_MONEY", "CHEQUE", "OTHER"] as const;

const text = (formData: FormData, key: string) => {
  const raw = formData.get(key);
  if (raw === null) return undefined;
  const value = String(raw).trim();
  return value === "" ? null : value;
};

function revalidateLedger() {
  revalidatePath("/app/finance/ledger", "layout");
  revalidatePath("/app/finance/accounts", "layout");
  revalidatePath("/app/finance/expenses");
}

/**
 * CORRECT WHAT A PAYMENT SAYS ABOUT ITSELF, NEVER WHAT IT IS WORTH.
 *
 * The code on the M-Pesa message, how it was paid, who sent it and the note —
 * the details a desk types wrong. The figure and the account are not here: a
 * receipt was printed from them and the bill was settled by them, so changing
 * either is a reversal and a fresh payment, which leaves both on the books.
 *
 * Every field that moves writes its old and new value, who and why, before it
 * moves. A combined payment is corrected on every one of its slices at once,
 * and never its shared MERGE- reference, which is the only thing tying them.
 */
export async function editLedgerPayment(
  _prev: LedgerActionState,
  formData: FormData
): Promise<LedgerActionState> {
  const actor = await authorize("payment.verify");

  const ids = [...new Set(formData.getAll("paymentId").map(String).filter(Boolean))];
  const reason = String(formData.get("reason") ?? "").trim() || "No reason given";
  if (ids.length === 0) return { error: "Which payment?" };

  const method = text(formData, "method");
  if (method && !(METHODS as readonly string[]).includes(method)) {
    return { error: "That is not a way we take money." };
  }

  const payments = await prisma.payment.findMany({
    where: { id: { in: ids }, writtenOff: false },
    select: {
      id: true,
      reference: true,
      status: true,
      transactionRef: true,
      method: true,
      payerName: true,
      payerAccount: true,
      payerBank: true,
      notes: true,
    },
  });
  if (payments.length !== ids.length) return { error: "That payment no longer exists." };
  if (payments.some((p) => p.status !== "VERIFIED")) {
    return { error: "Only a verified payment can be corrected here." };
  }
  const merged = payments.length > 1;
  if (merged && new Set(payments.map((p) => p.transactionRef)).size !== 1) {
    return { error: "Those payments were not taken as one." };
  }

  const wanted: Record<string, string | null | undefined> = {
    method,
    payerName: text(formData, "payerName"),
    payerAccount: text(formData, "payerAccount"),
    payerBank: text(formData, "payerBank"),
    notes: text(formData, "notes"),
    /* The shared reference is what ties a combined payment's slices together;
       rewriting it would split one handover into unrelated payments. */
    transactionRef: merged ? undefined : text(formData, "transactionRef"),
  };

  let changed = 0;
  await prisma.$transaction(async (tx) => {
    for (const p of payments) {
      const data: Record<string, string | null> = {};
      for (const [field, value] of Object.entries(wanted)) {
        if (value === undefined) continue;
        if (field === "method" && value === null) continue;
        const before = (p as Record<string, unknown>)[field] ?? null;
        if (before === value) continue;
        await recordFieldChange(
          { entity: "Payment", entityId: p.id, field, oldValue: before, newValue: value, reason, actor },
          tx
        );
        data[field] = value;
      }
      if (Object.keys(data).length === 0) continue;
      const { count } = await tx.payment.updateMany({
        where: { id: p.id, status: "VERIFIED" },
        data,
      });
      if (count === 0) throw new Error("That payment was reversed while you were correcting it.");
      changed += Object.keys(data).length;
      await recordAudit(
        {
          actor,
          action: "payment.correct",
          entity: "Payment",
          entityId: p.id,
          summary: `Corrected ${Object.keys(data).join(", ")} on ${p.reference} — ${reason}`,
        },
        tx
      );
    }
  });

  if (changed === 0) return { error: "Nothing was changed." };
  revalidateLedger();
  return { ok: "Corrected." };
}

/**
 * TAKE BACK A PAYMENT THAT WAS TAKEN AS ONE ACROSS SEVERAL BILLS.
 *
 * One handover, one decision: reversing a single slice would leave the account
 * holding part of a transfer the desk says never arrived. Every slice goes back
 * together — and any write-off that rode on them, exactly as `reversePayment`
 * does for one — in one statement, so there is no half-reversed handover.
 */
export async function reverseCombinedPayment(
  _prev: LedgerActionState,
  formData: FormData
): Promise<LedgerActionState> {
  const actor = await authorize("payment.verify");

  const ids = [...new Set(formData.getAll("paymentId").map(String).filter(Boolean))];
  const reason = String(formData.get("reason") ?? "").trim() || "No reason given";
  if (ids.length === 0) return { error: "Which payment?" };

  const payments = await prisma.payment.findMany({
    where: { id: { in: ids }, writtenOff: false },
    select: {
      id: true,
      reference: true,
      status: true,
      amount: true,
      currency: true,
      transactionRef: true,
      invoiceId: true,
      invoice: { select: { number: true, cargoId: true } },
    },
  });
  if (payments.length !== ids.length) return { error: "That payment no longer exists." };
  if (payments.some((p) => p.status !== "VERIFIED")) {
    return { error: "Only a verified payment can be reversed." };
  }
  if (new Set(payments.map((p) => p.transactionRef)).size !== 1) {
    return { error: "Those payments were not taken as one." };
  }

  const reversed = { status: "REVERSED" as const, reversedAt: new Date(), reversedReason: reason };
  let withdrawn: { id: string; noteNumber: string }[] = [];
  try {
    withdrawn = await prisma.$transaction(async (tx) => {
      const { count } = await tx.payment.updateMany({
        where: { id: { in: ids }, status: "VERIFIED" },
        data: reversed,
      });
      if (count !== ids.length) throw new Error("partly reversed");
      await tx.payment.updateMany({
        where: { writeOffOfId: { in: ids }, status: "VERIFIED" },
        data: reversed,
      });
      /* A pickup note written on this money stops being true with it. */
      const notes = [];
      for (const cargoId of new Set(payments.map((p) => p.invoice.cargoId))) {
        const note = await withdrawPickupNoteIfOwing(
          tx,
          cargoId,
          `${payments[0].transactionRef ?? payments[0].reference} reversed — ${reason}`
        );
        if (note) notes.push(note);
      }
      return notes;
    });
  } catch {
    return { error: "Somebody reversed part of it first." };
  }

  for (const invoiceId of new Set(payments.map((p) => p.invoiceId))) {
    await refreshInvoiceStatus(invoiceId);
  }
  for (const p of payments) {
    await recordAudit({
      actor,
      action: "payment.reverse",
      entity: "Payment",
      entityId: p.id,
      summary: `Reversed ${p.reference} (${formatCurrency(p.amount, p.currency)}) on ${p.invoice.number}, part of ${p.transactionRef} — ${reason}`,
    });
  }

  for (const note of withdrawn) {
    await recordAudit({
      actor,
      action: "pickupNote.cancel",
      entity: "PickupNote",
      entityId: note.id,
      summary: `Withdrew ${note.noteNumber}: the payment it rested on was reversed — ${reason}`,
    });
  }

  for (const p of payments) revalidatePath(`/app/finance/invoices/${p.invoiceId}`);
  revalidatePath("/app/release");
  revalidateLedger();
  return { ok: "Reversed. The balances have gone back up." };
}
