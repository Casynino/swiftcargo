import "server-only";

import { cache } from "react";
import { Prisma, type ReviewState } from "@prisma/client";

import { accountPositions as registerPositions, type AccountPosition } from "@/lib/accounts";
import { formatCurrency, isUsableRate, roundMoney, usdToTzs } from "@/lib/currency";
import { impliedStatus, invoiceRate } from "@/lib/invoice-balance";
import { prisma } from "@/lib/prisma";

import { darStartOfDay, darStartOfMonth, darStartOfWeek, darStartOfYear } from "@/lib/dar-time";
/**
 * THE MANAGER'S RECONCILIATION WORKSPACE, ON THE BOOKS THE BUSINESS ALREADY HAS.
 *
 * Every row this returns is a Payment, a ContainerExpense, an AccountTransfer,
 * a BankAccount or a Container that somebody already recorded. Nothing here
 * writes a financial figure and nothing stores a second copy of one: a verdict
 * is an append-only ManagerReview beside the record, and an account check is a
 * CashCount beside the account. Reviewing a payment never edits the payment.
 *
 * The one figure that genuinely comes from outside the system is what an
 * account ACTUALLY holds — the statement, the phone, the tin. It is typed by the
 * manager, stored with the register's own figure frozen beside it, and never
 * used to correct anything.
 */

export const QUEUE_PAGE_SIZE = 40;

export const RECORD_KINDS = ["Payment", "Expense", "Transfer"] as const;
export type RecordKind = (typeof RECORD_KINDS)[number];

/** What each kind of record is called on the screen, in the register's words. */
export const KIND_LABEL: Record<RecordKind, string> = {
  Payment: "Customer payment",
  Expense: "Expense",
  Transfer: "Moved between accounts",
};

/** PENDING is the absence of a verdict, so it is never a stored row. */
export const QUEUE_STATES = [
  "PENDING",
  "QUERIED",
  "MISMATCH",
  "SENT_BACK",
  "UNDER_REVIEW",
  "RECONCILED",
] as const satisfies readonly ReviewState[];
export type QueueState = (typeof QUEUE_STATES)[number];

export type QueueFilters = {
  q?: string;
  account?: string;
  kind?: string;
  person?: string;
  period?: string;
  status?: string;
  page?: string;
};

export const PERIOD_LABEL: Record<string, string> = {
  today: "Today",
  yesterday: "Yesterday",
  week: "This week",
  month: "This month",
  year: "This year",
};

/** The window a period filter names, or null for any date. */
export function periodWindow(
  period: string | undefined,
  now = new Date()
): { gte: Date; lt?: Date } | null {
  const day = darStartOfDay(now);
  if (period === "today") return { gte: day };
  if (period === "yesterday") {
    return { gte: new Date(day.getTime() - 86_400_000), lt: day };
  }
  if (period === "week") {
    return { gte: darStartOfWeek(now) };
  }
  if (period === "month") return { gte: darStartOfMonth(now) };
  if (period === "year") return { gte: darStartOfYear(now) };
  return null;
}

/** A record's address in a link and in the review table: "Payment:clx…". */
export const recordKey = (kind: string, id: string) => `${kind}:${id}`;

export function parseRecordKey(key: string | undefined): { kind: RecordKind; id: string } | null {
  if (!key) return null;
  const at = key.indexOf(":");
  if (at < 1) return null;
  const kind = key.slice(0, at) as RecordKind;
  const id = key.slice(at + 1);
  return RECORD_KINDS.includes(kind) && id ? { kind, id } : null;
}

export type RecordRow = {
  kind: RecordKind;
  id: string;
  key: string;
  /** When the money moved, which is what the period filter reads. */
  at: Date;
  recordedAt: Date;
  reference: string;
  /** Who or what the row is about, in one line. */
  title: string;
  description: string | null;
  /** IN and OUT change what the business holds; MOVE only changes where. */
  direction: "IN" | "OUT" | "MOVE";
  /** The system figure, in the record's own currency. */
  amount: Prisma.Decimal;
  currency: string;
  /**
   * The same figure in shillings, at the rate pinned on the record itself.
   * Null when a dollar record carries no rate — kept apart and never added to
   * shillings at today's rate.
   */
  tzs: Prisma.Decimal | null;
  accountId: string | null;
  account: string | null;
  toAccountId: string | null;
  recordedBy: string | null;
  recordedById: string | null;
  verifiedBy: string | null;
  cancelled: boolean;
  cancelledReason: string | null;
  evidence: { label: string; url: string }[];
  /** The record's own screen, where a correction is actually made. */
  href: string;
  /** Record-specific facts, already written as text. Empty ones are dropped. */
  facts: [string, string][];
};

