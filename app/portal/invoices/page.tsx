import Link from "next/link";
import type { Metadata } from "next";

import { EmptyState } from "@/components/app/empty-state";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { INVOICE_STATUS_LABELS } from "@/lib/constants";
import { formatDate, formatMoney } from "@/lib/format";
import { formatCurrency, formatRate } from "@/lib/currency";
import { balanceOf, outstandingOf, owedAcross, paidOn } from "@/lib/invoice-balance";
import { prisma } from "@/lib/prisma";
import { requireCustomer } from "@/lib/session";

export const metadata: Metadata = { title: "Invoices" };

export default async function PortalInvoicesPage() {
  const user = await requireCustomer();

  const invoices = await prisma.invoice.findMany({
    where: { customerId: user.customerId, status: { not: "DRAFT" } },
    orderBy: { createdAt: "desc" },
    include: {
      cargo: { select: { reference: true, description: true } },
      payments: true,
      receipts: true,
    },
  });

  /* A cancelled bill stays in the list, marked, so the customer can see what
     happened to it — and counts for nothing in what they owe. */
  const total = owedAcross(invoices.filter((invoice) => invoice.status !== "CANCELLED"));

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Invoices</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            What you owe, what you have paid, and your receipts.
          </p>
        </div>
        <Card className="px-5 py-3">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Total outstanding
          </p>
          <p className="tnum mt-0.5 text-xl font-semibold">
            {total.primary}
          </p>
          {total.equivalent ? (
            <p className="tnum text-xs text-muted-foreground">{total.equivalent}</p>
          ) : null}
        </Card>
      </header>

      {invoices.length === 0 ? (
        <Card>
          <EmptyState
            icon="FileText"
            title="No invoices yet"
            description="We invoice once your cargo has landed in Dar es Salaam."
          />
        </Card>
      ) : (
        <ul className="grid gap-4">
          {invoices.map((invoice) => {
            const balance = balanceOf(invoice);
            const cancelled = invoice.status === "CANCELLED";
            const settled = balance.settled || cancelled;
            const tzs = balance.outstandingTzs !== null;
            return (
              <li key={invoice.id}>
                <Link
                  href={`/portal/invoices/${invoice.id}`}
                  className="focus-ring block rounded-xl"
                >
                  <Card className="p-5 transition-all hover:-translate-y-0.5 hover:shadow-raised">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="tnum font-semibold">{invoice.number}</p>
                        <p className="mt-0.5 text-sm text-muted-foreground">
                          {invoice.cargo.reference} · {invoice.cargo.description}
                        </p>
                      </div>
                      <Badge tone={cancelled ? "neutral" : settled ? "good" : invoice.status === "OVERDUE" ? "bad" : "warn"}>
                        {INVOICE_STATUS_LABELS[invoice.status]}
                      </Badge>
                    </div>

                    <dl className="mt-4 grid grid-cols-2 gap-4 border-t pt-4 text-sm sm:grid-cols-4">
                      {[
                        ["Total", tzs ? formatCurrency(balance.totalTzs, "TZS") : formatMoney(invoice.total, invoice.currency)],
                        ["Paid", tzs ? formatCurrency(balance.paidTzs, "TZS") : formatMoney(balance.paid, invoice.currency)],
                        ["Amount due", cancelled ? "—" : tzs ? formatCurrency(balance.outstandingTzs, "TZS") : formatMoney(balance.outstanding, invoice.currency)],
                        ["Due", formatDate(invoice.dueAt)],
                      ].map(([label, value]) => (
                        <div key={label}>
                          <dt className="text-xs text-muted-foreground">{label}</dt>
                          <dd className="tnum mt-0.5 font-medium">{value}</dd>
                        </div>
                      ))}
                    </dl>

                    {tzs && !cancelled ? (
                      <p className="tnum mt-3 text-xs text-muted-foreground">
                        {formatCurrency(balance.outstanding, "USD")} due of{" "}
                        {formatCurrency(invoice.total, "USD")} · {formatRate(balance.rate)}, the rate on your invoice
                      </p>
                    ) : null}
                  </Card>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
