import "server-only";

import { Prisma, type Role } from "@prisma/client";

import { pendingCreditRequests } from "@/lib/credit";
import { isUsableRate, usdToTzs } from "@/lib/currency";
import { owedAcross, paymentTzs, totalTzsOf } from "@/lib/invoice-balance";
import { pendingPayrollApproval } from "@/lib/payroll";
import { currentExchangeRate } from "@/lib/pricing";
import { prisma } from "@/lib/prisma";
import type { Permission } from "@/lib/rbac";

/**
 * Everything in the company currently waiting on somebody to decide, and what
 * has lately been decided.
 *
 * ONE LIST, GATHERED, NOT A NEW PLACE TO DECIDE. Every queue below already has
 * a screen where the ruling is actually made, with its own guard, its own
 * evidence and its own audit row, and each entry here links straight into it.
 * A second surface that also approved things would be two code paths reaching
 * the same decision, and one of them would end up missing a check the other
 * has.
 *
 * The age is the oldest waiting item, not the average. An average of two hours
 * and nine days reads as four days and describes neither.
 */

export type QueueKey =
  | "credit"
  | "payments"
  | "prices"
  | "rates"
  | "statements"
  | "payroll"
  | "claims";

export type QueueDef = {
  key: QueueKey;
  label: string;
  /** What deciding it means, in the manager's words, not the schema's. */
  detail: string;
  href: string;
  /** Whether this reader may take the decision, or is only watching it. */
  permission: Permission;
};

const QUEUES: Record<QueueKey, QueueDef> = {
  credit: {
    key: "credit",
    label: "Credit requested",
    detail: "Cargo a customer wants to take now and pay for later.",
    href: "/app/finance/credit",
    permission: "payment.verify",
  },
  payments: {
    key: "payments",
    label: "Payments to verify",
    detail: "Money a desk says arrived. It counts for nothing until Finance checks it.",
    href: "/app/finance/collections/verify",
    permission: "payment.verify",
  },
  prices: {
    key: "prices",
    label: "Prices to confirm",
    detail: "Counted at Dar or priced in draft, and nobody has been billed yet.",
    href: "/app/containers/arrived?view=pricing",
    permission: "invoice.issue",
  },
  rates: {
    key: "rates",
    label: "Rate changes",
    /* Not waiting on anybody: a published rate is already in force. It sits on
       the board for a week so a price cannot move without the manager seeing
       that it moved. */
    detail: "The rate book or the dollar rate moved in the last seven days. Already in force.",
    href: "/app/finance/rates",
    permission: "rate.manage",
  },
  statements: {
    key: "statements",
    label: "Container statements to sign off",
    /* There is no signed-off flag on a container. A landed box whose every
       consignment has gone out of the gate has nothing left for the floor to
       do, so it is what is left for somebody to read the book of and close. */
    detail: "Landed, and every consignment on it has been collected. Read its book and close it.",
    href: "/app/finance/containers",
    permission: "container.close",
  },
  payroll: {
    key: "payroll",
    label: "Payroll to agree",
    detail: "The month's salaries, prepared by Finance. Nobody is paid until it is agreed.",
    href: "/app/manager/payroll",
    permission: "payroll.approve",
  },
  claims: {
    key: "claims",
    label: "Open claims",
    detail: "Cargo lost, short or damaged, and nobody has finished with it.",
    href: "/app/exceptions",
    permission: "exception.resolve",
  },
};

export type ApprovalQueue = QueueDef & {
  count: number;
  /**
   * Money riding on the queue, in whole shillings.
   *
   * Null where the queue is not about money, and null where a true total
   * cannot be struck — a dollar figure with no rate to put it into shillings.
   * A queue that cannot state its whole value states none: a total that has
   * quietly dropped some of its rows reads as an answer, a blank as a question.
   */
  valueTzs: Prisma.Decimal | null;
  /** Days the oldest item has been waiting. Null when the queue is empty. */
  oldestDays: number | null;
};

const DAY = 86_400_000;
const daysSince = (d: Date | null | undefined, now: Date) =>
  d ? Math.max(0, Math.floor((now.getTime() - d.getTime()) / DAY)) : null;
const oldestOf = (dates: (Date | null | undefined)[], now: Date) => {
  const times = dates.filter((d): d is Date => Boolean(d)).map((d) => d.getTime());
  return times.length > 0 ? daysSince(new Date(Math.min(...times)), now) : null;
};

/** Adds shillings, and gives up on the whole sum the moment one row has none. */
function sumOrNull(values: (Prisma.Decimal | null)[]): Prisma.Decimal | null {
  let total = new Prisma.Decimal(0);
  for (const value of values) {
    if (!value) return null;
    total = total.add(value);
  }
  return total;
}

