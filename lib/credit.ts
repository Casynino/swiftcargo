import "server-only";

import { Prisma } from "@prisma/client";

import { balanceOf, owedAcross } from "@/lib/invoice-balance";
import { prisma } from "@/lib/prisma";

const DAY = 86_400_000;
/* Dar es Salaam keeps UTC+3 all year. "Due today" is the business's today, not
   the server's — a bill due at 01:00 in Dar is not due yesterday. */
const DAR_OFFSET = 3 * 3_600_000;

function startOfDarToday(now = Date.now()) {
  return Math.floor((now + DAR_OFFSET) / DAY) * DAY - DAR_OFFSET;
}

export type CreditState = "OPEN" | "PARTIALLY_PAID" | "OVERDUE" | "PAID";

export const CREDIT_STATE_LABEL: Record<CreditState, string> = {
  OPEN: "Still owing",
  PARTIALLY_PAID: "Part paid",
  OVERDUE: "Overdue",
  PAID: "Settled",
};

export type CreditRow = {
  noteId: string;
  noteNumber: string;
  customerId: string;
  customerName: string;
  phone: string;
  cargoId: string;
  cargoReference: string;
  container: string | null;
  invoices: { id: string; number: string }[];
  /** The bill on the cargo still owing first, for Record Payment. */
  collectInvoiceId: string | null;
  reason: string | null;
  issuedBy: string | null;
  issuedAt: Date;
  dueAt: Date | null;
  state: CreditState;
  dueToday: boolean;
  dueThisWeek: boolean;
  daysLate: number;
  daysToDue: number | null;
  soldTzs: Prisma.Decimal;
  collectedTzs: Prisma.Decimal;
  owedTzs: Prisma.Decimal;
  /** Dollars on bills that carry no rate, kept apart and never added to shillings. */
  owedUnconvertedUsd: Prisma.Decimal;
  owedLabel: string;
  owes: boolean;
};

/**
 * THE CREDIT BOOK, ONE ROW PER RELEASE.
 *
 * Every figure is read from the bills and their verified payments at the moment
 * the page is drawn — the pickup note only says the goods went out, when, why
 * and until when. A cancelled note never let anything leave and is not credit.
 */
export async function creditBook() {
  const notes = await prisma.pickupNote.findMany({
    where: { onCredit: true, status: { not: "CANCELLED" } },
    orderBy: { issuedAt: "asc" },
    include: {
      customer: { select: { id: true, fullName: true, businessName: true, phone: true } },
      issuedBy: { select: { name: true } },
      cargo: {
        select: {
          id: true,
          reference: true,
          containerLines: {
            take: 1,
            orderBy: { createdAt: "desc" },
            select: { container: { select: { reference: true } } },
          },
          invoices: {
            where: { status: { notIn: ["DRAFT", "CANCELLED"] } },
            orderBy: { issuedAt: "asc" },
            include: { payments: true },
          },
        },
      },
    },
  });

  const now = Date.now();
  const today = startOfDarToday(now);

  const rows: CreditRow[] = notes.map((note) => {
    const live = note.cargo.invoices;
    let sold = new Prisma.Decimal(0);
    let collected = new Prisma.Decimal(0);
    let collectInvoiceId: string | null = null;
    for (const invoice of live) {
      const b = balanceOf(invoice);
      if (b.totalTzs && b.paidTzs) {
        sold = sold.add(b.totalTzs);
        collected = collected.add(Prisma.Decimal.min(b.paidTzs, b.totalTzs));
      }
      if (!b.settled && !collectInvoiceId) collectInvoiceId = invoice.id;
    }
    const owed = owedAcross(live);
    const due = note.creditDueAt?.getTime() ?? null;
    const daysToDue = due === null ? null : Math.floor((due - today) / DAY);
    const overdue = owed.owes && due !== null && due < today;
    const state: CreditState = !owed.owes
      ? "PAID"
      : overdue
        ? "OVERDUE"
        : collected.greaterThan(0)
          ? "PARTIALLY_PAID"
          : "OPEN";

    return {
      noteId: note.id,
      noteNumber: note.noteNumber,
      customerId: note.customer.id,
      customerName: note.customer.businessName || note.customer.fullName,
      phone: note.customer.phone,
      cargoId: note.cargo.id,
      cargoReference: note.cargo.reference,
      container: note.cargo.containerLines[0]?.container.reference ?? null,
      invoices: live.map((i) => ({ id: i.id, number: i.number })),
      collectInvoiceId,
      reason: note.creditReason,
      issuedBy: note.issuedBy?.name ?? null,
      issuedAt: note.issuedAt,
      dueAt: note.creditDueAt,
      state,
      dueToday: owed.owes && daysToDue === 0,
      dueThisWeek: owed.owes && daysToDue !== null && daysToDue >= 0 && daysToDue < 7,
      daysLate: overdue && due !== null ? Math.ceil((today - due) / DAY) : 0,
      daysToDue,
      soldTzs: sold,
      collectedTzs: collected,
      owedTzs: owed.tzs,
      owedUnconvertedUsd: owed.unconverted,
      owedLabel: owed.primary,
      owes: owed.owes,
    };
  });

  const sum = (pick: (r: CreditRow) => Prisma.Decimal, keep: (r: CreditRow) => boolean = () => true) =>
    rows.filter(keep).reduce((n, r) => n.add(pick(r)), new Prisma.Decimal(0));

  const overview = {
    sold: sum((r) => r.soldTzs),
    collected: sum((r) => r.collectedTzs),
    owed: sum((r) => r.owedTzs),
    overdue: sum((r) => r.owedTzs, (r) => r.state === "OVERDUE"),
    dueToday: sum((r) => r.owedTzs, (r) => r.dueToday),
    dueThisWeek: sum((r) => r.owedTzs, (r) => r.dueThisWeek),
    unconvertedUsd: sum((r) => r.owedUnconvertedUsd),
    customersOwing: new Set(rows.filter((r) => r.owes).map((r) => r.customerId)).size,
  };

  /* Oldest promise first: overdue by how late, then by the date it falls due,
     then the settled ones at the bottom where they are history. */
  rows.sort((a, b) => {
    if (a.owes !== b.owes) return a.owes ? -1 : 1;
    const ad = a.dueAt?.getTime() ?? Number.POSITIVE_INFINITY;
    const bd = b.dueAt?.getTime() ?? Number.POSITIVE_INFINITY;
    return ad - bd || a.issuedAt.getTime() - b.issuedAt.getTime();
  });

  return { rows, overview };
}

