import { accountPositions } from "@/lib/accounts";
import { balanceOf, outstandingOf } from "@/lib/invoice-balance";
import { prisma } from "@/lib/prisma";

/**
 * THE BOOKS, READ ONCE, FOR EVERY REPORT.
 *
 * The profit & loss page, the printed statement and every download are views
 * of this one load. There is no separate set of books: each figure is derived
 * from the operational record — bills, verified payments, costs, accounts —
 * at read time, so the page, the PDF and the spreadsheet cannot disagree.
 *
 * Every money figure is carried as a pair: dollars, which is what a bill says,
 * and shillings, which is what the business counts. Each record converts at
 * the rate pinned on IT; only a record with no rate falls back to today's.
 */
export type Money = { usd: number; tzs: number };
export const ZERO: Money = { usd: 0, tzs: 0 };
export const add = (a: Money, b: Money): Money => ({ usd: a.usd + b.usd, tzs: a.tzs + b.tzs });
export const sub = (a: Money, b: Money): Money => ({ usd: a.usd - b.usd, tzs: a.tzs - b.tzs });
export const sum = <T>(rows: T[], pick: (r: T) => Money) =>
  rows.reduce((acc, r) => add(acc, pick(r)), ZERO);

export const PERIODS = {
  today: "Today",
  week: "This week",
  month: "This month",
  quarter: "This quarter",
  year: "This year",
} as const;
export type PeriodKey = keyof typeof PERIODS;

export type Range = { from: Date; to: Date; label: string };

const MONTH = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric" });

export function periodRange(key: PeriodKey, now = new Date()): { current: Range; previous: Range } {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  let from: Date;
  let to: Date;
  let prevFrom: Date;
  if (key === "today") {
    from = start;
    to = new Date(start.getTime() + 86_400_000);
    prevFrom = new Date(start.getTime() - 86_400_000);
  } else if (key === "week") {
    const day = (start.getDay() + 6) % 7; // Monday first
    from = new Date(start.getTime() - day * 86_400_000);
    to = new Date(from.getTime() + 7 * 86_400_000);
    prevFrom = new Date(from.getTime() - 7 * 86_400_000);
  } else if (key === "month") {
    from = new Date(start.getFullYear(), start.getMonth(), 1);
    to = new Date(start.getFullYear(), start.getMonth() + 1, 1);
    prevFrom = new Date(start.getFullYear(), start.getMonth() - 1, 1);
  } else if (key === "quarter") {
    const q = Math.floor(start.getMonth() / 3) * 3;
    from = new Date(start.getFullYear(), q, 1);
    to = new Date(start.getFullYear(), q + 3, 1);
    prevFrom = new Date(start.getFullYear(), q - 3, 1);
  } else {
    from = new Date(start.getFullYear(), 0, 1);
    to = new Date(start.getFullYear() + 1, 0, 1);
    prevFrom = new Date(start.getFullYear() - 1, 0, 1);
  }
  const label = (f: Date, t: Date) =>
    key === "month"
      ? MONTH.format(f)
      : key === "year"
        ? String(f.getFullYear())
        : key === "quarter"
          ? `Q${Math.floor(f.getMonth() / 3) + 1} ${f.getFullYear()}`
          : `${f.toLocaleDateString("en-GB", { day: "2-digit", month: "short" })} – ${new Date(t.getTime() - 1).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}`;
  return {
    current: { from, to, label: label(from, to) },
    previous: { from: prevFrom, to: from, label: label(prevFrom, from) },
  };
}

/** A calendar month, for the statement and the month-by-month views. */
export function monthRange(year: number, month: number): Range {
  const from = new Date(year, month, 1);
  return { from, to: new Date(year, month + 1, 1), label: MONTH.format(from) };
}

export const within = (d: Date | null | undefined, r: { from: Date; to: Date }) =>
  !!d && d >= r.from && d < r.to;

