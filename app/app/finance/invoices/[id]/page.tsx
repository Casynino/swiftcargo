import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Download, FileClock, Printer } from "lucide-react";

import {
  CancelInvoiceForm,
  IssueInvoiceForm,
  ReversePaymentForm,
  VerifyPaymentButtons,
} from "@/components/app/finance-forms";
import { CreditButton } from "@/components/app/bill-dialogs";
import { InvoiceDocument } from "@/components/app/invoice-document";
import { InvoiceEditor } from "@/components/app/invoice-editor";
import { RememberTitle } from "@/components/app/nav-trail";
import { SendInvoice, type MessageOption } from "@/components/app/notify-customer";
import { SmartBack } from "@/components/app/smart-back";
import { WhatsAppButton } from "@/components/app/whatsapp-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { INVOICE_STATUS_LABELS, PAYMENT_STATUS_LABELS } from "@/lib/constants";
import { formatCbm, formatDate, formatDateTime, formatMoney } from "@/lib/format";
import { ChangePriceButton } from "@/components/app/bill-dialogs";
import { bookCategories, categoryOfCargo } from "@/lib/rate-categories";
import { CONTACT_KIND_LABELS, composeMessage, messageStage, whatsappNumber, type ContactKind } from "@/lib/messages";
import { formatCurrency, formatRate, tzsToUsd } from "@/lib/currency";
import { balanceOf, paymentTzs } from "@/lib/invoice-balance";
import { prisma } from "@/lib/prisma";
import { storagePosition } from "@/lib/storage-fee";
import { can } from "@/lib/rbac";
import { requirePermission } from "@/lib/session";
import { storageStart } from "@/lib/storage-clock";

import { primeLocale, T } from "@/lib/server-t";
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const invoice = await prisma.invoice.findUnique({
    where: { id },
    select: { number: true },
  });
  return { title: invoice?.number ?? "Invoice" };
}

