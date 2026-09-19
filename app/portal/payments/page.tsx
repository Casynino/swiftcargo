import Link from "next/link";
import type { Metadata } from "next";
import type { PaymentMethod } from "@prisma/client";
import { HandCoins } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { PAYMENT_STATUS_LABELS } from "@/lib/constants";
import { formatDate, formatMoney } from "@/lib/format";
import { DEFAULT_LOCALE, t } from "@/lib/i18n";
import { prisma } from "@/lib/prisma";
import { requireCustomer } from "@/lib/session";

export const metadata: Metadata = { title: "Payment history" };

const METHOD: Record<PaymentMethod, string> = {
  CASH: "Cash",
  BANK_TRANSFER: "Bank transfer",
  MOBILE_MONEY: "Mobile money",
  CHEQUE: "Cheque",
  OTHER: "Other",
};

const TONE = {
  PENDING: "warn",
  VERIFIED: "good",
  REJECTED: "bad",
  REVERSED: "bad",
  CANCELLED: "neutral",
} as const;

/**
 * EVERY PAYMENT, AS ITS OWN ROW.
 *
 * A bill paid half in dollars and half in shillings is two payments, and it
 * stays two here: each in the currency it was paid in, on the day it was
 * paid. Adding them into one line would invent a transaction that never
 * happened. A payment still being checked is shown as exactly that.
 */
export default async function PaymentsPage() {
  const locale = DEFAULT_LOCALE;
  const user = await requireCustomer();

  const payments = await prisma.payment.findMany({
    where: { customerId: user.customerId, writtenOff: false },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      reference: true,
      amount: true,
      currency: true,
      method: true,
      transactionRef: true,
      status: true,
      paidAt: true,
      createdAt: true,
      rejectedReason: true,
      invoice: { select: { id: true, number: true } },
      receipts: { select: { number: true } },
    },
  });

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">{t(locale, "Payment history")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t(locale, "Every payment on your account, in the currency you paid it in.")}
        </p>
      </header>

      {payments.length === 0 ? (
        <Card className="p-8 text-center">
          <HandCoins className="mx-auto size-8 text-muted-foreground" />
          <p className="mt-3 font-semibold">{t(locale, "No payments yet")}</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
            {t(locale, "When you pay an invoice, the payment appears here — first as being checked, then as received.")}
          </p>
        </Card>
      ) : (
        <Card className="divide-y">
          {payments.map((p) => (
            <div key={p.id} className="grid gap-2 p-4 sm:grid-cols-[1fr_auto] sm:items-center">
              <div className="min-w-0">
                <p className="tnum text-lg font-bold">{formatMoney(p.amount, p.currency)}</p>
                <p className="text-xs text-muted-foreground">
                  {formatDate(p.paidAt ?? p.createdAt)} · {t(locale, METHOD[p.method])}
                  {p.transactionRef ? ` · ${t(locale, "ref")} ${p.transactionRef}` : ""}
                </p>
                <p className="mt-1 text-xs">
                  {t(locale, "For invoice")}{" "}
                  <Link href={`/portal/invoices/${p.invoice.id}`} className="tnum font-semibold text-brand hover:underline">
                    {p.invoice.number}
                  </Link>
                  {p.receipts[0] ? (
                    <span className="text-muted-foreground">
                      {" "}
                      · {t(locale, "receipt")} <span className="tnum">{p.receipts[0].number}</span>
                    </span>
                  ) : null}
                </p>
                {p.status === "REJECTED" && p.rejectedReason ? (
                  <p className="mt-1 text-xs text-destructive">{p.rejectedReason}</p>
                ) : null}
              </div>
              <div className="flex items-center gap-2 sm:flex-col sm:items-end">
                <Badge tone={TONE[p.status]}>{t(locale, PAYMENT_STATUS_LABELS[p.status])}</Badge>
                <span className="tnum text-[11px] text-muted-foreground">{p.reference}</span>
              </div>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
