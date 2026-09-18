import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { BadgeCheck, ShieldX } from "lucide-react";

import { formatCurrency } from "@/lib/currency";
import { formatDate } from "@/lib/format";
import { balanceOf } from "@/lib/invoice-balance";
import { readInvoiceVerifyToken } from "@/lib/invoice-verify";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = {
  title: "Verify an invoice",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

/* The customer as the public tracking page shows a shipper: initials only. */
const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => `${part[0]!.toUpperCase()}.`)
    .join(" ");

/**
 * WHERE AN INVOICE'S QR LANDS.
 *
 * Answers one question for whoever is holding the paper: did Swift Cargo issue
 * this, for how much, and is it paid. Nothing else — no accounts to pay into,
 * no customer's phone, no way to change anything.
 */
export default async function VerifyInvoicePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const id = readInvoiceVerifyToken(decodeURIComponent(token));
  const invoice = id
    ? await prisma.invoice.findUnique({
        where: { id },
        include: { payments: true, customer: { select: { fullName: true } }, cargo: { select: { reference: true } } },
      })
    : null;

  const genuine = Boolean(invoice && invoice.status !== "DRAFT");
  const balance = invoice ? balanceOf(invoice) : null;
  const status = !invoice
    ? null
    : invoice.status === "CANCELLED"
      ? { text: "Cancelled — this invoice no longer asks for payment", tone: "bg-neutral-100 text-neutral-700" }
      : balance?.settled
        ? { text: "Paid in full", tone: "bg-emerald-50 text-emerald-700" }
        : { text: "Not yet fully paid", tone: "bg-amber-50 text-amber-800" };

  return (
    <main className="grid min-h-dvh place-items-center bg-[#0b2742] px-5 py-10">
      <div className="w-full max-w-md overflow-hidden rounded-3xl bg-white shadow-2xl">
        <div className="flex items-center gap-3 bg-[#0b2742] px-6 py-5 text-white">
          <span className="grid size-12 place-items-center rounded-xl bg-white p-1">
            <Image src="/brand/swift-cargo.png" alt="" width={44} height={44} />
          </span>
          <div>
            <p className="text-lg font-extrabold uppercase tracking-[0.12em]">Swift Cargo</p>
            <p className="text-xs text-white/70">Invoice verification</p>
          </div>
        </div>
        <div className="p-6">
          {genuine && invoice && balance ? (
            <>
              <p className="flex items-center gap-2 text-lg font-bold text-emerald-700">
                <BadgeCheck className="size-6" />
                Genuine Swift Cargo invoice
              </p>
              <dl className="mt-5 divide-y rounded-2xl border text-sm">
                {[
                  ["Invoice", invoice.number],
                  ["Issued", formatDate(invoice.issuedAt ?? invoice.createdAt)],
                  ["Customer", initials(invoice.customer.fullName)],
                  ["Cargo", invoice.cargo.reference],
                  ["Total", `${formatCurrency(invoice.total, invoice.currency)}${invoice.totalTzs ? ` · ${formatCurrency(invoice.totalTzs, "TZS")}` : ""}`],
                ].map(([label, value]) => (
                  <div key={label} className="flex justify-between gap-4 px-4 py-2.5">
                    <dt className="text-neutral-500">{label}</dt>
                    <dd className="tnum text-right font-semibold">{value}</dd>
                  </div>
                ))}
              </dl>
              {status ? (
                <p className={`mt-4 rounded-xl px-4 py-3 text-sm font-semibold ${status.tone}`}>{status.text}</p>
              ) : null}
              <Link
                href={`/track/${invoice.cargo.reference}`}
                className="mt-5 inline-flex w-full items-center justify-center rounded-full bg-[#f4611f] px-5 py-3 text-sm font-semibold text-white"
              >
                Track this cargo
              </Link>
            </>
          ) : (
            <>
              <p className="flex items-center gap-2 text-lg font-bold text-red-700">
                <ShieldX className="size-6" />
                We cannot confirm this invoice
              </p>
              <p className="mt-3 text-sm text-neutral-600">
                This code was not issued by Swift Cargo, or the invoice is not final. Do not pay against it — call us to
                check.
              </p>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
