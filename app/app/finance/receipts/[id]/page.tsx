import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { PrintButton } from "@/components/app/print-button";
import { formatDateTime, formatMoney } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { SmartBack } from "@/components/app/smart-back";

export const metadata: Metadata = { title: "Receipt" };

export default async function ReceiptPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePermission("finance.view");
  const { id } = await params;

  const receipt = await prisma.receipt.findUnique({
    where: { id },
    include: {
      customer: true,
      invoice: { include: { cargo: { select: { reference: true } } } },
      payment: true,
      issuedBy: { select: { name: true } },
    },
  });
  if (!receipt) notFound();

  const company = await prisma.companySetting.findUnique({
    where: { id: "singleton" },
  });

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center justify-between print:hidden">
        <SmartBack fallbackHref={`/app/finance/invoices/${receipt.invoiceId}`} fallbackLabel={`${receipt.invoice.number}`} />
        <PrintButton label="Print receipt" />
      </div>

      <article className="rounded-lg border bg-white p-8 text-black print:border-0 print:p-0">
        <header className="flex items-start justify-between gap-6 border-b pb-6">
          <div className="flex items-center gap-3">
            <Image
              src="/brand/swift-cargo.png"
              alt=""
              width={56}
              height={56}
              className="object-contain"
            />
            <div>
              <p className="text-lg font-bold uppercase tracking-wider text-navy-700">
                {company?.name ?? "Swift Cargo"}
              </p>
              {company?.vrn ? (
                <p className="tnum text-xs text-neutral-500">VRN {company.vrn}</p>
              ) : null}
            </div>
          </div>
          <div className="text-right">
            <p className="text-sm font-semibold uppercase tracking-wide">
              Official Receipt
            </p>
            <p className="tnum text-lg font-bold">{receipt.number}</p>
            <p className="text-xs text-neutral-500">
              {formatDateTime(receipt.issuedAt)}
            </p>
          </div>
        </header>

        <section className="border-b py-6">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-neutral-500">
            Received with thanks from
          </p>
          <p className="mt-1 text-lg font-medium">{receipt.customer.fullName}</p>
          <p className="tnum text-sm text-neutral-600">
            {receipt.customer.phone} · {receipt.customer.code}
          </p>
        </section>

        <section className="grid grid-cols-1 gap-x-6 gap-y-4 border-b py-6 text-sm sm:grid-cols-2">
          {[
            ["Amount received", formatMoney(receipt.amount, receipt.currency)],
            ["Against invoice", receipt.invoice.number],
            ["Cargo", receipt.invoice.cargo.reference],
            ["Method", receipt.payment.method.replace("_", " ").toLowerCase()],
            ["Transaction reference", receipt.payment.transactionRef ?? "—"],
            [
              "Paid in",
              `${receipt.payment.currency} ${receipt.payment.amount}`,
            ],
          ].map(([label, value]) => (
            <div key={label}>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-neutral-500">
                {label}
              </p>
              <p className="tnum mt-0.5 font-medium">{value}</p>
            </div>
          ))}
        </section>

        <section className="flex items-baseline justify-between py-6">
          <p className="text-sm font-semibold uppercase tracking-wide">
            Balance remaining
          </p>
          <p className="tnum text-2xl font-bold">
            {formatMoney(receipt.balanceAfter, receipt.currency)}
          </p>
        </section>

        <footer className="border-t pt-6 text-xs text-neutral-600">
          <p>
            Issued by {receipt.issuedBy?.name ?? "Swift Cargo"}. This receipt
            confirms funds received and verified against our account.
          </p>
          {company?.darAddress ? (
            <p className="mt-2">{company.darAddress}</p>
          ) : null}
          {company?.phone ? (
            <p className="tnum">
              {company.phone}
              {company.altPhone ? ` · ${company.altPhone}` : ""}
            </p>
          ) : null}
        </footer>
      </article>
    </div>
  );
}
