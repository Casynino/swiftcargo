import Link from "next/link";
import type { Metadata } from "next";
import type { Prisma } from "@prisma/client";
import { Boxes, ChevronRight, Package, Search } from "lucide-react";

import { EmptyState } from "@/components/app/empty-state";
import { PriceList } from "@/components/app/price-list";
import { ContainerTabs } from "@/components/app/container-tabs";
import { PageHeader } from "@/components/app/page-header";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { isUsableRate, tzsToUsd, usdToTzs } from "@/lib/currency";
import { OPEN_STATUSES } from "@/lib/exception-groups";
import { formatCbm, formatDate, formatMoney } from "@/lib/format";
import {
  invoiceRate,
  outstandingOf,
  outstandingTzsOf,
  totalTzsOf,
} from "@/lib/invoice-balance";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { priceListForContainer } from "@/lib/price-list";
import { AT_SEA_STATUSES, sailingDelay } from "@/lib/eta";
import { requirePermission } from "@/lib/session";
import { cn } from "@/lib/utils";
import { cargoTypeOptions } from "@/lib/valuation";
import { localeOf } from "@/lib/viewer-locale";
import { t } from "@/lib/i18n";

import { primeLocale } from "@/lib/server-t";
import { Tx } from "@/components/app/tx";
export const metadata: Metadata = { title: "Arrived containers" };

/**
 * "45.2M", "20k". A column of eight-digit shilling figures is unreadable at a
 * glance and pushes the table off a laptop screen; the exact figure is one
 * click away on the container itself, and the strip above keeps it whole.
 */
function compact(tzs: number) {
  const n = Math.abs(tzs);
  const sign = tzs < 0 ? "-" : "";
  if (n >= 1_000_000) return `${sign}${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${sign}${Math.round(n / 1_000)}k`;
  return `${sign}${Math.round(n)}`;
}

/**
 * EVERY SAILING THAT HAS LEFT CHINA.
 *
 * The hand-off lives on this page. A container is Dar's while it is being
 * counted and Finance's once it has been; "Checked in" is the moment that
 * changes hands, and it is a derived state rather than a flag anybody sets —
 * a container is checked in when every consignment on it has a Dar receiving
 * record, which is the same thing as saying the counting is finished.
 *
 * That matters because Finance prices on Dar's CBM, not China's. Letting
 * Finance confirm a price while the floor is still measuring is how a bill goes
 * out against a figure that then changes.
 */
const VIEWS = {
  active: "Active",
  sea: "In transit",
  clearance: "Pending clearance",
  checked: "Checked in",
  history: "History",
  all: "Everything",
  pricing: "Waiting for prices",
} as const;
type View = keyof typeof VIEWS;

/*
  ACTIVE IS WHAT HAS LANDED AND IS NOT FINISHED WITH.

  A box still on the water has no cargo to clear, no bill to chase and nothing
  to check in — it is watched, not worked — so it lives under In transit alone
  and Active is the two states on the ground. A closed container is finished:
  nothing can be added to it and it is opened again only to be read.

  "Waiting for prices" is not a chip. It is a cut across the same rows rather
  than a place a container is in, and it is reached from the band above the
  list, which appears only while there is something in it.
*/
const CHIPS: View[] = ["active", "sea", "clearance", "checked", "history", "all"];