export async function loadBooks() {
  const [invoices, payments, expenses, containers, china, dar, positions, rate] =
    await Promise.all([
      prisma.invoice.findMany({
        where: { status: { notIn: ["DRAFT", "CANCELLED"] } },
        include: {
          payments: true,
          items: { select: { category: true, amount: true } },
          customer: { select: { id: true, fullName: true, businessName: true } },
          cargo: {
            select: {
              id: true,
              reference: true,
              pickupNote: { select: { onCredit: true, status: true, usedAt: true } },
              darReceiving: { select: { cbm: true } },
              containerLines: {
                take: 1,
                orderBy: { createdAt: "desc" },
                select: { containerId: true },
              },
            },
          },
        },
      }),
      prisma.payment.findMany({
        /* Money that arrived. A written-off shortfall settles a bill and is
           not income or cash. */
        where: { status: "VERIFIED", writtenOff: false },
        include: {
          customer: { select: { fullName: true, businessName: true } },
          account: { select: { bankName: true, currency: true, kind: true } },
          invoice: { select: { number: true, currency: true, cargo: { select: { reference: true } } } },
        },
      }),
      prisma.containerExpense.findMany({
        where: { deletedAt: null, cancelledAt: null },
        include: {
          expenseType: { select: { name: true } },
          account: { select: { bankName: true, currency: true } },
          container: { select: { reference: true } },
          vendor: { select: { name: true } },
        },
      }),
      prisma.container.findMany({
        where: { deletedAt: null },
        include: {
          shipment: { select: { vessel: true, departureDate: true, actualArrival: true, originPort: true } },
          _count: { select: { cargoLines: true } },
        },
      }),
      prisma.chinaReceiving.findMany({
        select: { receivedAt: true, cbm: true, packagesCount: true, cargo: { select: { deletedAt: true } } },
      }),
      prisma.darReceiving.findMany({
        select: { receivedAt: true, cbm: true, containerId: true },
      }),
      accountPositions(),
      prisma.exchangeRate.findFirst({
        where: { active: true },
        orderBy: { effectiveFrom: "desc" },
        select: { rate: true, effectiveFrom: true },
      }),
    ]);

  const today = rate ? Number(rate.rate) : 0;
  const rateOf = (fx: unknown) => (Number(fx) > 1 ? Number(fx) : today);

  const bills = invoices.map((i) => {
    const r = rateOf(i.fxRate);
    const pair = (n: number): Money =>
      i.currency === "USD" ? { usd: n, tzs: n * r } : { usd: r ? n / r : 0, tzs: n };
    const balance = balanceOf(i);
    const owing = Number(balance.outstanding);
    const verified = i.payments.filter((p) => p.status === "VERIFIED");
    return {
      id: i.id,
      number: i.number,
      at: i.issuedAt ?? i.createdAt,
      dueAt: i.dueAt,
      customerId: i.customer.id,
      customer: i.customer.businessName || i.customer.fullName,
      cargo: i.cargo.reference,
      containerId: i.cargo.containerLines[0]?.containerId ?? null,
      /* The bill's own shilling figures, not dollars times a rate again. */
      total: balance.totalTzs ? { usd: Number(i.total), tzs: balance.totalTzs.toNumber() } : pair(Number(i.total)),
      owing: balance.outstandingTzs ? { usd: owing, tzs: balance.outstandingTzs.toNumber() } : pair(owing),
      discount: pair(Number(i.discount)),
      storage: pair(
        i.items.filter((it) => it.category === "Storage").reduce((s, it) => s + Number(it.amount), 0)
      ),
      cbm: Number(i.billableCbm ?? i.cargo.darReceiving?.cbm ?? 0),
      credit: Boolean(i.cargo.pickupNote?.onCredit),
      collectedAt: i.cargo.pickupNote?.status === "USED" ? i.cargo.pickupNote.usedAt : null,
      paid: balance.settled,
      partPaid: !balance.settled && verified.length > 0,
      toVerify: i.payments.some((p) => p.status === "PENDING"),
    };
  });

  const money = payments.map((p) => {
    const r = rateOf(p.fxRate);
    const n = Number(p.amount);
    return {
      id: p.id,
      reference: p.reference,
      at: p.paidAt ?? p.createdAt,
      customer: p.customer.businessName || p.customer.fullName,
      invoice: p.invoice.number,
      cargo: p.invoice.cargo.reference,
      method: p.method,
      account: p.account ? `${p.account.bankName} (${p.account.currency})` : "No account",
      accountKind: p.account?.kind ?? null,
      /* The shilling value written on the payment when it was taken. */
      amount: (p.baseCurrencyAmount
        ? { usd: p.currency === "USD" ? n : r ? Number(p.baseCurrencyAmount) / r : 0, tzs: Number(p.baseCurrencyAmount) }
        : p.currency === "USD" ? { usd: n, tzs: n * r } : { usd: r ? n / r : 0, tzs: n }) as Money,
    };
  });

  const costs = expenses.map((e) => {
    const r = rateOf(e.fxRate);
    const n = Number(e.amount);
    return {
      id: e.id,
      reference: e.reference,
      at: e.expenseDate ?? e.paidDate ?? e.createdAt,
      paid: e.accountId !== null,
      category: e.expenseType?.name ?? "Uncategorised",
      scope: e.scope,
      containerId: e.containerId,
      container: e.container?.reference ?? "",
      vendor: e.vendor?.name ?? null,
      account: e.account ? `${e.account.bankName} (${e.account.currency})` : "Not paid yet",
      description: e.description,
      amount: (e.currency === "USD" ? { usd: n, tzs: n * r } : { usd: r ? n / r : 0, tzs: n }) as Money,
    };
  });

  /* Grouped once rather than scanned per container: every sailing ever against
     every bill ever grows as the square of the business. */
  const group = <T,>(rows: T[], key: (row: T) => string | null) => {
    const map = new Map<string, T[]>();
    for (const row of rows) {
      const k = key(row);
      if (k === null) continue;
      const list = map.get(k);
      if (list) list.push(row);
      else map.set(k, [row]);
    }
    return map;
  };
  const billsByBox = group(bills, (b) => b.containerId);
  const costsByBox = group(costs, (e) => e.containerId);
  const darByBox = group(dar, (d) => d.containerId);

  const boxes = containers.map((c) => {
    const onIt = billsByBox.get(c.id) ?? [];
    const spent = sum(costsByBox.get(c.id) ?? [], (e) => e.amount);
    const billed = sum(onIt, (b) => b.total);
    const owed = sum(onIt, (b) => b.owing);
    return {
      id: c.id,
      reference: c.reference,
      status: c.status,
      from: c.shipment?.originPort ?? c.originPort ?? "Guangzhou",
      vessel: c.shipment?.vessel ?? null,
      departed: c.shipment?.departureDate ?? null,
      arrived: c.shipment?.actualArrival ?? null,
      closedAt: c.status === "CLOSED" ? c.updatedAt : null,
      cargo: c._count.cargoLines,
      cbm: (darByBox.get(c.id) ?? []).reduce((s, d) => s + Number(d.cbm ?? 0), 0),
      billed,
      collected: sub(billed, owed),
      owed,
      spent,
      profit: sub(billed, spent),
    };
  });

  return {
    today,
    rateSince: rate?.effectiveFrom ?? null,
    bills,
    money,
    costs,
    boxes,
    china: china.filter((c) => !c.cargo.deletedAt),
    dar,
    positions,
  };
}

