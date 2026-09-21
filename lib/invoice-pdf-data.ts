import { readFile } from "node:fs/promises";
import path from "node:path";

import { vatLines } from "@/lib/invoice-vat";

import type { Prisma } from "@prisma/client";

import { formatCurrency, formatRate } from "@/lib/currency";
import { formatDate, formatDateTime } from "@/lib/format";
import { balanceOf } from "@/lib/invoice-balance";
import type { InvoicePdfInput, PdfTone } from "@/lib/invoice-pdf";
import { accountsForInvoice } from "@/lib/invoice-accounts";
import { prisma } from "@/lib/prisma";

import { billLines } from "@/lib/invoice-lines";
const money = (n: unknown, dp = 2) =>
  Number(n ?? 0).toLocaleString("en-US", {
    minimumFractionDigits: dp,
    maximumFractionDigits: dp,
  });

/**
 * What the invoice PDF prints, read from the same rows the on-screen document
 * reads.
 *
 * Kept apart from the route so the file a customer is sent and the file a
 * script produces on a laptop come out of one set of queries. Every figure is
 * formatted here — the balance through `balanceOf`, the money through
 * lib/currency — so the renderer only places text and the PDF cannot disagree
 * with the screen by a shilling.
 */
export async function loadInvoicePdf(key: string) {
  const where: Prisma.InvoiceWhereInput = key.toUpperCase().startsWith("INV-")
    ? { number: key.toUpperCase() }
    : { id: key };

  const [invoice, company] = await Promise.all([
    prisma.invoice.findFirst({
      where,
      include: {
        customer: true,
        payments: true,
        issuedBy: { select: { name: true } },
        items: { orderBy: { createdAt: "asc" } },
        cargo: {
          select: {
            reference: true,
            containerLines: {
              orderBy: { createdAt: "desc" },
              take: 1,
              include: {
                container: {
                  select: {
                    reference: true,
                    containerNumber: true,
                    shipment: { select: { departureDate: true, eta: true, actualArrival: true } },
                  },
                },
              },
            },
          },
        },
      },
    }),
    prisma.companySetting.findUnique({ where: { id: "singleton" } }),
  ]);
  if (!invoice) return null;
  /* The accounts this bill was issued with, not whatever settings say today. */
  const accounts = await accountsForInvoice(invoice.paymentSnapshot);

  const container = invoice.cargo.containerLines[0]?.container ?? null;
  const shipment = container?.shipment ?? null;
  const terms = (company?.invoiceTerms ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const balance = balanceOf(invoice);
  const inTzs = balance.outstandingTzs !== null;
  const paidSomething = (balance.paidTzs ?? balance.paid).greaterThan(0);
  const live = invoice.status !== "DRAFT" && invoice.status !== "CANCELLED";

  const stamp: { label: string; tone: PdfTone } =
    invoice.status === "DRAFT"
      ? { label: "Draft", tone: "amber" }
      : invoice.status === "CANCELLED"
        ? { label: "Cancelled", tone: "grey" }
        : balance.settled
          ? { label: "Paid", tone: "green" }
          : paidSomething
            ? { label: "Part paid", tone: "amber" }
            : { label: "Unpaid", tone: "red" };

  const contact = [company?.phone, company?.altPhone].filter(Boolean).join("  |  ");
  const addressLines = (company?.darAddress ?? "")
    .split(/,\s*(?=P\.?\s*O\.?\s*Box)/i)
    .map((line) => line.trim())
    .filter(Boolean);

  /* The policy printed is the one the storage clock charges by. */
  const freeDays = company?.freeStorageDays ?? 7;
  const perDay = Number(company?.storagePerDay ?? 0);
  const storageCurrency = company?.storageCurrency ?? "USD";
  const perDayLabel = `${storageCurrency} ${perDay % 1 === 0 ? perDay : perDay.toFixed(2)}`;
  const vat = vatLines(invoice);
  /* What the price covers is the company's own terms line ("The invoice
     total includes customs, shipping and clearance fees…"), edited in
     settings — not a second copy of it written here. */
  const shownTerms = perDay > 0 ? terms.filter((line) => !/storage fee/i.test(line)) : terms;

  const companyName = company?.name ?? "Swift Cargo";

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
    issuedOn: formatDate(invoice.issuedAt ?? invoice.createdAt),
    dueOn: formatDate(invoice.dueAt),

    customer: {
      headline: invoice.customer.businessName || invoice.customer.fullName,
      personName: invoice.customer.businessName ? invoice.customer.fullName : null,
      phone: invoice.customer.phone,
      address: invoice.customer.address || "—",
      code: invoice.customer.code,
    },
    details: [
      ["Invoice no", invoice.number],
      ["Container no", container?.containerNumber ?? container?.reference ?? "—"],
      ["Tracking no", invoice.cargo.reference],
      ["Departure", formatDate(shipment?.departureDate)],
      ["Arrival", formatDate(shipment?.actualArrival ?? shipment?.eta)],
      ["Exchange rate", invoice.fxRate ? `1 USD = ${money(invoice.fxRate, 0)} TZS` : "—"],
    ],

    items: billLines(invoice).map((item) => ({
      receiptNo: item.paperReceiptNo ?? "—",
      description: item.description,
      packages: item.packages === null ? "—" : String(item.packages),
      pieces: item.pieces === null ? "—" : String(item.pieces),
      quantity: `${money(item.quantity, item.unit === "kg" ? 2 : item.unit === "CBM" ? 3 : 0)} ${item.unit ?? ""}`.trim(),
      unitPrice: item.unit ? `${money(item.unitPrice)} / ${item.unit}` : money(item.unitPrice),
      amount: `${money(item.amount)} ${invoice.currency}`,
      credit: Number(item.amount) < 0,
    })),
    notes: invoice.notes || null,

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
      subtotalLabel: vat.baseLabel,
      subtotal: `${money(vat.base)} ${invoice.currency}`,
      vatLabel: vat.vatLabel,
      vat: `${money(vat.vat)} ${invoice.currency}`,
      total: `${money(invoice.total)} ${invoice.currency}`,
      totalTzs: invoice.totalTzs ? `${money(invoice.totalTzs, 0)} TZS` : null,
      paid:
        live && paidSomething
          ? balance.paidTzs !== null
            ? `${money(balance.paidTzs, 0)} TZS`
            : `${money(balance.paid)} ${invoice.currency}`
          : null,
    },
    due: live
      ? {
          settled: balance.settled,
          headline: inTzs
            ? formatCurrency(balance.outstandingTzs, "TZS")
            : formatCurrency(balance.outstanding, invoice.currency),
          sub: inTzs ? `${formatCurrency(balance.outstanding, "USD")} · ${formatRate(balance.rate)}` : null,
          credit:
            balance.creditTzs && balance.creditTzs.greaterThan(0)
              ? `In credit ${formatCurrency(balance.creditTzs, "TZS")}`
              : null,
        }
      : null,

    terms: shownTerms,
    storage:
      perDay > 0
        ? {
            sw: {
              heading: "Sera ya uhifadhi wa mizigo",
              body: `Kutokana na wingi wa mizigo katika ghala letu, mzigo wako utahifadhiwa bure kwa siku ${freeDays} kuanzia siku utakapofika Dar es Salaam. Baada ya siku ${freeDays}, utatozwa ${perDayLabel} kwa siku (Storage Fee). Tafadhali chukua mzigo wako mapema ili kuepuka gharama za ziada.`,
            },
            en: {
              heading: "Warehouse storage policy",
              body: `Due to the high volume of cargo in our warehouse, your cargo is stored free of charge for ${freeDays} days from the day it arrives in Dar es Salaam. After ${freeDays} days, a storage fee of ${perDayLabel} per day applies. Please collect your cargo early to avoid additional storage fees.`,
            },
          }
        : null,
    issuedLine: invoice.issuedAt
      ? `Issued by ${invoice.issuedBy?.name ?? companyName} · ${formatDateTime(invoice.issuedAt)}`
      : null,
    reference: invoice.number,
  };

  return {
    status: invoice.status,
    input,
    fileName: invoiceFileName(invoice.customer.fullName, invoice.cargo.reference),
  };
}

