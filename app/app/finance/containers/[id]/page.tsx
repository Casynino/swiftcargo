import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import type { PaymentMethod } from "@prisma/client";

import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { SectionLabel } from "@/components/app/section-label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CONTAINER_STATUS_LABELS } from "@/lib/constants";
import { formatDate, formatMoney } from "@/lib/format";
import { outstandingOf } from "@/lib/invoice-balance";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { cn } from "@/lib/utils";

import { primeLocale, T } from "@/lib/server-t";
import { Tx } from "@/components/app/tx";
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const c = await prisma.container.findUnique({
    where: { id },
    select: { reference: true },
  });
  return { title: c ? `Money on ${c.reference}` : "Container finances" };
}

const HOW: Record<PaymentMethod, string> = {
  CASH: "Cash",
  BANK_TRANSFER: "Bank transfer",
  MOBILE_MONEY: "Mobile money",
  CHEQUE: "Cheque",
  OTHER: "Other",
};

/**
 * WHAT ONE SAILING MADE — THE MONEY, AND ONLY THE MONEY.
 *
 * The container page answers "what is in the box and where is it". This one
 * answers the question Finance opens a sailing with: what came in, what went
 * out, and who still owes. Five totals first, because whoever opens it already
 * has a number in their head and it should be the first thing they can check;
 * then the three lists those totals are made of.
 *
 * Shillings lead and dollars sit beneath, each converted at the rate pinned on
 * the bill, payment or cost it came from — never today's. A sailing that
 * landed in August is not worth more because the shilling moved in September.
 */
