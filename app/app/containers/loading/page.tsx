import Link from "next/link";
import type { Metadata } from "next";
import type { ContainerStatus, ContainerType } from "@prisma/client";
import {
  ArrowRight,
  Boxes,
  ChevronDown,
  Lock,
  PackageOpen,
  Plus,
  Ship,
  Warehouse,
} from "lucide-react";

import { EmptyState } from "@/components/app/empty-state";
import { KpiCard } from "@/components/app/kpi-card";
import { ContainerTabs } from "@/components/app/container-tabs";
import { PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCbm, formatDate, formatWeight } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { requirePermission } from "@/lib/session";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Loading containers" };

const TYPE_LABEL: Record<ContainerType, string> = {
  GP_20: "20ft",
  GP_40: "40ft",
  HQ_40: "40ft High Cube",
  HQ_45: "45ft High Cube",
  LCL_CONSOLIDATED: "Consolidated",
};

/** What each type holds when nobody has recorded a capacity. */
const TYPE_CAPACITY: Record<ContainerType, number> = {
  GP_20: 33,
  GP_40: 67,
  HQ_40: 76,
  HQ_45: 86,
  LCL_CONSOLIDATED: 67,
};

/**
 * THREE STAGES OF A BOX IN GUANGZHOU.
 *
 * Open: the doors are open and cargo is still going in. Sealed: nothing goes in
 * or comes out, it is waiting for the vessel. Shipped: it has sailed. Each has
 * a different question attached — "how full is it", "when does it leave",
 * "what did it take" — so they are separated rather than mixed in one list.
 */
const GROUPS = {
  open: {
    label: "Taking cargo",
    statuses: ["OPEN", "LOADING"] as ContainerStatus[],
  },
  sealed: {
    label: "Sealed, waiting to sail",
    statuses: ["LOADED", "SEALED"] as ContainerStatus[],
  },
  shipped: {
    label: "Shipped",
    statuses: ["DEPARTED", "IN_TRANSIT"] as ContainerStatus[],
  },
} as const;
type Group = keyof typeof GROUPS;

const VIEWS = { all: "Everything", ...{ open: "Open", sealed: "Sealed", shipped: "Shipped" } } as const;
type View = keyof typeof VIEWS;

/**
 * CARGO WAITING TO LEAVE CHINA.
 *
 * Every container that is still in Guangzhou or has just sailed, with what is
 * inside each one a click away on this page — the loading bay should not have
 * to open six tabs to answer "is SC0041 on the box or still on the floor".
 *
 * Volumes here are China's own measurement. Dar will measure again and the two
 * are kept apart — this is a loading plan, not a bill.
 */
