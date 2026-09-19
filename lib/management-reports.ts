import "server-only";

import { Prisma } from "@prisma/client";

import { accountRegister } from "@/lib/accounts";
import { creditBook, type CreditRow } from "@/lib/credit";
import {
  loadBooks,
  monthRange,
  periodRange,
  sum,
  within,
  type Books,
  type Money,
  type Range,
} from "@/lib/finance-report";
import { isUsableRate, usdToTzs } from "@/lib/currency";
import { runTotals } from "@/lib/payroll";
import { prisma } from "@/lib/prisma";
import { buildReport, type Cell, type ReportTable } from "@/lib/report-tables";
import { storagePosition } from "@/lib/storage-fee";
import { storageStart } from "@/lib/storage-clock";

import { darFields, darStartOfDay, darStartOfMonth } from "@/lib/dar-time";
/**
 * EVERY REPORT THE MANAGER CAN HAND OVER, ON THE BOOKS FINANCE ALREADY KEEPS.
 *
 * The tables Finance downloads are reused as they are wherever one already
 * answers the question (lib/report-tables.ts), so a figure the manager hands
 * over and a figure Finance hands over cannot differ. The rest are built here
 * from the same sources: lib/finance-report.ts for bills, money and costs,
 * lib/credit.ts for the credit book, lib/accounts.ts for the register.
 *
 * Money leads in shillings. Each record converts at the rate pinned on it; a
 * register row stays in the account's own currency, because a ledger that
 * restated dollars at today's rate would no longer match the bank statement it
 * is read against.
 */

export type ManagementReport = ReportTable & {
  /** Set when the report is an as-at-today reading that no period narrows. */
  asAt?: boolean;
};

type Entry = { key: string; label: string; ask: string };

export const MANAGEMENT_SHELVES: { name: string; reports: Entry[] }[] = [
  {
    name: "Profit, revenue and expense",
    reports: [
      { key: "profit-loss", label: "Profit & loss", ask: "Did the period make money once every cost is counted?" },
      { key: "income", label: "Income", ask: "What was billed, what was paid, what is still owed — bill by bill." },
      { key: "expenses", label: "Expenses", ask: "Every cost recorded, what it was for and which account paid it." },
      { key: "expenses-by-category", label: "Expenses by category", ask: "Where the money goes, grouped, biggest first." },
      { key: "monthly-summary", label: "Monthly summary", ask: "Month against month: billed, collected, spent, kept." },
      { key: "cash-flow", label: "Cash flow", ask: "What came in, what went out, what is left." },
      { key: "position-summary", label: "Position summary", ask: "Where the company stands: cash, owed to us, owed by us." },
    ],
  },
  {
    name: "Collection and credit",
    reports: [
      { key: "credit-sales", label: "Credit sales", ask: "What left on a promise instead of on payment." },
      { key: "credit-collection", label: "Credit collection", ask: "How much of the credit given has been collected." },
      { key: "credit-outstanding", label: "Credit outstanding", ask: "Credit that has not come back yet." },
      { key: "credit-overdue", label: "Credit overdue", ask: "Credit past its due date — who to ring first." },
      { key: "credit-aging", label: "Credit aging", ask: "How long the unpaid credit has been unpaid." },
      { key: "credit-by-container", label: "Credit by container", ask: "Which containers went out on credit." },
      { key: "credit-by-month", label: "Credit by month", ask: "The credit book month by month." },
    ],
  },
  {
    name: "Customers",
    reports: [
      { key: "credit-customers", label: "Credit customers", ask: "Each customer's limit, what is used, what is left." },
      { key: "receivable", label: "Accounts receivable", ask: "Who owes us, and how old the oldest of it is." },
      { key: "outstanding-payments", label: "Outstanding customer payments", ask: "Which bills are unpaid, customer by customer." },
    ],
  },
  {
    name: "Cargo and warehouse",
    reports: [
      { key: "container-profitability", label: "Container profitability", ask: "What each container earned against what it cost to move." },
      { key: "storage", label: "Warehouse storage", ask: "What is sitting in the warehouse, how long, and what it is charging." },
    ],
  },
  {
    name: "Staff and payroll",
    reports: [
      { key: "payroll", label: "Payroll", ask: "Every salary run and where it stopped." },
      { key: "staff", label: "Staff register", ask: "Everybody with a live account, what they do and what they are paid." },
    ],
  },
  {
    name: "Accounts",
    reports: [
      { key: "ledger", label: "General ledger", ask: "Every movement of money in the order it happened." },
      { key: "bank", label: "Bank accounts", ask: "Every movement through a bank account." },
      { key: "mobile-money", label: "Mobile money", ask: "Every movement through M-Pesa, Mixx and the rest." },
      { key: "cash", label: "Cash and petty cash", ask: "Every movement of physical cash, and what the tin should hold." },
    ],
  },
];

