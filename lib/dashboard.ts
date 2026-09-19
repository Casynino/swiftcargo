import "server-only";

import { Prisma, type Role } from "@prisma/client";

import { balanceOf, outstandingOf, paymentTzs } from "@/lib/invoice-balance";
import { owedAcross } from "@/lib/invoice-balance";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";

/**
 * WHAT DO I NEED TO DO TODAY?
 *
 * Every desk gets a different answer, and every answer is a queue with a way
 * into it — not a statistic. A dashboard that says "142 consignments" tells a
 * clerk nothing they can act on; "9 waiting to be loaded →" tells them where to
 * start.
 *
 * The counts are cheap on purpose: indexed `count` calls run in parallel. These
 * screens open on a phone at a warehouse door.
 */

export type ActionCard = {
  label: string;
  count: number;
  href: string;
  icon: string;
  urgent?: boolean;
  hint?: string;
};

const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

const daysAgo = (n: number) => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - n);
  return d;
};

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

// ---------------------------------------------------------------------------
// Per-desk queues
// ---------------------------------------------------------------------------

async function chinaWarehouse(): Promise<ActionCard[]> {
  /*
    THE FOUR QUESTIONS A GUANGZHOU CLERK ASKS AT EIGHT IN THE MORNING.

    What did we take in today, what is still sitting on the shelf, which boxes
    are open, and is anything stuck. Deliberately NOT "expected but not
    arrived": a supplier delivers when a supplier delivers, and a queue nobody
    can act on is a queue that trains people to ignore the dashboard.
  */
  const [receivedToday, awaitingContainer, loading, held, readyToSeal] =
    await Promise.all([
      prisma.cargo.count({
        where: {
          deletedAt: null,
          chinaReceiving: { receivedAt: { gte: startOfToday() } },
        },
      }),
      prisma.cargo.count({ where: { status: "RECEIVED_CHINA", deletedAt: null } }),
      prisma.container.count({
        where: { status: { in: ["OPEN", "LOADING"] }, deletedAt: null },
      }),
      prisma.cargo.count({
        where: {
          deletedAt: null,
          operationalHold: true,
          status: {
            in: ["RECEIVED_CHINA", "ASSIGNED_TO_CONTAINER", "CONTAINER_LOADED"],
          },
        },
      }),
      prisma.container.count({ where: { status: "LOADED", deletedAt: null } }),
    ]);

  return [
    {
      label: "Received today",
      count: receivedToday,
      href: "/app/inventory",
      icon: "PackagePlus",
      hint: "Consignments taken in since midnight",
    },
    {
      label: "Waiting for a container",
      count: awaitingContainer,
      href: "/app/inventory?state=waiting",
      icon: "Boxes",
      urgent: awaitingContainer > 0,
      hint: "On the shelf, not yet loaded",
    },
    {
      label: "Containers loading",
      count: loading,
      href: "/app/containers?status=LOADING",
      icon: "Container",
      hint: "Still accepting cargo",
    },
    readyToSeal > 0
      ? {
          label: "Ready to seal",
          count: readyToSeal,
          href: "/app/containers?status=LOADED",
          icon: "Lock",
          urgent: true,
          hint: "Loading finished, waiting on a seal number",
        }
      : {
          label: "Cargo on hold",
          count: held,
          href: "/app/inventory?state=hold",
          icon: "TriangleAlert",
          urgent: held > 0,
          hint: "Cannot be loaded until cleared",
        },
  ];
}

async function darWarehouse(): Promise<ActionCard[]> {
  const [arriving, awaitingVerification, discrepancies, readyForRelease] =
    await Promise.all([
      prisma.container.count({
        where: { status: { in: ["DEPARTED", "IN_TRANSIT"] }, deletedAt: null },
      }),
      prisma.darReceiving.count({ where: { verified: false } }),
      prisma.darReceiving.count({ where: { discrepancy: true, verified: false } }),
      prisma.cargo.count({ where: { status: "READY_FOR_RELEASE", deletedAt: null } }),
    ]);

  return [
    {
      label: "Containers on the water",
      count: arriving,
      href: "/app/containers?status=IN_TRANSIT",
      icon: "Ship",
    },
    {
      label: "Waiting to be verified",
      count: awaitingVerification,
      href: "/app/receive/dar",
      icon: "ClipboardCheck",
      urgent: awaitingVerification > 0,
    },
    {
      label: "Discrepancies to resolve",
      count: discrepancies,
      href: "/app/exceptions",
      icon: "TriangleAlert",
      urgent: discrepancies > 0,
      hint: "Short, damaged or not as listed",
    },
    {
      label: "Ready to hand over",
      count: readyForRelease,
      href: "/app/release",
      icon: "DoorOpen",
      hint: "Paid, verified, no hold",
    },
  ];
}

async function finance(): Promise<ActionCard[]> {
  const [toVerify, drafts, overdue, unbilled] = await Promise.all([
    prisma.payment.count({ where: { status: "PENDING" } }),
    prisma.invoice.count({ where: { status: "DRAFT" } }),
    prisma.invoice.count({
      where: {
        status: { in: ["ISSUED", "PARTIALLY_PAID", "OVERDUE"] },
        dueAt: { lt: new Date() },
      },
    }),
    prisma.cargo.count({
      where: {
        status: { in: ["RECEIVED_DAR", "READY_FOR_RELEASE"] },
        deletedAt: null,
        invoices: { none: { status: { not: "CANCELLED" } } },
      },
    }),
  ]);

  return [
    {
      label: "Payments to verify",
      count: toVerify,
      href: "/app/finance/collections/verify",
      icon: "ShieldCheck",
      urgent: toVerify > 0,
      hint: "Nothing is released on an unverified claim",
    },
    {
      label: "Landed, not yet invoiced",
      count: unbilled,
      href: "/app/containers/arrived?view=pricing",
      icon: "FilePlus",
      urgent: unbilled > 0,
    },
    {
      label: "Draft invoices",
      count: drafts,
      href: "/app/finance/collections?view=outstanding",
      icon: "FileText",
      hint: "Raised but not sent",
    },
    {
      label: "Overdue",
      count: overdue,
      href: "/app/finance/collections?view=overdue",
      icon: "AlarmClock",
      urgent: overdue > 0,
    },
  ];
}

