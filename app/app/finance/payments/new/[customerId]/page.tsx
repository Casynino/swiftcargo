import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import {
  MergePaymentForm,
  type MergeBill,
  type WaitingBill,
} from "@/components/app/merge-payment-form";
import { PageHeader } from "@/components/app/page-header";
import { WhatsAppButton } from "@/components/app/whatsapp-button";
import { formatMoney } from "@/lib/format";
import { Prisma } from "@prisma/client";

import { formatCurrency } from "@/lib/currency";
import { balanceOf, outstandingOf } from "@/lib/invoice-balance";
import { whatsappNumber } from "@/lib/messages";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { requirePermission } from "@/lib/session";
import { storagePosition } from "@/lib/storage-fee";
import { SmartBack } from "@/components/app/smart-back";

export const metadata: Metadata = { title: "Merge Payment" };

/**
 * ONE PAYMENT, AGAINST AS MANY OF THIS CUSTOMER'S BILLS AS IT COVERS.
 *
 * The customer is in front of the clerk and the cargo is not — they have rung,
 * or walked in with money for three consignments on two containers. Tick what
 * the money covers on the left, say what arrived and where it landed on the
 * right. Each consignment keeps its own invoice, container and pickup note.
 */
export default async function MergePaymentForCustomer({
  params,
}: {
  params: Promise<{ customerId: string }>;
}) {
  const user = await requirePermission("payment.submit");
  const { customerId } = await params;

  const [customer, accounts, settings] = await Promise.all([
    prisma.customer.findUnique({
      where: { id: customerId },
      select: {
        id: true,
        fullName: true,
        businessName: true,
        phone: true,
        invoices: {
          where: { status: { in: ["ISSUED", "PARTIALLY_PAID", "OVERDUE"] } },
          orderBy: { issuedAt: "asc" },
          include: {
            payments: true,
            items: { select: { category: true, amount: true } },
            cargo: {
              select: {
                reference: true,
                description: true,
                darReceiving: { select: { receivedAt: true } },
                containerLines: {
                  take: 1,
                  orderBy: { createdAt: "desc" },
                  select: { container: { select: { reference: true } } },
                },
              },
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
    prisma.companySetting.findUnique({
      where: { id: "singleton" },
      select: { freeStorageDays: true, storagePerDay: true, storageCurrency: true },
    }),
  ]);
  if (!customer) notFound();

  /* Open is derived — verified payments have not covered the bill. */
  const open = customer.invoices.filter((i) => outstandingOf(i).greaterThan(0));

  const name = customer.businessName || customer.fullName;

  const bills: MergeBill[] = [];
  const waiting: WaitingBill[] = [];

  for (const invoice of open) {
    const claim = invoice.payments.find((p) => p.status === "PENDING");
    const description = invoice.cargo.description ?? "";
    if (claim) {
      waiting.push({
        invoiceId: invoice.id,
        cargo: invoice.cargo.reference,
        description,
        claim: `${formatMoney(claim.amount, claim.currency)} · ${claim.reference}`,
      });
      continue;
    }

    /* Storage accrued against what is already on the bill. The difference is
       named on the row rather than folded in: folding it in would promise a
       total the payment would then be refused for. */
    const accrued = storagePosition({
      receivedAt: invoice.cargo.darReceiving?.receivedAt ?? null,
      collectedAt: null,
      freeDays: settings?.freeStorageDays ?? 0,
      perDay: settings?.storagePerDay ?? 0,
      currency: settings?.storageCurrency ?? "USD",
    });
    const onBill = invoice.items
      .filter((i) => i.category === "Storage")
      .reduce((s, i) => s + Number(i.amount), 0);
    const rate = Number(invoice.fxRate) > 1 ? Number(invoice.fxRate) : null;
    let accruedInBill = Number(accrued.amount);
    if (accrued.currency !== invoice.currency && rate) {
      accruedInBill =
        accrued.currency === "TZS" ? accruedInBill / rate : accruedInBill * rate;
    }

    bills.push({
      invoiceId: invoice.id,
      number: invoice.number,
      cargoId: invoice.cargoId,
      total: Number(invoice.total),
      cargo: invoice.cargo.reference,
      description,
      container: invoice.cargo.containerLines[0]?.container.reference ?? null,
      currency: invoice.currency,
      outstanding: Number(outstandingOf(invoice)),
      outstandingTzs: balanceOf(invoice).outstandingTzs?.toNumber() ?? null,
      rate,
      storageUncharged: Math.max(0, accruedInBill - onBill),
    });
  }

  /* Summed in shillings; a bill with no rate cannot join that sum and is named
     in its own currency instead of being added to it. */
  const balances = open.map(balanceOf);
  const owedTzs = balances.reduce((s, b) => (b.outstandingTzs ? s.add(b.outstandingTzs) : s), new Prisma.Decimal(0));
  const rateless = balances.filter((b) => !b.outstandingTzs);
  const owedLine = [
    owedTzs.greaterThan(0) ? formatCurrency(owedTzs, "TZS") : null,
    ...rateless.map((b) => formatCurrency(b.outstanding, b.currency)),
  ].filter(Boolean).join(" + ");

  return (
    <div className="space-y-5">
      <SmartBack fallbackHref="/app/finance/payments/new" fallbackLabel="Another customer" />

      <PageHeader
        title={name}
        description="One payment, against as many of their bills as it covers. The account moves once."
        actions={
          customer.phone ? (
            <WhatsAppButton
              phone={whatsappNumber(customer.phone)}
              kind="payment.reminder"
              label="Notify on WhatsApp"
              message={`Habari ${name}, una bili ${open.length} zinazodaiwa Swift Cargo, jumla ${owedLine}.`}
            />
          ) : null
        }
      />

      {open.length === 0 ? (
        <div className="rounded-xl border bg-card px-5 py-12 text-center">
          <p className="font-medium">Every bill is settled</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Nothing on this customer is waiting to be paid.
          </p>
        </div>
      ) : (
        <MergePaymentForm
          canClear={can(user.role, "payment.verify")}
          canChangeBill={can(user.role, "invoice.discount")}
          canChangeRate={can(user.role, "invoice.edit")}
          customerId={customer.id}
          customerName={name}
          bills={bills}
          waiting={waiting}
          accounts={accounts.map((a) => ({
            id: a.id,
            name: `${a.bankName} (${a.currency})`,
            currency: a.currency,
            kind: a.kind,
          }))}
          combinedBillHref={
            open.length > 1
              ? `/app/finance/payments/new/${customer.id}/bill`
              : null
          }
        />
      )}
    </div>
  );
}
