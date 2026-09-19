import type { Metadata } from "next";
import Link from "next/link";
import { Anchor, Boxes, Download, FileText, PackageCheck, PackageOpen, Ship, Wallet } from "lucide-react";

import { PageHeader } from "@/components/app/page-header";
import { PrintButton } from "@/components/app/print-button";
import { SectionLabel } from "@/components/app/section-label";
import { SectionTabs } from "@/components/app/section-tabs";
import { Input } from "@/components/ui/input";
import { formatCurrency } from "@/lib/currency";
import { figures, loadBooks, within, type Money } from "@/lib/finance-report";
import { formatCbm } from "@/lib/format";
import { t } from "@/lib/i18n";
import { balanceOf, owedAcross } from "@/lib/invoice-balance";
import {
  MANAGEMENT_PERIODS,
  MANAGEMENT_SHELVES,
  managementPeriod,
  periodQuery,
} from "@/lib/management-reports";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { cn } from "@/lib/utils";
import { localeOf } from "@/lib/viewer-locale";

import { primeLocale } from "@/lib/server-t";
import { Tx } from "@/components/app/tx";
export const metadata: Metadata = { title: "Management report" };

const DAY = 86_400_000;

/**
 * One period, one page, ready to be printed and handed over.
 *
 * The Profit & loss screen answers the money question in full detail and this
 * does not repeat it. What it does is put beside each other the three things a
 * manager is asked about in the same breath: what the company MOVED, what that
 * EARNED, and how much of the earning is still a promise rather than money.
 *
 * The third section is the one that changes the reading. A month can bill well,
 * profit on paper and leave the bank emptier than it started, and the only way
 * to see that is to have what is owed on the same sheet as the revenue.
 */
