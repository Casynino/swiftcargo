import {
  byCategory,
  byCustomer,
  figures,
  sum,
  within,
  type Books,
  type Money,
  type Range,
} from "@/lib/finance-report";

export type Cell = string | number;
export type ReportTable = {
  title: string;
  description: string;
  columns: { label: string; money?: boolean; numeric?: boolean }[];
  rows: Cell[][];
  total?: Cell[];
};

export type Currency = "TZS" | "USD";

const d = (x: Date | null | undefined) =>
  x ? x.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "";

/**
 * EVERY DOWNLOADABLE REPORT, DEFINED ONCE.
 *
 * The preview on the page, the spreadsheet and the PDF are the same table. A
 * report built three times is three chances for the spreadsheet somebody hands
 * the accountant to disagree with the screen they checked it on.
 *
 * Money cells hold a number in the currency chosen at the top of the page;
 * formatting is the viewer's job, so a spreadsheet keeps real numbers.
 */
export const REPORTS = {
  "profit-loss": "Profit & loss",
  income: "Income",
  expenses: "Expenses",
  "expenses-by-category": "Expenses by category",
  "container-profitability": "Container profitability",
  storage: "Warehouse storage",
  receivable: "Accounts receivable",
  "outstanding-payments": "Outstanding customer payments",
  "credit-sales": "Credit sales",
  "credit-outstanding": "Credit outstanding",
  "credit-aging": "Credit aging",
  "cash-flow": "Cash flow",
  "bank-accounts": "Bank accounts",
  "mobile-money": "Mobile money",
  "cash": "Cash and petty cash",
  "monthly-summary": "Monthly summary",
  "position-summary": "Position summary",
} as const;
export type ReportKey = keyof typeof REPORTS;

