"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { accountPositions } from "@/lib/accounts";
import { recordAudit, recordFieldChange } from "@/lib/audit";
import { nextTransferReference } from "@/lib/ids";
import { prisma } from "@/lib/prisma";
import { authorize } from "@/lib/session";

export type ActionState = { error?: string; ok?: string };

const moveSchema = z.object({
  fromAccountId: z.string().min(1, "Which account is it leaving?"),
  toAccountId: z.string().min(1, "Which account is it going into?"),
  amount: z.coerce.number().positive("How much is leaving?"),
  charge: z.coerce.number().min(0).default(0),
  amountArrived: z.coerce.number().min(0).optional(),
  purpose: z.string().trim().max(200).optional(),
  transferDate: z.string().trim().optional(),
});

/**
 * BANKING THE DAY'S TAKINGS, TOPPING UP THE TIN, CONVERTING DOLLARS.
 *
 * Neither income nor a cost — the business is no richer afterwards. It is here
 * because both balances move, and a balance that ignores a deposit disagrees
 * with the bank by exactly the deposit.
 */
export async function moveMoney(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const actor = await authorize("accounting.manage");

  const parsed = moveSchema.safeParse({
    fromAccountId: formData.get("fromAccountId"),
    toAccountId: formData.get("toAccountId"),
    amount: formData.get("amount"),
    charge: formData.get("charge") || 0,
    amountArrived: formData.get("amountArrived") || undefined,
    purpose: formData.get("purpose") || undefined,
    transferDate: formData.get("transferDate") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the form." };
  }
  const data = parsed.data;

  // Money cannot move to where it already is. The pair of selects makes this
  // one mis-click away, and the row it would write reads as a real movement.
  if (data.fromAccountId === data.toAccountId) {
    return { error: "Choose two different accounts." };
  }

  const [from, to] = await Promise.all([
    prisma.bankAccount.findUnique({ where: { id: data.fromAccountId } }),
    prisma.bankAccount.findUnique({ where: { id: data.toAccountId } }),
  ]);
  if (!from || !to) return { error: "That account no longer exists." };

  /* Same currency both ends means what arrived is what left, less the charge,
     and typing it again is a chance to get it wrong. Across currencies there is
     no relationship at all, so the figure has to be given. */
  const sameCurrency = from.currency === to.currency;
  const arrived =
    data.amountArrived ?? (sameCurrency ? data.amount - data.charge : undefined);
  if (arrived === undefined) {
    return {
      error: `${from.currency} into ${to.currency} — say what actually arrived.`,
    };
  }
  if (arrived <= 0) return { error: "Nothing arrived. Check the charge." };

  /* The tin cannot go negative in real life, so a move that would take it there
     is a move somebody has mis-keyed — or a takings entry that was never
     recorded. Either way the answer is not to write it. */
  const positions = await accountPositions();
  const standing = positions.find((p) => p.id === from.id);
  if (standing && standing.balance < data.amount + data.charge) {
    return {
      error: `${from.bankName} only holds ${standing.balance.toLocaleString()} ${from.currency}.`,
    };
  }

  const transfer = await prisma.$transaction(async (tx) =>
    tx.accountTransfer.create({
      data: {
        reference: await nextTransferReference(tx),
        fromAccountId: from.id,
        toAccountId: to.id,
        amount: data.amount,
        charge: data.charge,
        amountArrived: arrived,
        purpose: data.purpose || null,
        transferDate: data.transferDate ? new Date(data.transferDate) : new Date(),
        recordedById: actor.id,
      },
    })
  );

  await recordAudit({
    actor,
    action: "account.transfer",
    entity: "BankAccount",
    entityId: from.id,
    summary: `${transfer.reference}: ${from.currency} ${data.amount} from ${from.bankName} to ${to.bankName}`,
  });

  revalidatePath("/app/finance/accounts");
  revalidatePath("/app/finance/accounts/[id]", "page");
  revalidatePath("/app/finance/ledger");
  revalidatePath("/app/finance");
  return { ok: `${transfer.reference} recorded.` };
}

const countSchema = z.object({
  accountId: z.string().min(1, "Which tin?"),
  counted: z.coerce.number().min(0, "What was counted?"),
  note: z.string().trim().max(300).optional(),
});

/**
 * COUNTING THE TIN.
 *
 * The count never moves a balance. The balance is this account's own history
 * added up, and it cannot disagree with itself — so a short count is evidence
 * of a movement nobody recorded, and the fix is to record that movement, not to
 * overwrite the total with whatever was on the desk.
 */
export async function countTheCash(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const actor = await authorize("accounting.manage");

  const parsed = countSchema.safeParse({
    accountId: formData.get("accountId"),
    counted: formData.get("counted"),
    note: formData.get("note") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the form." };
  }
  const data = parsed.data;

  const positions = await accountPositions();
  const standing = positions.find((p) => p.id === data.accountId);
  if (!standing) return { error: "That account no longer exists." };

  await prisma.cashCount.create({
    data: {
      accountId: data.accountId,
      counted: data.counted,
      // Pinned, not looked up later. A correction to the history afterwards
      // must not quietly rewrite what this count found at the time.
      expected: standing.balance,
      note: data.note || null,
      countedById: actor.id,
    },
  });

  const difference = data.counted - standing.balance;

  await recordAudit({
    actor,
    action: "account.count",
    entity: "BankAccount",
    entityId: data.accountId,
    summary:
      difference === 0
        ? `${standing.bankName} counted and agreed`
        : `${standing.bankName} counted ${difference > 0 ? "over" : "short"} by ${Math.abs(difference)}`,
  });

  revalidatePath("/app/finance/accounts");
  revalidatePath("/app/finance/accounts/[id]", "page");
  return {
    ok:
      difference === 0
        ? "Counted, and it agrees with the ledger."
        : `Counted ${difference > 0 ? "over" : "short"} by ${Math.abs(difference).toLocaleString()} ${standing.currency}. Find the movement nobody recorded.`,
  };
}

/**
 * A MOVE THAT DID NOT HAPPEN.
 *
 * Cancelled rather than deleted, for the same reason as everything else on this
 * register: both balances moved when it was written, and a row that disappears
 * leaves two accounts that cannot explain themselves.
 */
export async function cancelTransfer(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const actor = await authorize("accounting.manage");

  const id = String(formData.get("transferId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim() || "No reason given";

  const transfer = await prisma.accountTransfer.findUnique({
    where: { id },
    select: { id: true, reference: true, cancelledAt: true },
  });
  if (!transfer) return { error: "That movement no longer exists." };
  if (transfer.cancelledAt) return { error: "It is already cancelled." };

  const { count } = await prisma.accountTransfer.updateMany({
    where: { id: transfer.id, cancelledAt: null },
    data: { cancelledAt: new Date(), cancelledReason: reason },
  });
  if (count === 0) return { error: "Somebody cancelled it first." };

  await recordAudit({
    actor,
    action: "account.transfer.cancel",
    entity: "AccountTransfer",
    entityId: transfer.id,
    summary: `Cancelled ${transfer.reference}: ${reason}`,
  });

  revalidatePath("/app/finance/accounts");
  revalidatePath("/app/finance/ledger");
  return { ok: "Cancelled." };
}

/**
 * WHAT WAS IN THE ACCOUNT BEFORE THIS SOFTWARE WAS.
 *
 * The one figure on an account somebody types. Everything after it is the
 * register added up, so without it every account that existed before the
 * system reads short by exactly what the bank already held — and a ledger of a
 * profitable business reads negative. Changing it later is allowed, because the
 * first figure entered is often a guess, but the old and new values and the
 * reason are written down before it moves.
 */
export async function setOpeningBalance(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const actor = await authorize("accounting.manage");

  const accountId = String(formData.get("accountId") ?? "");
  const raw = String(formData.get("amount") ?? "").trim();
  const amount = Number(raw);
  const on = String(formData.get("on") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim() || "No reason given";

  if (raw === "" || !Number.isFinite(amount)) {
    return { error: "What was in the account?" };
  }

  const account = await prisma.bankAccount.findUnique({ where: { id: accountId } });
  if (!account) return { error: "That account no longer exists." };


  /* Before the first movement it comes before. Accounts are often put on the
     system after money has already been recorded against them. */
  const [firstIn, firstOut] = await Promise.all([
    prisma.payment.findFirst({
      where: { accountId: account.id },
      orderBy: { paidAt: "asc" },
      select: { paidAt: true, createdAt: true },
    }),
    prisma.containerExpense.findFirst({
      where: { accountId: account.id },
      orderBy: { createdAt: "asc" },
      select: { expenseDate: true, createdAt: true },
    }),
  ]);
  const earliest = new Date(
    Math.min(
      account.createdAt.getTime(),
      (firstIn?.paidAt ?? firstIn?.createdAt ?? account.createdAt).getTime(),
      (firstOut?.expenseDate ?? firstOut?.createdAt ?? account.createdAt).getTime()
    ) - 1000
  );

  await prisma.$transaction(async (tx) => {
    await recordFieldChange(
      {
        entity: "BankAccount",
        entityId: account.id,
        field: "openingBalance",
        oldValue: account.openingBalance,
        newValue: amount,
        reason: reason || "Opening balance set",
        actor,
      },
      tx
    );
    await tx.bankAccount.update({
      where: { id: account.id },
      data: {
        openingBalance: amount,
        /* Left blank, it is dated to when the account was put on the system —
           an opening balance dated today would sort after every movement it
           comes before, and the running balance would read backwards. */
        openingBalanceAt: on ? new Date(on) : earliest,
      },
    });
  });

  await recordAudit({
    actor,
    action: "account.opening",
    entity: "BankAccount",
    entityId: account.id,
    summary: `Opening balance of ${account.bankName} (${account.currency}) set to ${amount}`,
  });

  revalidatePath("/app/finance/accounts", "layout");
  revalidatePath("/app/finance/ledger");
  return { ok: "Opening balance saved." };
}
