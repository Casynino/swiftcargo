import Link from "next/link";
import type { Metadata } from "next";
import { Container, HandCoins, Package, Search, Wallet, type LucideIcon } from "lucide-react";

import { FinanceTabs } from "@/components/app/finance-tabs";
import { AutoSelect, RecordPaymentPicker, type PayingCustomer } from "@/components/app/income-controls";
import { LedgerRowFix } from "@/components/app/ledger-row-fix";
import { PageHeader } from "@/components/app/page-header";
import { PriceChanged } from "@/components/app/price-changed";
import { darMidnight, darStartOfDay, darStartOfMonth, darStartOfWeek, darStartOfYear } from "@/lib/dar-time";
import {
  darDay,
  incomeRows,
  SOURCE_LABEL,
  toCollect,
  type CollectRow,
  type IncomeRow,
  type IncomeSource,
} from "@/lib/income";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { requirePermission } from "@/lib/session";
import { primeLocale, T } from "@/lib/server-t";
import { cn } from "@/lib/utils";
import { localeOf } from "@/lib/viewer-locale";

export const metadata: Metadata = { title: "Income" };

const DAY_MS = 24 * 60 * 60 * 1000;
const DAR = "Africa/Dar_es_Salaam";

const SOURCE_LOOK: Record<IncomeSource, { icon: LucideIcon; tone: string }> = {
  LCL: { icon: Package, tone: "bg-sky-500/15 text-sky-600 dark:text-sky-300" },
  FCL: { icon: Container, tone: "bg-violet-500/15 text-violet-600 dark:text-violet-300" },
  CREDIT: { icon: HandCoins, tone: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300" },
};
const SOURCES = Object.keys(SOURCE_LABEL) as IncomeSource[];

const PERIODS = [
  ["today", "Today"],
  ["yesterday", "Yesterday"],
  ["week", "This week"],
  ["month", "This month"],
  ["year", "This year"],
] as const;
type PeriodKey = (typeof PERIODS)[number][0] | "custom";

const tzs = (n: number) => `TZS ${Math.round(n).toLocaleString("en-US")}`;
const n = (v: number) => Math.round(v).toLocaleString("en-US");

/** A YYYY-MM-DD read as the Dar midnight it names. */
function dayStart(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? darMidnight(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
}

function readPeriod(sp: { period?: string; from?: string; to?: string }) {
  const today = darStartOfDay();
  const from = sp.from ? dayStart(sp.from) : null;
  const to = sp.to ? dayStart(sp.to) : null;
  if (from && to && to.getTime() >= from.getTime()) {
    return { key: "custom" as PeriodKey, start: from, end: new Date(to.getTime() + DAY_MS) };
  }
  const key = (PERIODS.some(([k]) => k === sp.period) ? sp.period : "today") as PeriodKey;
  const end = new Date(today.getTime() + DAY_MS);
  switch (key) {
    case "yesterday":
      return { key, start: new Date(today.getTime() - DAY_MS), end: today };
    case "week":
      return { key, start: darStartOfWeek(), end };
    case "month":
      return { key, start: darStartOfMonth(), end };
    case "year":
      return { key, start: darStartOfYear(), end };
    default:
      return { key, start: today, end };
  }
}

const longDay = (d: Date) =>
  d.toLocaleDateString("en-GB", { timeZone: DAR, weekday: "long", day: "numeric", month: "long", year: "numeric" });
const shortDay = (d: Date) =>
  d.toLocaleDateString("en-GB", { timeZone: DAR, weekday: "short", day: "numeric", month: "short", year: "numeric" });
const time = (d: Date) =>
  d.toLocaleTimeString("en-GB", { timeZone: DAR, hour: "2-digit", minute: "2-digit" });

const STAGE: Record<CollectRow["stage"], { text: (r: CollectRow) => string; tone?: string }> = {
  storage: { text: (r) => `storage running · day ${r.storageDay}`, tone: "font-semibold text-destructive" },
  cleared: { text: (r) => `cleared · storage day ${r.storageDay}`, tone: "font-semibold text-warning" },
  credit: { text: () => "released on credit", tone: "font-semibold text-destructive" },
  port: { text: () => "at the port · in clearance" },
  sea: { text: () => "at sea" },
  china: { text: () => "in Guangzhou" },
};

/**
 * Income — every shilling customers have paid, from every kind of cargo, with
 * the account it landed in. Any line can be corrected or reversed from the line.
 * Beside it: who still owes on bills already sent.
 */
export default async function IncomePage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; from?: string; to?: string; source?: string; account?: string; q?: string }>;
}) {
  await primeLocale();
  const user = await requirePermission("accounting.view");
  const locale = await localeOf(user.id);
  const sp = await searchParams;
  const p = readPeriod(sp);
  const source = (SOURCES as string[]).includes(sp.source ?? "") ? (sp.source as IncomeSource) : "";
  const accountId = sp.account ?? "";
  const q = (sp.q ?? "").trim().toLowerCase();

  const [all, owing, accounts] = await Promise.all([
    incomeRows(p.start, p.end),
    toCollect(),
    prisma.bankAccount.findMany({
      orderBy: [{ active: "desc" }, { sortOrder: "asc" }, { bankName: "asc" }],
      select: { id: true, bankName: true, accountNumber: true, currency: true, active: true },
    }),
  ]);
  const accountById = new Map(accounts.map((a) => [a.id, a]));

  const rows = all.filter(
    (r) =>
      (!source || r.source === source) &&
      (!accountId || r.accountId === accountId) &&
      (!q ||
        [r.who, r.goods, r.account, r.by, ...r.refs].some((v) => v?.toLowerCase().includes(q)))
  );

  const counted = all.filter((r) => r.counted);
  const total = counted.reduce((s, r) => s + r.amount, 0);
  const passedOn = counted.reduce((s, r) => s + r.transportTzs, 0);
  const tiles = SOURCES.map((s) => ({
    source: s,
    label: SOURCE_LABEL[s],
    value: counted.filter((r) => r.source === s).reduce((t, r) => t + r.amount, 0),
    ...SOURCE_LOOK[s],
  }));
  const byAccount = accounts
    .map((a) => ({ ...a, amount: counted.filter((r) => r.accountId === a.id).reduce((s, r) => s + r.amount, 0) }))
    .filter((a) => a.amount !== 0);

  /* Days, newest first, each with its total. */
  const days: { date: string; total: number; rows: IncomeRow[] }[] = [];
  for (const r of rows) {
    let d = days.at(-1);
    if (d?.date !== r.day) {
      d = { date: r.day, total: 0, rows: [] };
      days.push(d);
    }
    d.rows.push(r);
    if (r.counted) d.total += r.amount;
  }
  const todayKey = darDay(new Date());
  const yesterdayKey = darDay(new Date(Date.now() - DAY_MS));
  const dayLabel = (d: string) =>
    d === todayKey ? T("Today") : d === yesterdayKey ? T("Yesterday") : shortDay(dayStart(d)!);

  const collectTotal = owing.reduce((s, r) => s + r.owedTzs, 0);
  const payers: PayingCustomer[] = [
    ...owing
      .reduce((m, r) => {
        const c = m.get(r.customerId) ?? { id: r.customerId, name: r.customer, bills: 0, owedTzs: 0 };
        c.bills += 1;
        c.owedTzs += r.owedTzs;
        return m.set(r.customerId, c);
      }, new Map<string, PayingCustomer>())
      .values(),
  ].sort((a, b) => b.owedTzs - a.owedTzs);

  const mayRecord = can(user.role, "payment.record");
  const mayFix = can(user.role, "payment.verify");
  const fixAccounts = accounts.map((a) => ({ id: a.id, label: `${a.bankName} (${a.currency})`, currency: a.currency }));

  const keep: Record<string, string> = Object.fromEntries(
    Object.entries({
      source,
      account: accountId,
      q: sp.q ?? "",
      ...(p.key === "custom" ? { from: sp.from ?? "", to: sp.to ?? "" } : { period: p.key }),
    }).filter(([, v]) => v)
  );
  const link = (extra: Record<string, string>) =>
    `?${new URLSearchParams(Object.entries({ ...keep, ...extra }).filter(([, v]) => v) as [string, string][])}`;
  const lastDay = new Date(p.end.getTime() - DAY_MS);
  const heading =
    p.end.getTime() - p.start.getTime() <= DAY_MS
      ? longDay(p.start)
      : `${shortDay(p.start)} → ${shortDay(lastDay)}`;

  return (
    <div className="w-full space-y-5">
      <PageHeader
        title={T("Income")}
        description={T(
          "Every shilling customers have paid — loose cargo, full containers and credit settled — and the account it landed in. Transport fares passed on to drivers are not counted."
        )}
        actions={mayRecord ? <RecordPaymentPicker customers={payers} /> : null}
      />
      <FinanceTabs />

      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 className="text-lg font-semibold">{heading}</h2>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap gap-1 rounded-2xl border bg-card p-1">
            {PERIODS.map(([key, text]) => (
              <Link
                key={key}
                href={link({ period: key, from: "", to: "" })}
                className={cn(
                  "rounded-xl px-3 py-1.5 text-sm transition-colors",
                  p.key === key ? "bg-secondary font-medium text-foreground" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {T(text)}
              </Link>
            ))}
          </div>
          <form className="flex flex-wrap items-center gap-2">
            {Object.entries(keep)
              .filter(([k]) => !["period", "from", "to"].includes(k))
              .map(([k, v]) => (
                <input key={k} type="hidden" name={k} value={v} />
              ))}
            <input
              type="date"
              name="from"
              aria-label={T("From")}
              defaultValue={darDay(p.start)}
              className="h-9 rounded-xl border bg-card px-3 text-sm"
            />
            <span className="text-muted-foreground" aria-hidden>→</span>
            <input
              type="date"
              name="to"
              aria-label={T("To")}
              defaultValue={darDay(lastDay)}
              className="h-9 rounded-xl border bg-card px-3 text-sm"
            />
            <button type="submit" className="h-9 rounded-xl bg-foreground px-4 text-sm font-medium text-background hover:opacity-90">
              {T("Show")}
            </button>
          </form>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="relative col-span-1 flex flex-wrap items-end justify-between gap-4 overflow-hidden rounded-3xl border border-brand/40 bg-gradient-to-br from-brand/[0.14] to-card p-5 sm:col-span-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{T("Income received")}</p>
            <p className="mt-2 text-3xl font-semibold tracking-tight tnum">{tzs(total)}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {counted.length} {counted.length === 1 ? T("payment") : T("payments")} · {T("reversed ones taken off")}
              {passedOn > 0 ? ` · ${tzs(passedOn)} ${T("transport passed on, not counted")}` : ""}
            </p>
          </div>
          {byAccount.length > 0 ? (
            <div className="flex max-w-2xl flex-wrap justify-end gap-1.5">
              {byAccount.map((a) => (
                <Link
                  key={a.id}
                  href={link({ account: accountId === a.id ? "" : a.id })}
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-[11px] font-medium tnum transition",
                    accountId === a.id ? "border-foreground bg-foreground text-background" : "border-border/80 bg-background/50 hover:bg-secondary"
                  )}
                >
                  {a.bankName} · {n(a.amount)}
                </Link>
              ))}
            </div>
          ) : null}
        </div>
        {tiles.map((t) => (
          <Link
            key={t.source}
            href={link({ source: source === t.source ? "" : t.source })}
            className={cn(
              "rounded-3xl border bg-card p-4 transition hover:-translate-y-0.5 hover:border-foreground/25",
              source === t.source ? "border-foreground/40 ring-1 ring-foreground/20" : "border-border/70"
            )}
          >
            <span className={cn("grid size-9 place-items-center rounded-xl", t.tone)}>
              <t.icon className="size-4" />
            </span>
            <p className="mt-3 text-xs text-muted-foreground">{T(t.label)}</p>
            <p className="mt-0.5 whitespace-nowrap text-base font-semibold tnum">{tzs(t.value)}</p>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-5 2xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-4">
          <form className="flex flex-wrap gap-2 rounded-3xl border border-border/70 bg-card p-3">
            {Object.entries(keep)
              .filter(([k]) => ["period", "from", "to"].includes(k))
              .map(([k, v]) => (
                <input key={k} type="hidden" name={k} value={v} />
              ))}
            <div className="relative min-w-60 flex-1">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                name="q"
                defaultValue={sp.q ?? ""}
                placeholder={T("Customer, cargo, invoice, receipt, reference…")}
                className="h-10 w-full rounded-xl border bg-background pl-10 pr-3 text-sm"
              />
            </div>
            <AutoSelect
              name="source"
              value={source}
              label={T("Source")}
              options={[{ value: "", label: T("Every source") }, ...SOURCES.map((k) => ({ value: k, label: T(SOURCE_LABEL[k]) }))]}
            />
            <AutoSelect
              name="account"
              value={accountId}
              label={T("Received through")}
              options={[{ value: "", label: T("Every account") }, ...accounts.map((a) => ({ value: a.id, label: a.bankName }))]}
            />
          </form>

          {rows.length === 0 ? (
            <p className="rounded-3xl border border-dashed p-12 text-center text-sm text-muted-foreground">
              {T("No income recorded for these filters.")}
            </p>
          ) : (
            days.map((d) => (
              <section key={d.date} className="overflow-hidden rounded-3xl border border-border/70 bg-card">
                <header className="flex items-baseline justify-between gap-2 border-b border-border/60 bg-secondary/30 px-4 py-2.5">
                  <p className="text-sm font-semibold">
                    {dayLabel(d.date)}
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      {d.rows.length} {d.rows.length === 1 ? T("line") : T("lines")}
                    </span>
                  </p>
                  <p className="text-sm font-semibold tnum text-success">{tzs(d.total)}</p>
                </header>
                <ul className="divide-y divide-border/50">
                  {d.rows.map((r) => {
                    const look = SOURCE_LOOK[r.source];
                    const account = accountById.get(r.accountId);
                    return (
                      <li
                        key={r.id}
                        className={cn(
                          "flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 transition hover:bg-secondary/30",
                          !r.counted && "opacity-60"
                        )}
                      >
                        <span className={cn("grid size-10 shrink-0 place-items-center rounded-xl", look.tone)}>
                          <look.icon className="size-[18px]" />
                        </span>
                        <div className="min-w-0 flex-1 leading-tight">
                          <p className={cn("truncate font-semibold", !r.counted && "line-through")}>
                            {r.whoHref ? (
                              <Link href={r.whoHref} className="hover:underline">
                                {r.who}
                              </Link>
                            ) : (
                              r.who
                            )}
                            <span className="ml-2 rounded-full bg-secondary px-2 py-0.5 align-middle text-[10px] font-medium text-muted-foreground">
                              {r.counted ? T(SOURCE_LABEL[r.source]) : T("Reversed")}
                            </span>
                          </p>
                          <p className="mt-0.5 truncate text-xs text-muted-foreground">
                            {[
                              time(r.at),
                              r.goods,
                              ...r.refs,
                              r.by ? `${T("by")} ${r.by}` : null,
                              r.transportTzs > 0 ? `${tzs(r.transportTzs)} ${T("transport passed on")}` : null,
                              !r.counted && r.cancelledReason ? r.cancelledReason : null,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </p>
                          {r.ledger.priceChange ? <PriceChanged className="mt-1" change={r.ledger.priceChange} /> : null}
                        </div>
                        <div className="hidden w-44 shrink-0 leading-tight md:block">
                          <p className="truncate text-sm font-medium">{account?.bankName ?? r.account}</p>
                          <p className="truncate font-mono text-[11px] text-muted-foreground">
                            {account?.accountNumber || account?.currency || ""}
                          </p>
                        </div>
                        <span
                          className={cn(
                            "shrink-0 text-right text-[15px] font-semibold tnum sm:order-last sm:min-w-28",
                            !r.counted && "line-through"
                          )}
                        >
                          {tzs(r.amount)}
                        </span>
                        <div className="flex w-full flex-wrap items-center gap-1.5 pl-[52px] empty:hidden sm:w-auto sm:pl-0">
                          {mayFix && r.counted && r.ledger.fix ? (
                            <LedgerRowFix
                              subject={r.ledger.fix}
                              locale={locale}
                              mayEdit={mayFix}
                              mayCancel={mayFix}
                              accounts={fixAccounts}
                              categories={[]}
                            />
                          ) : null}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))
          )}
        </div>

        <aside className="space-y-4 2xl:sticky 2xl:top-24">
          <section className="overflow-hidden rounded-3xl border border-warning/30 bg-card">
            <div className="bg-gradient-to-br from-warning/[0.12] to-transparent p-4">
              <p className="flex items-center gap-2 font-semibold">
                <Wallet className="size-4 text-warning" />
                {T("To collect")}
              </p>
              <p className="mt-1 text-2xl font-semibold tnum">{tzs(collectTotal)}</p>
              <p className="text-xs text-muted-foreground">
                {T("Customers who still owe on bills already sent — cleared goods first. It becomes income only when paid.")}
              </p>
            </div>
            {owing.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">{T("Everyone has paid.")}</p>
            ) : (
              <>
                {/* Most urgent first; beyond six the rest fold away behind "Show all". */}
                <input id="collect-all" type="checkbox" className="peer sr-only" />
                <ul className="divide-y divide-border/60 peer-checked:[&>li]:flex [&>li:nth-child(n+7)]:hidden">
                  {owing.map((r) => {
                    const stage = STAGE[r.stage];
                    return (
                      <li key={r.invoiceId} className="flex items-center gap-3 px-4 py-3">
                        <div className="min-w-0 flex-1 leading-tight">
                          <p className="truncate text-sm font-semibold">{r.customer}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {r.cargoReference} · <span className={stage.tone}>{T(stage.text(r))}</span>
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="text-sm font-semibold tnum">{tzs(r.owedTzs)}</p>
                          <Link
                            href={mayRecord ? `/app/finance/payments/new/${r.customerId}` : `/app/finance/invoices/${r.invoiceId}`}
                            className="text-[11px] font-semibold text-brand hover:underline"
                          >
                            {mayRecord ? T("Take payment →") : T("Open →")}
                          </Link>
                        </div>
                      </li>
                    );
                  })}
                </ul>
                {owing.length > 6 ? (
                  <label
                    htmlFor="collect-all"
                    className="block cursor-pointer border-t border-border/60 px-4 py-2.5 text-center text-xs font-semibold text-muted-foreground hover:text-foreground"
                  >
                    <span className="[.peer:checked~label_&]:hidden">
                      {T("Show all")} {owing.length}
                    </span>
                    <span className="hidden [.peer:checked~label_&]:inline">{T("Show fewer")}</span>
                  </label>
                ) : null}
              </>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
