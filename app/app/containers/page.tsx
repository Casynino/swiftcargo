import Link from "next/link";
import type { Metadata } from "next";
import type { ContainerStatus } from "@prisma/client";
import {
  Anchor,
  ChevronRight,
  Container as ContainerIcon,
  Plus,
  Ship,
  Warehouse,
} from "lucide-react";

import { EmptyState } from "@/components/app/empty-state";
import { KpiCard } from "@/components/app/kpi-card";
import { PageHeader } from "@/components/app/page-header";
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
import { CONTAINER_STATUS_LABELS, ROUTE } from "@/lib/constants";
import { formatCbm, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { requirePermission } from "@/lib/session";

export const metadata: Metadata = { title: "Shipments" };

const STATUSES = Object.keys(CONTAINER_STATUS_LABELS) as ContainerStatus[];

/** The stripe down the left of a row — the same reading as the badge, seen from
    the other side of the desk. */
const ACCENT: Record<ContainerStatus, string> = {
  OPEN: "bg-muted-foreground/30",
  LOADING: "bg-amber-500",
  LOADED: "bg-amber-500",
  SEALED: "bg-brand",
  DEPARTED: "bg-brand",
  IN_TRANSIT: "bg-brand",
  ARRIVED: "bg-emerald-500",
  CLOSED: "bg-muted-foreground/30",
};

const TONE: Record<ContainerStatus, "neutral" | "progress" | "good" | "warn"> = {
  OPEN: "neutral",
  LOADING: "warn",
  LOADED: "warn",
  SEALED: "progress",
  DEPARTED: "progress",
  IN_TRANSIT: "progress",
  ARRIVED: "good",
  CLOSED: "neutral",
};

/*
  THE VIEWS A SHIPPING DESK ACTUALLY ASKS FOR.

  Not the eight raw statuses — nobody walks in wanting "LOADED" — but the four
  questions somebody has when they open this page: what can I still put cargo
  in, what has gone, what has landed, and show me everything.
*/
const VIEWS = {
  loading: {
    label: "Taking cargo",
    statuses: ["OPEN", "LOADING"] as ContainerStatus[],
  },
  sealed: { label: "Sealed", statuses: ["LOADED", "SEALED"] as ContainerStatus[] },
  sea: {
    label: "At sea",
    statuses: ["DEPARTED", "IN_TRANSIT"] as ContainerStatus[],
  },
  landed: {
    label: "Landed",
    statuses: ["ARRIVED", "CLOSED"] as ContainerStatus[],
  },
} as const;

type View = keyof typeof VIEWS;

export default async function ContainersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; view?: string; q?: string }>;
}) {
  const user = await requirePermission("container.view");
  const { status, view, q } = await searchParams;
  const query = q?.trim() ?? "";

  /* `?status=` still works — the dashboard tiles link that way. */
  const legacy = STATUSES.includes(status as ContainerStatus)
    ? (status as ContainerStatus)
    : null;
  const chosen = (view && view in VIEWS ? (view as View) : null) ?? null;

  const filter: ContainerStatus[] | null = chosen
    ? [...VIEWS[chosen].statuses]
    : legacy
      ? [legacy]
      : null;

  /*
    THE STATE OF THE ROUTE, ABOVE THE LIST.

    Counted with their own queries rather than off the rows below, because the
    rows are filtered and capped — a strip that changed every time somebody
    picked a status would be describing the filter, not the business.
  */
  const live = { deletedAt: null };
  const [accepting, sealed, atSea, landed, sailingVolume] = await Promise.all([
    prisma.container.count({
      where: { ...live, status: { in: ["OPEN", "LOADING"] } },
    }),
    prisma.container.count({ where: { ...live, status: { in: ["SEALED", "LOADED"] } } }),
    prisma.container.count({
      where: { ...live, status: { in: ["DEPARTED", "IN_TRANSIT"] } },
    }),
    prisma.container.count({ where: { ...live, status: "ARRIVED" } }),
    prisma.containerCargo.aggregate({
      _sum: { cbm: true },
      where: {
        container: { ...live, status: { in: ["DEPARTED", "IN_TRANSIT"] } },
      },
    }),
  ]);

  const viewCounts = Object.fromEntries(
    await Promise.all(
      (Object.keys(VIEWS) as View[]).map(async (key) => [
        key,
        await prisma.container.count({
          where: { deletedAt: null, status: { in: [...VIEWS[key].statuses] } },
        }),
      ])
    )
  ) as Record<View, number>;
  const allCount = await prisma.container.count({ where: { deletedAt: null } });

  const containers = await prisma.container.findMany({
    where: {
      deletedAt: null,
      ...(filter ? { status: { in: filter } } : {}),
      ...(query
        ? {
            OR: [
              { reference: { contains: query, mode: "insensitive" as const } },
              { containerNumber: { contains: query, mode: "insensitive" as const } },
              { sealNumber: { contains: query, mode: "insensitive" as const } },
              { shipment: { vessel: { contains: query, mode: "insensitive" as const } } },
              { shipment: { voyage: { contains: query, mode: "insensitive" as const } } },
            ],
          }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 80,
    include: {
      shipment: true,
      packingList: { select: { number: true } },
      cargoLines: {
        select: {
          cbm: true,
          weightKg: true,
          packagesCount: true,
          cargo: { select: { senderId: true } },
        },
      },
      _count: { select: { cargoLines: true } },
    },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Shipments"
        description="One box, one sailing, many customers. Open it, load it, seal it, send it — a sailing that has gone is the warehouse's history of it."
        actions={
          can(user.role, "container.create") ? (
            <Button asChild>
              <Link href="/app/containers/new">
                <Plus />
                Open a container
              </Link>
            </Button>
          ) : null
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
        <KpiCard
          index={0}
          label="Taking cargo"
          numeric={accepting}
          icon={Warehouse}
          tone="brand"
          hint="Open for loading in Guangzhou"
          href="/app/containers?status=LOADING"
        />
        <KpiCard
          index={1}
          label="Sealed"
          numeric={sealed}
          icon={ContainerIcon}
          tone={sealed > 0 ? "warning" : "success"}
          hint="Shut and waiting for the vessel"
          href="/app/containers?status=SEALED"
        />
        <KpiCard
          index={2}
          label="At sea"
          numeric={atSea}
          icon={Ship}
          tone="marine"
          hint={`${ROUTE.transitDaysMin}–${ROUTE.transitDaysMax} days to ${ROUTE.destinationCity}`}
          href="/app/containers?status=IN_TRANSIT"
        />
        <KpiCard
          index={3}
          label="Volume at sea"
          numeric={Number(sailingVolume._sum.cbm ?? 0)}
          decimals={2}
          suffix="CBM"
          icon={Anchor}
          tone="signal"
        />
        <KpiCard
          index={4}
          label="Landed"
          numeric={landed}
          icon={ContainerIcon}
          tone="success"
          hint="Arrived, being booked in at Dar"
          href="/app/containers?status=ARRIVED"
        />
      </div>

      {/*
        THE FOUR QUESTIONS, AS BUTTONS.

        A dropdown of eight raw statuses made somebody translate "what can I
        still load" into LOADING-or-OPEN before they could ask it. The counts
        are on the buttons because half the answer is usually the number.
      */}
      <div className="space-y-3">
        <form>
          <Input
            name="q"
            defaultValue={query}
            placeholder="Container, seal, vessel or voyage…"
            className="max-w-lg"
            aria-label="Search sailings"
          />
        </form>

        <div className="flex flex-wrap gap-2">
          {[
            ["", "Everything", allCount] as const,
            ...(Object.keys(VIEWS) as View[]).map(
              (key) => [key, VIEWS[key].label, viewCounts[key]] as const
            ),
          ].map(([key, label, count]) => {
            const active = key === "" ? !chosen && !legacy : chosen === key;
            return (
              <Link
                key={label}
                href={key ? `/app/containers?view=${key}` : "/app/containers"}
                className={cn(
                  "inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm transition-colors",
                  active
                    ? "border-brand bg-brand text-brand-foreground"
                    : "hover:bg-secondary"
                )}
              >
                {label}
                <span
                  className={cn(
                    "tnum rounded-full px-1.5 text-xs font-semibold",
                    active ? "bg-white/20" : "bg-secondary"
                  )}
                >
                  {count}
                </span>
              </Link>
            );
          })}
        </div>
      </div>

      {/* What is actually on the screen, said once, so nobody counts the rows. */}
      <p className="tnum text-sm text-muted-foreground">
        {containers.length} {containers.length === 1 ? "container" : "containers"}
        {" · "}
        {containers.reduce((sum, c) => sum + c._count.cargoLines, 0)} consignments
        {" · "}
        {formatCbm(
          containers.reduce(
            (sum, c) => sum + c.cargoLines.reduce((n, l) => n + Number(l.cbm), 0),
            0
          )
        )}
      </p>

      <Card>
        {containers.length === 0 ? (
          <EmptyState
            icon="Container"
            title={query || chosen ? "Nothing matches" : "Nothing sailing"}
            description={
              query || chosen
                ? "Try another word, or pick Everything above."
                : "Open a container to start loading cargo for a sailing."
            }
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-1 p-0" />
                <TableHead>Container</TableHead>
                <TableHead className="hidden 2xl:table-cell">Packing list</TableHead>
                <TableHead className="hidden xl:table-cell">Vessel / voyage</TableHead>
                <TableHead className="text-right">Cargo</TableHead>
                <TableHead className="text-right">Customers</TableHead>
                <TableHead className="hidden text-right md:table-cell">Packages</TableHead>
                <TableHead className="hidden text-right lg:table-cell">Weight</TableHead>
                <TableHead className="text-right">CBM</TableHead>
                <TableHead className="hidden lg:table-cell">Departed</TableHead>
                <TableHead className="hidden lg:table-cell">ETA</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {containers.map((c) => {
                const cbm = c.cargoLines.reduce((sum, l) => sum + Number(l.cbm), 0);
                /* Customers, not lines: one customer routinely has several
                   consignments in the same box, and "18 customers" is the
                   figure that says how many people this sailing concerns. */
                const customers = new Set(
                  c.cargoLines.map((l) => l.cargo.senderId)
                ).size;
                const packages = c.cargoLines.reduce(
                  (sum, l) => sum + l.packagesCount,
                  0
                );
                const weight = c.cargoLines.reduce(
                  (sum, l) => sum + Number(l.weightKg ?? 0),
                  0
                );
                const fill = c.capacityCbm
                  ? Math.min(100, Math.round((cbm / Number(c.capacityCbm)) * 100))
                  : null;
                return (
                  <TableRow key={c.id} className="group">
                    <TableCell className="w-1 p-0">
                      <span
                        className={cn("block h-9 w-1 rounded-r", ACCENT[c.status])}
                        aria-hidden
                      />
                    </TableCell>
                    <TableCell>
                      {/* OUR NUMBER LEADS. It runs from one and never changes;
                          the shipping line's box number arrives late, changes
                          between sailings, and is sometimes never allocated at
                          all. Reading the list by the line's number meant
                          reading it by the one thing we do not control. */}
                      <Link
                        href={`/app/containers/${c.id}`}
                        className="tnum font-medium hover:underline"
                      >
                        {c.reference}
                      </Link>
                      {/* Nothing under it. The seal and the line's own box
                          number both live on the container's page; a list is
                          for finding a sailing, and our number does that. */}
                    </TableCell>
                    <TableCell className="hidden 2xl:table-cell">
                      <Link
                        href={`/app/containers/${c.id}/packing-list`}
                        className="tnum text-sm text-muted-foreground hover:underline"
                      >
                        {c.packingList?.number ?? "Provisional"}
                      </Link>
                    </TableCell>
                    <TableCell className="hidden text-sm text-muted-foreground xl:table-cell">
                      {c.shipment?.vessel ?? "—"}
                      {c.shipment?.voyage ? ` / ${c.shipment.voyage}` : ""}
                    </TableCell>
                    <TableCell className="tnum text-right text-sm">
                      {c._count.cargoLines}
                    </TableCell>
                    <TableCell className="tnum text-right text-sm">
                      {customers}
                    </TableCell>
                    <TableCell className="tnum hidden text-right text-sm text-muted-foreground md:table-cell">
                      {packages || "—"}
                    </TableCell>
                    <TableCell className="tnum hidden text-right text-sm text-muted-foreground lg:table-cell">
                      {weight > 0 ? `${weight.toFixed(0)} kg` : "—"}
                    </TableCell>
                    <TableCell className="tnum text-right text-sm font-medium">
                      {formatCbm(cbm)}
                      {fill !== null ? (
                        <span className="block text-xs text-muted-foreground">
                          {fill}% full
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell className="hidden text-sm text-muted-foreground lg:table-cell">
                      {formatDate(c.shipment?.departureDate)}
                    </TableCell>
                    <TableCell className="hidden text-sm text-muted-foreground lg:table-cell">
                      {formatDate(c.shipment?.actualArrival ?? c.shipment?.eta)}
                    </TableCell>
                    <TableCell>
                      <Badge tone={TONE[c.status]}>
                        {CONTAINER_STATUS_LABELS[c.status]}
                      </Badge>
                    </TableCell>
                    {/* The way in. The reference is a link too, but it is four
                        characters wide and people were not finding it — the
                        end of the row is where a hand already is. */}
                    <TableCell className="w-10 text-right">
                      <Link
                        href={`/app/containers/${c.id}`}
                        aria-label={`Open ${c.reference}`}
                        className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground group-hover:text-foreground"
                      >
                        <ChevronRight className="size-4" />
                      </Link>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
