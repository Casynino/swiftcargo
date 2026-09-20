"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { SALARIES_CATEGORY } from "@/lib/payroll";

import { recordAudit, recordFieldChange } from "@/lib/audit";
import { correctExpense as correctExpenseIn, CorrectionRefusal } from "@/lib/expense-correction";
import { nextExpenseReference } from "@/lib/ids";
import { prisma } from "@/lib/prisma";
import { authorize } from "@/lib/session";
import { store, UploadError } from "@/lib/storage";

export type ActionState = { error?: string; ok?: string };

const schema = z.object({
  scope: z.enum(["CONTAINER", "OFFICE", "SPECIAL", "EXECUTIVE"]).default("CONTAINER"),
  containerId: z.string().optional(),
  expenseTypeId: z.string().optional(),
  accountId: z.string().optional(),
  vendorName: z.string().trim().optional(),
  amount: z.coerce.number().positive("An amount is required."),
  currency: z.enum(["USD", "TZS"]),
  expenseDate: z.string().trim().optional(),
  referenceNumber: z.string().trim().optional(),
  description: z.string().trim().optional(),
});

/**
 * What a sailing cost us.
 *
 * Ocean freight, clearing, port charges, transport. Without these the profit
 * report is revenue pretending to be margin, and a container that lost money on
 * demurrage looks like a good month.
 */
export async function recordExpense(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const actor = await authorize("expense.record");

  const parsed = schema.safeParse({
    scope: formData.get("scope") || "CONTAINER",
    containerId: formData.get("containerId") || undefined,
    expenseTypeId: formData.get("expenseTypeId") || undefined,
    accountId: formData.get("accountId") || undefined,
    vendorName: formData.get("vendorName") || undefined,
    amount: formData.get("amount"),
    currency: formData.get("currency") || "USD",
    expenseDate: formData.get("expenseDate") || undefined,
    referenceNumber: formData.get("referenceNumber") || undefined,
    description: formData.get("description") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the form." };
  }
  const data = parsed.data;

  /* Salaries leave only through an approved payroll run. Picked by hand here,
     a salary would reach the ledger with nobody having agreed it. */
  if (data.expenseTypeId) {
    const type = await prisma.expenseType.findUnique({ where: { id: data.expenseTypeId }, select: { name: true } });
    if (type?.name === SALARIES_CATEGORY) {
      return { error: "Salaries are paid through Payroll, where the manager approves the run." };
    }
  }

  /* A container cost names its sailing; the business's own costs never do.
     Charging rent to a container would make that sailing's margin a lie. */
  let container: { id: string; reference: string } | null = null;
  if (data.scope === "CONTAINER") {
    if (!data.containerId) return { error: "Which container is this cost for?" };
    container = await prisma.container.findFirst({
      where: { id: data.containerId, deletedAt: null },
      select: { id: true, reference: true },
    });
    if (!container) return { error: "That container no longer exists." };
  }

  /* A shilling cost is pinned to the rate in force the day it was recorded,
     exactly as a bill is. Without it the cost carried a rate of 1, and every
     screen that turned it into dollars read TZS 50,000 as $50,000. */
  let fxRate = 1;
  let exchangeRateNote: string | null = null;
  if (data.currency !== "USD") {
    const live = await prisma.exchangeRate.findFirst({
      where: { active: true },
      orderBy: { effectiveFrom: "desc" },
      select: { rate: true },
    });
    if (!live || Number(live.rate) <= 1) {
      return {
        error:
          "There is no exchange rate set, so a shilling cost cannot be valued. Set today's rate first.",
      };
    }
    fxRate = Number(live.rate);
    exchangeRateNote = String(live.rate);
  }

  /* One photo per cost, because the row has one place for it. Stored before
     the row is written so a rejected file never leaves a cost behind that
     claims a receipt it does not have. */
  const receipt = formData
    .getAll("receipt")
    .find((f): f is File => f instanceof File && f.size > 0);
  let receiptUrl: string | null = null;
  if (receipt) {
    try {
      receiptUrl = await store(receipt, "expenses");
    } catch (error) {
      if (error instanceof UploadError) return { error: error.message };
      throw error;
    }
  }

  await prisma.$transaction(async (tx) => {
    let vendorId: string | null = null;
    if (data.vendorName) {
      const existing = await tx.vendor.findFirst({
        where: { name: { equals: data.vendorName, mode: "insensitive" } },
        select: { id: true },
      });
      vendorId =
        existing?.id ??
        (await tx.vendor.create({ data: { name: data.vendorName } })).id;
    }

    await tx.containerExpense.create({
      data: {
        reference: await nextExpenseReference(tx),
        scope: data.scope,
        containerId: container?.id ?? null,
        expenseTypeId: data.expenseTypeId || null,
        accountId: data.accountId || null,
        vendorId,
        amount: data.amount,
        currency: data.currency,
        fxRate,
        expenseDate: data.expenseDate ? new Date(data.expenseDate) : new Date(),
        /* Naming the account it left is saying it has been paid. */
        status: data.accountId ? "PAID" : "PENDING",
        paidDate: data.accountId
          ? data.expenseDate
            ? new Date(data.expenseDate)
            : new Date()
          : null,
        referenceNumber: data.referenceNumber || null,
        description: data.description || null,
        receiptUrl,
        recordedById: actor.id,
      },
    });
  });

  await recordAudit({
    actor,
    action: "expense.record",
    entity: container ? "Container" : "ContainerExpense",
    entityId: container?.id ?? actor.id,
    summary: `Recorded ${data.currency} ${data.amount} ${container ? `against ${container.reference}` : `as a ${data.scope.toLowerCase()} cost`}${
      exchangeRateNote ? ` at ${exchangeRateNote}` : ""
    }`,
  });

  revalidatePath("/app/finance/expenses");
  revalidatePath("/app/finance/accounts");
  revalidatePath("/app/finance/accounts/[id]", "page");
  revalidatePath("/app/finance/ledger");
  revalidatePath("/app/finance/reports");
  revalidatePath("/app/finance");
  return { ok: "Recorded." };
}

/**
 * A COST THAT SHOULD NEVER HAVE BEEN RECORDED.
 *
 * Cancelled, never deleted. The figure was in a profit report and somebody
 * read it; a row that vanishes leaves that report unexplainable. It stays on
 * the register struck through, with the reason beside it, and stops counting.
 */
export async function cancelExpense(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const actor = await authorize("expense.record");

  const id = String(formData.get("expenseId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim() || "No reason given";

  const expense = await prisma.containerExpense.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, reference: true, amount: true, currency: true, cancelledAt: true },
  });
  if (!expense) return { error: "That cost no longer exists." };
  if (expense.cancelledAt) return { error: "It is already cancelled." };

  /* Conditional, so two people pressing Cancel at once write one cancellation
     and the second is told it has already happened rather than overwriting the
     first reason. */
  const { count } = await prisma.containerExpense.updateMany({
    where: { id: expense.id, cancelledAt: null },
    data: { cancelledAt: new Date(), cancelledReason: reason },
  });
  if (count === 0) return { error: "Somebody cancelled it first." };

  await recordAudit({
    actor,
    action: "expense.cancel",
    entity: "ContainerExpense",
    entityId: expense.id,
    summary: `Cancelled ${expense.reference} (${expense.currency} ${expense.amount}): ${reason}`,
  });

  revalidatePath("/app/finance/expenses");
  revalidatePath("/app/finance/accounts");
  revalidatePath("/app/finance/ledger");
  revalidatePath("/app/finance/reports");
  return { ok: "Cancelled." };
}

