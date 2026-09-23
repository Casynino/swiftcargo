"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";

import { recordAudit } from "@/lib/audit";
import { nextPaymentReference } from "@/lib/ids";
import { outstandingOf } from "@/lib/invoice-balance";
import { notifyStaff, staffInDepartment } from "@/lib/notify";
import { formatCurrency, toBase } from "@/lib/currency";
import { parseAmount, spreadPayment, stillTakeableTzs, valuePayment } from "@/lib/payment-value";
import { can } from "@/lib/rbac";
import { currentExchangeRate } from "@/lib/pricing";
import { prisma } from "@/lib/prisma";
import { authorize } from "@/lib/session";
import { confirmPayment } from "@/lib/payment-confirm";
import { store, UploadError } from "@/lib/storage";

export type MergeState = { error?: string; ok?: string };

const METHOD_FOR = {
  CASH: "CASH",
  MOBILE_MONEY: "MOBILE_MONEY",
  BANK: "BANK_TRANSFER",
} as const;

/**
 * ONE TRANSFER, SEVERAL BILLS.
 *
 * The customer sends one figure for four consignments. It is recorded as one
 * payment per bill — each consignment keeps its own invoice, its own container
 * and its own pickup note — sharing one reference and one proof, so the account
 * moves once and the statement shows one line.
 *
 * Each bill is converted at the rate frozen onto IT, not today's and not an
 * average. A customer quoted in August is not charged September's shilling.
 * The money is spread oldest bill first, in the currency it was handed over
 * in, so rounding cannot make a whole payment settle a cent short.
 *
 * "How it was paid" is never asked: money in M-Pesa arrived by mobile money,
 * money in CRDB by transfer, money in the tin as cash. Asking twice invites the
 * two answers to disagree.
 *
 * WHO TAKES IT DECIDES WHETHER IT COUNTS NOW. By the owner's decision, money
 * Finance (or the manager or owner) records is confirmed in the same press —
 * each slice VERIFIED with its own receipt. Support's recording is a claim and
 * waits for Finance.
 */
