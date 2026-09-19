import Link from "next/link";
import type { Metadata } from "next";
import type { Prisma } from "@prisma/client";

import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { SectionTabs } from "@/components/app/section-tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import {
  auditActionLabel,
  auditSentence,
  type AuditContext,
} from "@/lib/audit-humanise";
import { ROLE_LABELS } from "@/lib/constants";
import { formatDateTime } from "@/lib/format";
import { t } from "@/lib/i18n";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { localeOf } from "@/lib/viewer-locale";

import { primeLocale } from "@/lib/server-t";
export const metadata: Metadata = { title: "Audit log" };

const PAGE_SIZE = 60;

/**
 * The records a line can be about, in the words the business uses. Anything
 * written against an entity not named here still appears in the picker under
 * its own name, so a new kind of record is never silently unfilterable.
 */
const ENTITY_LABELS: Record<string, string> = {
  Cargo: "Cargo",
  CargoPackage: "Package lines",
  Container: "Containers",
  Shipment: "Sailings",
  PackingList: "Packing lists",
  Invoice: "Invoices",
  Payment: "Payments",
  PickupNote: "Pickup notes",
  DeliveryNote: "Delivery notes",
  Customer: "Customers",
  ExceptionCase: "Issues & claims",
  ContainerExpense: "Expenses",
  Expense: "Expense reviews",
  AccountTransfer: "Transfers",
  BankAccount: "Accounts",
  PayrollRun: "Payroll",
  ExchangeRate: "Exchange rate",
  ShippingRate: "Rate book",
  CompanySetting: "Company settings",
  Warehouse: "Warehouses",
  Market: "China markets",
  User: "Staff",
  PickupRequest: "Pickup requests",
  ContainerBooking: "Bookings",
  QuoteRequest: "Quote requests",
};

/* Dates are typed as the Dar office reads a calendar, not as the server's. */
function darDay(value: string | undefined, endOfDay: boolean) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const at = new Date(`${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}+03:00`);
  return Number.isNaN(at.getTime()) ? null : at;
}

/**
 * Who did what, across the whole system.
 *
 * Append-only and never edited, so this page is read-only by construction —
 * there is deliberately no way to remove a line from it, including for the
 * owner. The same table the money audit reads, unnarrowed.
 */