export function buildReport(
  key: ReportKey,
  books: Books,
  range: Range,
  cur: Currency,
  containerId?: string
): ReportTable {
  const pick = (m: Money) => Math.round((cur === "TZS" ? m.tzs : m.usd) * (cur === "TZS" ? 1 : 100)) / (cur === "TZS" ? 1 : 100);
  const inBox = <T extends { containerId: string | null }>(rows: T[]) =>
    containerId ? rows.filter((r) => r.containerId === containerId) : rows;

  const bills = inBox(books.bills.filter((b) => within(b.at, range)));
  const costs = inBox(books.costs.filter((c) => within(c.at, range)));
  const money = books.money.filter((m) => within(m.at, range));
  const f = figures(books, range);
  const now = new Date();
  const M = (label: string) => ({ label: `${label} (${cur})`, money: true });

  switch (key) {
    case "profit-loss": {
      /* VAT is collected for TRA and never the company's revenue. */
      const billedGross = sum(bills, (b) => b.total);
      const vatOwed = sum(bills, (b) => b.vat);
      const revenue = f.revenue;
      const operating = pick(sum(costs.filter((c) => c.scope === "CONTAINER"), (c) => c.amount));
      const office = pick(sum(costs.filter((c) => c.scope === "OFFICE"), (c) => c.amount));
      const special = pick(sum(costs.filter((c) => c.scope === "SPECIAL" || c.scope === "EXECUTIVE"), (c) => c.amount));
      return {
        title: "Profit & loss",
        description:
          "Revenue billed against costs incurred in the period, VAT taken out: it is collected for TRA and was never the company's money. Container costs are the operating costs; office and special costs are shown beneath, not mixed in.",
        columns: [{ label: "Line" }, M("Amount")],
        rows: [
          ["Billed to customers (confirmed bills)", pick(billedGross)],
          ["Less VAT owed to TRA", -pick(vatOwed)],
          ["Revenue", pick(revenue)],
          ["Operating costs (container)", -operating],
          ["Operating profit", pick(revenue) - operating],
          ["Office costs", -office],
          ["Special and executive costs", -special],
          ["Profit after all costs", pick(revenue) - operating - office - special],
        ],
      };
    }
    case "income":
      return {
        title: "Income",
        description: "Every bill raised in the period, with what has been collected against it.",
        columns: [{ label: "Date" }, { label: "Invoice" }, { label: "Cargo" }, { label: "Customer" }, M("Billed"), M("Collected"), M("Owed")],
        rows: bills.map((b) => [d(b.at), b.number, b.cargo, b.customer, pick(b.total), pick(b.total) - pick(b.owing), pick(b.owing)]),
        total: ["Total", "", "", "", pick(sum(bills, (b) => b.total)), pick(sum(bills, (b) => b.total)) - pick(sum(bills, (b) => b.owing)), pick(sum(bills, (b) => b.owing))],
      };
    case "expenses":
      return {
        title: "Expenses",
        description: "Every cost incurred in the period, the container it belongs to and where the money left from.",
        columns: [{ label: "Date" }, { label: "Reference" }, { label: "Category" }, { label: "Container" }, { label: "Paid to" }, { label: "Paid from" }, M("Amount")],
        rows: costs.map((c) => [d(c.at), c.reference, c.category, c.container, c.vendor ?? "", c.account, pick(c.amount)]),
        total: ["Total", "", "", "", "", "", pick(sum(costs, (c) => c.amount))],
      };
    case "expenses-by-category": {
      const cats = byCategory(costs);
      const all = pick(sum(costs, (c) => c.amount));
      return {
        title: "Expenses by category",
        description: "What the period's costs were for, biggest first.",
        columns: [{ label: "Category" }, M("Amount"), { label: "Share", numeric: true }],
        rows: cats.map((c) => [c.name, pick(c.amount), all ? `${Math.round((pick(c.amount) / all) * 100)}%` : "—"]),
        total: ["Total", all, "100%"],
      };
    }
    case "container-profitability":
      return {
        title: "Container profitability",
        description: "Every sailing: what it billed, what came in, what it cost. Margin is on billed, not collected.",
        columns: [{ label: "Container" }, { label: "From" }, { label: "Cargo", numeric: true }, { label: "CBM", numeric: true }, M("Billed"), M("Collected"), M("Outstanding"), M("Costs"), M("Profit"), { label: "Margin", numeric: true }],
        rows: books.boxes
          .filter((c) => !containerId || c.id === containerId)
          .filter((c) => c.billed.usd > 0 || c.spent.usd > 0)
          .map((c) => [c.reference, c.from, c.cargo, c.cbm.toFixed(3), pick(c.billed), pick(c.collected), pick(c.owed), pick(c.spent), pick(c.profit), c.billed.usd > 0 ? `${Math.round((c.profit.usd / c.billed.usd) * 100)}%` : "—"]),
      };
    case "storage":
      return {
        title: "Warehouse storage",
        description: "Storage charged on bills raised in the period.",
        columns: [{ label: "Invoice" }, { label: "Cargo" }, { label: "Customer" }, M("Storage")],
        rows: bills.filter((b) => b.storage.usd > 0).map((b) => [b.number, b.cargo, b.customer, pick(b.storage)]),
        total: ["Total", "", "", pick(sum(bills, (b) => b.storage))],
      };
    case "receivable":
    case "outstanding-payments": {
      const open = inBox(books.bills.filter((b) => b.owing.usd > 0.005));
      return {
        title: REPORTS[key],
        description: "Every bill with money still owed on it today, oldest first. Not a period figure — it is today's answer.",
        columns: [{ label: "Invoice" }, { label: "Cargo" }, { label: "Customer" }, { label: "Billed on" }, { label: "Days", numeric: true }, M("Owed")],
        rows: open
          .sort((a, b) => a.at.getTime() - b.at.getTime())
          .map((b) => [b.number, b.cargo, b.customer, d(b.at), Math.floor((now.getTime() - b.at.getTime()) / 86_400_000), pick(b.owing)]),
        total: ["Total", "", "", "", "", pick(sum(open, (b) => b.owing))],
      };
    }
    case "credit-sales":
      return {
        title: "Credit sales",
        description: "Cargo released on credit whose bill was raised in the period.",
        columns: [{ label: "Invoice" }, { label: "Cargo" }, { label: "Customer" }, M("Billed"), M("Still owed")],
        rows: bills.filter((b) => b.credit).map((b) => [b.number, b.cargo, b.customer, pick(b.total), pick(b.owing)]),
      };
    case "credit-outstanding":
    case "credit-aging": {
      const open = inBox(books.bills.filter((b) => b.credit && b.owing.usd > 0.005));
      const age = (b: (typeof open)[number]) => Math.floor((now.getTime() - (b.dueAt ?? b.at).getTime()) / 86_400_000);
      return {
        title: REPORTS[key],
        description: "Goods that left on credit and are still owed today.",
        columns: [{ label: "Invoice" }, { label: "Cargo" }, { label: "Customer" }, { label: "Days", numeric: true }, { label: "Band" }, M("Owed")],
        rows: open.map((b) => {
          const days = age(b);
          return [b.number, b.cargo, b.customer, days, days <= 30 ? "0–30" : days <= 60 ? "31–60" : days <= 90 ? "61–90" : "90+", pick(b.owing)];
        }),
        total: ["Total", "", "", "", "", pick(sum(open, (b) => b.owing))],
      };
    }
    case "cash-flow":
      return {
        title: "Cash flow",
        description: "Money that actually moved in the period: verified payments in, paid costs out.",
        columns: [{ label: "Line" }, M("Amount")],
        rows: [
          ["Collected from customers", pick(f.collected)],
          ["Paid out for costs", -pick(f.paidOut)],
          ["Net cash", pick(f.collected) - pick(f.paidOut)],
        ],
      };
    case "bank-accounts":
    case "mobile-money":
    case "cash": {
      const kind = key === "bank-accounts" ? "BANK" : key === "mobile-money" ? "MOBILE_MONEY" : "CASH";
      const rows = books.positions.filter((p) => p.kind === kind);
      const inCur = (p: (typeof rows)[number]) =>
        p.currency === cur ? p.balance : cur === "TZS" ? p.balance * books.today : books.today ? p.balance / books.today : 0;
      return {
        title: REPORTS[key],
        description: "Each account's balance today, as its register adds up. Shown in its own currency and in the report's.",
        columns: [{ label: "Account" }, { label: "Currency" }, { label: "Balance (own)", numeric: true }, M("Balance")],
        rows: rows.map((p) => [`${p.bankName} · ${p.accountNumber}`, p.currency, Math.round(p.balance * 100) / 100, Math.round(inCur(p))]),
        total: ["Total", "", "", Math.round(rows.reduce((s, p) => s + inCur(p), 0))],
      };
    }
    case "monthly-summary":
      return {
        title: "Monthly summary",
        description: "The period's figures on one page.",
        columns: [{ label: "Line" }, { label: "Value" }],
        rows: [
          ["Billed to customers", pick(f.billed)],
          ["VAT owed to TRA", pick(f.vat)],
          ["Revenue (excl. VAT)", pick(f.revenue)],
          ["Costs incurred", pick(f.expenses)],
          ["Profit", pick(f.profit)],
          ["Collected", pick(f.collected)],
          ["Paid out", pick(f.paidOut)],
          ["Still owed on the period's bills", pick(f.outstanding)],
          ["CBM received in China", f.cbmReceived.toFixed(3)],
          ["CBM landed in Dar", f.cbmLanded.toFixed(3)],
          ["Containers arrived", f.arrived],
          ["Customers billed", f.customers],
        ],
      };
    case "position-summary": {
      const inCur = (p: Books["positions"][number]) =>
        p.currency === cur ? p.balance : cur === "TZS" ? p.balance * books.today : books.today ? p.balance / books.today : 0;
      const receivable = sum(books.bills, (b) => b.owing);
      const held = books.positions.reduce((s, p) => s + inCur(p), 0);
      return {
        title: "Position summary",
        description: "Where the business stands today, whatever period is chosen.",
        columns: [{ label: "Line" }, M("Amount")],
        rows: [
          ["Held in accounts", Math.round(held)],
          ["Owed by customers", pick(receivable)],
          ["Of that, on credit", pick(sum(books.bills.filter((b) => b.credit), (b) => b.owing))],
          ["Everything the business is owed or holds", Math.round(held) + pick(receivable)],
        ],
      };
    }
  }
}

export { byCustomer };
