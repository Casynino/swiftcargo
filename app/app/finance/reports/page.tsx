import Link from "next/link";
import type { Metadata } from "next";
import { Download, FileText, Ship, TrendingDown, TrendingUp } from "lucide-react";

import { FinanceTabs } from "@/components/app/finance-tabs";
import { PageHeader } from "@/components/app/page-header";
import { ReportTableView } from "@/components/app/report-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import {
  byCategory,
  byCustomer,
  figures,
  loadBooks,
  monthRange,
  PERIODS,
  sum,
  twelveMonths,
  type Money,
} from "@/lib/finance-report";
import { formatDate } from "@/lib/format";
import { readReportParams } from "@/lib/report-params";
import { buildReport, REPORTS } from "@/lib/report-tables";
import { requirePermission } from "@/lib/session";
import { cn } from "@/lib/utils";

import { primeLocale, T } from "@/lib/server-t";
export const metadata: Metadata = { title: "Profit & loss" };

/**
 * PROFIT & LOSS — REVENUE AGAINST COSTS, FOR A PERIOD AND FOR A SAILING.
 *
 * Every figure is derived from the operational record; there is no separate
 * set of books. Two questions are kept apart on purpose: did the work make
 * money (bills raised against costs incurred, whether or not anybody has paid)
 * and did the money move (what customers actually paid against what actually
 * left an account). A month can make a fine profit and still not cover payroll,
 * and a screen that blends the two hides exactly that.
 */