export type Standing = {
  state: ReviewState;
  note: string | null;
  actualAmount: Prisma.Decimal | null;
  currency: string | null;
  reviewedBy: string;
  at: Date;
};

export type QueueRow = RecordRow & { standing: Standing | null; state: QueueState };

const accountLabel = (a: { bankName: string; currency: string }) => `${a.bankName} (${a.currency})`;

function inTzs(amount: Prisma.Decimal, currency: string, ...rates: unknown[]) {
  if (currency === "TZS") return roundMoney(amount, "TZS");
  for (const rate of rates) {
    if (isUsableRate(rate as Prisma.Decimal) && new Prisma.Decimal(rate as Prisma.Decimal).greaterThan(1)) {
      return usdToTzs(amount, rate as Prisma.Decimal);
    }
  }
  return null;
}

type Scope = QueueFilters & { ids?: string[] };

/* ----------------------------------------------------------------- loaders */

async function loadPayments(scope: Scope): Promise<RecordRow[]> {
  const and: Prisma.PaymentWhereInput[] = [
    /* Money that actually landed, and money that landed and was taken back —
       the reversal is a fact the manager has to be able to see. A written-off
       shortfall is not money and never sits in an account. */
    { status: { in: ["VERIFIED", "REVERSED"] }, writtenOff: false },
  ];
  if (scope.ids) and.push({ id: { in: scope.ids } });
  if (scope.account) and.push({ accountId: scope.account });
  if (scope.person) and.push({ recordedById: scope.person });
  const window = periodWindow(scope.period);
  if (window) and.push({ OR: [{ paidAt: window }, { paidAt: null, createdAt: window }] });
  const q = scope.q?.trim();
  if (q) {
    const like = { contains: q, mode: "insensitive" as const };
    and.push({
      OR: [
        { reference: like },
        { transactionRef: like },
        { payerName: like },
        { notes: like },
        { customer: { fullName: like } },
        { customer: { businessName: like } },
        { customer: { phone: like } },
        { invoice: { number: like } },
        { invoice: { cargo: { reference: like } } },
        { receipts: { some: { number: like } } },
        { account: { bankName: like } },
        { recordedBy: { name: like } },
      ],
    });
  }

  const rows = await prisma.payment.findMany({
    where: { AND: and },
    include: {
      account: { select: { id: true, bankName: true, currency: true } },
      customer: { select: { fullName: true, businessName: true, phone: true } },
      invoice: {
        select: {
          id: true,
          number: true,
          fxRate: true,
          cargo: {
            select: {
              reference: true,
              description: true,
              containerLines: {
                take: 1,
                orderBy: { createdAt: "desc" },
                select: { container: { select: { reference: true } } },
              },
            },
          },
        },
      },
      receipts: { select: { number: true }, take: 1 },
      proofs: { select: { url: true, name: true } },
      recordedBy: { select: { id: true, name: true } },
      verifiedBy: { select: { name: true } },
    },
  });

  return rows.map((p) => {
    const amount = new Prisma.Decimal(p.amount);
    const tzs = p.baseCurrencyAmount
      ? roundMoney(p.baseCurrencyAmount, "TZS")
      : inTzs(amount, p.currency, p.fxRate, invoiceRate(p.invoice));
    const delivery = p.deliveryAdded ? new Prisma.Decimal(p.deliveryAdded) : null;
    return {
      kind: "Payment" as const,
      id: p.id,
      key: recordKey("Payment", p.id),
      at: p.paidAt ?? p.createdAt,
      recordedAt: p.createdAt,
      reference: p.reference,
      title: p.customer.businessName || p.customer.fullName,
      description: p.notes,
      direction: "IN" as const,
      amount,
      currency: p.currency,
      tzs,
      accountId: p.account?.id ?? null,
      account: p.account ? accountLabel(p.account) : null,
      toAccountId: null,
      recordedBy: p.recordedBy?.name ?? (p.submittedByCustomer ? "Customer" : null),
      recordedById: p.recordedBy?.id ?? null,
      verifiedBy: p.verifiedBy?.name ?? null,
      cancelled: p.status === "REVERSED",
      cancelledReason: p.reversedReason,
      evidence: p.proofs.map((proof) => ({ label: "Payment proof", url: proof.url })),
      href: `/app/finance/invoices/${p.invoice.id}`,
      facts: [
        ["Method", p.method.replace(/_/g, " ").toLowerCase()],
        ["Transaction ref", p.transactionRef ?? ""],
        ["Receipt", p.receipts[0]?.number ?? ""],
        ["Invoice", p.invoice.number],
        ["Cargo", p.invoice.cargo.reference],
        ["Container", p.invoice.cargo.containerLines[0]?.container.reference ?? ""],
        ["Payer", p.payerName ?? ""],
        ["Phone", p.customer.phone],
        ["Transport added", delivery && delivery.greaterThan(0) ? formatCurrency(delivery, p.currency) : ""],
        ["In shillings", tzs && p.currency !== "TZS" ? formatCurrency(tzs, "TZS") : ""],
        ["Verified by", p.verifiedBy?.name ?? ""],
      ] as [string, string][],
    };
  });
}

