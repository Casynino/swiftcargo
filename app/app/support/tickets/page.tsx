import Link from "next/link";
import type { Metadata } from "next";
import type { ConversationStatus, Prisma, TicketPriority } from "@prisma/client";

import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { SectionTabs } from "@/components/app/section-tabs";
import { NewTicketPanel } from "@/components/app/ticket-forms";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDateTime, formatRelative } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { requirePermission } from "@/lib/session";
import { cn } from "@/lib/utils";

import { primeLocale, T } from "@/lib/server-t";
import { Tx } from "@/components/app/tx";
export const metadata: Metadata = { title: "Tickets" };

const STATUS_FILTERS: {
  key: string;
  label: string;
  statuses: ConversationStatus[];
}[] = [
  { key: "open", label: "Open", statuses: ["OPEN", "WAITING_STAFF"] },
  { key: "waiting", label: "Waiting for customer", statuses: ["WAITING_CUSTOMER"] },
  { key: "resolved", label: "Resolved", statuses: ["RESOLVED", "CLOSED"] },
  {
    key: "all",
    label: "Everything",
    statuses: ["OPEN", "WAITING_STAFF", "WAITING_CUSTOMER", "RESOLVED", "CLOSED"],
  },
];

const PRIORITY_FILTERS: { key: string; label: string; priority?: TicketPriority }[] = [
  { key: "", label: "Any priority" },
  { key: "URGENT", label: "Urgent", priority: "URGENT" },
  { key: "HIGH", label: "High", priority: "HIGH" },
  { key: "NORMAL", label: "Normal", priority: "NORMAL" },
  { key: "LOW", label: "Low", priority: "LOW" },
];

/** Enough tickets to work through, few enough to render fast. */
const PAGE_SIZE = 25;

const PRIORITY_TONE: Record<TicketPriority, BadgeProps["tone"]> = {
  URGENT: "bad",
  HIGH: "warn",
  NORMAL: "neutral",
  LOW: "neutral",
};

const STATUS_TONE: Record<ConversationStatus, BadgeProps["tone"]> = {
  OPEN: "progress",
  WAITING_STAFF: "warn",
  WAITING_CUSTOMER: "outline",
  RESOLVED: "good",
  CLOSED: "neutral",
};

const STATUS_LABEL: Record<ConversationStatus, string> = {
  OPEN: "Open",
  WAITING_STAFF: "Waiting on us",
  WAITING_CUSTOMER: "Waiting for customer",
  RESOLVED: "Resolved",
  CLOSED: "Closed",
};

/**
 * THE QUEUE.
 *
 * Every conversation a customer started from the portal and every call the desk
 * wrote down, in one list that says how many there are. A list that silently
 * stops at some row count looks exactly like one showing everything, so the
 * total is always printed and the rest is paged.
 */