export default async function ProfitAndLossPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await primeLocale();
  await requirePermission("profit.view");
  const sp = await searchParams;
  const p = readReportParams(sp);
  const books = await loadBooks();

  const now = figures(books, p.current);
  const before = figures(books, p.previous);
  const thisMonth = monthRange(new Date().getFullYear(), new Date().getMonth());
  const lastMonth = monthRange(new Date().getFullYear(), new Date().getMonth() - 1);
  const month = figures(books, thisMonth);
  const monthBefore = figures(books, lastMonth);
  const months = twelveMonths(books);

  const cur = p.cur;
  const other = cur === "TZS" ? "USD" : "TZS";
  const fmt = (n: number, c: "TZS" | "USD" = cur) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: c,
      minimumFractionDigits: c === "TZS" ? 0 : 2,
      maximumFractionDigits: c === "TZS" ? 0 : 2,
    }).format(n);
  const lead = (m: Money) => fmt(cur === "TZS" ? m.tzs : m.usd);
  const beside = (m: Money) => fmt(other === "TZS" ? m.tzs : m.usd, other);
  const val = (m: Money) => (cur === "TZS" ? m.tzs : m.usd);
  const pct = (n: number | null) => (n === null ? "—" : `${n.toFixed(1)}%`);

  /* "new" when there is nothing before to compare with — a percentage rise
     from zero is infinity, and printing one would be a lie with a number on. */
  const versus = (a: Money, b: Money) => {
    if (Math.abs(b.usd) < 0.005) return a.usd !== 0 ? `new ${p.current.label}` : "nothing either period";
    const change = ((a.usd - b.usd) / Math.abs(b.usd)) * 100;
    return `${change >= 0 ? "+" : ""}${change.toFixed(0)}% on ${p.previous.label}`;
  };

  const link = (over: Record<string, string>) => {
    const q = new URLSearchParams(
      Object.entries({ ...sp, ...over }).filter(([, v]) => v) as [string, string][]
    );
    return `/app/finance/reports?${q.toString()}`;
  };

  const creditOwed = sum(books.bills.filter((b) => b.credit), (b) => b.owing);
  const creditOverdue = sum(
    books.bills.filter((b) => b.credit && b.dueAt && b.dueAt < new Date()),
    (b) => b.owing
  );
  const receivable = sum(books.bills, (b) => b.owing);

  const cats = byCategory(now.costs);
  const catTotal = val(now.expenses);
  const customers = byCustomer(now.bills);

  const sailings = [...books.boxes]
    .filter((c) => c.departed || c.arrived)
    .sort((a, b) => (b.departed ?? b.arrived ?? new Date(0)).getTime() - (a.departed ?? a.arrived ?? new Date(0)).getTime());
  const billedBoxes = books.boxes.filter((c) => c.billed.usd > 0);
  const best = [...billedBoxes].sort((a, b) => b.profit.usd - a.profit.usd)[0];
  const worst = [...billedBoxes].sort((a, b) => a.profit.usd - b.profit.usd)[0];
  const mostOwed = [...billedBoxes].sort((a, b) => b.owed.usd - a.owed.usd)[0];
  const biggest = [...books.boxes].sort((a, b) => b.cbm - a.cbm)[0];

  const inCur = (bal: number, currency: string) =>
    currency === cur ? bal : cur === "TZS" ? bal * books.today : books.today ? bal / books.today : 0;

  const table = buildReport(p.report, books, p.reportRange, cur, p.container);
  const exportQuery = new URLSearchParams(
    Object.entries({ ...sp, period: p.period, cur, report: p.report }).filter(([, v]) => v) as [string, string][]
  ).toString();

  const maxMoney = Math.max(1, ...months.map((m) => Math.max(val(m.in), val(m.out))));
  const maxCbm = Math.max(0.001, ...months.map((m) => m.cbm));

  const cell = "min-w-0 break-words bg-card px-4 py-4";
  const label = "text-[11px] font-semibold uppercase tracking-widest text-muted-foreground";

  return (
    <div className="space-y-6">
      <PageHeader
        title={T("Profit & loss")}
        description={T("Revenue against costs, for a period and for a sailing. Every figure is derived from the operational record — there is no separate set of books.")}
      />
      <FinanceTabs />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {(Object.keys(PERIODS) as (keyof typeof PERIODS)[]).map((key) => (
            <Link
              key={key}
              href={link({ period: key })}
              className={cn(
                "rounded-full border px-3 py-1 text-sm transition-colors",
                p.period === key ? "border-brand bg-brand text-brand-foreground" : "bg-card hover:bg-secondary"
              )}
            >
              {PERIODS[key]}
            </Link>
          ))}
        </div>
        <div className="inline-flex overflow-hidden rounded-full border">
          {(["TZS", "USD"] as const).map((c) => (
            <Link
              key={c}
              href={link({ cur: c })}
              className={cn("px-3 py-1 text-sm", cur === c ? "bg-brand text-brand-foreground" : "hover:bg-secondary")}
            >
              {c}
            </Link>
          ))}
        </div>
      </div>
      <p className="-mt-3 text-xs text-muted-foreground">
        Reading in {cur === "TZS" ? "shillings" : "dollars"} · {p.current.label}
        {books.today ? ` · USD 1 = TZS ${books.today.toLocaleString()}` : ""}
        {books.rateSince ? ` · in force since ${formatDate(books.rateSince)}` : ""}
      </p>

      {/* SIX HEADLINE FIGURES */}
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-3 xl:grid-cols-6">
        {[
          { l: "Revenue", m: now.revenue, prev: before.revenue, tone: "" },
          { l: "Total expenses", m: now.expenses, prev: before.expenses, tone: "text-destructive" },
          { l: "Net profit", m: now.profit, prev: before.profit, tone: now.profit.usd >= 0 ? "text-success" : "text-destructive" },
          null,
          { l: "Collected", m: now.collected, prev: before.collected, tone: "text-success" },
          { l: "Paid out", m: now.paidOut, prev: before.paidOut, tone: "text-destructive" },
        ].map((c, i) =>
          c === null ? (
            <div key={i} className={cell}>
              <p className={label}>{T("Profit margin")}</p>
              <p className="tnum mt-1 text-xl font-semibold">{pct(now.margin)}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {before.margin === null ? "no margin to compare" : `${pct(before.margin)} in ${p.previous.label}`}
              </p>
            </div>
          ) : (
            <div key={i} className={cell}>
              <p className={label}>{c.l}</p>
              <p className={cn("tnum mt-1 text-lg font-semibold sm:text-xl", c.tone)}>{lead(c.m)}</p>
              <p className="tnum text-xs text-muted-foreground">{beside(c.m)}</p>
              <p className="mt-1 text-xs text-muted-foreground">{versus(c.m, c.prev)}</p>
            </div>
          )
        )}
      </div>

      <div className="space-y-2">
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-3 xl:grid-cols-6">
          {[
            ["Cash revenue", now.cashRevenue, ""],
            ["Credit revenue", now.creditRevenue, "text-brand"],
            ["Outstanding receivables", receivable, "text-destructive"],
            ["Credit still owed", creditOwed, "text-brand"],
            ["Overdue credit", creditOverdue, "text-destructive"],
            ["Written off", now.writtenOff, "text-warning"],
          ].map(([l, m, tone]) => (
            <div key={l as string} className="bg-card px-4 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">{l as string}</p>
              <p className={cn("tnum mt-0.5 text-sm font-semibold", tone as string)}>{lead(m as Money)}</p>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          Credit revenue is inside Revenue above, because the sale happened. It is not in Collected, and none of it is in the bank. Written off is discounts given on the period&rsquo;s bills.
        </p>
      </div>

      {/* THE HEADLINE, SAID AS A SENTENCE */}
      <div className="rounded-xl border border-success/30 bg-success/[0.05] px-6 py-5">
        <p className="text-sm text-muted-foreground">{p.current.label}</p>
        <p className="mt-1 flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <span className={cn("tnum text-4xl font-bold", now.profit.usd < 0 && "text-destructive")}>{lead(now.profit)}</span>
          {now.margin !== null ? (
            <span className={cn("inline-flex items-center gap-1 text-sm", now.profit.usd >= 0 ? "text-success" : "text-destructive")}>
              {now.profit.usd >= 0 ? <TrendingUp className="size-4" /> : <TrendingDown className="size-4" />}
              {pct(now.margin)} margin
            </span>
          ) : null}
          <span className="tnum text-sm text-muted-foreground">{beside(now.profit)}</span>
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          {lead(now.revenue)} billed on {now.bills.length} confirmed invoice{now.bills.length === 1 ? "" : "s"}, less {lead(now.expenses)} of costs incurred. Counted from the day the work happened, not the day the money moved.
        </p>
      </div>

      {/* ACCRUAL AGAINST CASH */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {[
          {
            title: "Did the work make money",
            note: "Accrual — bills raised and costs incurred in this period, whether or not anyone has paid yet.",
            lines: [["Revenue billed", now.revenue], ["Costs incurred", now.expenses]] as [string, Money][],
            total: ["Profit", now.profit] as [string, Money],
          },
          {
            title: "Did the money move",
            note: "Cash — what customers actually paid and what actually left an account. This is the one that decides whether you can make payroll.",
            lines: [["Collected", now.collected], ["Paid out", now.paidOut]] as [string, Money][],
            total: ["Net cash", now.netCash] as [string, Money],
          },
        ].map((box) => (
          <section key={box.title} className="rounded-xl border bg-card p-5">
            <h2 className="font-semibold">{box.title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{box.note}</p>
            <dl className="mt-4 space-y-3">
              {box.lines.map(([l, m], i) => (
                <div key={l} className="flex items-start justify-between">
                  <dt className="text-sm text-muted-foreground">{l}</dt>
                  <dd className="tnum text-right text-sm">
                    {i === 1 ? "− " : ""}
                    {lead(m)}
                    <span className="block text-[11px] text-muted-foreground">{beside(m)}</span>
                  </dd>
                </div>
              ))}
              <div className="flex items-start justify-between border-t pt-3">
                <dt className="text-sm font-semibold">{box.total[0]}</dt>
                <dd className={cn("tnum text-right text-sm font-semibold", box.total[1].usd < 0 && "text-destructive")}>
                  {lead(box.total[1])}
                  <span className="block text-[11px] font-normal text-muted-foreground">{beside(box.total[1])}</span>
                </dd>
              </div>
            </dl>
          </section>
        ))}
      </div>

      {/* WHERE IT WENT, AND WHAT EACH SAILING MADE */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="overflow-hidden rounded-xl border bg-card">
          <h2 className="border-b px-5 py-4 font-semibold">{T("Where the money went")}</h2>
          {cats.length === 0 ? (
            <p className="px-5 py-8 text-sm text-muted-foreground">{T("No costs incurred in this period.")}</p>
          ) : (
            <ul className="divide-y">
              {cats.map((c) => (
                <li key={c.name} className="px-5 py-3">
                  <div className="flex justify-between text-sm">
                    <span>{c.name}</span>
                    <span className="tnum">{lead(c.amount)}</span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-secondary">
                    <div className="h-full rounded-full bg-brand" style={{ width: `${catTotal ? Math.max(2, (val(c.amount) / catTotal) * 100) : 0}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="overflow-hidden rounded-xl border bg-card">
          <header className="border-b px-5 py-4">
            <h2 className="flex items-center gap-2 font-semibold"><Ship className="size-4" />{T("Profit per container")}</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">{T("Only costs tied to a container count here. Rent and salaries belong to the business, not to one sailing.")}</p>
          </header>
          <ul className="divide-y">
            {sailings.slice(0, 6).map((c) => (
              <li key={c.id}>
                <Link href={`/app/finance/containers/${c.id}`} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-secondary/40">
                  <span>
                    <span className="tnum block text-sm font-medium">{c.reference}</span>
                    <span className="tnum block text-xs text-muted-foreground">
                      sailed {formatDate(c.departed ?? c.arrived)} · {lead(c.billed)} in{c.spent.usd > 0 ? `, ${lead(c.spent)} out` : ""}
                    </span>
                  </span>
                  <span className={cn("tnum text-sm", c.spent.usd === 0 && c.billed.usd === 0 ? "text-xs text-muted-foreground" : c.profit.usd >= 0 ? "text-success" : "text-destructive")}>
                    {c.spent.usd === 0 && c.billed.usd === 0 ? "nothing recorded" : lead(c.profit)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>

      {/* THE MONTH IN REVIEW */}
      <section className="overflow-hidden rounded-xl border bg-card">
        <header className="flex items-center justify-between border-b px-5 py-3">
          <h2 className="font-semibold">In review · {thisMonth.label}</h2>
          <span className="text-xs text-muted-foreground">against {lastMonth.label}</span>
        </header>
        <div className="grid grid-cols-2 gap-px bg-border md:grid-cols-4 xl:grid-cols-7">
          {[
            ["CBM received", `${month.cbmReceived.toFixed(3)} CBM`, `${monthBefore.cbmReceived.toFixed(3)} CBM`],
            ["Containers arrived", String(month.arrived), String(monthBefore.arrived)],
            ["Revenue", lead(month.revenue), lead(monthBefore.revenue)],
            ["Collected", lead(month.collected), lead(monthBefore.collected)],
            ["Outstanding", lead(month.outstanding), lead(monthBefore.outstanding)],
            ["Expenses", lead(month.expenses), lead(monthBefore.expenses)],
            ["Net profit", lead(month.profit), lead(monthBefore.profit)],
          ].map(([l, v, prev]) => (
            <div key={l} className={cell}>
              <p className={label}>{l}</p>
              <p className="tnum mt-1 font-semibold">{v}</p>
              <p className="tnum text-[11px] text-muted-foreground">was {prev}</p>
            </div>
          ))}
        </div>
      </section>

      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border lg:grid-cols-4">
        {[
          ["Most profitable", best ? lead(best.profit) : "—", best?.reference, "text-success"],
          ["Least profitable", worst ? lead(worst.profit) : "—", worst?.reference, ""],
          ["Most owed on it", mostOwed ? lead(mostOwed.owed) : "—", mostOwed?.reference, "text-destructive"],
          ["Largest volume", biggest ? `${biggest.cbm.toFixed(3)} CBM` : "—", biggest?.reference, ""],
        ].map(([l, v, ref, tone]) => (
          <div key={l as string} className={cell}>
            <p className={label}>{l}</p>
            <p className={cn("tnum mt-1 text-xl font-semibold", tone as string)}>{v}</p>
            <p className="tnum text-xs text-muted-foreground">{ref ?? "no container yet"}</p>
          </div>
        ))}
      </div>

      {/* CONTAINER PERFORMANCE */}
      <section className="space-y-2">
        <div className="flex items-end justify-between">
          <div>
            <h2 className={label}>{T("Container performance")}</h2>
            <p className="text-xs text-muted-foreground">In {cur === "TZS" ? "shillings, each bill at its own rate" : "dollars"}. Switch at the top of the page.</p>
          </div>
          <Link href="/app/finance/containers" className="text-sm text-brand hover:underline">All containers →</Link>
        </div>
        <div className="relative overflow-x-auto rounded-xl border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                {["Container", "From", "Cargo", "CBM", "Expected", "Collected", "Outstanding", "Expenses", "Net profit", "Margin"].map((h, i) => (
                  <th key={h} className={cn("px-4 py-2 font-medium", i >= 2 && "text-right")}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {sailings.map((c) => (
                <tr key={c.id} className="hover:bg-secondary/30">
                  <td className="tnum px-4 py-2 font-medium"><Link href={`/app/finance/containers/${c.id}`} className="hover:underline">{c.reference}</Link></td>
                  <td className="px-4 py-2 text-muted-foreground">{c.from}</td>
                  <td className="tnum px-4 py-2 text-right">{c.cargo}</td>
                  <td className="tnum px-4 py-2 text-right">{c.cbm.toFixed(3)}</td>
                  <td className="tnum px-4 py-2 text-right">{lead(c.billed)}</td>
                  <td className="tnum px-4 py-2 text-right text-success">{lead(c.collected)}</td>
                  <td className="tnum px-4 py-2 text-right text-destructive">{lead(c.owed)}</td>
                  <td className="tnum px-4 py-2 text-right text-destructive">{lead(c.spent)}</td>
                  <td className={cn("tnum px-4 py-2 text-right font-semibold", c.profit.usd < 0 && "text-destructive")}>{lead(c.profit)}</td>
                  <td className="tnum px-4 py-2 text-right">{c.billed.usd > 0 ? `${Math.round((c.profit.usd / c.billed.usd) * 100)}%` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* BUSINESS VOLUME */}
      <section className="space-y-2">
        <h2 className={label}>{T("Business volume")}</h2>
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border md:grid-cols-4 xl:grid-cols-7">
          {[
            ["CBM received", now.cbmReceived.toFixed(3)],
            ["CBM billed", now.cbmBilled.toFixed(3)],
            ["CBM collected", now.cbmCollected.toFixed(3)],
            ["Packages", String(now.packages)],
            ["Customers served", String(now.customers)],
            ["Containers arrived", String(now.arrived)],
            ["Containers closed", String(now.closed)],
          ].map(([l, v]) => (
            <div key={l} className={cell}>
              <p className={label}>{l}</p>
              <p className="tnum mt-1 text-xl font-semibold">{v}</p>
            </div>
          ))}
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <section className="overflow-hidden rounded-xl border bg-card">
          <header className="border-b px-5 py-4">
            <h2 className="font-semibold">{T("Where revenue comes from")}</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">{T("Freight billed in this period. There is no other kind of income in the system — every invoice belongs to a consignment.")}</p>
          </header>
          <div className="grid grid-cols-1 gap-px border-b bg-border sm:grid-cols-3">
            {[["Expected", now.revenue, ""], ["Collected", now.revenue.usd ? { usd: now.revenue.usd - now.outstanding.usd, tzs: now.revenue.tzs - now.outstanding.tzs } : now.collected, "text-success"], ["Outstanding", now.outstanding, "text-destructive"]].map(([l, m, tone]) => (
              <div key={l as string} className="bg-card px-4 py-3">
                <p className={label}>{l as string}</p>
                <p className={cn("tnum mt-1 font-semibold", tone as string)}>{lead(m as Money)}</p>
              </div>
            ))}
          </div>
          <ul className="divide-y">
            <li className="flex justify-between px-5 py-3 text-sm font-medium">
              <span>{T("Guangzhou → Dar es Salaam")}</span>
              <span className="tnum">{lead(now.revenue)}</span>
            </li>
            {customers.slice(0, 6).map((c) => (
              <li key={c.name} className="flex justify-between px-5 py-2.5 text-xs">
                <span className="text-muted-foreground">{c.name}</span>
                <span className="tnum text-right">
                  {lead(c.billed)}
                  {c.owed.usd > 0.005 ? <span className="block text-destructive">{lead(c.owed)} owed</span> : <span className="block text-success">paid</span>}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="overflow-hidden rounded-xl border bg-card">
          <header className="border-b px-5 py-4">
            <h2 className="font-semibold">{T("Where money is spent")}</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">{T("A cost against a container is a container cost. One with no container is the business's own — office, special or executive.")}</p>
          </header>
          <div className="grid grid-cols-3 gap-px border-b bg-border">
            {[
              ["Container costs", sum(now.costs.filter((c) => c.scope === "CONTAINER"), (c) => c.amount)],
              ["Office costs", sum(now.costs.filter((c) => c.scope === "OFFICE"), (c) => c.amount)],
              ["Special", sum(now.costs.filter((c) => c.scope === "SPECIAL" || c.scope === "EXECUTIVE"), (c) => c.amount)],
            ].map(([l, m]) => (
              <div key={l as string} className="bg-card px-4 py-3">
                <p className={label}>{l as string}</p>
                <p className="tnum mt-1 font-semibold text-destructive">{lead(m as Money)}</p>
              </div>
            ))}
          </div>
          <ul className="divide-y">
            {cats.map((c) => (
              <li key={c.name} className="px-5 py-2.5">
                <div className="flex justify-between text-sm">
                  <span>{c.name}</span>
                  <span className="tnum">{lead(c.amount)} <span className="ml-2 text-xs text-muted-foreground">{catTotal ? Math.round((val(c.amount) / catTotal) * 100) : 0}%</span></span>
                </div>
                <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-secondary">
                  <div className="h-full rounded-full bg-destructive" style={{ width: `${catTotal ? (val(c.amount) / catTotal) * 100 : 0}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="overflow-hidden rounded-xl border bg-card">
          <header className="border-b px-5 py-4">
            <h2 className="font-semibold">{T("Financial position")}</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">Where the money is right now, derived from the ledger. Not a period figure — it is today&rsquo;s answer whatever stretch is chosen above.</p>
          </header>
          <ul className="divide-y">
            {books.positions.map((a) => (
              <li key={a.id} className="flex justify-between px-5 py-2.5 text-sm">
                <span>{a.bankName} ({a.currency})</span>
                <span className="tnum">
                  <span className="mr-2 text-xs text-muted-foreground">{a.currency}</span>
                  {a.balance.toLocaleString("en-US", { maximumFractionDigits: a.currency === "TZS" ? 0 : 2 })}
                </span>
              </li>
            ))}
            <li className="flex justify-between px-5 py-3 text-sm font-semibold">
              <span>{T("Across every account")}</span>
              <span className="tnum">{fmt(books.positions.reduce((s, a) => s + inCur(a.balance, a.currency), 0))}</span>
            </li>
          </ul>
        </section>

        <section className="overflow-hidden rounded-xl border bg-card">
          <header className="border-b px-5 py-4">
            <h2 className="font-semibold">{T("Collection performance")}</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">{T("What was billed in this period against what has come in for it.")}</p>
          </header>
          <div className="px-5 py-4">
            <div className="flex items-baseline justify-between">
              <span className="text-sm text-muted-foreground">{T("Collection rate")}</span>
              <span className="tnum text-3xl font-semibold">{pct(now.collectionRate)}</span>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-secondary">
              <div className="h-full rounded-full bg-success" style={{ width: `${Math.min(100, now.collectionRate ?? 0)}%` }} />
            </div>
          </div>
          <div className="grid grid-cols-4 gap-px border-t bg-border">
            {[["Paid", now.counts.paid], ["Unpaid", now.counts.unpaid], ["Part paid", now.counts.partPaid], ["To verify", now.counts.toVerify]].map(([l, n]) => (
              <div key={l as string} className="bg-card px-4 py-3">
                <p className={label}>{l as string}</p>
                <p className="tnum mt-1 text-xl font-semibold">{n as number}</p>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* FINANCIAL HEALTH */}
      <section className="space-y-2">
        <h2 className={label}>{T("Financial health")}</h2>
        <div className="grid grid-cols-1 gap-px overflow-hidden rounded-xl border bg-border md:grid-cols-3">
          {[
            ["Collection rate", pct(now.collectionRate), now.collectionRate === null ? "Nothing was billed in this period." : `${pct(now.collectionRate)} of what was billed in this period has actually been paid.`, (now.collectionRate ?? 100) < 50 ? "text-destructive" : "text-success"],
            ["Profit margin", pct(now.margin), now.margin === null ? "Nothing was billed, so there is no margin." : `${fmt((now.margin ?? 0) / 100, "USD").replace("$", "USD ")} of every USD 1.00 billed is left after the costs of this period.`, (now.margin ?? 0) >= 0 ? "text-success" : "text-destructive"],
            ["Expense ratio", pct(now.expenseRatio), now.expenseRatio === null ? "Nothing was billed to compare costs with." : `${pct(now.expenseRatio)} of what was billed went back out as costs.`, (now.expenseRatio ?? 0) > 60 ? "text-destructive" : "text-success"],
            ["Outstanding ratio", pct(now.outstandingRatio), now.outstandingRatio === null ? "Nothing was billed in this period." : `${pct(now.outstandingRatio)} of everything billed is still sitting with customers.`, (now.outstandingRatio ?? 0) > 50 ? "text-destructive" : "text-success"],
            ["Revenue growth", before.revenue.usd ? pct(((now.revenue.usd - before.revenue.usd) / before.revenue.usd) * 100) : "—", before.revenue.usd ? `Against ${p.previous.label}.` : `Nothing was billed in ${p.previous.label}, so there is nothing to grow from.`, ""],
            ["Profit growth", before.profit.usd ? pct(((now.profit.usd - before.profit.usd) / Math.abs(before.profit.usd)) * 100) : "—", before.profit.usd ? `Against ${p.previous.label}.` : `${p.previous.label} made nothing, so there is nothing to compare against.`, ""],
          ].map(([l, v, note, tone]) => (
            <div key={l} className="bg-card px-5 py-4">
              <p className={label}>{l}</p>
              <p className={cn("tnum mt-1 text-2xl font-semibold", tone)}>{v}</p>
              <p className="mt-1 text-xs text-muted-foreground">{note}</p>
            </div>
          ))}
        </div>
      </section>

      {/* TWELVE MONTHS */}
      <section className="space-y-2">
        <h2 className={label}>{T("Twelve months")}</h2>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="rounded-xl border bg-card p-5">
            <h3 className="font-semibold">{T("Money in against money out")}</h3>
            <div className="mt-4 flex h-40 items-end gap-1.5">
              {months.map((m) => (
                <div key={m.label} className="flex flex-1 flex-col items-center gap-1">
                  <div className="flex h-32 w-full items-end justify-center gap-0.5">
                    <div className="w-1/2 rounded-t bg-success/70" style={{ height: `${(val(m.in) / maxMoney) * 100}%` }} title={`In ${lead(m.in)}`} />
                    <div className="w-1/2 rounded-t bg-destructive/70" style={{ height: `${(val(m.out) / maxMoney) * 100}%` }} title={`Out ${lead(m.out)}`} />
                  </div>
                  <span className={cn("text-[10px] uppercase", m.current ? "font-semibold" : "text-muted-foreground")}>{m.label}</span>
                </div>
              ))}
            </div>
            <p className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full bg-success" />{T("Money in")}</span>
              <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full bg-destructive" />{T("Money out")}</span>
              <span className="ml-auto">{T("One scale")}</span>
            </p>
          </div>
          <div className="rounded-xl border bg-card p-5">
            <h3 className="font-semibold">{T("Cargo landed in Dar, by month")}</h3>
            <div className="mt-4 flex h-40 items-end gap-1.5">
              {months.map((m) => (
                <div key={m.label} className="flex flex-1 flex-col items-center gap-1">
                  <div className="flex h-32 w-full items-end">
                    <div className={cn("w-full rounded-t", m.current ? "bg-brand" : "bg-brand/50")} style={{ height: `${Math.max(2, (m.cbm / maxCbm) * 100)}%` }} title={`${m.cbm.toFixed(3)} CBM`} />
                  </div>
                  <span className={cn("text-[10px]", m.current ? "font-semibold" : "text-muted-foreground")}>{m.label}</span>
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs text-muted-foreground">{T("Cubic metres counted off containers at the Dar floor.")}</p>
          </div>
        </div>
      </section>

      {/* THE STATEMENT */}
      <section className="space-y-2">
        <h2 className={label}>{T("Financial statement")}</h2>
        <form action="/app/finance/reports/statement" className="flex flex-wrap items-end justify-between gap-4 rounded-xl border bg-card p-5">
          <div className="max-w-xl">
            <h3 className="font-semibold">{T("The whole set of books, as one document")}</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Profit and loss, cash, where revenue came from, where money was spent, every container, the position today, collections and volume — for the month you pick, with a line for Finance and a line for approval. Written in {cur === "TZS" ? "shillings" : "dollars"}, to match the switch at the top of this page.
            </p>
          </div>
          <input type="hidden" name="cur" value={cur} />
          <div className="flex flex-wrap items-end gap-2">
            <label className="space-y-1 text-xs text-muted-foreground">
              {T("Period")}
              <NativeSelect name="month" defaultValue={`${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`} className="w-48 max-w-full">
                {Array.from({ length: 12 }, (_, i) => {
                  const d = new Date(new Date().getFullYear(), new Date().getMonth() - i, 1);
                  const v = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
                  return <option key={v} value={v}>{d.toLocaleDateString("en-GB", { month: "long", year: "numeric" })}</option>;
                })}
              </NativeSelect>
            </label>
            <Button type="submit"><FileText />{T("Open the statement")}</Button>
          </div>
        </form>
      </section>

      {/* REPORTS TO DOWNLOAD */}
      <section id="downloads" className="space-y-2">
        <h2 className={label}>{T("Reports to download")}</h2>
        <p className="text-xs text-muted-foreground">{T("One table each, over the period chosen at the top — the working papers behind the statement. Spreadsheet to work in, PDF to hand over.")}</p>
        <div className="overflow-hidden rounded-xl border bg-card">
          <div className="flex flex-wrap gap-2 border-b p-4">
            {(Object.keys(REPORTS) as (keyof typeof REPORTS)[]).map((key) => (
              <Link
                key={key}
                href={`${link({ report: key })}#downloads`}
                className={cn("rounded-full border px-3 py-1 text-xs transition-colors", p.report === key ? "border-brand bg-brand text-brand-foreground" : "bg-card hover:bg-secondary")}
              >
                {REPORTS[key]}
              </Link>
            ))}
          </div>
          <form className="flex flex-wrap items-end gap-3 border-b p-4">
            {Object.entries({ period: p.period, cur, report: p.report }).map(([k, v]) => (
              <input key={k} type="hidden" name={k} value={v} />
            ))}
            <label className="space-y-1 text-xs text-muted-foreground">{T("From")}<Input type="date" name="from" defaultValue={p.from} className="w-40" /></label>
            <label className="space-y-1 text-xs text-muted-foreground">To<Input type="date" name="to" defaultValue={p.to} className="w-40" /></label>
            <label className="space-y-1 text-xs text-muted-foreground">
              {T("Container")}
              <NativeSelect name="container" defaultValue={p.container ?? ""} className="w-48">
                <option value="">{T("Every container")}</option>
                {sailings.map((c) => <option key={c.id} value={c.id}>{c.reference}</option>)}
              </NativeSelect>
            </label>
            <Button type="submit" variant="outline">{T("Apply")}</Button>
          </form>
          <div className="flex flex-wrap items-start justify-between gap-3 px-5 py-4">
            <div className="max-w-2xl">
              <h3 className="font-semibold">{table.title}</h3>
              <p className="mt-0.5 text-sm text-muted-foreground">{table.description}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {p.reportRange.label} · in {cur === "TZS" ? "shillings" : "dollars"}{books.today ? `, USD 1 = TZS ${books.today.toLocaleString()}` : ""}
              </p>
            </div>
            <div className="inline-flex overflow-hidden rounded-md border">
              <a href={`/app/finance/reports/export?${exportQuery}`} className="inline-flex items-center gap-1.5 border-r px-3 py-1.5 text-sm hover:bg-secondary">
                <Download className="size-4" />{T("Spreadsheet")}
              </a>
              <Link href={`/app/finance/reports/print?${exportQuery}`} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm hover:bg-secondary">
                <FileText className="size-4" />PDF
              </Link>
            </div>
          </div>
          <div className="border-t">
            <ReportTableView table={table} cur={cur} />
          </div>
        </div>
      </section>
    </div>
  );
}
