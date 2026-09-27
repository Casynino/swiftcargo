import "server-only";

import { darFields } from "@/lib/dar-time";
import { balanceOf } from "@/lib/invoice-balance";
import { ledgerRows, type LedgerRow } from "@/lib/ledger";
import { prisma } from "@/lib/prisma";
import { storageStart, storageState } from "@/lib/storage-clock";

/**
 * INCOME: EVERY SHILLING CUSTOMERS HAVE PAID, AND WHERE IT LANDED.
 *
 * Read off the general ledger's own payment lines (lib/ledger.ts), so this
 * page and the ledger can never disagree about what came in: a combined
 * payment is one line, a reversed one is struck through and not counted, and
 * each is valued in shillings at the rate it was taken at. The transport fare
 * a customer adds to a payment is taken off — it leaves again to the driver,
 * so it passes through the account without being the company's income.
 */

export type IncomeSource = "LCL" | "FCL" | "CREDIT";

export const SOURCE_LABEL: Record<IncomeSource, string> = {
  LCL: "Loose cargo",
  FCL: "Full containers",
  CREDIT: "Credit settled",
};

export type IncomeRow = {
  id: string;
  at: Date;
  /** The Dar calendar day, YYYY-MM-DD. */
  day: string;
  who: string;
  whoHref: string | null;
  source: IncomeSource;
  goods: string | null;
  refs: string[];
  cargoRefs: string[];
  invoiceNumbers: string[];
  receiptNumbers: string[];
  /** What the customer handed over, in the currency they paid in. */
  tendered: { amount: number; currency: string };
  accountId: string;
  account: string;
  /** Received, in shillings, less any transport fare that passed through. */
  amount: number;
  transportTzs: number;
  counted: boolean;
  cancelledReason: string | null;
  by: string | null;
  verifiedBy: string | null;
  href: string;
  ledger: LedgerRow;
};