async function customerSupport(): Promise<ActionCard[]> {
  const [unread, waiting, requests, unpaid] = await Promise.all([
    prisma.conversation.count({
      where: { staffUnread: true, status: { notIn: ["RESOLVED", "CLOSED"] } },
    }),
    prisma.conversation.count({ where: { status: "WAITING_STAFF" } }),
    prisma.pickupRequest.count({ where: { status: "SUBMITTED" } }),
    prisma.invoice.count({
      where: { status: { in: ["ISSUED", "PARTIALLY_PAID", "OVERDUE"] } },
    }),
  ]);

  return [
    {
      label: "Unread messages",
      count: unread,
      href: "/app/support/tickets",
      icon: "MessagesSquare",
      urgent: unread > 0,
    },
    {
      label: "Waiting on us",
      count: waiting,
      href: "/app/support/tickets",
      icon: "Hourglass",
      urgent: waiting > 0,
    },
    {
      label: "New website requests",
      count: requests,
      href: "/app/support/requests",
      icon: "Inbox",
    },
    {
      label: "Customers to chase",
      count: unpaid,
      href: "/app/finance/collections?view=overdue",
      icon: "PhoneCall",
      hint: "Unpaid bills, oldest first",
    },
  ];
}

async function management(): Promise<ActionCard[]> {
  const [openCases, inTransit, readyForRelease, toVerify] = await Promise.all([
    prisma.exceptionCase.count({
      where: { status: { notIn: ["RESOLVED", "CLOSED"] } },
    }),
    prisma.container.count({
      where: { status: { in: ["DEPARTED", "IN_TRANSIT"] }, deletedAt: null },
    }),
    prisma.cargo.count({ where: { status: "READY_FOR_RELEASE", deletedAt: null } }),
    prisma.payment.count({ where: { status: "PENDING" } }),
  ]);

  return [
    {
      label: "Open issues",
      count: openCases,
      href: "/app/exceptions",
      icon: "TriangleAlert",
      urgent: openCases > 0,
    },
    {
      label: "Containers in transit",
      count: inTransit,
      href: "/app/containers?status=IN_TRANSIT",
      icon: "Ship",
    },
    {
      label: "Ready for release",
      count: readyForRelease,
      href: "/app/release",
      icon: "DoorOpen",
    },
    {
      label: "Payments awaiting Finance",
      count: toVerify,
      href: "/app/finance/collections/verify",
      icon: "ShieldCheck",
      urgent: toVerify > 0,
    },
  ];
}

export async function dashboardFor(role: Role): Promise<ActionCard[]> {
  switch (role) {
    case "CHINA_WAREHOUSE":
      return chinaWarehouse();
    case "DAR_WAREHOUSE":
      return darWarehouse();
    case "FINANCE":
      return finance();
    case "CUSTOMER_SUPPORT":
      return customerSupport();
    case "MANAGER":
    case "ADMIN":
      return management();
    default:
      return [];
  }
}

// ---------------------------------------------------------------------------
// Charts
// ---------------------------------------------------------------------------

/** Where every live consignment is, as a whole split into its parts. */
export async function cargoPosition() {
  const rows = await prisma.cargo.groupBy({
    by: ["status"],
    where: { deletedAt: null, status: { notIn: ["CANCELLED"] } },
    _count: { _all: true },
  });

  const at = (statuses: string[]) =>
    rows
      .filter((r) => statuses.includes(r.status))
      .reduce((sum, r) => sum + r._count._all, 0);

  return {
    booked: at(["REGISTERED"]),
    inChina: at(["RECEIVED_CHINA", "ASSIGNED_TO_CONTAINER", "CONTAINER_LOADED"]),
    atSea: at(["DEPARTED_CHINA", "IN_TRANSIT"]),
    inDar: at(["ARRIVED_TANZANIA", "RECEIVED_DAR"]),
    ready: at(["READY_FOR_RELEASE"]),
    done: at(["COLLECTED", "DELIVERED"]),
  };
}

/** Volume received and volume released, per day, for the last fortnight. */
export async function warehouseFlow(days = 14) {
  const since = daysAgo(days - 1);

  const [received, released] = await Promise.all([
    prisma.darReceiving.findMany({
      where: { receivedAt: { gte: since } },
      select: { receivedAt: true },
    }),
    prisma.release.findMany({
      where: { releasedAt: { gte: since } },
      select: { releasedAt: true },
    }),
  ]);

  const buckets = new Map<string, { label: string; in: number; out: number }>();
  for (let i = 0; i < days; i++) {
    const day = daysAgo(days - 1 - i);
    buckets.set(day.toDateString(), {
      label: DAY_LABELS[day.getDay()],
      in: 0,
      out: 0,
    });
  }

  for (const row of received) {
    const key = new Date(row.receivedAt).toDateString();
    const bucket = buckets.get(key);
    if (bucket) bucket.in += 1;
  }
  for (const row of released) {
    const key = new Date(row.releasedAt).toDateString();
    const bucket = buckets.get(key);
    if (bucket) bucket.out += 1;
  }

  return [...buckets.values()];
}

