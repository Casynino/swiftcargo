import "server-only";

import { SALARIES_CATEGORY } from "@/lib/payroll";
import { prisma } from "@/lib/prisma";

/**
 * WHAT THE BUSINESS PAYS FOR, READ BACK FROM WHAT IT HAS PAID.
 *
 * The record-a-cost picker offers the things this company actually spends on —
 * "Wharfage, to TPA", "Printer ink" — grouped by the categories Finance keeps.
 * Nothing is stored for it: a cost recorded once is in the list the next time,
 * because the list is the register read backwards. One cost filed three ways
 * by three people is what a free-text box produces; picking the same row twice
 * is what this is for.
 */

export type CatalogueGroup = {
  id: string;
  name: string;
  /** A sailing's cost: recording one asks which container. */
  forContainer: boolean;
};

export type CatalogueItem = {
  key: string;
  label: string;
  groupId: string | null;
  /** Who it is usually paid to, when there is somebody. */
  vendor: string | null;
  count: number;
  /** Recorded most months, about once a month — a bill, not a purchase. */
  monthly: boolean;
  lastAmount: number;
  lastCurrency: string;
  lastAt: string;
};

export async function expenseCatalogue(): Promise<{
  groups: CatalogueGroup[];
  items: CatalogueItem[];
}> {
  const [groups, rows] = await Promise.all([
    prisma.expenseType.findMany({
      where: { active: true, name: { not: SALARIES_CATEGORY } },
      orderBy: { name: "asc" },
      select: { id: true, name: true, forContainer: true },
    }),
    prisma.containerExpense.findMany({
      where: { deletedAt: null, cancelledAt: null, payrollRun: { is: null } },
      orderBy: { createdAt: "desc" },
      take: 3000,
      select: {
        description: true,
        expenseTypeId: true,
        amount: true,
        currency: true,
        createdAt: true,
        expenseDate: true,
        vendor: { select: { name: true } },
      },
    }),
  ]);
  const live = new Set(groups.map((g) => g.id));

  type Acc = CatalogueItem & { vendors: Map<string, number>; months: Set<string> };
  const byKey = new Map<string, Acc>();
  for (const r of rows) {
    const groupId = r.expenseTypeId && live.has(r.expenseTypeId) ? r.expenseTypeId : null;
    const group = groupId ? groups.find((g) => g.id === groupId) : null;
    const label = (r.description ?? "").trim().replace(/\s+/g, " ") || group?.name || "";
    if (!label || label.length > 80) continue;
    const key = `${label.toLowerCase()}|${groupId ?? ""}`;
    const at = r.expenseDate ?? r.createdAt;
    let item = byKey.get(key);
    if (!item) {
      /* Rows arrive newest first, so the first seen is the last paid. */
      item = {
        key,
        label,
        groupId,
        vendor: null,
        count: 0,
        monthly: false,
        lastAmount: Number(r.amount),
        lastCurrency: r.currency,
        lastAt: at.toISOString(),
        vendors: new Map(),
        months: new Set(),
      };
      byKey.set(key, item);
    }
    item.count++;
    item.months.add(at.toISOString().slice(0, 7));
    if (r.vendor?.name) item.vendors.set(r.vendor.name, (item.vendors.get(r.vendor.name) ?? 0) + 1);
  }

  const items = [...byKey.values()]
    .map(({ vendors, months, ...item }) => ({
      ...item,
      vendor: [...vendors.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null,
      /* Two months or more, and not much more than once in each: rent and the
         internet bill, not the ice bought every other day. */
      monthly: months.size >= 2 && item.count <= months.size * 1.5,
    }))
    .sort((a, b) => b.count - a.count || b.lastAt.localeCompare(a.lastAt));

  return { groups, items };
}
