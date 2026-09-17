import "server-only";

import { Prisma, type PayrollStatus } from "@prisma/client";

import { recordAudit } from "@/lib/audit";
import { ROLE_LABELS } from "@/lib/constants";
import { formatCurrency, isUsableRate, roundMoney, usdToTzs } from "@/lib/currency";
import { t, type Locale } from "@/lib/i18n";
import { nextExpenseReference } from "@/lib/ids";
import { currentExchangeRate } from "@/lib/pricing";
import { prisma, type TxClient } from "@/lib/prisma";
import type { SessionUser } from "@/lib/session";

/**
 * THE MONTH'S SALARIES, READ AND MOVED.
 *
 * A run is the one money document here whose figures are SNAPSHOTS rather than
 * derivations — the reason is on PayrollItem in the schema, and it is about a
 * slip for a month that has already happened. The totals are the exception to
 * that exception: they are summed from the lines on every read rather than
 * stored on the header, because a header total and an edited line are two
 * answers to one question, and the wrong one is the one somebody signs.
 *
 * The steps live here rather than in the server actions so each one is a
 * function of a transaction and an actor: the actions authorize and call them,
 * and nothing else reaches the rows. Four of the five steps move no money.
 * Paying is the only one that touches an account, and it does what every other
 * cost does — books a ContainerExpense against the account — so payroll reaches
 * the general ledger, the balances and the profit and loss by the one route
 * those screens already read.
 */

type Numeric = Prisma.Decimal | number | string | null | undefined;
const D = (value: Numeric) => new Prisma.Decimal(value ?? 0);

export type PayrollLine = {
  gross: Numeric;
  allowance: Numeric;
  deduction: Numeric;
  net: Numeric;
};

export type PayrollTotals = {
  gross: number;
  allowance: number;
  deduction: number;
  /** What actually leaves the account. USD, like the salary it came from. */
  net: number;
  headcount: number;
};

/** The two statuses the run still belongs to Finance in. */
export const EDITABLE: PayrollStatus[] = ["DRAFT", "REJECTED"];

/** The cost category a paid run is filed under on the ledger and the P&L. */
export const SALARIES_CATEGORY = "Salaries";

/**
 * The code a month's run is known by: PR-2026-08.
 *
 * Composed from the period rather than drawn from Counter, unlike every other
 * document number here. Those number things that arrive in an order nobody
 * chooses; a salary run is one per month by database constraint, so the month
 * IS the identity — and a composed code can never drift from the two columns it
 * describes. The cost it becomes when paid takes its EXP number from Counter
 * like any other.
 */
export function codeFor(year: number, month: number) {
  return `PR-${year}-${String(month).padStart(2, "0")}`;
}

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export function monthLabel(year: number, month: number) {
  return `${MONTH_NAMES[month - 1] ?? month} ${year}`;
}

/**
 * What a set of lines adds up to. Pure — no database, no request.
 *
 * Decimal throughout and rounded per column to the cent: thirty salaries summed
 * through doubles leave a net that disagrees with the sum of the slips by a
 * cent, on the one screen where a cent out is read as a mistake in somebody's
 * pay.
 */
export function runTotals(items: PayrollLine[]): PayrollTotals {
  const column = (pick: (line: PayrollLine) => Numeric) =>
    roundMoney(
      items.reduce((sum, line) => sum.add(D(pick(line))), D(0)),
      "USD"
    ).toNumber();
  return {
    gross: column((l) => l.gross),
    allowance: column((l) => l.allowance),
    deduction: column((l) => l.deduction),
    net: column((l) => l.net),
    headcount: items.length,
  };
}

/**
 * A payroll figure in the currency balances are kept in.
 *
 * Shillings at the published rate when there is one; the dollar figure alone
 * when there is not, rather than a shilling figure struck at a guess.
 */
export function shillingsOf(usd: number, rate: Numeric) {
  return isUsableRate(rate)
    ? formatCurrency(usdToTzs(usd, rate), "TZS")
    : formatCurrency(usd, "USD");
}

/** The money columns every read below totals from, and nothing else. */
const LINE_MONEY = {
  gross: true,
  allowance: true,
  deduction: true,
  net: true,
} as const;

/**
 * Every run, newest month first.
 *
 * Ordered on (year, month) rather than on when the row was made, because a run
 * built late for a month that has passed belongs where the month is. The lines
 * are fetched only to be summed and dropped from the result.
 */