export default async function ManagerReport({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await primeLocale();
  const user = await requirePermission("record.review");
  const locale = await localeOf(user.id);
  const sp = await searchParams;
  const picked = managementPeriod(sp);
  const range = { gte: picked.current.from, lt: picked.current.to };

  const [books, releases, openBills] = await Promise.all([
    loadBooks(),
    prisma.release.count({ where: { releasedAt: range } }),
    prisma.invoice.findMany({
      where: { status: { notIn: ["DRAFT", "CANCELLED"] } },
      select: {
        issuedAt: true,
        createdAt: true,
        total: true,
        currency: true,
        fxRate: true,
        totalTzs: true,
        customer: { select: { id: true, fullName: true, businessName: true, phone: true } },
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
      },
    }),
  ]);

  const now = figures(books, picked.current);
  const before = figures(books, picked.previous);
  const money = (m: Money) => formatCurrency(Math.round(m.tzs), "TZS");

  /* WHAT MOVED — counted off the operational record, not the invoices, so a
     container that sailed with nothing billed yet still counts as sailed. */
  const shipped = books.boxes.filter((box) => within(box.departed, picked.current)).length;
  const received = books.china.filter((c) => within(c.receivedAt, picked.current)).length;
  const moved = [
    { icon: Ship, label: "Containers shipped", value: shipped.toLocaleString("en-US") },
    { icon: Anchor, label: "Containers arrived", value: now.arrived.toLocaleString("en-US") },
    { icon: Boxes, label: "CBM received in China", value: formatCbm(now.cbmReceived) },
    { icon: Boxes, label: "CBM landed in Dar", value: formatCbm(now.cbmLanded) },
    { icon: PackageOpen, label: "Consignments received", value: received.toLocaleString("en-US") },
    { icon: PackageCheck, label: "Consignments released", value: releases.toLocaleString("en-US") },
  ];

  /* Against the period before, because a figure with nothing beside it is not a
     finding. Undefined where the period before had nothing: "+∞%" is a
     sentence the data does not support. */
  const delta = (a: number, b: number) => (b > 0 ? ((a - b) / b) * 100 : undefined);
  const rows: {
    label: string;
    value: string;
    sub?: string;
    delta?: number;
    note?: string;
    tone?: "good" | "bad";
  }[] = [
    {
      label: "Revenue (excl. VAT)",
      value: money(now.revenue),
      sub: `${now.bills.length} ${t(locale, "bills raised")}`,
      delta: delta(now.revenue.tzs, before.revenue.tzs),
      note: before.revenue.tzs > 0 ? undefined : "nothing billed in the period before",
    },
    { label: "Of that, cash", value: money(now.cashRevenue), sub: t(locale, "Released against payment") },
    {
      label: "Of that, credit",
      value: money(now.creditRevenue),
      sub: t(locale, "Released against a promise"),
      tone: now.creditRevenue.tzs > now.cashRevenue.tzs ? "bad" : undefined,
    },
    {
      label: "Collected",
      value: money(now.collected),
      sub: t(locale, "Verified payments that arrived, write-offs excluded"),
      delta: delta(now.collected.tzs, before.collected.tzs),
      note: before.collected.tzs > 0 ? undefined : "nothing collected in the period before",
      tone: "good",
    },
    {
      label: "Costs",
      value: money(now.expenses),
      delta: delta(now.expenses.tzs, before.expenses.tzs),
      note: before.expenses.tzs > 0 ? undefined : "nothing spent in the period before",
    },
    {
      label: "Profit",
      value: money(now.profit),
      /* figures() already divides these two and guards the period with no
         revenue; dividing again here would be a second definition of margin. */
      sub: now.margin === null ? undefined : `${now.margin.toFixed(0)}% ${t(locale, "margin")}`,
      /* Only against a profit: a period that climbed out of a loss would come
         back as a large negative change, read backwards. */
      delta: before.profit.tzs > 0 ? delta(now.profit.tzs, before.profit.tzs) : undefined,
      note: before.profit.tzs > 0 ? undefined : "no profit in the period before",
      tone: now.profit.tzs < 0 ? "bad" : "good",
    },
  ];

  /* WHAT IS STILL OWED — today, across every live bill, in shillings at each
     bill's own rate. A dollar bill with no rate is kept apart, never added. */
  const owed = owedAcross(openBills);
  const at = Date.now();
  const bands = [
    { label: "0–30 days", max: 30 },
    { label: "31–60 days", max: 60 },
    { label: "61–90 days", max: 90 },
    { label: "Over 90 days", max: Number.POSITIVE_INFINITY },
  ].map((band) => ({ ...band, tzs: 0, bills: 0 }));
  const debtors = new Map<string, { name: string; phone: string; tzs: number; bills: number; oldest: number }>();
  for (const bill of openBills) {
    const b = balanceOf(bill);
    if (!b.outstandingTzs || !b.outstandingTzs.greaterThan(0)) continue;
    const owing = b.outstandingTzs.toNumber();
    const age = Math.floor((at - (bill.issuedAt ?? bill.createdAt).getTime()) / DAY);
    const band = bands.find((x) => age <= x.max)!;
    band.tzs += owing;
    band.bills += 1;
    const who = debtors.get(bill.customer.id) ?? {
      name: bill.customer.businessName || bill.customer.fullName,
      phone: bill.customer.phone,
      tzs: 0,
      bills: 0,
      oldest: 0,
    };
    who.tzs += owing;
    who.bills += 1;
    who.oldest = Math.max(who.oldest, age);
    debtors.set(bill.customer.id, who);
  }
  const ageingTotal = bands.reduce((s, b) => s + b.tzs, 0);
  const top = [...debtors.values()].sort((a, b) => b.tzs - a.tzs).slice(0, 10);

  const query = periodQuery(picked);
  const download = (key: string, format: "pdf" | "csv") =>
    `/app/manager/reports/export?report=${key}&${query}${format === "pdf" ? "&format=pdf" : ""}`;
  const pill = (active: boolean) =>
    active
      ? "focus-ring rounded-full bg-foreground px-3 py-1 text-[11px] font-semibold text-background"
      : "focus-ring rounded-full border px-3 py-1 text-[11px] font-medium text-muted-foreground hover:bg-secondary hover:text-foreground";

  return (
    <div className="space-y-6">
      <PageHeader
        title={t(locale, "Management report")}
        description={t(locale, "What moved, what it earned, and how much of it is still owed.")}
        actions={<PrintButton label={t(locale, "Print")} />}
      />
      <div className="print:hidden">
        <SectionTabs />
      </div>

      {/* The period as links rather than a form for the fixed ones: this page is
          printed, and a printed report has to say which period it covers. */}
      <div className="space-y-3 print:hidden">
        <div className="flex flex-wrap gap-1.5">
          {(Object.keys(MANAGEMENT_PERIODS) as (keyof typeof MANAGEMENT_PERIODS)[])
            .filter((key) => key !== "custom")
            .map((key) => (
              <Link key={key} href={`/app/manager/reports?period=${key}`} className={pill(picked.key === key)}>
                {t(locale, MANAGEMENT_PERIODS[key])}
              </Link>
            ))}
          <span className={pill(picked.key === "custom")}>{t(locale, "Custom")}</span>
        </div>
        <form action="/app/manager/reports" className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="period" value="custom" />
          <label className="space-y-1 text-[11px] text-muted-foreground">
            <span className="block">{t(locale, "From")}</span>
            <Input type="date" name="from" defaultValue={picked.from} className="h-9 w-40" />
          </label>
          <label className="space-y-1 text-[11px] text-muted-foreground">
            <span className="block">{t(locale, "To")}</span>
            <Input type="date" name="to" defaultValue={picked.to} className="h-9 w-40" />
          </label>
          <button
            type="submit"
            className="focus-ring inline-flex h-9 items-center rounded-md border bg-background px-3 text-sm font-medium hover:bg-secondary"
          >
            {t(locale, "Show")}
          </button>
        </form>
      </div>

      <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
        {t(locale, "Covering")} {picked.current.label}
        {picked.key !== "custom" ? ` · ${t(locale, "against")} ${picked.previous.label}` : ""}
      </p>

      <section>
        <SectionLabel>{t(locale, "What moved")}</SectionLabel>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {moved.map((s) => (
            <div key={s.label} className="rounded-xl border bg-card p-3">
              <s.icon className="size-4 text-muted-foreground" />
              <p className="tnum mt-2 text-xl font-semibold">{s.value}</p>
              <p className="text-[11px] text-muted-foreground">{t(locale, s.label)}</p>
            </div>
          ))}
        </div>
      </section>

      <section>
        <SectionLabel>{t(locale, "What it earned")}</SectionLabel>
        <div className="divide-y rounded-xl border bg-card">
          {rows.map((r) => (
            <div key={r.label} className="flex items-baseline gap-3 px-3 py-2.5">
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">{t(locale, r.label)}</span>
                {r.sub ? <span className="block text-[11px] text-muted-foreground"><Tx>{r.sub}</Tx></span> : null}
              </span>
              {r.delta !== undefined ? (
                <span className={cn("tnum shrink-0 text-[11px]", r.delta >= 0 ? "text-success" : "text-destructive")}>
                  {r.delta >= 0 ? "+" : ""}
                  {r.delta.toFixed(0)}%
                </span>
              ) : r.note ? (
                <span className="shrink text-right text-[11px] text-muted-foreground">{t(locale, r.note)}</span>
              ) : null}
              <span
                className={cn(
                  "tnum shrink-0 text-sm font-semibold",
                  r.tone === "bad" && "text-destructive",
                  r.tone === "good" && "text-success"
                )}
              >
                {r.value}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* Deliberately last and deliberately separate. Everything above can look
          healthy while this says the money never arrived. */}
      <section>
        <SectionLabel action={{ href: "/app/finance/credit", label: t(locale, "Open credit") }}>
          {t(locale, "What is still owed")}
        </SectionLabel>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            { label: "Owed today, every bill", value: owed.primary, sub: owed.equivalent, tone: "text-warning" },
            { label: "On this period's bills", value: money(now.outstanding), sub: "", tone: "" },
            { label: "Customers owing", value: debtors.size.toLocaleString("en-US"), sub: "", tone: "" },
            {
              label: "Collected on this period's bills",
              value: now.collectionRate === null ? "—" : `${now.collectionRate.toFixed(0)}%`,
              sub: "",
              tone: "text-success",
            },
          ].map((c) => (
            <div key={c.label} className="rounded-xl border bg-card p-3">
              <p className={cn("tnum text-sm font-semibold", c.tone)}>{c.value}</p>
              {c.sub ? <p className="tnum text-[11px] text-muted-foreground"><Tx>{c.sub}</Tx></p> : null}
              <p className="mt-0.5 text-[11px] text-muted-foreground">{t(locale, c.label)}</p>
            </div>
          ))}
        </div>

        <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
          <div className="rounded-xl border bg-card p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {t(locale, "How old it is")}
            </p>
            <ul className="mt-2 space-y-2">
              {bands.map((band) => (
                <li key={band.label} className="text-xs">
                  <div className="flex items-baseline justify-between gap-2">
                    <span>
                      {t(locale, band.label)}{" "}
                      <span className="text-muted-foreground">
                        · {band.bills} {t(locale, "bills")}
                      </span>
                    </span>
                    <span className="tnum font-semibold">{formatCurrency(band.tzs, "TZS")}</span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className={cn(
                        "h-full rounded-full",
                        band.max <= 30 ? "bg-success" : band.max <= 60 ? "bg-warning" : "bg-destructive"
                      )}
                      style={{ width: `${ageingTotal > 0 ? (band.tzs / ageingTotal) * 100 : 0}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
            {owed.unconverted.greaterThan(0) ? (
              <p className="mt-2 text-[11px] text-muted-foreground">
                {t(locale, "Not in the bands: dollar bills with no rate")} ·{" "}
                {formatCurrency(owed.unconverted, "USD")}
              </p>
            ) : null}
          </div>

          <div className="rounded-xl border bg-card p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {t(locale, "Who owes the most")}
            </p>
            {top.length === 0 ? (
              <p className="mt-2 text-xs text-muted-foreground">{t(locale, "Nobody owes anything today.")}</p>
            ) : (
              <ol className="mt-2 divide-y text-xs">
                {top.map((who, i) => (
                  <li key={`${who.name}-${i}`} className="flex items-baseline gap-2 py-1.5">
                    <span className="tnum w-4 text-muted-foreground">{i + 1}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{who.name}</span>
                      <span className="block text-[11px] text-muted-foreground">
                        {who.phone} · {who.bills} {t(locale, "bills")} · {t(locale, "oldest")} {who.oldest}{" "}
                        {t(locale, "days")}
                      </span>
                    </span>
                    <span className="tnum shrink-0 font-semibold text-warning">{formatCurrency(who.tzs, "TZS")}</span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
      </section>

      {/* Hidden on paper. The report above is what gets signed and handed over;
          a page of links printed underneath it is a page of dead ink. */}
      <section className="print:hidden">
        <SectionLabel>{t(locale, "Every report you can run")}</SectionLabel>
        <p className="-mt-1 mb-3 text-[11px] text-muted-foreground">
          {t(
            locale,
            "Each one covers the period chosen above, in shillings at each record's own rate. A few can only be read as at today; each says so on its own document."
          )}
        </p>

        {MANAGEMENT_SHELVES.map((shelf) => (
          <div key={shelf.name} className="mb-3 overflow-hidden rounded-xl border bg-card">
            <p className="border-b bg-muted/30 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              {t(locale, shelf.name)}
            </p>
            <div className="divide-y">
              {shelf.reports.map((r) => (
                <div key={r.key} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2">
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">{t(locale, r.label)}</span>
                    <span className="block text-[11px] text-muted-foreground">{t(locale, r.ask)}</span>
                  </span>
                  <span className="inline-flex shrink-0 overflow-hidden rounded-md border">
                    {/* Its own tab: a document is read beside the page, not instead of it. */}
                    <a
                      href={download(r.key, "pdf")}
                      target="_blank"
                      rel="noopener"
                      className="focus-ring inline-flex min-h-9 items-center gap-1.5 border-r px-2.5 text-[11px] font-medium hover:bg-secondary sm:min-h-0 sm:py-1"
                    >
                      <FileText className="size-3.5" />
                      {t(locale, "PDF")}
                    </a>
                    {/* "Excel (CSV)" and not "Excel": what downloads is a CSV,
                        which Excel opens directly. */}
                    <a
                      href={download(r.key, "csv")}
                      className="focus-ring inline-flex min-h-9 items-center gap-1.5 px-2.5 text-[11px] font-medium hover:bg-secondary sm:min-h-0 sm:py-1"
                    >
                      <Download className="size-3.5" />
                      {t(locale, "Excel (CSV)")}
                    </a>
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </section>

      <p className="hidden items-center gap-1.5 text-[11px] text-muted-foreground print:flex">
        <Wallet className="size-3.5" />
        {t(locale, "Money in shillings at each record's own rate. Prepared by")} {user.name}.
      </p>
    </div>
  );
}