export type Books = Awaited<ReturnType<typeof loadBooks>>;

/** Every headline figure for one stretch of time. */
export function figures(books: Books, r: Range) {
  const bills = books.bills.filter((b) => within(b.at, r));
  const money = books.money.filter((m) => within(m.at, r));
  const costs = books.costs.filter((c) => within(c.at, r));

  const revenue = sum(bills, (b) => b.total);
  const expenses = sum(costs, (c) => c.amount);
  const collected = sum(money, (m) => m.amount);
  const paidOut = sum(costs.filter((c) => c.paid), (c) => c.amount);
  const profit = sub(revenue, expenses);
  const outstanding = sum(bills, (b) => b.owing);
  const collectedOnPeriod = sub(revenue, outstanding);

  return {
    range: r,
    bills,
    money,
    costs,
    revenue,
    expenses,
    collected,
    paidOut,
    profit,
    netCash: sub(collected, paidOut),
    margin: revenue.usd > 0 ? (profit.usd / revenue.usd) * 100 : null,
    creditRevenue: sum(bills.filter((b) => b.credit), (b) => b.total),
    cashRevenue: sum(bills.filter((b) => !b.credit), (b) => b.total),
    outstanding,
    writtenOff: sum(bills, (b) => b.discount),
    storage: sum(bills, (b) => b.storage),
    collectionRate: revenue.usd > 0 ? (collectedOnPeriod.usd / revenue.usd) * 100 : null,
    expenseRatio: revenue.usd > 0 ? (expenses.usd / revenue.usd) * 100 : null,
    outstandingRatio: revenue.usd > 0 ? (outstanding.usd / revenue.usd) * 100 : null,
    cbmReceived: books.china.filter((c) => within(c.receivedAt, r)).reduce((s, c) => s + Number(c.cbm), 0),
    packages: books.china.filter((c) => within(c.receivedAt, r)).reduce((s, c) => s + c.packagesCount, 0),
    cbmLanded: books.dar.filter((d) => within(d.receivedAt, r)).reduce((s, d) => s + Number(d.cbm ?? 0), 0),
    cbmBilled: bills.reduce((s, b) => s + b.cbm, 0),
    cbmCollected: books.bills.filter((b) => within(b.collectedAt, r)).reduce((s, b) => s + b.cbm, 0),
    customers: new Set(bills.map((b) => b.customerId)).size,
    arrived: books.boxes.filter((c) => within(c.arrived, r)).length,
    closed: books.boxes.filter((c) => within(c.closedAt, r)).length,
    counts: {
      paid: bills.filter((b) => b.paid).length,
      unpaid: bills.filter((b) => !b.paid && !b.partPaid).length,
      partPaid: bills.filter((b) => b.partPaid).length,
      toVerify: bills.filter((b) => b.toVerify).length,
    },
  };
}