export async function payrollRuns(take = 24) {
  const runs = await prisma.payrollRun.findMany({
    orderBy: [{ year: "desc" }, { month: "desc" }],
    take,
    include: {
      preparedBy: { select: { id: true, name: true } },
      approvedBy: { select: { id: true, name: true } },
      account: { select: { id: true, bankName: true, currency: true } },
      /* A PAID month is printed from what the bank moved — the cost's own
         amount, currency and cancellation — never re-priced at today's rate. */
      expense: {
        select: { reference: true, amount: true, currency: true, cancelledAt: true },
      },
      items: { select: LINE_MONEY },
    },
  });

  return runs.map(({ items, ...run }) => ({ ...run, totals: runTotals(items) }));
}

/**
 * One run, with everything the screen that decides on it has to show.
 *
 * The lines carry `userId` but the staff record is deliberately NOT joined. A
 * slip says what somebody was paid in August; reading their name through the
 * relation would restate August every time they are renamed or leave.
 */
export async function payrollRun(id: string) {
  const run = await prisma.payrollRun.findUnique({
    where: { id },
    include: {
      preparedBy: { select: { id: true, name: true, email: true } },
      approvedBy: { select: { id: true, name: true } },
      paidBy: { select: { id: true, name: true } },
      account: { select: { id: true, bankName: true, currency: true, active: true } },
      expense: {
        select: {
          id: true,
          reference: true,
          amount: true,
          currency: true,
          fxRate: true,
          paidDate: true,
          cancelledAt: true,
        },
      },
      items: { orderBy: [{ name: "asc" }] },
    },
  });
  if (!run) return null;

  return { ...run, totals: runTotals(run.items) };
}

export type RosterEntry = {
  id: string;
  name: string;
  roleLabel: string;
  /** USD a month. The screen prints shillings at the published rate. */
  baseSalary: number;
};

/**
 * Who a run gets built from.
 *
 * Three conditions, and each excludes a different mistake. `active` is the
 * account switch — a leaver keeps their history and stops being paid.
 * `status ACTIVE` catches somebody suspended, who must not be run through this
 * month's salaries by default. A null `baseSalary` means nobody has said what
 * this person earns, and a run that guessed zero would print a slip claiming
 * they are owed nothing rather than leaving them off it.
 */
export async function payrollRoster(client: TxClient | typeof prisma = prisma): Promise<RosterEntry[]> {
  const staff = await client.user.findMany({
    where: {
      active: true,
      status: "ACTIVE",
      role: { not: "CUSTOMER" },
      baseSalary: { not: null },
    },
    orderBy: [{ name: "asc" }],
    select: { id: true, name: true, role: true, baseSalary: true },
  });

  return staff.map((person) => ({
    id: person.id,
    name: person.name,
    // The label the rest of the app calls this role, frozen onto the line. The
    // enum value is a database word; a slip is read by the person it pays.
    roleLabel: ROLE_LABELS[person.role],
    baseSalary: D(person.baseSalary).toNumber(),
  }));
}

const DAY = 86_400_000;

/**
 * Runs sitting on the manager's desk, the one that has waited longest first.
 *
 * Oldest first, with the wait in days: a queue read newest-first hides the item
 * that has been ignored, and salaries are the one bill in the company where
 * waiting is felt by everybody in it.
 */
export async function pendingPayrollApproval(now = new Date()) {
  const runs = await prisma.payrollRun.findMany({
    where: { status: "PENDING_APPROVAL" },
    orderBy: [{ submittedAt: "asc" }],
    include: {
      preparedBy: { select: { id: true, name: true } },
      account: { select: { id: true, bankName: true, currency: true } },
      items: { select: LINE_MONEY },
    },
  });

  return runs.map(({ items, ...run }) => ({
    ...run,
    totals: runTotals(items),
    waitingDays: Math.max(
      0,
      Math.floor((now.getTime() - (run.submittedAt ?? run.preparedAt).getTime()) / DAY)
    ),
  }));
}

/* ======================================================================== */
/* The steps                                                                 */
/* ======================================================================== */

