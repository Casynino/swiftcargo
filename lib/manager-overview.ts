import "server-only";

import { Prisma, type ContainerStatus, type Department } from "@prisma/client";

import type { AttentionItem } from "@/components/app/attention-center";
import { DEPARTMENT_LABELS } from "@/lib/constants";
import { creditBook, pendingCreditRequests } from "@/lib/credit";
import { formatCurrency, isUsableRate, tzsToUsd, usdToTzs } from "@/lib/currency";
import {
  figures,
  loadBooks,
  monthRange,
  periodRange,
  sum,
  within,
} from "@/lib/finance-report";
import { t, type Locale } from "@/lib/i18n";
import { balanceOf, invoiceRate, owedAcross, paymentTzs } from "@/lib/invoice-balance";
import { monthLabel, payrollFigure, payrollRuns, pendingPayrollApproval } from "@/lib/payroll";
import { prisma } from "@/lib/prisma";

/**
 * "What is happening in my company right now", in one object.
 *
 * COMPOSED, NOT COMPUTED. The money is read off the same engines Finance reads:
 * loadBooks/figures for the period, owedAcross for what customers owe,
 * creditBook for what went out on a promise, accountPositions for the accounts.
 * The manager's screen and Finance's own screen disagreeing about one number is
 * how a weekly meeting turns into an argument about whose page is right, and the
 * only way that cannot happen is for there to be one definition of each figure.
 *
 * SHILLINGS FIRST. Every money figure here is carried in whole shillings, each
 * bill, payment and cost at the rate pinned on it. A dollar figure appears only
 * as its own line ("on the invoice") and is never added to a shilling one.
 *
 * ONE Promise.all. These are independent reads of the same instant, and running
 * them in sequence would mean the top of the screen describes a different minute
 * from the bottom of it.
 *
 * AN HONESTY RULE, load-bearing:
 *
 * There is NO attendance in this schema — no shift, no clock-in. `lastActiveAt`
 * is written at sign-in, so "opened the app today" means exactly that. The
 * screen says so rather than let a manager read it as attendance.
 *
 * Payroll is read off lib/payroll.ts, the same reader the payroll screens use,
 * so "waiting on you" here and there is one list.
 */

export type InsightTone = "good" | "warn" | "bad" | "neutral";

export type Insight = {
  id: string;
  tone: InsightTone;
  /** One true sentence, already in the reader's language. */
  text: string;
  /** The screen that explains it. An insight with no way in is a poster. */
  href: string;
  /** How much this ought to move a decision today. The sort key, never printed. */
  rank: number;
};

export type ContainerProfit = {
  id: string;
  reference: string;
  status: ContainerStatus;
  revenueTzs: number;
  collectedTzs: number;
  outstandingTzs: number;
  costsTzs: number;
  profitTzs: number;
  margin: number | null;
  /** Draft bills still on it — its revenue will move. */
  unconfirmed: number;
  hasCosts: boolean;
};

export type DeskPulse = {
  key: string;
  desk: string;
  href: string;
  headline: string;
  headlineLabel: string;
  detail: string;
  /** What is wrong. Null when the desk is clean. */
  problem: string | null;
  tone: "brand" | "signal" | "success" | "warning" | "marine";
};

export type AccountStanding = {
  id: string;
  name: string;
  kind: "BANK" | "MOBILE_MONEY" | "CASH";
  currency: string;
  balance: number;
  lastCountedAt: Date | null;
  /** Money moved after the last count, so the count no longer vouches for it. */
  movedSinceCount: boolean;
};

const DAY = 86_400_000;
const OPEN_CASE = { status: { notIn: ["RESOLVED", "CLOSED"] } } satisfies Prisma.ExceptionCaseWhereInput;
const OPEN_TICKET = { status: { notIn: ["RESOLVED", "CLOSED"] } } satisfies Prisma.ConversationWhereInput;
const IN_CHINA = ["RECEIVED_CHINA", "ASSIGNED_TO_CONTAINER", "CONTAINER_LOADED"] as const;
const AT_DAR = ["RECEIVED_DAR", "READY_FOR_RELEASE"] as const;

/**
 * A container still in Guangzhou: open, filling, loaded or sealed and waiting
 * for the vessel. Sealed belongs here and not at sea — a sealed box on the quay
 * has not left China, and counting it as sailed puts it under two stages.
 */
const LOADING_IN_GUANGZHOU: ContainerStatus[] = ["OPEN", "LOADING", "LOADED", "SEALED"];
const AT_SEA: ContainerStatus[] = ["DEPARTED", "IN_TRANSIT"];

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** A share of a previous figure, or undefined when there is nothing to compare. */
function percentDelta(current: number, previous: number) {
  if (previous <= 0) return undefined;
  return ((current - previous) / previous) * 100;
}

const daysSince = (d: Date, now: Date) =>
  Math.max(0, Math.floor((now.getTime() - d.getTime()) / DAY));

