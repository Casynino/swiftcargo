"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { z } from "zod";

import { accountPositions } from "@/lib/accounts";
import { recordAudit, withNote } from "@/lib/audit";
import { formatCurrency, roundMoney } from "@/lib/currency";
import { prisma, type TxClient } from "@/lib/prisma";
import { formMessage } from "@/lib/safe-error";
import { authorize, type SessionUser } from "@/lib/session";

/**
 * The manager's two controls: checking an account, and giving a verdict on a
 * record.
 *
 * NEITHER OF THEM CHANGES ANYTHING THEY LOOK AT. A manager who disagrees with a
 * payment does not edit the payment — Finance still sees exactly what they
 * entered, and a row beside it says a manager disputes it and why. The desk
 * corrects it through its own path, which already answers a wrong line with a
 * reversal or a cancellation rather than an edit.
 *
 * So there is no update in this file. Only inserts, into ManagerReview,
 * CashCount and AuditLog.
 */

export type ReviewActionState = { error?: string; ok?: string; written?: number; skipped?: number };

function refresh() {
  for (const path of [
    "/app/manager",
    "/app/manager/reconciliation",
    "/app/finance/accounts",
    "/app/finance/ledger",
  ]) {
    revalidatePath(path);
  }
}

const failure = (error: unknown) => formMessage(error, "That could not be recorded.");

/* ------------------------------------------------------ checking an account */

const amount = z
  .string()
  .trim()
  .min(1, "Enter what the account actually holds.")
  .transform((v) => v.replace(/,/g, ""))
  .refine((v) => /^-?\d+(\.\d+)?$/.test(v), "That is not an amount.");

const checkSchema = z.object({
  accountId: z.string().trim().min(1, "Choose an account."),
  counted: amount,
  note: z.string().trim().max(400).optional(),
});

/**
 * Record what an account really holds, and what that says about the register.
 *
 * THE BOOK SIDE IS COMPUTED HERE, NEVER SUBMITTED. The form shows the register's
 * balance so the manager can see what they are comparing against, but that
 * displayed figure is not what gets stored — this reads it again. A check whose
 * "book" number could be typed by the person doing the checking would certify
 * nothing.
 *
 * Kept as a CashCount, the same append-only row the tin is counted on: a bank
 * statement read off a screen and a till counted by hand are the same act — a
 * figure from outside the system, pinned beside what the register said.
 */