/*
  Why a step is refused, keyed by the status the run is already in.

  Keyed rather than interpolated: a whole sentence per status is one
  dictionary entry each, where a composed one is a status word dropped wherever
  English happens to put it.
*/
const NOT_EDITABLE: Record<string, string> = {
  PENDING_APPROVAL:
    "is with the manager and is frozen while it waits. It has to come back before a figure on it can change.",
  APPROVED: "has been agreed, so its figures are settled.",
  PAID: "has been paid, so it cannot be changed.",
};

const NOT_DECIDABLE: Record<string, string> = {
  DRAFT: "has not been sent up yet, so there is nothing to decide.",
  APPROVED: "has already been agreed.",
  REJECTED: "has already been sent back.",
  PAID: "has already been paid.",
};

const NOT_PAYABLE: Record<string, string> = {
  DRAFT: "has not been sent for approval, so it cannot be paid.",
  PENDING_APPROVAL: "is still waiting to be agreed, so it cannot be paid.",
  REJECTED: "was sent back. Finance fixes it and it is agreed again before anybody is paid.",
  PAID: "has already been paid.",
};

/** A refusal the person at the screen can read, already in their language. */
export class PayrollRefusal extends Error {}

const refuse = (message: string): never => {
  throw new PayrollRefusal(message);
};

function assertStarted(year: number, month: number, locale: Locale) {
  /* A month that has not started has no salaries in it yet. Building one is a
     mis-typed year in practice, and it would take the one-per-month slot the
     real run needs when the month finally comes. */
  if (new Date(year, month - 1, 1).getTime() > Date.now()) {
    refuse(`${codeFor(year, month)} ${t(locale, "is a month that has not started yet.")}`);
  }
}

async function assertMonthFree(tx: TxClient, year: number, month: number, locale: Locale) {
  /* Checked rather than left to the constraint, because the answer is a door.
     "PR-2026-08 already covers that month" tells Finance to open it; the
     constraint's own error tells them to try again, which they will, forever. */
  const existing = await tx.payrollRun.findUnique({
    where: { year_month: { year, month } },
    select: { code: true },
  });
  if (existing) {
    refuse(
      `${existing.code} ${t(locale, "already covers that month. Open it instead of building a second one.")}`
    );
  }
}

function rosterLines(roster: RosterEntry[]) {
  return roster.map((person) => ({
    userId: person.id,
    /* Snapshots, copied off the staff record now and never read through it
       again — see the note on PayrollItem in the schema. */
    name: person.name,
    roleLabel: person.roleLabel,
    gross: D(person.baseSalary),
    allowance: D(0),
    deduction: D(0),
    net: D(person.baseSalary),
  }));
}

const NOBODY_ON_PAYROLL =
  "Nobody on the staff register has a monthly salary set, so there is nothing to build. Set salaries on the staff records first.";

/**
 * Finance builds the month from the staff register.
 *
 * Built rather than typed: the names, roles and salaries already exist on the
 * staff records, and a run keyed in by hand is a second register that disagrees
 * with the first by one leaver a month. What Finance then edits is the
 * exceptions — an allowance, an advance being recovered.
 */
export async function buildRun(
  tx: TxClient,
  actor: SessionUser,
  input: { year: number; month: number },
  locale: Locale = "en"
) {
  const { year, month } = input;
  assertStarted(year, month, locale);

  const roster = await payrollRoster(tx);
  if (roster.length === 0) refuse(t(locale, NOBODY_ON_PAYROLL));

  await assertMonthFree(tx, year, month, locale);

  const created = await tx.payrollRun.create({
    data: {
      code: codeFor(year, month),
      year,
      month,
      preparedById: actor.id,
      items: { create: rosterLines(roster) },
    },
    select: { id: true, code: true },
  });

  const gross = runTotals(rosterLines(roster)).gross;
  await recordAudit(
    {
      actor,
      action: "payroll.build",
      entity: "PayrollRun",
      entityId: created.id,
      summary: `Built ${created.code} — ${roster.length} staff, USD ${gross.toFixed(2)}`,
    },
    tx
  );

  return { ...created, headcount: roster.length };
}

/**
 * Finance edits one person's line.
 *
 * Gross is not editable here on purpose. What somebody is paid a month is a
 * fact about their employment and lives on their staff record; changing it on
 * a run would give a raise for one month that nobody agreed and nothing
 * remembers. An allowance and a deduction are true of this month only, which is
 * exactly why they are columns on the line.
 */
