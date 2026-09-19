import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Boxes, Headset, MessageSquare, Users } from "lucide-react";
import type { Prisma } from "@prisma/client";

import { ActionPills, type ActionPill } from "@/components/app/action-pills";
import { AttentionCenter, type AttentionItem } from "@/components/app/attention-center";
import { DeskHero } from "@/components/app/desk-hero";
import { KpiCard } from "@/components/app/kpi-card";
import { SectionLabel } from "@/components/app/section-label";
import { BarChart } from "@/components/charts/bar-chart";
import { Donut, SWATCHES, type DonutSlice } from "@/components/charts/donut";
import { FlowBars } from "@/components/charts/flow-bars";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/currency";
import { pillsFor } from "@/lib/desk";
import { formatDate } from "@/lib/format";
import { t } from "@/lib/i18n";
import { viewerLocale } from "@/lib/viewer-locale";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import {
  OPEN_SOURCING,
  darWarehouse,
  followUpQueue,
  sumOwed,
  supportOverview,
  ticketFlowByDay,
  type WarehouseRow,
} from "@/lib/support-desk";
import { cn } from "@/lib/utils";

import { primeLocale } from "@/lib/server-t";
import { Tx } from "@/components/app/tx";
export const metadata: Metadata = { title: "Support desk" };

const PRIORITY_TONE: Record<string, string> = {
  URGENT: "border-destructive/40 text-destructive",
  HIGH: "border-warning/40 text-warning",
  NORMAL: "text-muted-foreground",
  LOW: "text-muted-foreground",
};

/** A bordered link card in the right-hand column. */
function QuickAction({ href, label, hint }: { href: string; label: string; hint: string }) {
  return (
    <Link
      href={href}
      className="focus-ring group rounded-xl border bg-card p-4 shadow-soft transition-colors hover:border-brand/40 hover:bg-secondary/50"
    >
      <p className="font-medium group-hover:text-brand">{label}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
    </Link>
  );
}

/**
 * Shillings lead, dollars follow. The two are printed on separate lines and
 * never added: a dollar bill with no pinned rate has no shilling figure, and
 * converting it at today's board would quote the customer a bill they were
 * never given.
 */
function owedLines(tzs: Prisma.Decimal | null, usd: Prisma.Decimal | null) {
  if (tzs) return { primary: formatCurrency(tzs, "TZS"), secondary: usd ? formatCurrency(usd, "USD") : null };
  if (usd) return { primary: formatCurrency(usd, "USD"), secondary: null };
  return { primary: null, secondary: null };
}

/**
 * The support desk's home.
 *
 * Ordered by what the desk is answerable for: who is waiting on us, then what
 * money is waiting on a phone call, then the wider picture. Everything is a
 * link — this page is a launchpad, not a report.
 */