export default async function InvoicePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await primeLocale();
  const user = await requirePermission("finance.view");
  const { id } = await params;

  const invoice = await prisma.invoice.findUnique({
    where: { id },
    include: {
      customer: true,
      cargo: {
        include: {
          darReceiving: true,
          pickupNote: true,
          containerLines: { include: { container: true } },
        },
      },
      items: true,
      payments: {
        include: { proofs: true, verifiedBy: true, recordedBy: true },
        orderBy: { createdAt: "desc" },
      },
      receipts: true,
      exchangeRate: true,
      issuedBy: { select: { name: true } },
    },
  });
  if (!invoice) notFound();

  const balance = balanceOf(invoice);
  const owing = balance.outstanding;
  const paid = balance.paid;
  /* Shillings are what is collected; the dollar figure and the pinned rate
     travel beside it everywhere a balance is shown. */
  const inTzs = balance.outstandingTzs !== null;
  const pending = invoice.payments.filter((p) => p.status === "PENDING");

  /* Paying for several at once is the commonest thing a customer does, and
     finding out after the first payment is recorded is the commonest way a
     receipt ends up against the wrong bill. */
  /* What the floor space has cost, if the business charges for it at all. */
  const settings = await prisma.companySetting.findUnique({
    where: { id: "singleton" },
  });
  const storage = storagePosition({
    receivedAt: storageStart(invoice.cargo.darReceiving?.receivedAt, invoice.cargo.clearedAt),
    collectedAt: null,
    freeDays: settings?.freeStorageDays ?? 7,
    perDay: settings?.storagePerDay ?? 0,
    currency: settings?.storageCurrency ?? "USD",
  });

  const otherUnpaid = await prisma.invoice.count({
    where: {
      customerId: invoice.customerId,
      id: { not: invoice.id },
      status: { in: ["ISSUED", "PARTIALLY_PAID", "OVERDUE"] },
    },
  });

  const onCredit = invoice.cargo.pickupNote?.onCredit ? invoice.cargo.pickupNote : null;
  const isDraft = invoice.status === "DRAFT";
  const live = !isDraft && invoice.status !== "CANCELLED";
  const hasVerified = invoice.payments.some((p) => p.status === "VERIFIED");

  const cargoLines = await prisma.cargoPackage.findMany({
    where: { cargoId: invoice.cargoId, deletedAt: null },
    select: { cargoType: true },
  });

  /* Where the goods are, so a reminder never calls boxes at sea "ready". */
  const stage = messageStage({
    status: invoice.cargo.status,
    hasDarReceiving: Boolean(invoice.cargo.darReceiving),
    clearedAt: invoice.cargo.clearedAt,
  });

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* The invoice document is the page, so the back link and the things done
          with a finished bill sit above it rather than in a page header. */}
      <RememberTitle title={invoice.number} />
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <SmartBack
          fallbackHref={`/app/cargo/${invoice.cargoId}`}
          fallbackLabel={invoice.cargo.reference}
          className="inline-flex"
        />
        <div className="flex flex-wrap items-center gap-2">
          {live ? (
            <WhatsAppButton
              cargoId={invoice.cargoId}
              invoiceId={invoice.id}
              phone={whatsappNumber(invoice.customer.phone)}
              kind={stage === "clearance" ? "cargo.arrived" : Number(owing) > 0 ? "payment.reminder" : "cargo.ready"}
              label={T("Notify on WhatsApp")}
              message={composeMessage(stage === "clearance" ? "cargo.arrived" : Number(owing) > 0 ? "payment.reminder" : "cargo.ready", {
                customerName: invoice.customer.fullName,
                reference: invoice.cargo.reference,
                invoiceNumber: invoice.number,
                currency: invoice.currency,
                amount: owing.toFixed(2),
                amountTzs: balance.outstandingTzs?.toNumber().toLocaleString("en-US") ?? null,
                fxRate: balance.rate ? balance.rate.toNumber().toLocaleString("en-US") : null,
                stage,
                cbm: invoice.billableCbm ? Number(invoice.billableCbm).toFixed(3) : null,
                ratePerCbm: invoice.appliedRate ? Number(invoice.appliedRate).toFixed(2) : null,
                description: invoice.cargo.description,
                freeStorageDays: settings?.freeStorageDays ?? null,
                storagePerDay: settings && Number(settings.storagePerDay) > 0 ? Number(settings.storagePerDay).toString() : null,
                storageCurrency: settings?.storageCurrency ?? "USD",
                storageFrom: storageStart(invoice.cargo.darReceiving?.receivedAt, invoice.cargo.clearedAt),
              })}
            />
          ) : null}
          {!isDraft ? (
            <Button asChild>
              <a href={`/app/finance/invoices/${invoice.id}/pdf`} download>
                <Download />
                {T("Download PDF")}
              </a>
            </Button>
          ) : null}
          <Button asChild>
            <a href={`/app/finance/invoices/${invoice.id}/document?download=1`} target="_blank" rel="noreferrer">
              <Printer />
              {T("Print")}
            </a>
          </Button>
        </div>
      </div>

      {isDraft ? (
        <div className="space-y-3 rounded-xl border border-signal/40 bg-signal/5 p-4 print:hidden">
          <p className="flex items-center gap-2 text-sm text-signal">
            <FileClock className="size-5 shrink-0" />
            {T("This price has not been confirmed yet. Confirm it before downloading or sending the invoice.")}
          </p>
          {can(user.role, "invoice.issue") ? <IssueInvoiceForm invoiceId={invoice.id} /> : null}
        </div>
      ) : null}

      {live && Number(owing) > 0 && can(user.role, "payment.verify") ? (
        onCredit ? (
          <p className="rounded-xl border border-warning/40 bg-warning/5 px-4 py-3 text-sm print:hidden">
            <span className="font-medium text-warning">{T("Released on credit")}</span>
            {onCredit.creditDueAt ? ` · due ${formatDate(onCredit.creditDueAt)}` : ""}
            {onCredit.creditReason ? ` · ${onCredit.creditReason}` : ""}
          </p>
        ) : (
          <div className="print:hidden">
            <CreditButton
              cargoId={invoice.cargoId}
              cargoReference={invoice.cargo.reference}
              customer={invoice.customer.fullName}
              invoiceNumber={invoice.number}
              amountLabel={
                balance.outstandingTzs !== null
                  ? formatCurrency(balance.outstandingTzs, "TZS")
                  : formatCurrency(owing, invoice.currency)
              }
              onCredit={false}
            />
          </div>
        )
      ) : null}

      {invoice.status !== "CANCELLED" &&
      can(user.role, "invoice.discount") &&
      invoice.items.some((i) => i.unit === "CBM") ? (
        <div className="print:hidden">
          <ChangePriceButton
            invoiceId={invoice.id}
            appliedRate={invoice.appliedRate ? Number(invoice.appliedRate) : null}
            standardRate={invoice.standardRate ? Number(invoice.standardRate) : null}
            cbm={invoice.billableCbm ? Number(invoice.billableCbm) : null}
            category={categoryOfCargo({ commodity: invoice.cargo.commodity, packages: cargoLines })}
            categories={await bookCategories()}
          />
        </div>
      ) : null}

      {invoice.status !== "CANCELLED" && can(user.role, "invoice.discount") ? (
        <InvoiceEditor
          invoiceId={invoice.id}
          appliedRate={invoice.appliedRate ? Number(invoice.appliedRate) : null}
          standardRate={invoice.standardRate ? Number(invoice.standardRate) : null}
          cbm={invoice.billableCbm ? Number(invoice.billableCbm) : null}
          storage={{
            configured: storage.configured,
            onBill: invoice.items.some((i) => i.category === "Storage"),
            clock: formatMoney(storage.amount, storage.currency),
            chargeableDays: storage.chargeableDays,
          }}
          discount={Number(invoice.discount)}
          fxRate={invoice.fxRate ? Number(invoice.fxRate) : null}
          notes={invoice.notes}
          total={Number(invoice.total)}
        />
      ) : null}

      {invoice.status !== "CANCELLED" && !hasVerified && can(user.role, "invoice.cancel") ? (
        <div className="print:hidden">
          <CancelInvoiceForm invoiceId={invoice.id} />
        </div>
      ) : null}

      {invoice.status === "CANCELLED" ? (
        <p className="rounded-xl border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive print:hidden">
          Cancelled {formatDate(invoice.cancelledAt)}{invoice.cancelledReason ? ` — ${invoice.cancelledReason}` : ""}
        </p>
      ) : null}

      <InvoiceDocument id={invoice.id} />

      {live ? (
        <SendInvoice
          cargoId={invoice.cargoId}
          invoiceId={invoice.id}
          phone={whatsappNumber(invoice.customer.phone)}
          displayPhone={invoice.customer.phone}
          options={(["cargo.arrived", "invoice.issued", "payment.reminder", "cargo.ready", "general"] as ContactKind[]).map(
            (kind): MessageOption => ({
              kind,
              label: CONTACT_KIND_LABELS[kind],
              suggested: kind === (stage === "clearance" ? "cargo.arrived" : Number(owing) > 0 ? "invoice.issued" : "cargo.ready"),
              body: composeMessage(kind, {
                customerName: invoice.customer.fullName,
                reference: invoice.cargo.reference,
                invoiceNumber: invoice.number,
                currency: invoice.currency,
                amount: owing.toFixed(2),
                amountTzs: balance.outstandingTzs?.toNumber().toLocaleString("en-US") ?? null,
                cbm: invoice.billableCbm ? Number(invoice.billableCbm).toFixed(3) : null,
                ratePerCbm: invoice.appliedRate ? Number(invoice.appliedRate).toFixed(2) : null,
                fxRate: balance.rate ? balance.rate.toNumber().toLocaleString("en-US") : null,
                freeStorageDays: settings?.freeStorageDays ?? null,
                storagePerDay: settings && Number(settings.storagePerDay) > 0 ? Number(settings.storagePerDay).toString() : null,
                storageCurrency: settings?.storageCurrency ?? "USD",
                stage,
                description: invoice.cargo.description,
                storageFrom: storageStart(invoice.cargo.darReceiving?.receivedAt, invoice.cargo.clearedAt),
              }),
            })
          )}
        />
      ) : null}

      <div className="space-y-6 print:hidden">
          <Card>
            {/* Taking money happens in Actions, on the right, where the
                outstanding figure is. Two forms for one act was two places to
                get the amount wrong. */}
            <CardHeader>
              <CardTitle className="text-base">{T("Payments")}</CardTitle>
            </CardHeader>
            {invoice.payments.length === 0 ? (
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  {T("Nothing recorded against this invoice yet.")}
                </p>
              </CardContent>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{T("Reference")}</TableHead>
                    <TableHead className="text-right">{T("Amount")}</TableHead>
                    <TableHead className="text-right">{T("Credited")}</TableHead>
                    <TableHead>{T("Method")}</TableHead>
                    <TableHead>{T("Status")}</TableHead>
                    <TableHead className="text-right" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoice.payments.map((payment) => (
                    <TableRow key={payment.id}>
                      <TableCell>
                        <span className="tnum block text-sm font-medium">
                          {payment.reference}
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          {payment.submittedByCustomer
                            ? "Submitted by the customer"
                            : `Recorded by ${payment.recordedBy?.name ?? "staff"}`}
                          {payment.transactionRef ? ` · ${payment.transactionRef}` : ""}
                        </span>
                        {payment.proofs.length > 0 ? (
                          <span className="mt-1 flex gap-2">
                            {payment.proofs.map((proof) => (
                              <a
                                key={proof.id}
                                href={proof.url}
                                target="_blank"
                                rel="noreferrer"
                                className="text-xs text-primary hover:underline"
                              >
                                {T("Proof")}
                              </a>
                            ))}
                          </span>
                        ) : null}
                      </TableCell>
                      <TableCell className="tnum text-right text-sm">
                        {formatMoney(payment.amount, payment.currency)}
                      </TableCell>
                      <TableCell className="tnum text-right text-sm text-muted-foreground">
                        {(() => {
                          const tzs = paymentTzs(payment, invoice);
                          return tzs ? (
                            <>
                              <span className="block text-foreground">{formatCurrency(tzs, "TZS")}</span>
                              <span className="block text-[11px]">
                                {formatRate(payment.fxRate ?? invoice.fxRate)}
                              </span>
                              {payment.overpaymentReason ? (
                                <span className="block text-[11px] text-destructive">
                                  Overpaid: {payment.overpaymentReason}
                                </span>
                              ) : null}
                            </>
                          ) : (
                            "—"
                          );
                        })()}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {payment.writtenOff ? "written off — no money moved" : payment.method.replace("_", " ").toLowerCase()}
                      </TableCell>
                      <TableCell>
                        <Badge
                          tone={
                            payment.status === "VERIFIED"
                              ? "good"
                              : payment.status === "PENDING"
                                ? "warn"
                                : "bad"
                          }
                        >
                          {PAYMENT_STATUS_LABELS[payment.status]}
                        </Badge>
                        {payment.rejectedReason ? (
                          <span className="block text-xs text-muted-foreground">
                            {payment.rejectedReason}
                          </span>
                        ) : null}
                        {payment.reversedReason ? (
                          <span className="block text-xs text-muted-foreground">
                            {payment.reversedReason}
                          </span>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-right">
                        {payment.writtenOff ? null : payment.status === "PENDING" &&
                        can(user.role, "payment.verify") ? (
                          <VerifyPaymentButtons paymentId={payment.id} />
                        ) : payment.status === "VERIFIED" &&
                          can(user.role, "payment.verify") ? (
                          <ReversePaymentForm paymentId={payment.id} />
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Card>

        {invoice.receipts.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{T("Receipts")}</CardTitle>
            </CardHeader>
            <CardContent className="divide-y p-0">
              {invoice.receipts.map((receipt) => (
                <Link
                  key={receipt.id}
                  href={`/app/finance/receipts/${receipt.id}`}
                  className="flex items-center justify-between px-6 py-3 text-sm hover:bg-secondary/40"
                >
                  <span className="tnum font-medium">{receipt.number}</span>
                  <span className="tnum">{formatMoney(receipt.amount, receipt.currency)}</span>
                </Link>
              ))}
            </CardContent>
          </Card>
        ) : null}
        {otherUnpaid > 0 ? (
          <Link
            href={`/app/finance/payments/new/${invoice.customerId}`}
            className="block rounded-xl border border-brand/40 bg-brand/5 p-4 text-sm hover:bg-brand/10"
          >
            <span className="font-medium">
              {invoice.customer.fullName} has {otherUnpaid} other unpaid consignment{otherUnpaid === 1 ? "" : "s"}
            </span>
            <span className="mt-0.5 block text-xs text-muted-foreground">{T("Paying for several at once? Take it as one payment.")}</span>
          </Link>
        ) : null}
      </div>
    </div>
  );
}
