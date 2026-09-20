import type { Metadata } from "next";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Building2,
  ChevronDown,
  CircleDot,
  Download,
  MessageCircleQuestion,
  Paperclip,
  Search as SearchIcon,
  Smartphone,
  Undo2,
  Wallet,
  type LucideIcon,
} from "lucide-react";

import { AccountCheckButton, type CheckableAccount } from "@/components/app/account-check-button";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { RecordsQueue } from "@/components/app/records-queue";
import { ReviewActions, type Verdict } from "@/components/app/review-actions";
import { SectionTabs } from "@/components/app/section-tabs";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { formatCurrency } from "@/lib/currency";
import { loadBooks } from "@/lib/finance-report";
import { formatDate, formatDateTime, formatRelative } from "@/lib/format";
import { t, type Locale } from "@/lib/i18n";
import { can } from "@/lib/rbac";
import {
  KIND_LABEL,
  PERIOD_LABEL,
  QUEUE_STATES,
  RECORD_KINDS,
  accountCheckPositions,
  bookChecks,
  currentStandings,
  reconciliationQueue,
  recordByKey,
  recordKey,
  reviewHistory,
  type QueueRow,
  type QueueState,
} from "@/lib/reconciliation-workspace";
import { requirePermission } from "@/lib/session";
import { cn } from "@/lib/utils";
import { localeOf } from "@/lib/viewer-locale";

import { primeLocale } from "@/lib/server-t";
import { Tx } from "@/components/app/tx";
export const metadata: Metadata = { title: "Reconciliation" };

/**
 * THE MANAGER'S CONTROL CENTRE, NOT A REPORT.
 *
 * The manager must be able to do the work from this page: see what Finance
 * recorded, hold it against the evidence, and say something about it.
 *
 * NOTHING HERE IS A SECOND SET OF BOOKS. Every row is a payment, a cost, a
 * transfer, an account or a container somebody already recorded. A verdict is
 * an append-only ManagerReview kept BESIDE the record, and an account check is a
 * CashCount kept beside the account — reviewing a payment never edits it.
 *
 * THE TWO WORDS THAT MUST NEVER BLUR. "System" is what the register says,
 * derived from its own rows and typed by nobody. "Actual" is what somebody
 * proved from outside — a statement, a phone, a till. They are labelled as such
 * everywhere on this page, because a screen that mixes them certifies nothing.
 */

/*
  ONE PLACE THAT KNOWS WHAT EACH STATE LOOKS LIKE — the chip on a row, the slice
  of the progress rail and the card at the top. Written out per tone because
  Tailwind scans source text and never sees an interpolated class.
*/
const STATE_STYLE: Record<
  QueueState,
  {
    label: string;
    chip: string;
    dot: string;
    card: string;
    figure: string;
    iconChip: string;
    icon: LucideIcon;
  }
> = {
  PENDING: {
    label: "Pending",
    chip: "border-warning/40 bg-warning/10 text-warning",
    dot: "bg-warning",
    card: "border-warning/25 bg-gradient-to-br from-warning/[0.12] via-card to-card hover:border-warning/45",
    figure: "text-warning",
    iconChip: "bg-warning/15 text-warning ring-1 ring-inset ring-warning/30",
    icon: CircleDot,
  },
  QUERIED: {
    label: "Queried",
    chip: "border-info/40 bg-info/10 text-info",
    dot: "bg-info",
    card: "border-info/25 bg-gradient-to-br from-info/[0.12] via-card to-card hover:border-info/45",
    figure: "text-info",
    iconChip: "bg-info/15 text-info ring-1 ring-inset ring-info/30",
    icon: MessageCircleQuestion,
  },
  MISMATCH: {
    label: "Mismatch",
    chip: "border-destructive/40 bg-destructive/10 text-destructive",
    dot: "bg-destructive",
    card: "border-destructive/25 bg-gradient-to-br from-destructive/[0.12] via-card to-card hover:border-destructive/45",
    figure: "text-destructive",
    iconChip: "bg-destructive/15 text-destructive ring-1 ring-inset ring-destructive/30",
    icon: AlertTriangle,
  },
  SENT_BACK: {
    label: "Sent back",
    chip: "border-signal/40 bg-signal/10 text-signal",
    dot: "bg-signal",
    card: "border-signal/25 bg-gradient-to-br from-signal/[0.12] via-card to-card hover:border-signal/45",
    figure: "text-signal",
    iconChip: "bg-signal/15 text-signal ring-1 ring-inset ring-signal/30",
    icon: Undo2,
  },
  UNDER_REVIEW: {
    label: "Under review",
    chip: "border-brand/40 bg-brand/10 text-brand",
    dot: "bg-brand",
    card: "border-brand/25 bg-gradient-to-br from-brand/[0.12] via-card to-card hover:border-brand/45",
    figure: "text-brand",
    iconChip: "bg-brand/15 text-brand ring-1 ring-inset ring-brand/30",
    icon: SearchIcon,
  },
  RECONCILED: {
    label: "Reconciled",
    chip: "border-success/40 bg-success/10 text-success",
    dot: "bg-success",
    card: "border-success/25 bg-gradient-to-br from-success/[0.12] via-card to-card hover:border-success/45",
    figure: "text-success",
    iconChip: "bg-success/15 text-success ring-1 ring-inset ring-success/30",
    icon: BadgeCheck,
  },
};

/** Four containers on screen; the rest are a scroll away. */
const VISIBLE_CONTAINERS = 4;

const ACCOUNT_ICON: Record<string, LucideIcon> = {
  BANK: Building2,
  MOBILE_MONEY: Smartphone,
  CASH: Wallet,
};

type Params = Record<string, string | undefined>;