function revalidateCosts() {
  revalidatePath("/app/finance/expenses");
  revalidatePath("/app/finance/accounts", "layout");
  revalidatePath("/app/finance/ledger", "layout");
  revalidatePath("/app/finance/reports");
  revalidatePath("/app/finance");
  revalidatePath("/app/containers/[id]", "page");
}

/**
 * THE CORRECTION DIALOG'S ONE DOOR.
 *
 * The rules — what is corrected in place, what is cancelled and reposted — live
 * in `lib/expense-correction.ts`, so the same logic is exercised outside a
 * request. This only checks who is asking and runs it in one transaction.
 */
export async function correctExpense(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const actor = await authorize("expense.record");

  const field = (key: string) => {
    const raw = formData.get(key);
    return raw === null ? undefined : String(raw);
  };

  try {
    const result = await prisma.$transaction((tx) =>
      correctExpenseIn(tx, actor, {
        expenseId: String(formData.get("expenseId") ?? ""),
        reason: String(formData.get("reason") ?? ""),
        description: field("description"),
        expenseTypeId: field("expenseTypeId"),
        vendor: field("vendor"),
        notes: field("notes"),
        expenseDate: field("expenseDate"),
        accountId: field("accountId"),
        amount: field("amount"),
      })
    );
    revalidateCosts();
    return {
      ok: result.replacement
        ? `Corrected. The old cost is cancelled and ${result.replacement.reference} carries the corrected figure.`
        : "Corrected.",
    };
  } catch (error) {
    if (error instanceof CorrectionRefusal) return { error: error.message };
    throw error;
  }
}

/**
 * A RECEIPT THAT ARRIVED AFTER THE COST DID.
 *
 * The slip turns up on WhatsApp an hour later. The cost has one place for it,
 * so a second file takes that place — and the one it replaces is written down
 * first, so the earlier proof is never lost from the record.
 */
export async function addExpenseReceipt(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const actor = await authorize("expense.record");

  const id = String(formData.get("expenseId") ?? "");
  const file = formData
    .getAll("file")
    .find((f): f is File => f instanceof File && f.size > 0);
  if (!file) return { error: "Choose a file first." };

  const expense = await prisma.containerExpense.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, reference: true, receiptUrl: true, cancelledAt: true },
  });
  if (!expense) return { error: "That cost no longer exists." };
  if (expense.cancelledAt) {
    return { error: `${expense.reference} was cancelled, so there is nothing to attach it to.` };
  }

  let url: string;
  try {
    url = await store(file, "expenses");
  } catch (error) {
    if (error instanceof UploadError) return { error: error.message };
    throw error;
  }

  await prisma.$transaction(async (tx) => {
    await recordFieldChange(
      {
        entity: "ContainerExpense",
        entityId: expense.id,
        field: "receiptUrl",
        oldValue: expense.receiptUrl,
        newValue: url,
        reason: expense.receiptUrl ? "Receipt replaced" : "Receipt added",
        actor,
      },
      tx
    );
    await tx.containerExpense.update({ where: { id: expense.id }, data: { receiptUrl: url } });
    await recordAudit(
      {
        actor,
        action: "expense.receipt.add",
        entity: "ContainerExpense",
        entityId: expense.id,
        summary: `Receipt ${expense.receiptUrl ? "replaced" : "added"} on ${expense.reference}: ${file.name || "file"}`,
      },
      tx
    );
  });

  revalidateCosts();
  return { ok: "Receipt added." };
}