const paymentSelect = {
  status: true,
  amount: true,
  currency: true,
  fxRate: true,
  baseCurrencyAmount: true,
  creditedAmount: true,
} satisfies Prisma.PaymentSelect;

const billSelect = {
  total: true,
  currency: true,
  fxRate: true,
  totalTzs: true,
  dueAt: true,
  payments: { select: paymentSelect },
} satisfies Prisma.InvoiceSelect;

export async function managerOverview(locale: Locale = "en", now = new Date()) {
  const today = periodRange("today", now).current;
  const { current: month, previous: lastMonth } = periodRange("month", now);
  const yearStart = new Date(now.getFullYear(), 0, 1);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * DAY);

  const [
    books,
    credit,
    creditRequests,
    collectedToday,
    bills,
    pending,
    rejected,
    drafts,
    unbilled,
    noAccount,
    cases,
    noPhoto,
    staleInChina,
    heldInChina,
    openTooLong,
    shortRows,
    lateAtSea,
    floorRows,
    settings,
    heldNoNote,
    releasedThisMonth,
    registered,
    containerRows,
    cargoRows,
    mixRows,
    sailed,
    arrivedBoxes,
    customersTotal,
    customersNew,
    awaitingReply,
    openTickets,
    urgentTickets,
    staff,
    suspended,
    openSourcing,
    activity,
    payrollWaiting,
    latestRuns,
  ] = await Promise.all([
    loadBooks(),
    creditBook(),
    pendingCreditRequests(),
    /* Rows, not a sum of `amount`: shillings and dollars in one column added
       together are neither. Each is valued at its own stored shilling figure. */
    prisma.payment.findMany({
      where: {
        status: "VERIFIED",
        writtenOff: false,
        OR: [
          { paidAt: { gte: today.from, lt: today.to } },
          { paidAt: null, createdAt: { gte: today.from, lt: today.to } },
        ],
      },
      select: { ...paymentSelect, invoice: { select: { fxRate: true } } },
    }),
    prisma.invoice.findMany({
      where: { status: { notIn: ["DRAFT", "CANCELLED"] } },
      select: billSelect,
    }),
    prisma.payment.findMany({
      where: { status: "PENDING" },
      orderBy: { createdAt: "asc" },
      select: { ...paymentSelect, createdAt: true, invoice: { select: { fxRate: true } } },
    }),
    /* Only the ones somebody still has to ring about. A refused claim whose bill
       has since been settled another way is finished work, and counting it keeps
       dead rows at the top of the list forever. */
    prisma.payment.findMany({
      where: { status: "REJECTED", writtenOff: false },
      select: { id: true, invoice: { select: billSelect } },
    }),
    prisma.invoice.findMany({
      where: { status: "DRAFT" },
      select: {
        createdAt: true,
        cargo: {
          select: {
            containerLines: { take: 1, orderBy: { createdAt: "desc" }, select: { containerId: true } },
          },
        },
      },
    }),
    prisma.cargo.count({
      where: {
        deletedAt: null,
        status: { in: [...AT_DAR] },
        invoices: { none: { status: { not: "CANCELLED" } } },
      },
    }),
    prisma.payment.count({ where: { status: "VERIFIED", writtenOff: false, accountId: null } }),
    prisma.exceptionCase.findMany({ where: OPEN_CASE, select: { createdAt: true, priority: true } }),
    prisma.cargo.count({
      where: { deletedAt: null, status: { in: [...IN_CHINA] }, photos: { none: {} } },
    }),
    prisma.cargo.count({
      where: {
        deletedAt: null,
        status: "RECEIVED_CHINA",
        chinaReceiving: { receivedAt: { lt: new Date(now.getTime() - 14 * DAY) } },
      },
    }),
    prisma.cargo.count({
      where: { deletedAt: null, operationalHold: true, status: { in: [...IN_CHINA] } },
    }),
    prisma.container.count({
      where: {
        deletedAt: null,
        status: { in: ["OPEN", "LOADING"] },
        createdAt: { lt: new Date(now.getTime() - 3 * DAY) },
      },
    }),
    /* Unverified only. A shortfall Dar has already reviewed and signed for is
       explained; the row is for the ones nobody has looked at yet. */
    prisma.darReceiving.findMany({
      where: { discrepancy: true, verified: false, cargo: { deletedAt: null } },
      select: { packagesCount: true, cargo: { select: { chinaReceiving: { select: { packagesCount: true } } } } },
    }),
    prisma.shipment.count({
      where: {
        status: { notIn: ["COMPLETED", "PREPARING"] },
        eta: { lt: now },
        actualArrival: null,
        container: { deletedAt: null },
      },
    }),
    prisma.darReceiving.findMany({
      where: { cargo: { deletedAt: null, status: { in: [...AT_DAR] } } },
      select: { receivedAt: true, cbm: true },
    }),
    prisma.companySetting.findUnique({ where: { id: "singleton" }, select: { freeStorageDays: true } }),
    prisma.cargo.count({
      where: {
        deletedAt: null,
        status: { in: [...AT_DAR] },
        NOT: { pickupNote: { is: { status: "ACTIVE" } } },
      },
    }),
    prisma.release.count({
      where: { releasedAt: { gte: month.from, lt: month.to }, cargo: { deletedAt: null } },
    }),
    prisma.cargo.findMany({
      where: { deletedAt: null, createdAt: { gte: yearStart } },
      select: { createdAt: true },
    }),
    prisma.container.groupBy({
      by: ["status"],
      where: { deletedAt: null },
      _count: { _all: true },
    }),
    prisma.cargo.groupBy({
      by: ["status"],
      where: { deletedAt: null },
      _count: { _all: true },
    }),
    prisma.cargoPackage.findMany({
      where: {
        deletedAt: null,
        cargo: { deletedAt: null, chinaReceiving: { receivedAt: { gte: thirtyDaysAgo } } },
      },
      select: { cargoType: true, cbm: true },
    }),
    prisma.container.findMany({
      where: { deletedAt: null, status: { in: ["DEPARTED", "IN_TRANSIT", "ARRIVED", "CLOSED"] } },
      orderBy: [{ sealedAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
      take: 8,
      select: { reference: true, containerNumber: true, cargoLines: { select: { cbm: true } } },
    }),
    prisma.container.findMany({
      where: { deletedAt: null, status: "ARRIVED" },
      select: {
        updatedAt: true,
        events: { where: { to: "ARRIVED" }, orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true } },
      },
    }),
    prisma.customer.count({ where: { deletedAt: null } }),
    prisma.customer.count({ where: { deletedAt: null, createdAt: { gte: month.from } } }),
    prisma.conversation.count({ where: { ...OPEN_TICKET, staffUnread: true } }),
    prisma.conversation.count({ where: OPEN_TICKET }),
    prisma.conversation.count({ where: { ...OPEN_TICKET, priority: "URGENT" } }),
    prisma.user.findMany({
      where: { role: { not: "CUSTOMER" }, active: true },
      select: { department: true, lastActiveAt: true, lastLoginAt: true },
    }),
    /* Counted outside the roster above: a suspended account carries
       active=false, so a roster filtered on active can never contain one. */
    prisma.user.count({ where: { role: { not: "CUSTOMER" }, status: "SUSPENDED" } }),
    prisma.sourcingRequest.count({ where: { status: { notIn: ["COMPLETED", "CANCELLED"] } } }),
    prisma.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 8,
      select: {
        id: true,
        action: true,
        summary: true,
        createdAt: true,
        actorEmail: true,
        actor: { select: { name: true } },
      },
    }),
    pendingPayrollApproval(now),
    payrollRuns(1),
  ]);

  const rate = books.today > 0 ? books.today : null;
  const tzs = (n: Prisma.Decimal | number) => formatCurrency(n, "TZS");
  // A sentence with a figure in it can never be looked up whole, so the phrase
  // is translated on its own and the number put back around it.
  const count = (n: number, phrase: string) => `${n} ${t(locale, phrase)}`;

  // ------------------------------------------------------------- the money
  let collectedTodayTzs = new Prisma.Decimal(0);
  let collectedTodayUsd = new Prisma.Decimal(0);
  for (const p of collectedToday) {
    const value = paymentTzs(p, p.invoice);
    if (!value) continue;
    collectedTodayTzs = collectedTodayTzs.add(value);
    const own = isUsableRate(p.fxRate) && new Prisma.Decimal(p.fxRate!).greaterThan(1)
      ? new Prisma.Decimal(p.fxRate!)
      : invoiceRate(p.invoice);
    if (p.currency === "USD") collectedTodayUsd = collectedTodayUsd.add(p.amount);
    else if (own) collectedTodayUsd = collectedTodayUsd.add(tzsToUsd(value, own));
  }

  const billedToday = sum(books.bills.filter((b) => within(b.at, today)), (b) => b.total);
  const spentToday = sum(books.costs.filter((c) => within(c.at, today)), (c) => c.amount);

  const owed = owedAcross(bills);
  const unpaidBills = bills.filter((b) => !balanceOf(b).settled);
  const overdueBills = unpaidBills.filter((b) => b.dueAt && b.dueAt < now);

  const f = figures(books, month);
  const prior = figures(books, lastMonth);
  const billedMonthTzs = f.revenue.tzs;
  const costMonthTzs = f.expenses.tzs;
  const profitMonthTzs = f.profit.tzs;
  const marginPct = billedMonthTzs > 0 ? (profitMonthTzs / billedMonthTzs) * 100 : null;
  const collectionRatePct =
    billedMonthTzs > 0 ? ((billedMonthTzs - f.outstanding.tzs) / billedMonthTzs) * 100 : null;

  /* Cash, not accrual: money that arrived against money that left an account.
     The same two sides Finance's own chart draws, so the lines agree with it. */
  const flow = Array.from({ length: now.getMonth() + 1 }, (_, m) => {
    const r = monthRange(now.getFullYear(), m);
    return {
      label: MONTHS[m],
      in: sum(books.money.filter((x) => within(x.at, r)), (x) => x.amount).tzs,
      out: sum(books.costs.filter((c) => c.paid && within(c.at, r)), (c) => c.amount).tzs,
    };
  });

  // -------------------------------------------------------------- accounts
  const accounts: AccountStanding[] = books.positions
    .filter((p) => p.active)
    .map((p) => ({
      id: p.id,
      name: `${p.bankName} (${p.currency})`,
      kind: p.kind,
      currency: p.currency,
      balance: p.balance,
      lastCountedAt: p.lastCountedAt,
      movedSinceCount:
        p.lastCountedAt !== null && p.lastMovedAt !== null && p.lastMovedAt > p.lastCountedAt,
    }));
  /* Each account in shillings through lib/currency, a dollar account at today's
     rate — the one figure on the panel that is converted, and it says so. With
     no rate published, dollars are kept apart rather than guessed at. */
  let heldTzs = new Prisma.Decimal(0);
  let heldUnconvertedUsd = 0;
  for (const a of accounts) {
    if (a.currency === "TZS") heldTzs = heldTzs.add(Math.round(a.balance));
    else if (rate) heldTzs = heldTzs.add(usdToTzs(a.balance, rate));
    else heldUnconvertedUsd += a.balance;
  }
  const accountsToCheck = accounts.filter((a) => a.lastCountedAt === null || a.movedSinceCount).length;

  // ------------------------------------------------------------ containers
  const draftsOn = new Map<string, number>();
  for (const d of drafts) {
    const id = d.cargo.containerLines[0]?.containerId;
    if (id) draftsOn.set(id, (draftsOn.get(id) ?? 0) + 1);
  }
  const containerProfit: ContainerProfit[] = books.boxes
    .filter((c) => AT_SEA.includes(c.status) || c.status === "ARRIVED" || c.status === "CLOSED" || c.billed.tzs > 0)
    .sort(
      (a, b) =>
        (b.departed ?? b.arrived ?? new Date(0)).getTime() -
        (a.departed ?? a.arrived ?? new Date(0)).getTime()
    )
    .slice(0, 12)
    .map((c) => ({
      id: c.id,
      reference: c.reference,
      status: c.status,
      revenueTzs: c.billed.tzs,
      collectedTzs: c.collected.tzs,
      outstandingTzs: c.owed.tzs,
      costsTzs: c.spent.tzs,
      profitTzs: c.profit.tzs,
      margin: c.billed.tzs > 0 ? (c.profit.tzs / c.billed.tzs) * 100 : null,
      unconfirmed: draftsOn.get(c.id) ?? 0,
      hasCosts: c.spent.tzs > 0,
    }));

  // ------------------------------------------------------------- the floor
  const freeDays = settings?.freeStorageDays ?? 7;
  const storageLine = new Date(now.getTime() - freeDays * DAY);
  const pastStorage = floorRows.filter((r) => r.receivedAt < storageLine);
  const longestHeld = floorRows.length
    ? Math.max(...floorRows.map((r) => daysSince(r.receivedAt, now)))
    : 0;
  const cbmOnFloor = floorRows.reduce((s, r) => s + Number(r.cbm ?? 0), 0);

  const shortBoxes = shortRows.reduce(
    (s, r) => s + Math.max(0, (r.cargo.chinaReceiving?.packagesCount ?? 0) - r.packagesCount),
    0
  );

  const byCargo = (statuses: readonly string[]) =>
    cargoRows.filter((r) => statuses.includes(r.status)).reduce((s, r) => s + r._count._all, 0);
  const byContainer = (statuses: readonly string[]) =>
    containerRows.filter((r) => statuses.includes(r.status)).reduce((s, r) => s + r._count._all, 0);

  const position = {
    inChina: byCargo(IN_CHINA),
    atSea: byCargo(["DEPARTED_CHINA", "IN_TRANSIT"]),
    onFloor: byCargo(["ARRIVED_TANZANIA", "RECEIVED_DAR"]),
    ready: byCargo(["READY_FOR_RELEASE"]),
    flagged: byCargo(["MISSING_AT_DAR"]),
    total: 0,
  };
  position.total = position.inChina + position.atSea + position.onFloor + position.ready + position.flagged;
  const waitingForContainer = byCargo(["RECEIVED_CHINA"]);

  const registeredByMonth = Array.from({ length: now.getMonth() + 1 }, () => 0);
  for (const r of registered) {
    if (r.createdAt.getFullYear() === now.getFullYear()) registeredByMonth[r.createdAt.getMonth()] += 1;
  }

  // ------------------------------------------------------------------- mix
  const UNCLASSIFIED = t(locale, "Not classified");
  const byType = new Map<string, { lines: number; cbm: number }>();
  for (const row of mixRows) {
    const key = row.cargoType?.trim() || UNCLASSIFIED;
    const entry = byType.get(key) ?? { lines: 0, cbm: 0 };
    entry.lines += 1;
    entry.cbm += Number(row.cbm);
    byType.set(key, entry);
  }
  const sortedMix = [...byType.entries()]
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.lines - a.lines);
  const mixSlices = sortedMix.slice(0, 5);
  const tail = sortedMix.slice(5);
  if (tail.length > 0) {
    mixSlices.push({
      name: `${t(locale, "Other")} (${tail.length} ${t(locale, "types")})`,
      lines: tail.reduce((s, x) => s + x.lines, 0),
      cbm: tail.reduce((s, x) => s + x.cbm, 0),
    });
  }

  const carried = sailed
    .map((c) => ({
      label: c.containerNumber ?? c.reference,
      value: Number(c.cargoLines.reduce((s, l) => s + Number(l.cbm), 0).toFixed(2)),
    }))
    .reverse();

  // --------------------------------------------------------- the attention
  const pendingTzs = pending.reduce((s, p) => s.add(paymentTzs(p, p.invoice) ?? 0), new Prisma.Decimal(0));
  const sentBack = rejected.filter((p) => !balanceOf(p.invoice).settled);
  const urgentCases = cases.filter((c) => c.priority === "URGENT").length;

  const G = {
    china: t(locale, "Guangzhou"),
    dar: t(locale, "Dar floor"),
    finance: t(locale, "Finance"),
    support: t(locale, "Support"),
    cases: t(locale, "Cases"),
  };

  const attention: AttentionItem[] = (
    [
      {
        id: "cn-photos",
        group: G.china,
        count: noPhoto,
        tone: "bad",
        title: count(noPhoto, "received with no photograph"),
        detail: t(locale, "Nothing to show a customer whose cargo arrives damaged, and nothing to argue with when they say it did."),
        href: "/app/inventory?state=nophoto",
      },
      {
        id: "cn-shelf",
        group: G.china,
        count: staleInChina,
        tone: "warn",
        title: count(staleInChina, "waiting in Guangzhou more than a fortnight"),
        detail: t(locale, "Received and still not loaded. The customer is asking, and the shelf is paid for."),
        href: "/app/inventory?state=waiting",
      },
      {
        id: "cn-open",
        group: G.china,
        count: openTooLong,
        tone: "warn",
        title: `${openTooLong} ${t(locale, "container(s) open more than")} 3 ${t(locale, "days")}`,
        detail: t(locale, "A box left open stops being a sailing and becomes a shelf."),
        href: "/app/containers/loading",
      },
      {
        id: "cn-hold",
        group: G.china,
        count: heldInChina,
        tone: "warn",
        title: count(heldInChina, "on hold in Guangzhou"),
        detail: t(locale, "Cannot be loaded until somebody clears the hold."),
        href: "/app/inventory?state=hold",
      },
      {
        id: "dar-short",
        group: G.dar,
        count: shortBoxes,
        tone: "bad",
        title: count(shortBoxes, "box(es) short of the manifest"),
        detail: t(locale, "Booked in at Dar with fewer packages than Guangzhou recorded, and nobody has reviewed the gap."),
        href: "/app/receive/dar",
      },
      {
        id: "dar-missing",
        group: G.dar,
        count: byCargo(["MISSING_AT_DAR"]),
        tone: "bad",
        title: count(byCargo(["MISSING_AT_DAR"]), "did not come off the container"),
        detail: t(locale, "On the manifest of a landed container and not on the floor. Each has a case open against it."),
        href: "/app/cargo?status=MISSING_AT_DAR",
      },
      {
        id: "dar-late",
        group: G.dar,
        count: lateAtSea,
        tone: "warn",
        title: count(lateAtSea, "sailing(s) past the expected arrival"),
        detail: t(locale, "Still at sea after the date the customer was given. Worth a call to the line before they ring us."),
        href: "/app/containers?status=IN_TRANSIT",
      },
      {
        id: "dar-unfinished",
        group: G.dar,
        count: arrivedBoxes.length,
        tone: "warn",
        title: count(arrivedBoxes.length, "landed container(s) not finished"),
        detail: t(locale, "The container is in and its consignments are not all booked in and closed."),
        href: "/app/containers/arrived",
      },
      {
        id: "dar-storage",
        group: G.dar,
        count: pastStorage.length,
        tone: "warn",
        title: count(pastStorage.length, "past the free storage window"),
        detail: `${t(locale, "Standing more than")} ${freeDays} ${t(locale, "days, and the customer usually does not know.")}`,
        href: "/app/inventory",
        meta: `${t(locale, "longest")} ${longestHeld}d`,
      },
      {
        id: "dar-ready",
        group: G.dar,
        count: position.ready,
        tone: "neutral",
        title: count(position.ready, "cleared, not collected"),
        detail: t(locale, "Paid for and ready to go, and still on our floor."),
        href: "/app/release",
      },
      {
        id: "fin-drafts",
        group: G.finance,
        count: drafts.length,
        tone: "bad",
        title: count(drafts.length, "price(s) to confirm"),
        detail: t(locale, "Nobody can be asked for this money, and no cargo released, until the bill is issued."),
        href: "/app/containers/arrived?view=pricing",
      },
      {
        id: "fin-unbilled",
        group: G.finance,
        count: unbilled,
        tone: "warn",
        title: count(unbilled, "landed and not billed"),
        detail: t(locale, "Sitting in Dar with no invoice against it."),
        href: "/app/containers/arrived?view=pricing",
      },
      {
        id: "fin-verify",
        group: G.finance,
        count: pending.length,
        tone: "warn",
        title: count(pending.length, "payment(s) waiting for Finance"),
        detail: t(locale, "Somebody says money moved and nobody has checked. It counts for nothing until it is verified."),
        href: "/app/finance/collections/verify",
        meta: tzs(pendingTzs),
        metaSub: pending[0] ? `${t(locale, "oldest")} ${daysSince(pending[0].createdAt, now)}d` : undefined,
      },
      {
        id: "fin-overdue",
        group: G.finance,
        count: overdueBills.length,
        tone: "bad",
        title: count(overdueBills.length, "bill(s) past due"),
        detail: t(locale, "Billed, confirmed, and still not paid after the day it was due."),
        href: "/app/finance/collections?view=overdue",
        meta: owedAcross(overdueBills).primary,
      },
      {
        id: "fin-no-account",
        group: G.finance,
        count: noAccount,
        tone: "warn",
        title: count(noAccount, "verified payment(s) in no account"),
        detail: t(locale, "Money we hold that nobody has said where it landed, so no account balance includes it."),
        href: "/app/finance/ledger",
      },
      {
        id: "fin-payroll",
        group: G.finance,
        count: payrollWaiting.length,
        tone: (payrollWaiting[0]?.waitingDays ?? 0) >= 3 ? "bad" : "warn",
        title: count(payrollWaiting.length, "salary run(s) waiting on your approval"),
        detail: t(locale, "Finance has prepared the month. Nobody is paid until it is agreed."),
        href: "/app/manager/payroll",
        meta: payrollWaiting[0]
          ? payrollFigure(payrollWaiting.reduce((n, r) => n + r.totals.net, 0), rate).lead
          : undefined,
        metaSub: payrollWaiting[0] ? `${t(locale, "oldest")} ${payrollWaiting[0].waitingDays}d` : undefined,
      },
      {
        id: "sup-sent-back",
        group: G.support,
        count: sentBack.length,
        tone: "bad",
        title: count(sentBack.length, "payment(s) sent back by Finance"),
        detail: t(locale, "The customer believes they paid, Finance found no money, and the bill still owes."),
        href: "/app/finance/collections/sent-back",
      },
      {
        id: "sup-urgent",
        group: G.support,
        count: urgentTickets,
        tone: "bad",
        title: count(urgentTickets, "ticket(s) marked urgent"),
        detail: t(locale, "A customer is waiting on an answer somebody flagged as important."),
        href: "/app/support/tickets",
      },
      {
        id: "sup-credit",
        group: G.support,
        count: creditRequests.length,
        tone: "warn",
        title: count(creditRequests.length, "credit request(s) unanswered"),
        detail: t(locale, "A customer is waiting at the counter to hear whether their cargo may go before the money."),
        href: "/app/finance/credit",
      },
      {
        id: "sup-sourcing",
        group: G.support,
        count: openSourcing,
        tone: "neutral",
        title: count(openSourcing, "sourcing request(s) open"),
        detail: t(locale, "Somebody asked us to find them something in China."),
        href: "/app/support/sourcing",
      },
      {
        id: "cases",
        group: G.cases,
        count: cases.length,
        tone: urgentCases > 0 ? "bad" : "warn",
        title: count(cases.length, "open case(s)"),
        detail:
          urgentCases > 0
            ? `${t(locale, "Cargo reported missing, damaged or wrong —")} ${urgentCases} ${t(locale, "marked urgent.")}`
            : t(locale, "Cargo reported missing, damaged or wrong on arrival."),
        href: "/app/exceptions",
      },
    ] satisfies AttentionItem[]
  ).filter((row) => row.count > 0);

  // ----------------------------------------------------------- the company
  const oldest = [
    ...pending.map((p) => p.createdAt),
    ...drafts.map((d) => d.createdAt),
    ...cases.map((c) => c.createdAt),
    ...creditRequests.map((r) => r.askedAt),
  ].reduce<Date | null>((min, d) => (min === null || d < min ? d : min), null);

  const arrivedSince = arrivedBoxes
    .map((b) => b.events[0]?.createdAt ?? b.updatedAt)
    .reduce<Date | null>((min, d) => (min === null || d < min ? d : min), null);

  const midnight = today.from;
  const departments = new Map<Department, number>();
  let seenToday = 0;
  for (const person of staff) {
    if (person.department) departments.set(person.department, (departments.get(person.department) ?? 0) + 1);
    const seen = person.lastActiveAt ?? person.lastLoginAt;
    if (seen && seen >= midnight) seenToday += 1;
  }

  const overdueOnCredit = credit.rows.filter((r) => r.state === "OVERDUE").length;

  // ---------------------------------------------------------- the briefing
  const money = (n: number) => tzs(n);
  const pct = (n: number) => `${Math.abs(Math.round(n))}%`;
  const dir = (n: number) => t(locale, n >= 0 ? "up" : "down");
  const costDelta = percentDelta(f.expenses.tzs, prior.expenses.tzs);
  const creditDelta = percentDelta(f.creditRevenue.tzs, prior.creditRevenue.tzs);
  const verifyAge = pending[0] ? daysSince(pending[0].createdAt, now) : null;
  const unpaidLanded = books.boxes.filter(
    (c) => (c.status === "ARRIVED" || c.status === "CLOSED") && c.owed.tzs >= 1
  );
  const unpaidLandedTzs = unpaidLanded.reduce((s, c) => s + c.owed.tzs, 0);
  const sailingNoCosts = books.boxes.filter(
    (c) => (AT_SEA.includes(c.status) || c.status === "ARRIVED") && c.spent.tzs === 0
  );

  /*
    NOTHING THE PAGE ALREADY STATES AS A FIGURE.

    The month's profit, what was billed and the collection rate each have a
    panel of their own on this screen, and a sentence repeating one of them reads
    as an independent finding. Worse, a sentence built on a different definition
    prints a different number for the same claim. The briefing carries only what
    no panel says: ages, comparisons, and the landed containers still owing.
  */
  const candidates: (Insight & { when: boolean })[] = [
    {
      when: verifyAge !== null && verifyAge >= 2,
      id: "verify-age",
      tone: (verifyAge ?? 0) >= 5 ? "bad" : "warn",
      rank: 85,
      text: `${t(locale, "The oldest payment has been waiting")} ${verifyAge ?? 0} ${t(locale, "days for Finance to verify it")}`,
      href: "/app/finance/collections/verify",
    },
    {
      when: lateAtSea > 0,
      id: "late-at-sea",
      tone: "warn",
      rank: 80,
      text: `${lateAtSea} ${t(locale, "sailing(s) past the arrival date the customer was given")}`,
      href: "/app/containers?status=IN_TRANSIT",
    },
    {
      when: costDelta !== undefined && costDelta >= 10,
      id: "costs-up",
      tone: "warn",
      rank: 66,
      text: `${t(locale, "Costs are")} ${dir(costDelta ?? 0)} ${pct(costDelta ?? 0)} ${t(locale, "on last month")}`,
      href: "/app/finance/expenses",
    },
    {
      when: creditDelta !== undefined && Math.abs(creditDelta) >= 5,
      id: "credit",
      tone: (creditDelta ?? 0) >= 0 ? "warn" : "good",
      rank: 60,
      text: `${t(locale, "Cargo released on credit is")} ${dir(creditDelta ?? 0)} ${pct(creditDelta ?? 0)} ${t(locale, "on last month")}`,
      href: "/app/finance/credit",
    },
    {
      when: creditDelta === undefined && f.creditRevenue.tzs > 0,
      id: "credit-first",
      tone: "neutral",
      rank: 58,
      text: `${t(locale, "First month releasing cargo on credit —")} ${money(f.creditRevenue.tzs)}`,
      href: "/app/finance/credit",
    },
    {
      when: unpaidLanded.length > 0,
      id: "landed-unpaid",
      tone: "warn",
      rank: 56,
      text: `${unpaidLanded.length} ${t(locale, "landed container(s) still carry unpaid balances")} — ${money(unpaidLandedTzs)}`,
      href: "/app/finance/containers",
    },
    {
      when: sailingNoCosts.length > 0,
      id: "no-costs",
      tone: "warn",
      rank: 50,
      text: `${sailingNoCosts.length} ${t(locale, "sailing(s) with no costs recorded, so their margin reads higher than it is")}`,
      href: "/app/finance/containers",
    },
    {
      when: costDelta !== undefined && costDelta <= -10,
      id: "costs-down",
      tone: "good",
      rank: 28,
      text: `${t(locale, "Costs are")} ${dir(costDelta ?? 0)} ${pct(costDelta ?? 0)} ${t(locale, "on last month")}`,
      href: "/app/finance/expenses",
    },
  ];
  const insights: Insight[] = candidates
    .filter((row) => row.when)
    .sort((a, b) => b.rank - a.rank)
    .slice(0, 5)
    .map(({ when: _when, ...row }) => row);

  // ------------------------------------------------------------- the desks
  const desks: DeskPulse[] = [
    {
      key: "china",
      desk: t(locale, "Guangzhou"),
      href: "/app/inventory",
      headline: String(position.inChina),
      headlineLabel: t(locale, "standing"),
      detail: count(waitingForContainer, "waiting for a container"),
      problem:
        noPhoto > 0
          ? count(noPhoto, "with no photograph")
          : heldInChina > 0
            ? count(heldInChina, "on hold")
            : null,
      tone: "marine",
    },
    {
      key: "dar",
      desk: t(locale, "Dar floor"),
      href: "/app/inventory",
      headline: String(position.onFloor),
      headlineLabel: t(locale, "on the floor"),
      detail: count(position.ready, "cleared and waiting to be collected"),
      problem: pastStorage.length > 0 ? count(pastStorage.length, "past the free storage window") : null,
      tone: "brand",
    },
    {
      key: "finance",
      desk: t(locale, "Finance"),
      href: "/app/finance",
      headline: String(unpaidBills.length),
      headlineLabel: t(locale, unpaidBills.length === 1 ? "bill unpaid" : "bills unpaid"),
      detail: t(locale, "confirmed and still owed"),
      problem: owed.owes ? `${owed.primary} ${t(locale, "outstanding")}` : null,
      tone: "warning",
    },
    {
      key: "support",
      desk: t(locale, "Support"),
      href: "/app/support",
      headline: String(openTickets),
      headlineLabel: t(locale, openTickets === 1 ? "open ticket" : "open tickets"),
      detail: t(locale, "customers waiting on an answer"),
      problem: cases.length > 0 ? count(cases.length, cases.length === 1 ? "open case" : "open cases") : null,
      tone: "signal",
    },
  ];

  return {
    rate,
    attention,
    insights,
    desks,
    activity,
    money: {
      collectedTodayTzs: collectedTodayTzs.toNumber(),
      collectedTodayUsd: collectedTodayUsd.toNumber(),
      billedToday,
      spentToday,
      creditOwedTzs: credit.overview.owed.toNumber(),
      creditUnconvertedUsd: credit.overview.unconvertedUsd.toNumber(),
      owedTzs: owed.tzs.toNumber(),
      owedUsd: owed.usd.toNumber(),
      owedUnconvertedUsd: owed.unconverted.toNumber(),
      owedLabel: owed.primary,
      unpaidBills: unpaidBills.length,
    },
    month: {
      label: month.label,
      billedTzs: billedMonthTzs,
      costTzs: costMonthTzs,
      profitTzs: profitMonthTzs,
      marginPct,
      collectionRatePct,
    },
    flow,
    accounts,
    heldTzs: heldTzs.toNumber(),
    heldUnconvertedUsd,
    accountsToCheck,
    customersOnCredit: credit.overview.customersOwing,
    containerProfit,
    operations: {
      cbmOnFloor,
      heldNoNote,
      releasedThisMonth,
      registeredThisYear: registered.length,
      registeredByMonth,
      containersLoading: byContainer(LOADING_IN_GUANGZHOU),
      containersAtSea: byContainer(AT_SEA),
      containersArrived: arrivedBoxes.length,
    },
    position,
    mix: {
      slices: mixSlices,
      totalLines: mixRows.length,
      totalCbm: mixRows.reduce((s, r) => s + Number(r.cbm), 0),
      days: 30,
    },
    carried,
    company: {
      decisions: pending.length + drafts.length + cases.length + creditRequests.length,
      oldestDecisionDays: oldest ? daysSince(oldest, now) : null,
      toSignOff: arrivedBoxes.length,
      oldestSignOffDays: arrivedSince ? daysSince(arrivedSince, now) : null,
      payrollWaiting: payrollWaiting.length,
      /* The latest month's run and where it has got to, so the line under the
         count says something true even when nothing is waiting. */
      payroll: latestRuns[0]
        ? {
            label: monthLabel(latestRuns[0].year, latestRuns[0].month),
            code: latestRuns[0].code,
            status: latestRuns[0].status,
          }
        : null,
      customers: {
        total: customersTotal,
        newThisMonth: customersNew,
        awaitingReply,
        overdueOnCredit,
      },
      staff: {
        total: staff.length,
        seenToday,
        suspended,
        byDepartment: [...departments.entries()]
          .map(([department, n]) => ({ department, label: DEPARTMENT_LABELS[department], count: n }))
          .sort((a, b) => b.count - a.count),
      },
    },
  };
}

export type ManagerOverview = Awaited<ReturnType<typeof managerOverview>>;
