import Link from "next/link";
import type { Metadata } from "next";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Banknote,
  Building2,
  Smartphone,
  Wallet,
} from "lucide-react";

import { CountTheCashCard, MoveMoneyCard } from "@/components/app/account-tools";
import { EmptyState } from "@/components/app/empty-state";
import { FinanceTabs } from "@/components/app/finance-tabs";
import { PageHeader } from "@/components/app/page-header";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { accountPositions, accountRegister } from "@/lib/accounts";
import { formatDate, formatDateTime, formatMoney } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { requirePermission } from "@/lib/session";
import { cn } from "@/lib/utils";

import { primeLocale, T } from "@/lib/server-t";
import { Tx } from "@/components/app/tx";
export const metadata: Metadata = { title: "Accounts" };

const KIND = {
  BANK: {
    label: "Bank account",
    icon: Building2,
    tile: "bg-brand/10 text-brand",
    wash: "from-brand/[0.07]",
  },
  MOBILE_MONEY: {
    label: "Mobile money",
    icon: Smartphone,
    tile: "bg-destructive/10 text-destructive",
    wash: "from-destructive/[0.07]",
  },
  CASH: {
    label: "Cash",
    icon: Banknote,
    tile: "bg-success/10 text-success",
    wash: "from-success/[0.07]",
  },
} as const;

/**
 * "0150 5979 1630 0" — grouped, because a clerk reads it off a screen aloud.
 *
 * Digits only. A tin's identifier is a word, not a number, and splitting it
 * into fours produced "CASH -TZS".
 */
function grouped(number: string) {
  const bare = number.replace(/\s+/g, "");
  if (!/^\d+$/.test(bare)) return number;
  return bare.replace(/(.{4})/g, "$1 ").trim();
}

