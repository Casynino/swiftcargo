import Link from "next/link";

import { PriceList } from "@/components/app/price-list";
import {
  ContainerExpenses,
  type ContainerExpenseRow,
} from "@/components/app/container-expenses";
import {
  ContainerCargoTabs,
  type CargoRow,
  type DocumentRow,
  type TimelineRow,
} from "@/components/app/container-cargo-tabs";
import { WhatsAppButton } from "@/components/app/whatsapp-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCbm, formatDate, formatMoney } from "@/lib/format";
import { composeMessage, whatsappNumber } from "@/lib/messages";
import { outstandingOf } from "@/lib/invoice-balance";
import { prisma } from "@/lib/prisma";
import type { Role } from "@prisma/client";

import { correctionOptions, toCorrectable, correctableInclude } from "@/lib/expense-correction";
import { priceListForContainer } from "@/lib/price-list";
import { cargoTypeOptions } from "@/lib/valuation";
import { can } from "@/lib/rbac";
import { localeOf } from "@/lib/viewer-locale";
import { cn } from "@/lib/utils";

/**
 * ONE CONTAINER, AS FINANCE READS IT.
 *
 * Lives on the container page rather than on a money page of its own. There is
 * one box, so there is one screen for it: the floor reads the contents at the
 * top and Finance reads the money here, and neither has to hunt for the other's
 * half. A second page showing the same sailing a second way is a second place
 * to read a different number from.
 *
 * Dar has counted the box off and signed every line; this is where the office
 * turns that into money. Each consignment shows what was actually received, the
 * rate its goods are charged at and what that comes to — worked out from the
 * record, never typed — and one press confirms the lot and sends the bills.
 *
 * The caller is responsible for the permission check. Nothing in here renders
 * for a warehouse desk, because the warehouse never sees a price.
 */
