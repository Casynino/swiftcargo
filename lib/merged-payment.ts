import "server-only";

import { Prisma } from "@prisma/client";

import { COMPANY } from "@/lib/constants";
import { formatDate } from "@/lib/format";
import { balanceOf, invoiceRate } from "@/lib/invoice-balance";
import { messageStage, trackUrl } from "@/lib/messages";
import { prisma } from "@/lib/prisma";
import { storageStart, storageState } from "@/lib/storage-clock";
import { trackKey } from "@/lib/track-key";

/**
 * A GROUP OF BILLS A CUSTOMER IS ABOUT TO PAY TOGETHER, READ LIVE.
 *
 * There is no row for "this merge" anywhere — CLAUDE.md is explicit that money
 * is derived, never stored. What names the group is the set of invoice ids a
 * clerk ticked on the Merge Payment screen; this reads those invoices back and
 * works out what to tell the customer about them, every time, from what is
 * true right now. Called before any payment exists (the ordinary case — this
 * is the "please pay" notice) and it reads exactly as truly after one does,
 * because "outstanding" and "settled" are derived, not remembered.
 */
export type MergedGroupLine = {
  cargoId: string;
  reference: string;
  description: string;
  invoiceId: string;
  outstandingTzs: string | null;
  outstanding: string;
  currency: string;
};

export type MergedGroup = {
  /** Sorted, joined invoice ids — the identity of this group and what is signed. */
  key: string;
  customerId: string;
  customerName: string;
  customerPhone: string | null;
  lines: MergedGroupLine[];
  totalCargo: number;
  totalPieces: number;
  totalCbm: string;
  containers: string[];
  statusLine: string;
  totalOutstandingTzs: string;
  totalOutstandingUsd: string | null;
  fxRate: string | null;
  /** Every line's own bill fully covered by verified money. */
  settled: boolean;
  /** Something has landed, but not enough to settle every line. */
  partlyPaid: boolean;
  freeStorageDays: number;
  /** The soonest free-storage deadline among the lines whose clock is running. */
  storageDeadline: Date | null;
};

const STAGE_ORDER = ["china", "transit", "clearance", "cleared", "ready"] as const;
const STAGE_LABEL: Record<(typeof STAGE_ORDER)[number], string> = {
  china: "Received in China",
  transit: "In transit",
  clearance: "Clearance in Progress",
  cleared: "Cleared — Ready for Pickup",
  ready: "Cleared — Ready for Pickup",
};

/** The identity of a group, from the invoice ids a clerk ticked. */
export function mergedGroupKey(invoiceIds: string[]): string {
  return [...new Set(invoiceIds)].sort().join(",");
}

/**
 * Reads the ticked invoices back, with the cargo and customer each one
 * belongs to, and works out one story to tell about all of them. Returns null
 * for fewer than two invoices (a "group" of one is just that invoice), or one
 * spanning more than one customer (never true from the form, checked anyway
 * because this is also read from a link nobody has to have clicked honestly).
 */
export async function mergedGroupByInvoiceIds(
  invoiceIds: string[]
): Promise<MergedGroup | null> {
  const ids = [...new Set(invoiceIds)];
  if (ids.length < 2) return null;

  const [invoices, settings] = await Promise.all([
    prisma.invoice.findMany({
      where: { id: { in: ids } },
      include: {
        customer: { select: { id: true, fullName: true, phone: true } },
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
        cargo: {
          select: {
            id: true,
            reference: true,
            description: true,
            status: true,
            clearedAt: true,
            darReceiving: {
              select: { piecesCount: true, cbm: true, receivedAt: true },
            },
            chinaReceiving: { select: { piecesCount: true, cbm: true } },
            containerLines: {
              take: 1,
              orderBy: { createdAt: "desc" },
              select: { container: { select: { reference: true } } },
            },
          },
        },
      },
    }),
    prisma.companySetting.findUnique({
      where: { id: "singleton" },
      select: { freeStorageDays: true },
    }),
  ]);
  if (invoices.length < 2) return null;
  if (new Set(invoices.map((i) => i.customerId)).size !== 1) return null;

  const freeStorageDays = settings?.freeStorageDays ?? 7;
  const first = invoices[0]!;

  const lines: MergedGroupLine[] = invoices.map((invoice) => {
    const bal = balanceOf(invoice);
    return {
      cargoId: invoice.cargo.id,
      reference: invoice.cargo.reference,
      description: invoice.cargo.description ?? "",
      invoiceId: invoice.id,
      outstandingTzs: bal.outstandingTzs?.toFixed(0) ?? null,
      outstanding: bal.outstanding.toFixed(2),
      currency: invoice.currency,
    };
  });

  const totalOutstandingTzs = invoices
    .map((i) => balanceOf(i).outstandingTzs)
    .reduce<Prisma.Decimal>(
      (sum, tzs) => (tzs ? sum.add(tzs) : sum),
      new Prisma.Decimal(0)
    );
  const rateStrings = new Set(
    invoices.map((i) => invoiceRate(i)?.toString() ?? null).filter(Boolean)
  );
  const oneRate = rateStrings.size === 1 ? [...rateStrings][0]! : null;
  const totalOutstandingUsd = oneRate
    ? totalOutstandingTzs.div(oneRate).toDecimalPlaces(2).toString()
    : null;

  const settled = invoices.every((i) => balanceOf(i).settled);
  const paidSomething = invoices.some((i) => balanceOf(i).paid.greaterThan(0));

  const totalPieces = invoices.reduce(
    (sum, i) =>
      sum + (i.cargo.darReceiving?.piecesCount ?? i.cargo.chinaReceiving?.piecesCount ?? 0),
    0
  );
  const totalCbm = invoices
    .reduce((sum, i) => {
      const cbm = i.cargo.darReceiving?.cbm ?? i.cargo.chinaReceiving?.cbm ?? null;
      return cbm ? sum.add(cbm) : sum;
    }, new Prisma.Decimal(0))
    .toFixed(3);
  const containers = [
    ...new Set(
      invoices
        .map((i) => i.cargo.containerLines[0]?.container.reference)
        .filter((ref): ref is string => Boolean(ref))
    ),
  ];

  const stages = invoices.map((i) =>
    messageStage({
      status: i.cargo.status,
      hasDarReceiving: Boolean(i.cargo.darReceiving),
      clearedAt: i.cargo.clearedAt,
    })
  );
  const worst = STAGE_ORDER.find((s) => stages.includes(s)) ?? "transit";

  const deadlines = invoices
    .map((i) => {
      const from = storageStart(i.cargo.darReceiving?.receivedAt ?? null, i.cargo.clearedAt);
      if (!from) return null;
      return storageState({
        arrivedAt: from,
        freeDays: freeStorageDays,
        perDay: null,
        currency: "USD",
        now: new Date(),
      }).lastFreeDay;
    })
    .filter((d): d is Date => d !== null);
  const storageDeadline =
    deadlines.length > 0
      ? new Date(Math.min(...deadlines.map((d) => d.getTime())))
      : null;

  return {
    key: mergedGroupKey(ids),
    customerId: first.customer.id,
    customerName: first.customer.fullName,
    customerPhone: first.customer.phone,
    lines,
    totalCargo: invoices.length,
    totalPieces,
    totalCbm,
    containers,
    statusLine: STAGE_LABEL[worst],
    totalOutstandingTzs: totalOutstandingTzs.toFixed(0),
    totalOutstandingUsd,
    fxRate: oneRate,
    settled,
    partlyPaid: !settled && paidSomething,
    freeStorageDays,
    storageDeadline,
  };
}