export async function updateItem(
  tx: TxClient,
  actor: SessionUser,
  input: { itemId: string; allowance: number; deduction: number; note?: string | null },
  locale: Locale = "en"
) {
  const item = await tx.payrollItem.findUnique({
    where: { id: input.itemId },
    select: {
      id: true,
      name: true,
      gross: true,
      allowance: true,
      deduction: true,
      run: { select: { id: true, code: true, status: true } },
    },
  });
  if (!item) return refuse(t(locale, "That salary line no longer exists."));

  if (!EDITABLE.includes(item.run.status)) {
    refuse(
      `${item.run.code} ${t(
        locale,
        NOT_EDITABLE[item.run.status] ?? "cannot be changed from its current status."
      )}`
    );
  }

  const allowance = roundMoney(input.allowance, "USD");
  const deduction = roundMoney(input.deduction, "USD");
  const net = roundMoney(D(item.gross).add(allowance).sub(deduction), "USD");
  /* A negative net is not a salary, it is a bill sent to the employee. An
     advance larger than the month's pay is recovered across months, which is a
     decision somebody takes, not one this form makes silently. */
  if (net.isNegative()) {
    refuse(`${item.name}: ${t(locale, "a deduction cannot take a month's pay below zero.")}`);
  }

  /* Scoped through the run's status as well as the line's id, so an edit that
     started while the run was still Finance's cannot land a moment after it was
     sent up — and change a figure the manager is already reading. */
  const claimed = await tx.payrollItem.updateMany({
    where: { id: item.id, run: { status: { in: EDITABLE } } },
    data: { allowance, deduction, net, note: input.note?.trim() || null },
  });
  if (claimed.count === 0) {
    refuse(
      t(
        locale,
        "That run was sent for approval a moment ago, so it can no longer be edited. Reload the page."
      )
    );
  }

  await recordAudit(
    {
      actor,
      action: "payroll.updateItem",
      entity: "PayrollRun",
      entityId: item.run.id,
      summary: `Edited ${item.name} on ${item.run.code} — allowance USD ${allowance.toFixed(
        2
      )}, deduction USD ${deduction.toFixed(2)}, net USD ${net.toFixed(2)}`,
      metadata: {
        itemId: item.id,
        before: { allowance: item.allowance.toString(), deduction: item.deduction.toString() },
        after: { allowance: allowance.toString(), deduction: deduction.toString() },
      },
    },
    tx
  );

  return net.toNumber();
}

/**
 * Finance sends the month up.
 *
 * The account is required HERE rather than at payment: the manager has to be
 * agreeing to a payment out of a named account with a balance he can check,
 * not to a total. Choosing it afterwards would let an agreed figure be paid
 * from somewhere nobody agreed to.
 */
export async function submitRun(
  tx: TxClient,
  actor: SessionUser,
  input: { runId: string; accountId: string; note?: string | null },
  locale: Locale = "en"
) {
  const run = await tx.payrollRun.findUnique({
    where: { id: input.runId },
    select: { id: true, code: true, status: true, items: { select: LINE_MONEY } },
  });
  if (!run) return refuse(t(locale, "That run no longer exists."));

  if (!EDITABLE.includes(run.status)) {
    refuse(
      `${run.code} ${t(locale, NOT_EDITABLE[run.status] ?? "cannot be sent from its current status.")}`
    );
  }

  const totals = runTotals(run.items);
  if (totals.headcount === 0) {
    refuse(`${run.code} ${t(locale, "has nobody on it, so there is nothing to agree.")}`);
  }

  const account = await tx.bankAccount.findUnique({
    where: { id: input.accountId },
    select: { id: true, bankName: true, currency: true, active: true },
  });
  if (!account) return refuse(t(locale, "That account no longer exists."));
  if (!account.active) refuse(`${account.bankName} ${t(locale, "has been archived.")}`);

  /* The claim, and what it stops is two clicks on one button: the second finds
     the run already sent and changes nothing, rather than stamping a second
     submission time over the age the manager is being shown. */
  const claimed = await tx.payrollRun.updateMany({
    where: { id: run.id, status: { in: EDITABLE } },
    data: {
      status: "PENDING_APPROVAL",
      submittedAt: new Date(),
      accountId: account.id,
      note: input.note?.trim() || null,
      /* Last time's ruling goes with it. A run waiting for a decision that
         still carries the previous rejection reads as already refused. */
      approvedById: null,
      approvedAt: null,
      decisionNote: null,
    },
  });
  if (claimed.count === 0) {
    refuse(
      t(locale, "That run was sent for approval a moment ago. Reload the page before trying again.")
    );
  }

  await recordAudit(
    {
      actor,
      action: "payroll.submit",
      entity: "PayrollRun",
      entityId: run.id,
      summary: `Sent ${run.code} for approval — ${totals.headcount} staff, USD ${totals.net.toFixed(
        2
      )} from ${account.bankName} (${account.currency})`,
    },
    tx
  );

  return run.code;
}

