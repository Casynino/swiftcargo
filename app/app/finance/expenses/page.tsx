import Link from "next/link";
import type { Metadata } from "next";
import { Search } from "lucide-react";

import { CorrectExpenseDialog } from "@/components/app/correct-expense-dialog";
import { ExpenseForm } from "@/components/app/expense-form";
import { FinanceTabs } from "@/components/app/finance-tabs";
import { LedgerRowActions } from "@/components/app/ledger-row-actions";
import { PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { accountRegister } from "@/lib/accounts";
import { correctableExpenses, correctionOptions } from "@/lib/expense-correction";
import { formatDate } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { requirePermission } from "@/lib/session";
import { cn } from "@/lib/utils";
import { localeOf } from "@/lib/viewer-locale";

import { primeLocale, T } from "@/lib/server-t";
import { darStartOfDay, darStartOfMonth, darStartOfWeek, darStartOfYear } from "@/lib/dar-time";
import { Tx } from "@/components/app/tx";
export const metadata: Metadata = { title: "Expenses" };

const PERIODS = {
  today: "Today",
  week: "This week",
  month: "This month",
  year: "This year",
  all: "All time",
} as const;
type Period = keyof typeof PERIODS;

const GROUPS = {
  all: { label: "Everything", bar: "bg-foreground/70", wash: "" },
  container: { label: "Container costs", bar: "bg-brand", wash: "from-brand/[0.07]" },
  office: { label: "Office", bar: "bg-destructive", wash: "from-destructive/[0.07]" },
  special: { label: "Special", bar: "bg-muted-foreground/40", wash: "" },
  executive: { label: "Executive", bar: "bg-warning", wash: "from-warning/[0.07]" },
  transport: { label: "Transport out", bar: "bg-success", wash: "from-success/[0.07]" },
  unpaid: { label: "Still to pay", bar: "bg-muted-foreground/40", wash: "" },
  between: { label: "Between accounts", bar: "bg-muted-foreground/40", wash: "" },
  cancelled: { label: "Cancelled", bar: "bg-muted-foreground/60", wash: "" },
} as const;
type Group = keyof typeof GROUPS;

type Outgoing = {
  id: string;
  kind: "expense" | "transport" | "transfer";
  recordId: string;
  title: string;
  reference: string;
  category: string;
  groups: Group[];
  at: Date;
  paidFrom: string | null;
  paidAt: Date | null;
  amount: number;
  currency: string;
  tzs: number;
  usd: number;
  status: "Paid" | "Not paid" | "Cancelled";
  cancelledReason: string | null;
  href: string;
};

function since(period: Period): Date | null {
  if (period === "all") return null;
  if (period === "week") return darStartOfWeek();
  if (period === "month") return darStartOfMonth();
  if (period === "year") return darStartOfYear();
  return darStartOfDay();
}

/**
 * WHAT THE BUSINESS SPENDS, AND WHAT IT HAS ALREADY PAID.
 *
 * Every outgoing in one list: container costs, the office's own costs,
 * transport paid out to drivers, and money moved between our own accounts.
 * The tiles are views of that list rather than separate registers, so they
 * always add up to what is underneath them.
 *
 * Costs are dated when they were incurred; the money is dated when it left.
 * A moved-between-accounts row is not spending — the business is no poorer —
 * so it has its own tile and is left out of Everything.
 */
export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; period?: string; group?: string; category?: string; status?: string; account?: string }>;
}) {
  await primeLocale();
  const user = await requirePermission("expense.view");
  const sp = await searchParams;
  const period: Period = sp.period && sp.period in PERIODS ? (sp.period as Period) : "month";
  const group: Group = sp.group && sp.group in GROUPS ? (sp.group as Group) : "all";
  const from = since(period);
  const query = sp.q?.trim().toLowerCase() ?? "";

  const [expenses, register, containers, accounts, types, rate, locale, options] = await Promise.all([
    prisma.containerExpense.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: "desc" },
      include: {
        container: { select: { id: true, reference: true } },
        expenseType: { select: { name: true } },
        vendor: { select: { name: true } },
        account: { select: { id: true, bankName: true, currency: true } },
      },
    }),
    accountRegister(),
    prisma.container.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { id: true, reference: true },
    }),
    prisma.bankAccount.findMany({
      where: { active: true },
      orderBy: { sortOrder: "asc" },
      select: { id: true, bankName: true, currency: true },
    }),
    prisma.expenseType.findMany({
      where: { active: true, name: { not: "Salaries" } },
      orderBy: { name: "asc" },
      select: { id: true, name: true, forContainer: true },
    }),
    prisma.exchangeRate.findFirst({
      where: { active: true },
      orderBy: { effectiveFrom: "desc" },
      select: { rate: true },
    }),
    localeOf(user.id),
    correctionOptions(),
  ]);
  const mayCorrect = can(user.role, "expense.record");

  const today = rate ? Number(rate.rate) : 0;
  const pair = (amount: number, currency: string, fx: unknown) => {
    const r = Number(fx) > 1 ? Number(fx) : today;
    return currency === "USD"
      ? { usd: amount, tzs: amount * r }
      : { usd: r ? amount / r : 0, tzs: amount };
  };

  const scopeGroup: Record<string, Group> = {
    CONTAINER: "container",
    OFFICE: "office",
    SPECIAL: "special",
    EXECUTIVE: "executive",
  };

  const all: Outgoing[] = [
    ...expenses.map((e): Outgoing => {
      const money = pair(Number(e.amount), e.currency, e.fxRate);
      const cancelled = e.cancelledAt !== null;
      const paid = e.accountId !== null;
      const category = e.expenseType?.name ?? "Uncategorised";
      return {
        id: `e-${e.id}`,
        kind: "expense",
        recordId: e.id,
        title: e.description || (e.container ? `${category} · ${e.container.reference}` : category),
        reference: e.reference,
        category,
        groups: cancelled
          ? ["cancelled"]
          : ["all", scopeGroup[e.scope], ...(paid ? [] : (["unpaid"] as Group[]))],
        at: e.expenseDate ?? e.createdAt,
        paidFrom: e.account ? `${e.account.bankName} (${e.account.currency})` : null,
        paidAt: e.paidDate,
        amount: Number(e.amount),
        currency: e.currency,
        ...money,
        status: cancelled ? "Cancelled" : paid ? "Paid" : "Not paid",
        cancelledReason: e.cancelledReason,
        href: e.container ? `/app/finance/containers/${e.container.id}` : "/app/finance/expenses",
      };
    }),
    ...register
      .filter((r) => r.type === "Transport paid out" || (r.kind === "transfer" && r.direction === "OUT"))
      .map((r): Outgoing => {
        const transport = r.type === "Transport paid out";
        const money = pair(r.amount, r.currency, null);
        return {
          id: r.id,
          kind: transport ? "transport" : "transfer",
          recordId: r.recordId,
          title: transport ? `Transport for ${r.detail}` : `Moved to ${r.detail}`,
          reference: r.reference,
          category: transport ? "Transport out" : "Between accounts",
          groups: r.cancelled
            ? ["cancelled"]
            : transport
              ? ["all", "transport"]
              : ["between"],
          at: r.at,
          paidFrom: r.account,
          paidAt: r.at,
          amount: r.amount,
          currency: r.currency,
          ...money,
          status: r.cancelled ? "Cancelled" : "Paid",
          cancelledReason: r.cancelledReason,
          href: r.href,
        };
      }),
  ];

  const inPeriod = all.filter((o) => !from || o.at >= from);
  const count = (g: Group) => inPeriod.filter((o) => o.groups.includes(g));
  const total = (rows: Outgoing[]) => rows.reduce((s, o) => s + o.tzs, 0);
  const everything = total(count("all"));

  const shown = inPeriod
    .filter((o) => o.groups.includes(group))
    .filter((o) => !sp.category || o.category === sp.category)
    .filter((o) => !sp.status || o.status === sp.status)
    .filter((o) => !sp.account || (o.paidFrom ?? "").startsWith(sp.account))
    .filter(
      (o) =>
        !query ||
        `${o.title} ${o.reference} ${o.category} ${o.paidFrom ?? ""}`.toLowerCase().includes(query)
    )
    .sort((a, b) => b.at.getTime() - a.at.getTime());
  const correctable = mayCorrect
    ? await correctableExpenses(shown.filter((o) => o.kind === "expense" && o.status !== "Cancelled").map((o) => o.recordId))
    : new Map();
  const cancelledCount = count("cancelled").length;
  const unpaid = count("unpaid");

  const tzs = (n: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "TZS", maximumFractionDigits: 0 }).format(n);
  const usd = (n: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
  const link = (over: Record<string, string>) => {
    const q = new URLSearchParams(Object.entries({ ...sp, ...over }).filter(([, v]) => v) as [string, string][]);
    return `/app/finance/expenses?${q.toString()}`;
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title={T("Expenses")}
        description={T("What the business spends, and what it has already paid. Costs are dated when they were incurred; the money is dated when it left.")}
        actions={
          can(user.role, "expense.record") ? (
            <ExpenseForm
              containers={containers.map((c) => ({ id: c.id, label: c.reference }))}
              types={types}
              accounts={accounts.map((a) => ({ id: a.id, label: `${a.bankName} (${a.currency})` }))}
            />
          ) : null
        }
      />
      <FinanceTabs />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {(Object.keys(GROUPS) as Group[]).map((key) => {
          const rows = count(key);
          const amount = total(rows);
          const share = everything > 0 ? Math.min(100, (amount / everything) * 100) : 0;
          return (
            <Link
              key={key}
              href={link({ group: key })}
              className={cn(
                "rounded-xl border bg-card bg-gradient-to-br to-transparent p-4 transition-colors hover:bg-secondary/40",
                GROUPS[key].wash,
                group === key && "ring-2 ring-foreground/40"
              )}
            >
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                  {GROUPS[key].label}
                </p>
                <span className="tnum rounded-full bg-secondary px-1.5 text-[11px]">{rows.length}</span>
              </div>
              <p className="tnum mt-1 text-lg font-semibold">{tzs(amount)}</p>
              <div className="mt-2 h-1 overflow-hidden rounded-full bg-secondary">
                <div className={cn("h-full rounded-full", GROUPS[key].bar)} style={{ width: `${key === "all" ? (amount ? 100 : 0) : Math.max(amount ? 3 : 0, share)}%` }} />
              </div>
            </Link>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {(Object.keys(PERIODS) as Period[]).map((key) => (
            <Link
              key={key}
              href={link({ period: key })}
              className={cn(
                "rounded-full border px-3 py-1 text-sm",
                period === key ? "border-brand bg-brand text-brand-foreground" : "bg-card hover:bg-secondary"
              )}
            >
              {PERIODS[key]}
            </Link>
          ))}
        </div>
        {today ? <p className="tnum text-xs text-muted-foreground">USD 1 = TZS {today.toLocaleString()}</p> : null}
      </div>

      {unpaid.length === 0 ? (
        <p className="text-sm text-success">{T("Everything recorded has been paid.")}</p>
      ) : (
        <p className="text-sm text-warning">
          {unpaid.length} cost{unpaid.length === 1 ? "" : "s"} recorded and not yet paid — {tzs(total(unpaid))}.
        </p>
      )}

      <form className="space-y-3 rounded-xl border bg-card p-4">
        <input type="hidden" name="period" value={period} />
        <input type="hidden" name="group" value={group} />
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input name="q" defaultValue={sp.q ?? ""} placeholder={T("What it was, the number, who was paid, a container…")} className="pl-9" />
          </div>
          <Button type="submit" variant="outline">{T("Search")}</Button>
        </div>
        <div className="flex flex-wrap gap-2">
          <NativeSelect name="category" defaultValue={sp.category ?? ""} className="w-52">
            <option value="">{T("Every category")}</option>
            {[...types.map((t) => t.name), "Transport out", "Between accounts"].map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </NativeSelect>
          <NativeSelect name="status" defaultValue={sp.status ?? ""} className="w-40">
            <option value="">{T("Any status")}</option>
            <option value="Paid">{T("Paid")}</option>
            <option value="Not paid">{T("Not paid")}</option>
            <option value="Cancelled">{T("Cancelled")}</option>
          </NativeSelect>
          <NativeSelect name="account" defaultValue={sp.account ?? ""} className="w-56">
            <option value="">{T("Any account")}</option>
            {accounts.map((a) => (
              <option key={a.id} value={`${a.bankName} (${a.currency})`}>{a.bankName} ({a.currency})</option>
            ))}
          </NativeSelect>
        </div>
      </form>

      <p className="tnum text-xs text-muted-foreground">
        Showing {shown.length === 0 ? 0 : `1–${shown.length}`} of {shown.length} outgoing{shown.length === 1 ? "" : "s"}
        {cancelledCount > 0 && group !== "cancelled" ? ` · ${cancelledCount} cancelled, not counted` : ""}
      </p>

      <div className="overflow-hidden rounded-xl border bg-card">
        {shown.length === 0 ? (
          <p className="px-5 py-12 text-center text-sm text-muted-foreground">{T("Nothing here for this period.")}</p>
        ) : (
          <ul className="divide-y">
            {shown.map((o) => (
              <li key={o.id} className={cn("flex flex-wrap items-center gap-4 px-5 py-3", o.status === "Cancelled" && "opacity-70")}>
                <div className="min-w-0 flex-1">
                  <Link href={o.href} className={cn("font-medium hover:underline", o.status === "Cancelled" && "line-through")}>
                    <Tx>{o.title}</Tx>
                  </Link>
                  <p className="tnum mt-0.5 text-xs text-muted-foreground">
                    {[o.reference, o.category, formatDate(o.at)].filter(Boolean).join(" · ")}
                    {o.paidFrom ? ` · paid from ${o.paidFrom}${o.paidAt ? ` ${formatDate(o.paidAt)}` : ""}` : " · not paid yet"}
                  </p>
                  {o.cancelledReason ? <p className="mt-0.5 text-xs text-warning">Cancelled — {o.cancelledReason}</p> : null}
                </div>
                <div className="text-right">
                  <p className={cn("tnum font-semibold", o.status === "Cancelled" && "line-through")}>
                    {o.currency === "USD" ? usd(o.amount) : tzs(o.amount)}
                  </p>
                  <p className="tnum text-xs text-muted-foreground">{o.currency === "USD" ? tzs(o.tzs) : usd(o.usd)}</p>
                </div>
                <Badge tone={o.status === "Paid" ? "good" : o.status === "Cancelled" ? "neutral" : "warn"}>{o.status}</Badge>
                <div className="w-44">
                  {o.kind === "expense" || o.kind === "transfer" ? (
                    <LedgerRowActions
                      kind={o.kind}
                      id={o.recordId}
                      editHref={o.href}
                      proofHref={null}
                      showProof={false}
                      cancelled={o.status === "Cancelled"}
                      mayCancel={can(user.role, o.kind === "expense" ? "expense.record" : "accounting.manage")}
                      editSlot={
                        o.kind === "expense" && correctable.has(o.recordId) ? (
                          <CorrectExpenseDialog
                            expense={correctable.get(o.recordId)!}
                            accounts={options.accounts}
                            categories={options.categories}
                            locale={locale}
                          />
                        ) : undefined
                      }
                    />
                  ) : (
                    <Link href={o.href} className="block text-right text-xs text-brand hover:underline">{T("Open the payment")}</Link>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
