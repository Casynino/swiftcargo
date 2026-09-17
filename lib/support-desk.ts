import "server-only";

import { Prisma } from "@prisma/client";

import { fromBase } from "@/lib/currency";
import { BUSINESS_TZ } from "@/lib/format";
import { balanceOf } from "@/lib/invoice-balance";
import { prisma } from "@/lib/prisma";

/**
 * THE SUPPORT DESK'S HOME, AS DATA.
 *
 * Everything here is counted from the rows at read time. Nothing is a stored
 * balance: what a customer owes is `balanceOf` over the bill's verified
 * payments, the same function the release check and the receipt call, so the
 * call list cannot tell a customer a different figure from the counter.
 */

const DAY = 86_400_000;

/** Bills that are out with a customer and may still owe. */
const OPEN_BILL = ["ISSUED", "PARTIALLY_PAID", "OVERDUE"] as const;

/** Tickets the desk has not finished with. */
const CLOSED_TICKET = ["RESOLVED", "CLOSED"] as const;

/** Sourcing that somebody is still working. */
export const OPEN_SOURCING = ["NEW", "IN_PROGRESS", "WAITING_CUSTOMER"] as const;

/**
 * Midnight in Dar es Salaam, as an instant.
 *
 * The server's own clock is not the business's: a container host in UTC would
 * start "today" at three in the morning Dar time, and every call logged before
 * then would count against yesterday. East Africa Time has no daylight saving,
 * so the offset is fixed.
 */
