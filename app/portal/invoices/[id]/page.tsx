import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ChevronLeft, Download } from "lucide-react";

import { PayForm } from "@/components/portal/pay-form";
import { PrintButton } from "@/components/app/print-button";
import { ShareLink } from "@/components/portal/share-link";
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
import { formatCbm, formatDate, formatMoney } from "@/lib/format";
import { formatCurrency, formatRate } from "@/lib/currency";
import { balanceOf, outstandingOf, paidOn } from "@/lib/invoice-balance";
import { prisma } from "@/lib/prisma";
import { requireCustomer } from "@/lib/session";

import { billLines } from "@/lib/invoice-lines";
import { vatLines } from "@/lib/invoice-vat";
export const metadata: Metadata = { title: "Invoice" };

export default async function PortalInvoicePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireCustomer();
  const { id } = await params;

  /* Scoped by the session's own customer. An id from the URL can only ever find
     an invoice that belongs to them — the number is checked, not trusted. */
  const invoice = await prisma.invoice.findFirst({
    where: { id, customerId: user.customerId, status: { not: "DRAFT" } },
    include: {
      cargo: { select: { reference: true, description: true } },
      items: true,
      payments: { orderBy: { createdAt: "desc" } },
      receipts: true,
    },
  });
  if (!invoice) notFound();

  const balance = balanceOf(invoice);
  const vat = vatLines(invoice);
  const owing = balance.outstanding;
  const tzs = balance.outstandingTzs !== null;
  const cancelled = invoice.status === "CANCELLED";
  const settled = owing.lessThanOrEqualTo(0);
  const pending = invoice.payments.filter((p) => p.status === "PENDING");

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link
        href="/portal/invoices"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" />
        Invoices
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="tnum text-2xl font-semibold tracking-tight">
            {invoice.number}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {invoice.cargo.reference} · {invoice.cargo.description}
          </p>
        </div>
        <Badge tone={settled ? "good" : invoice.status === "OVERDUE" ? "bad" : "warn"}>
          {INVOICE_STATUS_LABELS[invoice.status]}
        </Badge>
      </div>

      <div className="flex flex-wrap gap-2 print:hidden">
        <Button asChild size="sm">
          <a href={`/portal/invoices/${invoice.id}/pdf`}>
            <Download />
            Download PDF
          </a>
        </Button>
        <PrintButton label="Print" />
        <ShareLink title={`Invoice ${invoice.number}`} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">What you are being charged</CardTitle>
        </CardHeader>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Description</TableHead>
              <TableHead className="text-right">Quantity</TableHead>
              <TableHead className="text-right">Rate</TableHead>
              <TableHead className="text-right">Amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {billLines(invoice).map((item) => (
              <TableRow key={item.id}>
                <TableCell className="text-sm">{item.description}</TableCell>
                <TableCell className="tnum text-right text-sm">
                  {Number(item.quantity).toFixed(3)} {item.unit ?? ""}
                </TableCell>
                <TableCell className="tnum text-right text-sm">
                  {formatMoney(item.unitPrice, invoice.currency)}
                </TableCell>
                <TableCell className="tnum text-right text-sm">
                  {formatMoney(item.amount, invoice.currency)}
                </TableCell>
              </TableRow>
            ))}
            <TableRow>
              <TableCell colSpan={3} className="text-right text-sm">
                {vat.baseLabel}
              </TableCell>
              <TableCell className="tnum text-right text-sm">
                {formatMoney(vat.base, invoice.currency)}
              </TableCell>
            </TableRow>
            <TableRow>
              <TableCell colSpan={3} className="text-right text-sm">
                {vat.vatLabel}
              </TableCell>
              <TableCell className="tnum text-right text-sm">
                {formatMoney(vat.vat, invoice.currency)}
              </TableCell>
            </TableRow>
            <TableRow className="bg-secondary/40">
              <TableCell colSpan={3} className="text-right font-semibold">
                Total
              </TableCell>
              <TableCell className="tnum text-right font-semibold">
                {formatMoney(invoice.total, invoice.currency)}
              </TableCell>
            </TableRow>
            {invoice.totalTzs ? (
              <TableRow>
                <TableCell colSpan={3} className="text-right text-sm text-muted-foreground">
                  Total in shillings · {formatRate(invoice.fxRate)}
                </TableCell>
                <TableCell className="tnum text-right text-sm font-semibold">
                  {formatCurrency(balance.totalTzs ?? invoice.totalTzs, "TZS")}
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
        {vat.note ? (
          <p className="border-t px-4 py-3 text-xs text-muted-foreground">
            {vat.noteSw} {vat.note}
          </p>
        ) : null}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {cancelled
              ? "This invoice was cancelled"
              : settled
              ? "Settled in full"
              : `Amount due: ${tzs ? formatCurrency(balance.outstandingTzs, "TZS") : formatMoney(owing, invoice.currency)}`}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {tzs ? (
            <dl className="tnum grid max-w-md grid-cols-2 gap-x-4 gap-y-1 text-sm">
              <dt className="text-muted-foreground">USD equivalent</dt>
              <dd className="text-right">{formatCurrency(owing, "USD")}</dd>
              <dt className="text-muted-foreground">Exchange rate</dt>
              <dd className="text-right">{formatRate(balance.rate)}</dd>
              <dt className="text-muted-foreground">Invoice total</dt>
              <dd className="text-right">{formatCurrency(balance.totalTzs, "TZS")} · {formatCurrency(invoice.total, "USD")}</dd>
              <dt className="text-muted-foreground">Paid</dt>
              <dd className="text-right">{formatCurrency(balance.paidTzs, "TZS")}</dd>
              {balance.creditTzs?.greaterThan(0) ? (
                <>
                  <dt className="text-muted-foreground">In credit</dt>
                  <dd className="text-right">{formatCurrency(balance.creditTzs, "TZS")}</dd>
                </>
              ) : null}
            </dl>
          ) : (
            <p className="text-sm text-muted-foreground">
              {formatMoney(balance.paid, invoice.currency)} received of{" "}
              {formatMoney(invoice.total, invoice.currency)}.
            </p>
          )}

          {pending.length > 0 ? (
            <p className="rounded-md bg-warning/10 px-3 py-2 text-sm text-warning">
              You have told us about {pending.length} payment
              {pending.length === 1 ? "" : "s"} we have not confirmed yet. We
              check every one against our bank before it counts.
            </p>
          ) : null}

          {!settled && !cancelled ? (
            <PayForm
              invoiceId={invoice.id}
              outstanding={tzs ? balance.outstandingTzs!.toString() : owing.toString()}
              currency="TZS"
            />
          ) : null}
        </CardContent>
      </Card>

      {invoice.payments.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Your payments</CardTitle>
          </CardHeader>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Reference</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>When</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoice.payments.map((payment) => (
                <TableRow key={payment.id}>
                  <TableCell className="tnum text-sm">
                    {payment.reference}
                    {payment.writtenOff ? (
                      <span className="block text-xs text-muted-foreground">
                        Small difference cleared by Swift Cargo
                      </span>
                    ) : null}
                    {payment.transactionRef ? (
                      <span className="block text-xs text-muted-foreground">
                        {payment.transactionRef}
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell className="tnum text-right text-sm">
                    {formatMoney(payment.amount, payment.currency)}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatDate(payment.paidAt)}
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
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      ) : null}

      {invoice.receipts.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Receipts</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {invoice.receipts.map((receipt) => (
              <div
                key={receipt.id}
                className="flex items-center justify-between rounded-md border p-3 text-sm"
              >
                <div>
                  <p className="tnum font-medium">{receipt.number}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatDate(receipt.issuedAt)}
                  </p>
                </div>
                <span className="tnum font-medium">
                  {formatMoney(receipt.amount, receipt.currency)}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