const LIVE_BILL: Prisma.InvoiceWhereInput = { status: { notIn: ["DRAFT", "CANCELLED"] } };

/* ------------------------------------------------------------------ queues */

/**
 * Credit asked for and not answered, with what each consignment still owes.
 *
 * The request list is lib/credit.ts's, so this board and the credit screen
 * cannot disagree about what is waiting. A consignment already handed over on a
 * used note is past asking about, whatever order the rows were written in.
 */
async function creditQueue() {
  const requests = await pendingCreditRequests();
  if (requests.length === 0) return { rows: [], valueTzs: null };

  const cargo = await prisma.cargo.findMany({
    where: { id: { in: [...new Set(requests.map((r) => r.cargoId))] } },
    select: {
      id: true,
      pickupNote: { select: { status: true } },
      invoices: { where: LIVE_BILL, include: { payments: true } },
    },
  });
  const byId = new Map(cargo.map((c) => [c.id, c]));

  const rows = requests.filter((r) => {
    const c = byId.get(r.cargoId);
    return c && c.pickupNote?.status !== "USED" && c.pickupNote?.status !== "ACTIVE";
  });

  /* Counted once per consignment: two bills on one cargo asked about twice are
     one debt, and adding it twice would double what is riding on the queue. */
  const owed = [...new Set(rows.map((r) => r.cargoId))].map((id) => {
    const o = owedAcross(byId.get(id)?.invoices ?? []);
    return o.unconverted.greaterThan(0) ? null : o.tzs;
  });

  return { rows, valueTzs: rows.length > 0 ? sumOrNull(owed) : null };
}

/**
 * Payment claims Finance has not ruled on, oldest first.
 *
 * Each is valued in shillings by paymentTzs — at the rate pinned on the payment
 * or its bill, never today's — so the figure is what the balances will move by
 * once they are verified. A write-off rides on its payment and is not a claim.
 */
async function paymentQueue() {
  const payments = await prisma.payment.findMany({
    where: { status: "PENDING", writtenOff: false },
    orderBy: { createdAt: "asc" },
    select: {
      status: true,
      amount: true,
      currency: true,
      fxRate: true,
      baseCurrencyAmount: true,
      createdAt: true,
      invoice: { select: { fxRate: true } },
    },
  });
  return {
    rows: payments,
    valueTzs:
      payments.length > 0 ? sumOrNull(payments.map((p) => paymentTzs(p, p.invoice))) : null,
  };
}

/**
 * Consignments nobody has put a confirmed price on.
 *
 * Two routes into the same state, counted once per consignment: a bill still
 * in DRAFT, and cargo Dar has counted off a landed container with nothing live
 * billed against it — the arrived containers' "Waiting for prices" view.
 *
 * A draft carries no pinned rate yet; the rate is pinned when it is issued, and
 * today's is the rate it would be issued at. That is the only rate a draft's
 * shillings can honestly be struck at, and the row label says so.
 */
async function priceQueue(rate: Prisma.Decimal | null) {
  const [drafts, counted] = await Promise.all([
    prisma.invoice.findMany({
      where: { status: "DRAFT", cargo: { deletedAt: null } },
      select: {
        cargoId: true,
        total: true,
        currency: true,
        fxRate: true,
        totalTzs: true,
        createdAt: true,
      },
    }),
    prisma.cargo.findMany({
      where: {
        deletedAt: null,
        status: { not: "CANCELLED" },
        darReceiving: { isNot: null },
        invoices: { none: LIVE_BILL },
        containerLines: {
          some: {
            container: {
              deletedAt: null,
              status: { in: ["DEPARTED", "IN_TRANSIT", "ARRIVED", "CLOSED"] },
            },
          },
        },
      },
      select: { id: true, darReceiving: { select: { receivedAt: true } } },
    }),
  ]);

  const since = new Map<string, Date>();
  const note = (id: string, at: Date) => {
    const prior = since.get(id);
    if (!prior || at < prior) since.set(id, at);
  };
  for (const d of drafts) note(d.cargoId, d.createdAt);
  for (const c of counted) if (c.darReceiving) note(c.id, c.darReceiving.receivedAt);

  const value =
    drafts.length > 0
      ? sumOrNull(
          drafts.map(
            (d) =>
              totalTzsOf(d) ??
              (d.currency === "USD" && rate ? usdToTzs(d.total, rate) : null)
          )
        )
      : null;

  return { count: since.size, oldest: [...since.values()], valueTzs: value };
}

/**
 * Landed containers with nothing left on the floor.
 *
 * Aged from the last hand-over on the box: that is the moment the floor's work
 * ended and the book became somebody else's to read. The value is what was
 * billed on it, each bill at its own pinned shillings.
 */
