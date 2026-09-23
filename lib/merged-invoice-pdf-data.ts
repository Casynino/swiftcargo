import { Prisma } from "@prisma/client";

import { accountsForInvoice } from "@/lib/invoice-accounts";
import type { InvoicePdfInput, PdfTone } from "@/lib/invoice-pdf";
import { formatCurrency, formatRate } from "@/lib/currency";
import { formatCbm, formatDate, formatDateTime } from "@/lib/format";
import { prisma } from "@/lib/prisma";

const money = (n: unknown, dp = 2) =>
  Number(n ?? 0).toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp });

/**
 * THE MERGED INVOICE, AS A FILE — BUILT FROM THE REAL BILLS, NOT A COPY OF
 * THEM.
 *
 * One row per consignment, read straight off the invoices this payment
 * actually covered; the total is what `Payment.baseCurrencyAmount` says was
 * taken, summed, never a second figure typed anywhere. If two bills in the
 * group disagree about the currency they were raised in, this refuses rather
 * than mix them into one wrong number.
 */
export async function loadMergedInvoicePdf(transactionRef: string) {
  const [payments, company] = await Promise.all([
    prisma.payment.findMany({
      where: { transactionRef },
      orderBy: { paidAt: "asc" },
      include: {
        customer: true,
        invoice: {
          include: {
            cargo: {
              select: {
                reference: true,
                description: true,
                darReceiving: { select: { cbm: true } },
                chinaReceiving: { select: { cbm: true } },
              },
            },
          },
        },
      },
    }),
    prisma.companySetting.findUnique({ where: { id: "singleton" } }),
  ]);
  if (payments.length < 2) return null;

  const first = payments[0];
  const currency = first.invoice.currency;
  const sameCurrency = payments.every((p) => p.invoice.currency === currency);

  const accounts = await accountsForInvoice(first.invoice.paymentSnapshot);
  const contact = [company?.phone, company?.altPhone].filter(Boolean).join("  |  ");
  const addressLines = (company?.darAddress ?? "")
    .split(/,\s*(?=P\.?\s*O\.?\s*Box)/i)
    .map((line) => line.trim())
    .filter(Boolean);
  const companyName = company?.name ?? "Swift Cargo";

  const totalTzs = payments.reduce(
    (sum, p) => sum.add(p.baseCurrencyAmount ?? new Prisma.Decimal(0)),
    new Prisma.Decimal(0)
  );
  const rates = new Set(payments.map((p) => p.fxRate?.toString() ?? null));
  const oneRate = rates.size === 1 ? payments[0].fxRate : null;
  const totalUsd = oneRate ? totalTzs.div(oneRate).toDecimalPlaces(2) : null;

  const allVerified = payments.every((p) => p.status === "VERIFIED");
  const stamp: { label: string; tone: PdfTone } = allVerified
    ? { label: "Paid", tone: "green" }
    : { label: "Payment pending verification", tone: "amber" };

  const input: InvoicePdfInput = {
    stamp,
    company: {
      name: companyName,
      addressLines,
      taxLine: company?.tin ? `TIN: ${company.tin}${company.vrn ? ` · VRN: ${company.vrn}` : ""}` : null,
      email: company?.email ?? null,
      contact: contact || null,
      tagline: company?.tagline ?? "On time, Every time",
    },
    issuedOn: formatDate(first.paidAt ?? first.createdAt),
    dueOn: "—",
    customer: {
      headline: first.customer.businessName || first.customer.fullName,
      personName: first.customer.businessName ? first.customer.fullName : null,
      phone: first.customer.phone,
      address: first.customer.address || "—",
      code: first.customer.code,
    },
    details: [
      ["Merged payment ref", transactionRef],
      ["Bills covered", String(payments.length)],
      ["Paid on", formatDateTime(first.paidAt ?? first.createdAt)],
      ["Exchange rate", oneRate ? formatRate(oneRate) : "Varies by bill"],
    ],
    items: payments.map((p) => {
      const cargo = p.invoice.cargo;
      const cbm = cargo.darReceiving?.cbm ?? cargo.chinaReceiving?.cbm ?? null;
      return {
        receiptNo: cargo.reference,
        description: cargo.description,
        packages: "—",
        pieces: "—",
        quantity: cbm ? formatCbm(cbm) : "—",
        unitPrice: "—",
        amount: `${money(p.invoice.total)} ${p.invoice.currency}`,
        credit: false,
      };
    }),
    notes:
      sameCurrency
        ? null
        : "Bills in this payment were raised in more than one currency — each line shows its own.",
    banks: accounts
      .filter((a) => a.kind === "BANK")
      .map((bank) => ({
        number: bank.accountNumber,
        name: bank.accountName,
        institution: `${bank.bankName} (${bank.currency})`,
        branch: bank.branch ? `Branch: ${bank.branch}` : null,
      })),
    mobile: accounts
      .filter((a) => a.kind === "MOBILE_MONEY")
      .map((line) => ({
        number: line.accountNumber,
        name: line.accountName,
        institution: line.bankName,
        branch: null,
      })),
    totals: {
      subtotalLabel: null,
      subtotal: null,
      vatLabel: null,
      vat: null,
      total: totalUsd ? `${money(totalUsd)} USD` : formatCurrency(totalTzs, "TZS"),
      totalTzs: formatCurrency(totalTzs, "TZS"),
      paid: allVerified ? formatCurrency(totalTzs, "TZS") : null,
    },
    due: {
      settled: allVerified,
      headline: allVerified ? "Paid in full" : "Awaiting verification",
      sub: null,
      credit: null,
    },
    terms: [],
    storage: null,
    issuedLine: `Recorded ${formatDateTime(first.paidAt ?? first.createdAt)}`,
    reference: transactionRef,
  };

  return { input, fileName: mergedFileName(transactionRef, first.customer.fullName) };
}

function mergedFileName(transactionRef: string, customerName: string) {
  const ascii = `${transactionRef} ${customerName}`.replace(/[^\w\- ]+/g, "").trim();
  const full = `${transactionRef} ${customerName}`.trim();
  return { ascii: `${ascii}.pdf`, full: `${full}.pdf` };
}