/** Volume shipped, by month, for the last six. */
export async function monthlyVolume(months = 6) {
  const since = new Date();
  since.setMonth(since.getMonth() - (months - 1), 1);
  since.setHours(0, 0, 0, 0);

  const lines = await prisma.containerCargo.findMany({
    where: { createdAt: { gte: since } },
    select: { createdAt: true, cbm: true },
  });

  const out: { label: string; value: number }[] = [];
  for (let i = 0; i < months; i++) {
    const d = new Date(since);
    d.setMonth(since.getMonth() + i);
    const total = lines
      .filter(
        (l) =>
          l.createdAt.getMonth() === d.getMonth() &&
          l.createdAt.getFullYear() === d.getFullYear()
      )
      .reduce((sum, l) => sum + Number(l.cbm), 0);
    out.push({ label: MONTH_LABELS[d.getMonth()], value: Number(total.toFixed(2)) });
  }
  return out;
}

/** Billed against collected, by month — the shape of the cash position. */
export async function revenueTrend(months = 6) {
  const since = new Date();
  since.setMonth(since.getMonth() - (months - 1), 1);
  since.setHours(0, 0, 0, 0);

  const [invoices, receipts] = await Promise.all([
    prisma.invoice.findMany({
      where: { issuedAt: { gte: since }, status: { not: "CANCELLED" } },
      select: { issuedAt: true, total: true },
    }),
    prisma.receipt.findMany({
      where: { issuedAt: { gte: since } },
      select: { issuedAt: true, amount: true },
    }),
  ]);

  const labels: string[] = [];
  const billed: number[] = [];
  const collected: number[] = [];

  for (let i = 0; i < months; i++) {
    const d = new Date(since);
    d.setMonth(since.getMonth() + i);
    labels.push(MONTH_LABELS[d.getMonth()]);

    const sameMonth = (when: Date | null) =>
      !!when &&
      when.getMonth() === d.getMonth() &&
      when.getFullYear() === d.getFullYear();

    billed.push(
      invoices
        .filter((i) => sameMonth(i.issuedAt))
        .reduce((sum, i) => sum + Number(i.total), 0)
    );
    collected.push(
      receipts
        .filter((r) => sameMonth(r.issuedAt))
        .reduce((sum, r) => sum + Number(r.amount), 0)
    );
  }

  return { labels, billed, collected };
}

/**
 * How old the money owed is.
 *
 * Bands rather than an average, because an average of thirty days hides one
 * invoice at a hundred and twenty, and that one is the whole problem.
 */
export async function receivablesAgeing() {
  const invoices = await prisma.invoice.findMany({
    where: { status: { in: ["ISSUED", "PARTIALLY_PAID", "OVERDUE"] } },
    include: { payments: true },
  });

  const bands = { current: 0, d30: 0, d60: 0, d90: 0 };
  const now = Date.now();

  for (const invoice of invoices) {
    const owing = Number(outstandingOf(invoice));
    if (owing <= 0) continue;
    const age = invoice.issuedAt
      ? Math.floor((now - invoice.issuedAt.getTime()) / 86_400_000)
      : 0;
    if (age <= 30) bands.current += owing;
    else if (age <= 60) bands.d30 += owing;
    else if (age <= 90) bands.d60 += owing;
    else bands.d90 += owing;
  }

  return bands;
}

/** The company at a glance, for the desks that hold oversight. */
export async function companyOverview() {
  const [customers, containers, outstandingRows, capacity] = await Promise.all([
    prisma.customer.count({ where: { deletedAt: null } }),
    prisma.container.count({
      where: { deletedAt: null, status: { notIn: ["CLOSED"] } },
    }),
    prisma.invoice.findMany({
      where: { status: { in: ["ISSUED", "PARTIALLY_PAID", "OVERDUE"] } },
      include: { payments: true },
    }),
    prisma.container.findMany({
      where: { deletedAt: null, status: { in: ["OPEN", "LOADING"] } },
      select: { capacityCbm: true, cargoLines: { select: { cbm: true } } },
    }),
  ]);

  const outstanding = outstandingRows.reduce(
    (sum, invoice) => sum.add(outstandingOf(invoice)),
    new Prisma.Decimal(0)
  );

  const loaded = capacity.reduce(
    (sum, c) => sum + c.cargoLines.reduce((s, l) => s + Number(l.cbm), 0),
    0
  );
  const available = capacity.reduce(
    (sum, c) => sum + Number(c.capacityCbm ?? 0),
    0
  );

  return {
    customers,
    containers,
    outstanding: Number(outstanding),
    loadedCbm: Number(loaded.toFixed(2)),
    capacityCbm: Number(available.toFixed(2)),
  };
}

/** The last things that happened, for the activity rail. */
export async function recentActivity(take = 12) {
  return prisma.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    take,
    select: {
      id: true,
      summary: true,
      action: true,
      actorEmail: true,
      createdAt: true,
    },
  });
}

// ---------------------------------------------------------------------------
// The attention list
// ---------------------------------------------------------------------------

export type AttentionRow = {
  id: string;
  group: string;
  /** How many there are. The headline is built from it. */
  count: number;
  title: string;
  /** Why it matters, in a sentence. Not a reference — a reason. */
  detail: string;
  href: string;
  tone: "warn" | "bad" | "neutral";
  /** The figure or state on the right, as on the air side — an amount, a volume, a state. */
  meta?: string;
  metaSub?: string;
};

/**
 * EVERYTHING GOING WRONG, COUNTED — NOT LISTED.
 *
 * This used to be one row per record: forty lines of reference numbers, which
 * is a report, not a to-do list. Nobody reads forty. What a shift actually asks
 * is "how many of each kind of problem, and which kind is worst" — so each kind
 * is one line with its count and a sentence saying why it matters, and the line
 * opens the filtered list of the actual records.
 *
 * Counted from the real tables rather than from an "alerts" table. An alert row
 * that has to be written whenever something goes wrong is an alert row somebody
 * forgets to write, and then the list quietly stops being true.
 */
