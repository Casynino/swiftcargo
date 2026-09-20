import "server-only";

import { Prisma } from "@prisma/client";

import { recordAudit, recordFieldChange } from "@/lib/audit";
import { formatCurrency, isCurrency, roundMoney } from "@/lib/currency";
import { nextExpenseReference } from "@/lib/ids";
import { SALARIES_CATEGORY } from "@/lib/payroll";
import { prisma, type TxClient } from "@/lib/prisma";
import type { SessionUser } from "@/lib/session";

/**
 * WHAT THE CORRECTION DIALOG STARTS FROM.
 *
 * Plain values only — it crosses into a client component — and read from the
 * cost itself, so the desk corrects what the record says now rather than what
 * some list happened to summarise.
 */
export type CorrectableExpense = {
  id: string;
  reference: string;
  description: string;
  expenseTypeId: string;
  expenseTypeName: string;
  vendor: string;
  notes: string;
  accountId: string;
  accountLabel: string;
  /** yyyy-mm-dd */
  expenseDate: string;
  amount: string;
  currency: string;
  receiptUrl: string | null;
  paid: boolean;
  /** A month's salaries — corrected on its payroll run, never from a row. */
  payroll: boolean;
};

export type CorrectionAccount = { id: string; label: string; currency: string };

export class CorrectionRefusal extends Error {}

const dayOf = (d: Date) => d.toISOString().slice(0, 10);

type CorrectableSource = {
  id: string;
  reference: string;
  description: string | null;
  expenseTypeId: string | null;
  expenseType: { name: string } | null;
  vendor: { name: string } | null;
  notes: string | null;
  accountId: string | null;
  account: { bankName: string; currency: string } | null;
  expenseDate: Date | null;
  paidDate: Date | null;
  createdAt: Date;
  amount: Prisma.Decimal;
  currency: string;
  receiptUrl: string | null;
  payrollRun: { id: string } | null;
};

export function toCorrectable(x: CorrectableSource): CorrectableExpense {
  return {
    id: x.id,
    reference: x.reference,
    description: x.description ?? "",
    expenseTypeId: x.expenseTypeId ?? "",
    expenseTypeName: x.expenseType?.name ?? "",
    vendor: x.vendor?.name ?? "",
    notes: x.notes ?? "",
    accountId: x.accountId ?? "",
    accountLabel: x.account ? `${x.account.bankName} (${x.account.currency})` : "",
    expenseDate: dayOf(x.expenseDate ?? x.paidDate ?? x.createdAt),
    amount: new Prisma.Decimal(x.amount).toString(),
    currency: x.currency,
    receiptUrl: x.receiptUrl,
    paid: x.accountId !== null,
    payroll: x.payrollRun !== null || x.expenseType?.name === SALARIES_CATEGORY,
  };
}

export const correctableInclude = {
  vendor: { select: { name: true } },
  expenseType: { select: { name: true } },
  account: { select: { bankName: true, currency: true } },
  payrollRun: { select: { id: true } },
} satisfies Prisma.ContainerExpenseInclude;

export async function correctableExpenses(ids: string[]): Promise<Map<string, CorrectableExpense>> {
  if (ids.length === 0) return new Map();
  const rows = await prisma.containerExpense.findMany({
    where: { id: { in: ids }, deletedAt: null },
    include: correctableInclude,
  });
  return new Map(rows.map((x) => [x.id, toCorrectable(x)]));
}