export async function ContainerMoney({
  id,
  user,
}: {
  id: string;
  user: { id: string; role: Role };
}) {
  const [container, expenseTypes, accounts, rate] = await Promise.all([
    prisma.container.findFirst({
    where: { id, deletedAt: null },
    include: {
      shipment: { include: { documents: true } },
      packingList: true,
      events: {
        orderBy: { createdAt: "asc" },
        include: { actor: { select: { name: true } } },
      },
      expenses: {
        where: { deletedAt: null },
        orderBy: { createdAt: "desc" },
        include: correctableInclude,
      },
      cargoLines: {
        include: {
          cargo: {
            include: {
              receiver: { select: { id: true, fullName: true, phone: true } },
              darReceiving: true,
              chinaReceiving: true,
              pickupNote: true,
              packages: {
                where: { deletedAt: null },
                select: { cargoType: true },
              },
              photos: {
                select: { url: true },
                orderBy: { takenAt: "asc" },
                take: 1,
              },
              invoices: {
                where: { status: { not: "CANCELLED" } },
                include: { payments: true },
                orderBy: { createdAt: "desc" },
              },
            },
          },
        },
      },
    },
    }),
    prisma.expenseType.findMany({
      where: { active: true, name: { not: "Salaries" } },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.bankAccount.findMany({
      where: { active: true },
      orderBy: { sortOrder: "asc" },
      select: { id: true, bankName: true, currency: true },
    }),
    prisma.exchangeRate.findFirst({
      where: { active: true },
      orderBy: { effectiveFrom: "desc" },
      select: { rate: true },
    }),
  ]);
  if (!container) return null;

  const rows = container.cargoLines.map((line) => {
    const cargo = line.cargo;
    const live = cargo.invoices.filter((i) => i.status !== "DRAFT");
    const draft = cargo.invoices.find((i) => i.status === "DRAFT");
    const owing = live.reduce((sum, i) => sum + Number(outstandingOf(i)), 0);
    const billed = live.reduce((sum, i) => sum + Number(i.total), 0);
    return {
      cargo,
      draft,
      live,
      billed,
      owing,
      settled: live.length > 0 && owing <= 0,
      currency: live[0]?.currency ?? draft?.currency ?? "USD",
    };
  });

  const toConfirm = rows.filter((r) => r.live.length === 0).length;
  const owedTotal = rows.reduce((sum, r) => sum + r.owing, 0);
  const settledCount = rows.filter((r) => r.settled).length;
  const customers = new Set(rows.map((r) => r.cargo.receiver.id)).size;
  const currency = "USD";

  /**
   * EXPECTED, NOT EARNED.
   *
   * Cargo nobody has confirmed a price for still has a draft priced from the
   * published rate book, and that draft counts towards what this sailing is
   * expected to be worth. It is not revenue — nobody has been asked for it —
   * so the figure is named "expected" and moves until Finance confirms it.
   *
   * Collected and Expenses are the two figures here that are money which has
   * actually moved. Everything else is arithmetic about the future.
   */
  const expectedRevenue = rows.reduce(
    (sum, r) =>
      sum + (r.live.length > 0 ? r.billed : Number(r.draft?.total ?? 0)),
    0
  );
  const collected = rows.reduce((sum, r) => sum + (r.billed - r.owing), 0);
  const expectedOutstanding = expectedRevenue - collected;

  const liveExpenses = container.expenses.filter(
    (e) => e.cancelledAt === null
  );
  /* In USD at the rate pinned on each cost — adding shillings to dollars is
     how a sailing reads a thousand times what it spent. */
  const usdOf = (e: (typeof liveExpenses)[number]) =>
    e.currency === "USD"
      ? Number(e.amount)
      : Number(e.fxRate) > 1
        ? Number(e.amount) / Number(e.fxRate)
        : 0;
  const spent = liveExpenses.reduce((sum, e) => sum + usdOf(e), 0);

  const expectedProfit = expectedRevenue - spent;
  const expectedMargin =
    expectedRevenue > 0 ? (expectedProfit / expectedRevenue) * 100 : 0;

  const fx = rate ? Number(rate.rate) : 0;
  const tzs = (usd: number) =>
    fx > 0 ? formatMoney(usd * fx, "TZS") : null;

  const invoiced = rows.filter((r) => r.live.length > 0).length;
  const noBillAtAll = rows.filter(
    (r) => r.live.length === 0 && !r.draft
  ).length;

  /* A usual cost with nothing against this container. A landed box with no
     clearing charge is not a cheap box — it is an incomplete record, and its
     margin is a lie until the rest is entered. */
  const recordedTypes = new Set(
    liveExpenses.map((e) => e.expenseType?.name).filter(Boolean)
  );
  const missingCosts = expenseTypes
    .map((t) => t.name)
    .filter((name) => !recordedTypes.has(name));

  const mayRecordCost = can(user.role, "expense.record");
  const mayConfirm = can(user.role, "invoice.priceConfirm");
  const [locale, correction, priceList, cargoTypes] = await Promise.all([
    localeOf(user.id),
    mayRecordCost
      ? correctionOptions()
      : Promise.resolve({ accounts: [], categories: [] } as Awaited<
          ReturnType<typeof correctionOptions>
        >),
    priceListForContainer(container.id),
    mayConfirm ? cargoTypeOptions() : Promise.resolve([] as string[]),
  ]);
  const expenseRows: ContainerExpenseRow[] = container.expenses.map((e) => ({
    id: e.id,
    reference: e.reference,
    name: e.expenseType?.name ?? e.description ?? "Cost",
    account: e.account
      ? `${e.account.bankName} (${e.account.currency})`
      : e.vendor
        ? `paid to ${e.vendor.name}`
        : null,
    amountLabel: formatMoney(e.amount, e.currency),
    share: spent > 0 && e.cancelledAt === null ? (usdOf(e) / spent) * 100 : 0,
    cancelled: e.cancelledAt !== null,
    cancelledReason: e.cancelledReason,
    correction: mayRecordCost && e.cancelledAt === null ? toCorrectable(e) : null,
  }));

  const cargoRows: CargoRow[] = rows.map((r) => {
    const c = r.cargo;
    const measured = c.darReceiving ?? c.chinaReceiving;
    const types = [
      ...new Set(
        c.packages.map((p) => p.cargoType).filter((t): t is string => Boolean(t))
      ),
    ];
    const receivedAt =
      c.darReceiving?.receivedAt ?? c.chinaReceiving?.receivedAt ?? c.createdAt;

    /* One reading per row, in the order the desk cares about it: collected
       beats a note out, a note beats paid, paid beats owed, and a line nobody
       has priced is none of those. */
    const state: CargoRow["state"] =
      c.pickupNote?.status === "USED"
        ? "collected"
        : c.pickupNote?.status === "ACTIVE"
          ? "note"
          : r.settled
            ? "paid"
            : r.live.length > 0
              ? "owed"
              : "unpriced";

    return {
      id: c.id,
      reference: c.reference,
      receivedLabel: formatDate(receivedAt),
      receivedAt: receivedAt.getTime(),
      customer: c.receiver.fullName,
      phone: c.receiver.phone,
      goods: types.length > 0 ? types.join(", ") : (c.description ?? "\u2014"),
      category: types[0] ?? "",
      volumeLabel: formatCbm(measured?.cbm),
      countedAs: `${measured?.packagesCount ?? 0} pkg`,
      priceLabel:
        r.live.length > 0
          ? formatMoney(r.billed, r.currency)
          : r.draft
            ? formatMoney(r.draft.total, r.currency)
            : null,
      owing: r.owing,
      state,
      stateLabel:
        state === "collected"
          ? "Collected"
          : state === "note"
            ? (c.pickupNote?.noteNumber ?? "Note out")
            : state === "paid"
              ? "Paid"
              : state === "owed"
                ? "Owed"
                : r.draft
                  ? "Not confirmed"
                  : "Not priced",
      proofUrl: c.photos[0]?.url ?? null,
      invoiceHref: r.live[0]
        ? `/app/finance/invoices/${r.live[0].id}`
        : null,
      href: `/app/cargo/${c.id}`,
    };
  });

  const documentRows: DocumentRow[] = [
    ...(container.packingList
      ? [
          {
            id: container.packingList.id,
            title: "Packing list",
            note: `${container.packingList.number} \u00b7 frozen when the box was sealed`,
            href: `/app/containers/${container.id}/packing-list`,
          },
        ]
      : []),
    ...(container.shipment?.billOfLading
      ? [
          {
            id: `bl-${container.shipment.id}`,
            title: "Bill of lading",
            note: container.shipment.billOfLading,
            href: null,
          },
        ]
      : []),
    ...(container.shipment?.documents ?? []).map((d) => ({
      id: d.id,
      title: d.name,
      note: `${d.kind.replace(/_/g, " ").toLowerCase()} \u00b7 ${formatDate(d.uploadedAt)}`,
      href: d.url,
    })),
  ];

  const timelineRows: TimelineRow[] = container.events.map((e) => ({
    id: e.id,
    title: e.note ?? e.to.replace(/_/g, " ").toLowerCase(),
    at: formatDate(e.createdAt),
    by: e.actor?.name ?? "\u2014",
  }));

  const measuredTotals = rows.reduce(
    (acc, r) => {
      const m = r.cargo.darReceiving ?? r.cargo.chinaReceiving;
      return {
        packages: acc.packages + (m?.packagesCount ?? 0),
        cbm: acc.cbm + Number(m?.cbm ?? 0),
      };
    },
    { packages: 0, cbm: 0 }
  );

  return (
    <div className="space-y-6">
      {/* The job before the numbers: sign the rate book's prices off. Shown
          only while something is waiting, with one press for all of it. */}
      <PriceList
        containerId={container.id}
        list={priceList}
        cargoTypes={cargoTypes}
        canConfirm={mayConfirm}
        locale={locale}
      />

      <section className="overflow-hidden rounded-xl border bg-card shadow-soft">
        <header className="flex flex-wrap items-start justify-between gap-3 px-5 py-4">
          <h2 className="font-semibold">Financial overview</h2>
          <p className="max-w-xl text-sm text-muted-foreground sm:text-right">
            Collected and Expenses are money that has actually moved. The rest is
            what this container is expected to be worth once everyone pays.
          </p>
        </header>

        <dl className="grid grid-cols-2 gap-px border-y bg-border lg:grid-cols-6">
          {[
            {
              label: "Expected revenue",
              value: formatMoney(expectedRevenue, currency),
              sub: tzs(expectedRevenue),
              tone: "",
            },
            {
              label: "Collected",
              value: formatMoney(collected, currency),
              sub: tzs(collected),
              tone: "text-success",
            },
            {
              label: "Expected outstanding",
              value: formatMoney(expectedOutstanding, currency),
              sub: tzs(expectedOutstanding),
              tone: "text-destructive",
            },
            {
              label: "Expenses",
              value: formatMoney(spent, currency),
              sub: tzs(spent),
              tone: "text-destructive",
            },
            {
              label: "Expected profit",
              value: formatMoney(expectedProfit, currency),
              sub: tzs(expectedProfit),
              tone: expectedProfit < 0 ? "text-destructive" : "",
            },
            {
              label: "Expected margin",
              value: `${Math.round(expectedMargin)}%`,
              sub: null,
              tone: expectedMargin < 0 ? "text-destructive" : "",
            },
          ].map((cell) => (
            <div key={cell.label} className="bg-card px-4 py-4">
              <dt className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                {cell.label}
              </dt>
              <dd className={cn("tnum mt-1 text-xl font-semibold", cell.tone)}>
                {cell.value}
              </dd>
              {cell.sub ? (
                <p className="tnum mt-0.5 text-xs text-muted-foreground">
                  {cell.sub}
                </p>
              ) : null}
            </div>
          ))}
        </dl>

        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm">
          <p className="tnum text-muted-foreground">
            {invoiced} of {rows.length} invoiced
            {toConfirm > 0 ? (
              <span className="text-warning"> \u00b7 {toConfirm} still to confirm</span>
            ) : null}
          </p>
          <p className="tnum text-muted-foreground">
            1 USD ={" "}
            <span className="font-medium text-foreground">
              {fx > 0 ? fx.toLocaleString() : "\u2014"}
            </span>{" "}
            TZS{" "}
            <Link
              href="/app/finance/rates#exchange-rate"
              className="text-brand hover:underline"
            >
              change
            </Link>
          </p>
        </div>

        {toConfirm > 0 ? (
          <p className="border-t px-5 py-3 text-sm text-muted-foreground">
            Cargo with no invoice yet is priced from the published rate book on
            Dar&rsquo;s own measurements. Those figures move until Finance
            confirms them.
          </p>
        ) : null}
      </section>

      {/* WHAT IS ACTUALLY STOPPING THIS BOX BEING CLOSED.

          Named as a count of consignments and a figure, because "cannot be
          closed" without either is a dead end rather than a next action. */}
      {owedTotal > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border px-5 py-3">
          <p className="text-sm">
            {rows.filter((r) => r.owing > 0).length} consignment
            {rows.filter((r) => r.owing > 0).length === 1 ? "" : "s"} still owed{" "}
            <span className="tnum font-semibold text-destructive">
              {formatMoney(owedTotal, currency)}
            </span>
          </p>
          <Link
            href="/app/finance/collections"
            className="text-sm text-brand hover:underline"
          >
            Chase them
          </Link>
        </div>
      ) : null}

      {/* A container is not finished because the boxes have gone. It is
          finished when every one of them has been asked for money. */}
      {noBillAtAll > 0 ? (
        <p className="rounded-xl border border-dashed px-5 py-3 text-sm text-muted-foreground">
          This container cannot be closed yet \u2014 {noBillAtAll} with no bill at
          all. Nobody has been asked for that money yet.
        </p>
      ) : null}

      <ContainerExpenses
        containerId={container.id}
        rows={expenseRows}
        types={expenseTypes}
        accounts={accounts.map((a) => ({
          id: a.id,
          label: `${a.bankName} (${a.currency})`,
        }))}
        missing={missingCosts}
        totalLabel={formatMoney(spent, "USD")}
        totalSecondary={tzs(spent)}
        mayRecord={mayRecordCost}
        locale={locale}
        correctionAccounts={correction.accounts}
        correctionCategories={correction.categories}
      />


      <ContainerCargoTabs
        cargo={cargoRows}
        documents={documentRows}
        timeline={timelineRows}
      />

    </div>
  );
}
