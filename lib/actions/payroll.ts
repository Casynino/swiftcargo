"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { t, type Locale } from "@/lib/i18n";
import {
  buildRun,
  decideRun,
  PayrollRefusal,
  runNow,
  settleApprovedRun,
  submitRun,
  updateItem,
} from "@/lib/payroll";
import { prisma } from "@/lib/prisma";
import type { Permission } from "@/lib/rbac";
import { authorize, type SessionUser } from "@/lib/session";
import { localeOf } from "@/lib/viewer-locale";

/*
  The month's salaries, in five steps and one money movement.

  Finance prepares the salary run and sends it to the manager; the manager
  agrees it, and only then is the money deducted as a salary expense. The desk
  that writes the figures cannot agree them (two permissions), the desk that
  agrees them cannot have written them (the refusal in decideRun), and four of
  the five steps move no money at all.

  Each action authorizes itself and hands a transaction to lib/payroll.ts,
  where the rows are actually moved.
*/

export type ActionState = { error?: string; ok?: string };

/** Every screen a run or the cost it becomes appears on. */
function revalidatePayroll(paid: boolean) {
  revalidatePath("/app/finance/payroll");
  revalidatePath("/app/manager/payroll");
  revalidatePath("/app/manager/approvals");
  revalidatePath("/app/manager");
  if (paid) {
    revalidatePath("/app/finance/expenses");
    revalidatePath("/app/finance/accounts");
    revalidatePath("/app/finance/accounts/[id]", "page");
    revalidatePath("/app/finance/ledger");
    revalidatePath("/app/finance/reports");
    revalidatePath("/app/finance");
  }
}

async function gate(permission: Permission): Promise<{ actor: SessionUser; locale: Locale } | { error: string }> {
  try {
    const actor = await authorize(permission);
    return { actor, locale: await localeOf(actor.id) };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "You do not have permission to do that." };
  }
}

/** A refusal is shown as written; anything else is a fault, not a sentence. */
function failure(error: unknown, locale: Locale): ActionState {
  if (error instanceof PayrollRefusal) return { error: error.message };
  console.error(error);
  return { error: t(locale, "That did not go through. Nothing was changed — try again.") };
}

const period = {
  year: z.coerce
    .number()
    .int()
    .refine((v) => v >= 2020 && v <= 2100, "Choose a year."),
  month: z.coerce
    .number()
    .int()
    .refine((v) => v >= 1 && v <= 12, "Choose a month."),
};

/** Blank means zero on a salary line. */
const money = (message: string) =>
  z
    .string()
    .trim()
    .transform((v) => (v === "" ? 0 : Number(v.replace(/,/g, ""))))
    .refine((v) => Number.isFinite(v) && v >= 0, message);

export async function buildPayrollRun(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const g = await gate("payroll.prepare");
  if ("error" in g) return g;
  const { actor, locale } = g;

  const parsed = z.object(period).safeParse({
    year: formData.get("year"),
    month: formData.get("month"),
  });
  if (!parsed.success) return { error: t(locale, parsed.error.issues[0]?.message ?? "Check the form.") };

  try {
    const run = await prisma.$transaction((tx) => buildRun(tx, actor, parsed.data, locale));
    revalidatePayroll(false);
    return { ok: `${run.code} ${t(locale, "built")} — ${run.headcount} ${t(locale, "staff")}.` };
  } catch (error) {
    return failure(error, locale);
  }
}

const itemSchema = z.object({
  itemId: z.string().trim().min(1, "Missing salary line."),
  allowance: money("An allowance cannot be negative."),
  deduction: money("A deduction cannot be negative."),
  note: z.string().trim().max(200).optional(),
});

export async function updatePayrollItem(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const g = await gate("payroll.prepare");
  if ("error" in g) return g;
  const { actor, locale } = g;

  const parsed = itemSchema.safeParse({
    itemId: formData.get("itemId") ?? "",
    allowance: String(formData.get("allowance") ?? ""),
    deduction: String(formData.get("deduction") ?? ""),
    note: formData.get("note") || undefined,
  });
  if (!parsed.success) return { error: t(locale, parsed.error.issues[0]?.message ?? "Check the form.") };

  try {
    await prisma.$transaction((tx) => updateItem(tx, actor, parsed.data, locale));
    revalidatePayroll(false);
    return { ok: t(locale, "Saved.") };
  } catch (error) {
    return failure(error, locale);
  }
}

const submitSchema = z.object({
  runId: z.string().trim().min(1, "Missing run."),
  accountId: z.string().trim().min(1, "Name the account the salaries will be paid from."),
  note: z.string().trim().max(500).optional(),
});

