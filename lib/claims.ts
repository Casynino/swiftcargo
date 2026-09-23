import { Prisma, type PaymentStatus } from "@prisma/client";

import type { ClaimRow } from "@/components/app/claim-list";
import { formatCurrency, formatRate, tzsToUsd } from "@/lib/currency";
import { formatDateTime } from "@/lib/format";
import { balanceOf, paymentTzs } from "@/lib/invoice-balance";
import { categoryOfCargo } from "@/lib/rate-categories";
import { prisma } from "@/lib/prisma";

/**
 * THE CLAIMS AT ONE STAGE, READY FOR THE LIST.
 *
 * Shillings are what the money physically was, so they lead; a dollar payment
 * is shown in shillings at the rate pinned on that payment, never today's.
 * The "waiting on you" total in USD is the same money at today's rate, and the
 * card says so — two different conversions must not look like one.
 */
export async function claimsAt(status: PaymentStatus, query?: string) {
  const [payments, today] = await Promise.all([
    prisma.payment.findMany({
      where: {
        status,
        /* A write-off is not a claim anybody made; it follows its payment. */
        writtenOff: false,
        ...(query
          ? {
              OR: [
                { reference: { contains: query, mode: "insensitive" as const } },
                { transactionRef: { contains: query, mode: "insensitive" as const } },
                { invoice: { number: { contains: query, mode: "insensitive" as const } } },
                {
                  invoice: {
                    cargo: { reference: { contains: query, mode: "insensitive" as const } },
                  },
                },
                {
                  customer: {
                    OR: [
                      { fullName: { contains: query, mode: "insensitive" as const } },
                      { phone: { contains: query } },
                    ],
                  },
                },
              ],
            }
          : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 200,
      include: {
        customer: { select: { fullName: true, phone: true } },
        account: { select: { bankName: true, currency: true } },
        recordedBy: { select: { name: true } },
        proofs: { select: { url: true }, take: 1 },
        invoice: {
          include: {
            payments: true,
            items: { select: { unit: true, amount: true, description: true, category: true } },
            cargo: {
              select: {
                reference: true,
                commodity: true,
                packages: { where: { deletedAt: null }, select: { cargoType: true } },
                containerLines: {
                  take: 1,
                  orderBy: { createdAt: "desc" },
                  select: { container: { select: { reference: true } } },
                },
              },
            },
          },
        },
      },
    }),
    prisma.exchangeRate.findFirst({
      where: { active: true },
      orderBy: { effectiveFrom: "desc" },
      select: { rate: true },
    }),
  ]);

  const todayRate = today ? Number(today.rate) : 0;

  /** The discount on a bill, in the words it was given in. */
  const discountOf = (
    invoice: {
      discount: Prisma.Decimal;
      currency: string;
      items: { amount: Prisma.Decimal; description: string; category: string | null }[];
    },
    who: { by: string; when: string } | undefined
  ) => {
    if (!invoice.discount.greaterThan(0)) return null;
    const lines = invoice.items.filter((i) => i.category === "Discount");
    return {
      label: formatCurrency(invoice.discount, invoice.currency),
      /* The description carries "Discount — why", and the why is the half
         Finance is judging. */
      reason:
        lines
          .map((i) => i.description.replace(/^Discount\s*[—-]\s*/, ""))
          .filter(Boolean)
          .join("; ") || "No reason given",
      by: who?.by ?? null,
      when: who?.when ?? null,
    };
  };

  /* Each payment at the shilling value written onto it when it was taken. */
  const tzsOf = (p: (typeof payments)[number]) =>
    paymentTzs(p, p.invoice) ??
    new Prisma.Decimal(p.amount).mul(todayRate).toDecimalPlaces(0);

  /* Who gave the discount and when, from the money audit — the invoice itself
     records the figure but not the hand. One query for the whole page. */
  const audits = new Map<string, { by: string; when: string }>();
  const discounted = payments
    .filter((p) => p.invoice.discount.greaterThan(0))
    .map((p) => p.invoiceId);
  if (discounted.length > 0) {
    const rowsOfAudit = await prisma.auditLog.findMany({
      where: { entity: "Invoice", entityId: { in: discounted }, action: "invoice.discount" },
      orderBy: { createdAt: "desc" },
      select: { entityId: true, createdAt: true, actor: { select: { name: true } } },
    });
    for (const row of rowsOfAudit) {
      if (!row.entityId || audits.has(row.entityId)) continue;
      audits.set(row.entityId, {
        by: row.actor?.name ?? "somebody",
        when: formatDateTime(row.createdAt) ?? "",
      });
    }
  }

  const rows: ClaimRow[] = payments.map((p) => {
    const tzs = tzsOf(p);
    const owed = balanceOf(p.invoice);
    return {
      id: p.id,
      customer: p.customer.fullName,
      customerPhone: p.customer.phone,
      container: p.invoice.cargo.containerLines[0]?.container.reference ?? null,
      reference: p.reference,
      cargo: p.invoice.cargo.reference,
      invoice: p.invoice.number,
      account: p.account ? `${p.account.bankName} (${p.account.currency})` : null,
      submittedBy: p.submittedByCustomer
        ? "the customer"
        : (p.recordedBy?.name ?? "—"),
      submittedAt: formatDateTime(p.createdAt),
      amount: Number(p.amount),
      currency: p.currency,
      amountLabel: formatCurrency(tzs, "TZS"),
      paidAsLabel:
        p.currency === "TZS"
          ? `≈ ${formatCurrency(tzsToUsd(tzs, p.fxRate ?? p.invoice.fxRate ?? todayRate), "USD")} · ${formatRate(p.fxRate ?? p.invoice.fxRate)}`
          : `paid ${formatCurrency(p.amount, p.currency)} · ${formatRate(p.fxRate ?? p.invoice.fxRate)}`,
      owedLabel: owed.outstandingTzs
        ? `${formatCurrency(owed.outstandingTzs, "TZS")} (${formatCurrency(owed.outstanding, "USD")})`
        : formatCurrency(owed.outstanding, p.invoice.currency),
      overpayment: p.overpaymentReason,
      clearingAsked: p.clearShortfallTzs && p.clearShortfallTzs.greaterThan(0)
        ? formatCurrency(p.clearShortfallTzs, "TZS")
        : null,
      transactionRef: p.transactionRef,
      accountId: p.accountId,
      paidAt: (p.paidAt ?? p.createdAt).toISOString().slice(0, 10),
      method: p.method,
      payerName: p.payerName,
      payerBank: p.payerBank,
      payerAccount: p.payerAccount,
      notes: p.notes,
      proofUrl: p.proofs[0]?.url ?? null,
      reason: p.rejectedReason,
      bill: {
        invoiceId: p.invoiceId,
        total: Number(p.invoice.total),
        /* WHAT WAS TAKEN OFF BEFORE THIS REACHED FINANCE.

           A desk may agree a discount with a customer and then send the
           payment up. Finance is entitled to see what was given, by whom and
           why, BEFORE it agrees the money — and to take it back off if the
           company is not giving it. A figure quietly missing from a total is
           the one nobody can explain a month later. */
        discount: discountOf(p.invoice, audits.get(p.invoiceId)),
        fxRate: p.invoice.fxRate ? Number(p.invoice.fxRate) : null,
        standardRate: p.invoice.standardRate ? Number(p.invoice.standardRate) : null,
        appliedRate: p.invoice.appliedRate ? Number(p.invoice.appliedRate) : null,
        cbm: p.invoice.billableCbm ? Number(p.invoice.billableCbm) : null,
        category: categoryOfCargo(p.invoice.cargo),
        perCbm: p.invoice.items.some((i) => i.unit === "CBM"),
      },
    };
  });

  const totalTzsDecimal = payments.reduce(
    (sum, p) => sum.add(tzsOf(p)),
    new Prisma.Decimal(0)
  );
  const totalTzs = totalTzsDecimal.toNumber();

  return {
    rows,
    totalTzs,
    totalUsd: todayRate > 0 ? totalTzs / todayRate : 0,
  };
}
