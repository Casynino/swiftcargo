import Image from "next/image";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { PrintButton } from "@/components/app/print-button";
import { formatDate } from "@/lib/format";
import { balanceOf, outstandingOf } from "@/lib/invoice-balance";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { SmartBack } from "@/components/app/smart-back";

import { primeLocale } from "@/lib/server-t";
/* The filename is the title, so the saved PDF is already named for the person. */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ customerId: string }>;
}): Promise<Metadata> {
  const { customerId } = await params;
  const c = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { fullName: true, businessName: true },
  });
  return {
    title: { absolute: `Combined bill - ${c?.businessName || c?.fullName || "Customer"}` },
  };
}

const n = (v: number, dp: number) =>
  v.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp });

/**
 * THE BILL FOR ALL OF IT, TO SEND BEFORE THEY PAY.
 *
 * Four consignments is four invoices, and sending four asks four questions when
 * the customer has one: how much do I send? This covering statement answers it
 * — every open bill, each at the rate frozen onto it, one total in each
 * currency. Nothing is merged: every consignment keeps its own invoice.
 */
export default async function CombinedBillPage({
  params,
}: {
  params: Promise<{ customerId: string }>;
}) {
  await primeLocale();
  await requirePermission("finance.view");
  const { customerId } = await params;

  const [customer, company, banks] = await Promise.all([
    prisma.customer.findUnique({
      where: { id: customerId },
      include: {
        invoices: {
          where: { status: { in: ["ISSUED", "PARTIALLY_PAID", "OVERDUE"] } },
          orderBy: { issuedAt: "asc" },
          include: {
            payments: true,
            cargo: {
              select: {
                reference: true,
                description: true,
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
    prisma.companySetting.findUnique({ where: { id: "singleton" } }),
    prisma.bankAccount.findMany({
      where: { active: true, kind: { not: "CASH" } },
      orderBy: [{ sortOrder: "asc" }],
    }),
  ]);
  if (!customer) notFound();

  /* Each bill's own balance, in its own shillings — the same figures its
     invoice and the payment desk show, not a fresh multiplication. */
  const lines = customer.invoices
    .map((i) => {
      const b = balanceOf(i);
      const usd = Number(outstandingOf(i));
      const rate = Number(i.fxRate) > 1 ? Number(i.fxRate) : null;
      return { i, usd, rate, tzs: b.outstandingTzs ? Number(b.outstandingTzs) : rate ? Math.round(usd * rate) : null };
    })
    .filter((l) => l.usd > 0.005);

  const totalUsd = lines.reduce((s, l) => s + l.usd, 0);
  const totalTzs = lines.reduce((s, l) => s + (l.tzs ?? 0), 0);
  const name = customer.businessName || customer.fullName;
  const label = "text-[8px] font-bold uppercase tracking-[0.18em] text-neutral-500";

  return (
    <div className="mx-auto max-w-[820px] space-y-6 print:max-w-none print:space-y-0">
      <style>{`
        @page { size: A4 portrait; margin: 0; }
        @media print {
          html, body { background: #fff !important; }
          .cb-sheet { width: 210mm; min-height: 297mm; padding: 12mm; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .update-pill { display: none !important; }
        }
      `}</style>

      <div className="flex items-center justify-between print:hidden">
        <SmartBack fallbackHref={`/app/finance/payments/new/${customer.id}`} fallbackLabel={`${name}`} />
        <PrintButton label="Download / print" />
      </div>

      <article className="cb-sheet mx-auto overflow-hidden bg-white text-[#0b1b2b] shadow-raised ring-1 ring-black/5 print:shadow-none print:ring-0">
        {/* ------------------------------------------------------ Letterhead */}
        <header className="relative overflow-hidden bg-[#0b2742] px-8 py-6 text-white print:rounded-xl">
          <div
            aria-hidden
            className="absolute inset-0 bg-[radial-gradient(ellipse_at_90%_-20%,rgba(79,201,240,0.35),transparent_60%),radial-gradient(ellipse_at_0%_130%,rgba(244,97,31,0.35),transparent_55%)]"
          />
          <div className="relative flex items-center justify-between gap-6">
            <div className="flex items-center gap-3">
              <span className="grid size-14 place-items-center rounded-2xl bg-white p-1">
                <Image src="/brand/swift-cargo.png" alt="" width={52} height={52} className="object-contain" />
              </span>
              <div>
                <p className="text-xl font-extrabold uppercase tracking-[0.12em]">{company?.name ?? "Swift Cargo"}</p>
                <p className="text-[9px] font-semibold uppercase tracking-[0.22em] text-[#ffb27d]">
                  {company?.tagline ?? "On time, every time"}
                </p>
                <p className="mt-1 max-w-sm text-[10px] leading-snug text-white/75">
                  {company?.darAddress ?? "Dar es Salaam"}
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-[#9fd8f5]">Combined bill</p>
              <p className="text-[9px] uppercase tracking-[0.2em] text-white/60">Bill ya pamoja</p>
              <p className="tnum mt-1 text-2xl font-extrabold tracking-tight">{lines.length} consignments</p>
              <p className="text-[10px] text-white/70">{formatDate(new Date())}</p>
            </div>
          </div>
          <div className="relative mt-5 h-1 rounded-full bg-gradient-to-r from-[#f4611f] via-[#ffb27d] to-[#4fc9f0]" />
        </header>

        <div className="px-8 py-6">
          {/* ------------------------------------------ Who, and what to pay */}
          <section className="grid grid-cols-[1fr_auto] items-stretch gap-6">
            <div className="rounded-2xl border border-[#d6e2ee] bg-[#f5f9fc] p-5">
              <p className={label}>Bill to · Mteja</p>
              <p className="mt-1 text-2xl font-extrabold uppercase leading-tight">{name}</p>
              <p className="tnum text-sm text-neutral-600">
                {customer.code}
                {customer.phone ? ` · ${customer.phone}` : ""}
              </p>
              <p className="mt-3 text-[11px] leading-snug text-neutral-600">
                Every open bill, each at the exchange rate fixed on it. Pay the total in one transfer.
              </p>
            </div>
            <div className="flex w-[66mm] flex-col justify-center rounded-2xl bg-[#0b2742] p-5 text-white">
              <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-[#9fd8f5]">Total to pay · Jumla</p>
              <p className="tnum mt-1 whitespace-nowrap text-2xl font-extrabold tracking-tight">TZS {n(totalTzs, 0)}</p>
              <p className="tnum mt-0.5 text-sm text-white/75">≈ USD {n(totalUsd, 2)}</p>
            </div>
          </section>

          {/* ------------------------------------------------ The bills */}
          <section className="mt-5 overflow-hidden rounded-2xl border border-[#d6e2ee]">
            <table className="w-full text-[11px]">
              <thead className="bg-[#0b2742] text-white">
                <tr className="text-[8px] uppercase tracking-[0.16em]">
                  <th className="px-3 py-2 text-left font-bold">Tracking</th>
                  <th className="px-3 py-2 text-left font-bold">Goods</th>
                  <th className="px-3 py-2 text-left font-bold">Container</th>
                  <th className="px-3 py-2 text-left font-bold">Invoice</th>
                  <th className="px-3 py-2 text-right font-bold">Rate</th>
                  <th className="px-3 py-2 text-right font-bold">USD</th>
                  <th className="px-3 py-2 text-right font-bold">TZS</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l, idx) => (
                  <tr key={l.i.id} className={idx % 2 ? "bg-[#f5f9fc]" : ""}>
                    <td className="tnum px-3 py-2 font-bold">{l.i.cargo.reference}</td>
                    <td className="max-w-[120px] truncate px-3 py-2">{l.i.cargo.description}</td>
                    <td className="tnum px-3 py-2 text-neutral-600">
                      {l.i.cargo.containerLines[0]?.container.reference ?? "—"}
                    </td>
                    <td className="tnum px-3 py-2 text-neutral-600">{l.i.number}</td>
                    <td className="tnum px-3 py-2 text-right text-neutral-600">{l.rate ? n(l.rate, 0) : "—"}</td>
                    <td className="tnum px-3 py-2 text-right">{n(l.usd, 2)}</td>
                    <td className="tnum px-3 py-2 text-right font-semibold">{l.tzs !== null ? n(l.tzs, 0) : "—"}</td>
                  </tr>
                ))}
                <tr className="border-t-2 border-[#0b2742] font-extrabold">
                  <td colSpan={5} className="px-3 py-2 uppercase tracking-wide">
                    Total · {lines.length} consignments
                  </td>
                  <td className="tnum px-3 py-2 text-right">USD {n(totalUsd, 2)}</td>
                  <td className="tnum px-3 py-2 text-right">TZS {n(totalTzs, 0)}</td>
                </tr>
              </tbody>
            </table>
          </section>

          {/* ------------------------------------------------ Where to pay */}
          {banks.length > 0 ? (
            <section className="mt-5">
              <p className="text-sm font-extrabold uppercase tracking-wide">Pay into · Lipa kupitia</p>
              <div className="mt-2 grid grid-cols-2 gap-2.5">
                {banks.map((b) => (
                  <div key={b.id} className="rounded-xl border border-[#d6e2ee] px-4 py-2.5">
                    <p className="flex items-center justify-between gap-2 text-[11px] font-extrabold uppercase">
                      <span>{b.bankName}</span>
                      <span className="rounded-full bg-[#0b2742] px-2 py-0.5 text-[8px] tracking-[0.14em] text-white">{b.currency}</span>
                    </p>
                    <p className="text-[10px] text-neutral-500">{b.accountName}</p>
                    <p className="tnum text-base font-bold tracking-wide">{b.accountNumber}</p>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {/* --------------------------------------------- The terms */}
          <section className="mt-5 grid grid-cols-2 gap-4 text-[10.5px] leading-relaxed">
            <div className="rounded-2xl bg-[#f5f9fc] p-4">
              <p className="font-extrabold uppercase tracking-wide text-[#0b2742]">One payment, every bill</p>
              <p className="mt-1 text-neutral-600">
                Each bill is at the exchange rate fixed on it when it was issued. Send the total in one transfer and
                share the proof with us; every consignment keeps its own invoice and pickup note.
              </p>
            </div>
            <div className="rounded-2xl bg-[#fff2ea] p-4">
              <p className="font-extrabold uppercase tracking-wide text-[#b3440f]">Malipo moja, bili zote</p>
              <p className="mt-1 text-neutral-700">
                Kila bili iko kwenye exchange rate iliyowekwa ilipotolewa. Tuma jumla kwa muamala mmoja na
                utume uthibitisho; kila mzigo unabaki na bili na pickup note yake.
              </p>
            </div>
          </section>

          {/* How to reach us, set out at the foot where a customer looks for it. */}
          <footer className="mt-6 grid grid-cols-[1fr_auto] items-end gap-4 border-t border-[#d6e2ee] pt-3 text-[9.5px] leading-relaxed text-neutral-600">
            <div>
              <p className="font-bold uppercase tracking-[0.16em] text-[#0b2742]">Contact us · Wasiliana nasi</p>
              {company?.darAddress ? <p>{company.darAddress}</p> : null}
              <p className="tnum">
                {[company?.phone, company?.altPhone].filter(Boolean).join("  ·  ")}
                {company?.email ? `  ·  ${company.email}` : ""}
              </p>
            </div>
            <span className="font-bold uppercase tracking-[0.2em] text-[#0b2742]">{company?.name ?? "Swift Cargo"}</span>
          </footer>
        </div>
      </article>
    </div>
  );
}
