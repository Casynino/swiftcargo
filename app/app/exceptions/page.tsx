import Link from "next/link";
import type { Metadata } from "next";
import type { ExceptionType, Prisma } from "@prisma/client";
import { Clock, PackageX, Search, UserX, X } from "lucide-react";

import { EmptyState } from "@/components/app/empty-state";
import { ExceptionCards } from "@/components/app/exception-cards";
import { NewExceptionForm } from "@/components/app/exception-forms";
import {
  ExceptionTable,
  type ExceptionQueueRecord,
} from "@/components/app/exception-table";
import { PageHeader } from "@/components/app/page-header";
import { SectionTabs } from "@/components/app/section-tabs";
import { StatStrip } from "@/components/app/stat-strip";
import {
  EXCEPTION_GROUPS,
  FINISHED_STATUSES,
  OPEN_STATUSES,
  daysOpen,
  groupOf,
  type ExceptionGroupKey,
} from "@/lib/exception-groups";
import {
  LIVE_CARGO,
  isQueueSet,
  queueCounts,
  whereForSet,
  type QueueSet,
} from "@/lib/exception-queue";
import { t } from "@/lib/i18n";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { requirePermission } from "@/lib/session";
import { localeOf } from "@/lib/viewer-locale";

import { primeLocale } from "@/lib/server-t";
export const metadata: Metadata = { title: "Issues & Claims" };

/**
 * The one place flagged cargo lands.
 *
 * A flag never stops a container being booked in at Dar — the consignments that
 * came off are received and the ones that did not become MISSING_AT_DAR with a
 * case. What must not happen is the problem quietly disappearing, so every
 * missing, damaged or wrong consignment is parked here with its container and,
 * above all, how many of its packages Dar actually counted, until somebody
 * closes it out.
 *
 * Read access is held by every desk, because a missing carton concerns the
 * warehouse that packed it, the warehouse that lost it, the desk that has to
 * tell the customer and the desk that has to decide who pays. What each may DO
 * to a case is gated per action on the case page.
 *
 * The live queue is sorted oldest first on purpose. A shortage that has sat for
 * two weeks is the one costing the company a customer.
 */

const GROUP_FILTERS: { key: ExceptionGroupKey | "all"; label: string }[] = [
  { key: "all", label: "Everything" },
  { key: "missing", label: EXCEPTION_GROUPS.missing.label },
  { key: "damaged", label: EXCEPTION_GROUPS.damaged.label },
  { key: "mismatch", label: EXCEPTION_GROUPS.mismatch.label },
  { key: "hold", label: EXCEPTION_GROUPS.hold.label },
  { key: "other", label: EXCEPTION_GROUPS.other.label },
];

const SET_COPY: Record<
  QueueSet,
  { heading: string; note: string; emptyTitle: string; emptyBody: string }
> = {
  open: {
    heading: "Under investigation",
    note: "oldest first",
    emptyTitle: "Nothing outstanding",
    emptyBody:
      "Every flagged consignment has been accounted for. Cargo flagged when a container is booked in lands here on its own.",
  },
  found: {
    heading: "Cargo found",
    note: "most recent first",
    emptyTitle: "Nothing has turned up yet",
    emptyBody:
      "Consignments reported missing appear here once they are booked in at the Dar warehouse after all.",
  },
  compensation: {
    heading: "Waiting on Finance",
    note: "oldest first",
    emptyTitle: "Nothing waiting on Finance",
    emptyBody: "A case lands here while it is parked with Finance to settle.",
  },
  closed: {
    heading: "Closed cases",
    note: "most recently closed first",
    emptyTitle: "Nothing closed yet",
    emptyBody: "Cases that have been resolved or closed are kept here permanently.",
  },
};

