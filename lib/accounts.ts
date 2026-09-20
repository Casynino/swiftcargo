import { cache } from "react";

import { prisma } from "@/lib/prisma";

/**
 * WHAT IS IN EACH ACCOUNT, READ OFF ITS OWN HISTORY.
 *
 * Nothing here is a stored balance. Every figure is the opening amount plus the
 * movements recorded against the account, added up at read time. A balance
 * column would be a second opinion, and the first time a payment is reversed
 * there would be two numbers and no way to say which is wrong.
 *
 * Five things move money:
 *   · what was in the account when it was put on the system   (in)
 *   · a verified payment landing, transport they added included (in)
 *   · that transport, paid out to the driver                   (out)
 *   · a cost paid out of the account                           (out)
 *   · a transfer between our own accounts, with its charge     (out, then in)
 *
 * The account cards, one account's page and the general ledger all read
 * `accountRegister`, and the balances are that register added up — so the
 * three screens cannot disagree, because there is only one list.
 */
export type AccountPosition = {
  id: string;
  kind: "BANK" | "MOBILE_MONEY" | "CASH";
  bankName: string;
  accountName: string;
  accountNumber: string;
  branch: string | null;
  currency: string;
  active: boolean;
  opening: number;
  in: number;
  out: number;
  balance: number;
  movements: number;
  lastMovedAt: Date | null;
  lastCountedAt: Date | null;
  lastCountDifference: number | null;
};

export type AccountEntry = {
  id: string;
  kind: "payment" | "expense" | "transfer" | "opening";
  recordId: string;
  at: Date;
  /** "Cash sale", "Port charges", "Moved between accounts", "Opening balance". */
  type: string;
  /** The expense category, when there is one — the ledger filters on it. */
  category: string | null;
  /** Who the money came from or went to. */
  detail: string;
  description: string;
  reference: string;
  accountId: string;
  account: string;
  by: string | null;
  byId: string | null;
  verifiedBy: string | null;
  direction: "IN" | "OUT";
  amount: number;
  currency: string;
  proofHref: string | null;
  href: string;
  cancelled: boolean;
  cancelledReason: string | null;
  tag: string | null;
};

const label = (a: { bankName: string; currency: string }) =>
  `${a.bankName} (${a.currency})`;

/**
 * THE REGISTER.
 *
 * Assembled from the payments, costs, transfers and opening balances rather
 * than posted to a register of its own — a register that has to be written to
 * is one somebody forgets to write to. Pass an account id for one account's
 * movements; pass none for every account. `take` limits each source, for
 * screens that show only the latest.
 */
