import Link from "next/link";
import type { Metadata } from "next";
import { Prisma } from "@prisma/client";
import { Search } from "lucide-react";

import { AskForCredit, ReleaseRequest } from "@/components/app/ask-for-credit";
import { PaymentIcon } from "@/components/app/bill-dialogs";
import { EmptyState } from "@/components/app/empty-state";
import { FinanceTabs } from "@/components/app/finance-tabs";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  CREDIT_STATE_LABEL,
  creditBook,
  dueLabel,
  pendingCreditRequests,
  type CreditRow,
  type CreditState,
} from "@/lib/credit";
import { formatCurrency } from "@/lib/currency";
import { formatDate } from "@/lib/format";
import { t, type Locale } from "@/lib/i18n";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { requirePermission } from "@/lib/session";
import { cn } from "@/lib/utils";

import { primeLocale } from "@/lib/server-t";
export const metadata: Metadata = { title: "Credit" };

const STATE_TONE: Record<CreditState, string> = {
  OPEN: "text-foreground",
  PARTIALLY_PAID: "text-brand",
  OVERDUE: "text-destructive",
  PAID: "text-success",
};

const FILTERS = [
  { key: "", label: "Everything" },
  { key: "OPEN", label: "Still owing" },
  { key: "OVERDUE", label: "Overdue" },
  { key: "DUE_TODAY", label: "Due today" },
  { key: "DUE_WEEK", label: "Due this week" },
  { key: "PARTIALLY_PAID", label: "Part paid" },
  { key: "PAID", label: "Settled" },
] as const;
type Filter = (typeof FILTERS)[number]["key"];

function matches(row: CreditRow, filter: Filter) {
  switch (filter) {
    case "":
      return true;
    case "OPEN":
      return row.owes;
    case "OVERDUE":
      return row.state === "OVERDUE";
    case "DUE_TODAY":
      return row.dueToday;
    case "DUE_WEEK":
      return row.dueThisWeek;
    case "PARTIALLY_PAID":
      return row.owes && row.collectedTzs.greaterThan(0);
    case "PAID":
      return !row.owes;
  }
}

/**
 * CARGO THAT WENT OUT BEFORE THE MONEY CAME IN.
 *
 * The rule is that nothing leaves unpaid, so every row here is a named person
 * deciding otherwise for a stated reason. Ordered by urgency: questions waiting
 * on Finance first, because a customer is standing at the counter until somebody
 * answers them; then the money; then the book, oldest promise first.
 *
 * Both desks read it. Support asks for credit and chases it; Finance releases
 * it. The header is the department's, so it reads the same from either side.
 */