export default async function SupportHome() {
  await primeLocale();
  const user = await requirePermission("conversation.view");
  /* The dictionary is English-only at launch; the locale is threaded through so
     a Swahili desk is one dictionary away rather than every string on the page. */
  const locale = await viewerLocale();

  // Read the name from the record rather than the session token, which carries
  // whatever it was at sign-in.
  const [me, overview, queue, warehouse, flow, tickets, sourcing] = await Promise.all([
    prisma.user.findUnique({ where: { id: user.id }, select: { name: true } }),
    supportOverview(),
    followUpQueue(),
    darWarehouse(),
    ticketFlowByDay(14),
    prisma.conversation.findMany({
      where: { status: { notIn: ["RESOLVED", "CLOSED"] } },
      orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
      take: 6,
      select: {
        id: true,
        reference: true,
        subject: true,
        priority: true,
        createdAt: true,
        customer: { select: { fullName: true } },
      },
    }),
    prisma.sourcingRequest.findMany({
      where: { status: { in: [...OPEN_SOURCING] } },
      orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
      take: 5,
      select: {
        id: true,
        reference: true,
        product: true,
        contactName: true,
        customer: { select: { fullName: true } },
      },
    }),
  ]);
  const firstName = (me?.name ?? user.name).split(" ")[0];

  const plural = (n: number, one: string, many = `${one}s`) => (n === 1 ? one : many);

  /* ---- Needs your attention ------------------------------------------- */

  const chaseCustomers = new Set(queue.map((row) => row.customerId)).size;
  const chaseTotal = sumOwed(queue);
  const chaseMeta = chaseTotal.tzs.greaterThan(0)
    ? formatCurrency(chaseTotal.tzs, "TZS")
    : chaseTotal.unconvertedUsd.greaterThan(0)
      ? formatCurrency(chaseTotal.unconvertedUsd, "USD")
      : undefined;
  const chaseMetaSub =
    chaseTotal.tzs.greaterThan(0) && chaseTotal.usd.greaterThan(0)
      ? formatCurrency(chaseTotal.usd, "USD")
      : undefined;

  const attention: AttentionItem[] = [
    {
      id: "urgent-tickets",
      group: t(locale, "Tickets"),
      count: overview.urgentTickets,
      title: `${overview.urgentTickets} ${t(locale, plural(overview.urgentTickets, "ticket"))} ${t(locale, "marked urgent")}`,
      detail: t(locale, "A customer is waiting on an answer somebody flagged as important."),
      href: "/app/support/tickets",
      tone: "bad" as const,
    },
    {
      id: "to-chase",
      group: t(locale, "Collections"),
      count: chaseCustomers,
      title: `${chaseCustomers} ${t(locale, plural(chaseCustomers, "customer"))} ${t(locale, "to chase")}`,
      detail: t(locale, "Their cargo has reached Dar, the bill is out, and the money has not arrived."),
      href: "/app/finance/collections?view=outstanding",
      tone: "warn" as const,
      meta: chaseMeta,
      metaSub: chaseMetaSub,
    },
    {
      id: "sent-back",
      group: t(locale, "Collections"),
      count: overview.sentBack,
      title: `${overview.sentBack} ${t(locale, plural(overview.sentBack, "payment"))} ${t(locale, "sent back by Finance")}`,
      detail: t(
        locale,
        "Finance could not verify these. The customer needs ringing before the claim can go up again."
      ),
      href: "/app/finance/collections/sent-back",
      tone: "bad" as const,
      meta: t(locale, "needs a call"),
    },
    {
      id: "with-finance",
      group: t(locale, "Collections"),
      count: overview.withFinance,
      title: `${overview.withFinance} ${t(locale, "with Finance")}`,
      detail: t(locale, "Payments handed up, waiting to be checked. Nothing to do but watch."),
      href: "/app/finance/collections/verify",
      tone: "neutral" as const,
      meta: t(locale, "waiting on Finance"),
    },
    {
      id: "sourcing",
      group: t(locale, "Sourcing"),
      count: overview.openSourcing,
      title: `${overview.openSourcing} ${t(locale, plural(overview.openSourcing, "sourcing request"))} ${t(locale, "open")}`,
      detail: t(locale, "Somebody asked us to find them something in China."),
      href: "/app/support/sourcing",
      tone: "neutral" as const,
    },
    {
      id: "call-backs",
      group: t(locale, "Cases"),
      count: overview.callBacks,
      title: `${overview.callBacks} ${t(locale, plural(overview.callBacks, "case"))} ${t(locale, "waiting on the customer")}`,
      detail: t(locale, "A case is parked until somebody rings them back. That call is this desk's."),
      href: "/app/exceptions",
      tone: "warn" as const,
    },
    {
      id: "website-requests",
      group: t(locale, "Cases"),
      count: overview.websiteRequests,
      title: `${overview.websiteRequests} ${t(locale, plural(overview.websiteRequests, "website request"))}`,
      detail: t(locale, "Pickups asked for on the website that nobody has picked up yet."),
      href: "/app/support/requests",
      tone: "warn" as const,
    },
  ].filter((item) => item.count > 0);

  /* ---- Where the queue is stuck --------------------------------------- */

  const chasing = warehouse.filter((row) => row.owes);
  const settled = warehouse.filter((row) => row.billed && !row.owes);
  const unbilled = warehouse.filter((row) => !row.billed);

  const warehouseOwed = (rows: WarehouseRow[]) =>
    sumOwed(rows.map((row) => ({ owedTzs: row.owedTzs, owedUsd: row.owedUsd })));

  type Slice = { label: string; rows: WarehouseRow[]; tone: DonutSlice["tone"]; href: string | null };
  const slices: Slice[] = [
    { label: "Payment to collect", rows: chasing, tone: 1, href: "/app/finance/collections?view=outstanding" },
    { label: "Paid, not collected", rows: settled, tone: 5, href: "/app/finance/collections?view=ready" },
    /* Only drawn when there is some. A consignment with no live bill is neither
       owed nor paid, and folding it into either slice misstates the floor. */
    { label: "Not billed yet", rows: unbilled, tone: 3, href: null },
  ];
  const split = slices.filter((slice) => slice.rows.length > 0 || slice.href !== null);

  /*
    Storage accrues per day and a customer's patience does not, so the shape of
    this tail is the difference between a busy desk and a bad month. Fixed
    buckets rather than a line: nobody asks "how many were 9 days old", they ask
    "how much of this is over a fortnight".
  */
  const AGE_BUCKETS = [
    { label: "0–3d", min: 0, max: 3 },
    { label: "4–7d", min: 4, max: 7 },
    { label: "8–14d", min: 8, max: 14 },
    { label: "15d+", min: 15, max: Infinity },
  ];
  const ageing = AGE_BUCKETS.map((bucket) => ({
    label: t(locale, bucket.label),
    value: warehouse.filter(
      (row) => row.daysInWarehouse >= bucket.min && row.daysInWarehouse <= bucket.max
    ).length,
  }));
  const stale = warehouse.filter((row) => row.daysInWarehouse >= 15).length;

  const opened = flow.reduce((sum, d) => sum + d.in, 0);
  const closed = flow.reduce((sum, d) => sum + d.out, 0);

  const topOfQueue = queue.slice(0, 6);

  /* The same row the desk's pills are defined in once, so the home and any
     other screen that shows them cannot drift apart. The shell's global dialog
     opens on "#record-payment", over whatever screen the desk is on. */
  const pills: ActionPill[] = pillsFor("CUSTOMER_SUPPORT").map((pill) => ({
    ...pill,
    label: t(locale, pill.label),
  }));

  return (
    <div className="space-y-8">
      <DeskHero
        greeting={t(locale, "Habari")}
        name={firstName}
        department={t(locale, "Support desk")}
        subtitle={t(
          locale,
          "Find cargo by tracking number, a customer's name, the number they are calling from, a container or an invoice."
        )}
        searchAction="/app/search"
        searchPlaceholder={t(locale, "Tracking number, customer name, phone, container or invoice")}
      />

      <ActionPills pills={pills} />

      <div>
        <SectionLabel
          count={attention.length}
          action={{ href: "/app/finance/collections", label: t(locale, "The call list") }}
        >
          {t(locale, "Needs your attention")}
        </SectionLabel>
        <AttentionCenter items={attention} />
      </div>

      {/* Reference, not work — the shape of the desk's day. None of the four
          repeats a figure from the list above; that is what lets them sit this
          close to it. */}
      <div>
        <SectionLabel action={{ href: "/app/customers", label: t(locale, "All customers") }}>
          {t(locale, "The desk · today")}
        </SectionLabel>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard
            label={t(locale, "Customers")}
            numeric={overview.customers}
            hint={t(locale, "On the books")}
            icon={Users}
            tone="brand"
            href="/app/customers"
            index={0}
          />
          <KpiCard
            label={t(locale, "Active cargo")}
            numeric={overview.activeCargo}
            hint={t(locale, "In China, at sea or waiting in Dar")}
            icon={Boxes}
            tone="marine"
            href="/app/cargo"
            index={1}
          />
          <KpiCard
            label={t(locale, "Ready for pickup")}
            numeric={overview.readyForPickup}
            hint={t(locale, "Pickup notes issued and not yet used")}
            icon={Headset}
            tone="success"
            href="/app/finance/pickup-notes"
            index={2}
          />
          <KpiCard
            label={t(locale, "Contacted today")}
            numeric={overview.contactedToday}
            hint={t(locale, "Calls and messages recorded to customers")}
            icon={MessageSquare}
            tone="brand"
            index={3}
          />
        </div>
      </div>

      <div>
        <SectionLabel action={{ href: "/app/finance/collections", label: t(locale, "Full queue") }}>
          {t(locale, "Where the queue is stuck")}
        </SectionLabel>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <section className="rounded-xl border bg-card p-4 shadow-soft">
            <h3 className="text-sm font-semibold">{t(locale, "What the queue is made of")}</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {t(locale, "Every consignment in the Dar warehouse, by whether its money has arrived")}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-5">
              <Donut
                slices={split.map((slice) => ({
                  label: t(locale, slice.label),
                  value: slice.rows.length,
                  tone: slice.tone,
                }))}
                label={String(warehouse.length)}
                caption={t(locale, "in the warehouse")}
              />
              <ul className="min-w-[13rem] flex-1 space-y-1">
                {split.map((slice) => {
                  const owed = warehouseOwed(slice.rows);
                  const figure = owed.tzs.greaterThan(0)
                    ? formatCurrency(owed.tzs, "TZS")
                    : owed.unconvertedUsd.greaterThan(0)
                      ? formatCurrency(owed.unconvertedUsd, "USD")
                      : null;
                  const inner = (
                    <>
                      <span
                        className={cn("size-2.5 shrink-0 rounded-sm", SWATCHES[slice.tone])}
                        aria-hidden
                      />
                      <span className="min-w-0 flex-1 truncate text-xs group-hover:text-brand">
                        {t(locale, slice.label)}
                      </span>
                      <span className="shrink-0 text-right">
                        <span className="tnum block text-sm font-semibold">{slice.rows.length}</span>
                        {figure ? (
                          <span className="tnum block text-xs text-muted-foreground">{figure}</span>
                        ) : null}
                      </span>
                    </>
                  );
                  return (
                    <li key={slice.label}>
                      {slice.href ? (
                        <Link
                          href={slice.href}
                          className="focus-ring group flex items-center gap-2.5 rounded-md px-2 py-1.5 transition-colors hover:bg-secondary/50"
                        >
                          {inner}
                        </Link>
                      ) : (
                        <div className="flex items-center gap-2.5 px-2 py-1.5">{inner}</div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          </section>

          <section className="rounded-xl border bg-card p-4 shadow-soft">
            <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold">{t(locale, "How long they have waited")}</h3>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {t(locale, "Days on the Dar floor since the container was unloaded")}
                </p>
              </div>
              {stale > 0 ? (
                <span className="rounded-full bg-destructive/10 px-2.5 py-1 text-xs font-semibold text-destructive">
                  {stale} {t(locale, "over a fortnight")}
                </span>
              ) : (
                <span className="rounded-full bg-success/10 px-2.5 py-1 text-xs font-semibold text-success">
                  {t(locale, "nothing stale")}
                </span>
              )}
            </div>
            <BarChart
              data={ageing}
              tone={4}
              height={168}
              highlightIndex={ageing.length - 1}
            />
          </section>

          {/* Opened against closed. A desk with forty tickets open is fine if it
              closes forty a day and in trouble if it closes none — and the open
              count on its own reads identically either way. */}
          <section className="rounded-xl border bg-card p-4 shadow-soft">
            <div className="mb-3 flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="text-sm font-semibold">{t(locale, "Opened and closed")}</h3>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {t(locale, "Tickets raised against tickets finished, a fortnight")}
                </p>
              </div>
              <p className="shrink-0 text-right text-xs text-muted-foreground">
                <span className="tnum font-semibold text-foreground">{opened}</span>
                {" / "}
                <span className="tnum font-semibold text-foreground">{closed}</span>
              </p>
            </div>
            <FlowBars
              data={flow}
              height={150}
              inLabel={t(locale, "Opened")}
              outLabel={t(locale, "Closed")}
            />
          </section>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          <section className="rounded-xl border bg-card shadow-soft">
            <header className="flex items-center justify-between gap-3 border-b p-4">
              <div>
                <h2 className="font-semibold">{t(locale, "Call these customers first")}</h2>
                <p className="text-sm text-muted-foreground">
                  {t(locale, "Ranked by what it is costing them and us.")}
                </p>
              </div>
              <Link
                href="/app/finance/collections"
                className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-brand hover:underline"
              >
                {t(locale, "Full queue")}
                <ArrowRight className="size-3.5" />
              </Link>
            </header>
            <ul className="divide-y">
              {topOfQueue.map((row) => {
                const money = owedLines(row.owedTzs, row.owedUsd);
                return (
                  <li key={row.invoiceId}>
                    <Link
                      href={`/app/cargo/${row.cargoId}`}
                      className="flex flex-wrap items-center justify-between gap-3 p-4 transition-colors hover:bg-secondary/50"
                    >
                      <div className="min-w-0">
                        <p className="font-medium">{row.customerName}</p>
                        <p className="truncate font-mono text-xs text-muted-foreground">
                          {row.reference} · <Tx>{row.description}</Tx>
                        </p>
                      </div>
                      <div className="flex items-center gap-4">
                        {row.storageDays > 0 ? (
                          <Badge className="border-destructive/40 bg-transparent text-destructive">
                            {row.storageDays}d {t(locale, "late")}
                          </Badge>
                        ) : null}
                        <div className="text-right">
                          {/* Amber when a claim is with Finance, so this desk
                              does not ring a customer who says they have paid. */}
                          <p
                            className={cn(
                              "text-sm font-medium",
                              row.paymentPending && "text-warning"
                            )}
                          >
                            {row.paymentPending
                              ? t(locale, "Payment with Finance")
                              : `${t(locale, "Chase payment — billed")} ${row.billedDaysAgo} ${t(locale, plural(row.billedDaysAgo, "day"))} ${t(locale, "ago")}`}
                          </p>
                          {money.primary ? (
                            <p className="tnum text-xs text-muted-foreground">
                              {money.primary} {t(locale, "owed")}
                            </p>
                          ) : null}
                          {money.secondary ? (
                            <p className="tnum text-[11px] text-muted-foreground/70">
                              {money.secondary}
                            </p>
                          ) : null}
                        </div>
                      </div>
                    </Link>
                  </li>
                );
              })}
              {topOfQueue.length === 0 ? (
                <li className="p-8 text-center text-sm text-muted-foreground">
                  {t(locale, "Nothing owed on cargo that has reached Dar. Quiet day.")}
                </li>
              ) : null}
            </ul>
          </section>

          <section className="rounded-xl border bg-card shadow-soft">
            <header className="flex items-center justify-between gap-3 border-b p-4">
              <h2 className="font-semibold">{t(locale, "Customers waiting on us")}</h2>
              <Link
                href="/app/support/tickets"
                className="inline-flex items-center gap-1 text-sm font-medium text-brand hover:underline"
              >
                {t(locale, "All tickets")}
                <ArrowRight className="size-3.5" />
              </Link>
            </header>
            <ul className="divide-y">
              {tickets.map((ticket) => (
                <li key={ticket.id}>
                  <Link
                    href={`/app/support/${ticket.id}`}
                    className="flex flex-wrap items-center justify-between gap-3 p-4 transition-colors hover:bg-secondary/50"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">{ticket.subject}</p>
                      <p className="text-xs text-muted-foreground">
                        <span className="font-mono">{ticket.reference}</span> ·{" "}
                        {ticket.customer.fullName} · {formatDate(ticket.createdAt)}
                      </p>
                    </div>
                    <Badge
                      tone="outline"
                      className={PRIORITY_TONE[ticket.priority] ?? ""}
                    >
                      {t(locale, ticket.priority.charAt(0) + ticket.priority.slice(1).toLowerCase())}
                    </Badge>
                  </Link>
                </li>
              ))}
              {tickets.length === 0 ? (
                <li className="p-8 text-center text-sm text-muted-foreground">
                  {t(locale, "No open tickets.")}
                </li>
              ) : null}
            </ul>
          </section>
        </div>

        <div className="space-y-6">
          <div>
            <SectionLabel>{t(locale, "Quick actions")}</SectionLabel>
            <div className="grid gap-3">
              <QuickAction
                href="/app/support/tickets?new=1"
                label={t(locale, "Create a support ticket")}
                hint={t(locale, "Log a call, a complaint or a price inquiry")}
              />
              <QuickAction
                href="/app/support/sourcing?new=1"
                label={t(locale, "Create a sourcing request")}
                hint={t(locale, "Customer wants something found in China")}
              />
              <QuickAction
                href="/app/finance/collections?view=outstanding"
                label={t(locale, "Chase a payment")}
                hint={t(locale, "Cargo that has been billed and is still unpaid")}
              />
              <QuickAction
                href="/app/customers"
                label={t(locale, "Open a customer profile")}
                hint={t(locale, "History, balance, previous invoices")}
              />
              <QuickAction
                href="/app/support/markets"
                label={t(locale, "China markets directory")}
                hint={t(locale, "Recommend the right market for their goods")}
              />
            </div>
          </div>

          <section className="rounded-xl border bg-card shadow-soft">
            <header className="border-b p-4">
              <h2 className="font-semibold">{t(locale, "Sourcing in progress")}</h2>
            </header>
            <ul className="divide-y">
              {sourcing.map((request) => (
                <li key={request.id}>
                  <Link
                    href={`/app/support/sourcing/${request.id}`}
                    className="block p-4 transition-colors hover:bg-secondary/50"
                  >
                    <p className="truncate text-sm font-medium">{request.product}</p>
                    <p className="text-xs text-muted-foreground">
                      <span className="font-mono">{request.reference}</span> ·{" "}
                      {request.customer?.fullName ?? request.contactName ?? t(locale, "Unknown")}
                    </p>
                  </Link>
                </li>
              ))}
              {sourcing.length === 0 ? (
                <li className="p-6 text-center text-sm text-muted-foreground">
                  {t(locale, "No open requests.")}
                </li>
              ) : null}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
