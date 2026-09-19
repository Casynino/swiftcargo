import Link from "next/link";
import type { Metadata } from "next";
import type { Prisma } from "@prisma/client";

import { EmptyState } from "@/components/app/empty-state";
import { FinanceTabs } from "@/components/app/finance-tabs";
import { PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  auditActionLabel,
  auditSentence,
  type AuditContext,
} from "@/lib/audit-humanise";
import { formatDateTime } from "@/lib/format";
import { t } from "@/lib/i18n";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { cn } from "@/lib/utils";
import { localeOf } from "@/lib/viewer-locale";

import { primeLocale } from "@/lib/server-t";
export const metadata: Metadata = { title: "Money audit" };

/**
 * WHICH ROWS OF THE ONE AUDIT LOG ARE MONEY.
 *
 * The same append-only table the owner's audit log reads, narrowed rather than
 * duplicated: a second record kept separately for Finance would be a second
 * thing that can disagree.
 *
 * Narrowed by entity where every row of that entity is money, and by action
 * where the entity is shared. A merged payment is written against the Customer,
 * a container's pricing against the Container and a release against the Cargo —
 * and "Customer" also carries every new sign-up, which is not money. Filtering
 * on entity alone either misses the payments or buries them in registrations.
 */
type Scope = {
  key: string;
  label: string;
  entities: string[];
  actions?: string[];
  actionPrefixes?: string[];
};

const SCOPES: Scope[] = [
  { key: "Invoice", label: "Invoice", entities: ["Invoice"] },
  { key: "Payment", label: "Payment", entities: ["Payment"] },
  { key: "PickupNote", label: "Pickup note", entities: ["PickupNote"] },
  { key: "ExchangeRate", label: "Exchange rate", entities: ["ExchangeRate"] },
  { key: "ShippingRate", label: "Rate book", entities: ["ShippingRate"] },
  /* A reviewer's verdict on a cost is written as "Expense", the cost itself as
     "ContainerExpense". One chip, because to the reader they are one record. */
  { key: "Expense", label: "Expense", entities: ["ContainerExpense", "Expense"] },
  { key: "AccountTransfer", label: "Transfer", entities: ["AccountTransfer", "Transfer"] },
  { key: "BankAccount", label: "Account", entities: ["BankAccount"] },
  { key: "PayrollRun", label: "Payroll", entities: ["PayrollRun"] },
  {
    key: "Customer",
    label: "Customer",
    entities: ["Customer"],
    actions: [
      "payment.record.merged",
      "payment.record.overpaid",
      "customerRate.set",
      "customerRate.edit",
      "customerRate.delete",
    ],
  },
  {
    key: "Container",
    label: "Container",
    entities: ["Container"],
    actions: ["container.pricing.confirm", "invoice.bulk", "expense.record", "container.delete"],
    actionPrefixes: ["review."],
  },
  {
    key: "Cargo",
    label: "Cargo",
    entities: ["Cargo"],
    actions: ["cargo.release", "cargo.delete", "cargo.restore"],
  },
  {
    key: "CompanySetting",
    label: "Company settings",
    entities: ["CompanySetting"],
    actions: ["settings.update"],
  },
];

/*
  "Show me what was taken back, and who did it."

  Every action whose meaning is "this record no longer stands". One explicit
  list rather than a match on the word "cancel", because a rejected claim, a
  reversed payment and a withdrawn rate all mean it without saying it — and a
  filter that silently misses one reads as proof nothing happened.
*/
const UNDONE_ACTIONS = [
  "payment.cancel",
  "payment.reject",
  "payment.reverse",
  "invoice.cancel",
  "invoice.storage.waive",
  "pickupNote.cancel",
  "expense.cancel",
  "account.transfer.cancel",
  "fx.delete",
  "rate.delete",
  "customerRate.delete",
  "cargo.delete",
  "cargo.restore",
  "container.delete",
];

const PAGE_SIZE = 60;

function scopeWhere(scope: Scope): Prisma.AuditLogWhereInput {
  const actionMatch: Prisma.AuditLogWhereInput[] = [
    ...(scope.actions?.length ? [{ action: { in: scope.actions } }] : []),
    ...(scope.actionPrefixes ?? []).map((p) => ({ action: { startsWith: p } })),
  ];
  return {
    entity: { in: scope.entities },
    ...(actionMatch.length ? { OR: actionMatch } : {}),
  };
}

function inScope(scope: Scope, row: { entity: string; action: string }) {
  if (!scope.entities.includes(row.entity)) return false;
  if (!scope.actions && !scope.actionPrefixes) return true;
  return (
    (scope.actions ?? []).includes(row.action) ||
    (scope.actionPrefixes ?? []).some((p) => row.action.startsWith(p))
  );
}

/**
 * EVERY MONEY ACTION ON THE SYSTEM, WHO DID IT AND WHEN.
 *
 * Append-only. Nothing here can be edited or removed by anybody, including the
 * person who owns the company — a record that the powerful can alter is not a
 * record, it is a claim. It is the only page in Finance with no actions on it
 * at all, and that is the point.
 */