export async function submitPayrollRun(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const g = await gate("payroll.prepare");
  if ("error" in g) return g;
  const { actor, locale } = g;

  const parsed = submitSchema.safeParse({
    runId: formData.get("runId") ?? "",
    accountId: formData.get("accountId") ?? "",
    note: formData.get("note") || undefined,
  });
  if (!parsed.success) return { error: t(locale, parsed.error.issues[0]?.message ?? "Check the form.") };

  try {
    const code = await prisma.$transaction((tx) => submitRun(tx, actor, parsed.data, locale));
    revalidatePayroll(false);
    return { ok: `${code} ${t(locale, "sent to the manager.")}` };
  } catch (error) {
    return failure(error, locale);
  }
}

const decisionSchema = z.object({
  runId: z.string().trim().min(1, "Missing run."),
  decision: z.enum(["APPROVED", "REJECTED"], {
    errorMap: () => ({ message: "Agree the run, or send it back." }),
  }),
  decisionNote: z.string().trim().max(500).optional(),
});

/**
 * The manager agrees the month, which pays it, or sends it back.
 *
 * A reason on a rejection is offered, not demanded: Finance sees the rejection
 * either way, by a named person at a known moment, and a box that must be
 * filled in is filled in with "no".
 */
export async function decidePayrollRun(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const g = await gate("payroll.approve");
  if ("error" in g) return g;
  const { actor, locale } = g;

  const parsed = decisionSchema.safeParse({
    runId: formData.get("runId") ?? "",
    decision: formData.get("decision"),
    decisionNote: formData.get("decisionNote") || undefined,
  });
  if (!parsed.success) return { error: t(locale, parsed.error.issues[0]?.message ?? "Check the form.") };

  try {
    const outcome = await prisma.$transaction((tx) => decideRun(tx, actor, parsed.data, locale));
    revalidatePayroll(outcome.status === "PAID");
    return {
      ok:
        outcome.status === "PAID"
          ? `${t(locale, "Agreed and paid as")} ${outcome.reference}.`
          : t(locale, "Sent back to Finance."),
    };
  } catch (error) {
    return failure(error, locale);
  }
}

const paySchema = z.object({
  runId: z.string().trim().min(1, "Missing run."),
  /** The day the money actually left. Blank means today. */
  paidAt: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? new Date(v) : null))
    .refine((d) => d === null || !Number.isNaN(d.getTime()), "That date is not valid.")
    .refine((d) => d === null || d.getTime() <= Date.now() + 86_400_000, "Salaries cannot be dated in the future."),
});

/**
 * Paying a run that was agreed and not settled.
 *
 * Agreeing settles in the same transaction, so a run only rests in APPROVED if
 * that settlement is ever separated from it again. This is the door for that
 * case, behind the same permission that agrees.
 */
export async function payPayrollRun(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const g = await gate("payroll.approve");
  if ("error" in g) return g;
  const { actor, locale } = g;

  const parsed = paySchema.safeParse({
    runId: formData.get("runId") ?? "",
    paidAt: formData.get("paidAt") || undefined,
  });
  if (!parsed.success) return { error: t(locale, parsed.error.issues[0]?.message ?? "Check the form.") };

  try {
    const reference = await prisma.$transaction((tx) =>
      settleApprovedRun(tx, actor, { runId: parsed.data.runId, paidAt: parsed.data.paidAt }, locale)
    );
    revalidatePayroll(true);
    return { ok: `${t(locale, "Paid as")} ${reference}.` };
  } catch (error) {
    return failure(error, locale);
  }
}

const runNowSchema = z.object({
  ...period,
  accountId: z.string().trim().min(1, "Choose the account the salaries leave."),
});

export async function runPayrollNow(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const g = await gate("payroll.approve");
  if ("error" in g) return g;
  const { actor, locale } = g;

  const parsed = runNowSchema.safeParse({
    year: formData.get("year"),
    month: formData.get("month"),
    accountId: formData.get("accountId") ?? "",
  });
  if (!parsed.success) return { error: t(locale, parsed.error.issues[0]?.message ?? "Check the form.") };

  try {
    const result = await prisma.$transaction((tx) => runNow(tx, actor, parsed.data, locale));
    revalidatePayroll(true);
    return {
      ok: `${result.code} ${t(locale, "paid")} — ${result.headcount} ${t(locale, "staff")}, ${t(
        locale,
        "booked as"
      )} ${result.reference}.`,
    };
  } catch (error) {
    return failure(error, locale);
  }
}
