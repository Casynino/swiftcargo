import type { Prisma } from "@prisma/client";

import { prisma, type TxClient } from "@/lib/prisma";

/** One account as a bill prints it. */
export type InvoiceAccount = {
  kind: "BANK" | "MOBILE_MONEY";
  bankName: string;
  accountName: string;
  accountNumber: string;
  branch: string | null;
  currency: string;
};

/**
 * Where a customer can send money, as it stands now. The office cash tin is
 * where the desk keeps notes, not an account anybody transfers to.
 */
export async function collectionAccountsNow(
  client: TxClient | typeof prisma = prisma
): Promise<InvoiceAccount[]> {
  const rows = await client.bankAccount.findMany({
    where: { active: true, kind: { not: "CASH" } },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: {
      kind: true,
      bankName: true,
      accountName: true,
      accountNumber: true,
      branch: true,
      currency: true,
    },
  });
  return rows.map((row) => ({
    kind: row.kind === "MOBILE_MONEY" ? "MOBILE_MONEY" : "BANK",
    bankName: row.bankName,
    accountName: row.accountName,
    accountNumber: row.accountNumber,
    branch: row.branch,
    currency: row.currency,
  }));
}

/** The copy written onto an invoice as it is issued. See Invoice.paymentSnapshot. */
export async function paymentSnapshotNow(
  client: TxClient | typeof prisma = prisma
): Promise<Prisma.InputJsonValue> {
  return (await collectionAccountsNow(client)) as unknown as Prisma.InputJsonValue;
}

/**
 * The accounts to print on one invoice.
 *
 * An invoice is a legal document: the account a customer paid into has to be
 * reproducible FROM THAT INVOICE, not from a settings table somebody edited
 * afterwards. So each issued invoice keeps a copy of what it was issued with,
 * and this reads that copy whenever it exists.
 *
 * A draft has none — nobody has been told where to pay yet — and neither do
 * bills issued before the copy was kept. Those print the accounts as they
 * stand today, which is what they have always printed.
 */
export async function accountsForInvoice(snapshot: unknown): Promise<InvoiceAccount[]> {
  if (Array.isArray(snapshot) && snapshot.length > 0) {
    return snapshot as InvoiceAccount[];
  }
  return collectionAccountsNow();
}