const CASE_INCLUDE = {
  customer: { select: { fullName: true, phone: true } },
  raisedBy: { select: { name: true } },
  assignedTo: { select: { name: true } },
  // The permanent history. Oldest first so it reads as a story.
  events: {
    select: {
      id: true,
      note: true,
      to: true,
      createdAt: true,
      actor: { select: { name: true } },
    },
    orderBy: { createdAt: "asc" as const },
    take: 100,
  },
  cargo: {
    select: {
      id: true,
      reference: true,
      status: true,
      description: true,
      declaredPackages: true,
      receiver: { select: { fullName: true, phone: true } },
      // Both counts, never one in place of the other: the gap between them is
      // the only evidence of what happened at sea.
      chinaReceiving: { select: { packagesCount: true } },
      darReceiving: { select: { packagesCount: true } },
      containerLines: {
        select: { container: { select: { id: true, reference: true } } },
        orderBy: { createdAt: "desc" as const },
        take: 1,
      },
    },
  },
} satisfies Prisma.ExceptionCaseInclude;

type CaseRow = Prisma.ExceptionCaseGetPayload<{ include: typeof CASE_INCLUDE }>;

function toRecord(
  row: CaseRow,
  containers: Map<string, { id: string; reference: string }>
): ExceptionQueueRecord {
  const cargo = row.cargo;
  /* The case names the container it was raised against; a case raised by hand
     does not, and the consignment's own line says where it travelled. */
  const container =
    (row.containerId ? containers.get(row.containerId) : undefined) ??
    cargo?.containerLines[0]?.container ??
    null;
  /* The receiver is who is invoiced and who collects, so a case with no named
     customer is about them. */
  const customer = row.customer ?? cargo?.receiver ?? null;

  return {
    id: row.id,
    reference: row.reference,
    type: row.type,
    status: row.status,
    title: row.title,
    description: row.description,
    openedAt: row.createdAt,
    finishedAt: row.closedAt ?? row.resolvedAt,
    raisedByName: row.raisedBy?.name ?? null,
    assignedToName: row.assignedTo?.name ?? null,
    resolution: row.resolution,
    evidence: Array.isArray(row.evidence)
      ? row.evidence.filter((url): url is string => typeof url === "string")
      : [],
    customerName: customer?.fullName ?? null,
    customerPhone: customer?.phone ?? null,
    container,
    events: row.events.map((event) => ({
      id: event.id,
      note: event.note,
      to: event.to,
      actorName: event.actor?.name ?? null,
      createdAt: event.createdAt,
    })),
    cargo: cargo
      ? {
          id: cargo.id,
          reference: cargo.reference,
          status: cargo.status,
          description: cargo.description,
          expected:
            cargo.chinaReceiving?.packagesCount ?? cargo.declaredPackages ?? null,
          atDar: cargo.darReceiving?.packagesCount ?? null,
        }
      : null,
  };
}

const NEWEST_FINISHED_FIRST: Prisma.ExceptionCaseOrderByWithRelationInput[] = [
  { closedAt: { sort: "desc", nulls: "last" } },
  { resolvedAt: { sort: "desc", nulls: "last" } },
  { createdAt: "desc" },
];