async function loadExpenses(scope: Scope): Promise<RecordRow[]> {
  const and: Prisma.ContainerExpenseWhereInput[] = [{ deletedAt: null }];
  if (scope.ids) and.push({ id: { in: scope.ids } });
  if (scope.account) and.push({ accountId: scope.account });
  if (scope.person) and.push({ recordedById: scope.person });
  const window = periodWindow(scope.period);
  if (window) {
    and.push({
      OR: [
        { paidDate: window },
        { paidDate: null, expenseDate: window },
        { paidDate: null, expenseDate: null, createdAt: window },
      ],
    });
  }
  const q = scope.q?.trim();
  if (q) {
    const like = { contains: q, mode: "insensitive" as const };
    and.push({
      OR: [
        { reference: like },
        { referenceNumber: like },
        { description: like },
        { notes: like },
        { vendor: { name: like } },
        { expenseType: { name: like } },
        { container: { reference: like } },
        { container: { containerNumber: like } },
        { account: { bankName: like } },
        { recordedBy: { name: like } },
      ],
    });
  }

  const rows = await prisma.containerExpense.findMany({
    where: { AND: and },
    include: {
      account: { select: { id: true, bankName: true, currency: true } },
      expenseType: { select: { name: true } },
      vendor: { select: { name: true } },
      container: { select: { id: true, reference: true } },
      recordedBy: { select: { id: true, name: true } },
    },
  });

  return rows.map((e) => {
    const amount = new Prisma.Decimal(e.amount);
    return {
      kind: "Expense" as const,
      id: e.id,
      key: recordKey("Expense", e.id),
      at: e.paidDate ?? e.expenseDate ?? e.createdAt,
      recordedAt: e.createdAt,
      reference: e.reference,
      title: e.vendor?.name || e.description || e.expenseType?.name || "Cost",
      description: e.description,
      direction: "OUT" as const,
      amount,
      currency: e.currency,
      tzs: inTzs(amount, e.currency, e.fxRate),
      accountId: e.account?.id ?? null,
      account: e.account ? accountLabel(e.account) : null,
      toAccountId: null,
      recordedBy: e.recordedBy?.name ?? null,
      recordedById: e.recordedBy?.id ?? null,
      verifiedBy: null,
      cancelled: e.cancelledAt !== null,
      cancelledReason: e.cancelledReason,
      evidence: e.receiptUrl ? [{ label: "Expense receipt", url: e.receiptUrl }] : [],
      href: e.container ? `/app/finance/containers/${e.container.id}` : "/app/finance/expenses",
      facts: [
        ["Category", e.expenseType?.name ?? ""],
        ["Scope", e.scope.toLowerCase()],
        ["Container", e.container?.reference ?? ""],
        ["Status", e.status.toLowerCase()],
        ["Their reference", e.referenceNumber ?? ""],
      ] as [string, string][],
    };
  });
}

