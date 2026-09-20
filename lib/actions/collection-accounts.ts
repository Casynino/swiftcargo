"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { accountPositions } from "@/lib/accounts";
import { recordAudit, recordFieldChange } from "@/lib/audit";
import { formatCurrency } from "@/lib/currency";
import { prisma } from "@/lib/prisma";
import { authorize } from "@/lib/session";

export type ActionState = { error?: string; ok?: string };

/**
 * THE ACCOUNTS A CUSTOMER PAYS INTO.
 *
 * The same rows the ledger keeps balances for: the account printed on an
 * invoice is the account a payment is recorded against, so there is one list
 * and not a printed copy that can drift from the books. The office cash tin is
 * not here — nobody transfers money to a tin.
 *
 * WHAT MONEY HAS MOVED THROUGH IS NOT RENUMBERED. Once a payment, a cost, a
 * transfer or a count names an account, its number, holder, kind and currency
 * are what the bank statement for that history says. A new number is a new
 * account: retire the old one and add the new, and both histories still match
 * their statements.
 */

const FIELD_LABELS = {
  bankName: "Label",
  accountName: "Account name",
  accountNumber: "Number",
  branch: "Branch",
  kind: "Kind",
  currency: "Currency",
  sortOrder: "Order on the invoice",
} as const;
type Field = keyof typeof FIELD_LABELS;

/* Changing any of these on an account with history would make its past
   movements belong to a different account than the one they went through. */
const FIXED_ONCE_USED: Field[] = ["accountNumber", "accountName", "kind", "currency"];

const accountSchema = z.object({
  id: z.string().optional(),
  bankName: z.string().trim().min(2, "Every account needs a label a customer can read — NMB BANK, Vodacom M-Pesa."),
  accountName: z.string().trim().min(2, "An account needs the name it is held in."),
  accountNumber: z
    .string()
    .trim()
    .min(3, "An account needs a number.")
    .regex(/^[0-9A-Za-z -]+$/, "An account number is digits and letters only."),
  branch: z.string().trim().optional(),
  kind: z.enum(["BANK", "MOBILE_MONEY"], { message: "Choose bank or mobile money." }),
  currency: z.enum(["TZS", "USD"], { message: "Choose the currency the account is kept in." }),
  sortOrder: z.coerce.number().int().min(0).max(999).default(0),
});

async function hasHistory(id: string) {
  const [payments, expenses, out, into, counts, payroll, account] = await Promise.all([
    prisma.payment.count({ where: { accountId: id } }),
    prisma.containerExpense.count({ where: { accountId: id } }),
    prisma.accountTransfer.count({ where: { fromAccountId: id } }),
    prisma.accountTransfer.count({ where: { toAccountId: id } }),
    prisma.cashCount.count({ where: { accountId: id } }),
    prisma.payrollRun.count({ where: { accountId: id } }),
    prisma.bankAccount.findUnique({ where: { id }, select: { openingBalance: true } }),
  ]);
  return (
    payments + expenses + out + into + counts + payroll > 0 ||
    Boolean(account && !account.openingBalance.isZero())
  );
}

function refresh() {
  /* The invoice, its PDF, the payment dialogs and the accounts pages all read
     this list. */
  revalidatePath("/", "layout");
}