/** The signed link a customer's merged notification carries. */
export function mergedTrackLink(key: string): string {
  return `${trackUrl()}/merged/${encodeURIComponent(key)}?k=${trackKey(key)}`;
}

/** The signed link to the combined PDF for the same group. */
export function mergedInvoiceLink(key: string): string {
  return `${trackUrl()}/merged/${encodeURIComponent(key)}/invoice?k=${trackKey(key)}`;
}

const money = (n: Prisma.Decimal.Value) => Number(n).toLocaleString("en-US");
const usd = (n: Prisma.Decimal.Value) =>
  Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * THE NOTICE, BEFORE THE MONEY MOVES.
 *
 * Every bill a customer ticked, in one message: what each cargo is, what the
 * whole group comes to, and the two links — one to track all of it, one to
 * download it as a single PDF. "Hali ya malipo" reads straight off the
 * invoices, so a message sent after the payment lands still tells the truth.
 */
export function composeMergedMessage(group: MergedGroup): string {
  const name = group.customerName.split(" ")[0] ?? group.customerName;
  const lines = group.lines.map(
    (l) => `• ${l.reference} — ${l.description}: TZS ${money(l.outstandingTzs ?? l.outstanding)}`
  );
  const trackLink = mergedTrackLink(group.key);
  const invoiceLink = mergedInvoiceLink(group.key);
  const status = group.settled ? "Imelipwa" : group.partlyPaid ? "Malipo sehemu" : "Haijalipwa";
  const deadline = group.storageDeadline
    ? `, hadi ${formatDate(group.storageDeadline)}`
    : "";

  return (
    `*${COMPANY.name.toUpperCase()}*\n\n` +
    `Habari ${name}!\n\n` +
    `Mizigo yako ${group.totalCargo} yamewekwa kwenye bili moja ya malipo ili ulipe kwa muamala mmoja. ` +
    `Kila mzigo unabaki na namba yake ya kufuatilia.\n\n` +
    `*MIZIGO ILIYOMO (${group.totalCargo})*\n` +
    `${lines.join("\n")}\n\n` +
    `*MAELEZO YA MZIGO*\n` +
    `• Mizigo: ${group.totalCargo}\n` +
    `• Vipande: ${group.totalPieces}\n` +
    `• Ujazo: ${group.totalCbm} CBM\n` +
    `• Kontena: ${group.containers.length > 0 ? group.containers.join(", ") : "—"}\n` +
    `• Status: ${group.statusLine}\n\n` +
    `*MALIPO*\n` +
    `• Kiasi cha kulipa: TZS ${money(group.totalOutstandingTzs)}\n` +
    (group.totalOutstandingUsd ? `• Sawa na: USD ${usd(group.totalOutstandingUsd)}\n` : "") +
    (group.fxRate ? `• Exchange Rate: 1 USD = ${money(group.fxRate)} TZS\n` : "") +
    `• Hali ya malipo: ${status}\n\n` +
    `*STORAGE:* Una siku ${group.freeStorageDays} bure za kuhifadhiwa kwenye warehouse yetu ` +
    `Dar es Salaam${deadline}. Baada ya hapo storage charges zinaweza kutozwa.\n\n` +
    `*Fuatilia mizigo yako yote:*\n${trackLink}\n\n` +
    `*Pakua invoice ya pamoja (PDF):*\n${invoiceLink}`
  );
}