/** The accounts and categories every correction dialog on a page shares. */
export async function correctionOptions(): Promise<{
  accounts: CorrectionAccount[];
  categories: { id: string; name: string }[];
}> {
  const [accounts, categories] = await Promise.all([
    prisma.bankAccount.findMany({
      where: { active: true },
      orderBy: { sortOrder: "asc" },
      select: { id: true, bankName: true, currency: true },
    }),
    prisma.expenseType.findMany({
      where: { active: true, name: { not: SALARIES_CATEGORY } },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);
  return {
    accounts: accounts.map((a) => ({ id: a.id, label: `${a.bankName} (${a.currency})`, currency: a.currency })),
    categories,
  };
}

export type ExpenseCorrection = {
  expenseId: string;
  reason: string;
  description?: string;
  expenseTypeId?: string;
  vendor?: string;
  notes?: string;
  expenseDate?: string;
  accountId?: string;
  amount?: string;
};

export type CorrectionResult = {
  changed: string[];
  /** Set when the figure moved on a paid cost and a corrected cost was posted. */
  replacement: { id: string; reference: string } | null;
};

/**
 * THE RATE A SHILLING COST IS WORTH, ON ITS OWN DAY.
 *
 * The rate in force on the date the cost was incurred, falling back to the
 * live one for a date older than any rate on the system. Never simply today's:
 * a cost from last month re-valued at this morning's rate is a different cost.
 */
async function shillingRateOn(tx: TxClient, day: Date): Promise<Prisma.Decimal> {
  const onDay = await tx.exchangeRate.findFirst({
    where: { effectiveFrom: { lte: day } },
    orderBy: { effectiveFrom: "desc" },
    select: { rate: true },
  });
  const rate =
    onDay?.rate ??
    (
      await tx.exchangeRate.findFirst({
        where: { active: true },
        orderBy: { effectiveFrom: "desc" },
        select: { rate: true },
      })
    )?.rate;
  if (!rate || Number(rate) <= 1) {
    throw new CorrectionRefusal(
      "There is no exchange rate set, so a shilling cost cannot be valued. Set today's rate first."
    );
  }
  return rate;
}

const blank = (v: string | undefined) => (v === undefined ? undefined : v.trim() === "" ? null : v.trim());

/**
 * CORRECT A COST WITHOUT UN-WRITING IT.
 *
 * What a cost says about itself — what it was for, its category, who was paid,
 * the day, the note — is corrected in place, each field's old and new value
 * written with the reason before it moves.
 *
 * The figure and the account it left are different once money has gone: the
 * account balance and every report since were built from them. So a paid cost
 * whose amount or account changes is cancelled with the reason and a corrected
 * cost is posted beside it under a fresh number, each naming the other, and the
 * register shows both. A cost nobody has paid yet moved no balance, so its
 * figure is corrected in place like any other field.
 *
 * Runs inside the caller's transaction: the new number, the cancellation and
 * the replacement live or die together.
 */
export async function correctExpense(
  tx: TxClient,
  actor: SessionUser,
  input: ExpenseCorrection
): Promise<CorrectionResult> {
  const reason = input.reason.trim() || "No reason given";

  const expense = await tx.containerExpense.findFirst({
    where: { id: input.expenseId, deletedAt: null },
    include: {
      vendor: { select: { name: true } },
      expenseType: { select: { name: true } },
      account: { select: { bankName: true, currency: true } },
      payrollRun: { select: { id: true } },
    },
  });
  if (!expense) throw new CorrectionRefusal("That cost no longer exists.");
  if (expense.cancelledAt) throw new CorrectionRefusal("A cancelled cost cannot be corrected.");
  /* A salary cost is the approved run's own figure. Corrected from a row, the
     run and the money that left would disagree with nobody having agreed it. */
  if (expense.payrollRun || expense.expenseType?.name === SALARIES_CATEGORY) {
    throw new CorrectionRefusal("Salaries are corrected in Payroll, where the manager approves the run.");
  }

  const description = blank(input.description);
  const notes = blank(input.notes);
  const vendorName = blank(input.vendor);
  const expenseTypeId = blank(input.expenseTypeId);
  const accountId = blank(input.accountId);

  if (expenseTypeId && expenseTypeId !== expense.expenseTypeId) {
    const type = await tx.expenseType.findUnique({ where: { id: expenseTypeId }, select: { name: true } });
    if (!type) throw new CorrectionRefusal("That category no longer exists.");
    if (type.name === SALARIES_CATEGORY) {
      throw new CorrectionRefusal("Salaries are paid through Payroll, where the manager approves the run.");
    }
  }

  let date: Date | undefined;
  if (input.expenseDate?.trim()) {
    date = new Date(`${input.expenseDate.trim()}T12:00:00`);
    if (Number.isNaN(date.getTime()) || date.getTime() > Date.now() + 86_400_000) {
      throw new CorrectionRefusal("That date is not a real day.");
    }
  }

  /* No way back to "not paid". Money that has left an account cannot be
     un-spent by clearing a select. */
  if (accountId === null && expense.accountId) {
    throw new CorrectionRefusal("Say which account the money left. A paid cost cannot be made unpaid here.");
  }
  let account: { id: string; bankName: string; currency: string } | null = null;
  if (accountId && accountId !== expense.accountId) {
    account = await tx.bankAccount.findFirst({
      where: { id: accountId, active: true },
      select: { id: true, bankName: true, currency: true },
    });
    if (!account) throw new CorrectionRefusal("That account is no longer in use.");
  }
  const currency = account?.currency ?? expense.currency;
  if (!isCurrency(currency)) throw new CorrectionRefusal(`${currency} is not a currency we keep.`);
  const currencyMoves = currency !== expense.currency;

  let amount = new Prisma.Decimal(expense.amount);
  if (input.amount !== undefined && input.amount.trim() !== "") {
    let typed: Prisma.Decimal;
    try {
      typed = new Prisma.Decimal(input.amount.trim().replace(/,/g, ""));
    } catch {
      throw new CorrectionRefusal("That amount is not a number.");
    }
    if (!typed.isFinite() || typed.lte(0)) throw new CorrectionRefusal("An amount is required.");
    amount = roundMoney(typed, currency);
  }
  if (amount.lte(0)) throw new CorrectionRefusal("An amount is required.");
  /* The same digits in another currency are not the same money — USD 100 is not
     TZS 100 — so moving currency without retyping the figure is refused. */
  if (currencyMoves && amount.eq(expense.amount)) {
    throw new CorrectionRefusal(
      `${account!.bankName} holds ${currency}. Type what left it in ${currency}.`
    );
  }

  const amountMoves = !amount.eq(expense.amount);
  const accountMoves = Boolean(account);
  const paid = expense.accountId !== null;

  type Change = { field: string; before: unknown; after: unknown };
  const changes: Change[] = [];
  const consider = (field: string, before: unknown, after: unknown) => {
    if (after === undefined) return;
    const a = before instanceof Date ? dayOf(before) : (before ?? null);
    const b = after instanceof Date ? dayOf(after) : after;
    if (String(a) === String(b)) return;
    changes.push({ field, before: a, after: b });
  };
  consider("description", expense.description, description);
  consider("expenseTypeId", expense.expenseTypeId, expenseTypeId);
  consider("vendor", expense.vendor?.name ?? null, vendorName);
  consider("notes", expense.notes, notes);
  if (date) consider("expenseDate", expense.expenseDate ?? expense.paidDate ?? expense.createdAt, date);
  if (accountMoves) consider("accountId", expense.accountId, account!.id);
  if (currencyMoves) consider("currency", expense.currency, currency);
  if (amountMoves) consider("amount", new Prisma.Decimal(expense.amount).toString(), amount.toString());
  if (changes.length === 0) throw new CorrectionRefusal("Nothing was changed.");

  const vendorId = async () => {
    if (!changes.some((c) => c.field === "vendor")) return expense.vendorId;
    if (!vendorName) return null;
    const existing = await tx.vendor.findFirst({
      where: { name: { equals: vendorName, mode: "insensitive" } },
      select: { id: true },
    });
    return existing?.id ?? (await tx.vendor.create({ data: { name: vendorName } })).id;
  };

  const newDate = date ?? expense.expenseDate ?? expense.paidDate ?? expense.createdAt;
  const dateMoves = changes.some((c) => c.field === "expenseDate");
  /* A shilling cost keeps the rate it was pinned to unless its day or its
     currency moved; then it takes the rate of its new day. A dollar cost is
     already in the currency it was priced in. */
  const fxRateFor = async () =>
    currency === "USD"
      ? new Prisma.Decimal(1)
      : !currencyMoves && !dateMoves && Number(expense.fxRate) > 1
        ? new Prisma.Decimal(expense.fxRate)
        : await shillingRateOn(tx, newDate);

  const was = formatCurrency(expense.amount, expense.currency);
  const now = formatCurrency(amount, currency);

  if (paid && (amountMoves || accountMoves)) {
    const reference = await nextExpenseReference(tx);
    const newAccountId = account?.id ?? expense.accountId!;

    /* Conditional, so a cancel pressed at the same moment on another screen is
       not silently overwritten with this reason. */
    const { count } = await tx.containerExpense.updateMany({
      where: { id: expense.id, cancelledAt: null, deletedAt: null },
      data: { cancelledAt: new Date(), cancelledReason: `Corrected — ${reason} (reposted as ${reference})` },
    });
    if (count === 0) throw new CorrectionRefusal("That cost was cancelled while you were correcting it.");

    const replacement = await tx.containerExpense.create({
      data: {
        reference,
        scope: expense.scope,
        containerId: expense.containerId,
        expenseTypeId: expenseTypeId === undefined ? expense.expenseTypeId : expenseTypeId,
        accountId: newAccountId,
        vendorId: await vendorId(),
        amount,
        currency,
        fxRate: await fxRateFor(),
        status: "PAID",
        expenseDate: newDate,
        paidDate: date ?? expense.paidDate ?? newDate,
        billable: expense.billable,
        billedCustomerId: expense.billedCustomerId,
        billedAmount: expense.billedAmount,
        referenceNumber: expense.referenceNumber,
        description: description === undefined ? expense.description : description,
        receiptUrl: expense.receiptUrl,
        notes: [notes === undefined ? expense.notes : notes, `Corrects ${expense.reference}`]
          .filter(Boolean)
          .join(" · "),
        recordedById: actor.id,
      },
      select: { id: true, reference: true },
    });

    for (const c of changes) {
      await recordFieldChange(
        { entity: "ContainerExpense", entityId: expense.id, field: c.field, oldValue: c.before, newValue: c.after, reason, actor },
        tx
      );
    }
    await recordFieldChange(
      { entity: "ContainerExpense", entityId: expense.id, field: "correctedBy", oldValue: null, newValue: reference, reason, actor },
      tx
    );
    await recordFieldChange(
      { entity: "ContainerExpense", entityId: replacement.id, field: "corrects", oldValue: expense.reference, newValue: reference, reason, actor },
      tx
    );
    await recordAudit(
      {
        actor,
        action: "expense.correct",
        entity: "ContainerExpense",
        entityId: expense.id,
        summary: `Corrected ${expense.reference} (${was} from ${expense.account?.bankName ?? "—"}) — cancelled and reposted as ${reference} (${now}${account ? ` from ${account.bankName}` : ""}): ${reason}`,
        metadata: { replacementId: replacement.id, changed: changes.map((c) => c.field) },
      },
      tx
    );
    await recordAudit(
      {
        actor,
        action: "expense.record",
        entity: "ContainerExpense",
        entityId: replacement.id,
        summary: `Recorded ${reference} (${now}) correcting ${expense.reference}: ${reason}`,
      },
      tx
    );
    return { changed: changes.map((c) => c.field), replacement };
  }

  /* In place: nothing here moved a balance that anybody has read. */
  const data: Prisma.ContainerExpenseUncheckedUpdateManyInput = {};
  for (const c of changes) {
    if (c.field === "description") data.description = description;
    if (c.field === "expenseTypeId") data.expenseTypeId = expenseTypeId;
    if (c.field === "notes") data.notes = notes;
    if (c.field === "expenseDate") {
      data.expenseDate = date;
      if (expense.paidDate) data.paidDate = date;
    }
    if (c.field === "amount") data.amount = amount;
  }
  if (changes.some((c) => c.field === "vendor")) data.vendorId = await vendorId();
  if (accountMoves) {
    /* An unpaid cost given an account is the desk saying it has now been paid. */
    data.accountId = account!.id;
    data.status = "PAID";
    data.paidDate = date ?? new Date();
  }
  /* Re-pinned only while unpaid. A paid cost's rate is what its dollar value
     was reported at, and a corrected day is not a reason to revalue it. */
  if (currencyMoves || (!paid && dateMoves && currency !== "USD")) {
    const fxRate = await fxRateFor();
    data.currency = currency;
    data.fxRate = fxRate;
    if (!fxRate.eq(expense.fxRate)) {
      changes.push({ field: "fxRate", before: new Prisma.Decimal(expense.fxRate).toString(), after: fxRate.toString() });
    }
  }

  for (const c of changes) {
    await recordFieldChange(
      { entity: "ContainerExpense", entityId: expense.id, field: c.field, oldValue: c.before, newValue: c.after, reason, actor },
      tx
    );
  }
  const { count } = await tx.containerExpense.updateMany({
    where: { id: expense.id, cancelledAt: null, deletedAt: null },
    data,
  });
  if (count === 0) throw new CorrectionRefusal("That cost was cancelled while you were correcting it.");
  await recordAudit(
    {
      actor,
      action: "expense.correct",
      entity: "ContainerExpense",
      entityId: expense.id,
      summary: `Corrected ${changes.map((c) => c.field).join(", ")} on ${expense.reference}${
        amountMoves ? ` (${was} → ${now})` : ""
      } — ${reason}`,
    },
    tx
  );
  return { changed: changes.map((c) => c.field), replacement: null };
}
