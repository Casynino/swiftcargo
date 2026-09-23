import { Prisma } from "@prisma/client";

import { accountsForInvoice } from "@/lib/invoice-accounts";
import type { InvoicePdfInput, PdfTone } from "@/lib/invoice-pdf";
import { formatCurrency, formatRate } from "@/lib/currency";
import { formatCbm, formatDate, formatDateTime } from "@/lib/format";
import { balanceOf, invoiceRate } from "@/lib/invoice-balance";
import { prisma } from "@/lib/prisma";

const money = (n: unknown, dp = 2) =>
  Number(n ?? 0).toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp });

/**
 * ONE PDF FOR A GROUP OF BILLS, READ STRAIGHT OFF THE INVOICES.
 *
 * One row per consignment, the total what is actually owed across them right
 * now — before a shilling has moved, this is the bill; once payment lands,
 * the same file shows what it settled. Never a second figure typed anywhere.
 * If two bills in the group disagree about the currency they were raised in,
 * this refuses to mix them into one wrong number.
 */
export async function loadMergedInvoicePdf(invoiceIds: string[]) {
  const ids = [...new Set(invoiceIds)];
  if (ids.length < 2) return null;

  const [invoices, company] = await Promise.all([
    prisma.invoice.findMany({
      where: { id: { in: ids } },
      orderBy: { createdAt: "asc" },
      include: {
        customer: true,
        payments: {
          select: {
            status: true,
            amount: true,
            currency: true,
            fxRate: true,
            baseCurrencyAmount: true,
            creditedAmount: true,
          },
        },
        cargo: {
          select: {
            reference: true,
            description: true,
            darReceiving: { select: { cbm: true } },
            chinaReceiving: { select: { cbm: true } },
          },
        },
      },
    }),
    prisma.companySetting.findUnique({ where: { id: "singleton" } }),
  ]);
  if (invoices.length < 2) return null;
  if (new Set(invoices.map((i) => i.customerId)).size !== 1) return null;

  const first = invoices[0]!;
  const currency = first.currency;
  const sameCurrency = invoices.every((i) => i.currency === currency);

  const accounts = await accountsForInvoice(first.paymentSnapshot);
  const contact = [company?.phone, company?.altPhone].filter(Boolean).join("  |  ");
  const addressLines = (company?.darAddress ?? "")
    .split(/,\s*(?=P\.?\s*O\.?\s*Box)/i)
    .map((line) => line.trim())
    .filter(Boolean);
  const companyName = company?.name ?? "Swift Cargo";

  const totalTzs = invoices.reduce(
    (sum, i) => {
      const tzs = balanceOf(i).totalTzs;
      return tzs ? sum.add(tzs) : sum;
    },
    new Prisma.Decimal(0)
  );
  const outstandingTzs = invoices.reduce(
    (sum, i) => {
      const tzs = balanceOf(i).outstandingTzs;
      return tzs ? sum.add(tzs) : sum;
    },
    new Prisma.Decimal(0)
  );
  /* A bill with no pinned rate contributes no TZS figure — never folded in as
     if it were zero. Named on its own line instead of silently missing from
     the total a customer is shown as complete. */
  const unconvertedByCurrency = new Map<string, Prisma.Decimal>();
  for (const invoice of invoices) {
    const bal = balanceOf(invoice);
    if (bal.outstandingTzs !== null || bal.outstanding.lessThanOrEqualTo(0)) continue;
    unconvertedByCurrency.set(
      invoice.currency,
      (unconvertedByCurrency.get(invoice.currency) ?? new Prisma.Decimal(0)).add(bal.outstanding)
    );
  }
  const unconvertedNote = [...unconvertedByCurrency.entries()]
    .map(([cur, amt]) => `${cur} ${money(amt)}`)
    .join(", ");

  const rates = new Set(invoices.map((i) => invoiceRate(i)?.toString() ?? null).filter(Boolean));
  const oneRate = rates.size === 1 ? [...rates][0]! : null;

  const settled = invoices.every((i) => balanceOf(i).settled);
  const paidSomething = invoices.some((i) => balanceOf(i).paid.greaterThan(0));
  const stamp: { label: string; tone: PdfTone } = settled
    ? { label: "Paid", tone: "green" }
    : paidSomething
      ? { label: "Partly paid", tone: "amber" }
      : { label: "Not paid", tone: "amber" };

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
    issuedOn: formatDate(new Date()),
    dueOn: "—",
    customer: {
      headline: first.customer.businessName || first.customer.fullName,
      personName: first.customer.businessName ? first.customer.fullName : null,
      phone: first.customer.phone,
      address: first.customer.address || "—",
      code: first.customer.code,
    },
    details: [
      ["Bills covered", String(invoices.length)],
      ["Exchange rate", oneRate ? formatRate(oneRate) : "Varies by bill"],
    ],
    items: invoices.map((invoice) => {
      const cargo = invoice.cargo;
      const cbm = cargo.darReceiving?.cbm ?? cargo.chinaReceiving?.cbm ?? null;
      return {
        receiptNo: cargo.reference,
        description: cargo.description,
        packages: "—",
        pieces: "—",
        quantity: cbm ? formatCbm(cbm) : "—",
        unitPrice: "—",
        amount: `${money(invoice.total)} ${invoice.currency}`,
        credit: false,
      };
    }),
    notes:
      [
        sameCurrency
          ? null
          : "Bills in this group were raised in more than one currency — each line shows its own.",
        unconvertedNote
          ? `Also owed, no exchange rate set yet: ${unconvertedNote} — not included in the total above.`
          : null,
      ]
        .filter(Boolean)
        .join(" ") || null,
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
      total: formatCurrency(totalTzs, "TZS"),
      totalTzs: formatCurrency(totalTzs, "TZS"),
      paid: settled ? formatCurrency(totalTzs, "TZS") : paidSomething ? formatCurrency(totalTzs.sub(outstandingTzs), "TZS") : null,
    },
    due: {
      settled,
      headline: formatCurrency(outstandingTzs, "TZS"),
      sub: null,
      credit: null,
    },
    terms: [],
    storage: null,
    issuedLine: `Generated ${formatDateTime(new Date())}`,
    reference: invoices.map((i) => i.cargo.reference).join(" + "),
  };

  return { input, fileName: mergedFileName(invoices.map((i) => i.cargo.reference), first.customer.fullName) };
}

function mergedFileName(references: string[], customerName: string) {
  const label = `${references.join("+")} ${customerName}`;
  const ascii = label.replace(/[^\w\- ]+/g, "").trim();
  return { ascii: `${ascii}.pdf`, full: `${label.trim()}.pdf` };
}