export function darDay(at: Date) {
  const { year, month, day } = darFields(at);
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Customer payments whose money moved between `from` (inclusive) and `to` (exclusive). */
export async function incomeRows(from: Date, to: Date): Promise<IncomeRow[]> {
  const rows = await ledgerRows();
  return rows
    .filter(
      (r) =>
        r.kind === "payment" &&
        r.direction === "IN" &&
        !r.transport &&
        r.at.getTime() >= from.getTime() &&
        r.at.getTime() < to.getTime()
    )
    .map((r) => {
      const transportTzs = r.transportTzs ?? 0;
      return {
        id: r.id,
        at: r.at,
        day: darDay(r.at),
        who: r.title,
        whoHref: r.titleHref,
        source: r.credit ? "CREDIT" : r.service === "FCL" ? "FCL" : "LCL",
        goods: r.purpose,
        refs: r.refs,
        cargoRefs: r.cargoRefs ?? [],
        invoiceNumbers: r.invoiceNumbers ?? [],
        receiptNumbers: r.receiptNumbers ?? [],
        tendered: { amount: r.amount, currency: r.currency },
        accountId: r.accountId,
        account: r.account,
        amount: Math.round(r.tzs - transportTzs),
        transportTzs,
        counted: !r.cancelled,
        cancelledReason: r.cancelledReason,
        by: r.submittedBy?.name ?? null,
        verifiedBy: r.verifiedBy?.name ?? null,
        href: r.href,
        ledger: r,
      } satisfies IncomeRow;
    })
    .sort((a, b) => b.at.getTime() - a.at.getTime());
}

/**
 * WHAT IS STILL OWED ON BILLS ALREADY SENT, MOST URGENT FIRST.
 *
 * Goods cleared in Dar with storage running come first — every day costs the
 * customer more and holds the floor — then cleared goods inside their free
 * days, cargo already let go on credit, goods at the port, at sea, and last
 * what is still in Guangzhou. It is not income until it is paid.
 */
export type CollectStage = "storage" | "cleared" | "credit" | "port" | "sea" | "china";

export type CollectRow = {
  invoiceId: string;
  invoiceNumber: string;
  customerId: string;
  customer: string;
  cargoId: string;
  cargoReference: string;
  stage: CollectStage;
  /** Storage day, for cleared goods. */
  storageDay: number | null;
  owedTzs: number;
};

const RANK: Record<CollectStage, number> = { storage: 0, cleared: 1, credit: 2, port: 3, sea: 4, china: 5 };

export async function toCollect(): Promise<CollectRow[]> {
  const [bills, settings] = await Promise.all([
    prisma.invoice.findMany({
      where: {
        status: { in: ["ISSUED", "PARTIALLY_PAID", "OVERDUE"] },
        cargo: { deletedAt: null, status: { notIn: ["CANCELLED", "MISSING_AT_DAR"] } },
      },
      select: {
        id: true,
        number: true,
        total: true,
        currency: true,
        fxRate: true,
        totalTzs: true,
        payments: {
          select: { status: true, amount: true, currency: true, fxRate: true, baseCurrencyAmount: true, creditedAmount: true },
        },
        customer: { select: { id: true, fullName: true, businessName: true } },
        cargo: {
          select: {
            id: true,
            reference: true,
            status: true,
            clearedAt: true,
            darReceiving: { select: { receivedAt: true } },
            release: { select: { id: true } },
            pickupNote: { select: { onCredit: true } },
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

  const out: CollectRow[] = [];
  for (const bill of bills) {
    const owed = balanceOf(bill).outstandingTzs;
    if (!owed || !owed.greaterThan(0)) continue;
    const c = bill.cargo;
    const gone = c.release !== null || ["COLLECTED", "DELIVERED"].includes(c.status);
    let stage: CollectStage;
    let storageDay: number | null = null;
    if (gone) {
      stage = "credit";
    } else if (c.clearedAt) {
      const start = storageStart(c.darReceiving?.receivedAt ?? null, c.clearedAt);
      const clock = start
        ? storageState({ arrivedAt: start, freeDays, perDay: null, currency: "USD", now })
        : null;
      storageDay = clock?.dayNumber ?? null;
      stage = clock?.expired ? "storage" : "cleared";
    } else if (["ARRIVED_TANZANIA", "RECEIVED_DAR", "READY_FOR_RELEASE"].includes(c.status)) {
      stage = "port";
    } else if (["DEPARTED_CHINA", "IN_TRANSIT"].includes(c.status)) {
      stage = "sea";
    } else {
      stage = "china";
    }
    out.push({
      invoiceId: bill.id,
      invoiceNumber: bill.number,
      customerId: bill.customer.id,
      customer: bill.customer.businessName || bill.customer.fullName,
      cargoId: c.id,
      cargoReference: c.reference,
      stage,
      storageDay,
      owedTzs: Number(owed),
    });
  }
  return out.sort((a, b) => RANK[a.stage] - RANK[b.stage] || b.owedTzs - a.owedTzs);
}

/**
 * WHAT THE BILLS RAISED IN A WINDOW WERE MADE OF — BILLED, NOT RECEIVED.
 *
 * A payment answers a bill, never a line on it, so no shilling received can
 * honestly be called freight or storage. The bills can: their lines say what
 * they charged. Valued in shillings at each bill's own pinned rate.
 */
export async function billedInWindow(from: Date, to: Date) {
  const items = await prisma.invoiceItem.findMany({
    where: {
      invoice: {
        status: { in: ["ISSUED", "PARTIALLY_PAID", "PAID", "OVERDUE"] },
        issuedAt: { gte: from, lt: to },
      },
    },
    select: {
      category: true,
      amount: true,
      invoice: { select: { currency: true, fxRate: true } },
    },
  });
  const sum = { freight: 0, storage: 0, other: 0 };
  for (const i of items) {
    if (i.category === "Discount") continue;
    const rate = Number(i.invoice.fxRate ?? 0);
    const tzs = i.invoice.currency === "TZS" ? Number(i.amount) : rate > 1 ? Number(i.amount) * rate : 0;
    if (i.category === "Freight") sum.freight += tzs;
    else if (i.category === "Storage") sum.storage += tzs;
    else sum.other += tzs;
  }
  return sum;
}