/** Every link on this page keeps the filters you are standing in. */
function withParams(params: Params, changes: Params) {
  const next = new URLSearchParams();
  for (const [key, value] of Object.entries({ ...params, ...changes })) {
    if (value) next.set(key, value);
  }
  /* A new filter returns you to the first page; keeping page=3 while narrowing
     to four rows shows an empty list and reads as a bug. */
  if (!("page" in changes)) next.delete("page");
  const query = next.toString();
  return `/app/manager/reconciliation${query ? `?${query}` : ""}`;
}

function StateChip({ state, locale }: { state: QueueState; locale: Locale }) {
  const meta = STATE_STYLE[state];
  const Icon = meta.icon;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold",
        meta.chip
      )}
    >
      <Icon className="size-3" />
      {t(locale, meta.label)}
    </span>
  );
}

const sign = (row: QueueRow) => (row.direction === "OUT" ? "−" : row.direction === "IN" ? "+" : "");

export default async function ManagerReconciliation({
  searchParams,
}: {
  searchParams: Promise<Params>;
}) {
  await primeLocale();
  const user = await requirePermission("record.reconcile");
  const locale = await localeOf(user.id);
  const params = await searchParams;
  const canReview = can(user.role, "record.reconcile");

  const [queue, positions, checks, books, standings] = await Promise.all([
    reconciliationQueue(params),
    accountCheckPositions(),
    bookChecks(),
    loadBooks(),
    currentStandings(),
  ]);

  /* The selected row is fetched rather than assumed to be on this page: a link
     from elsewhere may name a record the current filters exclude. */
  const selected: QueueRow | null = params.tx
    ? (queue.all.find((row) => row.key === params.tx) ?? (await recordByKey(params.tx)))
    : (queue.entries[0] ?? null);

  const selectedState: QueueState = selected?.state ?? "PENDING";
  const history = selected ? await reviewHistory(selected.kind, selected.id) : [];
  const selectedAccount = selected
    ? (positions.find((position) => position.id === selected.accountId) ?? null)
    : null;

  /* THE NEXT ONE STILL WAITING, so a verdict is a rhythm rather than a round
     trip: after this one in the order he is already reading, wrapping back to
     the top if he started in the middle. */
  const currentIndex = selected ? queue.all.findIndex((row) => row.key === selected.key) : -1;
  const nextPending =
    queue.all.slice(currentIndex + 1).find((row) => row.state === "PENDING") ??
    queue.all.find((row) => row.state === "PENDING" && row.key !== selected?.key) ??
    null;

  const reviewed = queue.total - queue.counts.PENDING;
  const progress = queue.total > 0 ? Math.round((queue.counts.RECONCILED / queue.total) * 100) : 0;

  const tzs = (n: { toString(): string }) => formatCurrency(n.toString(), "TZS");
  const usdAside = (n: { isZero(): boolean; toString(): string }) =>
    n.isZero() ? null : `+ ${formatCurrency(n.toString(), "USD")} ${t(locale, "without a rate")}`;

  /* Containers, newest sailing first. The figures are the P&L's own, so this
     band and the finance reports cannot disagree about one box. */
  const containers = [...books.boxes]
    .filter((box) => box.billed.usd > 0 || box.spent.usd > 0 || box.cargo > 0)
    .sort(
      (a, b) =>
        (b.departed?.getTime() ?? Number.MAX_SAFE_INTEGER) -
          (a.departed?.getTime() ?? Number.MAX_SAFE_INTEGER) || b.reference.localeCompare(a.reference)
    )
    .slice(0, 14);
  const selectedContainer = params.container
    ? (containers.find((box) => box.id === params.container) ?? null)
    : null;
  const containerHistory = selectedContainer
    ? await reviewHistory("Container", selectedContainer.id)
    : [];

  const faults = checks.filter((check) => !check.ok);
  const accountsWaiting = positions.filter((p) => !p.lastCheck || p.movedSinceCheck).length;

  const checkable = (p: (typeof positions)[number]): CheckableAccount => ({
    id: p.id,
    name: `${p.bankName} (${p.currency})`,
    kind: p.kind,
    currency: p.currency,
    balance: p.balance,
    balanceText: formatCurrency(p.balance, p.currency),
  });

  const exportQuery = new URLSearchParams(
    Object.entries(params).filter(([key, v]) => Boolean(v) && key !== "tx" && key !== "container") as [
      string,
      string,
    ][]
  ).toString();

  const offer: Verdict[] =
    selectedState === "MISMATCH" || selectedState === "SENT_BACK"
      ? ["UNDER_REVIEW", "QUERIED", "SENT_BACK", "RECONCILED"]
      : ["RECONCILED", "MISMATCH", "SENT_BACK", "QUERIED", "UNDER_REVIEW"];

  return (
    <div className="space-y-6">
      <PageHeader
        title={t(locale, "Reconciliation")}
        description={t(
          locale,
          "Review and reconcile what Finance recorded against the money the accounts actually hold."
        )}
        actions={
          <>
            {canReview && positions.length > 0 ? (
              <AccountCheckButton
                locale={locale}
                accounts={positions.map(checkable)}
                label={t(locale, "Reconcile an account")}
                variant="primary"
              />
            ) : null}
            <a
              href={`/app/manager/reconciliation/export${exportQuery ? `?${exportQuery}` : ""}`}
              className="focus-ring inline-flex h-10 items-center gap-2 rounded-md border bg-background px-4 text-sm font-medium hover:bg-secondary"
            >
              <Download className="size-4" />
              {t(locale, "Export")}
            </a>
          </>
        }
      />
      <SectionTabs />

      {/* WHERE THE WORK STANDS. The bar counts RECONCILED against everything
          inside the current filters, so narrowing to one account or one week
          re-reads it rather than leaving a month's percentage over a week's list. */}
      <section className="rounded-xl border bg-card p-4 shadow-soft">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">{t(locale, "Reconciliation progress")}</p>
            {/* Two questions: what has been AGREED, and what has been LOOKED AT.
                A record sent back has been looked at and is not agreed, which is
                precisely the gap worth seeing. */}
            <p className="mt-0.5 text-xs text-muted-foreground">
              {queue.counts.RECONCILED.toLocaleString("en-US")} {t(locale, "of")}{" "}
              {queue.total.toLocaleString("en-US")} {t(locale, "agreed")}
              {reviewed > queue.counts.RECONCILED ? (
                <>
                  {" · "}
                  {(reviewed - queue.counts.RECONCILED).toLocaleString("en-US")}{" "}
                  {t(locale, "looked at and still open")}
                </>
              ) : null}
            </p>
          </div>
          <p className="tnum text-[26px] font-bold leading-none">{progress}%</p>
        </div>

        {/* THE MIX, NOT A PERCENTAGE OF ONE COLOUR. Every state takes its share
            of the same rail, so the shape of the pile is one glance. */}
        <div className="mt-3 flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full bg-muted">
          {QUEUE_STATES.filter((state) => queue.counts[state] > 0).map((state) => (
            <span
              key={state}
              aria-hidden
              title={`${t(locale, STATE_STYLE[state].label)}: ${queue.counts[state]}`}
              className={cn(
                "h-full transition-[width] duration-500 ease-out-expo first:rounded-l-full last:rounded-r-full",
                STATE_STYLE[state].dot
              )}
              style={{ width: `${queue.total > 0 ? (queue.counts[state] / queue.total) * 100 : 0}%` }}
            />
          ))}
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
          {QUEUE_STATES.map((state) => {
            const meta = STATE_STYLE[state];
            const Icon = meta.icon;
            const active = params.status === state;
            return (
              <Link
                key={state}
                href={withParams(params, { status: active ? undefined : state, tx: undefined })}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "focus-ring group flex items-start justify-between gap-3 rounded-xl border px-3.5 py-3 transition-all hover:-translate-y-px",
                  meta.card,
                  active && "ring-2 ring-inset ring-current"
                )}
              >
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-medium text-muted-foreground">
                    {t(locale, meta.label)}
                  </span>
                  <span className={cn("tnum mt-1.5 block text-[26px] font-bold leading-none", meta.figure)}>
                    {queue.counts[state].toLocaleString("en-US")}
                  </span>
                  <span className="mt-1.5 block text-[11px] text-muted-foreground">
                    {queue.total > 0
                      ? `${Math.round((queue.counts[state] / queue.total) * 100)}% ${t(locale, "of the pile")}`
                      : t(locale, "nothing in this view")}
                  </span>
                </span>
                <span
                  className={cn(
                    "inline-flex size-7 shrink-0 items-center justify-center rounded-lg",
                    meta.iconChip
                  )}
                >
                  <Icon className="size-3.5" />
                </span>
              </Link>
            );
          })}
        </div>
      </section>

      {/* ------------------------------------------------------------- filters */}
      <section>
        <form action="/app/manager/reconciliation" className="rounded-xl border bg-card p-3 shadow-soft">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-6">
            <div className="lg:col-span-2">
              <Input
                name="q"
                defaultValue={params.q ?? ""}
                placeholder={t(locale, "Reference, receipt, invoice, customer, container, vendor…")}
                aria-label={t(locale, "Search")}
              />
            </div>
            <NativeSelect name="account" defaultValue={params.account ?? ""} aria-label={t(locale, "Account")}>
              <option value="">{t(locale, "All accounts")}</option>
              {queue.accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </NativeSelect>
            <NativeSelect name="kind" defaultValue={params.kind ?? ""} aria-label={t(locale, "Type")}>
              <option value="">{t(locale, "All types")}</option>
              {RECORD_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {t(locale, KIND_LABEL[kind])}
                </option>
              ))}
            </NativeSelect>
            <NativeSelect name="person" defaultValue={params.person ?? ""} aria-label={t(locale, "Recorded by")}>
              <option value="">{t(locale, "Anyone")}</option>
              {queue.people.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.name}
                </option>
              ))}
            </NativeSelect>
            <NativeSelect name="period" defaultValue={params.period ?? ""} aria-label={t(locale, "Period")}>
              <option value="">{t(locale, "Any date")}</option>
              {Object.entries(PERIOD_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {t(locale, label)}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button
              type="submit"
              className="focus-ring inline-flex h-10 items-center rounded-md bg-brand px-4 text-sm font-medium text-brand-foreground hover:bg-brand/90"
            >
              {t(locale, "Filter")}
            </button>
            <Link
              href="/app/manager/reconciliation"
              className="focus-ring inline-flex h-10 items-center rounded-md px-3 text-sm text-muted-foreground hover:text-foreground"
            >
              {t(locale, "Clear")}
            </Link>
            {params.status ? <input type="hidden" name="status" value={params.status} /> : null}
          </div>
        </form>

        <div className="mt-3 flex flex-wrap gap-1.5">
          <Link
            href={withParams(params, { status: undefined, tx: undefined })}
            className={cn(
              "focus-ring inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition-colors",
              !params.status ? "border-brand bg-brand text-brand-foreground" : "bg-card hover:bg-muted"
            )}
          >
            {/* Not "All": the default view does not carry agreed records, so its
                pill counts what is actually in it. */}
            {t(locale, "To check")}
            <span className="tnum opacity-75">{queue.total - queue.counts.RECONCILED}</span>
          </Link>
          {QUEUE_STATES.map((state) => {
            const meta = STATE_STYLE[state];
            const active = params.status === state;
            return (
              <Link
                key={state}
                href={withParams(params, { status: active ? undefined : state, tx: undefined })}
                className={cn(
                  "focus-ring inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition-colors",
                  active ? meta.chip : "bg-card hover:bg-muted"
                )}
              >
                {t(locale, meta.label)}
                <span className="tnum opacity-75">{queue.counts[state]}</span>
              </Link>
            );
          })}
        </div>
      </section>

      {/* --------------------------------------------------------- workspace */}
      {/* The two panels end level, and the list scrolls inside its own card —
          the height limit lives where the growth lives, so a busy week cannot
          push the list over the bands below. */}
      <section className="grid grid-cols-1 items-stretch gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] xl:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
        <div className="flex flex-col overflow-hidden rounded-xl border bg-card shadow-soft">
          <div className="border-b px-4 py-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-sm font-semibold">{t(locale, "Records to check")}</h2>
              <p className="text-xs text-muted-foreground">
                {queue.filteredTotal.toLocaleString("en-US")} {t(locale, "shown")}
              </p>
            </div>
            {/* WHAT THIS VIEW ADDS UP TO, over every row the filters match rather
                than the forty on screen, in shillings at each record's own rate.
                Transfers change where money is, not how much, so they are counted
                and left out of In and Out. */}
            <dl className="mt-2 grid grid-cols-3 gap-2 text-center">
              {[
                { label: "In", value: tzs(queue.totals.inTzs), aside: usdAside(queue.totals.inUsd), tone: "text-success" },
                { label: "Out", value: tzs(queue.totals.outTzs), aside: usdAside(queue.totals.outUsd), tone: "text-destructive" },
                {
                  label: "Net",
                  value: tzs(queue.totals.netTzs),
                  aside: queue.totals.moved > 0 ? `${queue.totals.moved} ${t(locale, "transfers not counted")}` : null,
                  tone: queue.totals.netTzs.isNegative() ? "text-destructive" : "text-foreground",
                },
              ].map((cell) => (
                <div key={cell.label} className="rounded-lg bg-muted/30 px-2 py-1.5">
                  <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{t(locale, cell.label)}</dt>
                  <dd className={cn("tnum text-xs font-semibold", cell.tone)}>{cell.value}</dd>
                  {cell.aside ? <dd className="text-[10px] text-muted-foreground">{cell.aside}</dd> : null}
                </div>
              ))}
            </dl>
          </div>

          {/* The rows are formatted here and ticked there: every string the queue
              shows is written on the server, so the client component formats
              nothing and cannot drift from the rest of the page. */}
          <RecordsQueue
            locale={locale}
            canReview={canReview}
            emptyLabel={
              params.status || params.q || params.account || params.kind || params.person || params.period
                ? t(locale, "No record matches these filters.")
                : t(locale, "Nothing is waiting on you. Everything agreed sits under the Reconciled filter.")
            }
            rows={queue.entries.map((row) => ({
              key: row.key,
              href: withParams(params, { tx: row.key, page: params.page }),
              title: row.title,
              meta: [
                formatDate(row.at),
                t(locale, KIND_LABEL[row.kind]),
                row.account ?? t(locale, "no account"),
                row.cancelled ? t(locale, row.kind === "Payment" ? "reversed" : "cancelled") : null,
              ]
                .filter(Boolean)
                .join(" · "),
              amount: `${sign(row)}${formatCurrency(row.amount, row.currency)}`,
              tone: row.direction === "IN" ? "in" : row.direction === "OUT" ? "out" : "move",
              cancelled: row.cancelled,
              badge:
                row.state === "PENDING"
                  ? null
                  : { label: t(locale, STATE_STYLE[row.state].label), className: STATE_STYLE[row.state].chip },
              selected: selected?.key === row.key,
            }))}
          />

          {queue.pages > 1 ? (
            <div className="flex items-center justify-between border-t px-4 py-2 text-xs">
              <Link
                href={withParams(params, { page: String(Math.max(1, queue.page - 1)), tx: undefined })}
                aria-disabled={queue.page === 1}
                className={cn(
                  "focus-ring rounded px-2 py-1",
                  queue.page === 1 ? "pointer-events-none text-muted-foreground/50" : "hover:bg-muted"
                )}
              >
                {t(locale, "Previous")}
              </Link>
              <span className="text-muted-foreground">
                {queue.page} / {queue.pages}
              </span>
              <Link
                href={withParams(params, { page: String(Math.min(queue.pages, queue.page + 1)), tx: undefined })}
                aria-disabled={queue.page === queue.pages}
                className={cn(
                  "focus-ring rounded px-2 py-1",
                  queue.page === queue.pages ? "pointer-events-none text-muted-foreground/50" : "hover:bg-muted"
                )}
              >
                {t(locale, "Next")}
              </Link>
            </div>
          ) : null}
        </div>

        {/* the record under the manager's eye */}
        <div id="record" className="scroll-mt-4 rounded-xl border bg-card shadow-soft">
          {!selected ? (
            <EmptyState
              icon="MousePointerClick"
              title={t(locale, "Nothing selected")}
              description={t(locale, "Pick a record from the list to check it.")}
            />
          ) : (
            <div className="divide-y">
              <div className="px-4 py-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold"><Tx>{selected.title}</Tx></p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-2 font-mono text-[11px] text-muted-foreground">
                      {selected.reference}
                      <StateChip state={selectedState} locale={locale} />
                      {selected.cancelled ? (
                        <span className="rounded-full border border-muted-foreground/30 px-2 py-0.5 font-sans font-semibold">
                          {t(locale, selected.kind === "Payment" ? "Reversed" : "Cancelled")}
                        </span>
                      ) : null}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p
                      className={cn(
                        "tnum text-[22px] font-bold leading-none",
                        selected.cancelled
                          ? "text-muted-foreground line-through"
                          : selected.direction === "OUT"
                            ? "text-destructive"
                            : selected.direction === "IN"
                              ? "text-success"
                              : "text-foreground"
                      )}
                    >
                      {sign(selected)}
                      {formatCurrency(selected.amount, selected.currency)}
                    </p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {selected.tzs && selected.currency !== "TZS"
                        ? `${formatCurrency(selected.tzs, "TZS")} ${t(locale, "at its own rate")}`
                        : t(locale, "what the system recorded")}
                    </p>
                  </div>
                </div>
                <Link
                  href={withParams(params, { tx: undefined, page: params.page })}
                  className="focus-ring mt-2 inline-flex items-center gap-1 rounded text-xs text-muted-foreground hover:text-foreground lg:hidden"
                >
                  <ArrowLeft className="size-3" />
                  {t(locale, "Back to the list")}
                </Link>
              </div>

              {/* One band of facts. Empty is not information, and neither is a
                  field that repeats the heading above it. */}
              <div className="px-4 py-3">
                <dl className="flex flex-wrap gap-x-5 gap-y-2 text-xs">
                  {(
                    [
                      ["Type", t(locale, KIND_LABEL[selected.kind])],
                      ["Date", formatDate(selected.at)],
                      ["Account", selected.account ?? t(locale, "none given")],
                      ["Recorded by", selected.recordedBy ?? "—"],
                      ["Recorded at", formatDateTime(selected.recordedAt)],
                      ...selected.facts,
                    ] as [string, string][]
                  )
                    .filter(([, value]) => value && value !== "—" && value !== selected.title)
                    .map(([label, value]) => (
                      <div key={label} className="min-w-0">
                        <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">
                          {t(locale, label)}
                        </dt>
                        <dd className="truncate">{value}</dd>
                      </div>
                    ))}
                </dl>
                {selected.description && selected.description !== selected.title ? (
                  <p className="mt-2 text-xs leading-snug text-muted-foreground"><Tx>{selected.description}</Tx></p>
                ) : null}
                {selected.cancelledReason ? (
                  <p className="mt-2 text-xs leading-snug text-muted-foreground">
                    {t(locale, selected.kind === "Payment" ? "Reversed because" : "Cancelled because")}:{" "}
                    {selected.cancelledReason}
                  </p>
                ) : null}
                <Link
                  href={selected.href}
                  className="focus-ring mt-2 inline-flex items-center gap-1 rounded text-xs font-semibold text-brand hover:underline"
                >
                  {t(locale, "Open where it was recorded")}
                  <ArrowRight className="size-3" />
                </Link>
              </div>

              {/* SYSTEM VS ACTUAL. A record has no outside figure of its own
                  unless the manager wrote one on a verdict; the account it
                  touched does, from its last check. Both are stated under their
                  own names and never merged. */}
              <div className="grid grid-cols-1 gap-2 bg-muted/20 px-4 py-3 text-xs sm:grid-cols-2">
                <div className="rounded-lg bg-background/60 px-3 py-2">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    {t(locale, "This record")}
                  </p>
                  <p className="tnum mt-1 flex flex-wrap items-baseline gap-x-3">
                    <span>
                      <span className="text-[11px] uppercase text-muted-foreground">{t(locale, "System")} </span>
                      {formatCurrency(selected.amount, selected.currency)}
                    </span>
                    <span>
                      <span className="text-[11px] uppercase text-muted-foreground">{t(locale, "Actual")} </span>
                      {selected.standing?.actualAmount && selected.standing.currency
                        ? formatCurrency(selected.standing.actualAmount, selected.standing.currency)
                        : t(locale, "not given")}
                    </span>
                    {selected.standing?.actualAmount && selected.standing.currency === selected.currency ? (
                      (() => {
                        const gap = selected.standing.actualAmount.sub(selected.amount);
                        return (
                          <span className={cn("font-semibold", gap.isZero() ? "text-success" : "text-destructive")}>
                            <span className="text-[11px] uppercase text-muted-foreground">
                              {t(locale, "Difference")}{" "}
                            </span>
                            {formatCurrency(gap, selected.currency)}
                          </span>
                        );
                      })()
                    ) : null}
                  </p>
                </div>
                {selectedAccount ? (
                  <div className="rounded-lg bg-background/60 px-3 py-2">
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                      {selectedAccount.bankName} ({selectedAccount.currency})
                    </p>
                    <p className="tnum mt-1 flex flex-wrap items-baseline gap-x-3">
                      <span>
                        <span className="text-[11px] uppercase text-muted-foreground">{t(locale, "System")} </span>
                        {formatCurrency(selectedAccount.balance, selectedAccount.currency)}
                      </span>
                      <span>
                        <span className="text-[11px] uppercase text-muted-foreground">{t(locale, "Actual")} </span>
                        {selectedAccount.lastCheck
                          ? formatCurrency(selectedAccount.lastCheck.counted, selectedAccount.currency)
                          : t(locale, "never checked")}
                      </span>
                      {selectedAccount.lastCheck ? (
                        <span
                          className={cn(
                            "font-semibold",
                            selectedAccount.lastCheck.difference === 0 ? "text-success" : "text-destructive"
                          )}
                        >
                          <span className="text-[11px] uppercase text-muted-foreground">
                            {t(locale, "Difference")}{" "}
                          </span>
                          {formatCurrency(selectedAccount.lastCheck.difference, selectedAccount.currency)}
                        </span>
                      ) : null}
                    </p>
                    {selectedAccount.lastCheck ? (
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        {t(locale, "Checked")} {formatRelative(selectedAccount.lastCheck.at)}
                        {selectedAccount.movedSinceCheck ? ` · ${t(locale, "money has moved since")}` : ""}
                      </p>
                    ) : null}
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed px-3 py-2 text-warning">
                    {t(locale, "No account is named on this record, so there is nothing to hold it against.")}
                  </div>
                )}
              </div>

              {/* Evidence: the documents themselves, or the one sentence that
                  matters when there are none. */}
              <div className="px-4 py-3">
                {selected.evidence.length === 0 ? (
                  <p className="flex items-center gap-1.5 text-xs text-warning">
                    <Paperclip className="size-3.5" />
                    {selected.kind === "Transfer"
                      ? t(locale, "Transfers carry no attachment. Hold it against both statements.")
                      : t(locale, "No document attached. Ask for it before agreeing this one.")}
                  </p>
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
                      {t(locale, "Evidence")}
                    </span>
                    {selected.evidence.map((doc, index) => (
                      <a
                        key={`${doc.url}-${index}`}
                        href={doc.url}
                        target="_blank"
                        rel="noreferrer"
                        className="focus-ring inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-success/40 bg-success/10 px-3 text-xs font-medium text-success hover:bg-success/15"
                      >
                        <Paperclip className="size-3.5" />
                        {t(locale, doc.label)}
                        {selected.evidence.length > 1 ? ` ${index + 1}` : ""}
                      </a>
                    ))}
                  </div>
                )}
              </div>

              <div className="px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {t(locale, "Your verdict")}
                </p>
                {canReview ? (
                  <ReviewActions
                    /* Keyed on the record, so moving to the next one is a fresh
                       panel rather than the last one's latch and message. */
                    key={selected.key}
                    className="mt-2"
                    locale={locale}
                    entity={selected.kind}
                    entityId={selected.id}
                    currency={selected.currency}
                    nextHref={nextPending ? withParams(params, { tx: nextPending.key, page: params.page }) : undefined}
                    nextLabel={nextPending ? nextPending.title : undefined}
                    facts={[
                      { label: "Record", value: selected.reference },
                      {
                        label: "System amount",
                        value: `${sign(selected)}${formatCurrency(selected.amount, selected.currency)}`,
                        tone: selected.direction === "OUT" ? "bad" : selected.direction === "IN" ? "good" : undefined,
                      },
                      {
                        label: "Account actual",
                        value: selectedAccount?.lastCheck
                          ? formatCurrency(selectedAccount.lastCheck.counted, selectedAccount.currency)
                          : t(locale, "never checked"),
                      },
                      {
                        label: "Account difference",
                        value: selectedAccount?.lastCheck
                          ? formatCurrency(selectedAccount.lastCheck.difference, selectedAccount.currency)
                          : "—",
                        tone:
                          selectedAccount?.lastCheck && selectedAccount.lastCheck.difference !== 0 ? "bad" : undefined,
                      },
                    ]}
                    offer={offer}
                  />
                ) : (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t(locale, "Reading only — recording a verdict is the manager's and the owner's.")}
                  </p>
                )}
              </div>

              <div className="px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {t(locale, "History")}
                </p>
                <ol className="mt-2 space-y-2">
                  <li className="flex gap-2 text-xs">
                    <span aria-hidden className="mt-1 size-1.5 shrink-0 rounded-full bg-muted-foreground/50" />
                    <span className="min-w-0">
                      <span className="text-muted-foreground">{formatDateTime(selected.recordedAt)} · </span>
                      {t(locale, "Recorded by")} {selected.recordedBy ?? "—"}
                    </span>
                  </li>
                  {history.map((row) => {
                    const meta = STATE_STYLE[row.verdict as QueueState] ?? STATE_STYLE.PENDING;
                    return (
                      <li key={row.id} className="flex gap-2 text-xs">
                        <span aria-hidden className={cn("mt-1 size-1.5 shrink-0 rounded-full", meta.dot)} />
                        <span className="min-w-0">
                          <span className="text-muted-foreground">{formatDateTime(row.createdAt)} · </span>
                          {t(locale, meta.label)} — {row.reviewer.name}
                          {row.actualAmount && row.currency ? (
                            <span className="text-muted-foreground">
                              {" "}
                              · {t(locale, "actual")} {formatCurrency(row.actualAmount, row.currency)}
                            </span>
                          ) : null}
                          {row.note ? <span className="block text-muted-foreground"><Tx>{row.note}</Tx></span> : null}
                        </span>
                      </li>
                    );
                  })}
                </ol>
                <p className="mt-2 text-[11px] text-muted-foreground">
                  {t(locale, "Append-only. Nothing here can be edited or removed.")}
                </p>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ------------------------------------------------------------ accounts */}
      <section id="accounts" className="scroll-mt-4">
        <p className="mb-2 flex items-baseline justify-between gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            {t(locale, "The accounts")}
          </span>
          {accountsWaiting > 0 ? (
            <span className="text-[11px] font-semibold text-warning">
              {accountsWaiting} {t(locale, "need a check")}
            </span>
          ) : null}
        </p>
        <p className="mb-3 text-xs leading-snug text-muted-foreground">
          {t(
            locale,
            "System is what the register says, worked out from its own rows. Actual is what somebody proved from outside it — a statement, a phone, a till count."
          )}
        </p>
        {positions.length === 0 ? (
          <div className="rounded-xl border bg-card">
            <EmptyState icon="Landmark" title={t(locale, "No live accounts")} />
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {positions.map((position) => {
              const Icon = ACCOUNT_ICON[position.kind] ?? Building2;
              const check = position.lastCheck;
              const agrees = check !== null && check.difference === 0;
              const active = params.account === position.id;

              /* The card takes its colour from where it stands and nothing
                 else: unchecked and stale are amber — work outstanding — a gap
                 is red, agreed is green. */
              const state = !check
                ? { label: "Never checked", tone: "warn" as const }
                : position.movedSinceCheck
                  ? { label: "Moved since the check", tone: "warn" as const }
                  : agrees
                    ? { label: "Agrees", tone: "good" as const }
                    : { label: "Off by", tone: "bad" as const };

              const TONE = {
                warn: {
                  card: "border-warning/25 bg-gradient-to-br from-warning/[0.10] via-card to-card",
                  chip: "border-warning/40 bg-warning/15 text-warning",
                  icon: "bg-warning/15 text-warning ring-1 ring-inset ring-warning/30",
                },
                good: {
                  card: "border-success/25 bg-gradient-to-br from-success/[0.10] via-card to-card",
                  chip: "border-success/40 bg-success/15 text-success",
                  icon: "bg-success/15 text-success ring-1 ring-inset ring-success/30",
                },
                bad: {
                  card: "border-destructive/30 bg-gradient-to-br from-destructive/[0.10] via-card to-card",
                  chip: "border-destructive/40 bg-destructive/15 text-destructive",
                  icon: "bg-destructive/15 text-destructive ring-1 ring-inset ring-destructive/30",
                },
              }[state.tone];

              return (
                <div
                  key={position.id}
                  className={cn("rounded-xl border p-3.5 shadow-soft transition-colors", TONE.card, active && "ring-2 ring-brand/40")}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className={cn("inline-flex size-7 shrink-0 items-center justify-center rounded-lg", TONE.icon)}>
                        <Icon className="size-3.5" />
                      </span>
                      <Link
                        href={withParams(params, { account: active ? undefined : position.id, tx: undefined })}
                        className="focus-ring min-w-0 truncate rounded text-sm font-semibold hover:underline"
                      >
                        {position.bankName} ({position.currency})
                      </Link>
                    </div>
                    <span
                      className={cn(
                        "inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide",
                        TONE.chip
                      )}
                    >
                      {t(locale, state.label)}
                      {state.tone === "bad" && check ? ` ${formatCurrency(Math.abs(check.difference), position.currency)}` : null}
                    </span>
                  </div>

                  <p
                    className={cn(
                      "tnum mt-3 text-[19px] font-bold leading-none",
                      position.balance < 0 ? "text-destructive" : "text-foreground"
                    )}
                  >
                    {formatCurrency(position.balance, position.currency)}
                  </p>
                  <p className="mt-1 text-[11px] uppercase tracking-wide text-muted-foreground">
                    {t(locale, "what the register says")}
                  </p>

                  <div className="mt-3 flex items-end justify-between gap-2 border-t pt-2.5">
                    <div className="min-w-0">
                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{t(locale, "Actual")}</p>
                      <p className="tnum truncate text-xs font-semibold">
                        {check
                          ? `${formatCurrency(check.counted, position.currency)} · ${formatRelative(check.at)}`
                          : "—"}
                      </p>
                      {check?.note ? (
                        <p className="truncate text-[11px] text-muted-foreground"><Tx>{check.note}</Tx></p>
                      ) : null}
                    </div>
                    {canReview ? <AccountCheckButton locale={locale} accounts={[checkable(position)]} /> : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ---------------------------------------------------------- containers */}
      <section>
        <p className="mb-2 flex items-baseline justify-between gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            {t(locale, "Containers")}
          </span>
          <Link href="/app/finance/containers" className="focus-ring rounded text-[11px] font-semibold text-brand hover:underline">
            {t(locale, "Every container")}
          </Link>
        </p>
        <div className="overflow-hidden rounded-xl border bg-card shadow-soft">
          <div className="hidden border-b bg-muted/20 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground sm:grid sm:grid-cols-[minmax(0,1fr)_8rem_8rem_8rem_8rem] sm:gap-3">
            <span>{t(locale, "Container")}</span>
            <span className="text-right">{t(locale, "Billed")}</span>
            <span className="text-right">{t(locale, "Collected")}</span>
            <span className="text-right">{t(locale, "Still owed")}</span>
            <span className="text-right">{t(locale, "Costs")}</span>
          </div>

          {containers.length === 0 ? (
            <p className="px-4 py-6 text-center text-xs text-muted-foreground">
              {t(locale, "No container has figures yet.")}
            </p>
          ) : (
            /* Four, then it scrolls: a sailing a month grows this list forever. */
            <ul className="max-h-[176px] divide-y overflow-y-auto">
              {containers.map((box) => {
                const standing = standings.get(recordKey("Container", box.id));
                const state = (standing?.state ?? "PENDING") as QueueState;
                const active = selectedContainer?.id === box.id;
                return (
                  <li key={box.id}>
                    <Link
                      href={withParams(params, { container: active ? undefined : box.id, page: params.page, tx: params.tx })}
                      scroll={false}
                      className={cn(
                        "focus-ring block border-l-2 px-4 py-2.5 transition-colors hover:bg-muted/40",
                        active ? "border-l-brand bg-brand/[0.06]" : "border-l-transparent"
                      )}
                    >
                      <div className="grid grid-cols-1 gap-1 sm:grid-cols-[minmax(0,1fr)_8rem_8rem_8rem_8rem] sm:items-baseline sm:gap-3">
                        <span className="flex items-center gap-2 text-sm font-medium">
                          {box.reference}
                          {state === "PENDING" ? null : <StateChip state={state} locale={locale} />}
                        </span>
                        {[
                          { label: "Billed", value: box.billed.tzs, tone: "" },
                          { label: "Collected", value: box.collected.tzs, tone: "text-success" },
                          { label: "Still owed", value: box.owed.tzs, tone: box.owed.tzs > 0 ? "text-destructive" : "text-muted-foreground" },
                          { label: "Costs", value: box.spent.tzs, tone: "" },
                        ].map((cell) => (
                          <span key={cell.label} className={cn("tnum text-xs sm:text-right", cell.tone)}>
                            <span className="mr-1 text-[11px] uppercase text-muted-foreground sm:hidden">
                              {t(locale, cell.label)}
                            </span>
                            {formatCurrency(cell.value, "TZS")}
                          </span>
                        ))}
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}

          {containers.length > VISIBLE_CONTAINERS ? (
            <p className="flex items-center justify-center gap-1.5 border-t px-4 py-1.5 text-xs text-muted-foreground">
              <ChevronDown className="size-3" />
              {t(locale, "scroll for")} {containers.length - VISIBLE_CONTAINERS} {t(locale, "more")}
            </p>
          ) : null}

          {selectedContainer ? (
            <div className="border-t bg-muted/10 px-4 py-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-sm font-semibold">
                  {selectedContainer.reference}
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    {formatCurrency(selectedContainer.billed.tzs, "TZS")} {t(locale, "billed")} ·{" "}
                    {formatCurrency(selectedContainer.collected.tzs, "TZS")} {t(locale, "collected")} ·{" "}
                    {formatCurrency(selectedContainer.owed.tzs, "TZS")} {t(locale, "still owed")} ·{" "}
                    {formatCurrency(selectedContainer.spent.tzs, "TZS")} {t(locale, "cost")}
                  </span>
                </p>
                {containerHistory.length > 0 ? (
                  <p className="text-[11px] text-muted-foreground">
                    {t(locale, "Last said")}:{" "}
                    {t(
                      locale,
                      STATE_STYLE[containerHistory[containerHistory.length - 1].verdict as QueueState]?.label ?? ""
                    )}{" "}
                    · {formatRelative(containerHistory[containerHistory.length - 1].createdAt)}
                  </p>
                ) : null}
              </div>
              {canReview ? (
                <ReviewActions
                  key={selectedContainer.id}
                  className="mt-2"
                  size="sm"
                  locale={locale}
                  entity="Container"
                  entityId={selectedContainer.id}
                  offer={["RECONCILED", "SENT_BACK", "QUERIED", "UNDER_REVIEW"]}
                />
              ) : null}
            </div>
          ) : (
            <p className="border-t px-4 py-2 text-[11px] text-muted-foreground">
              {t(locale, "Pick a container to agree its figures or hand them back.")}
            </p>
          )}
        </div>
      </section>

      {/* ------------------------------------------- the books against themselves */}
      <section>
        <p className="mb-2 flex items-baseline justify-between gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            {t(locale, "The books against themselves")}
          </span>
          {faults.length > 0 ? (
            <span className="text-[11px] font-semibold text-destructive">
              {faults.length} {t(locale, "disagree")}
            </span>
          ) : null}
        </p>
        <div className="rounded-xl border bg-card p-4 shadow-soft">
          <p className="text-xs leading-snug text-muted-foreground">
            {t(
              locale,
              "Each figure asked twice, by two different routes. These need no verdict — they are arithmetic, and a disagreement is a fault to chase."
            )}
          </p>
          <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {[...checks]
              .sort((a, b) => Number(a.ok) - Number(b.ok))
              .map((check) => (
                <li key={check.key}>
                  <Link
                    href={check.href}
                    className={cn(
                      "focus-ring group relative block h-full overflow-hidden rounded-xl border p-3.5 transition-all hover:-translate-y-px hover:shadow-lg",
                      check.ok
                        ? "bg-card hover:border-brand/40"
                        : "border-destructive/40 bg-gradient-to-br from-destructive/[0.10] via-card to-card"
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-semibold leading-snug">{t(locale, check.label)}</p>
                      <span
                        className={cn(
                          "inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide",
                          check.ok
                            ? "border-success/30 bg-success/10 text-success"
                            : "border-destructive/40 bg-destructive/15 text-destructive"
                        )}
                      >
                        {check.ok ? <BadgeCheck className="size-3" /> : <AlertTriangle className="size-3" />}
                        {check.ok ? t(locale, "Agrees") : t(locale, "Differs")}
                      </span>
                    </div>
                    <p className="mt-1 text-xs leading-snug text-muted-foreground">{t(locale, check.question)}</p>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      {[check.left, check.right].map((side) => (
                        <div
                          key={side.label}
                          className={cn("rounded-lg px-2.5 py-2", check.ok ? "bg-muted/40" : "bg-background/60")}
                        >
                          <p className="truncate text-[11px] uppercase tracking-wide text-muted-foreground">
                            {t(locale, side.label)}
                          </p>
                          <p className="tnum mt-0.5 text-sm font-semibold">{side.value.toLocaleString("en-US")}</p>
                        </div>
                      ))}
                    </div>
                    <p className={cn("mt-2 text-xs font-semibold", check.ok ? "text-success" : "text-destructive")}>
                      {check.ok
                        ? t(locale, "The two agree.")
                        : `${t(locale, "Apart by")} ${Math.abs(check.left.value - check.right.value).toLocaleString("en-US")}`}
                    </p>
                    <p
                      className={cn(
                        "mt-2 flex items-center gap-1 text-xs font-semibold",
                        check.ok ? "text-brand/80" : "text-destructive"
                      )}
                    >
                      {check.ok ? t(locale, "Open the register behind this check") : t(locale, check.chase)}
                      <ArrowRight className="size-3 shrink-0 transition-transform group-hover:translate-x-0.5" />
                    </p>
                  </Link>
                </li>
              ))}
          </ul>
          {faults.length > 0 ? (
            <p className="mt-3 rounded-lg border border-destructive/40 bg-destructive/[0.05] px-3 py-2 text-xs font-medium text-destructive">
              {faults.length} {t(locale, "check(s) disagree — chase these before agreeing the month.")}
            </p>
          ) : null}
        </div>
      </section>
    </div>
  );
}