export async function attentionItems(role?: Role): Promise<AttentionRow[]> {
  /*
    THE MONEY ROWS ARE NOT FOR EVERY DESK.

    The whole business includes what customers owe. A warehouse dashboard was
    printing what a customer said they had paid to a floor that is deliberately
    kept away from prices — the valuation wall, walked around through the back
    door. The rows are dropped before they are counted, not hidden afterwards.
  */
  const seesMoney = role ? can(role, "finance.view") : true;
  /* A row nobody can act on teaches people to ignore the list. Verifying a
     payment is Finance's alone; an overdue bill is a fact any desk taking a
     phone call may need. */
  const verifiesMoney = role ? can(role, "payment.verify") : true;

  const [
    noPhoto,
    onShelf,
    shortOfList,
    missing,
    openCases,
    urgentCases,
    toVerify,
    overdue,
    unbilled,
    lateAtSea,
    openTooLong,
  ] = await Promise.all([
    prisma.cargo.count({
      where: { deletedAt: null, status: "RECEIVED_CHINA", photos: { none: {} } },
    }),
    /* Three days, as on the air side: long enough that a consignment waiting
       for Saturday's box is not a worry, short enough that a forgotten one is. */
    prisma.chinaReceiving.aggregate({
      where: {
        receivedAt: { lt: daysAgo(3) },
        cargo: { deletedAt: null, status: "RECEIVED_CHINA" },
      },
      _count: { _all: true },
      _sum: { weightKg: true },
    }),
    prisma.darReceiving.count({ where: { discrepancy: true } }),
    prisma.cargo.count({ where: { deletedAt: null, status: "MISSING_AT_DAR" } }),
    prisma.exceptionCase.count({
      where: { status: { notIn: ["RESOLVED", "CLOSED"] } },
    }),
    prisma.exceptionCase.count({
      where: { status: { notIn: ["RESOLVED", "CLOSED"] }, priority: "URGENT" },
    }),
    prisma.payment.count({ where: { status: "PENDING" } }),
    prisma.invoice.count({
      where: {
        status: { in: ["ISSUED", "PARTIALLY_PAID", "OVERDUE"] },
        dueAt: { lt: new Date() },
      },
    }),
    prisma.cargo.count({
      where: {
        deletedAt: null,
        status: { in: ["RECEIVED_DAR", "READY_FOR_RELEASE"] },
        invoices: { none: { status: { not: "CANCELLED" } } },
      },
    }),
    prisma.shipment.count({
      where: {
        status: { notIn: ["COMPLETED", "PREPARING"] },
        eta: { lt: new Date() },
        actualArrival: null,
      },
    }),
    prisma.container.count({
      where: {
        deletedAt: null,
        status: { in: ["OPEN", "LOADING"] },
        createdAt: { lt: daysAgo(3) },
      },
    }),
  ]);

  const waitingLong = onShelf._count._all;
  const rows: AttentionRow[] = [
    {
      id: "no-photo",
      group: "Registration",
      count: noPhoto,
      title: `${noPhoto} received with no photograph`,
      detail:
        "Nothing to show a customer whose cargo arrives damaged, and nothing to argue with when they say it did.",
      href: "/app/inventory?state=nophoto",
      tone: "bad",
    },
    {
      id: "on-shelf",
      group: "Waiting",
      count: waitingLong,
      title: `${waitingLong} waiting more than 3 days`,
      detail:
        "Booked in and still in Guangzhou. Every day here is a day the customer is counting.",
      href: "/app/inventory?state=waiting",
      tone: "neutral",
      meta: `${Math.round(Number(onShelf._sum.weightKg ?? 0))} kg`,
    },
    {
      id: "short",
      group: "Dar floor",
      count: shortOfList,
      title: `${shortOfList} short of the packing list`,
      detail:
        "Booked in with fewer packages than Guangzhou recorded. Held from release until somebody explains the gap.",
      href: "/app/receive/dar",
      tone: "bad",
    },
    {
      id: "missing",
      group: "Dar floor",
      count: missing,
      title: `${missing} did not come off the container`,
      detail:
        "Expected on a landed sailing and not found. Each one has a case open against it.",
      href: "/app/cargo?status=MISSING_AT_DAR",
      tone: "bad",
    },
    {
      id: "cases",
      group: "Cases",
      count: openCases,
      title: `${openCases} open case${openCases === 1 ? "" : "s"}`,
      detail: urgentCases
        ? `Cargo reported missing, damaged or wrong on arrival — ${urgentCases} marked urgent.`
        : "Cargo reported missing, damaged or wrong on arrival.",
      href: "/app/exceptions",
      tone: urgentCases > 0 ? "bad" : "warn",
    },
    {
      id: "at-sea",
      group: "Shipping",
      count: lateAtSea,
      title: `${lateAtSea} past the expected arrival`,
      detail:
        "Still at sea after the date we gave the customer. Worth a call to the line before they ring us.",
      href: "/app/containers?view=sea",
      tone: "warn",
    },
    {
      id: "open-too-long",
      group: "Loading",
      count: openTooLong,
      title: `${openTooLong} container${openTooLong === 1 ? "" : "s"} open more than 3 days`,
      detail:
        "A container left open stops being a container and becomes a shelf. Seal it or ship it.",
      href: "/app/containers/loading",
      tone: "warn",
    },
  ];

  if (verifiesMoney) {
    rows.push({
      id: "to-verify",
      group: "Finance",
      count: toVerify,
      title: `${toVerify} payment${toVerify === 1 ? "" : "s"} to verify`,
      detail:
        "Somebody says money moved and nobody has checked. It counts for nothing until it is verified.",
      href: "/app/finance/collections/verify",
      tone: "warn",
    });
  }

  if (seesMoney) {
    rows.push(
      {
        id: "overdue",
        group: "Finance",
        count: overdue,
        title: `${overdue} invoice${overdue === 1 ? "" : "s"} past due`,
        detail: "Billed, confirmed, and still not paid.",
        href: "/app/finance/collections?view=overdue",
        tone: "bad",
      },
      {
        id: "unbilled",
        group: "Finance",
        count: unbilled,
        title: `${unbilled} landed and not billed`,
        detail:
          "Sitting in Dar with no invoice against it. Nothing can be collected until one is raised.",
        href: "/app/finance/collections",
        tone: "warn",
      }
    );
  }

  /*
    THE DESK'S OWN WORK, BESIDE WHAT IS WRONG.

    As on the air side: the panel is also where a desk sees the everyday queue
    it owns — what is waiting on it and what it is waiting on — so it opens a
    shift on the list rather than on a wall of cards. Counted per desk, and
    only for the desk that acts on it.
  */
  if (role) rows.push(...(await deskRows(role)));

  /* The Guangzhou desk sees Guangzhou's own failures, as on the air side: a
     case in Dar or a ship running late is real, and nothing a clerk in China
     can do anything about. */
  const CHINA_GROUPS = new Set(["Registration", "Loading", "Waiting"]);
  const mine =
    role === "CHINA_WAREHOUSE" ? rows.filter((row) => CHINA_GROUPS.has(row.group)) : rows;

  /* A zero is not a worry. Worst first, then biggest — the list is read from
     the top and the top should be the thing that hurts. */
  const RANK = { bad: 0, warn: 1, neutral: 2 } as const;
  return mine
    .filter((row) => row.count > 0)
    .sort((a, b) => RANK[a.tone] - RANK[b.tone] || b.count - a.count);
}