export const MANAGEMENT_REPORT_KEYS = MANAGEMENT_SHELVES.flatMap((s) => s.reports.map((r) => r.key));

/* ------------------------------------------------------------------ periods */

export const MANAGEMENT_PERIODS = {
  month: "This month",
  "last-month": "Last month",
  quarter: "This quarter",
  year: "This year",
  custom: "Custom",
} as const;
export type ManagementPeriod = keyof typeof MANAGEMENT_PERIODS;

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const DAY = 86_400_000;

/**
 * The period the page shows and every download reads, from one address.
 *
 * A custom window is inclusive of its closing day: somebody choosing the 31st
 * means the whole of it, and every filter here compares with "before".
 */
export function managementPeriod(sp: Record<string, string | undefined>, now = new Date()) {
  const asked = sp.period && sp.period in MANAGEMENT_PERIODS ? (sp.period as ManagementPeriod) : "month";
  const from = sp.from && ISO.test(sp.from) ? new Date(`${sp.from}T00:00:00`) : null;
  const to = sp.to && ISO.test(sp.to) ? new Date(`${sp.to}T00:00:00`) : null;
  const key: ManagementPeriod = asked === "custom" && !from && !to ? "month" : asked;

  if (key === "custom") {
    const start = from ?? darStartOfMonth(now);
    const end = to ? new Date(to.getTime() + DAY) : new Date(darStartOfDay(now).getTime() + DAY);
    const span = Math.max(DAY, end.getTime() - start.getTime());
    const fmt = (d: Date) => d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
    return {
      key,
      from: sp.from ?? "",
      to: sp.to ?? "",
      current: { from: start, to: end, label: `${fmt(start)} – ${fmt(new Date(end.getTime() - 1))}` } as Range,
      previous: {
        from: new Date(start.getTime() - span),
        to: start,
        label: "the same length before",
      } as Range,
    };
  }
  if (key === "last-month") {
    const here = darFields(now);
    const current = monthRange(here.year, here.month - 1);
    const previous = monthRange(here.year, here.month - 2);
    return { key, from: "", to: "", current, previous };
  }
  const { current, previous } = periodRange(key, now);
  return { key, from: "", to: "", current, previous };
}

/** The query string a download carries, so the file covers what the page covers. */
export function periodQuery(p: ReturnType<typeof managementPeriod>) {
  const q = new URLSearchParams({ period: p.key });
  if (p.key === "custom") {
    if (p.from) q.set("from", p.from);
    if (p.to) q.set("to", p.to);
  }
  return q.toString();
}

/* ------------------------------------------------------------------ helpers */

const d = (x: Date | null | undefined) =>
  x ? x.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "";
const tzs = (m: Money) => Math.round(m.tzs);
const dec = (n: Prisma.Decimal) => Math.round(n.toNumber());
const T = (label: string) => ({ label: `${label} (TZS)`, money: true });
const N = (label: string) => ({ label, numeric: true });
const pct = (part: number, whole: number) => (whole > 0 ? `${Math.round((part / whole) * 100)}%` : "—");

/** A balance held in dollars, in shillings at today's rate — or null with no rate. */
function balanceTzs(balance: number, currency: string, today: number) {
  if (currency === "TZS") return Math.round(balance);
  return isUsableRate(today) ? usdToTzs(balance, today).toNumber() : null;
}

function monthsCovering(range: Range) {
  const months: Range[] = [];
  let cursor = darStartOfMonth(range.from);
  while (cursor < range.to && months.length < 36) {
    const civil = darFields(cursor);
    months.push(monthRange(civil.year, civil.month));
    cursor = darStartOfMonth(cursor, 1);
  }
  return months;
}