export function startOfDarDay(now = new Date()) {
  const ymd = new Intl.DateTimeFormat("en-CA", {
    timeZone: BUSINESS_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  return new Date(`${ymd}T00:00:00+03:00`);
}

/** Whole days between two instants, never negative. */
const daysBetween = (from: Date, to: Date) =>
  Math.max(0, Math.floor((to.getTime() - from.getTime()) / DAY));

type BillWithPayments = Prisma.InvoiceGetPayload<{ include: { payments: true } }>;

/**
 * What a bill still owes, in shillings first and dollars beside it.
 *
 * The dollar figure is the bill's own dollars, or its shillings at the bill's
 * pinned rate — never today's board. A shilling bill with no rate has no
 * dollar figure at all rather than a made-up one.
 */
function owing(invoice: BillWithPayments) {
  const b = balanceOf(invoice);
  const tzs = b.outstandingTzs;
  let usd: Prisma.Decimal | null = null;
  if (invoice.currency === "USD") usd = b.outstanding;
  else if (tzs && b.rate) usd = fromBase(tzs, "USD", b.rate);
  return { settled: b.settled, tzs, usd };
}

export async function supportOverview() {
  const today = startOfDarDay();

  const [
    urgentTickets,
    openSourcing,
    callBacks,
    websiteRequests,
    withFinance,
    rejected,
    customers,
    activeCargo,
    readyForPickup,
    contactedToday,
  ] = await Promise.all([
    prisma.conversation.count({
      where: {
        priority: { in: ["URGENT", "HIGH"] },
        status: { notIn: [...CLOSED_TICKET] },
      },
    }),
    prisma.sourcingRequest.count({ where: { status: { in: [...OPEN_SOURCING] } } }),
    prisma.exceptionCase.count({ where: { status: "WAITING_CUSTOMER" } }),
    prisma.pickupRequest.count({ where: { status: "SUBMITTED" } }),
    prisma.payment.count({ where: { status: "PENDING", writtenOff: false } }),
    /* Loaded rather than counted: "sent back" only needs a call while the bill
       still owes. A claim rejected on a bill the customer has since settled
       another way is history, and ringing them about it is a wrong call. */
    prisma.payment.findMany({
      where: {
        status: "REJECTED",
        writtenOff: false,
        invoice: { status: { notIn: ["CANCELLED", "DRAFT"] } },
      },
      select: { invoice: { include: { payments: true } } },
    }),
    prisma.customer.count({ where: { deletedAt: null } }),
    prisma.cargo.count({
      where: {
        deletedAt: null,
        status: { notIn: ["COLLECTED", "DELIVERED", "CANCELLED"] },
      },
    }),
    prisma.pickupNote.count({ where: { status: "ACTIVE" } }),
    prisma.customerContact.count({ where: { createdAt: { gte: today } } }),
  ]);

  const sentBack = rejected.filter((p) => !balanceOf(p.invoice).settled).length;

  return {
    urgentTickets,
    openSourcing,
    callBacks,
    websiteRequests,
    withFinance,
    sentBack,
    customers,
    activeCargo,
    readyForPickup,
    contactedToday,
  };
}

export type CallRow = {
  invoiceId: string;
  cargoId: string;
  customerId: string;
  customerName: string;
  reference: string;
  description: string;
  owedTzs: Prisma.Decimal | null;
  owedUsd: Prisma.Decimal | null;
  /** Days on the Dar floor past the free allowance. */
  storageDays: number;
  /** Days past the bill's due date. */
  overdueDays: number;
  billedDaysAgo: number;
  /** A claim is sitting with Finance: the customer says they have paid. */
  paymentPending: boolean;
};

/**
 * EVERY OPEN BILL FOR CARGO THAT HAS REACHED DAR, WORST FIRST.
 *
 * Ranked by whichever is longer, the days past due or the days past free
 * storage, then by what is owed. Both cost somebody money by the day, and a
 * clerk with a phone in hand wants the most expensive silence first.
 *
 * Storage stops counting when the boxes are released: a consignment let go on
 * credit still owes, but it is no longer standing on the floor.
 */
export async function followUpQueue() {
  const [bills, settings] = await Promise.all([
    prisma.invoice.findMany({
      where: {
        status: { in: [...OPEN_BILL] },
        cargo: { deletedAt: null, darReceiving: { isNot: null } },
      },
      include: {
        payments: true,
        customer: { select: { fullName: true } },
        cargo: {
          select: {
            reference: true,
            description: true,
            darReceiving: { select: { receivedAt: true } },
            release: { select: { releasedAt: true } },
          },
        },
      },
    }),
    prisma.companySetting.findUnique({
      where: { id: "singleton" },
      select: { freeStorageDays: true },
    }),
  ]);

  const freeDays = settings?.freeStorageDays ?? 7;
  const now = new Date();

  const rows: CallRow[] = [];
  for (const bill of bills) {
    const owed = owing(bill);
    if (owed.settled) continue;

    const landed = bill.cargo.darReceiving?.receivedAt ?? null;
    const until = bill.cargo.release?.releasedAt ?? now;
    const held = landed ? daysBetween(landed, until) : 0;

    rows.push({
      invoiceId: bill.id,
      cargoId: bill.cargoId,
      customerId: bill.customerId,
      customerName: bill.customer.fullName,
      reference: bill.cargo.reference,
      description: bill.cargo.description,
      owedTzs: owed.tzs,
      owedUsd: owed.usd,
      storageDays: Math.max(0, held - freeDays),
      overdueDays: bill.dueAt && bill.dueAt < now ? daysBetween(bill.dueAt, now) : 0,
      billedDaysAgo: daysBetween(bill.issuedAt ?? bill.createdAt, now),
      paymentPending: bill.payments.some((p) => p.status === "PENDING" && !p.writtenOff),
    });
  }

  const weight = (row: CallRow) => Math.max(row.storageDays, row.overdueDays);
  const amount = (row: CallRow) =>
    row.owedTzs?.toNumber() ?? row.owedUsd?.toNumber() ?? 0;

  rows.sort((a, b) => weight(b) - weight(a) || amount(b) - amount(a));
  return rows;
}

/** Shillings and dollars across rows, each kept in its own column. */
export function sumOwed(rows: Pick<CallRow, "owedTzs" | "owedUsd">[]) {
  let tzs = new Prisma.Decimal(0);
  let usd = new Prisma.Decimal(0);
  /* A dollar bill with no pinned rate has no shilling figure. It is counted in
     the dollar column only, never guessed into shillings. */
  let unconvertedUsd = new Prisma.Decimal(0);
  for (const row of rows) {
    if (row.owedTzs) {
      tzs = tzs.add(row.owedTzs);
      if (row.owedUsd) usd = usd.add(row.owedUsd);
    } else if (row.owedUsd) {
      unconvertedUsd = unconvertedUsd.add(row.owedUsd);
    }
  }
  return { tzs, usd, unconvertedUsd };
}

export type WarehouseRow = {
  cargoId: string;
  daysInWarehouse: number;
  /** Has at least one live bill. */
  billed: boolean;
  owes: boolean;
  owedTzs: Prisma.Decimal | null;
  owedUsd: Prisma.Decimal | null;
};

/**
 * WHAT IS PHYSICALLY ON THE DAR FLOOR, AND WHETHER ITS MONEY HAS ARRIVED.
 *
 * Received in Dar and not yet released. A consignment with no live bill is
 * kept apart from one that is paid: calling unbilled cargo "paid, not
 * collected" would tell the desk to ring a customer to come and collect boxes
 * the release check will refuse.
 */
export async function darWarehouse() {
  const cargo = await prisma.cargo.findMany({
    where: {
      deletedAt: null,
      status: { in: ["RECEIVED_DAR", "READY_FOR_RELEASE"] },
      release: { is: null },
    },
    select: {
      id: true,
      darReceiving: { select: { receivedAt: true } },
      invoices: {
        where: { status: { notIn: ["DRAFT", "CANCELLED"] } },
        include: { payments: true },
      },
    },
  });

  const now = new Date();
  return cargo.map((c): WarehouseRow => {
    let owes = false;
    let tzs: Prisma.Decimal | null = null;
    let usd: Prisma.Decimal | null = null;
    for (const bill of c.invoices) {
      const owed = owing(bill);
      if (owed.settled) continue;
      owes = true;
      if (owed.tzs) tzs = (tzs ?? new Prisma.Decimal(0)).add(owed.tzs);
      if (owed.usd) usd = (usd ?? new Prisma.Decimal(0)).add(owed.usd);
    }
    return {
      cargoId: c.id,
      daysInWarehouse: c.darReceiving ? daysBetween(c.darReceiving.receivedAt, now) : 0,
      billed: c.invoices.length > 0,
      owes,
      owedTzs: tzs,
      owedUsd: usd,
    };
  });
}

/**
 * Tickets opened against tickets finished, one column per Dar calendar day.
 *
 * A conversation has no closed-at column, so "closed" is its last update while
 * it is resolved or closed. A ticket reopened and closed again moves to the day
 * it was last closed, which is the day the work actually finished.
 */
export async function ticketFlowByDay(days = 14, now = new Date()) {
  const start = new Date(startOfDarDay(now).getTime() - (days - 1) * DAY);

  const [opened, closed] = await Promise.all([
    prisma.conversation.findMany({
      where: { createdAt: { gte: start } },
      select: { createdAt: true },
    }),
    prisma.conversation.findMany({
      where: { status: { in: [...CLOSED_TICKET] }, updatedAt: { gte: start } },
      select: { updatedAt: true },
    }),
  ]);

  const dayLabel = new Intl.DateTimeFormat("en-GB", { timeZone: BUSINESS_TZ, day: "numeric" });
  const data = Array.from({ length: days }, (_, i) => ({
    label: dayLabel.format(new Date(start.getTime() + i * DAY)),
    in: 0,
    out: 0,
  }));

  const indexOf = (date: Date) => Math.floor((date.getTime() - start.getTime()) / DAY);

  for (const row of opened) {
    const i = indexOf(row.createdAt);
    if (i >= 0 && i < days) data[i].in += 1;
  }
  for (const row of closed) {
    const i = indexOf(row.updatedAt);
    if (i >= 0 && i < days) data[i].out += 1;
  }

  return data;
}