export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    who?: string;
    entity?: string;
    from?: string;
    to?: string;
    page?: string;
  }>;
}) {
  await primeLocale();
  const user = await requirePermission("audit.view");
  const locale = await localeOf(user.id);
  const params = await searchParams;
  const query = params.q?.trim() ?? "";
  const page = Math.max(1, Number(params.page) || 1);
  const from = darDay(params.from, false);
  const to = darDay(params.to, true);

  const where: Prisma.AuditLogWhereInput = {
    ...(params.who ? { actorId: params.who } : {}),
    ...(params.entity ? { entity: params.entity } : {}),
    ...(from || to
      ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } }
      : {}),
    ...(query
      ? {
          OR: [
            { summary: { contains: query, mode: "insensitive" as const } },
            { action: { contains: query, mode: "insensitive" as const } },
            { actorEmail: { contains: query, mode: "insensitive" as const } },
            { entityId: { contains: query } },
          ],
        }
      : {}),
  };

  const [entries, total, actors, entities] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { actor: { select: { name: true } } },
    }),
    prisma.auditLog.count({ where }),
    /* Only people who have a line in the log. A name in the picker that can
       only ever return "Nothing recorded" is a question already answered. */
    prisma.user.findMany({
      where: { auditLogs: { some: {} } },
      orderBy: { name: "asc" },
      select: { id: true, name: true, role: true },
    }),
    prisma.auditLog.groupBy({ by: ["entity"], orderBy: { entity: "asc" } }),
  ]);

  /* Which consignment a bill belongs to is the first thing anybody asks of a
     line that names only an invoice number, so it is looked up once per page. */
  const idsOf = (entity: string) => [
    ...new Set(
      entries
        .filter((e) => e.entity === entity && e.entityId)
        .map((e) => e.entityId as string)
    ),
  ];
  const [invoices, payments, containers] = await Promise.all([
    prisma.invoice.findMany({
      where: { id: { in: idsOf("Invoice") } },
      select: { id: true, number: true, currency: true, cargo: { select: { reference: true } } },
    }),
    prisma.payment.findMany({
      where: { id: { in: idsOf("Payment") } },
      select: {
        id: true,
        invoice: { select: { number: true, currency: true, cargo: { select: { reference: true } } } },
      },
    }),
    prisma.container.findMany({
      where: { id: { in: idsOf("Container") } },
      select: { id: true, reference: true },
    }),
  ]);
  const context = new Map<string, AuditContext>();
  for (const i of invoices) {
    context.set(`Invoice:${i.id}`, {
      invoiceNumber: i.number,
      cargoReference: i.cargo.reference,
      currency: i.currency,
    });
  }
  for (const p of payments) {
    context.set(`Payment:${p.id}`, {
      invoiceNumber: p.invoice.number,
      cargoReference: p.invoice.cargo.reference,
      currency: p.invoice.currency,
    });
  }
  for (const c of containers) {
    context.set(`Container:${c.id}`, { containerReference: c.reference });
  }

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const filtered = Boolean(query || params.who || params.entity || from || to);
  const linkFor = (nextPage: number) => {
    const qs = new URLSearchParams();
    if (query) qs.set("q", query);
    if (params.who) qs.set("who", params.who);
    if (params.entity) qs.set("entity", params.entity);
    if (from && params.from) qs.set("from", params.from);
    if (to && params.to) qs.set("to", params.to);
    if (nextPage > 1) qs.set("page", String(nextPage));
    const s = qs.toString();
    return s ? `/app/admin/audit?${s}` : "/app/admin/audit";
  };
  const entityName = (entity: string) =>
    t(locale, ENTITY_LABELS[entity] ?? entity.replace(/([a-z])([A-Z])/g, "$1 $2"));

  return (
    <div className="space-y-6">
      <PageHeader
        title={t(locale, "Audit log")}
        description={t(
          locale,
          "Append-only. Every privileged action, who did it, and when. Nothing here can be edited or removed, including by the owner."
        )}
      />
      <SectionTabs />

      <form
        action="/app/admin/audit"
        className="flex flex-wrap gap-2 rounded-xl border bg-card p-3 shadow-soft"
      >
        <Input
          name="q"
          defaultValue={query}
          placeholder={t(locale, "Search what happened, or a reference")}
          className="min-w-[14rem] flex-[2]"
          aria-label={t(locale, "Search the audit log")}
        />
        <NativeSelect
          name="who"
          defaultValue={params.who ?? ""}
          aria-label={t(locale, "Who")}
          className="min-w-[12rem] flex-1"
        >
          <option value="">{t(locale, "Everybody")}</option>
          {actors.map((actor) => (
            <option key={actor.id} value={actor.id}>
              {actor.name} · {t(locale, ROLE_LABELS[actor.role])}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect
          name="entity"
          defaultValue={params.entity ?? ""}
          aria-label={t(locale, "What")}
          className="min-w-[10rem] flex-1"
        >
          <option value="">{t(locale, "All records")}</option>
          {entities.map((row) => (
            <option key={row.entity} value={row.entity}>
              {entityName(row.entity)}
            </option>
          ))}
        </NativeSelect>
        <Input
          type="date"
          name="from"
          defaultValue={from ? params.from : ""}
          aria-label={t(locale, "From")}
          title={t(locale, "From")}
          className="w-auto min-w-[9.5rem] flex-1"
        />
        <Input
          type="date"
          name="to"
          defaultValue={to ? params.to : ""}
          aria-label={t(locale, "To")}
          title={t(locale, "To")}
          className="w-auto min-w-[9.5rem] flex-1"
        />
        <div className="flex gap-2">
          <Button type="submit" variant="outline">
            {t(locale, "Filter")}
          </Button>
          {filtered ? (
            <Button asChild variant="ghost">
              <Link href="/app/admin/audit">{t(locale, "Clear")}</Link>
            </Button>
          ) : null}
        </div>
      </form>

      <Card>
        {entries.length === 0 ? (
          <EmptyState
            icon="ScrollText"
            title={filtered ? t(locale, "Nothing matches those filters") : t(locale, "Nothing logged yet")}
          />
        ) : (
          <ul className="divide-y">
            {entries.map((entry) => (
              <li key={entry.id} className="px-5 py-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="min-w-0 text-sm">
                    {auditSentence(
                      locale,
                      entry,
                      entry.entityId ? context.get(`${entry.entity}:${entry.entityId}`) : undefined
                    )}
                  </p>
                  <span className="tnum shrink-0 font-mono text-xs text-muted-foreground">
                    {formatDateTime(entry.createdAt)}
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                  {/* The event, named. Its raw code stays on hover, for whoever
                      wants to paste it into the search box above. */}
                  <Badge tone="neutral" title={entry.action}>
                    {auditActionLabel(locale, entry.action)}
                  </Badge>
                  <span>
                    {entry.actor?.name ?? entry.actorEmail ?? t(locale, "System")}
                    {entry.actorRole ? ` · ${t(locale, ROLE_LABELS[entry.actorRole])}` : ""}
                    {` · ${entityName(entry.entity)}`}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <p className="tnum text-muted-foreground">
          {pages > 1 ? `${t(locale, "Page")} ${page} ${t(locale, "of")} ${pages} · ` : ""}
          {total.toLocaleString("en-US")} {t(locale, total === 1 ? "entry" : "entries")}
        </p>
        {pages > 1 ? (
          <div className="flex gap-2">
            {page > 1 ? (
              <Link href={linkFor(page - 1)} className="rounded-lg border px-3 py-1.5 hover:bg-secondary">
                {t(locale, "Previous")}
              </Link>
            ) : null}
            {page < pages ? (
              <Link href={linkFor(page + 1)} className="rounded-lg border px-3 py-1.5 hover:bg-secondary">
                {t(locale, "Next")}
              </Link>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
