import "server-only";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";

import { recordAudit } from "@/lib/audit";
import { formatCurrency, toBase } from "@/lib/currency";
import { nextPaymentReference, nextReceiptNumber } from "@/lib/ids";
import { balanceOf } from "@/lib/invoice-balance";
import { refreshInvoiceStatus } from "@/lib/invoice-status";
import { notifyCustomer } from "@/lib/notify";
import { issuePickupNoteIfSettled } from "@/lib/pickup-note";
import { prisma } from "@/lib/prisma";
import { formMessage } from "@/lib/safe-error";
import type { SessionUser } from "@/lib/session";

type Result = { ok?: string; error?: string };

/**
 * Make a waiting payment count: VERIFIED, receipt, customer told, pickup note
 * when the bill is settled. Shared by the verify queue and by Finance taking
 * money itself — the caller has already been authorised for `payment.verify`.
 */
export async function confirmPayment(
  actor: SessionUser,
  paymentId: string
): Promise<Result> {
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: {
      invoice: { include: { payments: true, cargo: { select: { reference: true } } } },
      customer: { select: { fullName: true } },
    },
  });
  if (!payment) return { error: "That payment no longer exists." };
  if (payment.status !== "PENDING") {
    return { error: `That payment is already ${payment.status.toLowerCase()}.` };
  }
  /* A claim left waiting on a bill that has since been cancelled cannot settle
     anything: the bill no longer asks for money, and a verified payment on it
     would stop the bill being cancelled cleanly and point a receipt at nothing. */
  if (payment.invoice.status === "CANCELLED" || payment.invoice.status === "DRAFT") {
    return {
      error: `${payment.invoice.number} is ${payment.invoice.status.toLowerCase()}. Reject this payment, or record it against the bill that replaced it.`,
    };
  }

  let result;
  try {
  result = await prisma.$transaction(async (tx) => {
    /* Two clerks looking at the same queue: only one may verify. */
    const claim = await tx.payment.updateMany({
      where: { id: payment.id, status: "PENDING" },
      data: { status: "VERIFIED", verifiedById: actor.id, verifiedAt: new Date() },
    });
    if (claim.count === 0) throw new Error("Somebody else has just verified it.");

    /* Balance after THIS payment, computed from the rows including it — the
       figure printed on the receipt has to be the one that was true when the
       paper was issued. */
    /* The shortfall the desk agreed to clear, written off now that the money
       it rode on is real — only what is still short, never more than the
       figure the desk was shown. */
    if (payment.clearShortfallTzs && payment.clearShortfallTzs.greaterThan(0)) {
      const before = await tx.invoice.findUniqueOrThrow({
        where: { id: payment.invoiceId },
        include: { payments: true },
      });
      const short = balanceOf(before).outstandingTzs;
      const clearing = short ? Prisma.Decimal.min(short, payment.clearShortfallTzs) : null;
      if (clearing && clearing.greaterThan(0)) {
        await tx.payment.create({
          data: {
            reference: await nextPaymentReference(tx),
            invoiceId: payment.invoiceId,
            customerId: payment.customerId,
            amount: clearing,
            currency: "TZS",
            fxRate: payment.fxRate ?? before.fxRate,
            baseCurrencyAmount: clearing,
            method: "OTHER",
            status: "VERIFIED",
            writtenOff: true,
            writeOffOfId: payment.id,
            paidAt: payment.paidAt ?? new Date(),
            recordedById: payment.recordedById,
            verifiedById: actor.id,
            verifiedAt: new Date(),
            notes: `Short payment cleared with ${payment.reference} — written off, no money moved.`,
          },
        });
        await recordAudit(
          {
            actor,
            action: "payment.writeoff",
            entity: "Invoice",
            entityId: payment.invoiceId,
            summary: `Wrote off ${formatCurrency(clearing, "TZS")} left short by ${payment.reference} on ${before.number}`,
            metadata: { paymentId: payment.id, amountTzs: clearing.toString() },
          },
          tx
        );
      }
    }

    const invoice = await tx.invoice.findUniqueOrThrow({
      where: { id: payment.invoiceId },
      include: { payments: true },
    });
    /* Receipts are written in shillings, the currency the balance is kept in. A
       dollar bill with no rate is the one exception and stays in dollars. */
    const balance = balanceOf(invoice);
    const inTzs = balance.outstandingTzs !== null;
    const balanceAfter = inTzs ? balance.outstandingTzs! : balance.outstanding;
    const receiptCurrency = inTzs ? "TZS" : invoice.currency;
    const receiptAmount = inTzs
      ? (payment.baseCurrencyAmount ?? toBase(payment.amount, payment.currency, payment.fxRate ?? invoice.fxRate))
      : (payment.creditedAmount ?? payment.amount);

    const number = await nextReceiptNumber(tx);
    const receipt = await tx.receipt.create({
      data: {
        number,
        paymentId: payment.id,
        invoiceId: payment.invoiceId,
        customerId: payment.customerId,
        amount: receiptAmount,
        currency: receiptCurrency,
        balanceAfter,
        issuedById: actor.id,
      },
    });

    await notifyCustomer(
      [payment.customerId],
      {
        kind: "payment.verified",
        title: `Payment confirmed — receipt ${number}`,
        body: balanceAfter.lessThanOrEqualTo(0)
          ? `${invoice.number} is settled in full.`
          : `${formatCurrency(balanceAfter, receiptCurrency)} still outstanding on ${invoice.number}.`,
        href: "/portal/invoices",
      },
      tx
    );

    /* Settled in full is the moment the customer may collect, so the pickup
       note is written with the receipt rather than left for somebody to
       remember while the customer waits at the counter. */
    const note = await issuePickupNoteIfSettled(tx, invoice.cargoId, actor.id);

    return { receipt, balanceAfter, invoiceNumber: invoice.number, note };
  });
  } catch (error) {
    return { error: formMessage(error, "That payment was not verified.") };
  }

  await refreshInvoiceStatus(payment.invoiceId);

  if (result.note) {
    await recordAudit({
      actor,
      action: "pickupNote.issue",
      entity: "PickupNote",
      entityId: result.note.id,
      summary: `Issued ${result.note.noteNumber} for ${payment.invoice.cargo.reference} — paid in full with ${payment.reference}`,
    });
  }

  await recordAudit({
    actor,
    action: "payment.verify",
    entity: "Payment",
    entityId: payment.id,
    summary: `Verified ${payment.reference} (${formatCurrency(payment.amount, payment.currency)}) on ${result.invoiceNumber}; receipt ${result.receipt.number}, balance ${formatCurrency(result.balanceAfter, result.receipt.currency)}`,
  });

  revalidatePath("/app/finance/verify");
  revalidatePath("/app/finance/collections", "layout");
  revalidatePath(`/app/finance/invoices/${payment.invoiceId}`);
  revalidatePath("/app/release");
  revalidatePath("/app/finance/pickup-notes");
  return {
    ok: result.note
      ? `Verified. Receipt ${result.receipt.number} issued, and pickup note ${result.note.noteNumber} is ready.`
      : `Verified. Receipt ${result.receipt.number} issued.`,
  };
}