async function statementQueue() {
  const containers = await prisma.container.findMany({
    where: { deletedAt: null, status: "ARRIVED", cargoLines: { some: {} } },
    select: {
      id: true,
      updatedAt: true,
      cargoLines: {
        select: {
          id: true,
          cargo: {
            select: {
              status: true,
              deletedAt: true,
              release: { select: { releasedAt: true } },
              invoices: {
                where: LIVE_BILL,
                select: {
                  containerCargoId: true,
                  total: true,
                  currency: true,
                  fxRate: true,
                  totalTzs: true,
                },
              },
            },
          },
        },
      },
    },
  });

  const done = containers.filter((c) => {
    const live = c.cargoLines.filter(
      (l) => !l.cargo.deletedAt && l.cargo.status !== "CANCELLED"
    );
    return (
      live.length > 0 &&
      live.every((l) => l.cargo.status === "COLLECTED" || l.cargo.status === "DELIVERED")
    );
  });

  const lastOut = done.map((c) => {
    const times = c.cargoLines
      .map((l) => l.cargo.release?.releasedAt?.getTime())
      .filter((t): t is number => typeof t === "number");
    return times.length > 0 ? new Date(Math.max(...times)) : c.updatedAt;
  });

  const bills = done.flatMap((c) =>
    c.cargoLines.flatMap((l) =>
      /* A consignment split across two sailings carries a bill per sailing;
         only this line's bill belongs to this box. */
      l.cargo.invoices.filter((i) => i.containerCargoId === l.id || i.containerCargoId === null)
    )
  );

  return {
    rows: done,
    lastOut,
    valueTzs: bills.length > 0 ? sumOrNull(bills.map((b) => totalTzsOf(b))) : null,
  };
}

export async function approvalQueues(now = new Date()): Promise<ApprovalQueue[]> {
  const rateRow = await currentExchangeRate();
  const rate = rateRow && isUsableRate(rateRow.rate) ? new Prisma.Decimal(rateRow.rate) : null;

  const [credit, payments, prices, rates, statements, claims, payroll] = await Promise.all([
    creditQueue(),
    paymentQueue(),
    priceQueue(rate),
    prisma.auditLog.findMany({
      where: {
        action: { in: ["rate.publish", "rate.edit", "rate.delete", "fx.set"] },
        createdAt: { gte: new Date(now.getTime() - 7 * DAY) },
      },
      orderBy: { createdAt: "asc" },
      select: { createdAt: true },
    }),
    statementQueue(),
    prisma.exceptionCase.findMany({
      where: { status: { notIn: ["RESOLVED", "CLOSED"] } },
      orderBy: { createdAt: "asc" },
      select: { createdAt: true },
    }),
    /* The payroll screen's own reader, so this board and that screen cannot
       disagree about which runs are waiting. */
    pendingPayrollApproval(now),
  ]);

  /* A run is written in dollars. Its shillings are struck at today's rate —
     the rate it would be paid at — and with no rate the queue states no total. */
  const payrollTzs =
    payroll.length > 0 && rate
      ? payroll.reduce((n, run) => n.add(usdToTzs(run.totals.net, rate)), new Prisma.Decimal(0))
      : null;

  return [
    {
      ...QUEUES.credit,
      count: credit.rows.length,
      valueTzs: credit.valueTzs,
      oldestDays: daysSince(credit.rows[0]?.askedAt, now),
    },
    {
      ...QUEUES.payments,
      count: payments.rows.length,
      valueTzs: payments.valueTzs,
      oldestDays: daysSince(payments.rows[0]?.createdAt, now),
    },
    {
      ...QUEUES.prices,
      count: prices.count,
      valueTzs: prices.valueTzs,
      oldestDays: oldestOf(prices.oldest, now),
    },
    {
      ...QUEUES.rates,
      count: rates.length,
      valueTzs: null,
      oldestDays: daysSince(rates[0]?.createdAt, now),
    },
    {
      ...QUEUES.statements,
      /* One box names its own book; several go to the list of them. */
      href:
        statements.rows.length === 1
          ? `/app/finance/containers/${statements.rows[0].id}`
          : QUEUES.statements.href,
      count: statements.rows.length,
      valueTzs: statements.valueTzs,
      oldestDays: oldestOf(statements.lastOut, now),
    },
    {
      ...QUEUES.payroll,
      count: payroll.length,
      valueTzs: payrollTzs,
      oldestDays: payroll.length > 0 ? payroll[0].waitingDays : null,
    },
    {
      ...QUEUES.claims,
      count: claims.length,
      valueTzs: null,
      oldestDays: daysSince(claims[0]?.createdAt, now),
    },
  ];
}