/** The money position, in the two currencies the business actually uses. */
export async function moneyPosition() {
  const [invoices, unbilled, expenses, fx] = await Promise.all([
    prisma.invoice.findMany({
      where: { status: { not: "CANCELLED" } },
      include: { payments: true },
    }),
    prisma.cargo.count({
      where: {
        deletedAt: null,
        status: { in: ["RECEIVED_DAR", "READY_FOR_RELEASE"] },
        invoices: { none: { status: { not: "CANCELLED" } } },
      },
    }),
    prisma.containerExpense.aggregate({
      where: { deletedAt: null },
      _sum: { amount: true },
    }),
    prisma.exchangeRate.findFirst({
      where: { fromCurrency: "USD", toCurrency: "TZS", active: true },
      orderBy: { effectiveFrom: "desc" },
    }),
  ]);

  const live = invoices.filter((i) => i.status !== "DRAFT");
  const billed = live.reduce((sum, i) => sum + Number(i.total), 0);
  const owed = live.reduce((sum, i) => sum + Number(outstandingOf(i)), 0);
  const collected = billed - owed;
  const drafts = invoices.filter((i) => i.status === "DRAFT").length;

  return {
    billed,
    owed,
    collected,
    drafts,
    unbilled,
    spent: Number(expenses._sum.amount ?? 0),
    billCount: live.length,
    rate: fx ? Number(fx.rate) : null,
  };
}

// ---------------------------------------------------------------------------
// The Guangzhou floor, in shape
// ---------------------------------------------------------------------------

/**
 * WHAT THE CHINA DESK IS ACTUALLY LOOKING AT.
 *
 * Everything here is about one building on one day: what came in, what is still
 * standing on the floor, how long it has stood there, and what is in it. The
 * company-wide figures are somebody else's dashboard — a clerk in Guangzhou
 * cannot act on money owed in Dar, and a number nobody can act on is furniture.
 */