export type Figures = ReturnType<typeof figures>;

/** Costs grouped by what they were for, biggest first. */
export function byCategory(costs: Books["costs"]) {
  const map = new Map<string, Money>();
  for (const c of costs) map.set(c.category, add(map.get(c.category) ?? ZERO, c.amount));
  return [...map.entries()]
    .map(([name, amount]) => ({ name, amount }))
    .sort((a, b) => b.amount.usd - a.amount.usd);
}

/** Billed per customer in a stretch, with what is still owed. */
export function byCustomer(bills: Books["bills"]) {
  const map = new Map<string, { name: string; billed: Money; owed: Money }>();
  for (const b of bills) {
    const row = map.get(b.customerId) ?? { name: b.customer, billed: ZERO, owed: ZERO };
    row.billed = add(row.billed, b.total);
    row.owed = add(row.owed, b.owing);
    map.set(b.customerId, row);
  }
  return [...map.values()].sort((a, b) => b.billed.usd - a.billed.usd);
}

/** The last twelve calendar months, oldest first. */
export function twelveMonths(books: Books, now = new Date()) {
  return Array.from({ length: 12 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - 11 + i, 1);
    const r = monthRange(d.getFullYear(), d.getMonth());
    return {
      label: d.toLocaleDateString("en-GB", { month: "short" }),
      current: i === 11,
      in: sum(books.money.filter((m) => within(m.at, r)), (m) => m.amount),
      out: sum(books.costs.filter((c) => c.paid && within(c.at, r)), (c) => c.amount),
      billed: sum(books.bills.filter((b) => within(b.at, r)), (b) => b.total),
      cbm: books.dar.filter((x) => within(x.receivedAt, r)).reduce((s, x) => s + Number(x.cbm ?? 0), 0),
    };
  });
}
