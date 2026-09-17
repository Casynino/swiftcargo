import Link from "next/link";
import type { Metadata } from "next";
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
import { formatCbm, formatDate, formatMoney } from "@/lib/format";
import { outstandingOf } from "@/lib/invoice-balance";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { priceListForContainer, priceListWithoutContainer } from "@/lib/price-list";
import { requirePermission } from "@/lib/session";
import { unsailedToPrice } from "@/lib/unsailed-pricing";
import { cn } from "@/lib/utils";
import { cargoTypeOptions } from "@/lib/valuation";
import { localeOf } from "@/lib/viewer-locale";
import { t } from "@/lib/i18n";

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
  pricing: "Waiting for prices",
  history: "History",
  all: "Everything",
} as const;
type View = keyof typeof VIEWS;

export default async function ArrivedContainersPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; q?: string }>;
}) {
  const user = await requirePermission("container.view");
  const { view, q } = await searchParams;

  /* Both warehouses open this page to see what landed. What it was billed,
     collected and spent is Finance's and the books', and a floor that can read
     it is a floor that can be argued with about it — so the figures are not
     drawn at all for a desk without the permission, rather than hidden. */
  const showMoney = can(user.role, "finance.view");
  const showBooks = can(user.role, "accounting.view");

  const query = q?.trim() ?? "";
  const chosen: View = view && view in VIEWS ? (view as View) : "active";

  /* Everything that has sailed. A container still taking cargo in Guangzhou is
     not on this page at all — that is the loading table. */
  const liveRate = await prisma.exchangeRate.findFirst({
    where: { active: true },
    orderBy: { effectiveFrom: "desc" },
    select: { rate: true },
  });
  const today = liveRate ? Number(liveRate.rate) : 0;
  /* A pinned rate of 1 or less means "none was pinned" — no shilling rate is
     anywhere near it — so those fall back to today's. */
  const rateOf = (fx: unknown) => (Number(fx) > 1 ? Number(fx) : today);

  const containers = await prisma.container.findMany({
    where: {
      deletedAt: null,
      status: { in: ["DEPARTED", "IN_TRANSIT", "ARRIVED", "CLOSED"] },
    },
    orderBy: { createdAt: "desc" },
    take: 60,
    include: {
      shipment: {
        select: { vessel: true, actualArrival: true, eta: true, originPort: true },
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
              /* Dar's own volume, not China's. Finance prices on what the
                 receiving counter measured — that is the whole point of the
                 second measurement. */
              darReceiving: { select: { id: true, cbm: true } },
              exceptions: {
                where: { status: { notIn: ["RESOLVED", "CLOSED"] } },
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

  /* Counted at Dar with no container behind it — cargo that was already on the
     Dar floor when this system started. The container rows below can never
     hold it, and the dashboards count it all the same. */
  const unsailed = await unsailedToPrice();

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
    const billed = live.reduce((sum, i) => sum + Number(i.total), 0);
    const owing = live.reduce((sum, i) => sum + Number(outstandingOf(i)), 0);
    /* Shillings are what the desk counts in, so they lead. Each bill converts
       at the rate frozen onto it — the figure its customer was quoted. */
    const billedTzs = live.reduce(
      (sum, i) => sum + Number(i.total) * rateOf(i.fxRate),
      0
    );
    const owingTzs = live.reduce(
      (sum, i) => sum + Number(outstandingOf(i)) * rateOf(i.fxRate),
      0
    );

    /* In USD, at the rate pinned on each cost. Adding shillings to dollars is
       how a sailing reads a thousand times what it spent. */
    const spent = container.expenses.reduce(
      (sum, e) =>
        sum +
        (e.currency === "USD"
          ? Number(e.amount)
          : Number(e.fxRate) > 1
            ? Number(e.amount) / Number(e.fxRate)
            : 0),
      0
    );

    const spentTzs = container.expenses.reduce(
      (sum, e) =>
        sum +
        (e.currency === "TZS"
          ? Number(e.amount)
          : Number(e.amount) * rateOf(e.fxRate)),
      0
    );

    const state: View =
      container.status === "CLOSED"
        ? "history"
        : checkedIn
          ? "checked"
          : container.status === "ARRIVED"
            ? "clearance"
            : "sea";

    return {
      container,
      state,
      cargo: cargo.length,
      counted,
      customers: new Set(cargo.map((c) => c.receiverId)).size,
      cbm: cargo.reduce(
        (sum, c) => sum + Number(c.darReceiving?.cbm ?? 0),
        0
      ),
      flagged: cargo.filter((c) => c.exceptions.length > 0).length,
      /* Counted at Dar with nothing live billed against it — exactly what
         Finance has to price before anybody can be asked for money. */
      toPrice: cargo.filter(
        (c) => c.darReceiving && c.invoices.every((i) => i.status === "DRAFT")
      ).length,
      billed,
      owing,
      collected: billed - owing,
      spent,
      billedTzs,
      owingTzs,
      collectedTzs: billedTzs - owingTzs,
      spentTzs,
      arrived: container.shipment?.actualArrival ?? container.shipment?.eta ?? null,
    };
  });

  const counts: Record<View, number> = {
    /* Landed and not yet closed. A box still on the water is not "active" work
       for anybody in Dar — it is a date — so it lives under In transit only. */
    active: rows.filter((r) => r.state === "clearance" || r.state === "checked")
      .length,
    sea: rows.filter((r) => r.state === "sea").length,
    clearance: rows.filter((r) => r.state === "clearance").length,
    checked: rows.filter((r) => r.state === "checked").length,
    /* Counted at Dar with nothing billed yet — the containers Finance has to
       open and confirm prices on before anybody can be asked for money. */
    /* Plus each consignment with no container behind it: every one of those
       is opened and priced on its own, so each is a thing on the list. */
    pricing: rows.filter((r) => r.toPrice > 0).length + unsailed.length,
    history: rows.filter((r) => r.state === "history").length,
    all: rows.length,
  };

  const shown = rows.filter((r) => {
    if (chosen === "active" && r.state !== "clearance" && r.state !== "checked")
      return false;
    if (chosen === "pricing") {
      if (r.toPrice === 0) return false;
    } else if (chosen !== "active" && chosen !== "all" && r.state !== chosen) return false;
    if (!query) return true;
    const hay =
      `${r.container.reference} ${r.container.shipment?.vessel ?? ""} ${r.container.sealNumber ?? ""}`.toLowerCase();
    return hay.includes(query.toLowerCase());
  });

  const sum = (pick: (r: (typeof rows)[number]) => number) =>
    shown.reduce((total, r) => total + pick(r), 0);

  const tzsPair = (tzs: number, usd: number) => ({
    value: formatMoney(tzs, "TZS"),
    note: formatMoney(usd, "USD"),
  });

  const allStats = [
    {
      label: "Containers",
      value: String(shown.length),
      note: `${sum((r) => r.cargo)} cargo · ${formatCbm(sum((r) => r.cbm))}`,
      tone: "",
    },
    {
      label: "Expected",
      ...tzsPair(sum((r) => r.billedTzs), sum((r) => r.billed)),
      tone: "",
    },
    {
      label: "Collected",
      ...tzsPair(sum((r) => r.collectedTzs), sum((r) => r.collected)),
      tone: "text-success",
    },
    {
      label: "Outstanding",
      ...tzsPair(sum((r) => r.owingTzs), sum((r) => r.owing)),
      tone: "text-destructive",
    },
    {
      label: "Expenses",
      ...tzsPair(sum((r) => r.spentTzs), sum((r) => r.spent)),
      tone: "text-destructive",
    },
    {
      label: "Expected profit",
      ...tzsPair(
        sum((r) => r.billedTzs) - sum((r) => r.spentTzs),
        sum((r) => r.billed) - sum((r) => r.spent)
      ),
      tone: "",
    },
  ];
  const stats = allStats.filter((stat) =>
    stat.label === "Containers"
      ? true
      : stat.label === "Expenses" || stat.label === "Expected profit"
        ? showBooks
        : showMoney
  );

  /*
    THE PRICES THEMSELVES, FOR A DESK THAT MAY SEE MONEY.

    Each container still waiting, and the group with no container, as the same
    list the container page opens with: the rate book's figure on every row,
    the type and the rate correctable on the row, and one press per list.
  */
  const pricing =
    chosen === "pricing" && showMoney
      ? await (async () => {
          const mayConfirm = can(user.role, "invoice.priceConfirm");
          const [locale, cargoTypes, withoutContainer, perContainer] = await Promise.all([
            localeOf(user.id),
            mayConfirm ? cargoTypeOptions() : Promise.resolve([] as string[]),
            priceListWithoutContainer(),
            Promise.all(
              shown.map(async (row) => ({
                row,
                list: await priceListForContainer(row.container.id),
              }))
            ),
          ]);
          return { mayConfirm, locale, cargoTypes, withoutContainer, perContainer };
        })()
      : null;

  const waitingOnFinance =
    rows.filter((r) => r.toPrice > 0).reduce((sum, r) => sum + r.toPrice, 0) +
    unsailed.length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Arrived containers"
        description="Every sailing that has left China. Open one to see its cargo, documents and full timeline."
      />
      <ContainerTabs />

      <div
        className={cn(
          "grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border",
          stats.length >= 6 ? "sm:grid-cols-3 xl:grid-cols-6" : stats.length >= 4 ? "lg:grid-cols-4" : "lg:grid-cols-2"
        )}
      >
        {stats.map((stat) => (
          <div key={stat.label} className="min-w-0 bg-card px-4 py-4">
            <p className="truncate text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
              {stat.label}
            </p>
            <p
              className={cn(
                "tnum mt-1 whitespace-nowrap font-semibold",
                stat.value.length > 15 ? "text-base" : "text-lg",
                stat.tone
              )}
            >
              {stat.value}
            </p>
            <p className="tnum mt-0.5 text-xs text-muted-foreground">
              {stat.note}
            </p>
          </div>
        ))}
      </div>

      {/* THE HAND-OFF, NAMED. Dar has finished counting and nobody has priced
          it — which is the only thing standing between a landed container and
          a customer being asked for money. */}
      {waitingOnFinance > 0 ? (
        <Link
          href="/app/containers/arrived?view=pricing"
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border-l-4 border-l-brand border-y border-r bg-brand/[0.06] px-4 py-3 hover:bg-brand/[0.09]"
        >
          <div className="flex items-start gap-3">
            <Package className="mt-0.5 size-5 shrink-0 text-brand" />
            <div>
              <p className="text-sm font-medium">
                {waitingOnFinance} consignment
                {waitingOnFinance === 1 ? "" : "s"} checked in at Dar and not yet
                priced
              </p>
              <p className="mt-0.5 text-sm text-muted-foreground">
                The floor has finished counting. Finance confirms the price on
                Dar&rsquo;s CBM before anybody is asked for money.
              </p>
            </div>
          </div>
          <span className="text-sm text-brand">Confirm prices →</span>
        </Link>
      ) : null}

      <Card className="space-y-3 p-4">
        <form className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            name="q"
            defaultValue={query}
            placeholder="Search container number, vessel or seal…"
            className="pl-9"
            aria-label="Search containers"
          />
          <input type="hidden" name="view" value={chosen} />
        </form>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(VIEWS) as View[]).map((key) => (
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
              {VIEWS[key]}
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
              locale={pricing.locale}
            />
          ))}
          <PriceList
            heading={
              <span className="font-medium text-foreground">
                {t(pricing.locale, "In Dar with no container on record")}
              </span>
            }
            containerId={null}
            list={pricing.withoutContainer}
            cargoTypes={pricing.cargoTypes}
            canConfirm={pricing.mayConfirm}
            locale={pricing.locale}
          />
          {pricing.perContainer.every(({ list }) => list.rows.length === 0) &&
          pricing.withoutContainer.rows.length === 0 ? (
            <Card>
              <EmptyState
                icon="Ship"
                title={t(pricing.locale, "Nothing is waiting for a price")}
                description={t(
                  pricing.locale,
                  "Cargo appears here as soon as Dar checks it in."
                )}
              />
            </Card>
          ) : null}
        </div>
      ) : null}

      {chosen === "pricing" && !pricing && unsailed.length > 0 ? (
        <Card>
          <div className="border-b px-4 py-3">
            <p className="text-sm font-medium">
              In Dar with no container on record
            </p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Checked in at Dar before this system held its sailing. Open each
              one to raise and confirm its bill.
            </p>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cargo</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead className="text-right">Packages</TableHead>
                <TableHead className="text-right">Volume</TableHead>
                <TableHead className="hidden lg:table-cell">Checked in</TableHead>
                <TableHead className="w-8" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {unsailed.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="p-0">
                    <Link
                      href={`/app/cargo/${item.id}`}
                      className="block px-4 py-3"
                    >
                      <span className="tnum text-sm font-medium">
                        {item.reference}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {item.description}
                      </span>
                      {item.invoices.length > 0 ? (
                        <span className="mt-1 block w-fit rounded-full bg-warning/15 px-2 py-0.5 text-[11px] font-medium text-warning">
                          Draft to confirm
                        </span>
                      ) : null}
                    </Link>
                  </TableCell>
                  <TableCell className="text-sm">
                    {item.receiver.fullName}
                    <span className="block text-xs text-muted-foreground">
                      {item.receiver.code}
                    </span>
                  </TableCell>
                  <TableCell className="tnum text-right text-sm">
                    {item.darReceiving?.packagesCount ?? "—"}
                  </TableCell>
                  <TableCell className="tnum text-right text-sm">
                    {item.darReceiving?.cbm ? formatCbm(item.darReceiving.cbm) : "—"}
                  </TableCell>
                  <TableCell className="tnum hidden whitespace-nowrap text-xs text-muted-foreground lg:table-cell">
                    {item.darReceiving ? formatDate(item.darReceiving.receivedAt) : "—"}
                  </TableCell>
                  <TableCell className="p-0">
                    <Link
                      href={`/app/cargo/${item.id}`}
                      className="flex items-center justify-center px-3 py-3 text-muted-foreground"
                      aria-label={`Open ${item.reference}`}
                    >
                      <ChevronRight className="size-4" />
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      ) : null}

      {/* Nothing on a container to price, and the consignments above are the
          whole answer: an empty table under them reads as "nothing to do". */}
      {pricing || (chosen === "pricing" && shown.length === 0 && unsailed.length > 0) ? null : (
      <Card>
        {shown.length === 0 ? (
          <EmptyState
            icon="Ship"
            title={query ? "Nothing matches" : "Nothing here"}
            description={
              query
                ? "Try the container number, the vessel or the seal."
                : "Containers appear here once they leave Guangzhou. Cargo still waiting in China is on the loading tables."
            }
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Container</TableHead>
                <TableHead>Vessel</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Cargo</TableHead>
                <TableHead className="text-right">Volume</TableHead>
                <TableHead className="hidden lg:table-cell">Arrived</TableHead>
                {showMoney ? (
                  <>
                    <TableHead className="text-right">Expected</TableHead>
                    <TableHead className="text-right">Collected</TableHead>
                    <TableHead className="text-right">Outstanding</TableHead>
                  </>
                ) : null}
                {showBooks ? (
                  <TableHead className="hidden text-right xl:table-cell">
                    Expenses
                  </TableHead>
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
                  <TableCell className="text-sm">
                    {row.container.shipment?.vessel ?? "—"}
                    {row.flagged > 0 ? (
                      <span className="ml-2 text-xs text-destructive">
                        {row.flagged} under investigation
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                    {row.state === "checked"
                      ? "Checked in"
                      : row.state === "clearance"
                        ? `Counting ${row.counted}/${row.cargo}`
                        : row.state === "sea"
                          ? "In transit"
                          : "Closed"}
                    {row.toPrice > 0 ? (
                      <span className="mt-1 block w-fit rounded-full bg-warning/15 px-2 py-0.5 text-[11px] font-medium text-warning">
                        {row.toPrice} to price
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
                  </TableCell>
                  {showMoney ? (
                    <>
                      <TableCell className="tnum text-right text-sm">
                        {row.billed > 0 ? compact(row.billedTzs) : "—"}
                      </TableCell>
                      <TableCell className="tnum text-right text-sm text-success">
                        {row.collected > 0 ? compact(row.collectedTzs) : "—"}
                      </TableCell>
                      <TableCell className="tnum text-right text-sm text-destructive">
                        {row.owing > 0 ? compact(row.owingTzs) : "—"}
                      </TableCell>
                    </>
                  ) : null}
                  {showBooks ? (
                    <TableCell className="tnum hidden text-right text-sm text-destructive xl:table-cell">
                      {row.spent > 0 ? compact(row.spentTzs) : "—"}
                    </TableCell>
                  ) : null}
                  <TableCell className="p-0">
                    <Link
                      href={`/app/containers/${row.container.id}`}
                      className="flex items-center justify-center px-3 py-3 text-muted-foreground"
                      aria-label={`Open ${row.container.reference}`}
                    >
                      <ChevronRight className="size-4" />
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        {shown.length > 0 && (showMoney || showBooks) ? (
          <p className="border-t px-4 py-2 text-right text-xs text-muted-foreground">
            Money columns in thousands (k) and millions (M) of shillings
          </p>
        ) : null}
      </Card>
      )}

      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Boxes className="size-4" />
        Cargo still waiting in China is on the{" "}
        <Link
          href="/app/containers/loading"
          className="text-brand hover:underline"
        >
          loading tables
        </Link>
        .
      </p>
    </div>
  );
}