/**
 * The manager agrees the month — which pays it — or sends it back.
 *
 * ACCEPTING IS THE PAYMENT. The owner's rule: when the manager accepts, the
 * total is deducted and written as salary. A separate pay button left an agreed
 * run sitting in a state where the manager believes salaries are paid and the
 * account disagrees. Same transaction, so an acceptance either books the money
 * or fails whole with the run still waiting.
 */
export async function decideRun(
  tx: TxClient,
  actor: SessionUser,
  input: { runId: string; decision: "APPROVED" | "REJECTED"; decisionNote?: string | null },
  locale: Locale = "en"
) {
  const note = input.decisionNote?.trim() ?? "";

  const run = await tx.payrollRun.findUnique({
    where: { id: input.runId },
    select: {
      id: true,
      code: true,
      status: true,
      preparedById: true,
      items: { select: LINE_MONEY },
    },
  });
  if (!run) return refuse(t(locale, "That run no longer exists."));

  if (run.status !== "PENDING_APPROVAL") {
    refuse(
      `${run.code} ${t(locale, NOT_DECIDABLE[run.status] ?? "cannot be decided from its current status.")}`
    );
  }

  /*
    Nobody agrees their own run.

    The permissions alone do not stop this: the owner and the manager both hold
    payroll.prepare, so either could build a month and then sign it. Two steps
    that one person can walk end to end are one step with extra clicks, so the
    refusal is here, on the identity, rather than in a role list that cannot
    express it.
  */
  if (run.preparedById === actor.id) {
    refuse(
      `${run.code} ${t(
        locale,
        "was prepared by you, so somebody else has to agree it. That split is the whole control."
      )}`
    );
  }

  const claimed = await tx.payrollRun.updateMany({
    where: { id: run.id, status: "PENDING_APPROVAL" },
    data: {
      status: input.decision,
      approvedById: actor.id,
      approvedAt: new Date(),
      decisionNote: note || null,
    },
  });
  if (claimed.count === 0) {
    refuse(t(locale, "Somebody decided this run a moment ago. Reload the page to see what they said."));
  }

  const totals = runTotals(run.items);
  await recordAudit(
    {
      actor,
      action: input.decision === "APPROVED" ? "payroll.approve" : "payroll.reject",
      entity: "PayrollRun",
      entityId: run.id,
      summary:
        input.decision === "APPROVED"
          ? `Agreed ${run.code} — ${totals.headcount} staff, USD ${totals.net.toFixed(2)}`
          : note
            ? `Sent ${run.code} back — ${note}`
            : `Sent ${run.code} back`,
      metadata: { decisionNote: note || null },
    },
    tx
  );

  if (input.decision === "APPROVED") {
    const reference = await settleApprovedRun(tx, actor, { runId: run.id, paidAt: null }, locale);
    return { status: "PAID" as const, reference };
  }
  return { status: "REJECTED" as const, reference: null };
}

/**
 * THE MONEY LEAVES HERE, AND ONLY HERE.
 *
 * One Salaries cost for the run's total — never a line per worker. The ledger
 * shows that salaries left and how much; the thirty names live on the run, one
 * hop away through expenseId.
 *
 * The run is written in dollars and the account decides what actually leaves
 * it. A shilling account converts once, here, through lib/currency.ts at the
 * published rate, and the rate is frozen onto the cost — re-reading it later at
 * a different rate would restate what was paid.
 */