export default async function ArrivedContainersPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; q?: string }>;
}) {
  await primeLocale();
  const user = await requirePermission("container.view");
  const { view, q } = await searchParams;

  /* Both warehouses open this page to see what landed. What it was billed,
     collected and spent is Finance's and the books', and a floor that can read
     it is a floor that can be argued with about it — so the figures are not
     drawn at all for a desk without the permission, rather than hidden. */
  const showMoney = can(user.role, "finance.view");
  /* What the sailings COST is a different question from what they are worth.
     Support holds finance.view so it can price and chase a bill; what the
     clearing agent charged is not its business, and Expected profit is built
     on that spend. */
  const showCosts = can(user.role, "expense.view");

  const query = q?.trim() ?? "";
  /* "Waiting for prices" is reached by URL as much as by the band below —
     typed by hand, not only clicked — so a desk without showMoney is turned
     back to Active here rather than trusting that nothing links to it. */
  const requested: View = view && view in VIEWS ? (view as View) : "active";
  const chosen: View = requested === "pricing" && !showMoney ? "active" : requested;

  /* Everything that has sailed. A container still taking cargo in Guangzhou is
     not on this page at all — that is the loading table. */
  const [locale, liveRate] = await Promise.all([
    localeOf(user.id),
    prisma.exchangeRate.findFirst({
      where: { active: true },
      orderBy: { effectiveFrom: "desc" },
      select: { rate: true },
    }),
  ]);
  /* Today's rate, or none published. With none, every money figure on the page
     falls back to the dollars the rate book priced in rather than printing a
     shilling figure nobody set. */
  const today = liveRate?.rate ?? null;
  const hasRate = isUsableRate(today);

  const containers = await prisma.container.findMany({
    where: {
      deletedAt: null,
      status: { in: ["DEPARTED", "IN_TRANSIT", "ARRIVED", "CLOSED"] },
    },
    orderBy: { createdAt: "desc" },
    take: 60,
    include: {
      shipment: {
        select: {
          vessel: true,
          voyage: true,
          actualArrival: true,
          eta: true,
          originPort: true,
        },
      },
      expenses: {
        where: { deletedAt: null, cancelledAt: null },
        select: { amount: true, currency: true, fxRate: true },
      },
      cargoLines: {
        include: {
          cargo: {
            select: {
              id: true,
              receiverId: true,
              status: true,
              /* Dar's own volume, not China's. Finance prices on what the
                 receiving counter measured — that is the whole point of the
                 second measurement. */
              darReceiving: { select: { id: true, cbm: true } },
              chinaReceiving: { select: { id: true } },
              /* Unfinished cases only. A resolved shortage is history; an open
                 one is cargo somebody is still looking for. */
              exceptions: {
                where: { status: { in: OPEN_STATUSES } },
                select: { id: true },
              },
              invoices: {
                where: { status: { not: "CANCELLED" } },
                include: { payments: true },
              },
            },
          },
        },
      },
    },
  });

  /* A bill's own pinned rate first: one agreed at 2,650 is still 2,650 after
     the board moves. Today's rate only fills in for a row raised before this
     system pinned one. */
  type Billed = { currency: string; fxRate: Prisma.Decimal | null };
  const billRate = (invoice: Billed) => invoiceRate(invoice) ?? today;

  /* A figure off a bill in dollars, and the same figure in shillings. Both
     conversions are lib/currency's, and a shilling bill is turned into dollars
     rather than added to one — the two columns are not the same money. */
  const usdOn = (invoice: Billed, amount: Prisma.Decimal | number) => {
    if (invoice.currency === "USD") return Number(amount);
    const rate = billRate(invoice);
    return isUsableRate(rate) ? Number(tzsToUsd(amount, rate)) : 0;
  };

  const tzsOn = (
    invoice: Billed,
    amount: Prisma.Decimal | number,
    known: Prisma.Decimal | null
  ) => {
    if (known) return Number(known);
    if (invoice.currency === "TZS") return Number(amount);
    const rate = billRate(invoice);
    return isUsableRate(rate) ? Number(usdToTzs(amount, rate)) : 0;
  };

  const costRate = (fx: Prisma.Decimal | null) =>
    isUsableRate(fx) && Number(fx) > 1 ? fx : today;

  const rows = containers.map((container) => {
    const cargo = container.cargoLines.map((l) => l.cargo);
    const counted = cargo.filter((c) => c.darReceiving).length;
    /* Checked in means the floor has finished: every consignment ruled on.
       Half a container counted is still Dar's work, not Finance's. */
    const checkedIn =
      cargo.length > 0 && counted === cargo.length && container.status !== "CLOSED";

    const live = cargo.flatMap((c) =>
      c.invoices.filter((i) => i.status !== "DRAFT")
    );
    const billed = live.reduce((sum, i) => sum + usdOn(i, i.total), 0);
    const owing = live.reduce((sum, i) => sum + usdOn(i, outstandingOf(i)), 0);
    /* Shillings are what the desk counts in, so they lead. Each bill converts
       at the rate frozen onto it — the figure its customer was quoted. */
    const billedTzs = live.reduce(
      (sum, i) => sum + tzsOn(i, i.total, totalTzsOf(i)),
      0
    );
    const owingTzs = live.reduce(
      (sum, i) => sum + tzsOn(i, outstandingOf(i), outstandingTzsOf(i)),
      0
    );

    /* In USD, at the rate pinned on each cost. Adding shillings to dollars is
       how a sailing reads a thousand times what it spent. */
    const spent = container.expenses.reduce((sum, e) => {
      if (e.currency === "USD") return sum + Number(e.amount);
      const rate = costRate(e.fxRate);
      return sum + (isUsableRate(rate) ? Number(tzsToUsd(e.amount, rate)) : 0);
    }, 0);

    const spentTzs = container.expenses.reduce((sum, e) => {
      if (e.currency === "TZS") return sum + Number(e.amount);
      const rate = costRate(e.fxRate);
      return sum + (isUsableRate(rate) ? Number(usdToTzs(e.amount, rate)) : 0);
    }, 0);

    const state: View =
      container.status === "CLOSED"
        ? "history"
        : checkedIn
          ? "checked"
          : container.status === "ARRIVED"
            ? "clearance"
            : "sea";

    /* Every one of these landed in Dar es Salaam, so printing the destination
       on each row is the same fifteen characters all the way down a column
       that is short of space. The sailing's own name goes beside it. */
    const trip = [container.shipment?.vessel, container.shipment?.voyage]
      .filter(Boolean)
      .join(" ");

    return {
      container,
      state,
      route: container.originPort ?? container.shipment?.originPort ?? "",
      trip,
      cargo: cargo.length,
      counted,
      customers: new Set(cargo.map((c) => c.receiverId)).size,
      cbm: cargo.reduce(
        (sum, c) => sum + Number(c.darReceiving?.cbm ?? 0),
        0
      ),
      flagged: cargo.filter((c) => c.exceptions.length > 0).length,
      /* The same test as the container's own price list (WAITING_ON_CONTAINER):
         measured on either floor, not missing, nothing live billed. Counting
         only Dar's measurement dropped a container off this view the moment
         its Dar-counted rows were confirmed, while China-measured rows on the
         same box were still waiting for a price. */
      toPrice: cargo.filter(
        (c) =>
          (c.darReceiving || c.chinaReceiving) &&
          c.status !== "MISSING_AT_DAR" &&
          c.status !== "CANCELLED" &&
          c.invoices.every((i) => i.status === "DRAFT")
      ).length,
      billed,
      owing,
      collected: billed - owing,
      spent,
      billedTzs,
      owingTzs,
      collectedTzs: billedTzs - owingTzs,
      spentTzs,
      /* The container's own status decides which date this is. A box that has
         landed shows the day it landed — never a promise, even when its
         shipment row never took the arrival date. */
      arrived: ["ARRIVED", "CLOSED"].includes(container.status)
        ? (container.shipment?.actualArrival ?? null)
        : (container.shipment?.eta ?? null),
      /* A date with no word beside it read as the day it landed. Until it
         lands, the date is a promise — and one that has passed is a delay
         somebody has to answer for. */
      due: !["ARRIVED", "CLOSED"].includes(container.status),
      lateDays: sailingDelay({
        eta: container.shipment?.eta ?? null,
        arrived: container.shipment?.actualArrival ?? null,
        atSea: (AT_SEA_STATUSES as readonly string[]).includes(container.status),
      }).days,
    };
  });

  const needle = query.toLowerCase();
  const matched = rows.filter((r) => {
    if (!needle) return true;
    const hay = [
      r.container.reference,
      r.container.containerNumber ?? "",
      r.container.shipment?.vessel ?? "",
      r.container.shipment?.voyage ?? "",
      r.container.sealNumber ?? "",
    ]
      .join(" ")
      .toLowerCase();
    return hay.includes(needle);
  });

  /* Counts follow the search but never the chip's own filter, so a chip cannot
     read zero because you are standing on a different one. */
  const counts: Record<View, number> = {
    /* Landed and not yet closed. A box still on the water is not "active" work
       for anybody in Dar — it is a date — so it lives under In transit only. */
    active: matched.filter((r) => r.state === "clearance" || r.state === "checked")
      .length,
    sea: matched.filter((r) => r.state === "sea").length,
    clearance: matched.filter((r) => r.state === "clearance").length,
    checked: matched.filter((r) => r.state === "checked").length,
    /* The sailings with something still to price. Cargo that has not sailed
       is counted, and priced, on Confirm prices. */
    pricing: matched.filter((r) => r.toPrice > 0).length,
    history: matched.filter((r) => r.state === "history").length,
    all: matched.length,
  };

  const shown = matched.filter((r) => {
    if (chosen === "all") return true;
    if (chosen === "active")
      return r.state === "clearance" || r.state === "checked";
    if (chosen === "pricing") return r.toPrice > 0;
    return r.state === chosen;
  });

  /*
    WHAT IS ON SCREEN, ADDED UP.

    The band totals the rows the chip and the search left standing, not
    everything on record: filter to what is still at sea, or search one vessel,
    and the money follows it. That is the question somebody came to the page
    with, and it saves them adding a column up by eye.
  */
  const sum = (pick: (r: (typeof rows)[number]) => number) =>
    shown.reduce((total, r) => total + pick(r), 0);

  const totals = {
    cargo: sum((r) => r.cargo),
    cbm: sum((r) => r.cbm),
    billed: sum((r) => r.billed),
    billedTzs: sum((r) => r.billedTzs),
    collected: sum((r) => r.collected),
    collectedTzs: sum((r) => r.collectedTzs),
    owing: sum((r) => r.owing),
    owingTzs: sum((r) => r.owingTzs),
    spent: sum((r) => r.spent),
    spentTzs: sum((r) => r.spentTzs),
  };

  /** Shillings where a rate is published, the priced dollars where none is. */
  const headline = (tzs: number, usd: number) =>
    hasRate ? formatMoney(tzs, "TZS") : formatMoney(usd, "USD");
  /*
    Nothing is a dash, not a nought.

    A column of red zeroes down a board reads as a problem on every row. Zero
    collected and zero spent are the ordinary state of a container that landed
    this morning, so they are set as an absence and the eye passes over them.
  */
  const cell = (tzs: number, usd: number) => {
    const figure = hasRate ? tzs : usd;
    return figure === 0 ? "—" : compact(figure);
  };

  const cells: { k: string; main: string; sub: string; tone?: string }[] = [
    {
      k: t(locale, "Containers"),
      main: String(shown.length),
      sub: `${totals.cargo} ${t(locale, "cargo")} · ${totals.cbm.toFixed(1)} CBM`,
    },
  ];

  if (showMoney) {
    cells.push(
      {
        k: t(locale, "Expected"),
        main: headline(totals.billedTzs, totals.billed),
        sub: formatMoney(totals.billed, "USD"),
      },
      {
        k: t(locale, "Collected"),
        main: headline(totals.collectedTzs, totals.collected),
        sub: formatMoney(totals.collected, "USD"),
        tone: "text-success",
      },
      {
        k: t(locale, "Outstanding"),
        main: headline(totals.owingTzs, totals.owing),
        sub: formatMoney(totals.owing, "USD"),
        tone: totals.owing > 0 ? "text-destructive" : undefined,
      }
    );
  }

  /* What the sailings cost, and the profit that is only ever expected minus
     that cost. Pushed separately so a desk without expense.view gets a band
     that stops at Outstanding, rather than one carrying a profit figure
     computed against a spend it was never shown. */
  if (showMoney && showCosts) {
    const profit = totals.billed - totals.spent;
    cells.push(
      {
        k: t(locale, "Expenses"),
        main: headline(totals.spentTzs, totals.spent),
        sub: formatMoney(totals.spent, "USD"),
        tone: "text-destructive",
      },
      {
        k: t(locale, "Expected profit"),
        main: headline(totals.billedTzs - totals.spentTzs, profit),
        sub: formatMoney(profit, "USD"),
        tone: profit < 0 ? "text-destructive" : undefined,
      }
    );
  }

  /*
    THE PRICES THEMSELVES, FOR A DESK THAT MAY SEE MONEY.

    Every container still waiting, as the same list its own page opens with:
    the rate book's figure on every row, the type and the rate correctable on
    the row, and one press per container. Cargo with no container yet is
    priced from Confirm prices instead — one row is never on both lists.
  */
  const pricing =
    chosen === "pricing" && showMoney
      ? await (async () => {
          const mayConfirm = can(user.role, "invoice.priceConfirm");
          const [cargoTypes, perContainer] = await Promise.all([
            mayConfirm ? cargoTypeOptions() : Promise.resolve([] as string[]),
            Promise.all(
              shown.map(async (row) => ({
                row,
                list: await priceListForContainer(row.container.id),
              }))
            ),
          ]);
          return { mayConfirm, cargoTypes, perContainer };
        })()
      : null;

  const waitingOnFinance = rows.reduce((sum, r) => sum + r.toPrice, 0);

  const chips: View[] =
    chosen === "pricing" && showMoney ? [...CHIPS, "pricing"] : CHIPS;

  return (
    <div className="space-y-6">
      <PageHeader
        title={t(locale, "Arrived containers")}
        description={t(
          locale,
          "Every sailing that has left China. Open one to see its cargo, documents and full timeline."
        )}
      />
      <ContainerTabs finance={can(user.role, "finance.view")} />

      {!showMoney ? (
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{shown.length}</span>{" "}
          {t(locale, shown.length === 1 ? "container" : "containers")} ·{" "}
          {totals.cargo} {t(locale, "cargo")} · {totals.cbm.toFixed(1)} CBM
        </p>
      ) : (
        <dl
          className={cn(
            "grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border",
            /* Sized to the tiles that exist. Six columns holding four leaves a
               slab of border colour across the end of the band. */
            showCosts
              ? "sm:grid-cols-3 lg:grid-cols-6"
              : "sm:grid-cols-2 lg:grid-cols-4"
          )}
        >
          {cells.map((tile) => (
            <div key={tile.k} className="min-w-0 bg-card px-4 py-4">
              <dt className="truncate text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                {tile.k}
              </dt>
              <dd
                className={cn(
                  "tnum mt-1 whitespace-nowrap font-semibold",
                  tile.main.length > 15 ? "text-base" : "text-lg",
                  tile.tone
                )}
              >
                {tile.main}
              </dd>
              <p className="tnum mt-0.5 truncate text-xs text-muted-foreground">
                <Tx>{tile.sub}</Tx>
              </p>
            </div>
          ))}
        </dl>
      )}

      {/* THE HAND-OFF, NAMED. Dar has finished counting and nobody has priced
          it — which is the only thing standing between a landed container and
          a customer being asked for money. Behind showMoney like everything
          else priced on this page: a warehouse counts, it does not price, and
          a band telling it money is waiting on someone else is still telling
          it about money. */}
      {waitingOnFinance > 0 && showMoney ? (
        <Link
          href="/app/containers/arrived?view=pricing"
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border-l-4 border-l-brand border-y border-r bg-brand/[0.06] px-4 py-3 hover:bg-brand/[0.09]"
        >
          <div className="flex items-start gap-3">
            <Package className="mt-0.5 size-5 shrink-0 text-brand" />
            <div>
              <p className="text-sm font-medium">
                {waitingOnFinance}{" "}
                {t(
                  locale,
                  waitingOnFinance === 1
                    ? "consignment measured and not yet priced"
                    : "consignments measured and not yet priced"
                )}
              </p>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {t(
                  locale,
                  "Priced from the rate book the moment a floor measures it. Finance confirms the figure before anybody is asked for money."
                )}
              </p>
            </div>
          </div>
          <span className="text-sm text-brand">
            {t(locale, "Confirm prices")} →
          </span>
        </Link>
      ) : null}

      <Card className="space-y-3 p-4">
        <form className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            name="q"
            defaultValue={query}
            placeholder={t(
              locale,
              "Search container number, vessel, voyage or seal…"
            )}
            className="pl-9"
            aria-label={t(locale, "Search containers")}
          />
          <input type="hidden" name="view" value={chosen} />
        </form>
        <div className="flex flex-wrap gap-2">
          {chips.map((key) => (
            <Link
              key={key}
              href={`/app/containers/arrived?view=${key}${query ? `&q=${encodeURIComponent(query)}` : ""}`}
              className={cn(
                "flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm transition-colors",
                chosen === key
                  ? "border-brand bg-brand text-brand-foreground"
                  : "bg-card text-foreground hover:bg-secondary"
              )}
            >
              {t(locale, VIEWS[key])}
              <span className="tnum text-xs opacity-70">{counts[key]}</span>
            </Link>
          ))}
        </div>
      </Card>

      {pricing ? (
        <div className="space-y-6">
          {pricing.perContainer.map(({ row, list }) => (
            <PriceList
              key={row.container.id}
              heading={
                <Link
                  href={`/app/containers/${row.container.id}`}
                  className="font-medium text-brand hover:underline"
                >
                  {row.container.reference}
                  {row.container.shipment?.vessel ? ` · ${row.container.shipment.vessel}` : ""}
                </Link>
              }
              containerId={row.container.id}
              list={list}
              cargoTypes={pricing.cargoTypes}
              canConfirm={pricing.mayConfirm}
              locale={locale}
            />
          ))}
          {pricing.perContainer.every(({ list }) => list.rows.length === 0) ? (
            <Card>
              <EmptyState
                icon="Ship"
                title={t(locale, "Nothing that has sailed is waiting for a price")}
                description={t(
                  locale,
                  "Cargo that has not sailed yet is priced from Confirm prices."
                )}
              />
            </Card>
          ) : null}
          <p className="text-sm text-muted-foreground">
            {t(locale, "Cargo that has not sailed yet is priced from")}{" "}
            <Link
              href="/app/finance/prices"
              className="font-medium text-brand hover:underline"
            >
              {t(locale, "Confirm prices")}
            </Link>
            .
          </p>
        </div>
      ) : null}

      {pricing ? null : (
      <Card>
        {shown.length === 0 ? (
          <EmptyState
            icon="Ship"
            title={t(locale, query ? "Nothing matches" : "Nothing here")}
            description={t(
              locale,
              query
                ? "Try the container number, the vessel, the voyage or the seal."
                : "Containers appear here once they leave Guangzhou. Cargo still waiting in China is on the loading tables."
            )}
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t(locale, "Container")}</TableHead>
                <TableHead>{t(locale, "Route")}</TableHead>
                <TableHead>{t(locale, "Status")}</TableHead>
                <TableHead className="text-right">{t(locale, "Cargo")}</TableHead>
                <TableHead className="text-right">{t(locale, "CBM")}</TableHead>
                <TableHead className="hidden lg:table-cell">
                  {t(locale, "Arrived")}
                </TableHead>
                {showMoney ? (
                  <>
                    <TableHead className="text-right">
                      {t(locale, "Expected")}
                    </TableHead>
                    <TableHead className="text-right">
                      {t(locale, "Collected")}
                    </TableHead>
                    <TableHead className="text-right">
                      {t(locale, "Outstanding")}
                    </TableHead>
                    {/* What clearing a sailing cost is a narrower question than
                        what it is worth: Finance and the owner, not the desk
                        that only chases a bill. */}
                    {showCosts ? (
                      <TableHead className="hidden text-right xl:table-cell">
                        {t(locale, "Expenses")}
                      </TableHead>
                    ) : null}
                  </>
                ) : null}
                <TableHead className="w-8" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {shown.map((row) => (
                <TableRow key={row.container.id}>
                  <TableCell className="p-0">
                    <Link
                      href={`/app/containers/${row.container.id}`}
                      className="flex items-center gap-3 px-4 py-3"
                    >
                      <span
                        className={cn(
                          "h-8 w-1 rounded-full",
                          row.state === "checked"
                            ? "bg-emerald-500"
                            : row.state === "clearance"
                              ? "bg-amber-500"
                              : row.state === "sea"
                                ? "bg-brand"
                                : "bg-muted-foreground/30"
                        )}
                      />
                      <span className="tnum text-sm font-medium">
                        {row.container.reference}
                      </span>
                    </Link>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {row.route || "—"}
                    {row.trip ? ` · ${row.trip}` : ""}
                    {row.flagged > 0 ? (
                      <span className="ml-2 text-xs text-destructive">
                        {row.flagged} {t(locale, "under investigation")}
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                    {row.state === "checked"
                      ? t(locale, "Checked in")
                      : row.state === "clearance"
                        ? `${t(locale, "Counting")} ${row.counted}/${row.cargo}`
                        : row.state === "sea"
                          ? t(locale, "In transit")
                          : t(locale, "Closed")}
                    {row.toPrice > 0 && showMoney ? (
                      <span className="mt-1 block w-fit rounded-full bg-warning/15 px-2 py-0.5 text-[11px] font-medium text-warning">
                        {row.toPrice} {t(locale, "to price")}
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell className="tnum text-right text-sm">
                    {row.cargo}
                  </TableCell>
                  <TableCell className="tnum text-right text-sm">
                    {row.cbm > 0 ? formatCbm(row.cbm) : "—"}
                  </TableCell>
                  <TableCell className="tnum hidden whitespace-nowrap text-xs text-muted-foreground lg:table-cell">
                    {row.arrived ? formatDate(row.arrived) : "—"}
                    {row.arrived && row.due ? (
                      row.lateDays > 0 ? (
                        <span className="mt-1 block w-fit rounded-full bg-warning/15 px-2 py-0.5 text-[11px] font-medium text-warning">
                          {t(locale, "Delayed")} · {row.lateDays}
                        </span>
                      ) : (
                        <span className="mt-0.5 block text-[11px] text-muted-foreground/70">
                          {t(locale, "expected")}
                        </span>
                      )
                    ) : null}
                  </TableCell>
                  {showMoney ? (
                    <>
                      <TableCell className="tnum text-right text-sm font-medium">
                        {cell(row.billedTzs, row.billed)}
                      </TableCell>
                      <TableCell
                        className={cn(
                          "tnum text-right text-sm",
                          row.collected > 0
                            ? "text-success"
                            : "text-muted-foreground"
                        )}
                      >
                        {cell(row.collectedTzs, row.collected)}
                      </TableCell>
                      <TableCell
                        className={cn(
                          "tnum text-right text-sm font-medium",
                          row.owing > 0
                            ? "text-destructive"
                            : "text-muted-foreground"
                        )}
                      >
                        {cell(row.owingTzs, row.owing)}
                      </TableCell>
                      {showCosts ? (
                        <TableCell
                          className={cn(
                            "tnum hidden text-right text-sm xl:table-cell",
                            row.spent > 0
                              ? "text-destructive"
                              : "text-muted-foreground"
                          )}
                        >
                          {cell(row.spentTzs, row.spent)}
                        </TableCell>
                      ) : null}
                    </>
                  ) : null}
                  <TableCell className="p-0">
                    <Link
                      href={`/app/containers/${row.container.id}`}
                      className="flex items-center justify-center px-3 py-3 text-muted-foreground"
                      aria-label={`${t(locale, "Open")} ${row.container.reference}`}
                    >
                      <ChevronRight className="size-4" />
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        {/* The unit, said once. Repeating "TSh" down four columns of a
            sixty-row board is sixty times the ink for one fact. */}
        {shown.length > 0 && showMoney ? (
          <p className="border-t px-4 py-2 text-right text-xs text-muted-foreground">
            {hasRate
              ? t(
                  locale,
                  "Money columns in thousands (k) and millions (M) of shillings"
                )
              : t(locale, "Figures in USD — no exchange rate published")}
          </p>
        ) : null}
      </Card>
      )}

      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Boxes className="size-4" />
        {t(locale, "Cargo still waiting in China is on the")}{" "}
        <Link
          href="/app/containers/loading"
          className="text-brand hover:underline"
        >
          {t(locale, "loading tables")}
        </Link>
        .
      </p>
    </div>
  );
}
