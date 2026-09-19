import Link from "next/link";

import { PriceChanged, type PriceChange } from "@/components/app/price-changed";
import { bookCategories } from "@/lib/rate-categories";
import type { Metadata } from "next";
import {
  FileText,
  Package,
  Search,
  type LucideIcon,
} from "lucide-react";

import { EmptyState } from "@/components/app/empty-state";
import { CollectionsHeader } from "@/components/app/collections-header";
import { CreditIcon, DownloadIcon, PaymentIcon, RateIcon } from "@/components/app/bill-dialogs";
import { RecordPaymentButton } from "@/components/app/record-payment-button";
import { WhatsAppButton } from "@/components/app/whatsapp-button";
import { AgreedRate } from "@/components/app/agreed-rate";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { formatDate, formatMoney } from "@/lib/format";
import { balanceOf, outstandingOf } from "@/lib/invoice-balance";
import { billLetter, composeMessage, messageStage, whatsappNumber } from "@/lib/messages";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { requirePermission } from "@/lib/session";
import { storagePosition } from "@/lib/storage-fee";
import { cn } from "@/lib/utils";
import { storageStart } from "@/lib/storage-clock";

import { primeLocale, T } from "@/lib/server-t";
import { Tx } from "@/components/app/tx";
export const metadata: Metadata = { title: "Payment follow-up" };

/** One square in the row. Same size as every other, coloured by what it does. */
function IconLink({
  href,
  icon: Icon,
  label,
  tone,
}: {
  href: string;
  icon: LucideIcon;
  label: string;
  tone: string;
}) {
  return (
    <Link
      href={href}
      title={label}
      className={cn(
        "relative inline-flex size-9 items-center justify-center rounded-md border transition-colors",
        tone
      )}
    >
      <Icon className="size-4" />
      <span className="sr-only">{label}</span>
    </Link>
  );
}

const SORTS = {
  newest: "Newest first",
  waiting: "Waiting longest",
  owed: "Most owed",
  urgent: "Most urgent",
} as const;
type Sort = keyof typeof SORTS;

const VIEWS = {
  all: "Everything",
  outstanding: "Cash outstanding",
  verify: "Payment to verify",
  credit: "Credit outstanding",
  overdue: "Overdue",
  today: "Due today",
  week: "Due this week",
  partly: "Partly paid",
  ready: "Ready for pickup",
  storage: "Overdue storage",
  untold: "Never called",
} as const;
type View = keyof typeof VIEWS;

const SORT_ORDER: Sort[] = ["newest", "waiting", "owed", "urgent"];

/**
 * THE CALL LIST.
 *
 * Everybody who owes money, how long they have owed it, and what was said to
 * them last. Sorted by what the desk is actually deciding — who to ring first —
 * rather than by when the bill happened to be raised.
 *
 * The WhatsApp button composes the message from the record, so nobody retypes a
 * figure into a phone. "Never called" is its own filter because a bill the
 * customer has not been shown is not a debt, it is a filing error.
 */
