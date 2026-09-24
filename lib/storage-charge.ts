import "server-only";

import { Prisma } from "@prisma/client";

import { recordFieldChange } from "@/lib/audit";
import { usdToTzs } from "@/lib/currency";
import { refreshInvoiceStatus } from "@/lib/invoice-status";
import { applyVat } from "@/lib/pricing";
import { prisma } from "@/lib/prisma";
import { storageStart } from "@/lib/storage-clock";
import { storagePosition } from "@/lib/storage-fee";

/**
 * STORAGE GOES ON THE BILL BY ITSELF.
 *
 * By the owner's decision: past the free days, every consignment still in Dar
 * carries one "Storage" line on its freight invoice — days beyond the free
 * ones, at the daily rate on CompanySetting — and the line grows each Dar day
 * until the goods are handed over. Nobody presses anything. The release check
 * reads the bill, so storage owed is storage paid before the goods leave.
 *
 * Run nightly just after Dar midnight (vercel.json), so the figure is right
 * for the whole working day, and again for one consignment at the counter
 * before a handover, and when a bill is issued. Safe to repeat: a line
 * already at today's figure is left alone.
 *
 * Finance can take it off (a waiver, with a reason); a waived bill is never
 * charged again unless somebody puts storage back on it by hand.
 *
 * Only issued bills are charged. A draft has not been shown to anybody; it
 * picks storage up on the day it is issued.
 */

const GONE = ["COLLECTED", "DELIVERED", "CANCELLED", "MISSING_AT_DAR"] as const;

export async function accrueStorage(
  options: { cargoIds?: string[]; now?: Date } = {}
): Promise<{ checked: number; charged: string[] }> {
  const now = options.now ?? new Date();
  const settings = await prisma.companySetting.findUnique({
    where: { id: "singleton" },
    select: { freeStorageDays: true, storagePerDay: true, storageCurrency: true },
  });
  const perDay = settings?.storagePerDay ?? new Prisma.Decimal(0);
  /* A rate nobody has set is never charged. */
  if (!new Prisma.Decimal(perDay).greaterThan(0)) return { checked: 0, charged: [] };
  const freeDays = settings?.freeStorageDays ?? 7;
  const currency = settings?.storageCurrency ?? "USD";
  /* A generous cut; the exact Dar-calendar test is storagePosition's. */
  const before = new Date(now.getTime() - (freeDays - 1) * 86_400_000);

  const cargo = await prisma.cargo.findMany({
    where: {
      ...(options.cargoIds ? { id: { in: options.cargoIds } } : {}),
      deletedAt: null,
      status: { notIn: [...GONE] },
      release: { is: null },
      clearedAt: { not: null, lte: before },
    },
    select: {
      id: true,
      clearedAt: true,
      darReceiving: { select: { receivedAt: true } },
      invoices: {
        where: { status: { notIn: ["DRAFT", "CANCELLED"] } },
        select: {
          id: true,
          currency: true,
          issuedAt: true,
          storageWaivedAt: true,
          items: { where: { category: "Storage" }, select: { id: true } },
        },
      },
    },
    take: 2000,
  });

  const charged: string[] = [];
  for (const row of cargo) {
    const start = storageStart(row.darReceiving?.receivedAt ?? null, row.clearedAt);
    if (!start) continue;
    const position = storagePosition({
      receivedAt: start,
      collectedAt: null,
      freeDays,
      perDay,
      currency,
    });
    if (position.chargeableDays <= 0) continue;

    /* One consignment, one storage line. A consignment split across two
       sailings has two bills; the rent goes on the one already carrying it,
       else the latest. Never onto a bill in another currency. */
    const bills = row.invoices.filter((i) => i.currency === currency);
    if (bills.length === 0 || bills.some((i) => i.storageWaivedAt)) continue;
    const bill =
      bills.find((i) => i.items.length > 0) ??
      bills.slice().sort((a, b) => (b.issuedAt?.getTime() ?? 0) - (a.issuedAt?.getTime() ?? 0))[0];

    if (await chargeBill(bill.id, position)) charged.push(bill.id);
  }
  return { checked: cargo.length, charged };
}

