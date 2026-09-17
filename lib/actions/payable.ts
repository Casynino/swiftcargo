"use server";

import { balanceOf } from "@/lib/invoice-balance";
import { prisma } from "@/lib/prisma";
import { authorize } from "@/lib/session";
import type {
  PayableBill,
  PayAccount,
} from "@/components/app/record-payment-dialog";

/**
 * WHAT THE RECORD PAYMENT DIALOG NEEDS, FETCHED WHEN IT OPENS.
 *
 * The dialog sits in the app frame on every screen. Loading every open bill
 * into every page on the chance somebody presses the button would make the
 * whole app slower for a list most page views never show — so it is read at
 * the moment it is wanted, and fresh each time.
 *
 * Only bills waiting to be recorded: open, still owed, and with no claim
 * already waiting on Finance. A second payment for those is a double charge.
 */
export async function loadPayable(): Promise<{
  bills: PayableBill[];
  accounts: PayAccount[];
}> {
  await authorize("payment.submit");

  const [invoices, accounts] = await Promise.all([
    prisma.invoice.findMany({
      where: { status: { in: ["ISSUED", "PARTIALLY_PAID", "OVERDUE"] } },
      orderBy: { issuedAt: "desc" },
      include: {
        payments: true,
        customer: {
          select: { id: true, fullName: true, businessName: true, phone: true },
        },
        cargo: {
          select: {
            reference: true,
            description: true,
            containerLines: {
              take: 1,
              orderBy: { createdAt: "desc" },
              select: { container: { select: { id: true, reference: true } } },
            },
          },
        },
      },
    }),
    prisma.bankAccount.findMany({
      where: { active: true },
      orderBy: [{ sortOrder: "asc" }, { bankName: "asc" }],
      select: { id: true, bankName: true, currency: true, kind: true },
    }),
  ]);

  const bills = invoices
    .filter((i) => !i.payments.some((p) => p.status === "PENDING"))
    .map((i) => ({ i, balance: balanceOf(i) }))
    .filter(({ balance }) => !balance.settled)
    .map(({ i, balance }) => {
      const container = i.cargo.containerLines[0]?.container ?? null;
      return {
        invoiceId: i.id,
        number: i.number,
        customerId: i.customer.id,
        customerName: i.customer.businessName || i.customer.fullName,
        phone: i.customer.phone,
        cargo: i.cargo.reference,
        goods: i.cargo.description ?? "",
        containerId: container?.id ?? null,
        container: container?.reference ?? null,
        currency: i.currency,
        outstanding: Number(balance.outstanding),
        /* Whole shillings, exact. The dialog asks for this figure. */
        outstandingTzs: balance.outstandingTzs ? Number(balance.outstandingTzs) : null,
        totalTzs: balance.totalTzs ? Number(balance.totalTzs) : null,
        total: Number(balance.total),
        rate: balance.rate ? balance.rate.toString() : null,
        standardRate: i.standardRate ? Number(i.standardRate) : null,
        appliedRate: i.appliedRate ? Number(i.appliedRate) : null,
        cbm: i.billableCbm ? Number(i.billableCbm) : null,
      };
    });

  return {
    bills,
    accounts: accounts.map((a) => ({
      id: a.id,
      name: `${a.bankName} (${a.currency})`,
      currency: a.currency,
      kind: a.kind,
    })),
  };
}
