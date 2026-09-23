import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";

import { PrintButton } from "@/components/app/print-button";
import { ReportTableView } from "@/components/app/report-table";
import {
  byCategory,
  byCustomer,
  figures,
  loadBooks,
  sum,
  monthRange,
  type Money,
} from "@/lib/finance-report";
import { buildReport } from "@/lib/report-tables";
import { requirePermission } from "@/lib/session";
import { SmartBack } from "@/components/app/smart-back";

import { primeLocale, T } from "@/lib/server-t";
import { darFields } from "@/lib/dar-time";
import { Tx } from "@/components/app/tx";
function readMonth(v?: string) {
  const now = new Date();
  const m = v && /^(\d{4})-(\d{2})$/.exec(v);
  const here = darFields(now);
  return m ? monthRange(Number(m[1]), Number(m[2]) - 1) : monthRange(here.year, here.month);
}

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}): Promise<Metadata> {
  const r = readMonth((await searchParams).month);
  return { title: { absolute: `Swift Cargo - Financial statement - ${r.label}` } };
}

/**
 * THE WHOLE SET OF BOOKS, AS ONE DOCUMENT.
 *
 * What the owner signs. Every section is the same figure the profit & loss page
 * shows for that month, from the same load — a statement that disagreed with
 * the screen it was printed from would be worthless in the one meeting it is
 * for.
 */
export default async function StatementPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; cur?: string }>;
}) {
  await primeLocale();
  await requirePermission("profit.view");
  const sp = await searchParams;
  const range = readMonth(sp.month);
  const cur = sp.cur === "USD" ? "USD" : "TZS";
  const books = await loadBooks();
  const f = figures(books, range);

  const fmt = (n: number) =>
    n.toLocaleString("en-US", {
      minimumFractionDigits: cur === "USD" ? 2 : 0,
      maximumFractionDigits: cur === "USD" ? 2 : 0,
    });
  const v = (m: Money) => fmt(cur === "TZS" ? m.tzs : m.usd);

  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <section className="mt-8 break-inside-avoid">
      <h2 className="mb-2 border-b border-black pb-1 text-sm font-bold uppercase tracking-wider">{title}</h2>
      {children}
    </section>
  );
  const Line = ({ l, m, bold }: { l: string; m: Money | string; bold?: boolean }) => (
    <div className={`flex justify-between py-1 text-sm ${bold ? "border-t border-black font-bold" : ""}`}>
      <span>{l}</span>
      <span className="tabular-nums">{typeof m === "string" ? m : v(m)}</span>
    </div>
  );

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="flex items-center justify-between print:hidden">
        <SmartBack fallbackHref="/app/finance/reports" fallbackLabel={T("Profit & loss")} />
        <PrintButton label={T("Download PDF / print")} />
      </div>

      <article className="rounded-lg border bg-white p-10 text-black print:border-0 print:p-0">
        <header className="flex items-start justify-between gap-6 border-b-2 border-black pb-5">
          <div className="flex items-center gap-3">
            <Image src="/brand/swift-cargo.png" alt="" width={56} height={56} className="object-contain" />
            <div>
              <p className="text-xl font-bold uppercase tracking-wider">{T("Swift Cargo")}</p>
              <p className="text-xs text-neutral-600">{T("Guangzhou → Dar es Salaam")}</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-lg font-bold uppercase tracking-wider">{T("Financial statement")}</p>
            <p className="text-sm"><Tx>{range.label}</Tx></p>
            <p className="text-xs text-neutral-600">
              In {cur === "TZS" ? "Tanzanian shillings" : "US dollars"}
              {books.today ? ` · USD 1 = TZS ${books.today.toLocaleString()}` : ""}
            </p>
          </div>
        </header>

        <Section title="1. Profit and loss (accrual)">
          <Line l="Revenue billed" m={f.revenue} />
          <Line l="Less: container costs incurred" m={sum(f.costs.filter((c) => c.scope === "CONTAINER"), (c) => c.amount)} />
          <Line l="Less: office, special and executive costs" m={sum(f.costs.filter((c) => c.scope !== "CONTAINER"), (c) => c.amount)} />
          <Line l="Net profit" m={f.profit} bold />
          <Line l="Profit margin" m={f.margin === null ? "—" : `${f.margin.toFixed(1)}%`} />
        </Section>

        <Section title="2. Cash">
          <Line l="Collected from customers (verified)" m={f.collected} />
          <Line l="Paid out for costs" m={f.paidOut} />
          <Line l="Net cash" m={f.netCash} bold />
        </Section>

        <Section title="3. Where revenue came from">
          {byCustomer(f.bills).map((c) => (
            <Line key={c.name} l={`${c.name}${c.owed.usd > 0.005 ? ` (owes ${v(c.owed)})` : ""}`} m={c.billed} />
          ))}
          <Line l="Total billed" m={f.revenue} bold />
        </Section>

        <Section title="4. Where money was spent">
          {byCategory(f.costs).map((c) => (
            <Line key={c.name} l={c.name} m={c.amount} />
          ))}
          <Line l="Total costs" m={f.expenses} bold />
        </Section>

        <Section title="5. Every container">
          <ReportTableView table={buildReport("container-profitability", books, range, cur)} cur={cur} printable />
        </Section>

        <Section title="6. Position today">
          <ReportTableView table={buildReport("position-summary", books, range, cur)} cur={cur} printable />
        </Section>

        <Section title="7. Collections and volume">
          <Line l="Collection rate on the month's bills" m={f.collectionRate === null ? "—" : `${f.collectionRate.toFixed(1)}%`} />
          <Line l="Bills paid / unpaid / part paid / to verify" m={`${f.counts.paid} / ${f.counts.unpaid} / ${f.counts.partPaid} / ${f.counts.toVerify}`} />
          <Line l="CBM received in Guangzhou" m={`${f.cbmReceived.toFixed(3)} CBM`} />
          <Line l="CBM landed in Dar" m={`${f.cbmLanded.toFixed(3)} CBM`} />
          <Line l="Packages received" m={String(f.packages)} />
          <Line l="Customers billed" m={String(f.customers)} />
          <Line l="Containers arrived / closed" m={`${f.arrived} / ${f.closed}`} />
        </Section>

        <section className="mt-12 grid grid-cols-2 gap-10 break-inside-avoid text-sm">
          {["Prepared by (Finance)", "Approved by"].map((who) => (
            <div key={who}>
              <div className="h-12 border-b border-black" />
              <p className="mt-1">{who}</p>
              <p className="mt-4 text-xs text-neutral-600">Date: ____________________</p>
            </div>
          ))}
        </section>

        <p className="mt-8 text-[11px] text-neutral-500">
          Derived from the operational record on {new Date().toLocaleString("en-GB")}. Every figure is added up from bills, verified payments, container costs and account registers — there is no separate set of books.
        </p>
      </article>
    </div>
  );
}