export const accountRegister = cache(async function accountRegister(
  accountId?: string,
  take?: number
): Promise<AccountEntry[]> {
  const [accounts, payments, expenses, transfers] = await Promise.all([
    prisma.bankAccount.findMany({
      select: {
        id: true,
        bankName: true,
        currency: true,
        openingBalance: true,
        openingBalanceAt: true,
        createdAt: true,
      },
    }),
    prisma.payment.findMany({
      where: {
        status: { in: ["VERIFIED", "REVERSED"] },
        accountId: { not: null },
        writtenOff: false,
      },
      orderBy: { paidAt: "desc" },
      take,
      include: {
        account: { select: { id: true, bankName: true, currency: true } },
        customer: { select: { fullName: true } },
        invoice: {
          select: {
            id: true,
            number: true,
            cargo: { select: { reference: true, description: true } },
          },
        },
        receipts: { select: { number: true }, take: 1 },
        verifiedBy: { select: { name: true } },
        recordedBy: { select: { id: true, name: true } },
        proofs: { select: { url: true }, take: 1 },
      },
    }),
    prisma.containerExpense.findMany({
      where: { deletedAt: null, accountId: { not: null } },
      orderBy: { createdAt: "desc" },
      take,
      include: {
        account: { select: { id: true, bankName: true, currency: true } },
        expenseType: { select: { name: true } },
        vendor: { select: { name: true } },
        container: { select: { id: true, reference: true } },
        recordedBy: { select: { id: true, name: true } },
      },
    }),
    prisma.accountTransfer.findMany({
      orderBy: { transferDate: "desc" },
      take,
      include: {
        fromAccount: { select: { id: true, bankName: true, currency: true } },
        toAccount: { select: { id: true, bankName: true, currency: true } },
        recordedBy: { select: { id: true, name: true } },
      },
    }),
  ]);

  /* Transport is settled from a cash tin or the Lipa number. The payment
     remembers that account by id or, on older rows, by its name — both are
     resolved here so the fare leaves the account it really left. */
  const byIdOrName = (value: string | null, currency: string) =>
    value
      ? (accounts.find((a) => a.id === value) ??
        accounts.find((a) => a.bankName === value && a.currency === currency) ??
        accounts.find((a) => a.bankName === value) ??
        null)
      : null;

  const entries: AccountEntry[] = [];

  for (const a of accounts) {
    const opening = Number(a.openingBalance);
    if (opening === 0) continue;
    entries.push({
      id: `o-${a.id}`,
      kind: "opening",
      recordId: a.id,
      at: a.openingBalanceAt ?? a.createdAt,
      type: "Opening balance",
      category: null,
      detail: `Opening balance for ${label(a)}`,
      description: "What was in the account when it was put on the system",
      reference: "",
      accountId: a.id,
      account: label(a),
      by: null,
      byId: null,
      verifiedBy: null,
      direction: opening > 0 ? "IN" : "OUT",
      amount: Math.abs(opening),
      currency: a.currency,
      proofHref: null,
      href: `/app/finance/accounts/${a.id}`,
      cancelled: false,
      cancelledReason: null,
      tag: null,
    });
  }

  for (const p of payments) {
    if (!p.account) continue;
    const delivery = Number(p.deliveryAdded ?? 0);
    const goods = p.invoice.cargo.description;
    const common = {
      recordId: p.id,
      at: p.paidAt ?? p.createdAt,
      category: null,
      detail: p.customer.fullName,
      by: p.recordedBy?.name ?? null,
      byId: p.recordedBy?.id ?? null,
      verifiedBy: p.verifiedBy?.name ?? null,
      currency: p.currency,
      proofHref: p.proofs[0]?.url ?? null,
      href: `/app/finance/invoices/${p.invoice.id}`,
      cancelled: p.status === "REVERSED",
      cancelledReason: p.reversedReason,
    };
    entries.push({
      ...common,
      id: `p-${p.id}`,
      kind: "payment",
      type: "Cash sale",
      description: [goods, p.receipts[0]?.number ?? p.reference, p.invoice.cargo.reference]
        .filter(Boolean)
        .join(" · "),
      reference: p.reference,
      accountId: p.account.id,
      account: label(p.account),
      direction: "IN",
      /* Everything that landed: the fare the customer added arrived in the same
         transfer, so it is in the account until it is paid out below. */
      amount: Number(p.amount) + delivery,
      tag: delivery > 0 ? "transport included" : null,
    });
    const settled = delivery > 0 ? byIdOrName(p.deliverySettledFrom, p.currency) : null;
    if (settled) {
      entries.push({
        ...common,
        id: `pt-${p.id}`,
        kind: "payment",
        type: "Transport paid out",
        detail: p.customer.fullName,
        description: `Transport on ${p.invoice.cargo.reference} · ${p.reference}`,
        reference: p.reference,
        accountId: settled.id,
        account: label(settled),
        direction: "OUT",
        amount: delivery,
        currency: settled.currency,
        tag: null,
      });
    }
  }

  for (const e of expenses) {
    if (!e.account) continue;
    entries.push({
      id: `e-${e.id}`,
      kind: "expense",
      recordId: e.id,
      at: e.paidDate ?? e.expenseDate ?? e.createdAt,
      type: e.expenseType?.name ?? "Cost",
      category: e.expenseType?.name ?? null,
      detail: e.description || e.vendor?.name || e.expenseType?.name || "Cost",
      description: [e.reference, e.container?.reference].filter(Boolean).join(" · "),
      reference: e.reference,
      accountId: e.account.id,
      account: label(e.account),
      by: e.recordedBy?.name ?? null,
      byId: e.recordedBy?.id ?? null,
      verifiedBy: null,
      direction: "OUT",
      amount: Number(e.amount),
      currency: e.currency,
      proofHref: e.receiptUrl,
      href: e.container ? `/app/finance/containers/${e.container.id}` : "/app/finance/expenses",
      cancelled: e.cancelledAt !== null,
      cancelledReason: e.cancelledReason,
      tag: e.receiptUrl ? null : "no receipt",
    });
  }

  for (const t of transfers) {
    const common = {
      recordId: t.id,
      at: t.transferDate,
      category: null,
      reference: t.reference,
      by: t.recordedBy?.name ?? null,
      byId: t.recordedBy?.id ?? null,
      verifiedBy: null,
      proofHref: null,
      href: "/app/finance/accounts",
      cancelled: t.cancelledAt !== null,
      cancelledReason: t.cancelledReason,
      type: "Moved between accounts",
    };
    entries.push({
      ...common,
      id: `t-out-${t.id}`,
      kind: "transfer",
      detail: t.toAccount.bankName,
      description: `${t.reference} · to ${label(t.toAccount)}${t.purpose ? ` · ${t.purpose}` : ""}`,
      accountId: t.fromAccount.id,
      account: label(t.fromAccount),
      direction: "OUT",
      /* The charge leaves the first account too. */
      amount: Number(t.amount) + Number(t.charge),
      currency: t.fromAccount.currency,
      tag: Number(t.charge) > 0 ? "incl. charge" : null,
    });
    entries.push({
      ...common,
      id: `t-in-${t.id}`,
      kind: "transfer",
      detail: t.fromAccount.bankName,
      description: `${t.reference} · from ${label(t.fromAccount)}`,
      accountId: t.toAccount.id,
      account: label(t.toAccount),
      direction: "IN",
      amount: Number(t.amountArrived),
      currency: t.toAccount.currency,
      tag: null,
    });
  }

  return entries
    .filter((e) => !accountId || e.accountId === accountId)
    .sort((a, b) => b.at.getTime() - a.at.getTime());
});

