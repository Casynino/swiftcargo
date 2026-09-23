import "server-only";

import { Prisma } from "@prisma/client";

import { formatCurrency, formatRate } from "@/lib/currency";
import { formatCbm, formatDate } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { COMPANY } from "@/lib/constants";
import { trackKey } from "@/lib/track-key";
import { trackUrl } from "@/lib/messages";

/**
 * ONE HANDOVER, READ BACK AS THE GROUP IT WAS.
 *
 * A merged payment is not a row anywhere — CLAUDE.md is explicit that money is
 * derived, never stored, and a second total sitting beside the real invoices
 * is exactly the kind of figure that drifts. What ties the slices of one
 * transfer together is `Payment.transactionRef`, written once by
 * `recordCombinedPayment` / `recordMergedPayment` onto every `Payment` row the
 * handover created. This reads that group back and adds it up live, every
 * time — it can never disagree with the invoices, because it is nothing but
 * the invoices.
 */
export type MergedPaymentLine = {
  cargoId: string;
  reference: string;
  description: string;
  cbm: string | null;
  invoiceId: string;
  invoiceNumber: string;
};

export type MergedPayment = {
  transactionRef: string;
  customerId: string;
  customerName: string;
  customerPhone: string | null;
  lines: MergedPaymentLine[];
  /** Sum of each cargo's own measured CBM — Dar's once it exists. */
  totalCbm: string;
  /** What was actually taken, in shillings — the authoritative figure. */
  totalTzs: string;
  /** The same amount in dollars, at the rate this transfer was valued at. */
  totalUsd: string | null;
  /** The rate applied, when every slice shares one — null if they disagree. */
  fxRate: string | null;
  paidAt: Date;
  /** Every slice verified, none still waiting on Finance. */
  allVerified: boolean;
  anyRejected: boolean;
};

/**
 * Reads every `Payment` row sharing this reference, the cargo and invoice each
 * one belongs to, and totals them. Returns null for a reference that names no
 * payment, or one that turns out to cover a single bill — a "merged" view of
 * one invoice is just that invoice.
 */
export async function mergedPaymentByRef(
  transactionRef: string
): Promise<MergedPayment | null> {
  const payments = await prisma.payment.findMany({
    where: { transactionRef },
    orderBy: { paidAt: "asc" },
    include: {
      customer: { select: { id: true, fullName: true, phone: true } },
      invoice: {
        select: {
          id: true,
          number: true,
          cargo: {
            select: {
              id: true,
              reference: true,
              description: true,
              darReceiving: { select: { cbm: true } },
              chinaReceiving: { select: { cbm: true } },
            },
          },
        },
      },
    },
  });
  if (payments.length < 2) return null;

  const first = payments[0];
  const totalTzs = payments.reduce(
    (sum, p) => sum.add(p.baseCurrencyAmount ?? new Prisma.Decimal(0)),
    new Prisma.Decimal(0)
  );

  /* One rate for the message's USD line, only when every slice actually
     shared it — a merge across bills pinned at different rates has no single
     dollar figure that means anything. */
  const rates = new Set(payments.map((p) => p.fxRate?.toString() ?? null));
  const oneRate = rates.size === 1 ? payments[0].fxRate : null;
  const totalUsd = oneRate
    ? totalTzs.div(oneRate).toDecimalPlaces(2).toString()
    : null;

  const lines: MergedPaymentLine[] = payments.map((p) => {
    const cargo = p.invoice.cargo;
    const cbm = cargo.darReceiving?.cbm ?? cargo.chinaReceiving?.cbm ?? null;
    return {
      cargoId: cargo.id,
      reference: cargo.reference,
      description: cargo.description,
      cbm: cbm ? formatCbm(cbm).replace(" CBM", "") : null,
      invoiceId: p.invoice.id,
      invoiceNumber: p.invoice.number,
    };
  });
  const totalCbm = lines
    .reduce((sum, l) => sum.add(new Prisma.Decimal(l.cbm ?? 0)), new Prisma.Decimal(0))
    .toFixed(3);

  return {
    transactionRef,
    customerId: first.customer.id,
    customerName: first.customer.fullName,
    customerPhone: first.customer.phone,
    lines,
    totalCbm,
    totalTzs: totalTzs.toFixed(0),
    totalUsd,
    fxRate: oneRate?.toString() ?? null,
    paidAt: first.paidAt ?? first.createdAt,
    allVerified: payments.every((p) => p.status === "VERIFIED"),
    anyRejected: payments.some((p) => p.status === "REJECTED"),
  };
}

/** The signed link a customer's merged-payment notification carries. */
export function mergedTrackLink(transactionRef: string): string {
  return `${trackUrl()}/merged/${transactionRef}?k=${trackKey(transactionRef)}`;
}

/**
 * THE NOTIFICATION, IN ONE MESSAGE.
 *
 * Same shape as every other letter this company sends — company name,
 * greeting, one sentence, the details, the link — but the details are a line
 * per consignment rather than one, because this transfer paid for all of them
 * at once and the customer should be able to tell that from the message
 * alone, not by opening the link first.
 */
export function composeMergedMessage(group: MergedPayment): string {
  const name = group.customerName.split(" ")[0] ?? group.customerName;
  const lines = group.lines.map(
    (l) =>
      `• Tracking: ${l.reference} — ${l.description}${l.cbm ? ` — ${l.cbm} CBM` : ""}`
  );
  const link = mergedTrackLink(group.transactionRef);

  return (
    `*${COMPANY.name.toUpperCase()}*\n\n` +
    `Habari ${name}!\n\n` +
    `Mzigo wako umefika salama Dar es Salaam na sasa uko tayari kuchukuliwa baada ya malipo kuthibitishwa.\n\n` +
    `*MAELEZO YA MIZIGO*\n` +
    `${lines.join("\n")}\n\n` +
    `• Total CBM: ${group.totalCbm} CBM\n` +
    `• *Total Amount: TZS ${formatCurrency(group.totalTzs, "TZS").replace("TZS ", "")}*\n` +
    (group.totalUsd ? `• Equivalent: USD ${group.totalUsd}\n` : "") +
    (group.fxRate ? `• Exchange Rate: ${formatRate(group.fxRate)}\n` : "") +
    `• Status: ${group.allVerified ? "Ready for Pickup" : "Ready for Pickup After Payment"}\n\n` +
    `Angalia invoice yako ya merged payment na taarifa zote za mizigo yako:\n` +
    `${link}\n\n` +
    `Hii ni invoice yako ya merged payment yenye taarifa zote za mizigo iliyojumuishwa kwenye malipo haya. ` +
    `Kila mzigo bado unaweza kufuatiliwa peke yake kwa namba yake ya tracking — ${formatDate(group.paidAt)}.`
  );
}