export default async function CollectionsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; view?: string; sort?: string }>;
}) {
  await primeLocale();
  const user = await requirePermission("finance.view");
  const mayReprice = can(user.role, "invoice.discount");
  const mayRecord = can(user.role, "payment.submit");
  /* Releasing on credit writes the pickup note, which only Finance may do. */
  const mayCredit = can(user.role, "payment.verify");
  const { q, view, sort } = await searchParams;
  const query = q?.trim() ?? "";
  const chosen: View = view && view in VIEWS ? (view as View) : "all";
  const order: Sort = sort && sort in SORTS ? (sort as Sort) : "newest";

  /* The storage line on the message comes from settings, so a rate change
     reaches every message without anybody editing a template. */
  const settings = await prisma.companySetting.findUnique({
    where: { id: "singleton" },
    select: { freeStorageDays: true, storagePerDay: true, storageCurrency: true },
  });

  const invoices = await prisma.invoice.findMany({
    where: {
      status: { in: ["ISSUED", "PARTIALLY_PAID", "OVERDUE"] },
      ...(query
        ? {
            OR: [
              { number: { contains: query, mode: "insensitive" as const } },
              {
                cargo: {
                  reference: { contains: query, mode: "insensitive" as const },
                },
              },
              {
                customer: {
                  OR: [
                    { fullName: { contains: query, mode: "insensitive" as const } },
                    { phone: { contains: query } },
                  ],
                },
              },
            ],
          }
        : {}),
    },
    include: {
      customer: { select: { id: true, fullName: true, phone: true } },
      payments: true,
      items: { select: { unit: true, category: true, quantity: true } },
      cargo: {
        select: {
          id: true,
          reference: true,
          description: true,
          status: true,
          clearedAt: true,
          commodity: true,
          chinaReceiving: { select: { cbm: true } },
          packages: { where: { deletedAt: null }, select: { id: true, cargoType: true } },
          pickupNote: { select: { status: true, onCredit: true } },
          darReceiving: { select: { receivedAt: true, cbm: true } },
          contacts: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: { createdAt: true },
          },
          containerLines: {
            take: 1,
            orderBy: { createdAt: "desc" },
            include: { container: { select: { reference: true } } },
          },
        },
      },
    },
  });

  /*
    WHAT MOVED EACH PRICE — AND NOTHING WHEN NOTHING DID.

    Category: a category that was replaced by another, on the cargo before the
    bill or on the bill after. A category being set for the first time is not a
    change of price. Volume: re-priced on the bill, or Dar's measurement
    differing from China's. Rate: an agreed rate beside the book's.
  */
  const cargoOf = (invoice: (typeof invoices)[number]) => invoice.cargo;
  const categoryOf = (invoice: (typeof invoices)[number]) => {
    const c = cargoOf(invoice);
    if (c.packages.length === 0) return c.commodity ?? null;
    const types = [...new Set(c.packages.map((p) => p.cargoType))];
    return types.length === 1 ? types[0] : null;
  };
  const history = await prisma.fieldChange.findMany({
    where: {
      OR: [
        { entity: "Invoice", field: { in: ["cargoType", "billableCbm"] }, entityId: { in: invoices.map((i) => i.id) } },
        { entity: "Cargo", field: "commodity", entityId: { in: invoices.map((i) => i.cargo.id) } },
        {
          entity: "CargoPackage",
          field: "cargoType",
          entityId: { in: invoices.flatMap((i) => i.cargo.packages.map((p) => p.id)) },
        },
      ],
    },
    orderBy: { createdAt: "asc" },
    select: { entityId: true, field: true, oldValue: true },
  });
  const changeOf = (invoice: (typeof invoices)[number]): PriceChange => {
    const c = cargoOf(invoice);
    const ids = new Set([invoice.id, c.id, ...c.packages.map((p) => p.id)]);
    const mine = history.filter((h) => ids.has(h.entityId));
    const nowCategory = categoryOf(invoice);
    const wasCategory = mine.find(
      (h) => (h.field === "cargoType" || h.field === "commodity") && h.oldValue
    )?.oldValue;

    const billed = invoice.billableCbm ? Number(invoice.billableCbm) : null;
    const rebilled = mine.find((h) => h.field === "billableCbm" && h.oldValue);
    const china = c.chinaReceiving?.cbm ? Number(c.chinaReceiving.cbm) : null;
    const dar = c.darReceiving?.cbm ? Number(c.darReceiving.cbm) : null;
    const cbm =
      rebilled && billed !== null && Math.abs(Number(rebilled.oldValue) - billed) > 0.0005
        ? { from: Number(rebilled.oldValue), to: billed }
        : china !== null && dar !== null && Math.abs(china - dar) > 0.0005
          ? { from: china, to: dar }
          : null;

    const std = invoice.standardRate ? Number(invoice.standardRate) : null;
    const applied = invoice.appliedRate ? Number(invoice.appliedRate) : null;
    return {
      category:
        wasCategory && nowCategory && wasCategory !== nowCategory
          ? { from: wasCategory, to: nowCategory }
          : null,
      cbm,
      rate: std !== null && applied !== null && Math.abs(std - applied) > 0.005 ? { from: std, to: applied } : null,
      currency: invoice.currency,
    };
  };

  /* The rate book's categories, for the price dialog. */
  const categories = await bookCategories();

  const now = Date.now();
  const today = await prisma.exchangeRate.findFirst({
    where: { active: true },
    orderBy: { effectiveFrom: "desc" },
    select: { rate: true },
  });
  const todayRate = today ? Number(today.rate) : 0;
  /* Each bill at the rate frozen onto it — what its customer was quoted. */
  const rateOf = (fx: unknown) => (Number(fx) > 1 ? Number(fx) : todayRate);

  const rows = invoices
    .map((invoice) => {
      const balance = balanceOf(invoice);
      const owing = Number(balance.outstanding);
      return {
        invoice,
        owing,
        /* Whole shillings from the balance itself, not dollars times a rate
           after the fact — the two differ by the shillings a cent cannot hold. */
        owingTzs: balance.outstandingTzs
          ? Number(balance.outstandingTzs)
          : Math.round(owing * rateOf(invoice.fxRate)),
        paid: Number(balance.paid),
        lastContact: invoice.cargo.contacts[0] ?? null,
        pending: invoice.payments.some((p) => p.status === "PENDING"),
                      pendingPaymentId: invoice.payments.find((p) => p.status === "PENDING")?.id ?? null,
        ready: invoice.cargo.pickupNote?.status === "ACTIVE",
        /* Released on credit and still owed — the goods left before the money
           arrived, which is a different conversation from an ordinary debt. */
        credit: Boolean(invoice.cargo.pickupNote?.onCredit),
        rate: rateOf(invoice.fxRate),
        storage: Number(
          storagePosition({
            receivedAt: storageStart(invoice.cargo.darReceiving?.receivedAt, invoice.cargo.clearedAt),
            collectedAt: null,
            freeDays: settings?.freeStorageDays ?? 0,
            perDay: settings?.storagePerDay ?? 0,
            currency: settings?.storageCurrency ?? "USD",
          }).amount
        ),
        dueDays:
          invoice.dueAt
            ? Math.ceil((invoice.dueAt.getTime() - now) / 86_400_000)
            : null,
        daysSince: invoice.issuedAt
          ? Math.floor((now - invoice.issuedAt.getTime()) / 86_400_000)
          : 0,
        late:
          invoice.dueAt && invoice.dueAt.getTime() < now
            ? Math.floor((now - invoice.dueAt.getTime()) / 86_400_000)
            : 0,
      };
    })
    .filter((row) => row.owing > 0);

  const matches = (row: (typeof rows)[number], key: View) => {
    switch (key) {
      case "all":
        return true;
      /* Owed and nobody has claimed to have sent anything — the rows a call
         actually changes. */
      case "outstanding":
        return !row.pending && !row.credit;
      case "verify":
        return row.pending;
      case "credit":
        return row.credit;
      case "storage":
        return row.storage > 0;
      case "overdue":
        return row.late > 0;
      case "today":
        return row.dueDays === 0;
      case "week":
        return row.dueDays !== null && row.dueDays >= 0 && row.dueDays <= 7;
      case "partly":
        return row.paid > 0;
      case "ready":
        return row.ready;
      case "untold":
        return !row.lastContact;
    }
  };

  const shown = rows
    .filter((row) => matches(row, chosen))
    .sort((a, b) => {
      if (order === "waiting") return b.daysSince - a.daysSince;
      /* Late first, then longest waiting, then most money — the order a
         manager would ring them in. */
      if (order === "urgent")
        return b.late - a.late || b.daysSince - a.daysSince || b.owing - a.owing;
      if (order === "newest")
        return (
          (b.invoice.issuedAt?.getTime() ?? 0) -
          (a.invoice.issuedAt?.getTime() ?? 0)
        );
      return b.owing - a.owing;
    });

  const overdue = rows.filter((r) => r.late > 0).length;

  /* Landed in Dar with no bill out: money nobody can chase until its price is
     confirmed, so it is named here rather than missing from the list. */
  const unpricedLanded = await prisma.cargo.count({
    where: {
      deletedAt: null,
      status: { in: ["ARRIVED_TANZANIA", "RECEIVED_DAR"] },
      invoices: { none: { status: { notIn: ["DRAFT", "CANCELLED"] } } },
    },
  });

  return (
    <div className="space-y-6">
      <CollectionsHeader
        recordPayment={<RecordPaymentButton />}
        canVerify={can(user.role, "payment.verify")}
      />

      {unpricedLanded > 0 ? (
        <Link
          href="/app/containers/arrived"
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-warning/40 bg-warning/5 px-4 py-3 text-sm hover:bg-warning/10"
        >
          <span>
            <span className="font-semibold text-warning">{unpricedLanded}</span>{" "}
            consignment{unpricedLanded === 1 ? " has" : "s have"} arrived in Dar with no
            invoice yet — confirm the price to start collecting.
          </span>
          <span className="font-medium text-brand">Confirm prices →</span>
        </Link>
      ) : null}

      {/*
        ONE CARD: FIND, ORDER, NARROW, THEN THE MONEY IT COMES TO.

        The figures under the filters are the figures for what is selected, so
        they sit beneath them in the same frame rather than floating above as
        separate boxes that look like four unrelated things.
      */}
      <div className="overflow-hidden rounded-xl border bg-card">
        <form className="flex gap-2 border-b p-4">
          <input type="hidden" name="view" value={chosen} />
          <input type="hidden" name="sort" value={order} />
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              name="q"
              defaultValue={query}
              placeholder={T("Customer, tracking number, invoice or phone…")}
              className="pl-9"
              aria-label={T("Search the call list")}
            />
          </div>
          <Button type="submit" variant="outline">
            {T("Search")}
          </Button>
        </form>

        <div className="space-y-3 border-b px-4 py-3">
          <div className="inline-flex overflow-hidden rounded-md border">
            {SORT_ORDER.map((key) => (
              <Link
                key={key}
                href={`/app/finance/collections?view=${chosen}&sort=${key}${query ? `&q=${encodeURIComponent(query)}` : ""}`}
                className={cn(
                  "border-r px-3 py-1.5 text-sm transition-colors last:border-r-0",
                  order === key
                    ? "bg-foreground font-medium text-background"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                )}
              >
                {SORTS[key]}
              </Link>
            ))}
          </div>

          <div className="relative overflow-x-auto">
            <div className="inline-flex min-w-max overflow-hidden rounded-md border">
              {(Object.keys(VIEWS) as View[]).map((key) => {
                const n = rows.filter((r) => matches(r, key)).length;
                return (
                  <Link
                    key={key}
                    href={`/app/finance/collections?view=${key}&sort=${order}${query ? `&q=${encodeURIComponent(query)}` : ""}`}
                    className={cn(
                      "inline-flex items-center gap-2 border-r px-3 py-1.5 text-sm transition-colors last:border-r-0",
                      chosen === key
                        ? "bg-brand text-brand-foreground"
                        : key === "verify" && n > 0
                          ? "text-warning hover:bg-secondary"
                          : "text-foreground hover:bg-secondary"
                    )}
                  >
                    {VIEWS[key]}
                    <span className="tnum text-xs opacity-70">{n}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 px-4 py-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            {
              label: "Cash owed",
              usd: rows.filter((r) => !r.credit).reduce((t, r) => t + r.owing, 0),
              tzs: rows
                .filter((r) => !r.credit)
                .reduce((t, r) => t + r.owingTzs, 0),
              tone: "text-destructive",
            },
            {
              label: "Credit owed",
              usd: rows.filter((r) => r.credit).reduce((t, r) => t + r.owing, 0),
              tzs: rows
                .filter((r) => r.credit)
                .reduce((t, r) => t + r.owingTzs, 0),
              tone: "text-brand",
            },
            {
              label: "Overdue",
              usd: rows.filter((r) => r.late > 0).reduce((t, r) => t + r.owing, 0),
              tzs: rows
                .filter((r) => r.late > 0)
                .reduce((t, r) => t + r.owingTzs, 0),
              tone: overdue > 0 ? "text-destructive" : "text-muted-foreground",
            },
            {
              label: "Storage so far",
              usd: rows.reduce((t, r) => t + r.storage, 0),
              tzs: rows.reduce((t, r) => t + r.storage * r.rate, 0),
              tone: "text-foreground",
            },
          ].map((stat) => (
            <div key={stat.label}>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                <Tx>{stat.label}</Tx>
              </p>
              <p className={cn("tnum mt-1 text-2xl font-semibold", stat.tone)}>
                {formatMoney(stat.tzs, "TZS")}
              </p>
              <p className="tnum text-xs text-muted-foreground">
                {formatMoney(stat.usd, "USD")}
              </p>
            </div>
          ))}
        </div>

        <p className="flex flex-wrap gap-x-5 gap-y-1 border-t px-4 py-3 text-xs text-muted-foreground">
          <span className="tnum">
            <span className="font-semibold text-foreground">{shown.length}</span>{" "}
            on this list
          </span>
          <span className="tnum">
            Due today{" "}
            <span className="font-semibold text-foreground">
              {formatMoney(
                rows
                  .filter((r) => r.dueDays === 0)
                  .reduce((t, r) => t + r.owingTzs, 0),
                "TZS"
              )}
            </span>
          </span>
          <span className="tnum">
            Due this week{" "}
            <span className="font-semibold text-foreground">
              {formatMoney(
                rows
                  .filter(
                    (r) => r.dueDays !== null && r.dueDays >= 0 && r.dueDays <= 7
                  )
                  .reduce((t, r) => t + r.owingTzs, 0),
                "TZS"
              )}
            </span>
          </span>
          <span>{T("Storage is not yet on the bill until Finance adds it.")}</span>
        </p>
      </div>

      <Card>
        {shown.length === 0 ? (
          <EmptyState
            icon="Banknote"
            title={query ? T("Nothing matches") : T("Nobody owes anything")}
            description={
              query
                ? T("Try a phone number, or the tracking number.")
                : T("Every confirmed bill has been settled in full.")
            }
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{T("Customer")}</TableHead>
                <TableHead>{T("Cargo")}</TableHead>
                <TableHead className="text-right">{T("Waiting")}</TableHead>
                <TableHead className="text-right">{T("Owed")}</TableHead>
                <TableHead>{T("Next action")}</TableHead>
                <TableHead className="text-right">{T("Reach them")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {shown.map((row) => (
                <TableRow key={row.invoice.id}>
                  <TableCell className="text-sm font-semibold">
                    {row.invoice.customer.fullName}
                    <span className="tnum block text-xs font-normal text-muted-foreground">
                      {row.invoice.customer.phone}
                    </span>
                  </TableCell>
                  <TableCell>
                    {/* The tracking number and its container, nothing else: the
                        goods and the rest are one press away on the cargo. */}
                    <Link
                      href={`/app/cargo/${row.invoice.cargo.id}`}
                      className="tnum font-mono text-sm hover:underline"
                    >
                      {row.invoice.cargo.reference}
                      {row.invoice.cargo.containerLines[0] ? (
                        <span className="text-muted-foreground">
                          {" "}({row.invoice.cargo.containerLines[0].container.reference})
                        </span>
                      ) : null}
                    </Link>
                    <PriceChanged className="mt-1" change={changeOf(row.invoice)} />
                  </TableCell>
                  <TableCell className="tnum text-right text-sm">
                    {row.daysSince}d
                    {row.late > 0 ? (
                      <Badge tone="bad" className="ml-1.5">
                        {row.late}d late
                      </Badge>
                    ) : null}
                  </TableCell>
                  {/* THE SHILLINGS FIGURE IS WHAT THEY WILL ACTUALLY HAND
                      OVER, at the rate pinned on this bill — never today's. */}
                  <TableCell className="tnum text-right text-sm font-semibold text-destructive">
                    {row.invoice.fxRate
                      ? formatMoney(row.owingTzs, "TZS")
                      : formatMoney(row.owing, row.invoice.currency)}
                    <span className="block text-xs font-normal text-muted-foreground">
                      {formatMoney(row.owing, row.invoice.currency)}
                      {row.paid > 0
                        ? ` · ${formatMoney(row.paid, row.invoice.currency)} paid`
                        : ""}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm">
                    <span
                      className={
                        row.pending
                          ? "font-medium text-warning"
                          : row.lastContact
                            ? "font-medium"
                            : "font-medium text-signal"
                      }
                    >
                      {row.pending
                        ? "Payment to verify"
                        : row.lastContact
                          ? "Payment to collect"
                          : "Never called — tell them"}
                    </span>
                    <Link
                      href={`/app/finance/invoices/${row.invoice.id}`}
                      className="tnum block text-xs text-primary hover:underline"
                    >
                      {row.invoice.number}
                    </Link>
                  </TableCell>
                  {/*
                    SEVEN SQUARES, ALL THE SAME SIZE.

                    Everything a clerk does from this row, in the order they do
                    it: look at the goods, ring the customer, argue about the
                    rate, take the money, take something off, save the bill,
                    read the bill. Equal weight because the desk does not have a
                    favourite — a wide text button beside small icons says one
                    of them matters more, and it does not.
                  */}
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <IconLink
                        href={`/app/cargo/${row.invoice.cargo.id}`}
                        icon={Package}
                        label={`The cargo — ${row.invoice.cargo.reference}`}
                        tone="text-marine border-marine/40 hover:bg-marine/10"
                      />
                      <WhatsAppButton
                        iconOnly
                        cargoId={row.invoice.cargo.id}
                        invoiceId={row.invoice.id}
                        phone={whatsappNumber(row.invoice.customer.phone)}
                        kind={billLetter(
                          messageStage({
                            status: row.invoice.cargo.status,
                            hasDarReceiving: row.invoice.cargo.darReceiving !== null,
                            clearedAt: row.invoice.cargo.clearedAt,
                          }),
                          true
                        )}
                        label={
                          row.lastContact
                            ? `Chase ${row.invoice.customer.fullName}`
                            : `Tell ${row.invoice.customer.fullName}`
                        }
                        message={composeMessage(billLetter(
                          messageStage({
                            status: row.invoice.cargo.status,
                            hasDarReceiving: row.invoice.cargo.darReceiving !== null,
                            clearedAt: row.invoice.cargo.clearedAt,
                          }),
                          true
                        ), {
                          customerName: row.invoice.customer.fullName,
                          reference: row.invoice.cargo.reference,
                          description: row.invoice.cargo.description,
                          invoiceNumber: row.invoice.number,
                          stage: messageStage({
                            status: row.invoice.cargo.status,
                            hasDarReceiving: row.invoice.cargo.darReceiving !== null,
                            clearedAt: row.invoice.cargo.clearedAt,
                          }),
                          /* Raw figures, not formatted ones: the template adds
                             the currency word itself, and formatMoney would put
                             a second symbol in beside it. */
                          currency: row.invoice.currency,
                          amount: row.owing.toLocaleString("en-US", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          }),
                          amountTzs: row.invoice.fxRate
                            ? row.owingTzs.toLocaleString("en-US")
                            : null,
                          cbm: row.invoice.billableCbm
                            ? Number(row.invoice.billableCbm).toFixed(3)
                            : null,
                          ratePerCbm: row.invoice.appliedRate
                            ? Number(row.invoice.appliedRate).toFixed(2)
                            : null,
                          fxRate: row.invoice.fxRate
                            ? Number(row.invoice.fxRate).toLocaleString("en-US")
                            : null,
                          freeStorageDays: settings?.freeStorageDays ?? null,
                          storagePerDay:
                            settings && Number(settings.storagePerDay) > 0
                              ? Number(settings.storagePerDay).toString()
                              : null,
                          storageCurrency: settings?.storageCurrency ?? "USD",
                          storageFrom: storageStart(
                            row.invoice.cargo.darReceiving?.receivedAt,
                            row.invoice.cargo.clearedAt
                          ),
                        })}
                      />
                      {mayReprice ? (
                        <RateIcon
                          invoiceId={row.invoice.id}
                          standardRate={row.invoice.standardRate ? Number(row.invoice.standardRate) : null}
                          appliedRate={row.invoice.appliedRate ? Number(row.invoice.appliedRate) : null}
                          cbm={row.invoice.billableCbm ? Number(row.invoice.billableCbm) : null}
                          category={categoryOf(row.invoice)}
                          categories={categories}
                        />
                      ) : null}
                      {mayRecord && !row.pending ? <PaymentIcon invoiceId={row.invoice.id} /> : null}
                      {mayCredit ? (
                        <CreditIcon
                          cargoId={row.invoice.cargo.id}
                          cargoReference={row.invoice.cargo.reference}
                          customer={row.invoice.customer.fullName}
                          invoiceNumber={row.invoice.number}
                          amountLabel={formatMoney(row.owingTzs, "TZS")}
                          onCredit={row.credit}
                        />
                      ) : null}
                      <DownloadIcon invoiceId={row.invoice.id} number={row.invoice.number} />
                      <IconLink
                        href={`/app/finance/invoices/${row.invoice.id}`}
                        icon={FileText}
                        label={T("Open the bill")}
                        tone="text-warning border-warning/40 hover:bg-warning/10"
                      />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