/** Every account's balance, as its register added up. */
export const accountPositions = cache(async function accountPositions(): Promise<AccountPosition[]> {
  const [accounts, register, counts] = await Promise.all([
    prisma.bankAccount.findMany({
      orderBy: [{ active: "desc" }, { sortOrder: "asc" }, { bankName: "asc" }],
    }),
    accountRegister(),
    prisma.cashCount.findMany({
      orderBy: { countedAt: "desc" },
      select: { accountId: true, counted: true, expected: true, countedAt: true },
    }),
  ]);

  const lastCount = new Map<string, (typeof counts)[number]>();
  for (const c of counts) if (!lastCount.has(c.accountId)) lastCount.set(c.accountId, c);

  return accounts.map((account) => {
    const live = register.filter(
      (e) => e.accountId === account.id && !e.cancelled && e.kind !== "opening"
    );
    const moneyIn = live
      .filter((e) => e.direction === "IN")
      .reduce((s, e) => s + e.amount, 0);
    const moneyOut = live
      .filter((e) => e.direction === "OUT")
      .reduce((s, e) => s + e.amount, 0);
    const opening = Number(account.openingBalance);
    const counted = lastCount.get(account.id);
    return {
      id: account.id,
      kind: account.kind,
      bankName: account.bankName,
      accountName: account.accountName,
      accountNumber: account.accountNumber,
      branch: account.branch,
      currency: account.currency,
      active: account.active,
      opening,
      in: moneyIn,
      out: moneyOut,
      balance: opening + moneyIn - moneyOut,
      movements: live.length + (opening !== 0 ? 1 : 0),
      lastMovedAt: live[0]?.at ?? null,
      lastCountedAt: counted?.countedAt ?? null,
      lastCountDifference: counted
        ? Number(counted.counted) - Number(counted.expected)
        : null,
    };
  });
});
