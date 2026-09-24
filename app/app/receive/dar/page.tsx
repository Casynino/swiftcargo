import Link from "next/link";
import type { Metadata } from "next";

import {
  ClipboardCheck,
  Clock,
  FileText,
  Package,
  Ship,
  TriangleAlert,
  Warehouse,
} from "lucide-react";

import { KpiCard } from "@/components/app/kpi-card";
import { MarkArrivedButton } from "@/components/app/container-controls";
import { ClearanceButton, type StorageTerms } from "@/components/app/clearance-button";
import { UndoArrivalButton } from "@/components/app/undo-arrival-button";
import { StatStrip } from "@/components/app/stat-strip";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { SectionTabs } from "@/components/app/section-tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCbm, formatDate } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { requirePermission } from "@/lib/session";

import { primeLocale, T } from "@/lib/server-t";
export const metadata: Metadata = { title: "Receiving dock" };

/**
 * The Dar floor, container by container.
 *
 * Arrivals are worked one box at a time — everything on a container comes off
 * together — so the queue is grouped by container rather than being a flat list
 * of consignments in arrival order.
 */

/** Everything Dar has a reason to look at, newest state first. */
async function inboundContainers() {
  return prisma.container.findMany({
    /*
      EVERYTHING THAT IS COMING, NOT JUST WHAT HAS SAILED.

      The dock used to start at DEPARTED, so a container being filled in
      Guangzhou was invisible to Dar until the day it left. Dar plans floor
      space and labour weeks ahead; "what is coming and roughly when" is the
      question, and a box already half full in Baiyun is part of the answer.
      Only a landed one can be checked in — the rest are here to be seen.
    */
    where: {
      deletedAt: null,
      status: { in: ["OPEN", "LOADING", "LOADED", "SEALED", "DEPARTED", "IN_TRANSIT", "ARRIVED"] },
    },
    orderBy: { updatedAt: "desc" },
    include: {
      shipment: true,
      cargoLines: {
        include: {
          cargo: {
            include: {
              sender: { select: { fullName: true } },
              chinaReceiving: true,
              darReceiving: { include: { receivedBy: { select: { name: true } } } },
              exceptions: {
                where: { status: { notIn: ["RESOLVED", "CLOSED"] } },
                select: { id: true },
              },
              packages: {
                where: { deletedAt: null },
                select: { cargoType: true, pieces: true },
              },
              _count: { select: { photos: true } },
            },
          },
        },
      },
    },
  });
}

/** One row per container. The same table serves both halves of the dock. */
type QueueRow = Awaited<ReturnType<typeof inboundContainers>>[number];

