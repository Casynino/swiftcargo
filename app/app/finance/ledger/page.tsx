import Link from "next/link";
import type { Metadata } from "next";
import { CalendarClock, ChevronRight, Layers, Paperclip, Plus, Wallet } from "lucide-react";

import { EmptyState } from "@/components/app/empty-state";
import { FinanceTabs } from "@/components/app/finance-tabs";
import { LedgerFilters } from "@/components/app/ledger-filters";
import { LedgerRowFix } from "@/components/app/ledger-row-fix";
import { PageHeader } from "@/components/app/page-header";
import { RecordPaymentButton } from "@/components/app/record-payment-button";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { creditBook } from "@/lib/credit";
import { formatCurrency, toBase } from "@/lib/currency";
import { formatDate } from "@/lib/format";
import { t } from "@/lib/i18n";
import { ledgerRows, type LedgerPerson, type LedgerRow } from "@/lib/ledger";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { requirePermission } from "@/lib/session";
import { cn } from "@/lib/utils";
import { localeOf } from "@/lib/viewer-locale";

import { primeLocale } from "@/lib/server-t";
import { Tx } from "@/components/app/tx";
export const metadata: Metadata = { title: "General ledger" };

const PAGE_SIZE = 50;

const KINDS: Record<string, { label: string; test: (r: LedgerRow) => boolean }> = {
  sale: { label: "Cash sale", test: (r) => r.kind === "payment" && !r.transport && !r.credit },
  credit: { label: "Credit payment", test: (r) => r.kind === "payment" && !r.transport && r.credit },
  transport: { label: "Transport paid out", test: (r) => r.transport },
  expense: { label: "Expense", test: (r) => r.kind === "expense" },
  transfer_in: { label: "Transfer in", test: (r) => r.kind === "transfer" && r.direction === "IN" },
  transfer_out: { label: "Transfer out", test: (r) => r.kind === "transfer" && r.direction === "OUT" },
  opening: { label: "Opening balance", test: (r) => r.kind === "opening" },
};

function windowStart(period: string | undefined): Date | null {
  const now = new Date();
  if (period === "today") return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (period === "week") {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return d;
  }
  if (period === "month") return new Date(now.getFullYear(), now.getMonth(), 1);
  if (period === "year") return new Date(now.getFullYear(), 0, 1);
  return null;
}

/**
 * THE GENERAL LEDGER: EVERY MOVEMENT OF MONEY, IN ONE REGISTER.
 *
 * Read from the same register the account balances are added up from — opening
 * balances, verified payments with the transport that came in them, that
 * transport paid out, costs paid from an account, and money moved between our
 * own accounts — so the last balance here is what the accounts hold between
 * them, and the two screens cannot disagree.
 *
 * Debit and credit are separate columns because that is how a ledger is read:
 * the eye runs down one for what left and the other for what came in. The
 * running balance is in shillings, and a dollar movement is counted at the rate
 * it was taken at — never at today's, which would restate last month's money
 * every time the rate board changes.
 *
 * Cancelled and reversed rows stay on the list, struck through and not
 * counted. A movement that vanishes is one nobody can ask about.
 */