export async function saveCollectionAccount(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const actor = await authorize("settings.manage");

  const parsed = accountSchema.safeParse({
    id: formData.get("id") || undefined,
    bankName: formData.get("bankName"),
    accountName: formData.get("accountName"),
    accountNumber: formData.get("accountNumber"),
    branch: formData.get("branch") || undefined,
    kind: formData.get("kind"),
    currency: formData.get("currency"),
    sortOrder: formData.get("sortOrder") || 0,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the account." };
  }
  const { id, ...input } = parsed.data;
  const data = {
    ...input,
    branch: input.branch || null,
  };

  const clash = await prisma.bankAccount.findFirst({
    where: {
      accountNumber: data.accountNumber,
      currency: data.currency,
      active: true,
      ...(id ? { id: { not: id } } : {}),
    },
    select: { bankName: true },
  });
  if (clash) {
    return {
      error: `${data.accountNumber} (${data.currency}) is already open as ${clash.bankName}. One account, one row — otherwise its balance is split in two.`,
    };
  }

  if (!id) {
    const created = await prisma.$transaction(async (tx) => {
      const row = await tx.bankAccount.create({ data });
      await recordAudit(
        {
          actor,
          action: "account.collection.add",
          entity: "BankAccount",
          entityId: row.id,
          summary: `Added collection account ${row.bankName} ${row.accountNumber} (${row.currency}) held by ${row.accountName}`,
          metadata: { after: data },
        },
        tx
      );
      return row;
    });
    refresh();
    return { ok: `${created.bankName} added. It prints on invoices issued from now on.` };
  }

  const account = await prisma.bankAccount.findUnique({ where: { id } });
  if (!account) return { error: "That account no longer exists." };
  if (account.kind === "CASH") {
    return { error: "A cash tin is not an account customers pay into. It is kept in Finance → Accounts." };
  }

  const current: Record<Field, string | number | null> = {
    bankName: account.bankName,
    accountName: account.accountName,
    accountNumber: account.accountNumber,
    branch: account.branch,
    kind: account.kind,
    currency: account.currency,
    sortOrder: account.sortOrder,
  };
  const changes = (Object.keys(FIELD_LABELS) as Field[])
    .filter((field) => String(current[field] ?? "") !== String(data[field] ?? ""))
    .map((field) => ({
      field,
      label: FIELD_LABELS[field],
      from: current[field] === null ? null : String(current[field]),
      to: data[field] === null ? null : String(data[field]),
    }));
  if (changes.length === 0) return { ok: "Nothing had changed, so nothing was saved." };

  const locked = changes.filter((c) => FIXED_ONCE_USED.includes(c.field));
  if (locked.length > 0 && (await hasHistory(account.id))) {
    return {
      error: `Money has already moved through ${account.bankName} ${account.accountNumber}, so its ${locked
        .map((c) => c.label.toLowerCase())
        .join(", ")} cannot change — the old statements would stop matching. Retire it and add the new account instead.`,
    };
  }

  await prisma.$transaction(async (tx) => {
    for (const change of changes) {
      await recordFieldChange(
        {
          actor,
          entity: "BankAccount",
          entityId: account.id,
          field: change.field,
          oldValue: change.from,
          newValue: change.to,
          reason: "Collection account edited in company settings",
        },
        tx
      );
    }
    await tx.bankAccount.update({ where: { id: account.id }, data });
    await recordAudit(
      {
        actor,
        action: "account.collection.edit",
        entity: "BankAccount",
        entityId: account.id,
        summary: `Edited collection account ${account.bankName} ${account.accountNumber}: ${changes
          .map((c) => `${c.label.toLowerCase()} ${c.from ?? "—"} → ${c.to ?? "—"}`)
          .join("; ")}`,
        metadata: { changes },
      },
      tx
    );
  });

  refresh();
  return { ok: `${data.bankName} saved.` };
}

const activeSchema = z.object({
  id: z.string().min(1),
  active: z.enum(["true", "false"]),
  reason: z.string().trim().optional(),
});

/**
 * Take an account off the invoices, or put it back.
 *
 * Never a delete: payments were recorded against it and the ledger still has
 * to say where that money went. An account still holding money is not retired
 * — its balance would vanish from every total that counts open accounts.
 */
export async function setCollectionAccountActive(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const actor = await authorize("settings.manage");

  const parsed = activeSchema.safeParse({
    id: formData.get("id"),
    active: formData.get("active"),
    reason: formData.get("reason") || undefined,
  });
  if (!parsed.success) return { error: "That request was not understood." };
  const active = parsed.data.active === "true";
  const reason = parsed.data.reason ?? "";

  const account = await prisma.bankAccount.findUnique({ where: { id: parsed.data.id } });
  if (!account) return { error: "That account no longer exists." };
  if (account.kind === "CASH") {
    return { error: "A cash tin is not an account customers pay into." };
  }
  if (account.active === active) {
    return { ok: active ? "It is already open." : "It is already retired." };
  }

  if (!active) {
    const position = (await accountPositions()).find((p) => p.id === account.id);
    if (position && Math.abs(position.balance) >= 0.005) {
      return {
        error: `${account.bankName} still holds ${formatCurrency(position.balance, account.currency)} on the books. Move it to another account first, so the money does not drop out of the totals.`,
      };
    }
  }

  await prisma.$transaction(async (tx) => {
    await recordFieldChange(
      {
        actor,
        entity: "BankAccount",
        entityId: account.id,
        field: "active",
        oldValue: account.active,
        newValue: active,
        reason: reason || (active ? "Reopened in company settings" : "Retired in company settings"),
      },
      tx
    );
    await tx.bankAccount.update({ where: { id: account.id }, data: { active } });
    await recordAudit(
      {
        actor,
        action: active ? "account.collection.reopen" : "account.collection.retire",
        entity: "BankAccount",
        entityId: account.id,
        summary: `${active ? "Reopened" : "Retired"} collection account ${account.bankName} ${account.accountNumber} (${account.currency})${reason ? ` — ${reason}` : ""}`,
        metadata: { oldValue: account.active, newValue: active, reason: reason || null },
      },
      tx
    );
  });

  refresh();
  return {
    ok: active
      ? `${account.bankName} is open again and prints on invoices issued from now on.`
      : `${account.bankName} is retired. It no longer prints on new invoices; bills already issued keep it, and its history stays.`,
  };
}
