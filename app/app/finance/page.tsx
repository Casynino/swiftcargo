import Link from "next/link";
import type { Metadata } from "next";
import {
  ArrowLeftRight,
  ArrowRight,
  Calculator,
  CalendarClock,
  Layers,
  Plus,
  Receipt,
} from "lucide-react";

import { FinanceTabs } from "@/components/app/finance-tabs";
import { MoneyInShape } from "@/components/app/money-in-shape";
import { PageHeader } from "@/components/app/page-header";
import { RecordPaymentButton } from "@/components/app/record-payment-button";
import { Button } from "@/components/ui/button";
import { isUsableRate, tzsToUsd, toBase } from "@/lib/currency";
import { cargoPosition, financeDesk } from "@/lib/dashboard";
import { loadBooks, sum, within } from "@/lib/finance-report";
import { formatCbm, formatMoney } from "@/lib/format";
import { t } from "@/lib/i18n";
import { paymentTzs } from "@/lib/invoice-balance";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { requirePermission } from "@/lib/session";
import { cn } from "@/lib/utils";
import { localeOf } from "@/lib/viewer-locale";

import { primeLocale } from "@/lib/server-t";
import { darStartOfMonth } from "@/lib/dar-time";
import { Tx } from "@/components/app/tx";
export const metadata: Metadata = { title: "Finance" };

/**
 * THE FINANCE DESK.
 *
 * What the business holds, what moved this month, what it is owed, how the
 * containers are doing and what needs somebody — in shillings, because that is
 * what the business counts, with the dollar figure the invoice states beside
 * the ones a customer is asked for.
 *
 * Every figure is derived from the operational record at read time: the
 * accounts are their registers added up, the debt is each bill less its
 * verified payments at the bill's own rate. There is no second set of books,
 * because a set kept alongside the work is a set that drifts from it.
 */
