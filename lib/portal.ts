import "server-only";

import type { CargoStatus } from "@prisma/client";

import { formatMoney } from "@/lib/format";
import { owedAcross } from "@/lib/invoice-balance";
import { prisma } from "@/lib/prisma";

/**
 * EVERYTHING THE CUSTOMER PORTAL READS, SCOPED BY ONE ID.
 *
 * Every function here takes the customerId from the session and nothing else.
 * None of them accepts a cargo, invoice or note id to look up on its own: a
 * record is found by being one of this customer's, never by being named.
 */

/** What each move means, in the customer's words rather than the floor's. */
export const CUSTOMER_STATUS_WORDS: Record<CargoStatus, string> = {
  REGISTERED: "Booked",
  RECEIVED_CHINA: "Received at our Guangzhou warehouse",
  ASSIGNED_TO_CONTAINER: "Assigned to a container",
  CONTAINER_LOADED: "Loaded into the container",
  DEPARTED_CHINA: "Left China",
  IN_TRANSIT: "At sea",
  ARRIVED_TANZANIA: "Arrived at Dar es Salaam port",
  RECEIVED_DAR: "Received at our Dar warehouse",
  READY_FOR_RELEASE: "Ready for pickup",
  COLLECTED: "Collected",
  DELIVERED: "Delivered",
  MISSING_AT_DAR: "Being traced — we are on it",
  CANCELLED: "Cancelled",
};

/** Cargo this customer can see: what they sent and what is coming to them. */
export const mine = (customerId: string) => ({
  deletedAt: null,
  OR: [{ senderId: customerId }, { receiverId: customerId }],
});

const IN_CHINA: CargoStatus[] = [
  "REGISTERED",
  "RECEIVED_CHINA",
  "ASSIGNED_TO_CONTAINER",
  "CONTAINER_LOADED",
];
const AT_SEA: CargoStatus[] = ["DEPARTED_CHINA", "IN_TRANSIT"];
const ARRIVED: CargoStatus[] = ["ARRIVED_TANZANIA", "RECEIVED_DAR"];
const DONE: CargoStatus[] = ["COLLECTED", "DELIVERED"];

/** Where a status sits on the customer's own map, for filters and counts. */
export const STAGE_FILTERS = {
  china: { label: "In China", statuses: IN_CHINA },
  sea: { label: "At sea", statuses: AT_SEA },
  arrived: { label: "Arrived in Dar", statuses: ARRIVED },
  ready: { label: "Ready for pickup", statuses: ["READY_FOR_RELEASE"] as CargoStatus[] },
  collected: { label: "Collected", statuses: DONE },
} as const;
export type StageFilter = keyof typeof STAGE_FILTERS;

/**
 * The headline numbers. Counted by the database, not by loading every row:
 * a customer with four hundred consignments opens the same fast page as one
 * with four.
 */
export async function portalSummary(customerId: string) {
  const [byStatus, invoices, bookings, pickups, unread] = await Promise.all([
    prisma.cargo.groupBy({
      by: ["status"],
      where: mine(customerId),
      _count: { _all: true },
    }),
    prisma.invoice.findMany({
      where: { customerId, status: { notIn: ["DRAFT", "CANCELLED"] } },
      select: {
        status: true,
        total: true,
        currency: true,
        fxRate: true,
        totalTzs: true,
        payments: {
          select: {
            status: true,
            amount: true,
            currency: true,
            fxRate: true,
            baseCurrencyAmount: true,
            creditedAmount: true,
          },
        },
      },
    }),
    prisma.containerBooking.count({
      where: { customerId, status: { notIn: ["COMPLETED", "CANCELLED", "REJECTED"] } },
    }),
    prisma.pickupRequest.count({
      where: { customerId, status: { notIn: ["COMPLETED", "CANCELLED", "REJECTED"] } },
    }),
    prisma.notification.count({ where: { customerId, readAt: null } }),
  ]);

  const count = (statuses: readonly CargoStatus[]) =>
    byStatus
      .filter((row) => statuses.includes(row.status))
      .reduce((n, row) => n + row._count._all, 0);

  return {
    inChina: count(IN_CHINA),
    atSea: count(AT_SEA),
    arrived: count(ARRIVED),
    ready: count(["READY_FOR_RELEASE"]),
    collected: count(DONE),
    active: count([...IN_CHINA, ...AT_SEA, ...ARRIVED, "READY_FOR_RELEASE", "MISSING_AT_DAR"]),
    total: byStatus.reduce((n, row) => n + row._count._all, 0),
    owed: owedAcross(invoices),
    invoiceCount: invoices.length,
    activeBookings: bookings + pickups,
    unread,
  };
}