async function loadTransfers(scope: Scope): Promise<RecordRow[]> {
  const and: Prisma.AccountTransferWhereInput[] = [];
  if (scope.ids) and.push({ id: { in: scope.ids } });
  if (scope.account) {
    and.push({ OR: [{ fromAccountId: scope.account }, { toAccountId: scope.account }] });
  }
  if (scope.person) and.push({ recordedById: scope.person });
  const window = periodWindow(scope.period);
  if (window) and.push({ transferDate: window });
  const q = scope.q?.trim();
  if (q) {
    const like = { contains: q, mode: "insensitive" as const };
    and.push({
      OR: [
        { reference: like },
        { purpose: like },
        { fromAccount: { bankName: like } },
        { toAccount: { bankName: like } },
        { recordedBy: { name: like } },
      ],
    });
  }

  const rows = await prisma.accountTransfer.findMany({
    where: { AND: and },
    include: {
      fromAccount: { select: { id: true, bankName: true, currency: true } },
      toAccount: { select: { id: true, bankName: true, currency: true } },
      recordedBy: { select: { id: true, name: true } },
    },
  });

  return rows.map((t) => {
    const amount = new Prisma.Decimal(t.amount);
    const charge = new Prisma.Decimal(t.charge);
    const arrived = new Prisma.Decimal(t.amountArrived);
    return {
      kind: "Transfer" as const,
      id: t.id,
      key: recordKey("Transfer", t.id),
      at: t.transferDate,
      recordedAt: t.createdAt,
      reference: t.reference,
      title: `${accountLabel(t.fromAccount)} → ${accountLabel(t.toAccount)}`,
      description: t.purpose,
      direction: "MOVE" as const,
      amount,
      currency: t.fromAccount.currency,
      /* A transfer has no rate of its own, so a dollar move is left in dollars
         rather than valued at whatever the board says today. */
      tzs: t.fromAccount.currency === "TZS" ? roundMoney(amount, "TZS") : null,
      accountId: t.fromAccount.id,
      account: accountLabel(t.fromAccount),
      toAccountId: t.toAccount.id,
      recordedBy: t.recordedBy?.name ?? null,
      recordedById: t.recordedBy?.id ?? null,
      verifiedBy: null,
      cancelled: t.cancelledAt !== null,
      cancelledReason: t.cancelledReason,
      evidence: [],
      href: `/app/finance/accounts/${t.fromAccount.id}`,
      facts: [
        ["To", accountLabel(t.toAccount)],
        ["Bank charge", charge.greaterThan(0) ? formatCurrency(charge, t.fromAccount.currency) : ""],
        ["Arrived", formatCurrency(arrived, t.toAccount.currency)],
      ] as [string, string][],
    };
  });
}

async function loadRecords(scope: Scope): Promise<RecordRow[]> {
  const kind = RECORD_KINDS.includes(scope.kind as RecordKind) ? (scope.kind as RecordKind) : null;
  const [payments, expenses, transfers] = await Promise.all([
    !kind || kind === "Payment" ? loadPayments(scope) : Promise.resolve([]),
    !kind || kind === "Expense" ? loadExpenses(scope) : Promise.resolve([]),
    !kind || kind === "Transfer" ? loadTransfers(scope) : Promise.resolve([]),
  ]);
  return [...payments, ...expenses, ...transfers].sort(
    (a, b) => b.at.getTime() - a.at.getTime() || b.recordedAt.getTime() - a.recordedAt.getTime()
  );
}

/* ---------------------------------------------------------------- verdicts */

/**
 * The newest verdict per record, for every record that has one.
 *
 * One query for the whole page: `distinct` over a descending order is what
 * "current standing" means in an append-only table, and the counts, the filter
 * and every row's badge are answered from it. cache() shares it between the
 * queue and anything else composed on the same request.
 */
export const currentStandings = cache(async (): Promise<Map<string, Standing>> => {
  const rows = await prisma.managerReview.findMany({
    orderBy: [{ entity: "asc" }, { entityId: "asc" }, { createdAt: "desc" }],
    distinct: ["entity", "entityId"],
    select: {
      entity: true,
      entityId: true,
      verdict: true,
      note: true,
      actualAmount: true,
      currency: true,
      createdAt: true,
      reviewer: { select: { name: true } },
    },
  });
  return new Map(
    rows.map((r) => [
      recordKey(r.entity, r.entityId),
      {
        state: r.verdict,
        note: r.note,
        actualAmount: r.actualAmount,
        currency: r.currency,
        reviewedBy: r.reviewer.name,
        at: r.createdAt,
      },
    ])
  );
});

/** Every verdict ever given on one record, oldest first. */
export async function reviewHistory(entity: string, entityId: string) {
  return prisma.managerReview.findMany({
    where: { entity, entityId },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      verdict: true,
      note: true,
      actualAmount: true,
      currency: true,
      createdAt: true,
      reviewer: { select: { name: true } },
    },
  });
}