export default async function LoadingContainersPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const user = await requirePermission("container.view");
  const { view } = await searchParams;
  const chosen: View = view && view in VIEWS ? (view as View) : "all";

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const [containers, unassigned] = await Promise.all([
    prisma.container.findMany({
      where: {
        deletedAt: null,
        OR: [
          { status: { in: [...GROUPS.open.statuses, ...GROUPS.sealed.statuses] } },
          /* Shipped ones stay here for the month they left, so the bay can
             still answer "what went on the last box" without leaving the page. */
          {
            status: { in: GROUPS.shipped.statuses },
            updatedAt: { gte: new Date(Date.now() - 45 * 86_400_000) },
          },
        ],
      },
      orderBy: { createdAt: "desc" },
      include: {
        shipment: { select: { vessel: true, departureDate: true, eta: true } },
        cargoLines: {
          orderBy: { createdAt: "asc" },
          include: {
            cargo: {
              select: {
                id: true,
                reference: true,
                description: true,
                receiver: { select: { fullName: true, phone: true } },
                packages: {
                  where: { deletedAt: null },
                  select: { cargoType: true },
                },
                chinaReceiving: {
                  select: {
                    packagesCount: true,
                    piecesCount: true,
                    weightKg: true,
                    cbm: true,
                    receivedAt: true,
                  },
                },
              },
            },
          },
        },
      },
    }),
    /* Measured in Guangzhou and on no container. Receiving never asks which
       sailing — loading is picking cargo off the floor afterwards — so this is
       the floor, and it is the only place it is counted. */
    prisma.cargo.findMany({
      where: {
        deletedAt: null,
        chinaReceiving: { isNot: null },
        containerLines: { none: {} },
      },
      select: {
        chinaReceiving: {
          select: {
            packagesCount: true,
            piecesCount: true,
            weightKg: true,
            cbm: true,
            receivedAt: true,
          },
        },
      },
    }),
  ]);

  const groupOf = (status: ContainerStatus): Group =>
    (Object.keys(GROUPS) as Group[]).find((g) =>
      GROUPS[g].statuses.includes(status)
    ) ?? "shipped";

  const boxes = containers.map((container) => {
    const lines = container.cargoLines.map((l) => {
      const m = l.cargo.chinaReceiving;
      const types = [
        ...new Set(
          l.cargo.packages
            .map((p) => p.cargoType)
            .filter((t): t is string => Boolean(t))
        ),
      ];
      return {
        id: l.cargo.id,
        reference: l.cargo.reference,
        customer: l.cargo.receiver.fullName,
        phone: l.cargo.receiver.phone,
        goods: types.length > 0 ? types.join(", ") : (l.cargo.description ?? "—"),
        packages: m?.packagesCount ?? 0,
        pieces: m?.piecesCount ?? m?.packagesCount ?? 0,
        weight: Number(m?.weightKg ?? 0),
        cbm: Number(m?.cbm ?? 0),
        received: m?.receivedAt ?? null,
      };
    });
    const cbm = lines.reduce((s, l) => s + l.cbm, 0);
    const capacity = container.capacityCbm
      ? Number(container.capacityCbm)
      : TYPE_CAPACITY[container.type];
    return {
      container,
      group: groupOf(container.status),
      lines,
      cbm,
      capacity,
      fill: capacity > 0 ? Math.min(100, Math.round((cbm / capacity) * 100)) : 0,
      packages: lines.reduce((s, l) => s + l.packages, 0),
      pieces: lines.reduce((s, l) => s + l.pieces, 0),
      weight: lines.reduce((s, l) => s + l.weight, 0),
      customers: new Set(lines.map((l) => l.customer)).size,
    };
  });

  const floor = unassigned
    .map((c) => c.chinaReceiving)
    .filter((r): r is NonNullable<typeof r> => r !== null);
  const floorCbm = floor.reduce((s, r) => s + Number(r.cbm), 0);
  const floorOldest = floor.reduce<Date | null>(
    (old, r) => (!old || r.receivedAt < old ? r.receivedAt : old),
    null
  );

  const inGroup = (g: Group) => boxes.filter((b) => b.group === g);
  const openBoxes = inGroup("open");
  const sealedBoxes = inGroup("sealed");
  const shippedBoxes = inGroup("shipped");

  const counts: Record<View, number> = {
    all: boxes.length,
    open: openBoxes.length,
    sealed: sealedBoxes.length,
    shipped: shippedBoxes.length,
  };

  const shownGroups = (Object.keys(GROUPS) as Group[]).filter(
    (g) => chosen === "all" || chosen === g
  );

  const floorDays = floorOldest
    ? Math.floor((Date.now() - floorOldest.getTime()) / 86_400_000)
    : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Loading containers"
        description="Every box still in Guangzhou and the ones that have just sailed. Open one to see exactly what is inside."
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
      <ContainerTabs />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          index={0}
          label="Taking cargo"
          numeric={openBoxes.length}
          icon={PackageOpen}
          tone="signal"
          hint={`${formatCbm(openBoxes.reduce((s, b) => s + b.cbm, 0))} loaded so far`}
          href="/app/containers/loading?view=open"
        />
        <KpiCard
          index={1}
          label="Sealed, waiting to sail"
          numeric={sealedBoxes.length}
          icon={Lock}
          tone="brand"
          hint={`${sealedBoxes.reduce((s, b) => s + b.lines.length, 0)} consignments on board`}
          href="/app/containers/loading?view=sealed"
        />
        <KpiCard
          index={2}
          label="On the Guangzhou floor"
          numeric={floor.length}
          icon={Warehouse}
          tone={floorDays >= 14 ? "warning" : "marine"}
          hint={
            floor.length > 0
              ? `${formatCbm(floorCbm)} on no container · oldest ${floorDays}d`
              : "Everything measured is on a box"
          }
          href="/app/cargo?stage=china"
        />
        <KpiCard
          index={3}
          label="Shipped recently"
          numeric={shippedBoxes.length}
          icon={Ship}
          tone="success"
          hint={`${shippedBoxes.reduce((s, b) => s + b.lines.length, 0)} consignments at sea`}
          href="/app/containers/loading?view=shipped"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        {(Object.keys(VIEWS) as View[]).map((key) => (
          <Link
            key={key}
            href={`/app/containers/loading?view=${key}`}
            className={cn(
              "flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm transition-colors",
              chosen === key
                ? "border-brand bg-brand text-brand-foreground"
                : "bg-card hover:bg-secondary"
            )}
          >
            {VIEWS[key]}
            <span className="tnum text-xs opacity-70">{counts[key]}</span>
          </Link>
        ))}
      </div>

      {boxes.length === 0 ? (
        <div className="rounded-xl border bg-card">
          <EmptyState
            icon="Container"
            title="No container is open"
            description="Cargo measured in Guangzhou waits on the floor until a container is opened for it."
          />
        </div>
      ) : null}

      {shownGroups.map((group) => {
        const list = inGroup(group);
        if (list.length === 0) return null;
        return (
          <section key={group} className="space-y-3">
            <h2 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
              {GROUPS[group].label}
              <span className="tnum rounded bg-secondary px-1.5 py-0.5 normal-case tracking-normal">
                {list.length}
              </span>
            </h2>

            <div className="space-y-3">
              {list.map((box) => (
                /* A native disclosure: the cargo list opens in place with no
                   script, so it works on the warehouse's slowest tablet. */
                <details
                  key={box.container.id}
                  open={group === "open" && list.length === 1}
                  className="group overflow-hidden rounded-xl border bg-card shadow-soft"
                >
                  <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-6 gap-y-3 px-5 py-4 hover:bg-secondary/40 [&::-webkit-details-marker]:hidden">
                    <span
                      className={cn(
                        "h-10 w-1 shrink-0 rounded-full",
                        group === "open"
                          ? "bg-amber-500"
                          : group === "sealed"
                            ? "bg-brand"
                            : "bg-emerald-500"
                      )}
                    />
                    <div className="min-w-[11rem]">
                      <p className="tnum font-semibold">
                        {box.container.reference}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {TYPE_LABEL[box.container.type]}
                        {box.container.sealNumber
                          ? ` · seal ${box.container.sealNumber}`
                          : ""}
                      </p>
                    </div>

                    <Badge
                      tone={
                        group === "open"
                          ? "warn"
                          : group === "sealed"
                            ? "progress"
                            : "good"
                      }
                    >
                      {group === "open"
                        ? "Open"
                        : group === "sealed"
                          ? "Sealed"
                          : box.container.status === "IN_TRANSIT"
                            ? "In transit"
                            : "Departed"}
                    </Badge>

                    {/* How full, as a bar. "18.9 m³" means nothing on its own;
                        "18.9 of 76" is the question the loading bay asks. */}
                    <div className="min-w-[12rem] flex-1">
                      <div className="flex items-baseline justify-between text-xs">
                        <span className="tnum font-medium">
                          {formatCbm(box.cbm)}{" "}
                          <span className="text-muted-foreground">
                            of {box.capacity} m³
                          </span>
                        </span>
                        <span className="tnum text-muted-foreground">
                          {box.fill}%
                        </span>
                      </div>
                      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-secondary">
                        <div
                          className={cn(
                            "h-full rounded-full",
                            box.fill >= 95
                              ? "bg-emerald-500"
                              : box.fill >= 70
                                ? "bg-brand"
                                : "bg-amber-500"
                          )}
                          style={{ width: `${Math.max(2, box.fill)}%` }}
                        />
                      </div>
                    </div>

                    <dl className="flex gap-6 text-center">
                      {[
                        ["Cargo", box.lines.length],
                        ["Customers", box.customers],
                        ["Packages", box.packages],
                        ["Pieces", box.pieces],
                      ].map(([label, value]) => (
                        <div key={label as string}>
                          <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">
                            {label}
                          </dt>
                          <dd className="tnum text-sm font-semibold">{value}</dd>
                        </div>
                      ))}
                    </dl>

                    <div className="min-w-[9rem] text-right text-xs text-muted-foreground">
                      {group === "shipped" ? (
                        <>
                          <span className="block">
                            {box.container.shipment?.vessel ?? "Vessel not recorded"}
                          </span>
                          left{" "}
                          {formatDate(
                            box.container.shipment?.departureDate ??
                              box.container.sealedAt
                          )}
                        </>
                      ) : group === "sealed" ? (
                        <>
                          <span className="block">
                            sealed {formatDate(box.container.sealedAt)}
                          </span>
                          {box.container.shipment?.vessel ?? "no vessel yet"}
                        </>
                      ) : (
                        <>
                          <span className="block">
                            opened {formatDate(box.container.createdAt)}
                          </span>
                          {box.container.cargoDeadline
                            ? `closes ${formatDate(box.container.cargoDeadline)}`
                            : "no closing date"}
                        </>
                      )}
                    </div>

                    <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
                  </summary>

                  <div className="border-t">
                    {box.lines.length === 0 ? (
                      <p className="px-5 py-6 text-sm text-muted-foreground">
                        Nothing loaded yet. Pick cargo off the Guangzhou floor
                        from inside the container.
                      </p>
                    ) : (
                      <div className="relative overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                              <th className="px-5 py-2 font-medium">Tracking</th>
                              <th className="px-3 py-2 font-medium">Customer</th>
                              <th className="px-3 py-2 font-medium">Goods</th>
                              <th className="px-3 py-2 text-right font-medium">Pkgs</th>
                              <th className="px-3 py-2 text-right font-medium">Pieces</th>
                              <th className="px-3 py-2 text-right font-medium">Weight</th>
                              <th className="px-3 py-2 text-right font-medium">Volume</th>
                              <th className="px-5 py-2 text-right font-medium">Received</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y">
                            {box.lines.map((line) => (
                              <tr key={line.id} className="hover:bg-secondary/30">
                                <td className="px-5 py-2.5">
                                  <Link
                                    href={`/app/cargo/${line.id}`}
                                    className="tnum font-medium hover:underline"
                                  >
                                    {line.reference}
                                  </Link>
                                </td>
                                <td className="px-3 py-2.5">
                                  {line.customer}
                                  <span className="tnum block text-xs text-muted-foreground">
                                    {line.phone}
                                  </span>
                                </td>
                                <td className="max-w-[14rem] truncate px-3 py-2.5 text-muted-foreground">
                                  {line.goods}
                                </td>
                                <td className="tnum px-3 py-2.5 text-right">
                                  {line.packages}
                                </td>
                                <td className="tnum px-3 py-2.5 text-right">
                                  {line.pieces}
                                </td>
                                <td className="tnum px-3 py-2.5 text-right text-muted-foreground">
                                  {line.weight > 0 ? formatWeight(line.weight) : "—"}
                                </td>
                                <td className="tnum px-3 py-2.5 text-right">
                                  {formatCbm(line.cbm)}
                                </td>
                                <td className="tnum px-5 py-2.5 text-right text-xs text-muted-foreground">
                                  {formatDate(line.received)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr className="border-t bg-secondary/30 font-medium">
                              <td className="px-5 py-2.5" colSpan={3}>
                                {box.lines.length} consignments ·{" "}
                                {box.customers} customers
                              </td>
                              <td className="tnum px-3 py-2.5 text-right">
                                {box.packages}
                              </td>
                              <td className="tnum px-3 py-2.5 text-right">
                                {box.pieces}
                              </td>
                              <td className="tnum px-3 py-2.5 text-right">
                                {box.weight > 0 ? formatWeight(box.weight) : "—"}
                              </td>
                              <td className="tnum px-3 py-2.5 text-right">
                                {formatCbm(box.cbm)}
                              </td>
                              <td className="px-5 py-2.5" />
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    )}
                    <div className="flex justify-end border-t px-5 py-3">
                      <Button asChild size="sm" variant="outline">
                        <Link href={`/app/containers/${box.container.id}`}>
                          {group === "open" ? "Load cargo" : "Open container"}
                          <ArrowRight className="ml-1.5 size-4" />
                        </Link>
                      </Button>
                    </div>
                  </div>
                </details>
              ))}
            </div>
          </section>
        );
      })}

      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Boxes className="size-4" />
        Containers that have landed in Dar are on{" "}
        <Link
          href="/app/containers/arrived"
          className="text-brand hover:underline"
        >
          Arrived containers
        </Link>
        .
      </p>
    </div>
  );
}