export async function recordCombinedPayment(
  _prev: MergeState,
  formData: FormData
): Promise<MergeState> {
  const actor = await authorize("payment.submit");
  const confirmsOwn = can(actor.role, "payment.verify");

  const customerId = String(formData.get("customerId") ?? "");
  const invoiceIds = [
    ...new Set(formData.getAll("invoiceIds").map(String).filter(Boolean)),
  ];
  const currency = String(formData.get("currency") ?? "TZS");
  const cargo = Number(formData.get("cargoAmount") ?? 0);
  const transport = Number(formData.get("transport") ?? 0);
  const accountId = String(formData.get("accountId") ?? "");
  const idempotencyKey = String(formData.get("idempotencyKey") ?? "").trim();
  const allowOverpayment = formData.get("allowOverpayment") === "on";
  const overpaymentReason = String(formData.get("overpaymentReason") ?? "").trim();
  const transportAccountId = String(formData.get("transportAccountId") ?? "");
  /* The day the money moved, when it is being recorded after the fact. Never a
     day in the future. */
  const paidAtRaw = String(formData.get("paidAt") ?? "").trim();
  const paidAt = paidAtRaw ? new Date(`${paidAtRaw}T12:00:00`) : new Date();
  if (Number.isNaN(paidAt.getTime()) || paidAt.getTime() > Date.now() + 86_400_000) {
    return { error: "That payment date is not a real day." };
  }

  if (currency !== "TZS" && currency !== "USD") {
    return { error: "That currency is not one we take." };
  }
  if (invoiceIds.length === 0) {
    return { error: "Tick the cargo this payment covers." };
  }
  if (!(cargo > 0)) return { error: "How much was the cargo charge?" };
  if (transport < 0) return { error: "Transport cannot be negative." };
  if (transport > 0 && !transportAccountId) {
    return { error: "Say where the transport was settled from." };
  }
  if (!accountId) return { error: "Where did the money land?" };

  /* One press of Record is one payment, however many times it arrives. */
  if (idempotencyKey) {
    const already = await prisma.payment.findUnique({
      where: { idempotencyKey },
      select: { reference: true, transactionRef: true },
    });
    if (already) {
      return { ok: `Already recorded as ${already.transactionRef ?? already.reference}.` };
    }
  }

  const [account, transportAccount, invoices, live] = await Promise.all([
    prisma.bankAccount.findFirst({ where: { id: accountId, active: true } }),
    transportAccountId
      ? prisma.bankAccount.findFirst({
          where: { id: transportAccountId, active: true },
        })
      : null,
    prisma.invoice.findMany({
      where: {
        id: { in: invoiceIds },
        customerId,
        status: { in: ["ISSUED", "PARTIALLY_PAID", "OVERDUE"] },
      },
      orderBy: { issuedAt: "asc" },
      include: { payments: true },
    }),
    currentExchangeRate(),
  ]);

  if (!account) return { error: "That account is no longer in use." };
  if (account.currency !== currency) {
    return {
      error: `${account.bankName} holds ${account.currency}, not ${currency}.`,
    };
  }
  if (invoices.length === 0) {
    return { error: "None of those bills is open for payment." };
  }
  /* A bill somebody has already claimed a payment against is waiting on
     Finance. Taking a second payment for it is how a customer pays twice. */
  const claimed = invoices.find((i) =>
    i.payments.some((p) => p.status === "PENDING")
  );
  if (claimed) {
    return {
      error: `${claimed.number} already has a payment waiting for Finance to verify.`,
    };
  }

  const parsedAmount = parseAmount(formData.get("cargoAmount"), currency);
  if ("error" in parsedAmount) return { error: parsedAmount.error };

  /* Kept in shillings, each bill at the rate frozen onto it. */
  const spread = spreadPayment(invoices, parsedAmount.amount, currency, live?.rate);
  if ("error" in spread) {
    return {
      error: `${spread.invoice.number} has no exchange rate to convert this payment with.`,
    };
  }
  const { slices, left } = spread;

  if (slices.length === 0) return { error: "Those bills are already settled." };
  /* More than the ticked bills owe is a figure somebody has mistyped, or money
     for a bill they forgot to tick. Either way it is not quietly absorbed. */
  if (left.greaterThan(0)) {
    if (!allowOverpayment) {
      return {
        error: `That is ${formatCurrency(left, currency)} more than the ticked bills owe. Tick the other bill, correct the figure, or accept it as an overpayment.`,
      };
    }
    if (overpaymentReason.length < 3) {
      return { error: "Say why more than the bills owe is being accepted." };
    }
    /* Knowingly taken: the excess sits on the newest bill as a credit, valued
       at that bill's rate, and the reason goes on the payment and the audit. */
    const last = slices[slices.length - 1];
    last.amount = last.amount.add(left);
    last.baseCurrencyAmount = last.baseCurrencyAmount.add(
      toBase(left, currency, last.rate)
    );
  }
  const overpaid = left.greaterThan(0) ? left : null;

  /*
    CLEARING WHAT IS LEFT SHORT.

    A bill of 1,386,613 answered with 1,386,610 is not a debt of three
    shillings anybody will chase. The desk says so with one press, and the
    payment carries the agreement — up to the figure the screen showed — to
    verification, where the rest is written off against the last bill it
    reached. The money recorded stays the money that arrived.
  */
  const clearShortfall = formData.get("clearShortfall") === "1";
  const clearUpTo = Number(formData.get("clearShortfallUpTo") ?? 0);
  let clearOnLast: Prisma.Decimal | null = null;
  if (clearShortfall && !overpaid) {
    /* Anybody who may send a payment may ask for the rest to be cleared; it
       is written off only when the payment is verified (lib/payment-confirm),
       so from Support it is a request Finance sees and decides on the verify
       screen, never a write-off made by the desk that asked. */
    const last = slices[slices.length - 1];
    const owingAfter = (stillTakeableTzs(last.invoice) ?? new Prisma.Decimal(0)).sub(last.baseCurrencyAmount);
    if (owingAfter.greaterThan(0) && clearUpTo > 0) {
      clearOnLast = Prisma.Decimal.min(owingAfter, new Prisma.Decimal(Math.round(clearUpTo)));
    }
  }

  const files = formData
    .getAll("proof")
    .filter((f): f is File => f instanceof File && f.size > 0);
  const proofs: string[] = [];
  try {
    for (const file of files) proofs.push(await store(file, "payments"));
  } catch (error) {
    return {
      error: error instanceof UploadError ? error.message : "That upload failed.",
    };
  }

  /* A shared reference ties the slices of one transfer together. One bill has
     nothing to tie, and calling a single payment a merge would mislead
     whoever reads the ledger later. */
  const shared =
    slices.length > 1 ? `MERGE-${Date.now().toString(36).toUpperCase()}` : null;
  const covering = slices.map((s) => s.invoice.number).join(", ");
  const method = METHOD_FOR[account.kind];

  let references: string[];
  try {
  references = await prisma.$transaction(async (tx) => {
    const made: string[] = [];
    for (const [index, slice] of slices.entries()) {
      const reference = await nextPaymentReference(tx);
      await tx.payment.create({
        data: {
          reference,
          invoiceId: slice.invoice.id,
          customerId,
          amount: slice.amount,
          currency,
          exchangeRateId: slice.invoice.exchangeRateId,
          fxRate: slice.rate,
          baseCurrencyAmount: slice.baseCurrencyAmount,
          creditedAmount: valuePayment(
            slice.amount,
            currency,
            slice.invoice.currency,
            slice.rate
          ).creditedAmount,
          idempotencyKey:
            idempotencyKey && index === 0 ? idempotencyKey : null,
          overpaymentReason:
            overpaid && index === slices.length - 1 ? overpaymentReason : null,
          clearShortfallTzs: index === slices.length - 1 ? clearOnLast : null,
          method,
          accountId: account.id,
          transactionRef: shared,
          paidAt,
          /* The fare rides on the first slice only — it is one fare for one
             transfer, and copying it onto every bill would count it four times. */
          deliveryAdded:
            index === 0 && transport > 0 ? new Prisma.Decimal(transport) : null,
          deliverySettledFrom:
            index === 0 && transport > 0 && transportAccount
              ? transportAccount.bankName
              : null,
          notes: `One payment of ${currency} ${cargo} covering ${covering}.`,
          recordedById: actor.id,
          status: "PENDING",
          /* One screenshot of one transfer, on the first slice only — copied
             onto four rows it would be verified four times against four
             different amounts. */
          proofs:
            index === 0 ? { create: proofs.map((url) => ({ url })) } : undefined,
        },
      });
      made.push(reference);
    }

    if (!confirmsOwn) {
      await notifyStaff(
        await staffInDepartment("FINANCE", tx),
        {
          kind: "payment.pending",
          title: `One payment to verify across ${slices.length} bill(s)`,
          body: `${formatCurrency(cargo, currency)} into ${account.bankName}, covering ${covering}.`,
          href: "/app/finance/collections/verify",
        },
        tx
      );
    }
    return made;
  });
  } catch (error) {
    if (
      idempotencyKey &&
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return { ok: "Already recorded." };
    }
    throw error;
  }

  await recordAudit({
    actor,
    action: overpaid ? "payment.record.overpaid" : "payment.record.merged",
    entity: "Customer",
    entityId: customerId,
    summary: `Took ${currency} ${cargo} as one payment across ${slices.length} bill(s): ${covering}`,
    metadata: {
      transactionRef: shared,
      payments: references,
      account: account.bankName,
      transport,
      slices: slices.map((s) => ({
        invoice: s.invoice.number,
        amount: s.amount.toString(),
        currency,
        exchangeRate: s.rate?.toString() ?? null,
        baseCurrencyAmount: s.baseCurrencyAmount.toString(),
      })),
      overpaidBy: overpaid ? overpaid.toString() : null,
      overpaymentReason: overpaid ? overpaymentReason : null,
      clearShortfallTzs: clearOnLast?.toString() ?? null,
    },
  });

  revalidatePath("/app/finance/collections", "layout");
  revalidatePath("/app/finance/payments/new", "layout");

  if (confirmsOwn) {
    const rows = await prisma.payment.findMany({
      where: { reference: { in: references } },
      orderBy: { reference: "asc" },
      select: { id: true, reference: true },
    });
    const receipts: string[] = [];
    const failed: string[] = [];
    for (const row of rows) {
      const confirmed = await confirmPayment(actor, row.id);
      if (confirmed.error) failed.push(`${row.reference}: ${confirmed.error}`);
      else if (confirmed.ok) receipts.push(confirmed.ok.replace(/^Verified\.\s*/, ""));
    }
    if (failed.length > 0) {
      return { error: `Recorded, but not confirmed — ${failed.join("; ")}` };
    }
    return {
      ok: `Payment recorded${shared ? ` across ${slices.length} bills as ${shared}` : ` as ${references[0]}`}. ${receipts.join(" ")}`.trim(),
    };
  }

  return {
    ok: shared
      ? `Recorded across ${slices.length} bills as ${shared}. It is waiting in Verify payments.`
      : `Recorded as ${references[0]}. It is waiting in Verify payments.`,
  };
}