/* ------------------------------------------------------------ what was ruled */

export type DecisionOutcome = "approved" | "rejected";

type DecisionDef = {
  outcome: DecisionOutcome;
  /** The screen the ruling was made on, or the record it was made about. */
  href: (entityId: string | null) => string;
};

/**
 * The audit actions that ARE decisions, and which way each one went.
 *
 * Read off the log rather than recorded again. Every one of these rulings
 * writes its audit row when it is made, so the log is the only account of a
 * decision that cannot disagree with the decision.
 *
 * Two of them need more than the action code. A pickup note is a credit ruling
 * only when it was written on credit, and a case update is a ruling only when
 * it finished the case; both are narrowed below, in the query.
 */
const DECISIONS: Record<string, DecisionDef> = {
  "payment.verify": { outcome: "approved", href: () => "/app/finance/collections/verify" },
  "payment.reject": { outcome: "rejected", href: () => "/app/finance/collections/sent-back" },
  /* Taken back after it was counted. The money was ruled on twice, and the
     second ruling went the other way. */
  "payment.reverse": { outcome: "rejected", href: () => "/app/finance/payments" },
  "pickupNote.issue": { outcome: "approved", href: () => "/app/finance/credit" },
  "pickupNote.cancel": { outcome: "rejected", href: () => "/app/finance/credit" },
  "container.pricing.confirm": {
    outcome: "approved",
    href: (id) => (id ? `/app/finance/containers/${id}` : "/app/containers/arrived"),
  },
  "payroll.approve": { outcome: "approved", href: () => "/app/manager/payroll" },
  "payroll.runNow": { outcome: "approved", href: () => "/app/manager/payroll" },
  "payroll.reject": { outcome: "rejected", href: () => "/app/manager/payroll" },
  "exception.update": {
    outcome: "approved",
    href: (id) => (id ? `/app/exceptions/${id}` : "/app/exceptions"),
  },
};

export type Decision = {
  id: string;
  outcome: DecisionOutcome;
  /** The stored action code and summary, handed over untouched. */
  action: string;
  summary: string;
  /** Name, else the email the log kept, else null for something the system did. */
  actor: string | null;
  role: Role | null;
  at: Date;
  href: string;
};

const actionsFor = (outcome: DecisionOutcome) =>
  Object.keys(DECISIONS).filter((action) => DECISIONS[action].outcome === outcome);

/**
 * The last rulings, newest first.
 *
 * A window PER OUTCOME rather than one shared between them. Verifications
 * outnumber refusals many times over, so a single window of thirty would be
 * thirty verifications in a busy week and the one payment sent back would have
 * fallen off the end of it. The refusal is the row somebody came here to find.
 */
export async function decisionHistory(take = 30): Promise<Decision[]> {
  const select = {
    id: true,
    action: true,
    entityId: true,
    summary: true,
    actorEmail: true,
    actorRole: true,
    createdAt: true,
    // Denormalised email is the fallback: the log outlives the staff record.
    actor: { select: { name: true } },
  } as const;

  /* Over-read, then narrowed: the credit and case filters are applied after the
     fetch, and a window of exactly `take` would come back short. */
  const [approved, rejected] = await Promise.all(
    (["approved", "rejected"] as const).map((outcome) =>
      prisma.auditLog.findMany({
        where: {
          action: { in: actionsFor(outcome) },
          NOT: {
            action: "exception.update",
            AND: [
              { summary: { not: { contains: "→ RESOLVED" } } },
              { summary: { not: { contains: "→ CLOSED" } } },
            ],
          },
        },
        orderBy: { createdAt: "desc" },
        take: take * 4,
        select,
      })
    )
  );

  const noteIds = [...approved, ...rejected]
    .filter((r) => r.action.startsWith("pickupNote.") && r.entityId)
    .map((r) => r.entityId as string);
  const creditNotes = new Set(
    noteIds.length > 0
      ? (
          await prisma.pickupNote.findMany({
            where: { id: { in: noteIds }, onCredit: true },
            select: { id: true },
          })
        ).map((n) => n.id)
      : []
  );

  const keep = (row: (typeof approved)[number]) =>
    !row.action.startsWith("pickupNote.") || creditNotes.has(row.entityId ?? "");

  return [...approved.filter(keep).slice(0, take), ...rejected.filter(keep).slice(0, take)]
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .map((row) => {
      const def = DECISIONS[row.action];
      return {
        id: row.id,
        outcome: def.outcome,
        action: row.action,
        summary: row.summary,
        actor: row.actor?.name ?? row.actorEmail ?? null,
        role: row.actorRole,
        at: row.createdAt,
        href: def.href(row.entityId),
      };
    });
}