export type ActivityItem = {
  at: Date;
  text: string;
  href: string | null;
  kind: "cargo" | "money" | "shipment";
};

/**
 * WHAT HAS HAPPENED, NEWEST FIRST.
 *
 * Read from the append-only records themselves — the status history of their
 * cargo, their own payments, their issued bills — so nothing appears here that
 * did not actually happen, and nothing that happened can be missing from it.
 */
export async function portalActivity(customerId: string, take = 8): Promise<ActivityItem[]> {
  const [moves, payments, bills] = await Promise.all([
    prisma.cargoStatusHistory.findMany({
      where: { cargo: mine(customerId) },
      orderBy: { createdAt: "desc" },
      take,
      select: { to: true, createdAt: true, cargo: { select: { reference: true } } },
    }),
    prisma.payment.findMany({
      where: { customerId, status: { in: ["VERIFIED", "PENDING"] } },
      orderBy: { createdAt: "desc" },
      take,
      select: {
        amount: true,
        currency: true,
        status: true,
        createdAt: true,
        verifiedAt: true,
        invoice: { select: { id: true, number: true } },
      },
    }),
    prisma.invoice.findMany({
      where: { customerId, status: { notIn: ["DRAFT", "CANCELLED"] } },
      orderBy: { createdAt: "desc" },
      take,
      select: { id: true, number: true, issuedAt: true, createdAt: true },
    }),
  ]);

  const items: ActivityItem[] = [
    ...moves.map((m) => ({
      at: m.createdAt,
      text: `${m.cargo.reference} · ${CUSTOMER_STATUS_WORDS[m.to] ?? m.to}`,
      href: `/portal/cargo/${encodeURIComponent(m.cargo.reference)}`,
      kind: "cargo" as const,
    })),
    ...payments.map((p) => ({
      at: p.verifiedAt ?? p.createdAt,
      text:
        p.status === "VERIFIED"
          ? `Payment of ${formatMoney(p.amount, p.currency)} received for ${p.invoice.number}`
          : `Payment of ${formatMoney(p.amount, p.currency)} sent for ${p.invoice.number} — being checked`,
      href: `/portal/invoices/${p.invoice.id}`,
      kind: "money" as const,
    })),
    ...bills.map((b) => ({
      at: b.issuedAt ?? b.createdAt,
      text: `Invoice ${b.number} issued`,
      href: `/portal/invoices/${b.id}`,
      kind: "money" as const,
    })),
  ];

  return items.sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, take);
}

/**
 * THE CONTAINERS THIS CUSTOMER HAS CARGO IN.
 *
 * Only their own consignments are counted in each box. The box's other
 * contents — whose, how much — are not this customer's business, so nothing
 * about them is selected, let alone shown.
 */
export async function portalShipments(customerId: string) {
  const lines = await prisma.containerCargo.findMany({
    where: { cargo: mine(customerId), container: { deletedAt: null } },
    select: {
      cbm: true,
      packagesCount: true,
      cargo: { select: { id: true, reference: true, description: true, status: true } },
      container: {
        select: {
          id: true,
          reference: true,
          status: true,
          createdAt: true,
          events: {
            where: { to: { in: ["DEPARTED", "IN_TRANSIT", "ARRIVED"] } },
            select: { to: true, createdAt: true },
            orderBy: { createdAt: "asc" },
          },
          shipment: { select: { eta: true, actualArrival: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const byContainer = new Map<
    string,
    {
      container: (typeof lines)[number]["container"];
      cbm: number;
      packages: number;
      cargo: (typeof lines)[number]["cargo"][];
    }
  >();
  for (const line of lines) {
    const entry = byContainer.get(line.container.id) ?? {
      container: line.container,
      cbm: 0,
      packages: 0,
      cargo: [],
    };
    entry.cbm += Number(line.cbm);
    entry.packages += line.packagesCount;
    entry.cargo.push(line.cargo);
    byContainer.set(line.container.id, entry);
  }

  return [...byContainer.values()].map((entry) => {
    const departed = entry.container.events.find((e) => e.to !== "ARRIVED")?.createdAt ?? null;
    const arrived =
      entry.container.shipment?.actualArrival ??
      entry.container.events.find((e) => e.to === "ARRIVED")?.createdAt ??
      null;
    return {
      ...entry,
      departedAt: departed,
      arrivedAt: arrived,
      eta: arrived ? null : entry.container.shipment?.eta ?? null,
    };
  });
}
