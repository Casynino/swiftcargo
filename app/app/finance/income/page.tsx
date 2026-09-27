import Link from "next/link";
import type { Metadata } from "next";
import { Banknote, Clock3, Package, Search, Warehouse } from "lucide-react";

import { FinanceTabs } from "@/components/app/finance-tabs";
import { RecordPaymentPicker, type PayingCustomer } from "@/components/app/income-controls";
import { PageHeader } from "@/components/app/page-header";
import { darMidnight, darStartOfDay, darStartOfMonth, darStartOfWeek, darStartOfYear } from "@/lib/dar-time";
import { billedInWindow, darDay, incomeRows, toCollect, type CollectRow, type IncomeRow } from "@/lib/income";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { requirePermission } from "@/lib/session";
import { primeLocale, T } from "@/lib/server-t";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Income" };

const DAY_MS = 24 * 60 * 60 * 1000;
const DAR = "Africa/Dar_es_Salaam";

/*
  EVERYTHING FIRST. A register that opens on today is an empty page on a
  quiet morning; the periods narrow it when somebody wants a day or a month.
*/
const PERIODS = [
  ["all", "All time"],
  ["today", "Today"],
  ["yesterday", "Yesterday"],
  ["week", "This week"],
  ["month", "This month"],
  ["year", "This year"],
] as const;
type PeriodKey = (typeof PERIODS)[number][0] | "custom";

/** Enough to read, few enough to render fast. */
const LIST_CAP = 200;
/** Before this business existed, so "all time" is a window like any other. */
const DAWN = new Date(Date.UTC(2000, 0, 1));

const tsh = (n: number) => `TSh ${Math.round(n).toLocaleString("en-US")}`;

