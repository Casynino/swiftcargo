import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Banknote, Building2, Smartphone } from "lucide-react";

import {
  CountTheCashCard,
  MoveMoneyCard,
  OpeningBalanceForm,
} from "@/components/app/account-tools";
import { RecordCostPanel, type UsualCost } from "@/components/app/expense-form";
import { EmptyState } from "@/components/app/empty-state";
import { CorrectExpenseDialog } from "@/components/app/correct-expense-dialog";
import { LedgerRowActions } from "@/components/app/ledger-row-actions";
import { PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { accountPositions, accountRegister } from "@/lib/accounts";
import { correctableExpenses, correctionOptions } from "@/lib/expense-correction";
import { formatDate, formatDateTime, formatMoney } from "@/lib/format";
import { t } from "@/lib/i18n";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { requirePermission } from "@/lib/session";
import { cn } from "@/lib/utils";
import { localeOf } from "@/lib/viewer-locale";

import { primeLocale } from "@/lib/server-t";
import { Tx } from "@/components/app/tx";
const KIND = {
  BANK: { label: "Bank account", icon: Building2, tile: "bg-brand/10 text-brand" },
  MOBILE_MONEY: {
    label: "Mobile money",
    icon: Smartphone,
    tile: "bg-destructive/10 text-destructive",
  },
  CASH: {
    label: "Cash",
    icon: Banknote,
    tile: "bg-success/10 text-success",
  },
} as const;

/**
 * "0150 5979 1630 0" — grouped, because a clerk reads it off a screen aloud.
 * Digits only: a tin's identifier is a word, and splitting it into fours
 * produced "CASH -TZS".
 */
function grouped(number: string) {
  const bare = number.replace(/\s+/g, "");
  if (!/^\d+$/.test(bare)) return number;
  return bare.replace(/(.{4})/g, "$1 ").trim();
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const account = await prisma.bankAccount.findUnique({
    where: { id },
    select: { bankName: true, currency: true },
  });
  return {
    title: account ? `${account.bankName} (${account.currency})` : "Account",
  };
}

/**
 * ONE ACCOUNT, AND EVERYTHING THAT HAS MOVED THROUGH IT.
 *
 * The balance at the top is the rows below it added up, starting from the
 * opening figure. That is the whole claim of this page: it cannot disagree with
 * its own history, so a figure here that does not match the bank means a
 * movement exists that nobody recorded — and the answer is to find and record
 * it, never to correct the total.
 */
export default async function AccountPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await primeLocale();
  const user = await requirePermission("accounting.view");
  const locale = await localeOf(user.id);
  const L = (english: string) => t(locale, english);
  const mayMove = can(user.role, "accounting.manage");
  const mayRecordCost = can(user.role, "expense.record");
  const { id } = await params;

  const [account, positions, entries, counts, rate] = await Promise.all([
    prisma.bankAccount.findUnique({ where: { id } }),
    accountPositions(),
    accountRegister(id),
    prisma.cashCount.findMany({
      where: { accountId: id },
      orderBy: { countedAt: "desc" },
      take: 10,
      include: { countedBy: { select: { name: true } } },
    }),
    prisma.exchangeRate.findFirst({
      where: { active: true },
      orderBy: { effectiveFrom: "desc" },
      select: { rate: true },
    }),
  ]);

  if (!account) notFound();

  const position = positions.find((p) => p.id === id);
  if (!position) notFound();

  const [correctable, correction] = mayRecordCost
    ? await Promise.all([
        correctableExpenses(entries.filter((e) => e.kind === "expense" && !e.cancelled).map((e) => e.recordId)),
        correctionOptions(),
      ])
    : [new Map(), { accounts: [], categories: [] }];

  const isCash = account.kind === "CASH";
  const paymentIds = entries
    .filter((e) => e.kind === "payment" && e.direction === "IN")
    .map((e) => e.recordId);

  const [writeOffs, usedMost, types, containers] = await Promise.all([
    /* A shortfall the desk agreed to clear rides on the payment that was
       short. It moved no money, so it is not a line of this register — but a
       clerk reading the payment needs to know the bill was closed for less. */
    paymentIds.length
      ? prisma.payment.findMany({
          where: {
            writtenOff: true,
            status: "VERIFIED",
            writeOffOfId: { in: paymentIds },
          },
          select: { writeOffOfId: true, baseCurrencyAmount: true, amount: true },
        })
      : Promise.resolve([]),
    isCash && mayRecordCost
      ? prisma.containerExpense.groupBy({
          by: ["description", "expenseTypeId"],
          where: { deletedAt: null, cancelledAt: null, description: { not: null } },
          _count: { description: true },
          orderBy: { _count: { description: "desc" } },
          take: 12,
        })
      : Promise.resolve([]),
    isCash && mayRecordCost
      ? prisma.expenseType.findMany({
          where: { active: true, name: { not: "Salaries" } },
          orderBy: { name: "asc" },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
    isCash && mayRecordCost
      ? prisma.container.findMany({
          where: { deletedAt: null },
          orderBy: { createdAt: "desc" },
          take: 40,
          select: { id: true, reference: true },
        })
      : Promise.resolve([]),
  ]);

  const writtenOffOn = new Map<string, number>();
  for (const w of writeOffs) {
    if (!w.writeOffOfId) continue;
    writtenOffOn.set(
      w.writeOffOfId,
      (writtenOffOn.get(w.writeOffOfId) ?? 0) +
        Number(w.baseCurrencyAmount ?? w.amount)
    );
  }

  /* Most-recorded first, then the kinds of cost the business has named, so a
     tin that has never paid for anything still offers something to tap. */
  const usual: UsualCost[] = (() => {
    const seen = new Set<string>();
    return [
      ...usedMost.map((r) => ({
        label: (r.description ?? "").trim(),
        expenseTypeId: r.expenseTypeId,
      })),
      ...types.map((ty) => ({ label: ty.name, expenseTypeId: ty.id })),
    ]
      .filter((item) => {
        const key = item.label.toLowerCase();
        if (!key || key.length > 40 || seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 12);
  })();

  const kind = KIND[account.kind];
  const Icon = kind.icon;
  const money = (n: number) => formatMoney(n, account.currency);
  const fx = rate ? Number(rate.rate) : 0;

  const live = entries.filter((e) => !e.cancelled);

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const netMonth = live
    .filter((e) => e.at >= monthStart)
    .reduce((sum, e) => sum + (e.direction === "IN" ? e.amount : -e.amount), 0);

  const choices = positions
    .filter((p) => p.active)
    .map((p) => ({
      id: p.id,
      label: `${p.bankName} (${p.currency})`,
      currency: p.currency,
      kind: p.kind,
      balance: formatMoney(p.balance, p.currency),
    }));

  const newest = counts[0];
  const lastCountLine = newest
    ? `${L("Last counted")} ${formatDateTime(newest.countedAt)} ${L("by")} ${newest.countedBy?.name ?? "—"}${
        Number(newest.counted) === Number(newest.expected)
          ? ` · ${L("and it agreed")}`
          : ` · ${L("was out by")} ${money(Math.abs(Number(newest.counted) - Number(newest.expected)))}`
      }`
    : L("Never counted");

  const showMove = mayMove && choices.length >= 2 && account.active;
  const showCount = isCash && mayMove && account.active;
  const showCost = isCash && mayRecordCost && account.active;

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${account.bankName} (${account.currency})`}
        description={
          isCash
            ? L(
                "What is in the tin, what went through it, and the four things you do to it. The balance is the ledger added up, so it cannot disagree with its own history."
              )
            : L(
                "What is in the account, what went through it, and moving money in or out of it. The balance is the ledger added up, so it cannot disagree with its own history."
              )
        }
        back={{ href: "/app/finance/accounts", label: L("Accounts") }}
      />
      {isCash ? (
        <p className="-mt-3 text-xs text-muted-foreground">{lastCountLine}</p>
      ) : null}

      <div className="flex flex-wrap items-center gap-4 rounded-xl border bg-card px-5 py-4 shadow-soft">
        <span className={cn("grid size-11 place-items-center rounded-lg", kind.tile)}>
          <Icon className="size-5" />
        </span>
        <div>
          <p className="tnum text-sm tracking-wider text-muted-foreground">
            {grouped(account.accountNumber)}
          </p>
          <p className="text-xs text-muted-foreground">
            {L(kind.label)}
            {account.branch ? ` · ${account.branch}` : ""} · {account.accountName} ·{" "}
            {account.active ? L("In use") : L("Not in use")} · {L("one currency only")}
          </p>
        </div>
      </div>

      {/* A balance is only a balance once somebody has said what was in the
          account before this software existed. Until then the figure is what
          has moved through it here, and saying otherwise is the one thing this
          page must not do. */}
      {account.openingBalanceAt === null && Number(account.openingBalance) === 0 ? (
        <p className="rounded-xl border border-warning/40 bg-warning/[0.06] px-4 py-3 text-sm text-muted-foreground">
          <span className="font-medium text-foreground">
            {L("This is what has moved through the account here")}
          </span>{" "}
          {L("— no opening balance has been set, so whatever was already in it is not counted.")}
        </p>
      ) : null}

      <dl className="grid grid-cols-1 gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-4">
        <div className="bg-card p-4">
          <dt className="text-sm text-muted-foreground">{L("Balance")}</dt>
          <dd
            className={cn(
              "tnum mt-1 text-2xl font-semibold",
              position.balance < 0 && "text-destructive"
            )}
          >
            {money(position.balance)}
          </dd>
          <p className="tnum mt-0.5 text-xs text-muted-foreground">
            {account.currency !== "USD" && fx > 0
              ? `${formatMoney(position.balance / fx, "USD")} · `
              : ""}
            {position.movements}{" "}
            {position.movements === 1 ? L("movement") : L("movements")}
          </p>
        </div>
        <div className="bg-card p-4">
          <dt className="text-sm text-muted-foreground">{L("Received (all time)")}</dt>
          <dd className="tnum mt-1 text-2xl font-semibold text-success">
            {money(position.in)}
          </dd>
        </div>
        <div className="bg-card p-4">
          <dt className="text-sm text-muted-foreground">{L("Paid out (all time)")}</dt>
          <dd className="tnum mt-1 text-2xl font-semibold text-destructive">
            {money(position.out)}
          </dd>
          <p className="tnum mt-0.5 text-xs text-muted-foreground">
            {L("net this month")} {money(netMonth)}
          </p>
        </div>
        <div className="bg-card p-4">
          <dt className="text-sm text-muted-foreground">{L("Opening balance")}</dt>
          <dd className="tnum mt-1 text-2xl font-semibold">
            {money(position.opening)}
          </dd>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {account.openingBalanceAt
              ? `${L("set")} ${formatDate(account.openingBalanceAt)}`
              : L("never set")}
          </p>
          {mayMove ? (
            <OpeningBalanceForm
              accountId={account.id}
              currency={account.currency}
              current={Number(account.openingBalance)}
              isSet={account.openingBalanceAt !== null}
            />
          ) : null}
        </div>
      </dl>

      {/* Money changing shelves, and — for a tin, the one account that can be
          held against something physical — counting what is really there. */}
      {showMove || showCount ? (
        <div className={cn("grid gap-4", showMove && showCount && "lg:grid-cols-2")}>
          {showMove ? (
            <MoveMoneyCard accounts={choices} defaultFrom={account.id} />
          ) : null}
          {showCount ? (
            <CountTheCashCard
              tins={[
                {
                  id: account.id,
                  label: `${account.bankName} (${account.currency})`,
                  currency: account.currency,
                  kind: account.kind,
                  balance: money(position.balance),
                },
              ]}
            />
          ) : null}
        </div>
      ) : null}

      {showCost ? (
        <section
          id="pay-out-of-cash"
          className="scroll-mt-24 overflow-hidden rounded-xl border bg-card shadow-soft"
        >
          <header className="border-b px-5 py-4">
            <h2 className="font-semibold">{L("Pay something out of cash")}</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {L(
                "Choose a cash account and the money leaves the tin as you record it. Attach the receipt here rather than keeping it in a pocket."
              )}
            </p>
          </header>
          <div className="border-b px-5 py-3">
            <p className="text-sm font-semibold">{L("Record a cost")}</p>
          </div>
          <RecordCostPanel
            usual={usual}
            types={types}
            accounts={choices.map((c) => ({ id: c.id, label: c.label }))}
            containers={containers.map((c) => ({ id: c.id, label: c.reference }))}
            defaultAccountId={account.id}
            defaultCurrency={account.currency}
          />
        </section>
      ) : null}

      <section className="overflow-hidden rounded-xl border bg-card shadow-soft">
        <header className="flex flex-wrap items-baseline justify-between gap-2 border-b px-5 py-4">
          <div>
            <h2 className="font-semibold">
              {isCash
                ? L("Everything that went through the tin")
                : L("Everything that went through it")}
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {L("Newest first · a cancelled line stays, struck through, and stops counting")}
            </p>
          </div>
          <Link
            href="/app/finance/ledger"
            className="text-xs text-muted-foreground underline"
          >
            {L("Full report")}
          </Link>
        </header>

        {entries.length === 0 ? (
          <EmptyState
            icon="ArrowLeftRight"
            title={L("Nothing has moved through this account yet")}
            description={L(
              "Payments attributed to it, costs paid from it and transfers in or out all appear here as they happen."
            )}
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{L("Date")}</TableHead>
                <TableHead>{L("Entry")}</TableHead>
                <TableHead>{L("Description")}</TableHead>
                <TableHead className="hidden lg:table-cell">{L("Account")}</TableHead>
                <TableHead className="hidden xl:table-cell">{L("Recorded by")}</TableHead>
                <TableHead className="text-right">{L("In")}</TableHead>
                <TableHead className="text-right">{L("Out")}</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((entry) => {
                const writtenOff =
                  entry.kind === "payment" && entry.direction === "IN"
                    ? writtenOffOn.get(entry.recordId)
                    : undefined;
                return (
                  <TableRow
                    key={entry.id}
                    className={cn(
                      entry.cancelled && "border-l-2 border-l-warning bg-warning/[0.04]"
                    )}
                  >
                    <TableCell className="tnum whitespace-nowrap text-xs text-muted-foreground">
                      {formatDateTime(entry.at)}
                    </TableCell>
                    <TableCell className="tnum whitespace-nowrap text-xs">
                      {entry.reference || "—"}
                    </TableCell>
                    <TableCell className="text-sm">
                      <Link
                        href={entry.href}
                        className={cn(
                          "hover:underline",
                          entry.cancelled && "line-through opacity-70"
                        )}
                      >
                        <Tx>{entry.detail}</Tx>
                      </Link>
                      {/* A cancelled line is not a new event; it answers one,
                          and reads wrongly without saying so. */}
                      {entry.cancelled ? (
                        <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                          {L("correction")}
                        </span>
                      ) : null}
                      {entry.tag ? (
                        <span className="ml-2 rounded bg-warning/15 px-1.5 py-0.5 text-[11px] text-warning">
                          {L(entry.tag)}
                        </span>
                      ) : null}
                      <span className="tnum block text-xs text-muted-foreground">
                        {entry.type}
                        {entry.description ? ` · $<Tx>{entry.description}</Tx>` : ""}
                        {entry.cancelled && entry.cancelledReason
                          ? ` · ${entry.cancelledReason}`
                          : ""}
                      </span>
                      {writtenOff ? (
                        <span className="tnum block text-xs text-warning">
                          {formatMoney(writtenOff, "TZS")} {L("written off the bill")}
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell className="hidden whitespace-nowrap text-xs text-muted-foreground lg:table-cell">
                      {entry.account}
                    </TableCell>
                    <TableCell className="hidden whitespace-nowrap text-xs text-muted-foreground xl:table-cell">
                      {entry.by ?? "—"}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "tnum whitespace-nowrap text-right text-sm text-success",
                        entry.cancelled && "line-through opacity-70"
                      )}
                    >
                      {entry.direction === "IN" ? money(entry.amount) : ""}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "tnum whitespace-nowrap text-right text-sm text-destructive",
                        entry.cancelled && "line-through opacity-70"
                      )}
                    >
                      {entry.direction === "OUT" ? money(entry.amount) : ""}
                    </TableCell>
                    <TableCell>
                      {/* An opening balance is a figure somebody set, not a
                          movement — it is changed on the account, not here. */}
                      {entry.kind === "opening" ? null : (
                        <LedgerRowActions
                          kind={entry.kind}
                          id={entry.recordId}
                          editHref={entry.href}
                          proofHref={entry.proofHref}
                          cancelled={entry.cancelled}
                          mayCancel={
                            entry.kind === "payment"
                              ? can(user.role, "payment.verify")
                              : entry.kind === "expense"
                                ? can(user.role, "expense.record")
                                : can(user.role, "accounting.manage")
                          }
                          editSlot={
                            entry.kind === "expense" && correctable.has(entry.recordId) ? (
                              <CorrectExpenseDialog
                                expense={correctable.get(entry.recordId)!}
                                accounts={correction.accounts}
                                categories={correction.categories}
                                locale={locale}
                              />
                            ) : undefined
                          }
                        />
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </section>

      {isCash && counts.length > 0 ? (
        <section className="overflow-hidden rounded-xl border bg-card shadow-soft">
          <header className="border-b px-5 py-4">
            <h2 className="font-semibold">{L("Counts")}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {L("A count never moves the balance. A difference is a movement nobody recorded.")}
            </p>
          </header>
          <ul className="divide-y">
            {counts.map((c) => {
              const diff = Number(c.counted) - Number(c.expected);
              return (
                <li
                  key={c.id}
                  className="flex flex-wrap items-center justify-between gap-3 px-5 py-3"
                >
                  <div>
                    <p className="tnum text-sm">
                      {L("Counted")} {money(Number(c.counted))} {L("against")}{" "}
                      {money(Number(c.expected))}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatDateTime(c.countedAt)} · {c.countedBy?.name ?? "—"}
                      {c.note ? ` · $<Tx>{c.note}</Tx>` : ""}
                    </p>
                  </div>
                  <Badge tone={diff === 0 ? "good" : "warn"}>
                    {diff === 0
                      ? L("Agreed")
                      : `${diff > 0 ? L("Over") : L("Short")} ${money(Math.abs(diff))}`}
                  </Badge>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