export async function settleApprovedRun(
  tx: TxClient,
  actor: SessionUser,
  input: { runId: string; paidAt: Date | null },
  locale: Locale = "en"
): Promise<string> {
  const run = await tx.payrollRun.findUnique({
    where: { id: input.runId },
    select: {
      id: true,
      code: true,
      status: true,
      expenseId: true,
      account: { select: { id: true, bankName: true, currency: true, active: true } },
      items: { select: LINE_MONEY },
    },
  });
  if (!run) return refuse(t(locale, "That run no longer exists."));

  if (run.status !== "APPROVED") {
    refuse(`${run.code} ${t(locale, NOT_PAYABLE[run.status] ?? "cannot be paid from its current status.")}`);
  }
  /* The column is unique, so a second cost would fail anyway — this is the
     version of that failure a person can read. */
  if (run.expenseId) {
    refuse(`${run.code} ${t(locale, "has already been booked as an expense.")}`);
  }

  const account = run.account;
  if (!account) {
    return refuse(
      `${run.code} ${t(locale, "names no account, so there is nothing to pay it from. Send it back to Finance.")}`
    );
  }
  if (!account.active) {
    refuse(
      `${account.bankName} ${t(
        locale,
        "has been archived, so nothing can leave it. Send the run back to Finance to name another account."
      )}`
    );
  }

  const totals = runTotals(run.items);
  if (totals.net <= 0) {
    refuse(`${run.code} ${t(locale, "adds up to nothing, so there is nothing to pay.")}`);
  }

  const usd = roundMoney(totals.net, "USD");
  let amount = usd;
  let fxRate = D(1);
  if (account.currency !== "USD") {
    const rateRow = await currentExchangeRate(tx);
    if (!rateRow || !isUsableRate(rateRow.rate) || D(rateRow.rate).lessThanOrEqualTo(1)) {
      refuse(
        t(
          locale,
          "No exchange rate is set, so a dollar salary bill cannot be paid out of a shilling account. Set today's rate first."
        )
      );
    }
    fxRate = D(rateRow!.rate);
    amount = usdToTzs(usd, fxRate);
  }

  const paidAt = input.paidAt ?? new Date();

  /*
    The claim, taken BEFORE anything is written.

    Two people settling at the same moment both read APPROVED; the second one's
    update finds the row already PAID and touches nothing, so it throws before
    a cost exists. Reversed — cost first, status after — the loser of the race
    would already have booked a second month's salaries against the account.
  */
  const claimed = await tx.payrollRun.updateMany({
    where: { id: run.id, status: "APPROVED", expenseId: null },
    data: { status: "PAID", paidAt, paidById: actor.id },
  });
  if (claimed.count === 0) {
    refuse(t(locale, "This run was paid by somebody else a moment ago. Reload the page before trying again."));
  }

  const category = await tx.expenseType.upsert({
    where: { name: SALARIES_CATEGORY },
    update: {},
    create: { name: SALARIES_CATEGORY },
    select: { id: true },
  });

  const reference = await nextExpenseReference(tx, paidAt.getFullYear());
  const description = `Salaries ${run.code} — ${totals.headcount} staff`;
  const expense = await tx.containerExpense.create({
    data: {
      reference,
      /* The company's own running cost, never a sailing's: charging wages to
         one container would make that container's margin a lie. */
      scope: "OFFICE",
      expenseTypeId: category.id,
      accountId: account.id,
      amount,
      currency: account.currency,
      fxRate,
      status: "PAID",
      expenseDate: paidAt,
      paidDate: paidAt,
      referenceNumber: run.code,
      description,
      recordedById: actor.id,
    },
    select: { id: true },
  });

  await tx.payrollRun.update({
    where: { id: run.id },
    data: { expenseId: expense.id },
  });

  await recordAudit(
    {
      actor,
      action: "payroll.pay",
      entity: "PayrollRun",
      entityId: run.id,
      summary: `Paid ${run.code} — ${formatCurrency(amount, account.currency)} from ${account.bankName} (${totals.headcount} staff) as ${reference}`,
      metadata: {
        expenseReference: reference,
        netUsd: usd.toString(),
        amount: amount.toString(),
        currency: account.currency,
        fxRate: fxRate.toString(),
      },
    },
    tx
  );

  return reference;
}

/**
 * THE MANAGER RUNS THE MONTH HIMSELF, in one action.
 *
 * The two-step month keeps its same-person guard; this is the deliberate
 * exception to it, behind payroll.approve, and the audit trail says in one line
 * that one person did the whole thing. If Finance already built the month, this
 * refuses and points at their run instead of racing it.
 */