export async function checkAccount(
  _prev: ReviewActionState,
  formData: FormData
): Promise<ReviewActionState> {
  let actor: SessionUser;
  try {
    actor = await authorize("record.reconcile");
  } catch (error) {
    return { error: failure(error) };
  }

  const parsed = checkSchema.safeParse({
    accountId: formData.get("accountId"),
    counted: formData.get("counted") ?? "",
    note: formData.get("note") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form." };
  const input = parsed.data;

  const positions = await accountPositions();
  const account = positions.find((p) => p.id === input.accountId);
  if (!account) return { error: "That account no longer exists." };
  if (!account.active) {
    return { error: `${account.bankName} has been closed, so there is nothing live to check.` };
  }

  const counted = roundMoney(input.counted, account.currency);
  /* The register adds up in plain numbers; pinned here to the account's own
     smallest unit so a check that agrees does not report a fraction of a cent. */
  const expected = roundMoney(account.balance, account.currency);
  const difference = counted.sub(expected);
  const agrees = difference.isZero();

  const check = await prisma.cashCount.create({
    data: {
      accountId: account.id,
      counted,
      expected,
      note: input.note || null,
      countedById: actor.id,
    },
    select: { id: true },
  });

  await recordAudit({
    actor,
    action: "account.check",
    entity: "BankAccount",
    entityId: account.id,
    summary: withNote(
      agrees
        ? `${account.bankName} checked — ${formatCurrency(expected, account.currency)} agrees with the register`
        : `${account.bankName} checked ${difference.isPositive() ? "over" : "short"} by ${formatCurrency(difference.abs(), account.currency)}`,
      input.note
    ),
    metadata: {
      cashCountId: check.id,
      counted: counted.toString(),
      expected: expected.toString(),
      difference: difference.toString(),
    },
  });

  refresh();
  return {
    ok: agrees
      ? "Recorded. It agrees with the register."
      : `Recorded: ${difference.isPositive() ? "over" : "short"} by ${formatCurrency(difference.abs(), account.currency)}. Find the movement nobody recorded.`,
  };
}

/* ------------------------------------------------------ a verdict on a record */

const ENTITIES = ["Payment", "Expense", "Transfer", "Container"] as const;
type Entity = (typeof ENTITIES)[number];

/* PENDING is the absence of a verdict and is never written. */
const VERDICTS = ["QUERIED", "MISMATCH", "SENT_BACK", "UNDER_REVIEW", "RECONCILED"] as const;

const LABEL: Record<(typeof VERDICTS)[number], string> = {
  QUERIED: "queried",
  MISMATCH: "marked a mismatch",
  SENT_BACK: "sent back",
  UNDER_REVIEW: "put under review",
  RECONCILED: "reconciled",
};

const reviewSchema = z.object({
  entity: z.enum(ENTITIES, { errorMap: () => ({ message: "Say what kind of record this is." }) }),
  verdict: z.enum(VERDICTS, { errorMap: () => ({ message: "Choose what you are saying about it." }) }),
  actualAmount: z
    .string()
    .trim()
    .transform((v) => v.replace(/,/g, ""))
    .refine((v) => v === "" || /^-?\d+(\.\d+)?$/.test(v), "The actual amount is not a number.")
    .optional(),
  note: z.string().trim().max(600).optional(),
});

/** The record as the system holds it: whether it exists, and its own figure. */
async function systemFigure(
  tx: TxClient,
  entity: Entity,
  id: string
): Promise<{ label: string; amount: Prisma.Decimal | null; currency: string | null } | null> {
  switch (entity) {
    case "Payment": {
      const row = await tx.payment.findUnique({
        where: { id },
        select: { reference: true, amount: true, currency: true },
      });
      return row ? { label: row.reference, amount: row.amount, currency: row.currency } : null;
    }
    case "Expense": {
      const row = await tx.containerExpense.findFirst({
        where: { id, deletedAt: null },
        select: { reference: true, amount: true, currency: true },
      });
      return row ? { label: row.reference, amount: row.amount, currency: row.currency } : null;
    }
    case "Transfer": {
      const row = await tx.accountTransfer.findUnique({
        where: { id },
        select: { reference: true, amount: true, fromAccount: { select: { currency: true } } },
      });
      return row
        ? { label: row.reference, amount: row.amount, currency: row.fromAccount.currency }
        : null;
    }
    case "Container": {
      const row = await tx.container.findFirst({
        where: { id, deletedAt: null },
        select: { reference: true },
      });
      return row ? { label: row.reference, amount: null, currency: null } : null;
    }
  }
}

/**
 * Write one verdict against one record, inside the caller's transaction.
 *
 * APPEND, NEVER OVERWRITE. Sending a payment back on Monday and reconciling it
 * on Friday is two rows, because the sequence is what somebody needs to read six
 * months later. The current standing of a record is simply its newest row.
 */
async function writeVerdict(
  tx: TxClient,
  actor: SessionUser,
  input: z.infer<typeof reviewSchema>,
  entityId: string,
  of?: number
) {
  const record = await systemFigure(tx, input.entity, entityId);
  if (!record) return false;

  const actualRaw = input.actualAmount && record.currency ? input.actualAmount : "";
  const actual = actualRaw && record.currency ? roundMoney(actualRaw, record.currency) : null;

  /* A verdict that agrees while quoting a figure that does not is two opposite
     statements on one row. The figure from outside wins the argument — the
     manager can still say MISMATCH, UNDER_REVIEW or send it back. */
  if (
    input.verdict === "RECONCILED" &&
    actual &&
    record.amount &&
    record.currency &&
    !actual.equals(roundMoney(record.amount, record.currency))
  ) {
    throw new Error(
      `${record.label}: the actual amount (${formatCurrency(actual, record.currency)}) differs from the system's ${formatCurrency(record.amount, record.currency)}, so it cannot be reconciled. Record it as a mismatch.`
    );
  }

  const review = await tx.managerReview.create({
    data: {
      entity: input.entity,
      entityId,
      verdict: input.verdict,
      actualAmount: actual,
      currency: actual ? record.currency : null,
      note: input.note || null,
      reviewerId: actor.id,
    },
    select: { id: true },
  });

  await recordAudit(
    {
      actor,
      action: `review.${input.verdict.toLowerCase()}`,
      entity: input.entity,
      entityId,
      summary: withNote(
        `${record.label} ${LABEL[input.verdict]}${
          actual && record.currency ? ` — actual ${formatCurrency(actual, record.currency)}` : ""
        }${of ? ` (one of ${of})` : ""}`,
        input.note
      ),
      metadata: { reviewId: review.id, verdict: input.verdict, ...(of ? { batchOf: of } : {}) },
    },
    tx
  );
  return true;
}

/**
 * Say what you think of a record somebody else entered.
 *
 * There is no delete and no update in this action.
 */
export async function reviewRecord(
  _prev: ReviewActionState,
  formData: FormData
): Promise<ReviewActionState> {
  let actor: SessionUser;
  try {
    actor = await authorize("record.reconcile");
  } catch (error) {
    return { error: failure(error) };
  }

  const entityId = String(formData.get("entityId") ?? "").trim();
  if (!entityId) return { error: "Missing the record." };

  const parsed = reviewSchema.safeParse({
    entity: formData.get("entity"),
    verdict: formData.get("verdict"),
    actualAmount: formData.get("actualAmount") ?? undefined,
    note: formData.get("note") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form." };

  try {
    const written = await prisma.$transaction((tx) =>
      writeVerdict(tx, actor, parsed.data, entityId)
    );
    if (!written) return { error: "That record no longer exists, so there is nothing to review." };
  } catch (error) {
    return { error: failure(error) };
  }

  refresh();
  return { ok: "Recorded.", written: 1, skipped: 0 };
}

const BULK_LIMIT = 300;

/**
 * ONE VERDICT ACROSS MANY RECORDS, because a busy week is not read one row at a
 * time.
 *
 * Still one ManagerReview and one audit line per record — a bulk action that
 * collapsed into a single row would leave the history unable to say what
 * happened to any one payment. Each tick arrives as "Kind:id", because the
 * queue mixes payments, costs and transfers. A record that has vanished since
 * the page was drawn is skipped rather than failing the rest, and the count that
 * comes back is what was actually written.
 */
export async function reviewRecords(
  _prev: ReviewActionState,
  formData: FormData
): Promise<ReviewActionState> {
  let actor: SessionUser;
  try {
    actor = await authorize("record.reconcile");
  } catch (error) {
    return { error: failure(error) };
  }

  const keys = [...new Set(formData.getAll("keys").map(String).filter(Boolean))];
  if (keys.length === 0) return { error: "Tick the records you want to act on first." };
  if (keys.length > BULK_LIMIT) {
    return { error: "That is more than can be agreed in one go. Narrow the filters and repeat." };
  }

  const verdict = String(formData.get("verdict") ?? "");
  /* Only the two verdicts that make sense without reading each record: agreeing
     a routine fortnight, or handing a pile back with one reason. A bulk action
     never carries an actual amount — that is a figure per record. */
  if (verdict !== "RECONCILED" && verdict !== "SENT_BACK") {
    return { error: "Only reconcile or send back can be given to many records at once." };
  }
  const note = String(formData.get("note") ?? "").trim().slice(0, 600) || undefined;

  let written = 0;
  try {
    written = await prisma.$transaction(async (tx) => {
      let count = 0;
      for (const key of keys) {
        const at = key.indexOf(":");
        const entity = key.slice(0, at) as Entity;
        const entityId = key.slice(at + 1);
        if (at < 1 || !ENTITIES.includes(entity) || !entityId) continue;
        const parsed = reviewSchema.safeParse({ entity, verdict, note });
        if (!parsed.success) continue;
        if (await writeVerdict(tx, actor, parsed.data, entityId, keys.length)) count += 1;
      }
      return count;
    }, { timeout: 60_000 });
  } catch (error) {
    return { error: failure(error) };
  }

  refresh();
  return {
    ok: `${written} recorded${keys.length - written > 0 ? ` · ${keys.length - written} skipped` : ""}.`,
    written,
    skipped: keys.length - written,
  };
}