function ago(at: Date | null) {
  if (!at) return null;
  const days = Math.floor((Date.now() - at.getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  return `${days} days ago`;
}

/**
 * WHERE THE COMPANY'S MONEY SITS.
 *
 * Every figure is this account's own history added up — the opening amount, the
 * verified payments that landed, the costs paid out of it, and the transfers
 * either way. Nothing here is a stored balance, so nothing here can disagree
 * with the register it came from.
 *
 * Each account holds one currency. The dollar line under a shilling balance is
 * a reading at today's rate, never the balance itself; the balance is the
 * shillings, and it is what the bank will say.
 */
export default async function AccountsPage() {
  await primeLocale();
  const user = await requirePermission("accounting.view");
  const mayMove = can(user.role, "accounting.manage");

  const [positions, rate, movements, counts] = await Promise.all([
      accountPositions(),
      prisma.exchangeRate.findFirst({
        where: { active: true },
        orderBy: { effectiveFrom: "desc" },
        select: { rate: true },
      }),
    accountRegister(undefined, 60),
      prisma.cashCount.findMany({
        orderBy: { countedAt: "desc" },
        take: 10,
        include: {
          account: { select: { bankName: true, currency: true } },
          countedBy: { select: { name: true } },
        },
      }),
    ]);

  const fx = rate ? Number(rate.rate) : 0;
  /* One figure for the business, and it has to be one currency to exist at all.
     Shillings are read into dollars at today's posted rate — a reading, which
     is why the line under it says so rather than pretending it is a balance. */
  const grandUsd = positions.reduce(
    (sum, p) =>
      sum + (p.currency === "USD" ? p.balance : fx > 0 ? p.balance / fx : 0),
    0
  );

  const choices = positions
    .filter((p) => p.active)
    .map((p) => ({
      id: p.id,
      label: `${p.bankName} (${p.currency})`,
      currency: p.currency,
      kind: p.kind,
      balance: formatMoney(p.balance, p.currency),
    }));
  const tins = choices.filter((c) => c.kind === "CASH");

  return (
    <div className="space-y-6">
      <PageHeader
        title={T("Accounts")}
        description={T("Where the company's money sits, and everything that has moved through it. Each balance is that account's own history added up — nothing here is typed.")}
      />
      <FinanceTabs />

      <div className="flex flex-wrap items-end justify-between gap-6 rounded-xl border bg-card px-5 py-5 shadow-soft">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
            {T("Across every account")}
          </p>
          <p className="tnum mt-1 text-3xl font-semibold">
            {formatMoney(grandUsd, "USD")}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Read at today&rsquo;s rate · {positions.length} account
            {positions.length === 1 ? "s" : "s"}, one currency each
          </p>
        </div>
        <div className="flex gap-8">
          {[
            ["Accounts in use", positions.filter((p) => p.active).length],
            ["With movement", positions.filter((p) => p.movements > 0).length],
            [
              "Movements",
              positions.reduce((sum, p) => sum + p.movements, 0),
            ],
          ].map(([label, value]) => (
            <div key={String(label)}>
              <p className="text-[11px] text-muted-foreground">{label}</p>
              <p className="tnum mt-0.5 text-xl font-semibold">{value}</p>
            </div>
          ))}
        </div>
      </div>

      {positions.length === 0 ? (
        <Card>
          <EmptyState
            icon="Building2"
            title={T("No accounts yet")}
            description={T("An administrator adds the banks, mobile-money numbers and tills the business collects into.")}
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {positions.map((account) => {
            const kind = KIND[account.kind];
            const Icon = kind.icon;
            const usd =
              account.currency === "USD"
                ? null
                : fx > 0
                  ? account.balance / fx
                  : null;
            return (
              <Link
                key={account.id}
                href={`/app/finance/accounts/${account.id}`}
                className={cn(
                  "focus-ring flex flex-col overflow-hidden rounded-xl border bg-gradient-to-br to-transparent shadow-soft transition-colors hover:border-brand/50",
                  kind.wash,
                  !account.active && "opacity-60"
                )}
              >
                <div className="flex-1 p-5">
                  <div className="flex items-start justify-between gap-3">
                    <span
                      className={cn(
                        "grid size-9 place-items-center rounded-lg",
                        kind.tile
                      )}
                    >
                      <Icon className="size-4" />
                    </span>
                    <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-semibold">
                      {account.currency}
                    </span>
                  </div>
                  <p className="mt-3 font-semibold">{account.bankName}</p>
                  <p className="text-xs text-muted-foreground">
                    <Tx>{kind.label}</Tx>
                    {account.branch ? ` · ${account.branch}` : ""}
                  </p>
                  <p
                    className={cn(
                      "tnum mt-3 text-2xl font-semibold",
                      account.balance < 0 && "text-destructive"
                    )}
                  >
                    {formatMoney(account.balance, account.currency)}
                  </p>
                  {usd !== null ? (
                    <p className="tnum mt-0.5 text-xs text-muted-foreground">
                      {formatMoney(usd, "USD")}
                    </p>
                  ) : null}
                  <p className="tnum mt-2 text-xs tracking-wider text-muted-foreground">
                    {grouped(account.accountNumber)}
                  </p>
                  {/* A count that came up short is the account's most important
                      fact: it means a movement exists that nobody recorded. */}
                  {account.lastCountDifference !== null &&
                  account.lastCountDifference !== 0 ? (
                    <p className="mt-2 text-xs text-warning">
                      Last count{" "}
                      {account.lastCountDifference > 0 ? "over" : "short"} by{" "}
                      {formatMoney(
                        Math.abs(account.lastCountDifference),
                        account.currency
                      )}
                    </p>
                  ) : null}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t px-5 py-3 text-xs">
                  {account.movements === 0 ? (
                    <span className="text-muted-foreground">
                      {T("Nothing has moved through this account yet")}
                    </span>
                  ) : (
                    <>
                      <span className="flex items-center gap-3">
                        {account.in > 0 ? (
                          <span className="tnum flex items-center gap-1 text-success">
                            <ArrowDownLeft className="size-3" />
                            {formatMoney(account.in, account.currency)}
                          </span>
                        ) : null}
                        {account.out > 0 ? (
                          <span className="tnum flex items-center gap-1 text-destructive">
                            <ArrowUpRight className="size-3" />
                            {formatMoney(account.out, account.currency)}
                          </span>
                        ) : null}
                      </span>
                      <span className="tnum text-muted-foreground">
                        {account.movements} movement
                        {account.movements === 1 ? "" : "s"}
                        {ago(account.lastMovedAt)
                          ? ` · ${ago(account.lastMovedAt)}`
                          : ""}
                      </span>
                    </>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {mayMove && choices.length >= 2 ? (
        <section className="space-y-4 pt-2">
          <div>
            <h2 className="text-lg font-semibold">{T("Office cash")}</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {T("What is in the tin, what went through it, and the two things you do to it. The balance is the ledger added up, so it cannot disagree with its own history.")}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {counts[0]
                ? `Last counted ${formatDateTime(counts[0].countedAt)} by ${counts[0].countedBy?.name ?? "—"}`
                : "Never counted"}
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <MoveMoneyCard accounts={choices} />
            {tins.length > 0 ? (
              <CountTheCashCard tins={tins} />
            ) : (
              <Card className="p-5">
                <EmptyState
                  icon="Banknote"
                  title={T("No cash tin on the system")}
                  description={T("An administrator marks an account as cash, and it becomes countable here.")}
                />
              </Card>
            )}
          </div>
        </section>
      ) : null}

      <section className="overflow-hidden rounded-xl border bg-card shadow-soft">
        <header className="flex items-center justify-between gap-3 border-b px-5 py-4">
          <h2 className="font-semibold">{T("Everything that went through the tin")}</h2>
          <Link
            href="/app/finance/ledger"
            className="text-sm text-brand hover:underline"
          >
            {T("Full report")}
          </Link>
        </header>
        {movements.length === 0 ? (
          <EmptyState
            icon="ArrowLeftRight"
            title={T("Nothing has moved yet")}
            description={T("Verified payments, costs paid out and transfers between accounts appear here as they happen.")}
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{T("Date")}</TableHead>
                <TableHead>{T("Entry")}</TableHead>
                <TableHead>{T("Description")}</TableHead>
                <TableHead className="hidden lg:table-cell">{T("Type")}</TableHead>
                <TableHead className="hidden xl:table-cell">
                  {T("Recorded by")}
                </TableHead>
                <TableHead className="text-right">In</TableHead>
                <TableHead className="text-right">{T("Out")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {movements.map((m) => (
                <TableRow
                  key={m.id}
                  className={cn(
                    m.cancelled && "border-l-2 border-l-warning bg-warning/[0.04]"
                  )}
                >
                  <TableCell className="tnum whitespace-nowrap text-sm text-muted-foreground">
                    {formatDate(m.at)}
                  </TableCell>
                  <TableCell className="tnum whitespace-nowrap text-xs text-muted-foreground">
                    {m.reference}
                  </TableCell>
                  <TableCell
                    className={cn(
                      "text-sm",
                      m.cancelled && "line-through opacity-70"
                    )}
                  >
                    <Tx>{m.description}</Tx>
                    {m.tag ? (
                      <span className="ml-2 rounded bg-warning/15 px-1.5 py-0.5 text-[11px] text-warning">
                        {m.tag}
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell className="hidden whitespace-nowrap text-sm text-muted-foreground lg:table-cell">
                    {m.type}
                  </TableCell>
                  <TableCell className="hidden whitespace-nowrap text-xs text-muted-foreground xl:table-cell">
                    {m.by ?? "—"}
                  </TableCell>
                  <TableCell
                    className={cn(
                      "tnum text-right text-sm text-success",
                      m.cancelled && "line-through opacity-70"
                    )}
                  >
                    {m.direction === "IN" ? formatMoney(m.amount, m.currency) : ""}
                  </TableCell>
                  <TableCell
                    className={cn(
                      "tnum text-right text-sm text-destructive",
                      m.cancelled && "line-through opacity-70"
                    )}
                  >
                    {m.direction === "OUT" ? formatMoney(m.amount, m.currency) : ""}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>

      {/* Money that reached the business but nobody said where it landed. */}
      <UnassignedBanner />
    </div>
  );
}

async function UnassignedBanner() {
  const unassigned = await prisma.payment.aggregate({
    where: { status: "VERIFIED", accountId: null, writtenOff: false },
    _sum: { amount: true },
    _count: true,
  });
  if (unassigned._count === 0) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-warning/40 bg-warning/[0.06] px-5 py-4">
      <div className="flex items-start gap-3">
        <Wallet className="mt-0.5 size-4 shrink-0 text-warning" />
        <div>
          <p className="font-medium">
            {unassigned._count} verified payment
            {unassigned._count === 1 ? "" : "s"} with no account
          </p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {T("The money arrived and nobody said where it landed. It cannot be reconciled against a bank until somebody does.")}
          </p>
        </div>
      </div>
      <p className="tnum text-lg font-semibold">
        {formatMoney(Number(unassigned._sum.amount ?? 0), "USD")}
      </p>
    </div>
  );
}
