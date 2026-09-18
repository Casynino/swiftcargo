import "server-only";

import { Prisma } from "@prisma/client";

import { creditBook } from "@/lib/credit";
import { balanceOf } from "@/lib/invoice-balance";
import { companySettings } from "@/lib/pricing";
import { prisma } from "@/lib/prisma";
import { storagePosition } from "@/lib/storage-fee";
import { storageStart } from "@/lib/storage-clock";

/**
 * The manager's control room: every place the company is quietly going wrong,
 * in one list, worst first.
 *
 * READ-ONLY, AND IT DECIDES NOTHING. Every line opens the screen that owns the
 * fix, with its guard and its evidence attached. A second surface that also
 * acted would be a second code path to the same decision.
 *
 * Every line is always present. A line with nothing on it says so, in green:
 * a list that only shows problems cannot tell "nothing is wrong" apart from
 * "this check was never run", and the manager reading it needs to know which.
 *
 * The age is the finding. A queue of eleven that arrived this morning is a
 * normal Tuesday; one item nobody has touched in nine days is the thing a
 * manager is for, and only the age tells them apart.
 */

const DAY = 86_400_000;

/** How long a tin may go uncounted before it is a line here. */
export const COUNT_EVERY_DAYS = 7;

export type ControlTone = "bad" | "warn" | "good";

export type ControlLine = {
  key: string;
  label: string;
  detail: string;
  count: number;
  /** Days the oldest item has waited. Null where the line is a state, not a queue. */
  oldestDays: number | null;
  href: string;
  tone: ControlTone;
};

const ago = (days: number, now: Date) => new Date(now.getTime() - days * DAY);
const daysSince = (d: Date, now: Date) =>
  Math.max(0, Math.floor((now.getTime() - d.getTime()) / DAY));
const oldest = (dates: Date[], now: Date) =>
  dates.length > 0 ? Math.max(...dates.map((d) => daysSince(d, now))) : null;

/* ------------------------------------------------------------------- checks */

/**
 * The cash tins and what their newest count found.
 *
 * Only CASH: a tin can be counted against the ledger, a bank cannot, and the
 * count form offers nothing else. The difference is the one pinned on the
 * count when it was taken — a later correction to the history must not quietly
 * rewrite what the count found.
 */
async function tins(now: Date) {
  const [accounts, counts] = await Promise.all([
    prisma.bankAccount.findMany({
      where: { active: true, kind: "CASH" },
      select: { id: true, createdAt: true },
    }),
    prisma.cashCount.findMany({
      orderBy: [{ accountId: "asc" }, { countedAt: "desc" }],
      distinct: ["accountId"],
      select: { accountId: true, counted: true, expected: true, countedAt: true },
    }),
  ]);
  const newest = new Map(counts.map((c) => [c.accountId, c]));

  const never = accounts.filter((a) => !newest.has(a.id));
  const lapsed = accounts
    .map((a) => newest.get(a.id))
    .filter((c): c is NonNullable<typeof c> => Boolean(c))
    .filter((c) => c.countedAt < ago(COUNT_EVERY_DAYS, now));
  const disagreed = accounts
    .map((a) => newest.get(a.id))
    .filter((c): c is NonNullable<typeof c> => Boolean(c))
    .filter((c) => !new Prisma.Decimal(c.counted).equals(c.expected));

  return {
    never: { count: never.length, oldestDays: oldest(never.map((a) => a.createdAt), now) },
    lapsed: { count: lapsed.length, oldestDays: oldest(lapsed.map((c) => c.countedAt), now) },
    disagreed: {
      count: disagreed.length,
      oldestDays: oldest(disagreed.map((c) => c.countedAt), now),
    },
  };
}

/**
 * Sent back by Finance, on a bill that is still not paid.
 *
 * A rejection by itself is finished business; one on a bill that still owes is
 * a customer who believes they paid and a desk that has not told them
 * otherwise. Owed is balanceOf's answer, so this cannot disagree with the bill.
 */
async function rejectedOnOwedBills(now: Date) {
  const rejected = await prisma.payment.findMany({
    where: {
      status: "REJECTED",
      writtenOff: false,
      invoice: { status: { notIn: ["DRAFT", "CANCELLED", "PAID"] } },
    },
    select: { updatedAt: true, invoice: { include: { payments: true } } },
  });
  const open = rejected.filter((p) => !balanceOf(p.invoice).settled);
  return { count: open.length, oldestDays: oldest(open.map((p) => p.updatedAt), now) };
}