async function chargeBill(
  invoiceId: string,
  position: ReturnType<typeof storagePosition>
): Promise<boolean> {
  const changed = await prisma.$transaction(async (tx) => {
    /* Two runs at once — the nightly job and a handover — must not both add a
       line. The row lock makes the second wait and then find it done. */
    await tx.$queryRaw`SELECT id FROM "Invoice" WHERE id = ${invoiceId} FOR UPDATE`;
    const invoice = await tx.invoice.findUnique({
      where: { id: invoiceId },
      include: { items: { where: { category: "Storage" }, orderBy: { createdAt: "asc" } } },
    });
    if (!invoice || invoice.storageWaivedAt) return false;
    if (invoice.status === "DRAFT" || invoice.status === "CANCELLED") return false;

    const [line, ...extra] = invoice.items;
    if (
      line &&
      extra.length === 0 &&
      line.quantity.equals(position.chargeableDays) &&
      line.unitPrice.equals(position.perDay)
    ) {
      return false;
    }

    const before = invoice.items.reduce((sum, i) => sum.add(i.amount), new Prisma.Decimal(0));
    const subtotal = invoice.subtotal.sub(before).add(position.amount);
    const { vatAmount, total } = applyVat(subtotal, invoice.vatPercent, invoice.vatInclusive);
    const data = {
      description: `Storage — ${position.chargeableDays} day(s) beyond ${position.freeDays} free`,
      quantity: new Prisma.Decimal(position.chargeableDays),
      unit: "day",
      unitPrice: position.perDay,
      amount: position.amount,
      category: "Storage",
      taxable: true,
    };

    await recordFieldChange(
      {
        actor: null,
        entity: "Invoice",
        entityId: invoice.id,
        field: "storage",
        oldValue: line ? `${line.quantity} day(s) · ${invoice.currency} ${before}` : "none",
        newValue: `${position.chargeableDays} day(s) · ${invoice.currency} ${position.amount}`,
        reason: "Storage beyond the free days, charged automatically",
      },
      tx
    );
    /* Storage is owed at collection, not by the freight's due date. A bill
       paid on time must not turn overdue the night storage lands on it — that
       would put a customer who paid on the credit and overdue reports. */
    const settledBefore = invoice.status === "PAID" && invoice.dueAt !== null;
    if (settledBefore) {
      await recordFieldChange(
        {
          actor: null,
          entity: "Invoice",
          entityId: invoice.id,
          field: "dueAt",
          oldValue: invoice.dueAt?.toISOString() ?? null,
          newValue: "On collection",
          reason: "Freight paid; storage is due when the goods are collected",
        },
        tx
      );
    }
    if (extra.length > 0) {
      await tx.invoiceItem.deleteMany({ where: { id: { in: extra.map((i) => i.id) } } });
    }
    if (line) {
      await tx.invoiceItem.update({ where: { id: line.id }, data });
    } else {
      await tx.invoiceItem.create({ data: { ...data, invoiceId: invoice.id } });
    }
    await tx.invoice.update({
      where: { id: invoice.id },
      data: {
        subtotal,
        vatAmount,
        total,
        totalTzs: invoice.fxRate ? usdToTzs(total, invoice.fxRate) : null,
        ...(settledBefore ? { dueAt: null } : {}),
      },
    });
    return true;
  });
  /* A bill paid in full yesterday owes today's storage: PAID goes back to
     part paid, and the release check follows the bill. */
  if (changed) await refreshInvoiceStatus(invoiceId);
  return changed;
}

/**
 * Accrue before a handover, never failing it: a hiccup here leaves the bill
 * at last night's figure, which the release check still reads.
 */
export async function accrueStorageQuietly(cargoIds: string[]) {
  if (cargoIds.length === 0) return;
  try {
    await accrueStorage({ cargoIds });
  } catch (error) {
    console.error("Storage accrual failed", error);
  }
}