export async function chinaFloor() {
  const now = new Date();
  /* "Today" is the Guangzhou floor's day, not the server's: a clerk opening
     the page at 7am Guangzhou time is still in yesterday by UTC. China keeps
     no summer time, so the day starts at a fixed 16:00 UTC. */
  const GZ_OFFSET = 8 * 3_600_000;
  const startOfDay = new Date(
    Math.floor((now.getTime() + GZ_OFFSET) / 86_400_000) * 86_400_000 - GZ_OFFSET
  );

  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);

  const [
    waiting,
    waitingVolume,
    receivedToday,
    todayVolume,
    thisMonth,
    lastMonth,
    inContainers,
    atSea,
    seaVolume,
  ] = await Promise.all([
    prisma.cargo.count({ where: { deletedAt: null, status: "RECEIVED_CHINA" } }),
    prisma.chinaReceiving.aggregate({
      _sum: { cbm: true },
      where: { cargo: { deletedAt: null, status: "RECEIVED_CHINA" } },
    }),
    prisma.chinaReceiving.count({
      where: { receivedAt: { gte: startOfDay }, cargo: { deletedAt: null } },
    }),
    prisma.chinaReceiving.aggregate({
      _sum: { cbm: true, packagesCount: true, weightKg: true },
      where: { receivedAt: { gte: startOfDay }, cargo: { deletedAt: null } },
    }),
    prisma.chinaReceiving.count({ where: { receivedAt: { gte: monthStart } } }),
    prisma.chinaReceiving.count({
      where: { receivedAt: { gte: lastMonthStart, lt: monthStart } },
    }),
    prisma.cargo.count({
      where: {
        deletedAt: null,
        status: { in: ["ASSIGNED_TO_CONTAINER", "CONTAINER_LOADED"] },
        containerLines: {
          some: { container: { deletedAt: null, status: { in: ["OPEN", "LOADING"] } } },
        },
      },
    }),
    prisma.cargo.count({
      where: { deletedAt: null, status: { in: ["DEPARTED_CHINA", "IN_TRANSIT"] } },
    }),
    prisma.containerCargo.aggregate({
      _sum: { cbm: true },
      where: {
        container: {
          deletedAt: null,
          status: { in: ["DEPARTED", "IN_TRANSIT"] },
        },
      },
    }),
  ]);

  /* Fourteen days of receipts, for the shape rather than the numbers. */
  const recent = await prisma.chinaReceiving.findMany({
    where: { receivedAt: { gte: new Date(now.getTime() - 13 * 86_400_000) } },
    select: { receivedAt: true },
  });
  const trend = Array.from({ length: 14 }, (_, i) => {
    const day = new Date(now.getTime() - (13 - i) * 86_400_000);
    day.setHours(0, 0, 0, 0);
    const next = new Date(day.getTime() + 86_400_000);
    return recent.filter((r) => r.receivedAt >= day && r.receivedAt < next).length;
  });

  return {
    waiting,
    waitingCbm: Number(waitingVolume._sum.cbm ?? 0),
    receivedToday,
    todayCbm: Number(todayVolume._sum.cbm ?? 0),
    todayPackages: todayVolume._sum.packagesCount ?? 0,
    /* A line with no piece count is one piece per package — the counter only
       asks for pieces when the two differ. */
    todayPieces: (
      await prisma.chinaReceiving.findMany({
        where: { receivedAt: { gte: startOfDay }, cargo: { deletedAt: null } },
        select: { packagesCount: true, piecesCount: true },
      })
    ).reduce((n, r) => n + (r.piecesCount ?? r.packagesCount), 0),
    todayKg: Number(todayVolume._sum.weightKg ?? 0),
    thisMonth,
    lastMonth,
    /* Null rather than zero when there is nothing to compare against: a first
       month is not a 100% rise. */
    delta:
      lastMonth > 0 ? ((thisMonth - lastMonth) / lastMonth) * 100 : null,
    loading: inContainers,
    sealed: await prisma.cargo.count({
      where: {
        deletedAt: null,
        status: { in: ["ASSIGNED_TO_CONTAINER", "CONTAINER_LOADED"] },
        containerLines: {
          some: { container: { deletedAt: null, status: { in: ["LOADED", "SEALED"] } } },
        },
      },
    }),
    atSea,
    seaCbm: Number(seaVolume._sum.cbm ?? 0),
    trend,
  };
}

/** Received against loaded, day by day, for the last fortnight. */
export async function chinaFlow() {
  const now = new Date();
  const from = new Date(now.getTime() - 13 * 86_400_000);
  from.setHours(0, 0, 0, 0);

  const [received, loaded] = await Promise.all([
    prisma.chinaReceiving.findMany({
      where: { receivedAt: { gte: from } },
      select: { receivedAt: true },
    }),
    prisma.containerCargo.findMany({
      where: { loadedAt: { gte: from } },
      select: { loadedAt: true },
    }),
  ]);

  return Array.from({ length: 14 }, (_, i) => {
    const day = new Date(from.getTime() + i * 86_400_000);
    const next = new Date(day.getTime() + 86_400_000);
    return {
      label: new Intl.DateTimeFormat("en-GB", { day: "numeric" }).format(day),
      in: received.filter((r) => r.receivedAt >= day && r.receivedAt < next).length,
      out: loaded.filter((l) => l.loadedAt && l.loadedAt >= day && l.loadedAt < next)
        .length,
    };
  });
}

/** How long what is standing on the floor has been standing there. */
export async function chinaAgeing() {
  const rows = await prisma.chinaReceiving.findMany({
    where: { cargo: { deletedAt: null, status: "RECEIVED_CHINA" } },
    select: { receivedAt: true, cbm: true, packagesCount: true },
  });

  const now = Date.now();
  const days = (d: Date) => Math.floor((now - d.getTime()) / 86_400_000);

  const band = (min: number, max: number) =>
    rows.filter((r) => days(r.receivedAt) >= min && days(r.receivedAt) <= max);

  const shape = [
    { label: "Received today", rows: band(0, 0), tone: 4 as const },
    { label: "2–7 days", rows: band(1, 6), tone: 2 as const },
    { label: "8–14 days", rows: band(7, 13), tone: 3 as const },
    { label: "More than 14 days", rows: band(14, 100_000), tone: 5 as const },
  ];

  return shape.map((b) => ({
    label: b.label,
    tone: b.tone,
    value: b.rows.length,
    packages: b.rows.reduce((n, r) => n + r.packagesCount, 0),
    cbm: b.rows.reduce((n, r) => n + Number(r.cbm), 0),
  }));
}

/** What the floor is actually full of, by cargo type, over the last 30 days. */
export async function chinaMix() {
  const from = new Date(Date.now() - 30 * 86_400_000);
  const rows = await prisma.cargoPackage.findMany({
    where: {
      deletedAt: null,
      cargoType: { not: null },
      cargo: { deletedAt: null, chinaReceiving: { receivedAt: { gte: from } } },
    },
    select: { cargoType: true, cbm: true },
  });

  const byType = new Map<string, number>();
  for (const row of rows) {
    byType.set(row.cargoType!, (byType.get(row.cargoType!) ?? 0) + Number(row.cbm));
  }

  const sorted = [...byType.entries()].sort((a, b) => b[1] - a[1]);
  const top = sorted.slice(0, 5);
  const rest = sorted.slice(5);
  const restTotal = rest.reduce((n, [, v]) => n + v, 0);

  const tones = [1, 2, 3, 4, 5] as const;
  return {
    total: sorted.reduce((n, [, v]) => n + v, 0),
    slices: [
      ...top.map(([label, value], i) => ({ label, value, tone: tones[i] })),
      ...(restTotal > 0
        ? [
            {
              label: `Other (${rest.length} type${rest.length === 1 ? "" : "s"})`,
              value: restTotal,
              tone: 6 as const,
            },
          ]
        : []),
    ],
  };
}