export default async function CreditPage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string; q?: string }>;
}) {
  await primeLocale();
  const user = await requirePermission("finance.view");
  const me = await prisma.user.findUnique({
    where: { id: user.id },
    select: { locale: true },
  });
  const locale = (me?.locale ?? "en") as Locale;

  /* Releasing writes the pickup note, which only Finance may do. Support may
     only ask, and the header button says which of the two a press will do. */
  const canRelease = can(user.role, "payment.verify");
  const canAsk = can(user.role, "payment.submit");

  const sp = await searchParams;
  const filter: Filter = FILTERS.some((f) => f.key === sp.state)
    ? (sp.state as Filter)
    : "";
  const q = sp.q?.trim() ?? "";

  const [{ rows, overview }, requests] = await Promise.all([
    creditBook(),
    canRelease ? pendingCreditRequests() : Promise.resolve([]),
  ]);

  const needle = q.toLowerCase();
  const shown = rows.filter(
    (r) =>
      matches(r, filter) &&
      (needle.length === 0 ||
        [
          r.customerName,
          r.phone,
          r.cargoReference,
          r.noteNumber,
          r.container ?? "",
          ...r.invoices.map((i) => i.number),
        ]
          .join(" ")
          .toLowerCase()
          .includes(needle))
  );

  const tzs = (value: Prisma.Decimal) => formatCurrency(value, "TZS");
  const link = (key: string) => {
    const p = new URLSearchParams();
    if (key) p.set("state", key);
    if (q) p.set("q", q);
    const s = p.toString();
    return s ? `/app/finance/credit?${s}` : "/app/finance/credit";
  };
  const pill = "rounded-full border px-4 py-2 text-sm font-medium transition-colors";

  return (
    <div className="space-y-5">
      <PageHeader
        title={t(locale, "Finance")}
        description={t(
          locale,
          "What the business holds, what it is owed, what it has spent, and every movement between them."
        )}
        actions={canRelease || canAsk ? <AskForCredit canApprove={canRelease} /> : null}
      />

      {/*
        Support shares this page without the books. Finance's row of tabs would
        be a row of doors, most of them locked; the two this desk works are the
        ones it is given.
      */}
      {can(user.role, "accounting.view") ? (
        <FinanceTabs />
      ) : (
        <nav aria-label={t(locale, "Collections workspace")} className="flex flex-wrap gap-2">
          <Link
            href="/app/finance/collections"
            className={cn(pill, "bg-card text-foreground hover:bg-secondary")}
          >
            {t(locale, "Collections")}
          </Link>
          <Link
            href="/app/finance/credit"
            aria-current="page"
            className={cn(pill, "border-brand bg-brand text-brand-foreground")}
          >
            {t(locale, "Credit")}
          </Link>
        </nav>
      )}

      <p className="max-w-3xl text-sm text-muted-foreground">
        {t(
          locale,
          "Cargo released before payment. None of this is cash — it is money customers still owe, and the oldest debt is the one to ring about."
        )}
      </p>

      {requests.length > 0 ? (
        <section className="overflow-hidden rounded-xl border border-warning/40 bg-warning/[0.04]">
          <p className="border-b border-warning/30 px-4 py-2 text-xs font-semibold text-warning">
            {requests.length}{" "}
            {t(
              locale,
              requests.length === 1 ? "customer asked for credit" : "customers asked for credit"
            )}
            {" · "}
            <span className="font-normal text-muted-foreground">
              {t(locale, "the cargo does not move until you answer")}
            </span>
          </p>
          <ul className="divide-y divide-warning/20">
            {requests.map((r) => (
              <li
                key={r.auditId}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">
                    {r.customerName}
                    <span className="tnum ml-2 text-[11px] font-normal text-muted-foreground">
                      {r.cargoReference} · {r.invoiceNumber} · {r.phone}
                    </span>
                  </p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {t(locale, "Asked for credit")} · {r.days} {t(locale, "days")}
                    {r.askedBy ? ` · ${t(locale, "asked by")} ${r.askedBy}` : ""}
                    {` · ${formatDate(r.askedAt)}`}
                    {r.reason ? ` · “${r.reason}”` : ""}
                  </p>
                </div>
                <p className="tnum text-sm font-semibold text-destructive">{r.cargoOwedLabel}</p>
                <ReleaseRequest
                  cargoId={r.cargoId}
                  cargoReference={r.cargoReference}
                  customer={r.customerName}
                  invoiceNumber={r.invoiceNumber}
                  amountLabel={r.cargoOwedLabel}
                  days={r.days}
                  reason={r.reason}
                />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/*
        Six figures, one strip, all in shillings.

        Sold and collected stay apart: a credit sale is revenue that happened and
        cash that did not, and a page that added them would be lying about what
        is in the bank.
      */}
      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-3 xl:grid-cols-6">
        {[
          { k: "Sold on credit", v: overview.sold, tone: "" },
          { k: "Collected", v: overview.collected, tone: "text-success" },
          { k: "Still owed", v: overview.owed, tone: "text-brand" },
          { k: "Overdue", v: overview.overdue, tone: "text-destructive" },
          { k: "Due today", v: overview.dueToday, tone: "text-warning" },
          { k: "Due this week", v: overview.dueThisWeek, tone: "text-warning" },
        ].map((cell) => (
          <div key={cell.k} className="bg-card px-3 py-2.5">
            <dt className="text-[11px] text-muted-foreground">{t(locale, cell.k)}</dt>
            <dd className={cn("tnum text-sm font-semibold leading-tight", cell.tone)}>
              {tzs(cell.v)}
            </dd>
          </div>
        ))}
      </dl>

      <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span>
          {overview.customersOwing}{" "}
          {t(locale, overview.customersOwing === 1 ? "customer owing" : "customers owing")}
        </span>
        {/* A dollar bill with no rate cannot be counted in shillings, so it is
            named beside the figures rather than quietly added to them. */}
        {overview.unconvertedUsd.greaterThan(0) ? (
          <span className="text-warning">
            {t(locale, "plus")} {formatCurrency(overview.unconvertedUsd, "USD")}{" "}
            {t(locale, "on bills with no rate, not counted above")}
          </span>
        ) : null}
      </p>

      <form className="flex gap-2 rounded-xl border bg-card p-3">
        {filter ? <input type="hidden" name="state" value={filter} /> : null}
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            name="q"
            defaultValue={q}
            placeholder={t(locale, "Customer, invoice, tracking or phone…")}
            className="pl-9"
            aria-label={t(locale, "Search the credit book")}
          />
        </div>
        <Button type="submit" variant="outline">
          {t(locale, "Search")}
        </Button>
        {q ? (
          <Button asChild variant="ghost">
            <Link href={link(filter)}>{t(locale, "Clear")}</Link>
          </Button>
        ) : null}
      </form>

      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={link(f.key)}
            aria-current={filter === f.key ? "page" : undefined}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              filter === f.key
                ? "border-brand bg-brand text-brand-foreground"
                : "bg-card hover:bg-secondary"
            )}
          >
            {t(locale, f.label)}
            <span className="tnum ml-1.5 opacity-70">
              {rows.filter((r) => matches(r, f.key)).length}
            </span>
          </Link>
        ))}
      </div>

      {shown.length === 0 ? (
        <div className="rounded-xl border bg-card">
          <EmptyState
            icon="CalendarClock"
            title={t(locale, "No credit here")}
            description={t(
              locale,
              q || filter
                ? "Nothing matches that filter."
                : "Nothing has been released on credit yet. Support asks, Finance approves, and it appears here."
            )}
          />
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card">
          <p className="border-b px-4 py-2 text-xs text-muted-foreground">
            {shown.length} {t(locale, shown.length === 1 ? "credit" : "credits")}
            {" · "}
            {tzs(shown.reduce((n, r) => n.add(r.owedTzs), new Prisma.Decimal(0)))}{" "}
            {t(locale, "still owing")}
          </p>
          {/* One line each, oldest promise first — a call list, in order. */}
          <ul className="divide-y">
            {shown.map((r) => (
              <li key={r.noteId} className="px-4 py-2.5 transition-colors hover:bg-secondary/40">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="flex min-w-0 items-baseline gap-2 text-sm font-semibold">
                    <Link
                      href={`/app/customers/${r.customerId}`}
                      className="truncate hover:text-brand hover:underline"
                    >
                      {r.customerName}
                    </Link>
                    <span className={cn("shrink-0 text-[11px] font-medium", STATE_TONE[r.state])}>
                      {t(locale, CREDIT_STATE_LABEL[r.state])}
                    </span>
                    <span className="tnum hidden shrink-0 text-[11px] font-normal text-muted-foreground sm:inline">
                      {r.phone}
                    </span>
                  </p>
                  <p className="shrink-0 text-right">
                    <span
                      className={cn(
                        "tnum text-sm font-semibold",
                        r.owes ? STATE_TONE[r.state] : "text-success"
                      )}
                    >
                      {r.owes ? r.owedLabel : tzs(r.soldTzs)}
                    </span>
                    {r.owes && r.collectedTzs.greaterThan(0) ? (
                      <span className="tnum ml-1.5 text-[11px] text-muted-foreground">
                        {t(locale, "of")} {tzs(r.soldTzs)}
                      </span>
                    ) : null}
                  </p>
                </div>

                <div className="mt-0.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                  <p className="tnum min-w-0 truncate">
                    <Link href={`/app/cargo/${r.cargoId}`} className="hover:underline">
                      {r.cargoReference}
                    </Link>
                    {r.invoices.map((i) => (
                      <span key={i.id}>
                        {" · "}
                        <Link href={`/app/finance/invoices/${i.id}`} className="hover:underline">
                          {i.number}
                        </Link>
                      </span>
                    ))}
                    {r.container ? ` · ${r.container}` : ""}
                    {" · "}
                    <Link href={`/app/finance/pickup-notes/${r.noteId}`} className="hover:underline">
                      {r.noteNumber}
                    </Link>
                    {r.reason ? ` · “${r.reason}”` : ""}
                    {r.issuedBy ? ` · ${t(locale, "let go by")} ${r.issuedBy}` : ""}
                  </p>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className={cn(r.state === "OVERDUE" && "font-semibold text-destructive")}>
                      {t(locale, dueLabel(r))}
                    </span>
                    {r.dueAt ? <span className="tnum">{formatDate(r.dueAt)}</span> : null}
                    {canAsk && r.owes && r.collectInvoiceId ? (
                      <PaymentIcon invoiceId={r.collectInvoiceId} />
                    ) : null}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