export default async function ExceptionsPage({
  searchParams,
}: {
  searchParams: Promise<{ set?: string; group?: string; cargo?: string }>;
}) {
  await primeLocale();
  const user = await requirePermission("exception.view");
  const locale = await localeOf(user.id);
  const params = await searchParams;

  const set: QueueSet = isQueueSet(params.set) ? params.set : "open";
  const group = (GROUP_FILTERS.find((f) => f.key === params.group)?.key ??
    "all") as ExceptionGroupKey | "all";
  // The check-in list links here with the consignment it was looking at.
  const cargoId = params.cargo?.trim() ?? "";

  const scope: Prisma.ExceptionCaseWhereInput = {
    AND: [LIVE_CARGO, ...(cargoId ? [{ cargoId }] : [])],
  };
  const setWhere: Prisma.ExceptionCaseWhereInput = {
    AND: [whereForSet(set), scope],
  };
  const typeWhere: Prisma.ExceptionCaseWhereInput =
    group === "all" ? {} : { type: { in: EXCEPTION_GROUPS[group].types } };

  // A live queue is chased oldest first; a history is read newest first.
  const orderBy: Prisma.ExceptionCaseOrderByWithRelationInput[] =
    set === "open" || set === "compensation"
      ? [{ createdAt: "asc" }]
      : NEWEST_FINISHED_FIRST;

  const canRaise = can(user.role, "exception.raise");

  const [
    counts,
    rows,
    closedRows,
    pillCounts,
    unassigned,
    focusCargo,
    cargoForPicker,
  ] = await Promise.all([
    queueCounts(),
    prisma.exceptionCase.findMany({
      where: { AND: [setWhere, typeWhere] },
      orderBy,
      take: 100,
      include: CASE_INCLUDE,
    }),
    // Only on the live queue: an open list beside what was recently signed off
    // is how a desk sees its own progress.
    set === "open"
      ? prisma.exceptionCase.findMany({
          where: {
            AND: [{ status: { in: FINISHED_STATUSES } }, scope, typeWhere],
          },
          orderBy: NEWEST_FINISHED_FIRST,
          take: 25,
          include: CASE_INCLUDE,
        })
      : Promise.resolve([]),
    // Pill counts come from the database, not from the rows on screen. The list
    // is capped and already filtered by type, so counting it would make every
    // pill read either its own size or zero.
    prisma.exceptionCase.groupBy({
      by: ["type"],
      where: setWhere,
      _count: { _all: true },
    }),
    prisma.exceptionCase.count({
      where: {
        AND: [{ status: { in: OPEN_STATUSES }, assignedToId: null }, scope],
      },
    }),
    cargoId
      ? prisma.cargo.findUnique({
          where: { id: cargoId },
          select: {
            id: true,
            reference: true,
            sender: { select: { fullName: true } },
          },
        })
      : Promise.resolve(null),
    canRaise
      ? prisma.cargo.findMany({
          where: {
            deletedAt: null,
            status: { notIn: ["COLLECTED", "DELIVERED", "CANCELLED"] },
          },
          orderBy: { createdAt: "desc" },
          take: 100,
          select: {
            id: true,
            reference: true,
            sender: { select: { fullName: true } },
          },
        })
      : Promise.resolve([]),
  ]);

  const containerIds = [
    ...new Set(
      [...rows, ...closedRows]
        .map((row) => row.containerId)
        .filter((id): id is string => Boolean(id))
    ),
  ];
  const containers = new Map(
    (containerIds.length > 0
      ? await prisma.container.findMany({
          where: { id: { in: containerIds } },
          select: { id: true, reference: true },
        })
      : []
    ).map((c) => [c.id, c] as const)
  );

  const records = rows.map((row) => toRecord(row, containers));
  const closedRecords = closedRows.map((row) => toRecord(row, containers));

  const countFor = (key: ExceptionGroupKey | "all") =>
    pillCounts
      .filter(
        (bucket) =>
          key === "all" || groupOf(bucket.type as ExceptionType) === key
      )
      .reduce((total, bucket) => total + bucket._count._all, 0);

  const copy = SET_COPY[set];

  // Packages, not flags: two cases on one consignment must not count its
  // missing cartons twice.
  const unaccounted = new Map<string, number>();
  for (const record of records) {
    const cargo = record.cargo;
    if (!cargo || cargo.expected === null) continue;
    const atDar =
      cargo.atDar ?? (cargo.status === "MISSING_AT_DAR" ? 0 : null);
    if (atDar === null) continue;
    unaccounted.set(cargo.id, Math.max(0, cargo.expected - atDar));
  }
  const missingPackages = [...unaccounted.values()].reduce((a, b) => a + b, 0);
  const oldest =
    set === "open" && records.length > 0 ? daysOpen(records[0].openedAt) : 0;

  const focusLabel = focusCargo?.reference ?? cargoId;

  return (
    <div className="space-y-6">
      <PageHeader
        title={t(locale, "Issues & Claims")}
        description={t(
          locale,
          "Every item flagged missing, damaged or wrong on arrival — held here, with the boxes it belongs to, until someone closes it out."
        )}
      />
      <SectionTabs />

      {canRaise ? (
        <NewExceptionForm
          /* The check-in list sends a clerk here with the consignment in hand.
             It may be older than the hundred most recent, so it is put on the
             list rather than left for them to fail to find. */
          cargo={[
            ...(focusCargo && !cargoForPicker.some((c) => c.id === focusCargo.id)
              ? [focusCargo]
              : []),
            ...cargoForPicker,
          ].map((c) => ({
            id: c.id,
            label: `${c.reference} · ${c.sender.fullName}`,
          }))}
          defaultCargoId={focusCargo?.id}
        />
      ) : null}

      <ExceptionCards
        counts={counts}
        set={set}
        group={group}
        cargoId={cargoId}
        locale={locale}
      />

      {/* The cards count cases. These count what a case does not: packages
          nobody can find, days lost, and cases with nobody's name on them. */}
      <StatStrip
        chips={[
          {
            label: t(locale, "Packages unaccounted for"),
            value: String(missingPackages),
            icon: PackageX,
            tone: missingPackages > 0 ? "danger" : "success",
          },
          {
            label: t(locale, "Oldest open"),
            value: oldest > 0 ? `${oldest}d` : "—",
            icon: Clock,
            tone: oldest >= 7 ? "danger" : oldest >= 2 ? "warning" : "neutral",
          },
          {
            label: t(locale, "Nobody carrying"),
            value: String(unassigned),
            icon: UserX,
            tone: unassigned > 0 ? "warning" : "success",
          },
        ]}
      />

      {cargoId ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-muted/30 px-4 py-2.5">
          <p className="flex items-center gap-2 text-sm">
            <Search className="h-4 w-4 text-muted-foreground" />
            {t(locale, "Showing cases on")}{" "}
            <span className="tnum font-mono font-semibold">{focusLabel}</span>
          </p>
          <Link
            href={queryHref(set, group, "")}
            className="focus-ring inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
            {t(locale, "Show the whole queue")}
          </Link>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {GROUP_FILTERS.map((option) => {
          const count = countFor(option.key);
          const active = option.key === group;
          return (
            <Link
              key={option.key}
              href={queryHref(set, option.key, cargoId)}
              className={`focus-ring inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
                active
                  ? "border-brand bg-brand text-brand-foreground"
                  : "bg-card hover:bg-secondary"
              }`}
            >
              {t(locale, option.label)}
              <span
                className={`tnum rounded-full px-1.5 text-xs ${
                  active ? "bg-white/20" : "bg-muted text-muted-foreground"
                }`}
              >
                {count}
              </span>
            </Link>
          );
        })}
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">
          {t(locale, copy.heading)} ({records.length})
          {records.length > 1 ? (
            <span className="ml-2 font-normal text-muted-foreground">
              {t(locale, copy.note)}
            </span>
          ) : null}
        </h2>

        {records.length === 0 ? (
          <div className="rounded-xl border bg-card">
            <EmptyState
              icon="ShieldCheck"
              title={
                group === "all"
                  ? cargoId
                    ? `${t(locale, "Nothing on")} ${focusLabel}`
                    : t(locale, copy.emptyTitle)
                  : t(locale, "Nothing of this kind here")
              }
              description={
                group === "all"
                  ? cargoId
                    ? t(
                        locale,
                        "This cargo has no case in this view. Try another card above."
                      )
                    : t(locale, copy.emptyBody)
                  : t(
                      locale,
                      "Other cases are in this view — switch the filter above to see them."
                    )
              }
            />
          </div>
        ) : (
          <ExceptionTable
            records={records}
            locale={locale}
            closed={set === "closed"}
          />
        )}
      </section>

      {closedRecords.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold">
            {t(locale, "Recently closed")} ({closedRecords.length})
          </h2>
          {/* Closed cases stay on the page but read back: they are a record, not
              a queue. Same table so the eye does not re-learn the columns. */}
          <ExceptionTable records={closedRecords} locale={locale} closed />
        </section>
      ) : null}
    </div>
  );
}

function queryHref(
  set: QueueSet,
  group: ExceptionGroupKey | "all",
  cargoId: string
) {
  const query = new URLSearchParams();
  if (set !== "open") query.set("set", set);
  if (group !== "all") query.set("group", group);
  if (cargoId) query.set("cargo", cargoId);
  const search = query.toString();
  return search ? `/app/exceptions?${search}` : "/app/exceptions";
}
