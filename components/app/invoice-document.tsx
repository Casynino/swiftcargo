import Image from "next/image";
import { notFound } from "next/navigation";

import { formatCurrency, formatRate } from "@/lib/currency";
import { formatDate, formatDateTime } from "@/lib/format";
import { balanceOf } from "@/lib/invoice-balance";
import { accountsForInvoice } from "@/lib/invoice-accounts";
import { prisma } from "@/lib/prisma";
import { invoiceQr } from "@/lib/invoice-verify";

const money = (n: unknown, dp = 2) =>
  Number(n ?? 0).toLocaleString("en-US", {
    minimumFractionDigits: dp,
    maximumFractionDigits: dp,
  });

/**
 * THE INVOICE AS THE CUSTOMER RECEIVES IT.
 *
 * Drawn to the company's own printed form — logo and INVOICE across the top,
 * the blue band, who it is for beside which sailing it covers, the charges, the
 * accounts to pay into beside the totals, then the terms and the storage policy
 * at the foot of the same page. One component for the invoice page and the
 * download, so the paper and the screen cannot say different things. Every price,
 * the exchange rate and the accounts to pay into were pinned when the bill was
 * issued; only the balance is read at print time.
 */
export async function InvoiceDocument({ id }: { id: string }) {
  const [invoice, company] = await Promise.all([
    prisma.invoice.findUnique({
      where: { id },
      include: {
        customer: true,
        payments: true,
        issuedBy: { select: { name: true } },
        items: { orderBy: { createdAt: "asc" } },
        cargo: {
          select: {
            reference: true,
            shippingMark: true,
            description: true,
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
  if (!invoice) notFound();
  /* The accounts this bill was issued with, not whatever settings say today. */
  const accounts = await accountsForInvoice(invoice.paymentSnapshot);
  /* A draft is not a bill anybody should be able to verify. */
  const verifyQr = invoice.status !== "DRAFT" ? await invoiceQr(invoice.id, 360).catch(() => null) : null;

  const container = invoice.cargo.containerLines[0]?.container ?? null;
  const shipment = container?.shipment ?? null;
  const terms = (company?.invoiceTerms ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const vatPercent = Number(invoice.vatPercent);
  const balance = balanceOf(invoice);
  const inTzs = balance.outstandingTzs !== null;
  const paidSomething = (balance.paidTzs ?? balance.paid).greaterThan(0);
  const live = invoice.status !== "DRAFT" && invoice.status !== "CANCELLED";

  const stamp =
    invoice.status === "DRAFT"
      ? { label: "Draft", tone: "border-amber-500 bg-amber-50 text-amber-700" }
      : invoice.status === "CANCELLED"
        ? { label: "Cancelled", tone: "border-neutral-400 bg-neutral-100 text-neutral-600" }
        : balance.settled
          ? { label: "Paid", tone: "border-emerald-600 bg-emerald-50 text-emerald-700" }
          : paidSomething
            ? { label: "Part paid", tone: "border-amber-500 bg-amber-50 text-amber-700" }
            : { label: "Unpaid", tone: "border-red-600 bg-red-50 text-red-700" };

  const banks = accounts.filter((a) => a.kind === "BANK");
  const mobile = accounts.filter((a) => a.kind === "MOBILE_MONEY");
  const contact = [company?.phone, company?.altPhone].filter(Boolean).join("  |  ");
  /* The building on one line, the box and the city on the next — the way the
     printed form sets it — so a narrow column never breaks "Dar es Salaam". */
  const addressLines = (company?.darAddress ?? "")
    .split(/,\s*(?=P\.?\s*O\.?\s*Box)/i)
    .map((line) => line.trim())
    .filter(Boolean);

  /* Read from settings, so the policy printed on a bill is the one the storage
     clock charges by. */
  const freeDays = company?.freeStorageDays ?? 7;
  const perDay = Number(company?.storagePerDay ?? 0);
  const storageCurrency = company?.storageCurrency ?? "USD";
  const perDayLabel = `${storageCurrency} ${perDay % 1 === 0 ? perDay : perDay.toFixed(2)}`;
  /* The storage policy has its own box on the bill; a terms line saying the
     same thing in fewer words is the same rule printed twice. */
  const shownTerms = perDay > 0 ? terms.filter((line) => !/storage fee/i.test(line)) : terms;

  const details: [string, string][] = [
    ["Invoice no", invoice.number],
    ["Issued", formatDate(invoice.issuedAt ?? invoice.createdAt)],
    ["Due", formatDate(invoice.dueAt)],
    ["Container no", container?.containerNumber ?? container?.reference ?? "—"],
    ["Tracking no", invoice.cargo.reference],
    ["Departure", formatDate(shipment?.departureDate)],
    ["Arrival", formatDate(shipment?.actualArrival ?? shipment?.eta)],
    ["Exchange rate", invoice.fxRate ? `1 USD = ${money(invoice.fxRate, 0)} TZS` : "—"],
  ];

  return (
    <article className="inv-sheet overflow-hidden rounded-xl bg-white text-neutral-900 shadow-lg ring-1 ring-black/5 print:rounded-none print:shadow-none print:ring-0">
      {/* One A4 sheet: no page margin of its own (so the browser prints no
          date or address over it), the sheet's own padding instead, and every
          block kept whole. A long bill runs on; an ordinary one fits. */}
      <style>{`
        @page { size: A4 portrait; margin: 0; }
        @media print {
          html, body { background: #fff !important; }
          .inv-sheet { width: calc(210mm / 0.8); zoom: 0.8; border-radius: 0 !important; box-shadow: none !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .inv-sheet tr, .inv-keep { break-inside: avoid; }
          .update-pill { display: none !important; }
        }
      `}</style>

      {/* ------------------------------------------------------------ masthead */}
      <header className="px-6 pt-6 sm:px-10 print:px-[10mm] print:pt-[9mm]">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <Image
              src="/brand/swift-cargo.png"
              alt={company?.name ?? "Swift Cargo"}
              width={72}
              height={72}
              className="size-14 shrink-0 object-contain sm:size-16"
              priority
            />
            <address className="min-w-0 not-italic">
              <p className="text-base font-extrabold uppercase tracking-[0.1em] text-[#0b2742] sm:text-lg">
                {company?.name ?? "Swift Cargo"}
              </p>
              <div className="text-[10.5px] leading-snug text-neutral-600">
                <p>{addressLines.join(", ")}</p>
                <p className="tnum">
                  {[company?.tin ? `TIN ${company.tin}` : null, company?.vrn ? `VRN ${company.vrn}` : null, contact, company?.email]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
            </address>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-3xl font-black uppercase leading-none tracking-tight text-[#0b2742] sm:text-4xl">Invoice</p>
            <p className="tnum mt-1 text-sm font-bold text-neutral-700">{invoice.number}</p>
            <p className={`mt-1.5 inline-flex rounded border-2 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-[0.2em] ${stamp.tone}`}>
              {stamp.label}
            </p>
          </div>
        </div>
        <div className="mt-4 flex h-1.5 overflow-hidden rounded-full">
          <span className="flex-[3] bg-[#0b2742]" />
          <span className="flex-1 bg-[#f4611f]" />
        </div>
      </header>

      {/* ------------------------------------------ who, and which sailing */}
      <section className="inv-keep grid grid-cols-1 gap-3 px-6 pt-4 sm:grid-cols-2 sm:px-10 print:grid-cols-2 print:px-[10mm]">
        <div className="rounded-xl border border-[#d6e2ee] bg-[#f5f9fc] p-4">
          <p className="text-xs font-bold uppercase tracking-widest text-[#f4611f]">Invoice to</p>
          <p className="mt-1 text-lg font-bold">{invoice.customer.businessName || invoice.customer.fullName}</p>
          {invoice.customer.businessName ? (
            <p className="text-sm text-neutral-700">{invoice.customer.fullName}</p>
          ) : null}
          <dl className="mt-2 space-y-1 text-[13px]">
            <div className="flex gap-3">
              <dt className="w-16 shrink-0 font-semibold text-neutral-500">Phone</dt>
              <dd className="tnum">{invoice.customer.phone}</dd>
            </div>
            <div className="flex gap-3">
              <dt className="w-16 shrink-0 font-semibold text-neutral-500">Address</dt>
              <dd>{invoice.customer.address || "—"}</dd>
            </div>
            <div className="flex gap-3">
              <dt className="w-16 shrink-0 font-semibold text-neutral-500">Code</dt>
              <dd className="tnum">{invoice.customer.code}</dd>
            </div>
          </dl>
        </div>
        <dl className="rounded-xl border border-[#d6e2ee] bg-[#f5f9fc] px-4 py-3 text-[13px]">
          {details.map(([label, value]) => (
            <div
              key={label}
              className="flex items-baseline justify-between gap-4 border-b border-neutral-200/70 py-1 first:pt-0 last:border-0 last:pb-0"
            >
              <dt className="font-semibold text-neutral-500">{label}</dt>
              <dd className={`tnum text-right ${label === "Invoice no" ? "font-bold text-navy-700" : "font-medium"}`}>
                {value}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      {/* ---------------------------------------------------------- charges */}
      <section className="px-6 pt-4 sm:px-10 print:px-[10mm]">
        <div className="relative overflow-x-auto rounded-lg border border-neutral-200">
          <table className="w-full min-w-[560px] border-collapse text-sm">
            <thead>
              <tr className="bg-[#0b2742] text-left text-white">
                {["Cargo · receipt", "Description", "Pkgs", "Pcs", "Chargeable", "Rate", "Amount"].map((head, i) => (
                  <th
                    key={head}
                    className={`px-3 py-2 text-[11px] font-semibold uppercase tracking-wide ${i >= 2 ? "text-right" : ""}`}
                  >
                    {head}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {invoice.items.map((item) => {
                const negative = Number(item.amount) < 0;
                /* Freight lines are written "GOODS — CATEGORY"; the category
                   is shown as what it is rather than as half a name. */
                const [goods, category] = item.description.split(" — ");
                const freight = item.unit === "CBM" || item.unit === "kg";
                return (
                  <tr key={item.id} className="border-t border-neutral-200 align-top even:bg-neutral-50/70">
                    <td className="tnum px-3 py-2">
                      {freight ? <span className="block font-semibold">{invoice.cargo.reference}</span> : null}
                      <span className="text-xs text-neutral-500">{item.paperReceiptNo ? `Rct ${item.paperReceiptNo}` : freight ? "Rct —" : ""}</span>
                    </td>
                    <td className="px-3 py-2">
                      <span className="font-semibold uppercase">{goods}</span>
                      {category || item.category ? (
                        <span className="block text-xs text-neutral-500">
                          {category ?? item.category}
                          {freight && invoice.cargo.shippingMark ? ` · Mark ${invoice.cargo.shippingMark}` : ""}
                        </span>
                      ) : null}
                    </td>
                    <td className="tnum px-3 py-2 text-right">{item.packages ?? "—"}</td>
                    <td className="tnum px-3 py-2 text-right">{item.pieces ?? "—"}</td>
                    <td className="tnum px-3 py-2 text-right">
                      {money(item.quantity, item.unit === "kg" ? 2 : item.unit === "CBM" ? 3 : 0)} {item.unit ?? ""}
                    </td>
                    <td className="tnum px-3 py-2 text-right">
                      {money(item.unitPrice)}
                      {item.unit ? <span className="text-neutral-500"> / {item.unit}</span> : null}
                    </td>
                    <td className={`tnum px-3 py-2 text-right font-semibold ${negative ? "text-emerald-700" : ""}`}>
                      {money(item.amount)} {invoice.currency}
                    </td>
                  </tr>
                );
              })}
              {/* What the freight lines add up to, so the customer sees the
                  cargo the bill is for before the money. */}
              {(() => {
                const freight = invoice.items.filter((i) => i.unit === "CBM");
                if (freight.length < 1) return null;
                const cbm = freight.reduce((sum, i) => sum + Number(i.quantity), 0);
                const pkgs = freight.reduce((sum, i) => sum + (i.packages ?? 0), 0);
                const pcs = freight.reduce((sum, i) => sum + (i.pieces ?? 0), 0);
                return (
                  <tr className="border-t-2 border-navy-700 bg-navy-700/5 font-semibold">
                    <td className="px-3 py-2 text-xs uppercase tracking-wide" colSpan={2}>
                      Cargo total · {freight.length} line{freight.length === 1 ? "" : "s"}
                    </td>
                    <td className="tnum px-3 py-2 text-right">{pkgs || "—"}</td>
                    <td className="tnum px-3 py-2 text-right">{pcs || "—"}</td>
                    <td className="tnum px-3 py-2 text-right">{money(cbm, 3)} CBM</td>
                    <td colSpan={2} />
                  </tr>
                );
              })()}
            </tbody>
          </table>
        </div>
        {invoice.notes ? (
          <p className="mt-3 rounded-lg border-l-4 border-navy-700 bg-neutral-50 px-4 py-2.5 text-sm text-neutral-700">
            {invoice.notes}
          </p>
        ) : null}
      </section>

      {/* --------------------------------------------- how to pay, and totals */}
      <section className="inv-keep grid grid-cols-1 gap-4 px-6 py-5 sm:grid-cols-[1fr_minmax(0,290px)] sm:px-10 print:grid-cols-[1fr_270px] print:px-[10mm] print:py-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-neutral-500">Payment info</p>
          <div className="mt-2 space-y-3 rounded-lg bg-neutral-50 p-4">
            {banks.length > 0 ? (
              <div className="grid grid-cols-1 gap-x-5 gap-y-3 sm:grid-cols-2">
                {banks.map((bank) => (
                  <div key={`${bank.bankName}-${bank.accountNumber}`} className="text-[12px] leading-relaxed">
                    <p className="tnum text-sm font-bold">{bank.accountNumber}</p>
                    <p className="uppercase text-neutral-700">{bank.accountName}</p>
                    <p className="font-semibold uppercase text-navy-700">
                      {bank.bankName} ({bank.currency})
                    </p>
                    {bank.branch ? <p className="uppercase text-neutral-500">Branch: {bank.branch}</p> : null}
                  </div>
                ))}
              </div>
            ) : null}
            {mobile.length > 0 ? (
              <div className="grid grid-cols-1 gap-x-6 gap-y-3 border-t border-neutral-200 pt-4 sm:grid-cols-2">
                {mobile.map((line) => (
                  <div key={`${line.bankName}-${line.accountNumber}`} className="text-[12px] leading-relaxed">
                    <p className="font-semibold uppercase text-navy-700">{line.bankName}</p>
                    <p className="tnum text-sm font-bold">{line.accountNumber}</p>
                    <p className="uppercase text-neutral-700">{line.accountName}</p>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        <div className="self-start overflow-hidden rounded-lg text-sm">
          <div className="flex justify-between bg-neutral-100 px-4 py-2 font-semibold uppercase">
            <span>Sub total</span>
            <span className="tnum">
              {money(invoice.subtotal)} {invoice.currency}
            </span>
          </div>
          <div className="bg-navy-700 text-white">
            <div className="flex justify-between px-4 py-2">
              <span className="uppercase">VAT ({vatPercent % 1 === 0 ? vatPercent : vatPercent.toFixed(2)}%)</span>
              <span className="tnum">
                {money(invoice.vatAmount)} {invoice.currency}
              </span>
            </div>
            <div className="flex justify-between border-t border-white/15 px-4 py-2 text-base font-bold">
              <span className="uppercase">Total</span>
              <span className="tnum">
                {money(invoice.total)} {invoice.currency}
              </span>
            </div>
            {invoice.totalTzs ? (
              <div className="flex justify-between border-t border-white/15 px-4 py-2 font-semibold">
                <span className="uppercase">Total</span>
                <span className="tnum">{money(invoice.totalTzs, 0)} TZS</span>
              </div>
            ) : null}
            {live && paidSomething ? (
              <div className="flex justify-between border-t border-white/15 px-4 py-2 text-white/85">
                <span className="uppercase">Paid</span>
                <span className="tnum">
                  {balance.paidTzs !== null ? `${money(balance.paidTzs, 0)} TZS` : `${money(balance.paid)} ${invoice.currency}`}
                </span>
              </div>
            ) : null}
          </div>
          {live ? (
            <div className={`px-4 py-3 text-white ${balance.settled ? "bg-emerald-600" : "bg-navy-900"}`}>
              <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-white/70">
                {balance.settled ? "Paid in full" : "Amount due"}
              </p>
              <p className="tnum mt-0.5 text-xl font-black">
                {inTzs
                  ? formatCurrency(balance.outstandingTzs, "TZS")
                  : formatCurrency(balance.outstanding, invoice.currency)}
              </p>
              {inTzs ? (
                <p className="tnum mt-0.5 text-xs text-white/75">
                  {formatCurrency(balance.outstanding, "USD")} · {formatRate(balance.rate)}
                </p>
              ) : null}
              {balance.creditTzs && balance.creditTzs.greaterThan(0) ? (
                <p className="tnum mt-0.5 text-xs text-white/75">In credit {formatCurrency(balance.creditTzs, "TZS")}</p>
              ) : null}
            </div>
          ) : null}
          {/* The invoice's own code — scanned, it shows that Swift Cargo
              issued this bill and whether it is paid. Never a cargo code. */}
          {verifyQr ? (
            <div className="mt-2 flex items-center gap-3 rounded-lg border border-neutral-200 bg-white p-2.5">
              <Image src={verifyQr} alt="" width={180} height={180} unoptimized className="size-[76px] shrink-0" />
              <div className="text-[11px] leading-snug text-neutral-600">
                <p className="font-bold uppercase tracking-wide text-navy-700">Scan to verify</p>
                <p className="mt-0.5">Confirms this invoice was issued by Swift Cargo and shows whether it is paid.</p>
              </div>
            </div>
          ) : null}
        </div>
      </section>

      {/* ----------------------------------------------- terms, storage, foot */}
      <footer className="inv-keep space-y-3 border-t border-neutral-200 bg-neutral-50 px-6 py-4 sm:px-10 print:px-[10mm] print:py-3">
        {shownTerms.length > 0 ? (
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-neutral-600">Terms &amp; conditions</p>
            <ol className="mt-1.5 list-decimal space-y-0.5 pl-5 text-[11px] leading-snug text-neutral-700">
              {shownTerms.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ol>
          </div>
        ) : null}

        {perDay > 0 ? (
          <div className="rounded-lg border border-red-200 bg-white px-4 py-3">
            <p className="text-xs font-bold uppercase tracking-widest text-neutral-500">Storage policy</p>
            <div className="mt-1.5 grid grid-cols-1 gap-3 text-[11px] leading-snug text-red-700 sm:grid-cols-2 print:grid-cols-2">
              <div>
                <p className="font-bold uppercase">Sera ya uhifadhi wa mizigo</p>
                <p className="mt-1">
                  Kutokana na wingi wa mizigo katika ghala letu, mzigo wako utahifadhiwa bure kwa siku {freeDays}{" "}
                  kuanzia siku utakapofika Dar es Salaam. Baada ya siku {freeDays}, utatozwa {perDayLabel} kwa siku
                  (Storage Fee). Tafadhali chukua mzigo wako mapema ili kuepuka gharama za ziada.
                </p>
              </div>
              <div>
                <p className="font-bold uppercase">Warehouse storage policy</p>
                <p className="mt-1">
                  Due to the high volume of cargo in our warehouse, your cargo is stored free of charge for {freeDays}{" "}
                  days from the day it arrives in Dar es Salaam. After {freeDays} days, a storage fee of {perDayLabel}{" "}
                  per day applies. Please collect your cargo early to avoid additional storage fees.
                </p>
              </div>
            </div>
          </div>
        ) : null}

        <div className="flex flex-wrap items-end justify-between gap-3 border-t border-neutral-200 pt-3 text-[11px]">
          <div>
            <p className="font-bold text-navy-700">{company?.name ?? "Swift Cargo"}</p>
            <p className="font-semibold uppercase tracking-widest text-orange-600">{company?.tagline ?? "On time, Every time"}</p>
          </div>
          {invoice.issuedAt ? (
            <p className="w-full text-neutral-500">
              Issued by {invoice.issuedBy?.name ?? "Swift Cargo"} · {formatDateTime(invoice.issuedAt)}
            </p>
          ) : null}
        </div>
      </footer>
    </article>
  );
}