function dayStart(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? darMidnight(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
}

/** The window asked for, half-open, on the Dar calendar. */
function readPeriod(sp: { period?: string; from?: string; to?: string }) {
  const today = darStartOfDay();
  const end = new Date(today.getTime() + DAY_MS);
  const from = sp.from ? dayStart(sp.from) : null;
  const to = sp.to ? dayStart(sp.to) : null;
  if (from && to && to.getTime() >= from.getTime()) {
    return { key: "custom" as PeriodKey, start: from, end: new Date(to.getTime() + DAY_MS) };
  }
  const key = (PERIODS.some(([k]) => k === sp.period) ? sp.period : "all") as PeriodKey;
  switch (key) {
    case "today":
      return { key, start: today, end };
    case "yesterday":
      return { key, start: new Date(today.getTime() - DAY_MS), end: today };
    case "week":
      return { key, start: darStartOfWeek(), end };
    case "month":
      return { key, start: darStartOfMonth(), end };
    case "year":
      return { key, start: darStartOfYear(), end };
    default:
      return { key, start: DAWN, end };
  }
}

const dayLabel = (d: Date) =>
  d.toLocaleDateString("en-GB", { timeZone: DAR, day: "numeric", month: "short", year: "numeric" });
const time = (d: Date) => d.toLocaleTimeString("en-GB", { timeZone: DAR, hour: "2-digit", minute: "2-digit" });

const STAGE: Record<CollectRow["stage"], { text: (r: CollectRow) => string; tone?: string }> = {
  storage: { text: (r) => `storage running · day ${r.storageDay}`, tone: "font-medium text-destructive" },
  cleared: { text: (r) => `cleared · storage day ${r.storageDay}`, tone: "font-medium text-warning" },
  credit: { text: () => "released on credit", tone: "font-medium text-destructive" },
  port: { text: () => "at the port · in clearance" },
  sea: { text: () => "at sea" },
  china: { text: () => "in Guangzhou" },
};

/**
 * INCOME — EVERY SHILLING THAT ACTUALLY ARRIVED.
 *
 * TWO FIGURES THAT ARE NOT THE SAME QUESTION, AND ARE NEVER ADDED. What
 * arrived is a payment: it splits honestly by the account that received it
 * and by nothing else — a payment answers a bill, never a line on a bill. What
 * was billed is the invoice, which really is freight, storage and charges. So
 * the takings lead, the make-up of the bills sits under them, and each says
 * which it is.
 */
export default async function IncomePage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; from?: string; to?: string; account?: string; q?: string }>;
}) {
  await primeLocale();
  const user = await requirePermission("accounting.view");
  const sp = await searchParams;
  const p = readPeriod(sp);
  const accountId = (sp.account ?? "").trim();
  const search = (sp.q ?? "").trim();
  const q = search.toLowerCase();

  const [all, owing, accounts, billed] = await Promise.all([
    incomeRows(p.start, p.end),
    /* What is still owed is true right now, whatever window is read. */
    toCollect(),
    prisma.bankAccount.findMany({
      orderBy: [{ active: "desc" }, { sortOrder: "asc" }, { bankName: "asc" }],
      select: { id: true, bankName: true, accountNumber: true, currency: true },
    }),
    billedInWindow(p.start, p.end),
  ]);
  const accountById = new Map(accounts.map((a) => [a.id, a]));
  const accountName = (id: string) => {
    const a = accountById.get(id);
    return a ? `${a.bankName} (${a.currency})` : "";
  };

  const counted = all.filter((r) => r.counted);
  const total = counted.reduce((s, r) => s + r.amount, 0);
  const tenderedTzs = counted.filter((r) => r.tendered.currency === "TZS").reduce((s, r) => s + r.tendered.amount, 0);
  const byAccount = accounts
    .map((a) => ({ id: a.id, name: accountName(a.id), amount: counted.filter((r) => r.accountId === a.id).reduce((s, r) => s + r.amount, 0) }))
    .filter((a) => a.amount !== 0);

  const matching = all.filter(
    (r) =>
      (!accountId || r.accountId === accountId) &&
      (!q ||
        [r.who, r.goods, ...r.refs, ...r.cargoRefs, ...r.invoiceNumbers, ...r.receiptNumbers].some((v) =>
          v?.toLowerCase().includes(q)
        ))
  );
  const rows = matching.slice(0, LIST_CAP);

  /* One day per heading, in the order the money came in. */
  const byDay = new Map<string, IncomeRow[]>();
  for (const r of rows) byDay.set(r.day, [...(byDay.get(r.day) ?? []), r]);

  const collectTotal = owing.reduce((s, r) => s + r.owedTzs, 0);
  const onCredit = owing.filter((r) => r.stage === "credit").reduce((s, r) => s + r.owedTzs, 0);
  const chase = owing.slice(0, 6);
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

  /** Every control keeps the others, so narrowing never silently resets. */
  const link = (next: Record<string, string | undefined>) => {
    const params = new URLSearchParams();
    const merged = {
      period: p.key === "custom" ? undefined : p.key,
      from: p.key === "custom" ? sp.from : undefined,
      to: p.key === "custom" ? sp.to : undefined,
      q: search,
      account: accountId,
      ...next,
    };
    for (const [k, v] of Object.entries(merged)) if (v) params.set(k, v);
    const s = params.toString();
    return s ? `/app/finance/income?${s}` : "/app/finance/income";
  };

  const lastDay = new Date(p.end.getTime() - DAY_MS);
  const windowLabel =
    p.key === "all"
      ? T("Everything received")
      : p.key === "today" || p.key === "yesterday"
        ? dayLabel(p.start)
        : `${dayLabel(p.start)} → ${dayLabel(lastDay)}`;

  const tiles = [
    { label: "Freight billed", hint: "What the rate book charged to ship it", value: tsh(billed.freight), Icon: Package },
    { label: "Storage billed", hint: "Days past the free week, at the daily rate", value: tsh(billed.storage), Icon: Warehouse },
    { label: "Other charges billed", hint: "Anything added to a bill by hand", value: tsh(billed.other), Icon: Banknote },
    {
      label: "Tendered in shillings",
      hint: "What customers actually handed over, before any conversion",
      value: tenderedTzs > 0 ? tsh(tenderedTzs) : "—",
      Icon: Clock3,
    },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title={T("Income")}
        description={T(
          "Every shilling received from customers, and the account it landed in. Cargo is what this business sells, so this is the freight and storage its customers paid for."
        )}
        actions={mayRecord ? <RecordPaymentPicker customers={payers} /> : null}
      />
      <FinanceTabs />

      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 className="text-lg font-semibold">{windowLabel}</h2>
        <div className="flex flex-wrap items-center gap-2">
          {PERIODS.map(([key, text]) => (
            <Link
              key={key}
              href={link({ period: key, from: undefined, to: undefined })}
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                p.key === key ? "border-foreground/60 bg-secondary text-foreground" : "bg-card text-muted-foreground hover:text-foreground"
              )}
            >
              {T(text)}
            </Link>
          ))}
          {/* A window nobody thought to offer. Plain GET, so it survives a
              reload and can be sent to somebody as a link. */}
          <form className="flex items-center gap-1.5 text-xs" action="/app/finance/income">
            {search ? <input type="hidden" name="q" value={search} /> : null}
            {accountId ? <input type="hidden" name="account" value={accountId} /> : null}
            <input type="date" name="from" aria-label={T("From")} defaultValue={sp.from ?? ""} className="h-8 rounded-lg border bg-card px-2" />
            <span className="text-muted-foreground">→</span>
            <input type="date" name="to" aria-label={T("To")} defaultValue={sp.to ?? ""} className="h-8 rounded-lg border bg-card px-2" />
            <button className="h-8 rounded-lg bg-foreground px-3 font-medium text-background">{T("Show")}</button>
          </form>
        </div>
      </div>

      {/* THE TAKINGS. */}
      <section className="rounded-2xl border border-brand/30 bg-gradient-to-br from-brand/10 to-card p-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">{T("Income received")}</p>
            <p className="mt-2 text-3xl font-bold tnum">{tsh(total)}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {counted.length} {counted.length === 1 ? T("payment") : T("payments")} · {T("reversed ones taken off")}
            </p>
          </div>
          {byAccount.length > 0 ? (
            <div className="flex max-w-2xl flex-wrap justify-end gap-1.5">
              {byAccount.map((a) => (
                <Link
                  key={a.id}
                  href={link({ account: a.id === accountId ? undefined : a.id })}
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-[11px] font-medium tnum transition-colors",
                    accountId === a.id ? "border-foreground bg-foreground text-background" : "bg-card hover:bg-secondary"
                  )}
                >
                  {a.name} · {tsh(a.amount)}
                </Link>
              ))}
            </div>
          ) : null}
        </div>
      </section>

      {/* WHAT THE BILLS WERE MADE OF — billed, not collected. */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {tiles.map((tile) => (
          <div key={tile.label} className="rounded-xl border bg-card p-4 shadow-soft">
            <div className="flex items-center gap-2">
              <tile.Icon className="size-4 text-muted-foreground" />
              <p className="text-xs font-medium text-muted-foreground">{T(tile.label)}</p>
            </div>
            <p className="mt-1.5 text-xl font-bold tnum">{tile.value}</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">{T(tile.hint)}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0">
          <form action="/app/finance/income" className="mb-3 flex flex-wrap items-center gap-2">
            {p.key === "custom" ? (
              <>
                <input type="hidden" name="from" value={sp.from} />
                <input type="hidden" name="to" value={sp.to} />
              </>
            ) : (
              <input type="hidden" name="period" value={p.key} />
            )}
            {accountId ? <input type="hidden" name="account" value={accountId} /> : null}
            <label className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-lg border bg-card px-3">
              <Search className="size-4 shrink-0 text-muted-foreground" />
              <input
                name="q"
                defaultValue={search}
                placeholder={T("Customer, tracking number, receipt, reference…")}
                className="h-full min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
            </label>
            <button className="h-9 rounded-lg border bg-card px-3 text-sm font-medium hover:bg-secondary">{T("Search")}</button>
            {/* The account is narrowed from its chip on the takings card. */}
            {accountId ? (
              <Link href={link({ account: undefined })} className="inline-flex h-9 items-center rounded-lg border px-3 text-xs font-medium hover:bg-secondary">
                {T("Every account")}
              </Link>
            ) : null}
          </form>

          {rows.length === 0 ? (
            <div className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">
              {T("Nothing came in over this period.")}
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border bg-card shadow-soft">
              {[...byDay.entries()].map(([day, list]) => {
                const dayTotal = list.filter((r) => r.counted).reduce((s, r) => s + r.amount, 0);
                return (
                  <div key={day}>
                    <div className="flex items-center justify-between gap-3 border-b bg-secondary/30 px-4 py-2">
                      <p className="text-sm font-semibold">
                        {dayLabel(dayStart(day)!)}{" "}
                        <span className="font-normal text-muted-foreground">
                          {list.length} {list.length === 1 ? T("line") : T("lines")}
                        </span>
                      </p>
                      <p className="text-sm font-semibold tnum text-success">{tsh(dayTotal)}</p>
                    </div>
                    {list.map((r) => {
                      const account = accountById.get(r.accountId);
                      return (
                        <div
                          key={r.id}
                          className={cn("flex flex-wrap items-center gap-3 border-b px-4 py-3 last:border-b-0", !r.counted && "opacity-60")}
                        >
                          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-brand/10 text-brand">
                            <Package className="size-4" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                              <span className={cn("truncate", !r.counted && "line-through")}>{r.who}</span>
                              {r.cargoRefs.map((ref) => (
                                <span key={ref} className="rounded-md bg-secondary px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
                                  {ref}
                                </span>
                              ))}
                              {!r.counted ? (
                                <span className="rounded-md bg-destructive/15 px-1.5 py-0.5 text-[11px] text-destructive">{T("Reversed")}</span>
                              ) : null}
                            </p>
                            <p className="truncate text-xs text-muted-foreground">
                              {[
                                time(r.at),
                                r.receiptNumbers.length ? r.receiptNumbers.join(", ") : T("no receipt"),
                                ...r.invoiceNumbers,
                                r.by ? `${T("by")} ${r.by}` : null,
                                r.transportTzs > 0 ? `${tsh(r.transportTzs)} ${T("transport passed on")}` : null,
                              ]
                                .filter(Boolean)
                                .join(" · ")}
                            </p>
                          </div>
                          <div className="min-w-0 text-right">
                            <p className="truncate text-sm">{account ? `${account.bankName} (${account.currency})` : r.account}</p>
                            {account?.accountNumber ? (
                              <p className="truncate font-mono text-[11px] text-muted-foreground">{account.accountNumber}</p>
                            ) : null}
                          </div>
                          {/* The amount is never edited here — a payment that was
                              wrong is reversed and recorded again, from its entry. */}
                          <Link href={r.href} className="shrink-0 rounded-lg border px-2.5 py-1.5 text-xs font-medium hover:bg-secondary">
                            {T("Open")}
                          </Link>
                          <p className={cn("w-32 shrink-0 text-right text-base font-bold tnum", !r.counted && "line-through")}>
                            {tsh(r.amount)}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
              {matching.length > LIST_CAP ? (
                <p className="border-t px-4 py-2 text-center text-xs text-muted-foreground">
                  {T("Showing the most recent")} {LIST_CAP} {T("payments of this period — narrow the dates to see the rest.")}
                </p>
              ) : null}
            </div>
          )}
        </div>

        {/* WHAT IS STILL OUT THERE — right now, not over the period. */}
        <aside className="self-start rounded-xl border border-warning/30 bg-warning/5 p-4 lg:sticky lg:top-4">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <Clock3 className="size-4 text-warning" />
            {T("To collect")}
          </p>
          <p className="mt-2 text-2xl font-bold tnum">{tsh(collectTotal - onCredit)}</p>
          <p className="text-xs text-muted-foreground">{T("Billed and not paid")}</p>
          {onCredit > 0 ? (
            <p className="mt-2 text-sm">
              <span className="font-semibold tnum">{tsh(onCredit)}</span>{" "}
              <span className="text-xs text-muted-foreground">{T("on credit — goods already released")}</span>
            </p>
          ) : null}
          <p className="mt-2 text-xs text-muted-foreground">{T("It becomes income only when the money is actually received.")}</p>

          <div className="mt-3 space-y-2">
            {chase.map((r) => {
              const stage = STAGE[r.stage];
              return (
                <div key={r.invoiceId} className="rounded-lg border bg-card p-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{r.customer}</p>
                      <p className="truncate text-[11px] text-muted-foreground">
                        {r.cargoReference} · <span className={stage.tone}>{T(stage.text(r))}</span>
                      </p>
                    </div>
                    <p className="shrink-0 text-sm font-semibold tnum">{tsh(r.owedTzs)}</p>
                  </div>
                  <Link
                    href={mayRecord ? `/app/finance/payments/new/${r.customerId}` : `/app/finance/invoices/${r.invoiceId}`}
                    className="mt-1 inline-block text-[11px] font-medium text-brand hover:underline"
                  >
                    {mayRecord ? T("Take payment") : T("Open")} →
                  </Link>
                </div>
              );
            })}
          </div>

          {owing.length > chase.length ? (
            <Link
              href="/app/finance/collections"
              className="mt-3 block rounded-lg border bg-card py-2 text-center text-xs font-medium hover:bg-secondary"
            >
              {T("Show all")} {owing.length}
            </Link>
          ) : owing.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">{T("Everyone has paid.")}</p>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