export default async function LedgerPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    account?: string;
    direction?: string;
    kind?: string;
    category?: string;
    person?: string;
    period?: string;
    page?: string;
  }>;
}) {
  await primeLocale();
  const user = await requirePermission("accounting.view");
  const locale = await localeOf(user.id);
  const params = await searchParams;
  const page = Math.max(1, Math.floor(Number(params.page)) || 1);

  const mayVerify = can(user.role, "payment.verify");
  const mayCost = can(user.role, "expense.record");
  const mayMove = can(user.role, "accounting.manage");
  const mayFix = mayVerify || mayCost || mayMove;
  const mayOpenCustomer = can(user.role, "customer.view");
  const mayOpenStaff = can(user.role, "user.manage");

  const [rows, accounts, categories, unpaid, unassigned, rate, credit] = await Promise.all([
    ledgerRows(locale),
    prisma.bankAccount.findMany({
      orderBy: [{ active: "desc" }, { sortOrder: "asc" }, { bankName: "asc" }],
      select: { id: true, bankName: true, currency: true, active: true },
    }),
    prisma.expenseType.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    /* A cost with no account named has not been paid. No money has moved, so it
       is not in the register — but it is money the business owes. */
    prisma.containerExpense.groupBy({
      by: ["currency"],
      where: { accountId: null, cancelledAt: null, deletedAt: null },
      _sum: { amount: true },
      _count: true,
    }),
    /* Money verified with no account named is real, and it is not in the
       register: there is no account for it to sit in. */
    prisma.payment.findMany({
      where: { status: "VERIFIED", accountId: null, writtenOff: false },
      select: { amount: true, currency: true, baseCurrencyAmount: true },
    }),
    prisma.exchangeRate.findFirst({
      where: { active: true },
      orderBy: { effectiveFrom: "desc" },
      select: { rate: true },
    }),
    /* Asked only of a desk allowed to read the credit book: a figure never
       fetched cannot leak if the two permissions stop travelling together. */
    can(user.role, "finance.view") ? creditBook().then((b) => b.overview) : null,
  ]);

  const accountLabel = (a: { bankName: string; currency: string }) => `${a.bankName} (${a.currency})`;
  const single = accounts.find((a) => a.id === params.account) ?? null;

  /* Everyone who is named on a movement, and nobody else. */
  const peopleById = new Map<string, string>();
  for (const r of rows) {
    for (const p of [r.submittedBy, r.verifiedBy]) if (p?.id) peopleById.set(p.id, p.name);
  }
  const people = [...peopleById].sort((a, b) => a[1].localeCompare(b[1]));

  /* The balance runs down the whole register, oldest first, whatever the other
     filters show: a balance that restarts at zero when you filter is not a
     balance. Narrowed to one account it is that account's own, in its own
     currency. A cancelled row moved nothing, so it carries the balance above. */
  const runningById = new Map<string, number>();
  {
    let running = 0;
    for (const r of [...rows].reverse()) {
      if (single && r.accountId !== single.id) continue;
      if (!r.cancelled) {
        running += (r.direction === "IN" ? 1 : -1) * (single ? r.amount : r.tzs);
        if (single) running = Math.round(running * 100) / 100;
      }
      runningById.set(r.id, running);
    }
  }

  const q = params.q?.trim().toLowerCase() ?? "";
  const kind = params.kind && params.kind in KINDS ? KINDS[params.kind] : null;
  const from = windowStart(params.period);
  const shown = rows.filter((r) => {
    if (params.account && r.accountId !== params.account) return false;
    if ((params.direction === "IN" || params.direction === "OUT") && r.direction !== params.direction) {
      return false;
    }
    if (kind && !kind.test(r)) return false;
    if (params.category && r.categoryId !== params.category) return false;
    if (params.person && !r.people.includes(params.person)) return false;
    if (from && r.at < from) return false;
    if (q && !r.search.includes(q) && !r.type.toLowerCase().includes(q)) return false;
    return true;
  });

  const live = shown.filter((r) => !r.cancelled);
  const cancelledRows = shown.length - live.length;
  const moneyIn = live.filter((r) => r.direction === "IN").reduce((s, r) => s + r.tzs, 0);
  const moneyOut = live.filter((r) => r.direction === "OUT").reduce((s, r) => s + r.tzs, 0);
  const net = moneyIn - moneyOut;

  const pages = Math.max(1, Math.ceil(shown.length / PAGE_SIZE));
  const onPage = shown.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  /* Money that has not moved yet is read at today's rate — it has no rate of
     its own until it moves. */
  const fx = rate?.rate ?? null;
  const todayTzs = (amount: unknown, currency: string) =>
    currency === "TZS" ? Number(amount) : fx ? Number(toBase(String(amount), currency, fx)) : 0;
  const unpaidCount = unpaid.reduce((n, u) => n + u._count, 0);
  const unpaidTzs = unpaid.reduce((s, u) => s + todayTzs(u._sum.amount ?? 0, u.currency), 0);
  const unassignedTzs = unassigned.reduce(
    (s, p) => s + (p.baseCurrencyAmount ? Number(p.baseCurrencyAmount) : todayTzs(p.amount, p.currency)),
    0
  );

  const tzs = (n: number) => formatCurrency(Math.round(n), "TZS");
  const showBalance = (n: number) => (single ? formatCurrency(n, single.currency) : tzs(n));

  const pageLink = (next: number) => {
    const qs = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value && key !== "page") qs.set(key, String(value));
    }
    if (next > 1) qs.set("page", String(next));
    const s = qs.toString();
    return s ? `/app/finance/ledger?${s}` : "/app/finance/ledger";
  };

  const person = (p: LedgerPerson, tone: string) =>
    mayOpenStaff && p.id ? (
      <Link href={`/app/admin/users/${p.id}`} className={cn("hover:underline", tone)}>
        {p.name}
      </Link>
    ) : (
      <span className={tone}>{p.name}</span>
    );

  const fixAccounts = accounts
    .filter((a) => a.active)
    .map((a) => ({ id: a.id, label: accountLabel(a), currency: a.currency }));

  return (
    <div className="space-y-4">
      <PageHeader
        title={t(locale, "Finance")}
        actions={
          <>
            {can(user.role, "payment.submit") ? (
              <>
                <RecordPaymentButton compact />
                <Button asChild size="sm" variant="outline">
                  <Link href="/app/finance/payments/new">
                    <Layers />
                    {t(locale, "Merge")}
                  </Link>
                </Button>
              </>
            ) : null}
            {can(user.role, "finance.view") ? (
              <Button asChild size="sm" variant="outline">
                <Link href="/app/finance/credit">
                  <CalendarClock />
                  {t(locale, "Credit")}
                </Link>
              </Button>
            ) : null}
            {mayCost ? (
              <Button asChild size="sm" variant="outline">
                <Link href="/app/finance/expenses">
                  <Plus />
                  {t(locale, "Cost")}
                </Link>
              </Button>
            ) : null}
          </>
        }
      />
      <FinanceTabs />

      <p className="max-w-3xl text-sm text-muted-foreground">
        {t(
          locale,
          "Every movement of money — freight collected, costs paid, transfers between accounts — with its account, who recorded it, and a running balance."
        )}
      </p>

      <LedgerFilters
        locale={locale}
        accounts={accounts.map((a) => ({ value: a.id, label: accountLabel(a) }))}
        people={people.map(([value, label]) => ({ value, label }))}
        kinds={Object.entries(KINDS).map(([value, k]) => ({ value, label: t(locale, k.label) }))}
        categories={categories.map((c) => ({ value: c.id, label: c.name }))}
      />

      {/* In, out and net follow the filters, so narrowing to one account or one
          month re-totals them. Cancelled rows are listed below and never
          counted here. */}
      <dl className="grid grid-cols-1 gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-3">
        {[
          {
            k: "Money in",
            v: tzs(moneyIn),
            tone: "text-success",
            wash: "from-success/10",
            hint: t(locale, "Everything that landed, transport included"),
          },
          {
            k: "Money out",
            v: tzs(moneyOut),
            tone: "text-destructive",
            wash: "from-destructive/10",
            hint: t(locale, "Costs, refunds, transport passed on — and moves between our own accounts"),
          },
          {
            k: "Net",
            v: tzs(net),
            tone: net >= 0 ? "text-foreground" : "text-destructive",
            wash: net >= 0 ? "from-brand/10" : "from-destructive/10",
            hint:
              cancelledRows > 0
                ? `${live.length} ${t(locale, live.length === 1 ? "movement" : "movements")} · ${cancelledRows} ${t(locale, "cancelled, not counted")}`
                : `${shown.length} ${t(locale, shown.length === 1 ? "movement" : "movements")}`,
          },
        ].map((cell) => (
          <div key={cell.k} className={cn("bg-card bg-gradient-to-b to-transparent px-5 py-4", cell.wash)}>
            <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">
              {t(locale, cell.k)}
            </dt>
            <dd className={cn("tnum mt-1 whitespace-nowrap text-2xl font-bold leading-tight", cell.tone)}>
              {cell.v}
            </dd>
            <p className="mt-0.5 text-[11px] text-muted-foreground"><Tx>{cell.hint}</Tx></p>
          </div>
        ))}
      </dl>

      {unpaidCount > 0 ? (
        <p className="text-sm text-muted-foreground">
          <Link
            href="/app/finance/expenses?group=unpaid&period=all"
            className="font-medium text-warning hover:underline"
          >
            {tzs(unpaidTzs)} {t(locale, "in costs still to pay")}
          </Link>
          {" — "}
          {unpaidCount} {t(locale, unpaidCount === 1 ? "cost" : "costs")},{" "}
          {t(
            locale,
            "money the business owes. Not counted above, because none of it has left an account yet."
          )}
        </p>
      ) : null}

      {credit && Number(credit.owed) > 0 ? (
        <p className="text-sm text-muted-foreground">
          <Link href="/app/finance/credit" className="font-medium text-brand hover:underline">
            {tzs(Number(credit.owed))} {t(locale, "released on credit and still owed")}
          </Link>
          {Number(credit.overdue) > 0 ? (
            <span className="font-medium text-destructive">
              {", "}
              {tzs(Number(credit.overdue))} {t(locale, "overdue")}
            </span>
          ) : null}
          {". "}
          {t(
            locale,
            "None of it is in this register: cargo let go on credit moves no money, so it touches no account. It appears here as a credit payment on the day the customer pays."
          )}
        </p>
      ) : null}

      {unassigned.length > 0 ? (
        <p className="flex items-center gap-2 rounded-xl border border-warning/40 bg-warning/[0.06] px-4 py-3 text-sm">
          <Wallet className="size-4 shrink-0 text-warning" />
          <span>
            {unassigned.length}{" "}
            {t(locale, unassigned.length === 1 ? "verified payment" : "verified payments")} (
            {tzs(unassignedTzs)}){" "}
            {t(
              locale,
              unassigned.length === 1
                ? "with no account named is not on the ledger until somebody says where the money landed."
                : "with no account named are not on the ledger until somebody says where the money landed."
            )}
          </span>
        </p>
      ) : null}

      {onPage.length === 0 ? (
        <div className="rounded-xl border bg-card">
          <EmptyState
            icon="BookOpen"
            title={q ? `${t(locale, "Nothing matches")} “${params.q?.trim()}”` : t(locale, "No movements yet")}
            description={
              rows.length > 0
                ? t(locale, "Try a shorter search, or clear the filters.")
                : t(locale, "Every payment, cost and transfer writes a line here as it happens.")
            }
          />
        </div>
      ) : (
        <div className="relative overflow-x-auto rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t(locale, "Date")}</TableHead>
                <TableHead>{t(locale, "Description")}</TableHead>
                <TableHead>{t(locale, "Type")}</TableHead>
                <TableHead>{t(locale, "Account")}</TableHead>
                <TableHead>{t(locale, "By")}</TableHead>
                <TableHead className="text-right">{t(locale, "Debit")}</TableHead>
                <TableHead className="text-right">{t(locale, "Credit (in)")}</TableHead>
                <TableHead className="text-right">{t(locale, "Balance")}</TableHead>
                <TableHead className="text-right">{t(locale, "Proof")}</TableHead>
                {mayFix ? <TableHead className="text-right">{t(locale, "Fix")}</TableHead> : null}
                <TableHead className="w-8" aria-label={t(locale, "Open")} />
              </TableRow>
            </TableHeader>
            <TableBody>
              {onPage.map((r) => {
                const inbound = r.direction === "IN";
                const amount = formatCurrency(r.amount, r.currency);
                const twoPeople = r.verifiedBy && r.submittedBy && r.verifiedBy.id !== r.submittedBy.id;
                const one = r.submittedBy ?? r.verifiedBy;
                const mayEditRow =
                  r.fix?.kind === "payment" ? mayVerify : r.fix?.kind === "expense" ? mayCost : false;
                const mayCancelRow =
                  r.fix?.kind === "payment"
                    ? mayVerify
                    : r.fix?.kind === "expense"
                      ? mayCost
                      : r.fix?.kind === "transfer"
                        ? mayMove
                        : false;
                return (
                  <TableRow
                    key={r.id}
                    className={cn(
                      "transition-colors hover:bg-secondary/40",
                      r.executive &&
                        "bg-warning/[0.07] shadow-[inset_3px_0_0_0_hsl(var(--warning))] hover:bg-warning/[0.12]"
                    )}
                  >
                    <TableCell className="whitespace-nowrap py-2.5 text-xs text-muted-foreground">
                      {formatDate(r.at)}
                    </TableCell>

                    <TableCell className="min-w-[17rem] max-w-[30rem] py-2.5">
                      <span
                        className={cn(
                          "block truncate text-sm font-semibold",
                          r.cancelled && "text-muted-foreground line-through"
                        )}
                      >
                        {r.cancelled ? (
                          <span className="mr-1.5 inline-block rounded bg-muted px-1.5 py-0.5 text-[11px] font-bold text-muted-foreground no-underline">
                            {t(locale, "Cancelled")}
                          </span>
                        ) : null}
                        {r.titleHref && mayOpenCustomer ? (
                          <Link href={r.titleHref} className="hover:text-brand hover:underline">
                            <Tx>{r.title}</Tx>
                          </Link>
                        ) : (
                          r.title
                        )}
                        {r.transport ? (
                          <span className="ml-1.5 whitespace-nowrap rounded bg-brand/15 px-1.5 py-0.5 text-[11px] font-semibold text-brand no-underline">
                            {t(locale, "Transport")}
                          </span>
                        ) : null}
                      </span>
                      <span className="mt-0.5 line-clamp-3 text-xs leading-relaxed text-muted-foreground">
                        {r.purpose ? <>{r.purpose} </> : null}
                        {r.refs.map((ref, i) => (
                          <span key={ref}>
                            {i > 0 || r.purpose ? "· " : null}
                            <span className="whitespace-nowrap font-mono text-muted-foreground/70">{ref}</span>{" "}
                          </span>
                        ))}
                        {r.writtenOffTzs ? (
                          <span className="ml-0.5 whitespace-nowrap rounded bg-warning/15 px-1.5 py-0.5 text-[11px] font-medium text-warning">
                            {tzs(r.writtenOffTzs)} {t(locale, "written off")}
                          </span>
                        ) : null}
                      </span>
                      {r.cancelled && r.cancelledReason ? (
                        <span className="mt-0.5 block text-xs text-muted-foreground">
                          {t(locale, r.kind === "payment" ? "Reversed" : "Cancelled")} — {r.cancelledReason}
                        </span>
                      ) : null}
                    </TableCell>

                    <TableCell className="whitespace-nowrap py-2.5 text-xs">
                      {r.executive ? (
                        <span className="inline-flex items-center whitespace-nowrap rounded-full bg-warning px-2 py-0.5 text-[11px] font-bold text-warning-foreground">
                          {t(locale, "Executive")} · {r.type}
                        </span>
                      ) : (
                        r.type
                      )}
                    </TableCell>

                    <TableCell className="whitespace-nowrap py-2.5 text-xs">
                      <Link href={`/app/finance/accounts/${r.accountId}`} className="hover:text-brand">
                        {r.account}
                      </Link>
                    </TableCell>

                    <TableCell className="min-w-[8.5rem] py-2.5 text-xs text-muted-foreground">
                      {twoPeople ? (
                        <span className="flex max-w-[10rem] flex-col gap-0.5 text-[11px] leading-tight">
                          <span className="truncate">
                            <span className="text-muted-foreground/60">{t(locale, "Submitted by")} </span>
                            {person(r.submittedBy!, "text-brand")}
                          </span>
                          <span className="truncate">
                            <span className="text-muted-foreground/60">{t(locale, "Verified by")} </span>
                            {person(r.verifiedBy!, "text-success")}
                          </span>
                        </span>
                      ) : one ? (
                        person(one, "")
                      ) : (
                        "—"
                      )}
                    </TableCell>

                    <TableCell className="tnum whitespace-nowrap py-2.5 text-right text-sm">
                      {inbound ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <span className={r.cancelled ? "text-muted-foreground line-through" : "text-destructive"}>
                          {amount}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="tnum whitespace-nowrap py-2.5 text-right text-sm">
                      {inbound ? (
                        <span className={r.cancelled ? "text-muted-foreground line-through" : "text-success"}>
                          {amount}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="tnum whitespace-nowrap py-2.5 text-right text-sm font-semibold">
                      {showBalance(runningById.get(r.id) ?? 0)}
                    </TableCell>

                    <TableCell className="py-2.5 text-right text-xs">
                      {r.proofHref ? (
                        <a
                          href={r.proofHref}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 font-medium text-brand hover:underline"
                        >
                          <Paperclip className="size-3" />
                          {t(locale, "View")}
                        </a>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>

                    {mayFix ? (
                      <TableCell className="whitespace-nowrap py-2.5 pr-1 text-right">
                        {r.fix && !r.cancelled ? (
                          <LedgerRowFix
                            subject={r.fix}
                            locale={locale}
                            mayEdit={mayEditRow}
                            mayCancel={mayCancelRow}
                            accounts={fixAccounts}
                            categories={categories}
                          />
                        ) : null}
                      </TableCell>
                    ) : null}

                    <TableCell className="w-8 p-0 pr-2 text-right">
                      <Link
                        href={r.href}
                        aria-label={t(locale, "Open")}
                        className="flex items-center justify-center px-2 py-3 text-muted-foreground/60 hover:text-brand"
                      >
                        <ChevronRight className="size-4" />
                      </Link>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {pages > 1 ? (
        <div className="flex items-center justify-between text-sm">
          <p className="text-muted-foreground">
            {t(locale, "Page")} {page} {t(locale, "of")} {pages}
          </p>
          <div className="flex gap-2">
            {page > 1 ? (
              <Link href={pageLink(page - 1)} className="rounded-lg border px-3 py-1.5 hover:bg-secondary">
                {t(locale, "Previous")}
              </Link>
            ) : null}
            {page < pages ? (
              <Link href={pageLink(page + 1)} className="rounded-lg border px-3 py-1.5 hover:bg-secondary">
                {t(locale, "Next")}
              </Link>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