let logo: Promise<string | null> | null = null;

/**
 * The logo as a data URL, read from public/ once per process.
 *
 * A bill without its mark still has to go out, so a missing file prints the
 * invoice without the logo rather than failing the download.
 */
export function invoiceLogo(): Promise<string | null> {
  logo ??= readFile(path.join(process.cwd(), "public", "brand", "swift-cargo.png"))
    .then((png) => `data:image/png;base64,${png.toString("base64")}`)
    .catch(() => null);
  return logo;
}

/**
 * What the file is called once it lands on somebody's phone.
 *
 * INV-2026-000016.pdf is the right name for a filing cabinet and useless in a
 * WhatsApp thread, where the person forwarding it is looking at a list of
 * attachments and needs the customer and the consignment without opening any
 * of them. One name, not the whole thing: a long name is truncated by every
 * chat client at exactly the point where the reference would have been.
 */
export function invoiceFileName(customerName: string, reference: string) {
  const first = customerName.trim().split(/\s+/)[0] ?? "";
  // Separators, the quote that would close the header value early, and control
  // characters go. Letters and digits from any script survive.
  const clean = first.replace(/[^\p{L}\p{N}]/gu, "");
  const name = clean.length > 0 ? clean : "Customer";
  const full = `${name} ${reference}.pdf`;

  return {
    full,
    // The fallback has to be plain ASCII. A Chinese name reduced to nothing
    // here still leaves the reference, which is the half that identifies the
    // cargo.
    ascii: full.replace(/[^\x20-\x7E]/g, "").replace(/"/g, "").trim() || `${reference}.pdf`,
  };
}