/**
 * Consignments still on the Dar floor past their free days, with no storage on
 * any bill.
 *
 * Reported, never charged. Whether to bill rent is a person's decision, which
 * is why chargeStorage asks for one. When no storage rate is set the business
 * does not charge storage, and nothing is missing from any bill.
 */
async function storageNotBilled(now: Date) {
  const settings = await companySettings();
  const perDay = settings?.storagePerDay ?? new Prisma.Decimal(0);
  if (!new Prisma.Decimal(perDay).greaterThan(0)) return { count: 0, oldestDays: null, configured: false };

  const freeDays = settings?.freeStorageDays ?? 7;
  const cargo = await prisma.cargo.findMany({
    where: {
      deletedAt: null,
      status: { in: ["RECEIVED_DAR", "READY_FOR_RELEASE"] },
      darReceiving: { receivedAt: { lt: ago(freeDays, now) } },
      invoices: {
        none: { status: { not: "CANCELLED" }, items: { some: { category: "Storage" } } },
      },
    },
    select: { clearedAt: true, darReceiving: { select: { receivedAt: true } } },
  });

  const late = cargo
    .map((c) =>
      storagePosition({
        receivedAt: storageStart(c.darReceiving?.receivedAt, c.clearedAt),
        collectedAt: null,
        freeDays,
        perDay,
        currency: settings?.storageCurrency ?? "USD",
      })
    )
    .filter((p) => p.chargeableDays > 0);

  return {
    count: late.length,
    /* Aged from the day the free allowance ran out, not from arrival: the
       free week was never owed. */
    oldestDays: late.length > 0 ? Math.max(...late.map((p) => p.chargeableDays)) : null,
    configured: true,
  };
}

/** Dar's count disagreeing with the packing list, and boxes that never came off. */
async function darDiscrepancies(now: Date) {
  const [short, missing] = await Promise.all([
    prisma.darReceiving.findMany({
      where: { discrepancy: true, cargo: { deletedAt: null } },
      select: { receivedAt: true },
    }),
    prisma.cargo.findMany({
      where: { deletedAt: null, status: "MISSING_AT_DAR" },
      select: {
        updatedAt: true,
        history: {
          where: { to: "MISSING_AT_DAR" },
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { createdAt: true },
        },
      },
    }),
  ]);
  const dates = [
    ...short.map((r) => r.receivedAt),
    ...missing.map((c) => c.history[0]?.createdAt ?? c.updatedAt),
  ];
  return { count: dates.length, oldestDays: oldest(dates, now) };
}

/* ------------------------------------------------------------------ the room */