const creditTotals = (rows: CreditRow[]) =>
  rows.reduce(
    (acc, r) => ({
      sold: acc.sold.add(r.soldTzs),
      collected: acc.collected.add(r.collectedTzs),
      owed: acc.owed.add(r.owedTzs),
      usd: acc.usd.add(r.owedUnconvertedUsd),
    }),
    {
      sold: new Prisma.Decimal(0),
      collected: new Prisma.Decimal(0),
      owed: new Prisma.Decimal(0),
      usd: new Prisma.Decimal(0),
    }
  );

/* ------------------------------------------------------------------- runner */

type Loaded = { books?: Books; credit?: Awaited<ReturnType<typeof creditBook>> };

/**
 * Run one report over one window.
 *
 * `loaded` lets a caller running several reports read the books once.
 */
export async function runManagementReport(
  key: string,
  range: Range,
  loaded: Loaded = {},
  now = new Date()
): Promise<ManagementReport | null> {
  const books = async () => (loaded.books ??= await loadBooks());
  const credit = async () => (loaded.credit ??= await creditBook());

  switch (key) {
    case "profit-loss":
    case "income":
    case "expenses":
    case "expenses-by-category":
    case "container-profitability":
      return buildReport(key, await books(), range, "TZS");

    case "monthly-summary": {
      const b = await books();
      let months = monthsCovering(range);
      /* One month is not "month against month"; a short window is read
         against the eleven before it. */
      if (months.length < 2) {
        const end = darFields(new Date(range.to.getTime() - 1));
        months = Array.from({ length: 12 }, (_, i) =>
          monthRange(end.year, end.month - 11 + i)
        );
      }
      const rows = months.map((m) => {
        const billed = sum(b.bills.filter((x) => within(x.at, m)), (x) => x.total);
        const collected = sum(b.money.filter((x) => within(x.at, m)), (x) => x.amount);
        const spent = sum(b.costs.filter((x) => within(x.at, m)), (x) => x.amount);
        const cbm = b.dar.filter((x) => within(x.receivedAt, m)).reduce((s, x) => s + Number(x.cbm ?? 0), 0);
        return [m.label, tzs(billed), tzs(collected), tzs(spent), tzs(billed) - tzs(spent), cbm.toFixed(3)] as Cell[];
      });
      const col = (i: number) => rows.reduce((s, r) => s + Number(r[i]), 0);
      return {
        title: "Monthly summary",
        description:
          "Each month's bills, the money that actually arrived, the costs incurred and what was kept (billed less spent). CBM is what landed in Dar.",
        columns: [{ label: "Month" }, T("Billed"), T("Collected"), T("Spent"), T("Kept"), N("CBM landed")],
        rows,
        total: ["Total", col(1), col(2), col(3), col(4), col(5).toFixed(3)],
      };
    }

    case "cash-flow": {
      const b = await books();
      const money = b.money.filter((m) => within(m.at, range));
      const costs = b.costs.filter((c) => c.paid && within(c.at, range));
      const inBy = new Map<string, Money>();
      for (const m of money) {
        const was = inBy.get(m.account);
        inBy.set(m.account, { usd: (was?.usd ?? 0) + m.amount.usd, tzs: (was?.tzs ?? 0) + m.amount.tzs });
      }
      const outBy = new Map<string, Money>();
      for (const c of costs) {
        const was = outBy.get(c.account);
        outBy.set(c.account, { usd: (was?.usd ?? 0) + c.amount.usd, tzs: (was?.tzs ?? 0) + c.amount.tzs });
      }
      const collected = tzs(sum(money, (m) => m.amount));
      const paidOut = tzs(sum(costs, (c) => c.amount));
      const held = b.positions.filter((p) => p.active);
      const heldTzs = held.map((p) => balanceTzs(p.balance, p.currency, b.today));
      const unconverted = held.filter((_, i) => heldTzs[i] === null);
      const rows: Cell[][] = [
        ...[...inBy.entries()].map(([account, m]) => [`In · ${account}`, tzs(m)]),
        ["Collected from customers", collected],
        ...[...outBy.entries()].map(([account, m]) => [`Out · ${account}`, -tzs(m)]),
        ["Paid out for costs", -paidOut],
        ["Net cash for the period", collected - paidOut],
        ["Held in accounts today", heldTzs.reduce<number>((s, n) => s + (n ?? 0), 0)],
        ...unconverted.map((p) => [`Not converted, no rate · ${p.bankName} (USD ${p.balance.toFixed(2)})`, ""]),
      ];
      return {
        title: "Cash flow",
        description:
          "Verified customer payments in and paid costs out during the period, by account, then what the accounts hold today. Written-off shortfalls are not cash and are not here; dollar accounts are shown in shillings at today's rate.",
        columns: [{ label: "Line" }, T("Amount")],
        rows,
      };
    }

    case "position-summary": {
      const b = await books();
      const byKind = (kind: string) =>
        b.positions
          .filter((p) => p.active && p.kind === kind)
          .reduce((s, p) => s + (balanceTzs(p.balance, p.currency, b.today) ?? 0), 0);
      const bank = byKind("BANK");
      const mobile = byKind("MOBILE_MONEY");
      const cash = byKind("CASH");
      const owedToUs = tzs(sum(b.bills, (x) => x.owing));
      const onCredit = tzs(sum(b.bills.filter((x) => x.credit), (x) => x.owing));
      const owedByUs = tzs(sum(b.costs.filter((c) => !c.paid), (c) => c.amount));
      return {
        title: "Position summary",
        description:
          "Where the business stands today, whatever period is chosen: what the accounts hold, what customers owe, and costs recorded but not yet paid from any account.",
        columns: [{ label: "Line" }, T("Amount")],
        rows: [
          ["Held in bank accounts", bank],
          ["Held on mobile money", mobile],
          ["Held in cash", cash],
          ["Cash held", bank + mobile + cash],
          ["Owed to us by customers", owedToUs],
          ["  of that, released on credit", onCredit],
          ["Owed by us — costs not yet paid", -owedByUs],
          ["Net position", bank + mobile + cash + owedToUs - owedByUs],
        ],
        asAt: true,
      };
    }

    case "credit-sales": {
      const rows = (await credit()).rows.filter((r) => within(r.issuedAt, range));
      const tot = creditTotals(rows);
      return {
        title: "Credit sales",
        description: "Cargo released on credit during the period, what it was billed and what has come back since.",
        columns: [{ label: "Released" }, { label: "Note" }, { label: "Customer" }, { label: "Cargo" }, { label: "Container" }, { label: "Due" }, T("Sold"), T("Collected"), T("Still owed")],
        rows: rows.map((r) => [d(r.issuedAt), r.noteNumber, r.customerName, r.cargoReference, r.container ?? "", d(r.dueAt), dec(r.soldTzs), dec(r.collectedTzs), dec(r.owedTzs)]),
        total: ["Total", "", "", "", "", "", dec(tot.sold), dec(tot.collected), dec(tot.owed)],
      };
    }

    case "credit-collection": {
      const rows = (await credit()).rows.filter((r) => within(r.issuedAt, range));
      const tot = creditTotals(rows);
      return {
        title: "Credit collection",
        description: "Of the credit given during the period, how much has been collected so far.",
        columns: [{ label: "Customer" }, { label: "Cargo" }, { label: "Released" }, T("Sold"), T("Collected"), T("Still owed"), N("Collected %")],
        rows: rows.map((r) => [r.customerName, r.cargoReference, d(r.issuedAt), dec(r.soldTzs), dec(r.collectedTzs), dec(r.owedTzs), pct(dec(r.collectedTzs), dec(r.soldTzs))]),
        total: ["Total", "", "", dec(tot.sold), dec(tot.collected), dec(tot.owed), pct(dec(tot.collected), dec(tot.sold))],
      };
    }

    case "credit-outstanding": {
      const rows = (await credit()).rows.filter((r) => r.owes);
      const tot = creditTotals(rows);
      return {
        title: "Credit outstanding",
        description: "Every release on credit still owed today, whatever period is chosen. Dollar bills with no rate are shown apart.",
        columns: [{ label: "Customer" }, { label: "Phone" }, { label: "Cargo" }, { label: "Container" }, { label: "Released" }, { label: "Due" }, T("Owed"), N("Owed without a rate (USD)")],
        rows: rows.map((r) => [r.customerName, r.phone, r.cargoReference, r.container ?? "", d(r.issuedAt), d(r.dueAt), dec(r.owedTzs), r.owedUnconvertedUsd.isZero() ? "" : r.owedUnconvertedUsd.toFixed(2)]),
        total: ["Total", "", "", "", "", "", dec(tot.owed), tot.usd.isZero() ? "" : tot.usd.toFixed(2)],
        asAt: true,
      };
    }

    case "credit-overdue": {
      const rows = (await credit()).rows
        .filter((r) => r.state === "OVERDUE")
        .sort((a, b) => b.daysLate - a.daysLate);
      const tot = creditTotals(rows);
      return {
        title: "Credit overdue",
        description: "Credit past the date the customer agreed to pay by, latest first. Today's answer, whatever period is chosen.",
        columns: [{ label: "Customer" }, { label: "Phone" }, { label: "Cargo" }, { label: "Due" }, N("Days late"), T("Owed")],
        rows: rows.map((r) => [r.customerName, r.phone, r.cargoReference, d(r.dueAt), r.daysLate, dec(r.owedTzs)]),
        total: ["Total", "", "", "", "", dec(tot.owed)],
        asAt: true,
      };
    }

    case "credit-aging": {
      const rows = (await credit()).rows.filter((r) => r.owes);
      const band = (r: CreditRow) => {
        if (r.daysToDue !== null && r.daysToDue >= 0) return "Not yet due";
        const days = r.dueAt ? r.daysLate : Math.floor((now.getTime() - r.issuedAt.getTime()) / DAY);
        return days <= 30 ? "1–30 days" : days <= 60 ? "31–60 days" : days <= 90 ? "61–90 days" : "Over 90 days";
      };
      const order = ["Not yet due", "1–30 days", "31–60 days", "61–90 days", "Over 90 days"];
      const grouped = order.map((name) => {
        const inBand = rows.filter((r) => band(r) === name);
        const tot = creditTotals(inBand);
        return [name, inBand.length, new Set(inBand.map((r) => r.customerId)).size, dec(tot.owed)] as Cell[];
      });
      const all = creditTotals(rows);
      return {
        title: "Credit aging",
        description: "Unpaid credit today, banded by how far past its due date it is (or since release, where no date was agreed).",
        columns: [{ label: "Band" }, N("Releases"), N("Customers"), T("Owed")],
        rows: grouped,
        total: ["Total", rows.length, new Set(rows.map((r) => r.customerId)).size, dec(all.owed)],
        asAt: true,
      };
    }

    case "credit-by-container":
    case "credit-by-month": {
      const rows = (await credit()).rows.filter((r) => within(r.issuedAt, range));
      const byContainer = key === "credit-by-container";
      const groups = new Map<string, CreditRow[]>();
      for (const r of rows) {
        const name = byContainer
          ? (r.container ?? "No container")
          : r.issuedAt.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
        groups.set(name, [...(groups.get(name) ?? []), r]);
      }
      const tot = creditTotals(rows);
      return {
        title: byContainer ? "Credit by container" : "Credit by month",
        description: byContainer
          ? "Credit released during the period, grouped by the container the cargo travelled on."
          : "Credit released during the period, month by month, and what has come back since.",
        columns: [{ label: byContainer ? "Container" : "Month" }, N("Releases"), N("Customers"), T("Sold"), T("Collected"), T("Still owed")],
        rows: [...groups.entries()].map(([name, list]) => {
          const t = creditTotals(list);
          return [name, list.length, new Set(list.map((r) => r.customerId)).size, dec(t.sold), dec(t.collected), dec(t.owed)];
        }),
        total: ["Total", rows.length, new Set(rows.map((r) => r.customerId)).size, dec(tot.sold), dec(tot.collected), dec(tot.owed)],
      };
    }

    case "credit-customers": {
      const rows = (await credit()).rows;
      const groups = new Map<string, CreditRow[]>();
      for (const r of rows) groups.set(r.customerId, [...(groups.get(r.customerId) ?? []), r]);
      return {
        title: "Credit customers",
        description:
          "Every customer who has had cargo released on credit: what they have used, what has come back and what is still out. No credit limit is kept against a customer yet, so none is shown.",
        columns: [{ label: "Customer" }, { label: "Phone" }, { label: "Limit" }, N("Releases"), T("Credit used"), T("Collected"), T("Outstanding"), N("Overdue releases")],
        rows: [...groups.values()]
          .map((list) => {
            const t = creditTotals(list);
            return [list[0].customerName, list[0].phone, "No limit set", list.length, dec(t.sold), dec(t.collected), dec(t.owed), list.filter((r) => r.state === "OVERDUE").length] as Cell[];
          })
          .sort((a, b) => Number(b[6]) - Number(a[6])),
        asAt: true,
      };
    }

    case "receivable": {
      const b = await books();
      const open = b.bills.filter((x) => x.owing.usd > 0.005 || x.owing.tzs >= 1);
      const phones = new Map(
        (
          await prisma.customer.findMany({
            where: { id: { in: [...new Set(open.map((x) => x.customerId))] } },
            select: { id: true, phone: true },
          })
        ).map((c) => [c.id, c.phone])
      );
      const groups = new Map<string, typeof open>();
      for (const x of open) groups.set(x.customerId, [...(groups.get(x.customerId) ?? []), x]);
      return {
        title: "Accounts receivable",
        description: "Every customer with money still owed today, the number of bills and how old the oldest is. Not a period figure.",
        columns: [{ label: "Customer" }, { label: "Phone" }, N("Bills"), N("Oldest (days)"), T("Owed")],
        rows: [...groups.entries()]
          .map(([id, list]) => [
            list[0].customer,
            phones.get(id) ?? "",
            list.length,
            Math.max(...list.map((x) => Math.floor((now.getTime() - x.at.getTime()) / DAY))),
            tzs(sum(list, (x) => x.owing)),
          ] as Cell[])
          .sort((a, b) => Number(b[4]) - Number(a[4])),
        total: ["Total", "", open.length, "", tzs(sum(open, (x) => x.owing))],
        asAt: true,
      };
    }

    case "outstanding-payments": {
      const b = await books();
      const open = b.bills
        .filter((x) => x.owing.usd > 0.005 || x.owing.tzs >= 1)
        .sort((a, c) => a.customer.localeCompare(c.customer) || a.at.getTime() - c.at.getTime());
      return {
        title: "Outstanding customer payments",
        description: "Every bill with money still owed today, customer by customer, oldest bill first.",
        columns: [{ label: "Customer" }, { label: "Invoice" }, { label: "Cargo" }, { label: "Issued" }, N("Days"), T("Billed"), T("Paid"), T("Owed")],
        rows: open.map((x) => [x.customer, x.number, x.cargo, d(x.at), Math.floor((now.getTime() - x.at.getTime()) / DAY), tzs(x.total), tzs(x.total) - tzs(x.owing), tzs(x.owing)]),
        total: ["Total", "", "", "", "", tzs(sum(open, (x) => x.total)), tzs(sum(open, (x) => x.total)) - tzs(sum(open, (x) => x.owing)), tzs(sum(open, (x) => x.owing))],
        asAt: true,
      };
    }

    case "storage": {
      const [company, cargo] = await Promise.all([
        prisma.companySetting.findUnique({
          where: { id: "singleton" },
          select: { freeStorageDays: true, storagePerDay: true, storageCurrency: true },
        }),
        prisma.cargo.findMany({
          where: {
            deletedAt: null,
            darReceiving: { isNot: null },
            status: { in: ["RECEIVED_DAR", "READY_FOR_RELEASE"] },
          },
          select: {
            reference: true,
            receiver: { select: { fullName: true, businessName: true } },
            clearedAt: true,
            darReceiving: { select: { receivedAt: true, container: { select: { reference: true } } } },
            invoices: {
              where: { status: { not: "CANCELLED" } },
              select: { currency: true, items: { where: { category: "Storage" }, select: { amount: true } } },
            },
          },
        }),
      ]);
      const currency = company?.storageCurrency ?? "USD";
      const rows = cargo
        .map((c) => {
          const position = storagePosition({
            receivedAt: storageStart(c.darReceiving?.receivedAt, c.clearedAt),
            collectedAt: null,
            freeDays: company?.freeStorageDays ?? 7,
            perDay: company?.storagePerDay ?? 0,
            currency,
          });
          const charged = c.invoices.reduce(
            (s, i) => s + i.items.reduce((n, it) => n + Number(it.amount), 0),
            0
          );
          return [
            c.reference,
            c.receiver.businessName || c.receiver.fullName,
            c.darReceiving?.container?.reference ?? "",
            d(c.darReceiving?.receivedAt),
            position.daysHeld,
            position.chargeableDays,
            position.configured ? position.amount.toNumber() : "no rate set",
            charged,
          ] as Cell[];
        })
        .sort((a, b) => Number(b[4]) - Number(a[4]));
      return {
        title: "Warehouse storage",
        description: `Consignments on the Dar floor today and not yet handed over: how long each has been there, the days beyond the free ${company?.freeStorageDays ?? 7}, what storage that works out to, and what is already on a bill. Amounts in ${currency}, the currency storage is priced in.`,
        columns: [{ label: "Cargo" }, { label: "Customer" }, { label: "Container" }, { label: "Arrived Dar" }, N("Days held"), N("Days over"), { label: `Calculated (${currency})`, numeric: true }, { label: "Charged on bill", numeric: true }],
        rows,
        asAt: true,
      };
    }

    case "payroll": {
      /*
        Placed by the day the money LEFT, and only paid runs are placed at all —
        the window is a question about the bank. A run still being argued over
        has no payment date, so unpaid runs are listed whatever the window says
        and marked with the step they are stuck at. The shillings paid out are
        the cost the run became, read off the same books as the P&L.
      */
      const [runs, b] = await Promise.all([
        prisma.payrollRun.findMany({
          orderBy: [{ year: "desc" }, { month: "desc" }],
          include: {
            preparedBy: { select: { name: true } },
            approvedBy: { select: { name: true } },
            account: { select: { bankName: true, currency: true } },
            items: { select: { gross: true, allowance: true, deduction: true, net: true } },
            expense: { select: { reference: true, cancelledAt: true } },
          },
        }),
        books(),
      ]);
      const STATE: Record<string, string> = {
        DRAFT: "Being built",
        PENDING_APPROVAL: "With the manager",
        APPROVED: "Agreed, not yet paid",
        PAID: "Paid",
        REJECTED: "Sent back",
      };
      const shown = runs.filter((r) => r.status !== "PAID" || !r.paidAt || within(r.paidAt, range));
      const paidTzs = (r: (typeof runs)[number]) => {
        if (r.status !== "PAID" || !r.expense || r.expense.cancelledAt) return null;
        const cost = b.costs.find((c) => c.reference === r.expense!.reference);
        return cost ? Math.round(cost.amount.tzs) : null;
      };
      const rows = shown.map((r) => {
        const t = runTotals(r.items);
        const out = paidTzs(r);
        return [
          r.code,
          r.status === "PAID" && r.expense?.cancelledAt ? "Paid, expense cancelled" : STATE[r.status] ?? r.status,
          t.headcount,
          t.gross,
          t.allowance,
          t.deduction,
          t.net,
          out ?? "",
          r.account ? `${r.account.bankName} (${r.account.currency})` : "",
          r.preparedBy.name,
          r.approvedBy?.name ?? "",
          d(r.paidAt),
          r.expense?.reference ?? "",
        ] as Cell[];
      });
      /* Paid means the money left and stayed gone. A run whose salaries expense
         was cancelled has had it returned, so it stays in the table with its
         own state and out of the total. */
      const counted = shown.filter((r) => paidTzs(r) !== null);
      return {
        title: "Payroll",
        description:
          "Every salary run and where it stopped. Salaries are set in dollars; paid-out is the shillings that actually left the account, at the rate frozen on the salaries expense. Paid runs are placed by the day the money left; runs still being built, waiting on the manager or sent back have no payment date and appear whatever period is chosen. The total counts paid runs only.",
        columns: [
          { label: "Run" },
          { label: "Where it is" },
          N("Staff"),
          { label: "Salary (USD)", numeric: true },
          { label: "Allowances (USD)", numeric: true },
          { label: "Deductions (USD)", numeric: true },
          { label: "Net (USD)", numeric: true },
          T("Paid out"),
          { label: "From" },
          { label: "Prepared by" },
          { label: "Agreed by" },
          { label: "Paid on" },
          { label: "Expense" },
        ],
        rows,
        total: [
          "Total paid",
          "",
          counted.reduce((n, r) => n + r.items.length, 0),
          "",
          "",
          "",
          Math.round(counted.reduce((n, r) => n + runTotals(r.items).net, 0) * 100) / 100,
          counted.reduce((n, r) => n + (paidTzs(r) ?? 0), 0),
          "",
          "",
          "",
          "",
          "",
        ],
      };
    }

    case "staff": {
      const [staff, b] = await Promise.all([
        prisma.user.findMany({
          where: { active: true, status: "ACTIVE", role: { not: "CUSTOMER" } },
          orderBy: [{ department: "asc" }, { name: "asc" }],
          select: {
            name: true,
            email: true,
            phone: true,
            role: true,
            department: true,
            lastActiveAt: true,
            createdAt: true,
            baseSalary: true,
          },
        }),
        books(),
      ]);
      const words = (v: string | null) => (v ? v.replace(/_/g, " ").toLowerCase() : "");
      const salaries = staff.reduce((n, s) => n + (s.baseSalary ? Number(s.baseSalary) : 0), 0);
      const inTzs = (usd: number) => (isUsableRate(b.today) ? usdToTzs(usd, b.today).toNumber() : "");
      return {
        title: "Staff register",
        description:
          "Everybody with a live staff account, what they do and what they are paid a month. Salaries are set in dollars on the staff record; the shillings are at today's rate. A blank salary means nobody has recorded one, and payroll leaves that person off a run rather than paying them nothing. Last active is the last time the person used this system — it is not attendance.",
        columns: [
          { label: "Name" },
          { label: "Email" },
          { label: "Phone" },
          { label: "Role" },
          { label: "Department" },
          { label: "On the system since" },
          { label: "Last active" },
          { label: "Salary / month (USD)", numeric: true },
          T("Salary / month"),
        ],
        rows: staff.map((s) => [
          s.name,
          s.email,
          s.phone ?? "",
          words(s.role),
          words(s.department),
          d(s.createdAt),
          d(s.lastActiveAt),
          s.baseSalary === null ? "" : Number(s.baseSalary),
          s.baseSalary === null ? "" : inTzs(Number(s.baseSalary)),
        ]),
        total: ["Total", "", "", "", "", "", "", Math.round(salaries * 100) / 100, salaries > 0 ? inTzs(salaries) : ""],
        asAt: true,
      };
    }

    case "ledger":
    case "bank":
    case "mobile-money":
    case "cash": {
      const kind = key === "bank" ? "BANK" : key === "mobile-money" ? "MOBILE_MONEY" : key === "cash" ? "CASH" : null;
      const [register, b] = await Promise.all([accountRegister(), books()]);
      const accounts = b.positions.filter((p) => !kind || p.kind === kind);
      const ids = new Set(accounts.map((a) => a.id));
      const rows = register
        .filter((e) => ids.has(e.accountId) && within(e.at, range))
        .sort((a, c) => a.at.getTime() - c.at.getTime())
        .map((e) => [
          d(e.at),
          e.reference,
          e.account,
          e.type,
          e.detail,
          e.direction === "IN" ? e.amount : "",
          e.direction === "OUT" ? e.amount : "",
          e.currency,
          e.by ?? "",
          e.cancelled ? `cancelled${e.cancelledReason ? `: ${e.cancelledReason}` : ""}` : "",
        ] as Cell[]);
      /* What each account should hold now, stated per account in its own
         currency — a total across a dollar account and a shilling tin would
         add two different kinds of money. */
      const closing = accounts
        .filter((a) => a.active)
        .map((a) => ["Today", "", `${a.bankName} (${a.currency})`, key === "cash" ? "Should hold" : "Balance", "", a.balance, "", a.currency, "", ""] as Cell[]);
      const title =
        key === "ledger" ? "General ledger" : key === "bank" ? "Bank accounts" : key === "mobile-money" ? "Mobile money" : "Cash and petty cash";
      return {
        title,
        description:
          "Every movement recorded against these accounts during the period, oldest first, in each account's own currency — verified payments in, transport and costs out, transfers both ways. Cancelled lines are listed and marked, and never count. The closing lines are each account's balance today.",
        columns: [{ label: "Date" }, { label: "Reference" }, { label: "Account" }, { label: "Type" }, { label: "Detail" }, N("In"), N("Out"), { label: "Currency" }, { label: "Recorded by" }, { label: "Note" }],
        rows: [...rows, ...closing],
      };
    }
  }
  return null;
}

/** The label a report is filed under, for file names and headings. */
export function managementReportLabel(key: string) {
  for (const shelf of MANAGEMENT_SHELVES) {
    const hit = shelf.reports.find((r) => r.key === key);
    if (hit) return hit.label;
  }
  return null;
}

/** A report as CSV: numbers stay numbers, so the columns can be summed where they land. */
export function reportToCsv(report: ReportTable) {
  const escape = (v: Cell) => {
    const s = String(v ?? "");
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return (
    "﻿" +
    [
      report.columns.map((c) => escape(c.label)).join(","),
      ...report.rows.map((row) => row.map(escape).join(",")),
      ...(report.total ? [report.total.map(escape).join(",")] : []),
    ].join("\r\n")
  );
}