export default async function MoneyAuditPage({
  searchParams,
}: {
  searchParams: Promise<{ entity?: string; page?: string; view?: string }>;
}) {
  await primeLocale();
  const user = await requirePermission("accounting.view");
  const locale = await localeOf(user.id);
  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);
  const undoneOnly = params.view === "undone";

  const chosen = SCOPES.find((s) => s.key === params.entity);
  const moneyWhere: Prisma.AuditLogWhereInput = chosen
    ? scopeWhere(chosen)
    : { OR: SCOPES.map(scopeWhere) };
  const where: Prisma.AuditLogWhereInput = undoneOnly
    ? { AND: [moneyWhere, { action: { in: UNDONE_ACTIONS } }] }
    : moneyWhere;

  const [entries, total, present] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { actor: { select: { name: true } } },
    }),
    prisma.auditLog.count({ where }),
    /* The chips are the kinds of money record that have actually been written.
       A chip that can only ever show "Nothing recorded yet" is a question the
       page already knows the answer to. */
    prisma.auditLog.groupBy({
      by: ["entity", "action"],
      where: { OR: SCOPES.map(scopeWhere) },
    }),
  ]);

  const chips = SCOPES.filter((scope) => present.some((row) => inScope(scope, row)));

  /* Which consignment a bill belongs to is the first thing anybody asks of a
     line that names only an invoice number, so it is looked up once per page
     rather than left for the reader to chase. */
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
  const linkFor = (entity?: string, nextPage?: number, view = params.view) => {
    const qs = new URLSearchParams();
    if (entity) qs.set("entity", entity);
    if (view) qs.set("view", view);
    if (nextPage && nextPage > 1) qs.set("page", String(nextPage));
    const s = qs.toString();
    return s ? `/app/finance/audit?${s}` : "/app/finance/audit";
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={t(locale, "Money audit")}
        description={t(
          locale,
          "Every money action on the system, who did it and when. Append-only — nothing here can be edited or removed, including by the owner."
        )}
      />
      <FinanceTabs />

      <div className="flex flex-wrap items-center gap-2">
        <Chip href={linkFor(undefined, undefined, "")} active={!chosen && !undoneOnly}>
          {t(locale, "Everything")}
        </Chip>
        {/* The taken-back history, in one press. Set apart from the kind chips
            because it asks a different question: those ask "what kind of
            record", this asks "what no longer stands". */}
        <Chip href={linkFor(chosen?.key, undefined, "undone")} active={undoneOnly}>
          {t(locale, "Cancelled & deleted")}
        </Chip>
        <span className="w-2" aria-hidden="true" />
        {chips.map((scope) => (
          <Chip
            key={scope.key}
            href={linkFor(scope.key, undefined, "")}
            active={chosen?.key === scope.key && !undoneOnly}
          >
            {t(locale, scope.label)}
          </Chip>
        ))}
      </div>

      {undoneOnly ? (
        <p className="-mt-3 text-xs text-muted-foreground">
          {t(
            locale,
            "Everything that was cancelled, reversed, sent back, withdrawn or deleted — with the name of whoever did it and the reason they gave. Nothing here was removed from the system; each of these is a record that still exists and no longer counts."
          )}
        </p>
      ) : null}

      <Card>
        {entries.length === 0 ? (
          <EmptyState
            icon="ScrollText"
            title={t(locale, "Nothing recorded yet")}
            description={t(
              locale,
              "Actions appear here as they happen — a price confirmed, a payment taken, a cost paid."
            )}
          />
        ) : (
          <ul className="divide-y">
            {entries.map((entry) => (
              <li
                key={entry.id}
                className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5"
              >
                <div className="min-w-0">
                  <p className="text-sm">
                    {auditSentence(
                      locale,
                      entry,
                      entry.entityId ? context.get(`${entry.entity}:${entry.entityId}`) : undefined
                    )}
                  </p>
                  <p className="tnum mt-0.5 text-xs text-muted-foreground">
                    {entry.actor?.name ?? entry.actorEmail ?? t(locale, "System")} ·{" "}
                    {formatDateTime(entry.createdAt)}
                  </p>
                </div>
                {/* The words, not the code. The code stays on hover for anyone
                    who needs it to search the full log. */}
                <Badge tone="neutral" className="shrink-0 whitespace-nowrap" title={entry.action}>
                  {auditActionLabel(locale, entry.action)}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {pages > 1 ? (
        <div className="flex items-center justify-between text-sm">
          <p className="tnum text-muted-foreground">
            {t(locale, "Page")} {page} {t(locale, "of")} {pages} · {total}{" "}
            {t(locale, "entries")}
          </p>
          <div className="flex gap-2">
            {page > 1 ? (
              <Link
                href={linkFor(chosen?.key, page - 1)}
                className="rounded-lg border px-3 py-1.5 hover:bg-secondary"
              >
                {t(locale, "Previous")}
              </Link>
            ) : null}
            {page < pages ? (
              <Link
                href={linkFor(chosen?.key, page + 1)}
                className="rounded-lg border px-3 py-1.5 hover:bg-secondary"
              >
                {t(locale, "Next")}
              </Link>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Chip({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "rounded-full px-3.5 py-1.5 text-sm transition-colors",
        active
          ? "bg-brand text-brand-foreground"
          : "bg-secondary text-muted-foreground hover:text-foreground"
      )}
    >
      {children}
    </Link>
  );
}
