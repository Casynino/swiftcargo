import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { PrintButton } from "@/components/app/print-button";
import { formatDate } from "@/lib/format";
import { outstandingOf } from "@/lib/invoice-balance";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { SmartBack } from "@/components/app/smart-back";

/* The filename is the title, so the saved PDF is already named for the person. */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ customerId: string }>;
}): Promise<Metadata> {
  const { customerId } = await params;
  const c = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { fullName: true, businessName: true },
  });
  return {
    title: { absolute: `Combined bill - ${c?.businessName || c?.fullName || "Customer"}` },
  };
}

const n = (v: number, dp: number) =>
  v.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp });

/**
 * THE BILL FOR ALL OF IT, TO SEND BEFORE THEY PAY.
 *
 * Four consignments is four invoices, and sending four asks four questions when
 * the customer has one: how much do I send? This covering statement answers it
 * — every open bill, each at the rate frozen onto it, one total in each
 * currency. Nothing is merged: every consignment keeps its own invoice.
 */
export default async function CombinedBillPage({
  params,
}: {
  params: Promise<{ customerId: string }>;
}) {
  await requirePermission("finance.view");
  const { customerId } = await params;

  const [customer, company, banks] = await Promise.all([
    prisma.customer.findUnique({
      where: { id: customerId },
      include: {
        invoices: {
          where: { status: { in: ["ISSUED", "PARTIALLY_PAID", "OVERDUE"] } },
          orderBy: { issuedAt: "asc" },
          include: {
            payments: true,
            cargo: {
              select: {
                reference: true,
                description: true,
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
    prisma.companySetting.findUnique({ where: { id: "singleton" } }),
    prisma.bankAccount.findMany({
      where: { active: true, kind: { not: "CASH" } },
      orderBy: [{ sortOrder: "asc" }],
    }),
  ]);
  if (!customer) notFound();

  const lines = customer.invoices
    .map((i) => {
      const usd = Number(outstandingOf(i));
      const rate = Number(i.fxRate) > 1 ? Number(i.fxRate) : null;
      return { i, usd, rate, tzs: rate ? Math.ceil(usd * rate) : null };
    })
    .filter((l) => l.usd > 0.005);

  const totalUsd = lines.reduce((s, l) => s + l.usd, 0);
  const totalTzs = lines.reduce((s, l) => s + (l.tzs ?? 0), 0);
  const name = customer.businessName || customer.fullName;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center justify-between print:hidden">
        <SmartBack fallbackHref={`/app/finance/payments/new/${customer.id}`} fallbackLabel={`${name}`} />
        <PrintButton label="Download / print" />
      </div>

      <article className="rounded-lg border bg-white p-10 text-black print:border-0 print:p-0">
        <header className="flex items-start justify-between gap-6 border-b pb-6">
          <div className="flex items-center gap-3">
            <Image src="/brand/swift-cargo.png" alt="" width={56} height={56} className="object-contain" />
            <div>
              <p className="text-xl font-bold uppercase tracking-wider">
                {company?.name ?? "Swift Cargo"}
              </p>
              <p className="text-xs text-neutral-500">
                {company?.tagline ?? "On time, Every time"}
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-lg font-bold uppercase tracking-wider">Combined bill</p>
            <p className="text-xs text-neutral-500">{formatDate(new Date())}</p>
          </div>
        </header>

        <section className="mt-6">
          <p className="text-xs uppercase tracking-wider text-neutral-500">Bill to</p>
          <p className="text-lg font-semibold">{name}</p>
          {customer.phone ? <p className="text-sm text-neutral-600">{customer.phone}</p> : null}
        </section>

        <div className="relative overflow-x-auto print:overflow-visible">
          <table className="mt-6 w-full text-sm">
            <thead>
              <tr className="border-b-2 border-black text-left text-xs uppercase tracking-wider">
                <th className="py-2">Tracking</th>
                <th className="py-2">Goods</th>
                <th className="py-2">Container</th>
                <th className="py-2">Invoice</th>
                <th className="py-2 text-right">Rate</th>
                <th className="py-2 text-right">USD</th>
                <th className="py-2 text-right">TZS</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.i.id} className="border-b">
                  <td className="py-2 font-medium">{l.i.cargo.reference}</td>
                  <td className="py-2 text-neutral-600">{l.i.cargo.description}</td>
                  <td className="py-2 text-neutral-600">
                    {l.i.cargo.containerLines[0]?.container.reference ?? "—"}
                  </td>
                  <td className="py-2 text-neutral-600">{l.i.number}</td>
                  <td className="py-2 text-right text-neutral-600">
                    {l.rate ? n(l.rate, 0) : "—"}
                  </td>
                  <td className="py-2 text-right">{n(l.usd, 2)}</td>
                  <td className="py-2 text-right">{l.tzs !== null ? n(l.tzs, 0) : "—"}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="font-bold">
                <td className="pt-3" colSpan={5}>
                  Total for {lines.length} consignments
                </td>
                <td className="pt-3 text-right">USD {n(totalUsd, 2)}</td>
                <td className="pt-3 text-right">TZS {n(totalTzs, 0)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        <p className="mt-4 text-xs text-neutral-500">
          Each bill is at the exchange rate fixed on it when it was issued. Pay the
          total in one transfer; every consignment keeps its own invoice and pickup note.
        </p>

        {banks.length > 0 ? (
          <section className="mt-8">
            <p className="text-xs font-semibold uppercase tracking-wider">Pay into</p>
            <div className="mt-2 grid grid-cols-2 gap-3 text-sm">
              {banks.map((b) => (
                <div key={b.id} className="rounded border p-3">
                  <p className="font-semibold">
                    {b.bankName} ({b.currency})
                  </p>
                  <p className="text-neutral-600">{b.accountName}</p>
                  <p className="tabular-nums">{b.accountNumber}</p>
                </div>
              ))}
            </div>
          </section>
        ) : null}
      </article>
    </div>
  );
}