export default async function FinanceHubPage() {
  await primeLocale();
  const user = await requirePermission("finance.view");
  const locale = await localeOf(user.id);
  const L = (english: string) => t(locale, english);
  /* Support holds finance.view to answer a customer about their bill. What the
     company itself holds and spends is a different question, and every figure
     answering it is gated on this instead. */
  const seesCompanyMoney = can(user.role, "accounting.view");

  const monthStart = darStartOfMonth();
  const thisMonth = { from: monthStart, to: new Date(8.64e15) };

  const [desk, position, held, books, monthPayments, containers, verdicts, unattributed, notesOut] =
    await Promise.all([
      financeDesk(),
      cargoPosition(),
      /* Volume standing on the Dar floor, uncollected. It is the company's
         exposure in cubic metres as much as in money. */
      prisma.darReceiving.aggregate({
        where: { cargo: { deletedAt: null, status: { in: ["RECEIVED_DAR", "READY_FOR_RELEASE"] } } },
        _sum: { cbm: true },
      }),
      loadBooks(),
      /* Rows, not a sum: shillings and dollars in one column added together are
         neither. A written-off shortfall settled a bill and moved no money. */
      prisma.payment.findMany({
        where: {
          status: "VERIFIED",
          writtenOff: false,
          OR: [
            { paidAt: { gte: monthStart } },
            { paidAt: null, createdAt: { gte: monthStart } },
          ],
        },
        select: {
          status: true,
          amount: true,
          currency: true,
          fxRate: true,
          baseCurrencyAmount: true,
          deliveryAdded: true,
          deliverySettledFrom: true,
          invoice: { select: { fxRate: true } },
        },
      }),
      prisma.container.findMany({
        where: { deletedAt: null },
        select: { id: true, status: true },
      }),
      /* The newest verdict per container is its standing; the older rows are
         the history of how it got there. */
      prisma.managerReview.findMany({
        where: { entity: "Container" },
        orderBy: [{ entityId: "asc" }, { createdAt: "desc" }],
        distinct: ["entityId"],
        select: { entityId: true, verdict: true },
      }),
      seesCompanyMoney
        ? prisma.payment.findMany({
            where: { status: "VERIFIED", writtenOff: false, accountId: null },
            select: {
              status: true,
              amount: true,
              currency: true,
              fxRate: true,
              baseCurrencyAmount: true,
              invoice: { select: { fxRate: true } },
            },
          })
        : Promise.resolve([]),
      prisma.pickupNote.findMany({
        where: { status: "ACTIVE" },
        select: { amountTzs: true },
      }),
    ]);

  const heldCbm = Number(held._sum.cbm ?? 0);
  const rate = isUsableRate(desk.fxRate) && Number(desk.fxRate) > 1 ? desk.fxRate : null;
  const tzs = (n: number) => formatMoney(Math.round(n), "TZS");
  const usd = (n: number) => formatMoney(n, "USD");
  const asUsd = (shillings: number) =>
    rate ? usd(tzsToUsd(Math.round(shillings), rate).toNumber()) : null;

  /* ------------------------------------------------------- the money now */
  /* Each account in its own currency, brought to shillings once through the
     one file that converts. A dollar account with no rate on the board cannot
     be stated in shillings, so it is left out rather than guessed. */
  const cashTzs = books.positions.reduce(
    (s, p) =>
      s +
      (p.currency === "TZS"
        ? p.balance
        : rate
          ? toBase(p.balance.toFixed(2), p.currency, rate).toNumber()
          : 0),
    0
  );
  const cashUsd = books.positions.reduce(
    (s, p) =>
      s +
      (p.currency === "USD"
        ? p.balance
        : rate
          ? tzsToUsd(Math.round(p.balance), rate).toNumber()
          : 0),
    0
  );

  const paymentShillings = (p: (typeof monthPayments)[number]) =>
    paymentTzs(p, p.invoice)?.toNumber() ?? 0;
  const deliveryShillings = (p: (typeof monthPayments)[number]) => {
    const fare = Number(p.deliveryAdded ?? 0);
    if (fare <= 0) return 0;
    const own = Number(p.fxRate) > 1 ? p.fxRate : Number(p.invoice.fxRate) > 1 ? p.invoice.fxRate : rate;
    if (p.currency !== "TZS" && !isUsableRate(own)) return 0;
    return toBase(fare, p.currency, own).toNumber();
  };

  /* Everything that landed, the fare a customer added included — it arrived in
     the same transfer. The fare is then counted out again below when it is
     handed to the driver: both sides or neither. */
  const inMonth = monthPayments.reduce(
    (s, p) => s + paymentShillings(p) + deliveryShillings(p),
    0
  );
  const transportOut = monthPayments
    .filter((p) => p.deliverySettledFrom)
    .reduce((s, p) => s + deliveryShillings(p), 0);
  const costsOut = sum(
    books.costs.filter((c) => c.paid && within(c.at, thisMonth)),
    (c) => c.amount
  ).tzs;
  const outMonth = costsOut + transportOut;
  const netMonth = inMonth - outMonth;

  /* ----------------------------------------------------------- containers */
  /* Closed is Finance's line under a sailing. After that it sits with the boss
     until his newest verdict says RECONCILED; a container he queried or sent
     back is with the desk again, and is counted in neither. */
  const standing = new Map(verdicts.map((v) => [v.entityId, v.verdict]));
  const stillOpen = containers.filter((c) =>
    ["SEALED", "DEPARTED", "IN_TRANSIT", "ARRIVED"].includes(c.status)
  ).length;
  const closed = containers.filter((c) => c.status === "CLOSED");
  const withBoss = closed.filter((c) => {
    const v = standing.get(c.id);
    return !v || v === "PENDING" || v === "UNDER_REVIEW";
  }).length;
  const confirmedIds = new Set(
    closed.filter((c) => standing.get(c.id) === "RECONCILED").map((c) => c.id)
  );
  const confirmedProfit = sum(
    books.boxes.filter((b) => confirmedIds.has(b.id)),
    (b) => b.profit
  ).tzs;

  /* ------------------------------------------------------------ needs you */
  const unattributedTzs = unattributed.reduce(
    (s, p) => s + (paymentTzs(p, p.invoice)?.toNumber() ?? 0),
    0
  );
  const notesTzs = notesOut.reduce((s, n) => s + Number(n.amountTzs ?? 0), 0);
  const costsToPay = books.costs.filter((c) => !c.paid);
  const costsToPayTzs = sum(costsToPay, (c) => c.amount).tzs;
  const unpaidBills = desk.unpaid + desk.partly;

  const needs: {
    title: string;
    detail: string;
    tzs: number | null;
    usd?: number | null;
    href: string;
    action: string;
    urgent: boolean;
    show: boolean;
  }[] = [
    {
      title: `${desk.awaitingPricing} ${L(desk.awaitingPricing === 1 ? "consignment waiting for a price" : "consignments waiting for a price")}`,
      detail: L("Counted at Dar and not yet billed — nobody can be asked for it until Finance confirms"),
      tzs: null,
      href: "/app/containers/arrived?view=pricing",
      action: L("Confirm prices"),
      urgent: true,
      show: desk.awaitingPricing > 0,
    },
    {
      title: `${desk.toVerify} ${L(desk.toVerify === 1 ? "payment to verify" : "payments to verify")}`,
      detail: L("Somebody says money moved and nobody has checked it"),
      tzs: null,
      href: "/app/finance/collections/verify",
      action: L("Check"),
      urgent: true,
      show: desk.toVerify > 0,
    },
    {
      title: `${unattributed.length} ${L(unattributed.length === 1 ? "payment with no account" : "payments with no account")}`,
      detail: L("Money we hold that nobody has said where it landed"),
      tzs: unattributedTzs,
      href: "/app/finance/accounts",
      action: L("Say where it landed"),
      urgent: true,
      show: seesCompanyMoney && unattributed.length > 0,
    },
    {
      title: `${unpaidBills} ${L(unpaidBills === 1 ? "bill unpaid" : "bills unpaid")}`,
      detail: L("Confirmed and sent — the customer still owes it"),
      tzs: desk.owed,
      usd: desk.owedUsd,
      href: "/app/finance/collections",
      action: L("Chase"),
      urgent: false,
      show: unpaidBills > 0,
    },
    {
      title: `${desk.unnotified} ${L("billed and never told")}`,
      detail: L("A bill the customer has not been shown is not a debt"),
      tzs: null,
      href: "/app/finance/collections?view=untold",
      action: L("Tell them"),
      urgent: false,
      show: desk.unnotified > 0,
    },
    {
      title: `${notesOut.length} ${L("cleared, not collected")}`,
      detail: L("Paid for and released — waiting on the customer to turn up"),
      tzs: notesTzs,
      href: "/app/finance/pickup-notes",
      action: L("See notes"),
      urgent: false,
      show: notesOut.length > 0,
    },
    {
      title: `${costsToPay.length} ${L(costsToPay.length === 1 ? "cost to pay" : "costs to pay")}`,
      detail: L("Recorded, not yet paid out of any account"),
      tzs: costsToPayTzs,
      href: "/app/finance/expenses",
      action: L("Settle"),
      urgent: false,
      show: seesCompanyMoney && costsToPay.length > 0,
    },
  ].filter((row) => row.show);

  /* Where "Count the cash tin" and "Move money" land: the tin's own page, at
     the form, rather than a list the clerk has to find the tin on. */
  const tin = books.positions.find((p) => p.kind === "CASH" && p.active);
  const tinHref = (anchor: string) =>
    tin ? `/app/finance/accounts/${tin.id}#${anchor}` : "/app/finance/accounts";

  const kpis = [
    seesCompanyMoney
      ? {
          k: L("Cash available"),
          v: tzs(cashTzs),
          sub: rate ? usd(cashUsd) : L("Every bank, till and the office tin"),
          tone: "text-foreground",
          wash: "from-brand/10",
        }
      : {
          k: L("Collected all time"),
          v: tzs(desk.collectedMoney),
          sub: asUsd(desk.collectedMoney) ?? L("Paid against bills"),
          tone: "text-foreground",
          wash: "from-brand/10",
        },
    {
      k: L("In this month"),
      v: tzs(inMonth),
      sub: L("Everything that landed, transport included"),
      tone: "text-success",
      wash: "from-success/10",
    },
    ...(seesCompanyMoney
      ? [
          {
            k: L("Out this month"),
            v: tzs(outMonth),
            /* There is no refund in this business's books — a payment put
               right is reversed and simply stops counting as money in. */
            sub: L("Costs and transport passed on"),
            tone: "text-destructive",
            wash: "from-destructive/10",
          },
          {
            k: L("Net this month"),
            v: tzs(netMonth),
            sub: netMonth >= 0 ? L("Ahead") : L("Behind"),
            tone: netMonth >= 0 ? "text-foreground" : "text-destructive",
            wash: netMonth >= 0 ? "from-success/10" : "from-destructive/10",
          },
        ]
      : []),
    {
      k: L("Expected to come in"),
      v: tzs(desk.owed),
      sub: usd(desk.owedUsd),
      tone: desk.owed > 0 ? "text-destructive" : "text-foreground",
      wash: "from-destructive/10",
    },
    {
      k: L("Held in the warehouse"),
      v: formatCbm(heldCbm),
      sub: L("Landed in Dar, not handed over"),
      tone: "text-foreground",
      wash: "from-brand/5",
    },
  ];

  const label = "text-[11px] font-semibold uppercase tracking-widest text-muted-foreground";

  return (
    <div className="space-y-6">
      <PageHeader
        title={L("Finance")}
        description={L(
          "What the business has billed, what it is owed, what it has spent, and every movement between them."
        )}
        actions={
          <>
            <RecordPaymentButton compact />
            <Button asChild size="sm" variant="outline">
              <Link href="/app/finance/payments/new">
                <Layers />
                {L("Merge")}
              </Link>
            </Button>
            {/* Confirming a container's prices is not a finance-desk shortcut:
                it happens on the container itself, from Arrived containers,
                once Dar has counted it. */}
            <Button asChild size="sm" variant="outline">
              <Link href="/app/finance/credit">
                <CalendarClock />
                {L("Credit")}
              </Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href="/app/finance/expenses">
                <Plus />
                {L("Cost")}
              </Link>
            </Button>
          </>
        }
      />
      <FinanceTabs />

      <p className="-mt-2 max-w-3xl text-sm text-muted-foreground">
        {L(
          "The department at a glance: what the business is holding, what is owed to it, and how the containers are doing. Shown in shillings; the dollar figure is what the invoice says."
        )}
      </p>

      {/* ------------------------------------------------ the money, one band */}
      <section className="overflow-hidden rounded-xl border bg-card shadow-soft">
        <dl
          className={cn(
            "grid grid-cols-2 gap-px bg-border sm:grid-cols-3",
            kpis.length === 6 ? "2xl:grid-cols-6" : "2xl:grid-cols-4"
          )}
        >
          {kpis.map((cell) => (
            <div
              key={cell.k}
              className={cn("min-w-0 bg-card bg-gradient-to-b to-transparent px-4 py-4", cell.wash)}
            >
              <dt className="truncate text-[11px] uppercase tracking-wide text-muted-foreground">
                {cell.k}
              </dt>
              <dd
                className={cn(
                  "tnum mt-1 break-words font-bold leading-tight sm:whitespace-nowrap",
                  cell.v.length > 16 ? "text-base sm:text-lg" : "text-xl sm:text-2xl",
                  cell.tone
                )}
              >
                {cell.v}
              </dd>
              <p className="mt-0.5 text-[11px] text-muted-foreground"><Tx>{cell.sub}</Tx></p>
            </div>
          ))}
        </dl>

        <div className="flex flex-wrap items-center gap-2 border-t bg-muted/20 px-5 py-2.5">
          <RecordPaymentButton primary />
          {seesCompanyMoney ? (
            <>
              <Button asChild size="sm" variant="outline">
                <Link href={tin ? `${tinHref("pay-out-of-cash")}` : "/app/finance/expenses"}>
                  <Receipt />
                  {L("Record a cost")}
                </Link>
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link href={tinHref("move-money")}>
                  <ArrowLeftRight />
                  {L("Move money")}
                </Link>
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link href={tinHref("count-the-cash")}>
                  <Calculator />
                  {L("Count the cash tin")}
                </Link>
              </Button>
            </>
          ) : null}
          <span className="tnum ml-auto text-xs text-muted-foreground">
            {rate ? (
              <>
                1 USD ={" "}
                <span className="font-semibold text-brand">
                  {Number(rate).toLocaleString("en-US")}
                </span>{" "}
                TSh
              </>
            ) : (
              <span className="text-destructive">{L("No rate set")}</span>
            )}
            <Link
              href="/app/finance/rates#exchange-rate"
              className="ml-2 font-medium text-brand hover:underline"
            >
              {L("change")}
            </Link>
          </span>
        </div>
      </section>

      {/* ------------------------------------------------------------ containers */}
      <div>
        <div className="mb-2 flex items-center justify-between gap-3">
          <p className={label}>{L("Containers")}</p>
          <Link
            href="/app/finance/containers"
            className="flex items-center gap-1 text-sm text-primary hover:underline"
          >
            {L("What each one made")}
            <ArrowRight className="size-3.5" />
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-4">
          {[
            {
              label: L("Still open"),
              value: String(stillOpen),
              tone: "text-brand",
              hint: L("Money can still move"),
              href: "/app/containers",
            },
            {
              label: L("With the boss"),
              value: String(withBoss),
              tone: withBoss > 0 ? "text-warning" : "text-muted-foreground",
              hint: L("Waiting to be read"),
              href: "/app/finance/containers",
            },
            {
              label: L("Confirmed"),
              value: String(confirmedIds.size),
              tone: "text-success",
              hint: L("Agreed and final"),
              href: "/app/finance/containers",
            },
            {
              label: L("Profit, confirmed"),
              value: tzs(confirmedProfit),
              tone: confirmedProfit < 0 ? "text-destructive" : "text-success",
              hint: `${confirmedIds.size} ${L(confirmedIds.size === 1 ? "container" : "containers")}`,
              href: "/app/finance/containers",
            },
          ].map((cell) => (
            <Link
              key={cell.label}
              href={cell.href}
              className="bg-card px-4 py-3 transition-colors hover:bg-secondary/50"
            >
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                <Tx>{cell.label}</Tx>
              </p>
              <p className={cn("tnum mt-0.5 text-xl font-bold", cell.tone)}>{cell.value}</p>
              <p className="text-[11px] text-muted-foreground"><Tx>{cell.hint}</Tx></p>
            </Link>
          ))}
        </div>
      </div>

      {/* ------------------------------------------------------------ needs you */}
      <section className="overflow-hidden rounded-xl border bg-card shadow-soft">
        <h2 className={cn("border-b px-5 py-3", label)}>{L("Needs you")}</h2>
        {needs.length === 0 ? (
          <p className="px-5 py-6 text-sm text-muted-foreground">
            {L(
              "Nothing is waiting. Every price is confirmed, every payment says where it landed, and nothing is owed either way."
            )}
          </p>
        ) : (
          <ul className="divide-y">
            {needs.map((row) => (
              <li key={row.title}>
                <Link
                  href={row.href}
                  className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3.5 transition-colors hover:bg-secondary/40"
                >
                  <span
                    aria-hidden
                    className={cn(
                      "size-2 shrink-0 rounded-full",
                      row.urgent ? "bg-warning" : "bg-muted-foreground/40"
                    )}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium"><Tx>{row.title}</Tx></span>
                    <span className="block text-xs text-muted-foreground"><Tx>{row.detail}</Tx></span>
                  </span>
                  {row.tzs !== null ? (
                    <span className="text-right">
                      <span className="tnum block text-lg font-bold">{tzs(row.tzs)}</span>
                      <span className="tnum block text-xs text-muted-foreground">
                        {row.usd !== undefined && row.usd !== null ? usd(row.usd) : asUsd(row.tzs)}
                      </span>
                    </span>
                  ) : null}
                  <span className="shrink-0 text-xs font-medium text-brand">
                    {row.action} →
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ------------------------------------------------------- the desk's doors */}
      <section>
        <p className={cn("mb-2", label)}>{L("The finance desk")}</p>
        <div className="grid grid-cols-1 gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-2 lg:grid-cols-3">
          {[
            {
              href: "/app/finance/collections/verify",
              title: L("Verify payments"),
              body: L("What customers say they have sent"),
              count: desk.toVerify,
              unit: L("waiting"),
              urgent: true,
            },
            {
              href: "/app/finance/collections",
              title: L("Collections"),
              body: L("Bills nobody has paid yet"),
              count: unpaidBills,
              unit: L("unpaid"),
              urgent: true,
            },
            {
              href: "/app/finance/containers",
              title: L("Closed containers"),
              body: L("What each closed container made"),
              count: withBoss,
              unit: L("with the boss"),
              urgent: false,
            },
            {
              href: "/app/finance/accounts",
              title: L("Accounts"),
              body: L("Every bank, till and the office tin"),
            },
            {
              href: "/app/finance/ledger",
              title: L("General ledger"),
              body: L("Every shilling in and out, in one register"),
            },
            {
              href: "/app/finance/reports",
              title: L("Profit & loss"),
              body: L("Earned against spent, for a period"),
            },
          ].map((door) => (
            <Link
              key={door.href}
              href={door.href}
              className="group flex items-baseline gap-3 bg-card px-5 py-3.5 transition-colors hover:bg-secondary/50"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium group-hover:text-brand">
                  <Tx>{door.title}</Tx>
                </span>
                <span className="block text-xs text-muted-foreground">{door.body}</span>
              </span>
              {door.count === undefined ? null : door.count > 0 ? (
                <span
                  className={cn(
                    "tnum shrink-0 text-xs font-semibold",
                    door.urgent ? "text-destructive" : "text-signal"
                  )}
                >
                  {door.count} {door.unit}
                </span>
              ) : (
                <span className="shrink-0 text-xs text-muted-foreground">
                  {L("nothing waiting")}
                </span>
              )}
            </Link>
          ))}
        </div>
      </section>

      {/* -------------------------------------------------- where the cargo is */}
      <section className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-xl border bg-card px-5 py-4 shadow-soft">
        <p className={label}>{L("Where the cargo is")}</p>
        {[
          [L("Waiting in China"), position.inChina],
          [L("At sea"), position.atSea],
          [L("On the Dar floor"), position.inDar],
          [L("Ready to collect"), position.ready],
          [L("Delivered"), position.done],
        ].map(([name, value]) => (
          <div key={String(name)} className="flex items-baseline gap-2">
            <span className="tnum text-lg font-bold">{value}</span>
            <span className="text-xs text-muted-foreground">{name}</span>
          </div>
        ))}
        <p className="tnum ml-auto text-xs text-muted-foreground">
          {formatCbm(heldCbm)} {L("held in Dar")}
        </p>
      </section>

      <MoneyInShape books={books} />
    </div>
  );
}