export default async function ContainerFinancePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await primeLocale();
  await requirePermission("finance.view");
  const { id } = await params;

  const [container, rate] = await Promise.all([
    prisma.container.findFirst({
      where: { id, deletedAt: null },
      include: {
        shipment: {
          select: { vessel: true, departureDate: true, originPort: true },
        },
        expenses: {
          where: { deletedAt: null, cancelledAt: null },
          orderBy: { createdAt: "desc" },
          include: {
            expenseType: { select: { name: true } },
            recordedBy: { select: { name: true } },
            account: { select: { bankName: true, currency: true } },
          },
        },
        cargoLines: {
          include: {
            cargo: {
              select: {
                id: true,
                reference: true,
                receiver: { select: { fullName: true } },
                invoices: {
                  where: { status: { notIn: ["CANCELLED", "DRAFT"] } },
                  include: {
                    payments: {
                      include: {
                        account: { select: { bankName: true, currency: true } },
                        receipts: { select: { number: true }, take: 1 },
                      },
                      orderBy: { paidAt: "desc" },
                    },
                  },
                },
              },
            },
          },
        },
      },
    }),
    prisma.exchangeRate.findFirst({
      where: { active: true },
      orderBy: { effectiveFrom: "desc" },
      select: { rate: true },
    }),
  ]);
  if (!container) notFound();

  const today = rate ? Number(rate.rate) : 0;

  const invoices = container.cargoLines.flatMap((line) =>
    line.cargo.invoices.map((invoice) => ({ invoice, cargo: line.cargo }))
  );

  /* Each bill, payment or cost at its own pinned rate, falling back to today's
     when none was pinned. A dollar cost is stored with a rate of 1 — "no
     conversion happened" — and no shilling rate is anywhere near 1, so anything
     at or below it is read as absent rather than turning $2,400 into TZS 2,400. */
  const rateOf = (fx: unknown) => (Number(fx) > 1 ? Number(fx) : today);

  const revenueUsd = invoices.reduce((s, r) => s + Number(r.invoice.total), 0);
  const revenueTzs = invoices.reduce(
    (s, r) => s + Number(r.invoice.total) * rateOf(r.invoice.fxRate),
    0
  );
  const owed = invoices.map((r) => ({
    ...r,
    usd: Number(outstandingOf(r.invoice)),
  }));
  const outstandingUsd = owed.reduce((s, r) => s + r.usd, 0);
  const outstandingTzs = owed.reduce(
    (s, r) => s + r.usd * rateOf(r.invoice.fxRate),
    0
  );
  const collectedUsd = revenueUsd - outstandingUsd;
  const collectedTzs = revenueTzs - outstandingTzs;

  const costUsd = container.expenses.reduce(
    (s, e) =>
      s +
      (e.currency === "USD"
        ? Number(e.amount)
        : Number(e.amount) / rateOf(e.fxRate)),
    0
  );
  const costTzs = container.expenses.reduce(
    (s, e) =>
      s +
      (e.currency === "TZS"
        ? Number(e.amount)
        : Number(e.amount) * rateOf(e.fxRate)),
    0
  );

  const profitUsd = revenueUsd - costUsd;
  const profitTzs = revenueTzs - costTzs;

  const totals = [
    { label: "Revenue", tzs: revenueTzs, usd: revenueUsd, tone: "" },
    { label: "Collected", tzs: collectedTzs, usd: collectedUsd, tone: "text-success" },
    { label: "Outstanding", tzs: outstandingTzs, usd: outstandingUsd, tone: "text-warning" },
    { label: "Costs", tzs: costTzs, usd: costUsd, tone: "text-destructive" },
    {
      label: "Profit / loss",
      tzs: profitTzs,
      usd: profitUsd,
      tone: profitUsd >= 0 ? "text-success" : "text-destructive",
    },
  ];

  /* Verified money only. A payment somebody says they sent is a claim, and a
     sailing's "money in" that counts claims reads richer than the bank. */
  const moneyIn = invoices
    .flatMap(({ invoice, cargo }) =>
      invoice.payments
        .filter((p) => p.status === "VERIFIED")
        .map((p) => ({ p, cargo }))
    )
    .sort(
      (a, b) =>
        (b.p.paidAt ?? b.p.createdAt).getTime() -
        (a.p.paidAt ?? a.p.createdAt).getTime()
    );

  const stillOwed = owed
    .filter((r) => r.usd > 0.005)
    .sort((a, b) => b.usd - a.usd);

  return (
    <div className="space-y-6">
      <PageHeader
        title={container.reference}
        description={[
          container.shipment?.originPort ?? T("Guangzhou"),
          `${container.cargoLines.length} consignments`,
          container.shipment?.vessel,
          container.shipment?.departureDate
            ? `left ${formatDate(container.shipment.departureDate)}`
            : null,
        ]
          .filter(Boolean)
          .join(" · ")}
        back={{ href: "/app/finance/containers", label: "Every container" }}
        actions={
          <>
            <Badge tone={container.status === "CLOSED" ? "neutral" : "good"}>
              {CONTAINER_STATUS_LABELS[container.status]}
            </Badge>
            <Button asChild size="sm" variant="outline">
              <Link href={`/app/containers/${container.id}`}>{T("Open container")}</Link>
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {totals.map((card) => {
          const lead = formatMoney(card.tzs, "TZS");
          return (
            <div
              key={card.label}
              className="rounded-xl border bg-card p-4 shadow-soft"
            >
              <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                <Tx>{card.label}</Tx>
              </p>
              {/* Shilling totals run to tens of millions. At one fixed size the
                  figure broke after "TZS" and the card lost its shape, so the
                  type gives way to the number. */}
              <p
                className={cn(
                  "tnum mt-1 whitespace-nowrap font-semibold",
                  lead.length > 15
                    ? "text-base"
                    : lead.length > 12
                      ? "text-lg"
                      : "text-xl",
                  card.tone
                )}
              >
                {lead}
              </p>
              <p className="tnum text-[11px] text-muted-foreground">
                {formatMoney(card.usd, "USD")}
              </p>
            </div>
          );
        })}
      </div>

      <section className="space-y-3">
        <SectionLabel count={moneyIn.length}>{T("Money in")}</SectionLabel>
        {moneyIn.length === 0 ? (
          <div className="rounded-xl border bg-card">
            <EmptyState
              icon="Banknote"
              title={T("Nothing collected on this container yet")}
              description={T("Payments appear here the moment they are verified against any consignment on it.")}
            />
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{T("When")}</TableHead>
                  <TableHead>{T("Customer")}</TableHead>
                  <TableHead>{T("Cargo")}</TableHead>
                  <TableHead>{T("How")}</TableHead>
                  <TableHead>{T("Landed in")}</TableHead>
                  <TableHead className="text-right">{T("Amount")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {moneyIn.map(({ p, cargo }) => {
                  const delivery = Number(p.deliveryAdded ?? 0);
                  return (
                    <TableRow key={p.id}>
                      <TableCell className="tnum whitespace-nowrap text-xs text-muted-foreground">
                        {formatDate(p.paidAt ?? p.createdAt)}
                      </TableCell>
                      <TableCell className="text-sm">
                        {cargo.receiver.fullName}
                      </TableCell>
                      <TableCell className="tnum text-xs">
                        <Link
                          href={`/app/cargo/${cargo.id}`}
                          className="hover:underline"
                        >
                          {cargo.reference}
                        </Link>
                      </TableCell>
                      <TableCell className="text-xs">
                        {HOW[p.method]}
                        {p.transactionRef ? (
                          <span className="tnum block text-[11px] text-muted-foreground">
                            {p.transactionRef}
                          </span>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {p.account
                          ? `${p.account.bankName} (${p.account.currency})`
                          : "Nobody said"}
                        {p.receipts[0] ? (
                          <span className="tnum block text-[11px]">
                            {p.receipts[0].number}
                          </span>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-right">
                        <span className="tnum font-semibold">
                          {formatMoney(p.amount, p.currency)}
                        </span>
                        {/* Said where it is: a transfer that carried the
                            driver's fare is larger than the bill it settled and
                            otherwise reads as an overpayment. */}
                        {delivery > 0.005 ? (
                          <span className="block text-[11px] text-muted-foreground">
                            includes {formatMoney(delivery, p.currency)} delivery
                          </span>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <SectionLabel count={container.expenses.length}>{T("Money out")}</SectionLabel>
        {container.expenses.length === 0 ? (
          <div className="rounded-xl border bg-card">
            <EmptyState
              icon="Receipt"
              title={T("No costs booked to this container")}
              description={T("Ocean freight, clearing, port charges and transport appear here once Finance records them against it.")}
            />
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{T("When")}</TableHead>
                  <TableHead>{T("What")}</TableHead>
                  <TableHead>{T("Paid from")}</TableHead>
                  <TableHead>{T("Recorded by")}</TableHead>
                  <TableHead className="text-right">{T("Amount")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {container.expenses.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="tnum whitespace-nowrap text-xs text-muted-foreground">
                      {formatDate(e.expenseDate ?? e.paidDate ?? e.createdAt)}
                    </TableCell>
                    <TableCell className="text-sm">
                      {e.expenseType?.name ?? "Cost"}
                      <span className="tnum block text-[11px] text-muted-foreground">
                        {e.reference}
                        {e.description ? ` · $<Tx>{e.description}</Tx>` : ""}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {e.account
                        ? `${e.account.bankName} (${e.account.currency})`
                        : "Not paid yet"}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {e.recordedBy?.name ?? "—"}
                    </TableCell>
                    <TableCell className="tnum text-right font-semibold text-destructive">
                      {formatMoney(e.amount, e.currency)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <SectionLabel count={stillOwed.length}>
          {T("Still owed on this container")}
        </SectionLabel>
        {stillOwed.length === 0 ? (
          <div className="rounded-xl border bg-card">
            <EmptyState
              icon="CheckCircle2"
              title={T("Every bill on this container is settled")}
              description={T("Nothing on it is waiting for a customer to pay.")}
            />
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{T("Cargo")}</TableHead>
                  <TableHead>{T("Customer")}</TableHead>
                  <TableHead>{T("Bill")}</TableHead>
                  <TableHead className="text-right">{T("Outstanding")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stillOwed.map(({ invoice, cargo, usd }) => (
                  <TableRow key={invoice.id}>
                    <TableCell className="tnum text-xs">
                      <Link
                        href={`/app/cargo/${cargo.id}`}
                        className="hover:underline"
                      >
                        {cargo.reference}
                      </Link>
                    </TableCell>
                    <TableCell className="text-sm">
                      {cargo.receiver.fullName}
                    </TableCell>
                    <TableCell className="tnum text-xs text-muted-foreground">
                      <Link
                        href={`/app/finance/invoices/${invoice.id}`}
                        className="hover:underline"
                      >
                        {invoice.number}
                      </Link>
                    </TableCell>
                    <TableCell className="text-right">
                      {/* At the rate frozen onto the bill — the figure the
                          customer was quoted, not today's. */}
                      <span className="tnum font-semibold text-warning">
                        {formatMoney(usd * rateOf(invoice.fxRate), "TZS")}
                      </span>
                      <span className="tnum block text-[11px] text-muted-foreground">
                        {formatMoney(usd, "USD")}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
    </div>
  );
}