export function dueLabel(row: CreditRow): string {
  if (!row.owes) return "settled";
  if (row.daysToDue === null) return "no due date";
  if (row.daysLate > 0) return `${row.daysLate} day${row.daysLate === 1 ? "" : "s"} late`;
  if (row.daysToDue === 0) return "due today";
  if (row.daysToDue === 1) return "due tomorrow";
  return `due in ${row.daysToDue} days`;
}

export type PendingCreditRequest = {
  auditId: string;
  invoiceId: string;
  invoiceNumber: string;
  cargoId: string;
  cargoReference: string;
  customerName: string;
  phone: string;
  days: number;
  reason: string;
  askedBy: string | null;
  askedAt: Date;
  /** What the whole consignment owes — what a release would let go. */
  cargoOwedLabel: string;
};

/**
 * QUESTIONS FINANCE HAS NOT ANSWERED.
 *
 * A request is the audit line Support wrote when they asked. It stops waiting
 * the moment the cargo has a pickup note written after it — on credit or paid
 * in full, either way Finance has answered — or when the bills on the cargo are
 * settled and there is nothing left to give credit on.
 */
export async function pendingCreditRequests(): Promise<PendingCreditRequest[]> {
  const logs = await prisma.auditLog.findMany({
    where: { action: "credit.request", entity: "Invoice" },
    orderBy: { createdAt: "desc" },
    take: 300,
    include: { actor: { select: { name: true } } },
  });

  /* The newest ask per bill. An older one on the same bill is the same question. */
  const latest = new Map<string, (typeof logs)[number]>();
  for (const log of logs) {
    if (log.entityId && !latest.has(log.entityId)) latest.set(log.entityId, log);
  }
  if (latest.size === 0) return [];

  const invoices = await prisma.invoice.findMany({
    where: { id: { in: [...latest.keys()] }, status: { in: ["ISSUED", "PARTIALLY_PAID", "OVERDUE"] } },
    include: {
      customer: { select: { fullName: true, businessName: true, phone: true } },
      cargo: {
        select: {
          id: true,
          reference: true,
          deletedAt: true,
          pickupNote: { select: { status: true, issuedAt: true } },
          invoices: {
            where: { status: { notIn: ["DRAFT", "CANCELLED"] } },
            include: { payments: true },
          },
        },
      },
    },
  });

  const out: PendingCreditRequest[] = [];
  for (const invoice of invoices) {
    const log = latest.get(invoice.id);
    if (!log || invoice.cargo.deletedAt) continue;
    const note = invoice.cargo.pickupNote;
    if (note?.status === "ACTIVE") continue;
    if (note && note.issuedAt >= log.createdAt) continue;
    const owed = owedAcross(invoice.cargo.invoices);
    if (!owed.owes) continue;

    const meta = (log.metadata ?? {}) as { days?: unknown; reason?: unknown };
    out.push({
      auditId: log.id,
      invoiceId: invoice.id,
      invoiceNumber: invoice.number,
      cargoId: invoice.cargo.id,
      cargoReference: invoice.cargo.reference,
      customerName: invoice.customer.businessName || invoice.customer.fullName,
      phone: invoice.customer.phone,
      days: Number(meta.days) || 14,
      reason: typeof meta.reason === "string" ? meta.reason : "",
      askedBy: log.actor?.name ?? log.actorEmail,
      askedAt: log.createdAt,
      cargoOwedLabel: owed.primary,
    });
  }

  /* Longest waiting first — that customer has been at the counter longest. */
  return out.sort((a, b) => a.askedAt.getTime() - b.askedAt.getTime());
}