export default async function TicketsPage({
  searchParams,
}: {
  searchParams: Promise<{
    view?: string;
    priority?: string;
    q?: string;
    page?: string;
    new?: string;
  }>;
}) {
  await primeLocale();
  const user = await requirePermission("conversation.view");
  const params = await searchParams;

  const filter =
    STATUS_FILTERS.find((option) => option.key === params.view) ?? STATUS_FILTERS[0];
  const priorityFilter =
    PRIORITY_FILTERS.find((option) => option.key && option.key === params.priority) ??
    PRIORITY_FILTERS[0];
  const priority = priorityFilter.key;
  const search = (params.q ?? "").trim();
  const page = Math.max(1, Math.floor(Number(params.page)) || 1);

  const priorityWhere: Prisma.ConversationWhereInput = priorityFilter.priority
    ? { priority: priorityFilter.priority }
    : {};

  /*
    A clerk with a customer on the line has one of a few things: the ticket
    number off an earlier message, the caller's name or the number they rang
    from, roughly what it was about, or the reference of the cargo. All of them
    are searched at once rather than making them guess which field the box means.
  */
  const searchWhere: Prisma.ConversationWhereInput = search
    ? {
        OR: [
          { reference: { contains: search, mode: "insensitive" } },
          { subject: { contains: search, mode: "insensitive" } },
          { customer: { fullName: { contains: search, mode: "insensitive" } } },
          { customer: { phone: { contains: search } } },
          { cargo: { reference: { contains: search, mode: "insensitive" } } },
          { messages: { some: { body: { contains: search, mode: "insensitive" } } } },
        ],
      }
    : {};

  const listWhere: Prisma.ConversationWhereInput = {
    status: { in: filter.statuses },
    ...priorityWhere,
    ...searchWhere,
  };

  const [tickets, listCount, counts] = await Promise.all([
    prisma.conversation.findMany({
      where: listWhere,
      orderBy: [{ priority: "desc" }, { lastMessageAt: "desc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        reference: true,
        subject: true,
        priority: true,
        status: true,
        staffUnread: true,
        lastMessageAt: true,
        customer: { select: { id: true, fullName: true, phone: true } },
        cargo: { select: { id: true, reference: true } },
        assignedTo: { select: { name: true } },
      },
    }),
    prisma.conversation.count({ where: listWhere }),
    /* The chip counts are taken under the search and the priority, not over
       every ticket ever raised. A chip that reads 12 and then shows an empty
       list is how somebody decides the filters are broken. */
    prisma.conversation.groupBy({
      by: ["status"],
      where: { ...priorityWhere, ...searchWhere },
      _count: true,
    }),
  ]);

  const countFor = (statuses: readonly string[]) =>
    counts
      .filter((row) => statuses.includes(row.status))
      .reduce((sum, row) => sum + row._count, 0);

  /** Every control keeps the others, so narrowing never silently resets. */
  const link = (next: Record<string, string | undefined>) => {
    const merged: Record<string, string | undefined> = {
      view: filter.key === STATUS_FILTERS[0].key ? undefined : filter.key,
      priority: priority || undefined,
      q: search || undefined,
      /* Any change of filter starts again at page one — page 3 of a different
         list is a blank screen that looks like a bug. */
      page: undefined,
      ...next,
    };
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(merged)) if (v) qs.set(k, v);
    const s = qs.toString();
    return `/app/support/tickets${s ? `?${s}` : ""}`;
  };

  const filtered = Boolean(search || priority);
  const pages = Math.max(1, Math.ceil(listCount / PAGE_SIZE));
  const firstOnPage = listCount === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const lastOnPage = Math.min(page * PAGE_SIZE, listCount);

  return (
    <div className="space-y-6">
      <PageHeader
        title={T("Tickets")}
        description={T("Every question, complaint and request the desk has taken, and what happened next.")}
      />
      <SectionTabs />

      <div className="flex flex-wrap gap-2">
        {STATUS_FILTERS.map((option) => {
          const active = option.key === filter.key;
          return (
            <Link
              key={option.key}
              href={link({
                view: option.key === STATUS_FILTERS[0].key ? undefined : option.key,
              })}
              aria-current={active ? "true" : undefined}
              className={cn(
                "focus-ring inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
                active
                  ? "border-brand bg-brand text-brand-foreground"
                  : "bg-card hover:bg-secondary"
              )}
            >
              <Tx>{option.label}</Tx>
              <span
                className={cn(
                  "tnum rounded-full px-1.5 text-xs",
                  active ? "bg-white/20" : "bg-secondary text-muted-foreground"
                )}
              >
                {countFor(option.statuses)}
              </span>
            </Link>
          );
        })}
      </div>

      <NewTicketPanel
        defaultOpen={params.new === "1"}
        canCreate={can(user.role, "conversation.reply")}
      />

      <div className="space-y-2">
        {/* A GET form, so "the search that finds it" is a link a clerk can paste
            into a handover note. The view rides along in a hidden field, so
            searching inside "Waiting for customer" does not throw it away. */}
        <form
          action="/app/support/tickets"
          className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-3"
        >
          {filter.key === STATUS_FILTERS[0].key ? null : (
            <input type="hidden" name="view" value={filter.key} />
          )}
          <NativeSelect
            name="priority"
            defaultValue={priority}
            aria-label={T("Priority")}
            className="h-9 w-40"
          >
            {PRIORITY_FILTERS.map((option) => (
              <option key={option.key} value={option.key}>
                <Tx>{option.label}</Tx>
              </option>
            ))}
          </NativeSelect>
          <Input
            type="search"
            name="q"
            defaultValue={search}
            placeholder={T("Ticket number, customer, phone, cargo reference, what was said…")}
            className="h-9 min-w-0 flex-1 basis-56"
          />
          <Button type="submit" size="sm">
            {T("Search")}
          </Button>
        </form>

        <p className="text-xs text-muted-foreground">
          {listCount === 0
            ? "Nothing matches."
            : pages > 1
              ? `Showing ${firstOnPage}–${lastOnPage} of ${listCount} ${listCount === 1 ? "ticket" : "tickets"}`
              : `${listCount} ${listCount === 1 ? "ticket" : "tickets"}`}
          {filtered ? " · filtered · " : ""}
          {filtered ? (
            <Link
              href={link({ q: undefined, priority: undefined })}
              className="underline-offset-2 hover:underline"
            >
              {T("Clear the filters")}
            </Link>
          ) : null}
        </p>
      </div>

      {tickets.length === 0 ? (
        <Card>
          <EmptyState
            icon="MessageSquare"
            title={filtered ? T("Nothing matches those filters") : T("No tickets in this view.")}
            description={
              filtered
                ? T("Try another view, or clear the filters above.")
                : T("Every call, complaint and question the desk takes belongs here — that is how the next person picks it up.")
            }
          />
        </Card>
      ) : (
        <>
          {/* On a phone a ticket gets a card: subject first, then who and what
              cargo, then the state, the owner and how long it has sat. */}
          <ul className="space-y-3 md:hidden">
            {tickets.map((ticket) => (
              <li key={ticket.id}>
                <Link
                  href={`/app/support/${ticket.id}`}
                  className="block rounded-xl border bg-card p-4 shadow-soft hover:bg-secondary/40"
                >
                  <p className="flex items-start gap-2 font-medium">
                    {ticket.staffUnread ? <UnreadDot /> : null}
                    <span className="min-w-0 flex-1">{ticket.subject}</span>
                  </p>
                  <p className="tnum mt-0.5 font-mono text-xs text-muted-foreground">
                    {ticket.reference}
                    {ticket.cargo ? ` · ${ticket.cargo.reference}` : ""}
                  </p>
                  <p className="mt-1 text-sm">
                    {ticket.customer.fullName}
                    <span className="tnum text-muted-foreground"> · {ticket.customer.phone}</span>
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <Badge tone={PRIORITY_TONE[ticket.priority]}>
                      {ticket.priority.toLowerCase()}
                    </Badge>
                    <Badge tone={STATUS_TONE[ticket.status]}>
                      {STATUS_LABEL[ticket.status]}
                    </Badge>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {ticket.assignedTo?.name ?? "Unassigned"} ·{" "}
                    {formatRelative(ticket.lastMessageAt)}
                  </p>
                </Link>
              </li>
            ))}
          </ul>

          <Card className="hidden overflow-hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{T("Ticket")}</TableHead>
                  <TableHead>{T("Customer")}</TableHead>
                  <TableHead className="hidden lg:table-cell">{T("Cargo")}</TableHead>
                  <TableHead>{T("Priority")}</TableHead>
                  <TableHead>{T("Status")}</TableHead>
                  <TableHead className="hidden xl:table-cell">{T("Handled by")}</TableHead>
                  <TableHead className="text-right">{T("Last activity")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tickets.map((ticket) => (
                  <TableRow key={ticket.id} className="align-top">
                    <TableCell>
                      <Link
                        href={`/app/support/${ticket.id}`}
                        className="flex items-start gap-2 font-medium hover:underline"
                      >
                        {ticket.staffUnread ? <UnreadDot /> : null}
                        <span>{ticket.subject}</span>
                      </Link>
                      <div className="tnum font-mono text-xs text-muted-foreground">
                        {ticket.reference}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Link
                        href={`/app/customers/${ticket.customer.id}`}
                        className="text-sm hover:underline"
                      >
                        {ticket.customer.fullName}
                      </Link>
                      <div className="tnum text-xs text-muted-foreground">
                        {ticket.customer.phone}
                      </div>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      {ticket.cargo ? (
                        <Link
                          href={`/app/cargo/${ticket.cargo.id}`}
                          className="tnum font-mono text-xs hover:underline"
                        >
                          {ticket.cargo.reference}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge tone={PRIORITY_TONE[ticket.priority]}>
                        {ticket.priority.toLowerCase()}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge tone={STATUS_TONE[ticket.status]}>
                        {STATUS_LABEL[ticket.status]}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden text-sm text-muted-foreground xl:table-cell">
                      {ticket.assignedTo?.name ?? "Unassigned"}
                    </TableCell>
                    <TableCell
                      className="text-right text-xs text-muted-foreground"
                      title={formatDateTime(ticket.lastMessageAt)}
                    >
                      {formatRelative(ticket.lastMessageAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </>
      )}

      {pages > 1 ? (
        <div className="flex items-center justify-between gap-3 text-sm">
          {page > 1 ? (
            <Link
              href={link({ page: page === 2 ? undefined : String(page - 1) })}
              className="focus-ring rounded-md border bg-card px-3 py-1.5 text-xs font-medium hover:bg-secondary"
            >
              ← Previous
            </Link>
          ) : (
            <span />
          )}
          <span className="text-xs text-muted-foreground">
            Page {page} of {pages}
          </span>
          {page < pages ? (
            <Link
              href={link({ page: String(page + 1) })}
              className="focus-ring rounded-md border bg-card px-3 py-1.5 text-xs font-medium hover:bg-secondary"
            >
              Next →
            </Link>
          ) : (
            <span />
          )}
        </div>
      ) : null}
    </div>
  );
}

function UnreadDot() {
  return (
    <span
      aria-label={T("Unread")}
      title={T("Unread")}
      className="mt-1.5 size-2 shrink-0 rounded-full bg-brand"
    />
  );
}