function Queue({
  rows,
  query,
  emptyTitle,
  emptyDescription,
  terms,
  undo,
}: {
  rows: QueueRow[];
  query: string;
  emptyTitle: string;
  emptyDescription: string;
  terms: StorageTerms;
  /** Who may undo an arrival: with nothing checked in, and with check-ins. */
  undo: { plain: boolean; counted: boolean };
}) {
  return rows.length === 0 ? (
          <EmptyState
            icon="Ship"
            title={query ? T("Nothing matches") : emptyTitle}
            description={
              query ? T("Try the vessel, or our own container number.") : emptyDescription
            }
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{T("Container")}</TableHead>
                <TableHead>{T("Where")}</TableHead>
                <TableHead className="hidden lg:table-cell">{T("Vessel / voyage")}</TableHead>
                <TableHead className="hidden md:table-cell">{T("Departed / landed")}</TableHead>
                <TableHead className="text-right">{T("Cargo")}</TableHead>
                <TableHead className="min-w-[8rem]">{T("Checked in")}</TableHead>
                <TableHead className="hidden text-right 2xl:table-cell">
                  {T("Packages present")}
                </TableHead>
                <TableHead className="hidden 2xl:table-cell">{T("Checked by")}</TableHead>
                <TableHead className="hidden text-right 2xl:table-cell">{T("Waiting")}</TableHead>
                <TableHead className="text-right" />
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((container) => {
                const total = container.cargoLines.length;
                const done = container.cargoLines.filter(
                  (l) => l.cargo.darReceiving
                ).length;
                const gone = container.cargoLines.filter(
                  (l) => l.cargo.status === "MISSING_AT_DAR"
                ).length;
                /* Landed and still with customs: what "Mark cleared" clears. */
                const awaitingClearance = container.cargoLines.filter(
                  (l) =>
                    !l.cargo.clearedAt &&
                    !["COLLECTED", "DELIVERED", "CANCELLED", "MISSING_AT_DAR"].includes(l.cargo.status) &&
                    (l.cargo.status === "ARRIVED_TANZANIA" || l.cargo.darReceiving)
                ).length;
                /* The arrival can be undone while nothing is cleared, missing,
                   damaged or short. Clean check-ins may be undone too, by the
                   office only — undoContainerArrival holds the same rule. */
                const checkedInHere = container.cargoLines.filter((l) => l.cargo.darReceiving).length;
                const undoable =
                  container.status === "ARRIVED" &&
                  container.cargoLines.every(
                    (l) =>
                      !l.cargo.clearedAt &&
                      ["ARRIVED_TANZANIA", "RECEIVED_DAR", "CANCELLED"].includes(l.cargo.status) &&
                      (!l.cargo.darReceiving ||
                        (l.cargo.darReceiving.condition === "GOOD" && !l.cargo.darReceiving.discrepancy))
                  ) &&
                  (checkedInHere === 0 ? undo.plain : undo.counted);
                const cbm = container.cargoLines.reduce(
                  (sum, l) => sum + Number(l.cbm),
                  0
                );
                const packages = container.cargoLines.reduce(
                  (sum, l) => sum + l.packagesCount,
                  0
                );
                const here = container.status === "ARRIVED";
                const left = total - done - gone;
                const sailing =
                  container.status === "DEPARTED" ||
                  container.status === "IN_TRANSIT";
                const where = here
                  ? left > 0
                    ? "To check in"
                    : "On the floor"
                  : sailing
                    ? "At sea"
                    : container.status === "SEALED" || container.status === "LOADED"
                      ? "Sealed in Guangzhou"
                      : "Loading in Guangzhou";
                /* Who actually did the counting. Blank until somebody has. */
                const checkers = [
                  ...new Set(
                    container.cargoLines
                      .map((l) => l.cargo.darReceiving?.receivedBy?.name)
                      .filter((name): name is string => Boolean(name))
                  ),
                ];
                const since = here
                  ? container.shipment?.actualArrival
                  : sailing
                    ? container.shipment?.departureDate
                    : null;
                /* Clamped at zero. A landing date recorded ahead of today is
                   somebody entering paperwork early, not a container that has
                   been waiting minus twenty-five days. */
                const waited = since
                  ? Math.max(0, Math.floor((Date.now() - since.getTime()) / 86_400_000))
                  : null;
                /* What actually came off, against what Guangzhou sent. */
                const arrivedPkgs = container.cargoLines.reduce(
                  (sum, l) => sum + (l.cargo.darReceiving?.packagesCount ?? 0),
                  0
                );

                return (
                  <TableRow
                    key={container.id}

                  >
                    <TableCell>
                      <Link
                        href={
                          here
                            ? `/app/receive/dar/${container.id}`
                            : `/app/containers/${container.id}`
                        }
                        className="tnum text-sm font-semibold hover:underline"
                      >
                        {container.reference}
                      </Link>
                      <span className="tnum block text-xs text-muted-foreground">
                        {container.containerNumber ?? "—"}
                      </span>
                    </TableCell>
                    <TableCell>
                      {/* THE JOB WHERE THERE IS ONE, THE PLACE WHERE THERE IS
                          NOT. A landed container with boxes still unticked is
                          the row on this page asking for something, so it says
                          so. Once every box is off it goes back to being a
                          location, because then there is nothing to instruct. */}
                      <Badge
                        tone={
                          here
                            ? left > 0
                              ? "warn"
                              : "good"
                            : sailing
                              ? "progress"
                              : "neutral"
                        }
                      >
                        {where}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden text-sm text-muted-foreground lg:table-cell">
                      {container.shipment?.vessel ?? "—"}
                      {container.shipment?.voyage
                        ? ` / ${container.shipment.voyage}`
                        : ""}
                    </TableCell>
                    <TableCell className="hidden text-sm text-muted-foreground md:table-cell">
                      {since ? (
                        <>
                          {formatDate(since)}
                          <span className="block text-xs">
                            {here ? "landed" : "departed"}
                          </span>
                        </>
                      ) : (
                        <>
                          {formatDate(container.shipment?.eta)}
                          <span className="block text-xs">expected</span>
                        </>
                      )}
                    </TableCell>
                    <TableCell className="tnum text-right text-sm">
                      {total}
                      <span className="block text-xs text-muted-foreground">
                        {packages} pkg · {formatCbm(cbm)}
                      </span>
                    </TableCell>
                    <TableCell className="tnum text-sm">
                      {!here && !sailing ? (
                        <span className="text-muted-foreground">{T("Not sailed")}</span>
                      ) : here ? (
                        <div className="min-w-[7rem]">
                          <div className="flex items-center justify-between gap-2 text-xs">
                            <span
                              className={
                                left === 0
                                  ? "text-success"
                                  : "text-muted-foreground"
                              }
                            >
                              {left === 0 ? "Complete" : `${left} left`}
                            </span>
                            <span className="tnum font-medium">
                              {done} / {total}
                            </span>
                          </div>
                          {/* A bar rather than a second number: the question at
                              a glance is how far off finishing this box is. */}
                          <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                            <div
                              className={
                                left === 0
                                  ? "h-full rounded-full bg-success"
                                  : "h-full rounded-full bg-warning"
                              }
                              style={{
                                width: `${total === 0 ? 100 : Math.round(((done + gone) / total) * 100)}%`,
                              }}
                            />
                          </div>
                          {gone > 0 ? (
                            <span className="mt-1 block text-xs text-destructive">
                              {gone} missing
                            </span>
                          ) : null}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">{T("Not landed")}</span>
                      )}
                    </TableCell>
                    {/* Consignments signed off is not the same question as
                        boxes on the floor: a consignment can be checked in
                        while one of its five cartons is still missing, and this
                        is where that difference shows. */}
                    <TableCell
                      className={
                        arrivedPkgs < packages
                          ? "tnum hidden text-right text-sm text-warning 2xl:table-cell"
                          : "tnum hidden text-right text-sm text-muted-foreground 2xl:table-cell"
                      }
                    >
                      {here ? `${arrivedPkgs} / ${packages}` : "—"}
                    </TableCell>
                    <TableCell className="hidden text-sm text-muted-foreground 2xl:table-cell">
                      {checkers.length > 0 ? checkers.join(", ") : "Nobody yet"}
                    </TableCell>
                    <TableCell className="tnum hidden text-right text-sm text-muted-foreground 2xl:table-cell">
                      {waited === null ? "—" : `${waited}d`}
                    </TableCell>
                    <TableCell className="text-right">
                      {here ? (
                        /* At the port: inspect (missing, damaged) if needed,
                           then one press clears the lot into our warehouse. */
                        /* One line, one height: the next step is the only
                           solid button; undoing the arrival is a quiet
                           correction ahead of it. */
                        <div className="flex items-center justify-end gap-2 whitespace-nowrap">
                          {undoable ? (
                            <UndoArrivalButton
                              containerId={container.id}
                              reference={container.reference}
                              consignments={container.cargoLines.length}
                              checkedIn={checkedInHere}
                            />
                          ) : null}
                          {awaitingClearance > 0 ? (
                            <ClearanceButton
                              containerId={container.id}
                              waiting={awaitingClearance}
                              terms={terms}
                              size="sm"
                            />
                          ) : null}
                          <Button
                            asChild
                            size="sm"
                            variant={awaitingClearance === 0 && left > 0 ? "default" : "outline"}
                          >
                            <Link href={`/app/receive/dar/${container.id}`}>
                              {awaitingClearance > 0
                                ? T("Inspect")
                                : left > 0
                                  ? `${T("Check in")} (${left})`
                                  : T("Finish")}
                            </Link>
                          </Button>
                        </div>
                      ) : sailing ? (
                        <MarkArrivedButton containerId={container.id} />
                      ) : (
                        /* Nothing for Dar to do with a box still being filled
                           in Guangzhou — and arriving cannot be recorded for a
                           container that has not left. */
                        <Link
                          href={`/app/containers/${container.id}`}
                          className="text-sm text-muted-foreground hover:underline"
                        >
                          {T("See what is in it")}
                        </Link>
                      )}
                    </TableCell>
                    <TableCell className="w-10 text-right">
                      {/* The manifest, one press from every row — it is what a
                          clerk checks the boxes against. */}
                      <Link
                        href={`/app/containers/${container.id}/packing-list`}
                        aria-label={`Packing list for ${container.reference}`}
                        className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                      >
                        <FileText className="size-4" />
                      </Link>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
    </Table>
  );
}

export default async function DarReceivePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  await primeLocale();
  const user = await requirePermission("receiving.dar");
  const undo = {
    plain: can(user.role, "container.arrive"),
    counted: can(user.role, "container.undoCountedArrival"),
  };
  const { q } = await searchParams;
  const query = q?.trim().toLowerCase() ?? "";

  const [arrived, company] = await Promise.all([
    inboundContainers(),
    prisma.companySetting.findUnique({
      where: { id: "singleton" },
      select: { freeStorageDays: true, storagePerDay: true, storageCurrency: true },
    }),
  ]);
  const terms: StorageTerms = {
    freeDays: company?.freeStorageDays ?? 7,
    perDay: company?.storagePerDay?.toString() ?? null,
    currency: company?.storageCurrency ?? "USD",
  };

  /*
    THE DOCK, IN NUMBERS.

    A Dar morning has one question — how much is waiting to be checked off, and
    how much is still on the water — and it used to take scrolling a page of
    container cards to answer. Counted off the rows already loaded rather than
    with fresh queries: these figures describe exactly the list underneath, and
    a strip that disagreed with the list below it would be worse than no strip.
  */
  const landed = arrived.filter((c) => c.status === "ARRIVED");
  const atSea = arrived.filter(
    (c) => c.status === "DEPARTED" || c.status === "IN_TRANSIT"
  );
  /* Still in Guangzhou: sealed and waiting for a vessel, or still taking
     cargo. Shown last, and with nothing to press. */
  const inChina = arrived.filter(
    (c) => c.status === "OPEN" || c.status === "LOADING" || c.status === "LOADED" || c.status === "SEALED"
  );

  const lines = landed.flatMap((c) => c.cargoLines);
  const checkedIn = lines.filter((l) => l.cargo.darReceiving).length;
  const goneMissing = lines.filter(
    (l) => l.cargo.status === "MISSING_AT_DAR"
  ).length;
  const toCheck = lines.length - checkedIn - goneMissing;
  const progress = lines.length
    ? Math.round(((checkedIn + goneMissing) / lines.length) * 100)
    : 100;

  const flags = lines.filter(
    (l) => l.cargo.darReceiving?.discrepancy || l.cargo.status === "MISSING_AT_DAR"
  ).length;

  const arrivingCbm = atSea.reduce(
    (sum, c) => sum + c.cargoLines.reduce((n, l) => n + Number(l.cbm), 0),
    0
  );

  /* The oldest container still not closed off. Chasing is done by age, not by
     which one somebody remembers. */
  const oldestLanded = landed
    .filter((c) => c.cargoLines.some((l) => !l.cargo.darReceiving))
    .map((c) => c.shipment?.actualArrival)
    .filter((d): d is Date => Boolean(d))
    .sort((a, b) => a.getTime() - b.getTime())[0];
  const waitingDays = oldestLanded
    ? Math.floor((Date.now() - oldestLanded.getTime()) / 86_400_000)
    : null;

  /* Containers with nothing left to check are history, not work. They keep a
     short list of their own so a consignment that turns up late can still be
     added to the right box. */
  const open = landed.filter((c) =>
    c.cargoLines.some((l) => !l.cargo.darReceiving)
  );
  const closed = landed.filter(
    (c) =>
      c.cargoLines.length > 0 &&
      c.cargoLines.every((l) => l.cargo.darReceiving)
  );
  const working = [...open, ...atSea, ...inChina];

  /* Search runs over the rows already loaded — the whole inbound list is a
     handful of containers, and a round trip to the database to filter four
     rows is a round trip for nothing. */
  const matching = query
    ? working.filter((c) =>
        [
          c.reference,
          c.containerNumber,
          c.sealNumber,
          c.shipment?.vessel,
          c.shipment?.voyage,
        ]
          .filter(Boolean)
          .some((value) => value!.toLowerCase().includes(query))
      )
    : working;

  /*
    THE MOST URGENT ONE, SO NOBODY HUNTS FOR IT.

    Landed, oldest first, with boxes still unticked. It gets a button in the
    header and, once it has been sitting a day, a banner — because a container
    nobody has started is cargo nobody can invoice.
  */
  const next = open
    .slice()
    .sort(
      (a, b) =>
        (a.shipment?.actualArrival?.getTime() ?? 0) -
        (b.shipment?.actualArrival?.getTime() ?? 0)
    )[0];
  const nextWaited =
    next?.shipment?.actualArrival
      ? Math.max(
          0,
          Math.floor(
            (Date.now() - next.shipment.actualArrival.getTime()) / 86_400_000
          )
        )
      : 0;
  const nextUnchecked = next
    ? next.cargoLines.filter((l) => !l.cargo.darReceiving).length
    : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title={T("Receiving dock")}
        description={T("Everything inbound — on the water, landed, and being checked off. Oldest first; a container on the floor comes before one still at sea.")}
        actions={
          next ? (
            <Button asChild>
              <Link href={`/app/receive/dar/${next.id}`}>
                <ClipboardCheck />
                Check in {next.reference}
              </Link>
            </Button>
          ) : null
        }
      />
      <SectionTabs />

      <StatStrip
        chips={[
          { label: "To check in", value: String(toCheck), icon: ClipboardCheck, tone: toCheck > 0 ? "warning" : "success" },
          { label: "Landed", value: String(landed.length), icon: Warehouse },
          { label: "At sea", value: String(atSea.length), icon: Ship, tone: "marine" },
          { label: "Still in Guangzhou", value: String(inChina.length), icon: Warehouse },
          { label: "Arriving volume", value: `${arrivingCbm.toFixed(2)} CBM`, icon: Package },
          {
            label: "Oldest wait",
            value: waitingDays === null ? "—" : `${waitingDays} day(s)`,
            icon: Clock,
          },
          { label: "Flags", value: String(flags), icon: TriangleAlert, tone: flags > 0 ? "danger" : "neutral" },
        ]}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          index={0}
          label={T("Cargo to check in")}
          numeric={toCheck}
          icon={ClipboardCheck}
          tone={toCheck > 0 ? "signal" : "success"}
          ring={{ value: checkedIn + goneMissing, total: Math.max(1, lines.length) }}
          hint={`across ${open.length} container(s) on the floor · ${progress}% done`}
        />
        <KpiCard
          index={1}
          label={T("Containers on the floor")}
          numeric={open.length}
          icon={Warehouse}
          tone="brand"
          hint={T("Landed, not yet closed off")}
        />
        <KpiCard
          index={2}
          label={T("Containers at sea")}
          numeric={atSea.length}
          icon={Ship}
          tone="marine"
          hint={`${arrivingCbm.toFixed(2)} CBM arriving`}
        />
        <KpiCard
          index={3}
          label={T("Longest on the floor")}
          numeric={waitingDays ?? 0}
          suffix={waitingDays === null ? "" : " days"}
          icon={Clock}
          tone={waitingDays !== null && waitingDays > 2 ? "danger" : "success"}
          hint={T("Chase anything past two days")}
        />
      </div>


      {/* Only when something has genuinely been sitting. A banner that is
          always there is wallpaper. */}
      {next && nextWaited >= 1 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-y border-r border-l-4 border-l-destructive bg-destructive/5 px-4 py-3">
          <div className="flex items-start gap-3">
            <TriangleAlert className="mt-0.5 size-5 shrink-0 text-destructive" />
            <div>
              <p className="text-sm font-medium">
                {next.reference} has been on the floor for {nextWaited}{" "}
                {nextWaited === 1 ? "day" : "days"}
              </p>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {nextUnchecked} of {next.cargoLines.length} consignment(s) still
                unchecked. Customers cannot be invoiced until their cargo is
                checked in.
              </p>
            </div>
          </div>
          <Button asChild variant="destructive" size="sm">
            <Link href={`/app/receive/dar/${next.id}`}>{T("Open now")}</Link>
          </Button>
        </div>
      ) : null}

      {/*
        ONE ROW PER CONTAINER, NOT ONE CARD.

        Every inbound box laid out as a full card with its consignments already
        expanded meant a dock with four containers was four screens of scrolling
        before the clerk found the one on the forklift. The list is the index;
        opening a row is what shows the consignments.
      */}
      <Card>
        <div className="border-b p-3">
          <form>
            <Input
              name="q"
              defaultValue={q ?? ""}
              placeholder={T("Container, vessel, voyage or seal…")}
              className="max-w-lg"
              aria-label={T("Search inbound containers")}
            />
          </form>
        </div>

      </Card>

      {/*
        THE WORK, AND ONLY THE WORK.

        Everything still to do: on the water, being filled in Guangzhou, or
        landed with boxes left to tick. A container with nothing left on it is
        not work — it is history, and history has its own section below. It was
        appearing in both, wearing a green badge with nothing to press.
      */}
      <Card>
        <Queue
          rows={matching}
          terms={terms}
          undo={undo}
          query={query}
          emptyTitle="Nothing inbound"
          emptyDescription="No container is on the water or waiting to be checked in."
        />
      </Card>

      <p className="text-xs text-muted-foreground">
        {matching.length} of {working.length} inbound
      </p>

      {/* Closed off, and kept in reach. A consignment that turns up a week
          after the box was emptied still belongs to that box. */}
      {closed.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{T("Landed and checked in")}</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              {T("Open one to add a consignment that turned up after it was closed.")}
            </p>
          </CardHeader>
          <CardContent className="space-y-2">
            {closed.map((container) => (
              <Link
                key={container.id}
                href={`/app/containers/${container.id}`}
                className="flex items-center justify-between gap-3 rounded-lg border px-4 py-3 transition-colors hover:bg-secondary/50"
              >
                <span className="min-w-0">
                  <span className="tnum block text-sm font-medium">
                    {container.reference}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {container.shipment?.vessel ?? "Vessel not recorded"} ·{" "}
                    {container.cargoLines.length} consignment(s)
                  </span>
                </span>
                <Badge tone="good">
                  {container.cargoLines.every(
                    (l) => l.cargo.darReceiving?.verified
                  )
                    ? "Verified"
                    : "Checked in"}
                </Badge>
              </Link>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