const withStanding = (row: RecordRow, standings: Map<string, Standing>): QueueRow => {
  const standing = standings.get(row.key) ?? null;
  const state = (standing?.state ?? "PENDING") as QueueState;
  return { ...row, standing, state };
};

/** Money that changed what the business holds, summed in shillings. */
function totalsOf(rows: QueueRow[]) {
  let inTzs = new Prisma.Decimal(0);
  let outTzs = new Prisma.Decimal(0);
  let inUsd = new Prisma.Decimal(0);
  let outUsd = new Prisma.Decimal(0);
  let moved = 0;
  for (const row of rows) {
    /* A reversed payment or a cancelled cost moved nothing in the end. */
    if (row.cancelled) continue;
    if (row.direction === "MOVE") {
      moved += 1;
      continue;
    }
    if (row.tzs) {
      if (row.direction === "IN") inTzs = inTzs.add(row.tzs);
      else outTzs = outTzs.add(row.tzs);
    } else if (row.direction === "IN") {
      inUsd = inUsd.add(row.amount);
    } else {
      outUsd = outUsd.add(row.amount);
    }
  }
  return { inTzs, outTzs, netTzs: inTzs.sub(outTzs), inUsd, outUsd, moved };
}

/**
 * The queue, its counts and its totals, for one set of filters.
 *
 * Three registers make one list, so the list is assembled in the process and
 * paged here rather than by the database. The filters that narrow each source —
 * account, person, period, search — are still applied in the query, so what
 * comes back is only what the view can show.
 */