/** Volume received at the China desk, this year against last. */
export async function chinaVolumeByMonth() {
  const now = new Date();
  const from = new Date(now.getFullYear() - 1, 0, 1);

  const rows = await prisma.chinaReceiving.findMany({
    where: { receivedAt: { gte: from } },
    select: { receivedAt: true, cbm: true },
  });

  const bucket = (year: number) =>
    Array.from({ length: 12 }, (_, month) =>
      rows
        .filter(
          (r) =>
            r.receivedAt.getFullYear() === year && r.receivedAt.getMonth() === month
        )
        .reduce((n, r) => n + Number(r.cbm), 0)
    );

  return {
    labels: ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"],
    thisYear: { year: now.getFullYear(), values: bucket(now.getFullYear()) },
    lastYear: { year: now.getFullYear() - 1, values: bucket(now.getFullYear() - 1) },
  };
}

/** The boxes standing open on the floor, and what has sailed lately. */
export async function chinaContainers() {
  const [openBoxes, sailed] = await Promise.all([
    prisma.container.findMany({
      where: { deletedAt: null, status: { in: ["OPEN", "LOADING"] } },
      orderBy: { createdAt: "asc" },
      take: 5,
      include: {
        cargoLines: { select: { cbm: true, packagesCount: true } },
        _count: { select: { cargoLines: true } },
      },
    }),
    prisma.container.findMany({
      where: { deletedAt: null, status: { in: ["DEPARTED", "IN_TRANSIT", "ARRIVED"] } },
      orderBy: { sealedAt: "desc" },
      take: 6,
      include: { cargoLines: { select: { cbm: true } } },
    }),
  ]);

  return {
    open: openBoxes.map((c) => {
      const cbm = c.cargoLines.reduce((n, l) => n + Number(l.cbm), 0);
      return {
        id: c.id,
        label: c.containerNumber ?? c.reference,
        reference: c.reference,
        status: c.status,
        consignments: c._count.cargoLines,
        packages: c.cargoLines.reduce((n, l) => n + l.packagesCount, 0),
        cbm,
        capacity: c.capacityCbm ? Number(c.capacityCbm) : null,
        since: c.createdAt,
      };
    }),
    sailed: sailed
      .map((c) => ({
        label: c.containerNumber ?? c.reference,
        value: c.cargoLines.reduce((n, l) => n + Number(l.cbm), 0),
      }))
      .reverse(),
  };
}

/** What this person has done, newest first. */
export async function myActivity(userId: string) {
  return prisma.auditLog.findMany({
    where: { actorId: userId },
    orderBy: { createdAt: "desc" },
    take: 8,
    select: { id: true, action: true, summary: true, createdAt: true },
  });
}

/**
 * THE FINANCE DESK, IN ONE QUERY.
 *
 * Everything the office needs to see the moment it signs in: what has landed
 * and is waiting on them, what has been billed, what is owed, and who is
 * standing by to collect. Counted from the operational record rather than from
 * a set of books kept alongside it — there is no second set, and a figure that
 * has to be posted somewhere is a figure somebody forgets to post.
 */