export async function runNow(
  tx: TxClient,
  actor: SessionUser,
  input: { year: number; month: number; accountId: string },
  locale: Locale = "en"
) {
  const { year, month } = input;
  assertStarted(year, month, locale);

  const roster = await payrollRoster(tx);
  if (roster.length === 0) refuse(t(locale, NOBODY_ON_PAYROLL));

  await assertMonthFree(tx, year, month, locale);

  const account = await tx.bankAccount.findUnique({
    where: { id: input.accountId },
    select: { id: true, active: true },
  });
  if (!account || !account.active) {
    refuse(t(locale, "That account is not live, so nothing can leave it. Choose another."));
  }

  const now = new Date();
  const created = await tx.payrollRun.create({
    data: {
      code: codeFor(year, month),
      year,
      month,
      status: "APPROVED",
      preparedById: actor.id,
      submittedAt: now,
      approvedById: actor.id,
      approvedAt: now,
      decisionNote: "Run and paid in one action.",
      accountId: input.accountId,
      items: { create: rosterLines(roster) },
    },
    select: { id: true, code: true },
  });

  await recordAudit(
    {
      actor,
      action: "payroll.runNow",
      entity: "PayrollRun",
      entityId: created.id,
      summary: `Built, agreed and paid ${created.code} in one action — ${roster.length} staff`,
    },
    tx
  );

  const reference = await settleApprovedRun(tx, actor, { runId: created.id, paidAt: null }, locale);
  return { code: created.code, reference, headcount: roster.length };
}

/** One payroll figure as the screens print it: shillings leading, dollars under. */
export type PayrollFigure = { lead: string; sub: string | null };

/**
 * A payroll figure written out for a screen or a slip.
 *
 * `paid` is the cost as the bank actually moved it, for a run already PAID:
 * when present it replaces the conversion at `rate`, so a paid month keeps
 * saying what it said on the day whatever the rate has done since. Nothing is
 * printed underneath when the lead already is the dollar figure — the same
 * number twice reads as two amounts that happen to agree.
 */
export function payrollFigure(
  usd: number,
  rate: Numeric,
  paid?: { amount: Numeric; currency: string } | null
): PayrollFigure {
  if (paid) {
    return {
      lead: formatCurrency(paid.amount, paid.currency),
      sub: paid.currency === "USD" ? null : formatCurrency(usd, "USD"),
    };
  }
  if (isUsableRate(rate)) {
    return { lead: formatCurrency(usdToTzs(usd, rate), "TZS"), sub: formatCurrency(usd, "USD") };
  }
  return { lead: formatCurrency(usd, "USD"), sub: null };
}

type RunDetail = NonNullable<Awaited<ReturnType<typeof payrollRun>>>;

/**
 * A run laid out for the screen: every line and total written out once, here.
 *
 * A paid run is struck at the rate frozen on the cost it became — or not
 * converted at all when it left a dollar account — and its net total is that
 * cost's own amount. Only a run still ahead of payment is priced at today's
 * rate, because only that one has not happened yet.
 */
export function payrollView(run: RunDetail, liveRate: Numeric) {
  const paid = run.status === "PAID" && run.expense ? run.expense : null;
  const rate = paid ? (paid.currency === "USD" ? null : paid.fxRate) : liveRate;
  const n = (v: Numeric) => D(v).toNumber();

  const lines = run.items.map((item) => ({
    id: item.id,
    name: item.name,
    roleLabel: item.roleLabel,
    gross: n(item.gross),
    allowance: n(item.allowance),
    deduction: n(item.deduction),
    net: n(item.net),
    note: item.note,
    figures: {
      gross: payrollFigure(n(item.gross), rate),
      allowance: payrollFigure(n(item.allowance), rate),
      deduction: payrollFigure(n(item.deduction), rate),
      net: payrollFigure(n(item.net), rate),
    },
  }));

  const totals = {
    headcount: run.totals.headcount,
    gross: payrollFigure(run.totals.gross, rate),
    allowance: payrollFigure(run.totals.allowance, rate),
    deduction: payrollFigure(run.totals.deduction, rate),
    net: payrollFigure(run.totals.net, rate, paid),
  };

  return { lines, totals, rateMissing: !isUsableRate(liveRate) };
}