export async function controlRoom(now = new Date()): Promise<ControlLine[]> {
  const [
    cash,
    pendingPayments,
    rejected,
    storage,
    openContainers,
    dar,
    oldCases,
    oldDrafts,
    credit,
    tickets,
  ] = await Promise.all([
    tins(now),
    prisma.payment.findMany({
      where: { status: "PENDING", writtenOff: false, createdAt: { lt: ago(3, now) } },
      select: { createdAt: true },
    }),
    rejectedOnOwedBills(now),
    storageNotBilled(now),
    /* Open means still taking cargo: not yet sealed. */
    prisma.container.findMany({
      where: {
        deletedAt: null,
        status: { in: ["OPEN", "LOADING", "LOADED"] },
        createdAt: { lt: ago(3, now) },
      },
      select: { createdAt: true },
    }),
    darDiscrepancies(now),
    prisma.exceptionCase.findMany({
      where: { status: { notIn: ["RESOLVED", "CLOSED"] }, createdAt: { lt: ago(7, now) } },
      select: { createdAt: true },
    }),
    prisma.invoice.findMany({
      where: {
        status: "DRAFT",
        cargo: { deletedAt: null },
        createdAt: { lt: ago(2, now) },
      },
      select: { createdAt: true },
    }),
    creditBook(),
    /* Unread by staff and not finished, with the customer's last word more than
       a day old. A ticket the desk has read and left is WAITING_STAFF's job to
       show on the desk; one nobody has even opened is this room's. */
    prisma.conversation.findMany({
      where: {
        staffUnread: true,
        status: { notIn: ["RESOLVED", "CLOSED"] },
        lastMessageAt: { lt: ago(1, now) },
      },
      select: { lastMessageAt: true },
    }),
  ]);

  const overdue = credit.rows.filter((r) => r.state === "OVERDUE");

  const lines: (Omit<ControlLine, "tone"> & { severity: "bad" | "warn" })[] = [
    {
      key: "cash:never",
      label: "Cash tins never counted",
      detail: "Nobody has ever put what is in the tin beside what the ledger says.",
      count: cash.never.count,
      oldestDays: cash.never.oldestDays,
      href: "/app/finance/accounts",
      severity: "warn",
    },
    {
      key: "cash:lapsed",
      label: `Cash tins not counted in ${COUNT_EVERY_DAYS} days`,
      detail: "Counted once, and money has had time to move since.",
      count: cash.lapsed.count,
      oldestDays: cash.lapsed.oldestDays,
      href: "/app/finance/accounts",
      severity: "warn",
    },
    {
      key: "cash:disagreed",
      label: "Counts that disagreed with the book",
      detail: "The newest count came up over or short. Somewhere a movement was never recorded.",
      count: cash.disagreed.count,
      oldestDays: cash.disagreed.oldestDays,
      href: "/app/finance/accounts",
      severity: "bad",
    },
    {
      key: "payments:pending",
      label: "Payments waiting over 3 days",
      detail: "A customer believes they have paid, and Finance has not said whether they have.",
      count: pendingPayments.length,
      oldestDays: oldest(pendingPayments.map((p) => p.createdAt), now),
      href: "/app/finance/collections/verify",
      severity: "bad",
    },
    {
      key: "payments:rejected",
      label: "Rejected payments on bills still owed",
      detail: "Sent back, and the bill is still open. Somebody has to tell the customer.",
      count: rejected.count,
      oldestDays: rejected.oldestDays,
      href: "/app/finance/collections/sent-back",
      severity: "warn",
    },
    {
      key: "storage:unbilled",
      label: "Cargo past free storage, not on the bill",
      detail: storage.configured
        ? "Still on the Dar floor past the free days, and no bill carries storage."
        : "No storage rate is set, so storage is not charged.",
      count: storage.count,
      oldestDays: storage.oldestDays,
      href: "/app/finance/collections?view=storage",
      severity: "warn",
    },
    {
      key: "containers:open",
      label: "Containers open more than 3 days",
      detail: "Still taking cargo. A box that never closes is a sailing nobody is on.",
      count: openContainers.length,
      oldestDays: oldest(openContainers.map((c) => c.createdAt), now),
      href: "/app/containers/loading",
      severity: "warn",
    },
    {
      key: "dar:discrepancy",
      label: "Dar discrepancies",
      detail: "Booked in short of the packing list, or not found on the container at all.",
      count: dar.count,
      oldestDays: dar.oldestDays,
      href: "/app/receive/dar",
      severity: "bad",
    },
    {
      key: "cases:old",
      label: "Cases open over 7 days",
      detail: "Cargo lost, short or damaged, and a week later nobody has finished with it.",
      count: oldCases.length,
      oldestDays: oldest(oldCases.map((c) => c.createdAt), now),
      href: "/app/exceptions",
      severity: "bad",
    },
    {
      key: "invoices:drafts",
      label: "Draft invoices older than 2 days",
      detail: "Priced and never issued. Nobody can be asked for the money until they are.",
      count: oldDrafts.length,
      oldestDays: oldest(oldDrafts.map((d) => d.createdAt), now),
      href: "/app/containers/arrived?view=pricing",
      severity: "warn",
    },
    {
      key: "credit:overdue",
      label: "Credit overdue",
      detail: "Released on credit, past the date the customer agreed, and still owing.",
      count: overdue.length,
      oldestDays: overdue.length > 0 ? Math.max(...overdue.map((r) => r.daysLate)) : null,
      href: "/app/finance/credit",
      severity: "bad",
    },
    {
      key: "tickets:unanswered",
      label: "Unanswered tickets",
      detail: "A customer wrote more than a day ago and nobody on staff has read it.",
      count: tickets.length,
      oldestDays: oldest(tickets.map((c) => c.lastMessageAt), now),
      href: "/app/support/tickets",
      severity: "warn",
    },
  ];

  /* Worst first: a thing failing outranks a thing merely waiting, and within
     each, the one that has waited longest. Clear lines sink to the bottom. */
  const rank = { bad: 0, warn: 1, good: 2 } as const;
  return lines
    .map(({ severity, ...line }) => ({
      ...line,
      tone: (line.count > 0 ? severity : "good") as ControlTone,
    }))
    .sort(
      (a, b) =>
        rank[a.tone] - rank[b.tone] ||
        (b.oldestDays ?? 0) - (a.oldestDays ?? 0) ||
        b.count - a.count
    );
}