export async function financeDesk() {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const [
    invoices,
    awaitingReview,
    awaitingPricing,
    drafts,
    unnotified,
    readyToCollect,
    collected,
    paidToday,
    toVerify,
    fx,
    discrepancies,
    openCases,
  ] = await Promise.all([
    prisma.invoice.findMany({
      where: { status: { not: "CANCELLED" } },
      include: { payments: true },
    }),
    /* Landed, every line checked off by Dar, and not yet billed. This is the
       queue this desk exists to clear. */
    prisma.container.count({
      where: {
        deletedAt: null,
        status: { in: ["ARRIVED", "CLOSED"] },
        cargoLines: {
          some: {
            cargo: {
              deletedAt: null,
              darReceiving: { isNot: null },
              invoices: { none: { status: { not: "CANCELLED" } } },
            },
          },
        },
      },
    }),
    prisma.cargo.count({
      where: {
        deletedAt: null,
        darReceiving: { isNot: null },
        invoices: { none: { status: { not: "CANCELLED" } } },
      },
    }),
    prisma.invoice.count({ where: { status: "DRAFT" } }),
    /* Billed and never contacted. A bill nobody was told about is not a debt,
       it is a filing error. */
    prisma.invoice.count({
      where: {
        status: { in: ["ISSUED", "PARTIALLY_PAID", "OVERDUE"] },
        cargo: { contacts: { none: {} } },
      },
    }),
    prisma.pickupNote.count({ where: { status: "ACTIVE" } }),
    prisma.pickupNote.count({ where: { status: "USED" } }),
    /* Rows, not a sum of `amount`: shillings and dollars in one column added
       together are neither. Each is counted at its stored shilling value. */
    prisma.payment.findMany({
      where: { status: "VERIFIED", verifiedAt: { gte: startOfToday }, writtenOff: false },
      include: { invoice: { select: { fxRate: true } } },
    }),
    prisma.payment.count({ where: { status: "PENDING" } }),
    prisma.exchangeRate.findFirst({
      where: { fromCurrency: "USD", toCurrency: "TZS", active: true },
      orderBy: { effectiveFrom: "desc" },
    }),
    prisma.darReceiving.count({ where: { discrepancy: true } }),
    prisma.exceptionCase.count({
      where: { status: { notIn: ["RESOLVED", "CLOSED"] } },
    }),
  ]);

  const live = invoices.filter((i) => i.status !== "DRAFT");
  const balances = live.map((i) => ({ invoice: i, b: balanceOf(i) }));

  /* Kept in shillings, each bill at its own pinned rate; the dollar figures are
     each bill's own dollars added up, never the shilling total divided by today. */
  const billed = balances.reduce((sum, { b }) => sum + (b.totalTzs?.toNumber() ?? 0), 0);
  const owed = balances.reduce((sum, { b }) => sum + (b.outstandingTzs?.toNumber() ?? 0), 0);
  const collectedMoney = balances.reduce(
    (sum, { b }) =>
      sum + (b.paidTzs && b.totalTzs ? Math.min(b.paidTzs.toNumber(), b.totalTzs.toNumber()) : 0),
    0
  );
  const billedUsd = balances.reduce((sum, { invoice }) => sum + Number(invoice.total), 0);
  const owedUsd = balances.reduce((sum, { b }) => sum + b.outstanding.toNumber(), 0);

  const unpaid = balances.filter(({ b }) => !b.settled && !(b.paidTzs ?? b.paid).greaterThan(0));
  const partly = balances.filter(({ b }) => !b.settled && (b.paidTzs ?? b.paid).greaterThan(0));
  const settled = balances.filter(({ b }) => b.settled);

  const takenTodayTzs = paidToday.reduce(
    (sum, p) => sum + (paymentTzs(p, p.invoice)?.toNumber() ?? 0),
    0
  );

  return {
    awaitingReview,
    awaitingPricing,
    drafts,
    unnotified,
    unpaid: unpaid.length,
    partly: partly.length,
    settled: settled.length,
    readyToCollect,
    collected,
    toVerify,
    discrepancies,
    openCases,
    billed,
    billedUsd,
    owed,
    owedUsd,
    collectedMoney,
    paidTodayCount: paidToday.length,
    paidToday: takenTodayTzs,
    fxRate: fx ? Number(fx.rate) : null,
    currency: "TZS",
  };
}


async function deskRows(role: Role): Promise<AttentionRow[]> {
  const rows: AttentionRow[] = [];
  const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

  /* Guangzhou's queue is the Waiting and Loading rows above, on Target's
     three-day rule; a second count of the same shelf would only argue with it. */

  if (can(role, "receiving.dar")) {
    const [clearing, ready] = await Promise.all([
      prisma.cargo.count({
        where: {
          deletedAt: null,
          clearedAt: null,
          status: { in: ["ARRIVED_TANZANIA", "RECEIVED_DAR"] },
        },
      }),
      prisma.cargo.count({ where: { deletedAt: null, status: "READY_FOR_RELEASE" } }),
    ]);
    rows.push(
      {
        id: "desk-clearance",
        group: "Dar floor",
        count: clearing,
        title: `${clearing} ${plural(clearing, "consignment", "consignments")} in customs clearance`,
        detail: "Landed at the port. Mark them cleared when customs is done.",
        href: "/app/receive/dar",
        tone: "neutral",
        meta: "at the port",
      },
      {
        id: "desk-ready",
        group: "Dar floor",
        count: ready,
        title: `${ready} ready for pickup`,
        detail: "Cleared and paid — waiting for the customer to collect.",
        href: "/app/release",
        tone: "neutral",
        meta: "to collect",
      }
    );
  }

  /* The desk that hands payments up and chases customers, not the one that
     verifies them — Finance has its own rows above. */
  if (can(role, "payment.submit") && !can(role, "payment.verify")) {
    const [sentBack, withFinance, open] = await Promise.all([
      prisma.payment.count({ where: { status: "REJECTED" } }),
      prisma.payment.count({ where: { status: "PENDING" } }),
      prisma.invoice.findMany({
        where: { status: { in: ["ISSUED", "PARTIALLY_PAID", "OVERDUE"] } },
        select: {
          customerId: true,
          status: true,
          total: true,
          currency: true,
          fxRate: true,
          totalTzs: true,
          payments: {
            select: { status: true, amount: true, currency: true, fxRate: true, baseCurrencyAmount: true, creditedAmount: true },
          },
        },
      }),
    ]);
    /* Customers, not bills — one call covers every bill a customer owes. */
    const owing = open.filter((i) => owedAcross([i]).owes);
    const toChase = new Set(owing.map((i) => i.customerId)).size;
    const owed = owedAcross(owing);
    rows.push(
      {
        id: "desk-sent-back",
        group: "Collections",
        count: sentBack,
        title: `${sentBack} ${plural(sentBack, "payment", "payments")} sent back by Finance`,
        detail: "Finance could not verify these. Ring the customer before handing it up again.",
        href: "/app/finance/collections/sent-back",
        tone: "bad",
        meta: "needs a call",
      },
      {
        id: "desk-to-chase",
        group: "Collections",
        count: toChase,
        title: `${toChase} ${plural(toChase, "customer", "customers")} to chase`,
        detail: "Billed, and the money has not arrived.",
        href: "/app/finance/collections",
        tone: "neutral",
        meta: owed.primary,
        metaSub: owed.equivalent ?? undefined,
      },
      {
        id: "desk-with-finance",
        group: "Collections",
        count: withFinance,
        title: `${withFinance} with Finance`,
        detail: "Payments handed up, waiting to be checked. Nothing to do but watch.",
        href: "/app/finance/collections/with-finance",
        tone: "neutral",
        meta: "waiting on Finance",
      }
    );
  }
  return rows;
}
