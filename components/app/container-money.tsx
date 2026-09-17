import Link from "next/link";

import { ConfirmPricesBanner } from "@/components/app/price-list";
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
import { formatCurrency, usdToTzs } from "@/lib/currency";
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
                select: { cargoType: true, descriptionZh: true },
              },
              photos: {
                select: { url: true },
                orderBy: { takenAt: "asc" },
                take: 1,
              },
              _count: { select: { photos: true } },
              invoices: {
                where: { status: { not: "CANCELLED" } },
                include: { payments: true, items: true },
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
  /* Through lib/currency, never by multiplying here: one place rounds, and it
     rounds shillings to the shilling. */
  const tzs = (usd: number) =>
    rate ? formatCurrency(usdToTzs(usd, rate.rate), "TZS") : null;

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
  const mayAmend = can(user.role, "container.amendArrived");
  const mayReadCosts = can(user.role, "expense.view");
  /* The two desks that talk to customers about money. The floors hold neither,
     so the send button is not rendered for them and the action refuses them. */
  const mayTellCustomers =
    can(user.role, "conversation.reply") || can(user.role, "payment.submit");
  const mayTakePayment = can(user.role, "payment.record");
  /* Moving a figure the customer has already been given. Finance's, and the
     counter's, which is where the conversation about it happens. */
  const mayMovePricedBill = can(user.role, "invoice.discount");
  const [locale, correction, priceList, cargoTypes, settings] = await Promise.all([
    localeOf(user.id),
    mayRecordCost
      ? correctionOptions()
      : Promise.resolve({ accounts: [], categories: [] } as Awaited<
          ReturnType<typeof correctionOptions>
        >),
    priceListForContainer(container.id),
    mayConfirm ? cargoTypeOptions() : Promise.resolve([] as string[]),
    /* The storage line on the message: a change in Settings reaches every
       message without anybody editing a template. */
    prisma.companySetting.findUnique({
      where: { id: "singleton" },
      select: { freeStorageDays: true, storagePerDay: true, storageCurrency: true },
    }),
  ]);
  /* The waiting price for each consignment, worked out once for the whole
     container and read on the row rather than in a table of its own. */
  const waiting = new Map(priceList.rows.map((row) => [row.cargoId, row]));

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

  const otherContainers = mayAmend
    ? await prisma.container.findMany({
        where: {
          deletedAt: null,
          id: { not: container.id },
          status: { in: ["ARRIVED", "CLOSED"] },
        },
        orderBy: { createdAt: "desc" },
        take: 40,
        select: { id: true, reference: true },
      })
    : [];

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

    /*
      ONE READING PER ROW, AND IT AGREES WITH THE BANNER ABOVE IT.

      The table used to say "Not priced" about consignments the price list had
      already worked a figure out for, because it only looked for an invoice —
      and a consignment priced from the rate book at check-in but not yet
      raised has no invoice row at all. Two halves of one screen answering the
      same question differently is worse than either answer.

      So the row reads the same source the banner reads: collected beats a note
      out, a note beats paid, paid beats issued, issued beats a draft, a draft
      beats the book's own figure, and only a consignment the book cannot price
      is "not priced".
    */
    const waitingRow = waiting.get(c.id);
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
      goods: goodsLabel(types, c.packages, c.description),
      category: types[0] ?? "",
      volumeLabel: formatCbm(measured?.cbm),
      countedAs: `${measured?.packagesCount ?? 0} pkg`,
      priceLabel:
        r.live.length > 0
          ? formatMoney(r.billed, r.currency)
          : r.draft
            ? formatMoney(r.draft.total, r.currency)
            : (waitingRow?.totalLabel ?? null),
      priceTzsLabel:
        r.live.length > 0
          ? tzs(r.billed)
          : r.draft
            ? tzs(Number(r.draft.total))
            : (waitingRow?.totalTzsLabel ?? null),
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
                ? "Issued"
                : r.draft
                  ? `Draft ${r.draft.number}`
                  : waitingRow?.totalLabel
                    ? "Priced from the book"
                    : waitingRow?.blockedReason
                      ? "Cannot be priced"
                      : /* Sea freight is billed on what landed, so a
                           consignment nobody in Dar has counted has nothing to
                           price yet. Saying "not priced" about it read as a
                           failure of the rate book. */
                        c.darReceiving
                        ? "Not priced"
                        : "Waiting for Dar's count",
      proofUrl: c.photos[0]?.url ?? null,
      proofCount: c._count.photos,
      invoiceHref: r.live[0]
        ? `/app/finance/invoices/${r.live[0].id}`
        : null,
      invoiceId: r.live[0]?.id ?? null,
      takesPayment: mayTakePayment && r.live.length > 0 && r.owing > 0,
      send: (() => {
        const bill = r.live[0];
        if (!mayTellCustomers || !bill) return null;
        const phone = whatsappNumber(c.receiver.phone);
        if (!phone) return null;
        return {
          phone,
          /* The invoice's own pinned figures, never today's rate: a customer
             quoted at 2,700 who then reads 2,800 believes the bill changed. */
          message: composeMessage("invoice.issued", {
            customerName: c.receiver.fullName,
            reference: c.reference,
            description: c.description,
            invoiceNumber: bill.number,
            packages: measured?.packagesCount ?? null,
            cbm: bill.billableCbm
              ? Number(bill.billableCbm).toFixed(3)
              : measured?.cbm
                ? Number(measured.cbm).toFixed(3)
                : null,
            ratePerCbm: bill.appliedRate
              ? Number(bill.appliedRate).toFixed(2)
              : bill.standardRate
                ? Number(bill.standardRate).toFixed(2)
                : null,
            /* Raw figures with separators, not formatCurrency: the template
               writes the currency word itself and would otherwise print two. */
            amount: Number(bill.total).toLocaleString("en-US", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            }),
            amountTzs: bill.totalTzs
              ? Number(bill.totalTzs).toLocaleString("en-US")
              : null,
            fxRate: bill.fxRate ? Number(bill.fxRate).toLocaleString("en-US") : null,
            currency: bill.currency,
            freeStorageDays: settings?.freeStorageDays ?? null,
            storagePerDay:
              settings && Number(settings.storagePerDay) > 0
                ? Number(settings.storagePerDay).toString()
                : null,
            storageCurrency: settings?.storageCurrency ?? "USD",
          }),
        };
      })(),
      href: `/app/cargo/${c.id}`,
      cargoType: types[0] ?? null,
      typeMixed: types.length > 1,
      damaged:
        !!c.darReceiving && c.darReceiving.condition !== "GOOD",
      conditionLabel: c.darReceiving
        ? (CONDITION_LABEL[c.darReceiving.condition] ?? null)
        : null,
      /*
        THE PRICE STAYS CORRECTABLE UNTIL MONEY LANDS.

        A bill that has gone out is still Finance's to correct, with a reason,
        on the row it is being read on — the air side keeps the same door open
        and closes it the moment a payment is recorded, because a total that
        moves under a receipt leaves the receipt describing a bill that no
        longer exists. From then on it is a discount or a credit note.
      */
      edit: (() => {
        const bill = r.live[0];
        if (bill) {
          if (!mayMovePricedBill) return null;
          /* Verified money, matching the server: an unverified claim must not
             freeze a bill nobody has been paid for yet. */
          const anyMoney = bill.payments.some((pay) => pay.status === "VERIFIED");
          if (anyMoney) return null;
          const freight = bill.items
            .filter((i) => i.category === "Freight")
            .reduce((sum, i) => sum + Number(i.amount), 0);
          const extra = bill.items
            .filter((i) => i.category === "Charge")
            .reduce((sum, i) => sum + Number(i.amount), 0);
          const off = bill.items
            .filter((i) => i.category === "Discount")
            .reduce((sum, i) => sum - Number(i.amount), 0);
          const agreed =
            bill.appliedRate !== null &&
            (bill.standardRate === null || !bill.appliedRate.equals(bill.standardRate));
          return {
            standardRate: bill.standardRate === null ? null : Number(bill.standardRate),
            agreedRate: agreed ? Number(bill.appliedRate) : null,
            /* The bill carries one basis; the book's own is what the waiting
               list worked out, where the consignment is still on it. */
            bookBasis: waiting.get(c.id)?.bookBasis ?? bill.rateBasis,
            basis: bill.rateBasis,
            cbm: bill.billableCbm === null ? null : Number(bill.billableCbm),
            weightKg: bill.billableKg === null ? null : Number(bill.billableKg),
            freight,
            extra,
            discount: off,
          };
        }
        const w = waiting.get(c.id);
        if (!w || !mayConfirm) return null;
        return {
          standardRate: w.standardRate === null ? null : Number(w.standardRate),
          agreedRate: w.agreed && w.rate !== null ? Number(w.rate) : null,
          bookBasis: w.bookBasis,
          basis: w.basis,
          cbm: w.billableCbm === null ? null : Number(w.billableCbm),
          weightKg: w.weightKg === null ? null : Number(w.weightKg),
          freight: Number(w.freight),
          extra: Number(w.extra),
          discount: Number(w.discountOff),
        };
      })(),
    };
  });

  const documentRows: DocumentRow[] = [
    ...(container.packingList
      ? [
          {
            id: container.packingList.id,
            title: "Packing list",
            note: `${container.packingList.number} · frozen when the box was sealed`,
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
      note: `${d.kind.replace(/_/g, " ").toLowerCase()} · ${formatDate(d.uploadedAt)}`,
      href: d.url,
    })),
  ];

  const timelineRows: TimelineRow[] = container.events.map((e) => ({
    id: e.id,
    title: e.note ?? e.to.replace(/_/g, " ").toLowerCase(),
    at: formatDate(e.createdAt),
    by: e.actor?.name ?? "—",
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
      {/* THE JOB BEFORE THE NUMBERS: SIGN THE RATE BOOK'S PRICES OFF.

          A banner, not a second table. The container's cargo is already on this
          page once, below, and the corrections happen on those rows — listing
          the same boxes twice with different columns is how two halves of one
          screen come to disagree about one container. */}
      <ConfirmPricesBanner
        containerId={container.id}
        list={priceList}
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

        {/*
          SHILLINGS FIRST, DOLLARS UNDER THEM.

          The bill is priced in dollars and collected in shillings, and the
          figure anybody in this office reads out loud — to a customer, to the
          owner, into a ledger — is the shilling one. Printing the dollars large
          made the page answer a question nobody here asks first. The dollar
          figure stays, small, because it is what the rate book quoted and what
          a re-price argues about.

          COSTS ARE A SEPARATE ANSWER FROM REVENUE. Three cards for a desk that
          may read a bill, six for one that may also read what the sailing cost
          — the same split the air side draws, on the same permission.
        */}
        <dl
          className={cn(
            "grid grid-cols-2 gap-px border-y bg-border sm:grid-cols-3",
            mayReadCosts ? "lg:grid-cols-6" : "lg:grid-cols-3"
          )}
        >
          {[
            {
              label: "Expected revenue",
              value: tzs(expectedRevenue) ?? formatMoney(expectedRevenue, currency),
              sub: rate ? formatMoney(expectedRevenue, currency) : null,
              tone: "",
            },
            {
              label: "Collected",
              value: tzs(collected) ?? formatMoney(collected, currency),
              sub: rate ? formatMoney(collected, currency) : null,
              tone: "text-success",
            },
            {
              label: "Expected outstanding",
              value:
                tzs(expectedOutstanding) ?? formatMoney(expectedOutstanding, currency),
              sub: rate ? formatMoney(expectedOutstanding, currency) : null,
              tone: expectedOutstanding > 0 ? "text-destructive" : "",
            },
            ...(mayReadCosts
              ? [
                  {
                    label: "Expenses",
                    value: tzs(spent) ?? formatMoney(spent, currency),
                    sub: rate ? formatMoney(spent, currency) : null,
                    tone: "text-destructive",
                  },
                  {
                    label: expectedProfit < 0 ? "Expected loss" : "Expected profit",
                    value:
                      tzs(Math.abs(expectedProfit)) ??
                      formatMoney(Math.abs(expectedProfit), currency),
                    sub: rate ? formatMoney(Math.abs(expectedProfit), currency) : null,
                    tone: expectedProfit < 0 ? "text-destructive" : "",
                  },
                  {
                    label: "Expected margin",
                    /* A container that has billed nothing has not made 0%. It
                       has no answer yet, and saying so is not the same claim. */
                    value: expectedRevenue > 0 ? `${Math.round(expectedMargin)}%` : "—",
                    sub: null,
                    tone: expectedMargin < 0 ? "text-destructive" : "",
                  },
                ]
              : []),
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
              <span className="text-warning"> · {toConfirm} still to confirm</span>
            ) : null}
          </p>
          <p className="tnum text-muted-foreground">
            1 USD ={" "}
            <span className="font-medium text-foreground">
              {fx > 0 ? fx.toLocaleString() : "—"}
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
              {tzs(owedTotal) ?? formatMoney(owedTotal, currency)}
            </span>
            {rate ? (
              <span className="tnum text-muted-foreground">
                {" "}
                ({formatMoney(owedTotal, currency)})
              </span>
            ) : null}
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
          This container cannot be closed yet — {noBillAtAll} with no bill at
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
        totalLabel={tzs(spent) ?? formatMoney(spent, "USD")}
        totalSecondary={rate ? formatMoney(spent, "USD") : null}
        mayRecord={mayRecordCost}
        locale={locale}
        correctionAccounts={correction.accounts}
        correctionCategories={correction.categories}
      />


      <ContainerCargoTabs
        containerId={container.id}
        cargo={cargoRows}
        documents={documentRows}
        timeline={timelineRows}
        cargoTypes={cargoTypes}
        otherContainers={otherContainers}
        canConfirm={mayConfirm}
        canAmend={mayAmend}
        vatPercent={Number(priceList.vatPercent)}
        locale={locale}
      />

    </div>
  );
}

/** What the Dar floor wrote on the receiving row, said in words. */
const CONDITION_LABEL: Record<string, string> = {
  GOOD: "Good",
  MINOR_DAMAGE: "Minor damage",
  DAMAGED: "Damaged",
  WET: "Wet",
  REPACKED: "Repacked",
};

/**
 * WHAT THE GOODS ARE, IN BOTH LANGUAGES THAT HAVE TO READ IT.
 *
 * The rate book's own category, and beside it whatever Guangzhou typed on the
 * box in Chinese. Two different people read this line — the office in Dar and,
 * when a question goes back up the chain, the floor in Baiyun — and neither
 * should have to guess which consignment is meant. The Chinese is what the
 * warehouse typed, not a translation made here.
 */
function goodsLabel(
  types: string[],
  packages: { descriptionZh: string | null }[],
  description: string | null
) {
  const english = types.length > 0 ? types.join(", ") : (description ?? "—");
  const chinese = [
    ...new Set(
      packages.map((k) => k.descriptionZh?.trim()).filter((v): v is string => Boolean(v))
    ),
  ];
  return chinese.length > 0 ? `${english} (${chinese.join(", ")})` : english;
}