export async function reconciliationQueue(filters: QueueFilters) {
  const page = Math.max(1, Number(filters.page) || 1);
  const [records, standings, accounts, people] = await Promise.all([
    loadRecords(filters),
    currentStandings(),
    prisma.bankAccount.findMany({
      where: { active: true },
      orderBy: [{ sortOrder: "asc" }, { bankName: "asc" }],
      select: { id: true, bankName: true, currency: true, kind: true },
    }),
    prisma.user.findMany({
      where: {
        OR: [
          { paymentsRecorded: { some: {} } },
          { expensesRecorded: { some: {} } },
          { transfersRecorded: { some: {} } },
        ],
      },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  const all = records.map((row) => withStanding(row, standings));

  /* Counted over the filters WITHOUT the status, so the cards keep saying how
     big each pile is while you are standing inside one of them. */
  const counts = Object.fromEntries(QUEUE_STATES.map((s) => [s, 0])) as Record<QueueState, number>;
  for (const row of all) counts[row.state] += 1;

  const status = filters.status as QueueState | undefined;
  const scoped =
    status && QUEUE_STATES.includes(status)
      ? all.filter((row) => row.state === status)
      : /* THE DEFAULT VIEW IS WHAT STILL NEEDS HIM. An agreed record is
           finished work; it is one press away under Reconciled, and the
           progress counts still include it. */
        all.filter((row) => row.state !== "RECONCILED");

  const pages = Math.max(1, Math.ceil(scoped.length / QUEUE_PAGE_SIZE));
  return {
    all: scoped,
    entries: scoped.slice((page - 1) * QUEUE_PAGE_SIZE, page * QUEUE_PAGE_SIZE),
    counts,
    total: all.length,
    filteredTotal: scoped.length,
    totals: totalsOf(scoped),
    page,
    pages,
    accounts: accounts.map((a) => ({ id: a.id, name: accountLabel(a), kind: a.kind })),
    people,
  };
}

/**
 * One record by its key, whatever the filters say.
 *
 * A link from elsewhere lands here with a record the current filters may
 * exclude, and answering that with "nothing selected" would be a dead end.
 */
export async function recordByKey(key: string | undefined): Promise<QueueRow | null> {
  const parsed = parseRecordKey(key);
  if (!parsed) return null;
  const [rows, standings] = await Promise.all([
    loadRecords({ kind: parsed.kind, ids: [parsed.id] }),
    currentStandings(),
  ]);
  return rows[0] ? withStanding(rows[0], standings) : null;
}

/* ---------------------------------------------------------------- accounts */

export type AccountCheckPosition = AccountPosition & {
  /** The newest check against something outside the system, if there is one. */
  lastCheck: {
    counted: number;
    expected: number;
    difference: number;
    at: Date;
    note: string | null;
    checkedBy: string | null;
  } | null;
  /** Money has moved since that check, so it no longer describes the account. */
  movedSinceCheck: boolean;
};

/**
 * Every live account: what its register says, and what somebody proved from
 * outside it. The two are kept apart and labelled as such, because a register
 * agreeing with itself certifies nothing.
 */
export async function accountCheckPositions(): Promise<AccountCheckPosition[]> {
  const [positions, checks] = await Promise.all([
    registerPositions(),
    prisma.cashCount.findMany({
      orderBy: [{ accountId: "asc" }, { countedAt: "desc" }],
      distinct: ["accountId"],
      select: {
        accountId: true,
        counted: true,
        expected: true,
        note: true,
        countedAt: true,
        countedBy: { select: { name: true } },
      },
    }),
  ]);
  const byAccount = new Map(checks.map((c) => [c.accountId, c]));
  return positions
    .filter((p) => p.active)
    .map((p) => {
      const c = byAccount.get(p.id);
      const counted = c ? Number(c.counted) : 0;
      const expected = c ? Number(c.expected) : 0;
      return {
        ...p,
        lastCheck: c
          ? {
              counted,
              expected,
              difference: roundMoney(counted - expected, p.currency).toNumber(),
              at: c.countedAt,
              note: c.note,
              checkedBy: c.countedBy?.name ?? null,
            }
          : null,
        movedSinceCheck: Boolean(c && p.lastMovedAt && p.lastMovedAt > c.countedAt),
      };
    });
}

/* ------------------------------------------------ the books against themselves */

export type BookCheck = {
  key: string;
  label: string;
  question: string;
  left: { label: string; value: number };
  right: { label: string; value: number };
  ok: boolean;
  chase: string;
  href: string;
};

/**
 * Figures asked twice, by two routes. These need no verdict — they are
 * arithmetic, and a disagreement is a fault to chase rather than an opinion.
 */
export async function bookChecks(): Promise<BookCheck[]> {
  const [verified, verifiedWithAccount, paidCosts, paidCostsWithAccount, bills] = await Promise.all([
    prisma.payment.count({ where: { status: "VERIFIED", writtenOff: false } }),
    prisma.payment.count({
      where: { status: "VERIFIED", writtenOff: false, accountId: { not: null } },
    }),
    prisma.containerExpense.count({
      where: { deletedAt: null, cancelledAt: null, status: { in: ["PAID", "PARTIAL"] } },
    }),
    prisma.containerExpense.count({
      where: {
        deletedAt: null,
        cancelledAt: null,
        status: { in: ["PAID", "PARTIAL"] },
        accountId: { not: null },
      },
    }),
    prisma.invoice.findMany({
      where: { status: { notIn: ["DRAFT", "CANCELLED"] } },
      select: {
        status: true,
        dueAt: true,
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
  ]);

  /* OVERDUE and PARTIALLY_PAID overlap by date, so only the settled/unsettled
     line is compared: a label that says PAID on a bill still owed, or unpaid on
     one that is settled, is the fault that matters at the counter. */
  const labelAgrees = bills.filter(
    (bill) => (bill.status === "PAID") === (impliedStatus(bill) === "PAID")
  ).length;

  return [
    {
      key: "posted",
      label: "Payments with an account",
      question: "Does every verified payment say which account the money reached?",
      left: { label: "Verified payments", value: verified },
      right: { label: "With an account", value: verifiedWithAccount },
      ok: verified === verifiedWithAccount,
      chase: "Open the payments and give each one the account it landed in.",
      href: "/app/finance/payments",
    },
    {
      key: "costs",
      label: "Paid costs with an account",
      question: "Does every cost marked paid say which account it left?",
      left: { label: "Costs marked paid", value: paidCosts },
      right: { label: "With an account", value: paidCostsWithAccount },
      ok: paidCosts === paidCostsWithAccount,
      chase: "Open the expenses and record where each payment came from.",
      href: "/app/finance/expenses",
    },
    {
      key: "status",
      label: "Bill labels against their payments",
      question: "Does every bill marked paid have the verified payments to prove it?",
      left: { label: "Live bills", value: bills.length },
      right: { label: "Label agrees", value: labelAgrees },
      ok: bills.length === labelAgrees,
      chase: "Open the bills and fix the label, or record the payment it is missing.",
      href: "/app/finance/invoices",
    },
  ];
}
