import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import {
  ClipboardCheck,
  ClipboardList,
  PackageOpen,
  PackagePlus,
  PackageX,
  ScanLine,
  ScanSearch,
  TriangleAlert,
} from "lucide-react";

import { CheckInList } from "@/components/app/check-in-list";
import { PageHeader } from "@/components/app/page-header";
import { StatStrip } from "@/components/app/stat-strip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCbm, formatDate } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { requirePermission } from "@/lib/session";
import { BoxScanner } from "@/components/app/box-scanner";
import { cargoTypeOptions } from "@/lib/valuation";

import { primeLocale, T } from "@/lib/server-t";
export const metadata: Metadata = { title: "Check in cargo" };

/**
 * ONE CONTAINER, ON ITS OWN SCREEN.
 *
 * Checking a box off is a job somebody stands and does for an hour with a
 * clipboard, not a panel underneath a list of other containers. The dock is the
 * index; this is the work. Opening the wrong one is one press of Back.
 *
 * Expected against actual, line by line. China's figures sit beside the fields
 * and are never filled in for anybody — a pre-filled count is a count nobody
 * takes.
 */
export default async function CheckInContainerPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ cargo?: string }>;
}) {
  await primeLocale();
  const user = await requirePermission("receiving.dar");
  const { id } = await params;
  const { cargo: cargoId } = await searchParams;

  const [container, warehouses] = await Promise.all([
    prisma.container.findFirst({
      where: { id, deletedAt: null },
      include: {
        shipment: true,
        cargoLines: {
          include: {
            cargo: {
              include: {
                sender: { select: { fullName: true } },
                chinaReceiving: true,
                darReceiving: {
                  include: { receivedBy: { select: { name: true } } },
                },
                exceptions: {
                  where: { status: { notIn: ["RESOLVED", "CLOSED"] } },
                  select: { id: true, type: true },
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
    }),
    prisma.warehouse.findMany({
      where: { active: true, kind: "TANZANIA" },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);
  if (!container) notFound();

  /*
    WHAT THE FLOOR NEEDS TO CORRECT A MANIFEST, FETCHED ONLY IF IT MAY.

    The rate book's categories, the other landed containers a bale might have
    come off, and the consignments that could be added to this one. The last
    list is deliberately narrow: cargo that is at sea or landed and is not
    already on a container somebody has discharged.
  */
  const mayAmend = can(user.role, "container.amendArrived");
  const [cargoTypes, otherContainers, addable] = await Promise.all([
    cargoTypeOptions(),
    mayAmend
      ? prisma.container.findMany({
          where: {
            deletedAt: null,
            id: { not: container.id },
            status: { in: ["ARRIVED", "CLOSED"] },
          },
          orderBy: { createdAt: "desc" },
          take: 40,
          select: { id: true, reference: true },
        })
      : Promise.resolve([] as { id: string; reference: string }[]),
    mayAmend
      ? prisma.cargo.findMany({
          where: {
            deletedAt: null,
            status: {
              in: [
                "RECEIVED_CHINA",
                "ASSIGNED_TO_CONTAINER",
                "CONTAINER_LOADED",
                "DEPARTED_CHINA",
                "IN_TRANSIT",
                "ARRIVED_TANZANIA",
                "MISSING_AT_DAR",
              ],
            },
            containerLines: {
              none: { container: { status: { in: ["ARRIVED", "CLOSED"] } } },
            },
            invoices: { none: { status: { notIn: ["DRAFT", "CANCELLED"] } } },
          },
          orderBy: { createdAt: "desc" },
          take: 200,
          select: {
            id: true,
            reference: true,
            shippingMark: true,
            description: true,
            sender: { select: { fullName: true } },
          },
        })
      : Promise.resolve([]),
  ]);

  const done = container.cargoLines.filter((l) => l.cargo.darReceiving).length;
  const missing = container.cargoLines.filter(
    (l) => l.cargo.status === "MISSING_AT_DAR"
  ).length;
  const waiting = container.cargoLines.length - done - missing;

  /*
    EXPECTED AGAINST CONFIRMED, FOR THE WHOLE BOX.

    The rows say it consignment by consignment; this says it for the container,
    which is the number the floor is asked about — "did it all come off?" — and
    the one a clerk was working out on paper from ninety rows. China's side is
    what Guangzhou measured into the box; Dar's side is what has actually been
    counted out of it so far, so the two only meet when the job is finished.
    Neither column is corrected by the other.
  */
  const expected = container.cargoLines.reduce(
    (sum, l) => ({
      packages: sum.packages + (l.cargo.chinaReceiving?.packagesCount ?? l.cargo.declaredPackages ?? 0),
      pieces:
        sum.pieces +
        (l.cargo.chinaReceiving?.piecesCount ??
          l.cargo.packages.reduce((n, k) => n + (k.pieces ?? 0), 0)),
      cbm: sum.cbm + Number(l.cargo.chinaReceiving?.cbm ?? l.cbm),
    }),
    { packages: 0, pieces: 0, cbm: 0 }
  );
  const confirmed = container.cargoLines.reduce(
    (sum, l) => ({
      packages: sum.packages + (l.cargo.darReceiving?.packagesCount ?? 0),
      pieces: sum.pieces + (l.cargo.darReceiving?.piecesCount ?? 0),
      cbm: sum.cbm + Number(l.cargo.darReceiving?.cbm ?? 0),
    }),
    { packages: 0, pieces: 0, cbm: 0 }
  );

  const damaged = container.cargoLines.filter(
    (l) => l.cargo.darReceiving && l.cargo.darReceiving.condition !== "GOOD"
  ).length;
  /* The count or the condition did not match, or somebody raised a case on the
     consignment by hand. A consignment that never came off has its own figure
     beside this one and is deliberately not counted twice. */
  const discrepancies = container.cargoLines.filter(
    (l) =>
      l.cargo.status !== "MISSING_AT_DAR" &&
      (l.cargo.darReceiving?.discrepancy || l.cargo.exceptions.length > 0)
  ).length;
  /* Cargo the frozen packing list does not carry, or carries against another
     box: put on this manifest at Dar, and each one holding the case that says
     so. The case IS the flag — nothing else on the row would tell them apart. */
  const additional = container.cargoLines.filter((l) =>
    l.cargo.exceptions.some(
      (e) => e.type === "UNIDENTIFIED_CARGO" || e.type === "WRONG_CONTAINER"
    )
  ).length;
  /* Counted, but nobody has signed it off yet. Verifying was a screen of its
     own once; it is the last move of checking a container in, so it happens
     here, on the row that was just counted. A line with an open case cannot be
     signed off — that is what the case is for. */
  const toVerify = container.cargoLines.filter(
    (l) =>
      l.cargo.darReceiving &&
      !l.cargo.darReceiving.verified &&
      l.cargo.exceptions.length === 0
  ).length;
  const sign = (n: number) => (n > 0 ? `+${n}` : String(n));

  const [boxesDone, boxesTotal] = await Promise.all([
    prisma.cargoBox.count({ where: { voidedAt: null, darReceivedAt: { not: null }, darContainerId: container.id } }),
    prisma.cargoBox.count({ where: { voidedAt: null, package: { containerId: container.id, deletedAt: null } } }),
  ]);
  const boxProgress = { done: boxesDone, total: boxesTotal };

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Check in ${container.reference}`}
        description={`${container.shipment?.vessel ?? "Vessel not recorded"}${
          container.shipment?.voyage ? ` / ${container.shipment.voyage}` : ""
        } · arrived ${formatDate(container.shipment?.actualArrival)}`}
        back={{ href: "/app/receive/dar", label: "Receiving dock" }}
        actions={
          <>
            <Badge tone={waiting === 0 ? "good" : "progress"}>
              {done} of {container.cargoLines.length} checked in
            </Badge>
            <Button asChild variant="outline">
              <Link href={`/app/containers/${container.id}/packing-list`}>
                <ClipboardList />
                {T("Packing list")}
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href={`/app/containers/${container.id}/labels`}>
                <ScanLine />
                {T("Box labels")}
              </Link>
            </Button>
          </>
        }
      />

      {/* Every box off the container, scanned one at a time. Arrival only —
          each consignment is still checked in below. */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ScanLine className="size-4" />
            {T("Scan boxes off the container")}
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Scan the sticker on every box as it comes off. Each box is marked as arrived with your name and the time;
            a box from another container, one scanned twice or one already handed over is flagged straight away.
          </p>
        </CardHeader>
        <CardContent>
          <BoxScanner mode="dar" containerId={container.id} initial={boxProgress} />
        </CardContent>
      </Card>

      {/*
        THE CONTAINER'S OWN ARITHMETIC, ABOVE THE ROWS THAT MAKE IT.

        Expected against confirmed, then every category the floor has to answer
        for before it signs the box off. Counted off the rows already loaded:
        these figures describe exactly the list underneath, and a strip that
        disagreed with the list below it would be worse than no strip.
      */}
      <StatStrip
        chips={[
          {
            label: "Packages",
            /* The gap is named only once the box is worked through: until then
               it is the job in progress, not a shortage. */
            value:
              waiting === 0 && confirmed.packages !== expected.packages
                ? `${confirmed.packages} / ${expected.packages} (${sign(confirmed.packages - expected.packages)})`
                : `${confirmed.packages} / ${expected.packages}`,
            icon: PackageOpen,
            tone:
              waiting > 0
                ? "neutral"
                : confirmed.packages === expected.packages
                  ? "success"
                  : "warning",
          },
          ...(expected.pieces > 0
            ? [
                {
                  label: "Pieces",
                  value: `${confirmed.pieces} / ${expected.pieces}`,
                  icon: PackageOpen,
                },
              ]
            : []),
          {
            label: "Volume",
            value: `${formatCbm(confirmed.cbm)} / ${formatCbm(expected.cbm)}`,
            icon: ScanSearch,
          },
          { label: "Received", value: String(done), icon: ClipboardCheck, tone: "success" },
          {
            label: "Unchecked",
            value: String(waiting),
            icon: ClipboardCheck,
            tone: waiting > 0 ? "warning" : "success",
          },
          {
            label: "Missing",
            value: String(missing),
            icon: PackageX,
            tone: missing > 0 ? "danger" : "neutral",
          },
          {
            label: "Damaged",
            value: String(damaged),
            icon: TriangleAlert,
            tone: damaged > 0 ? "danger" : "neutral",
          },
          {
            label: "Discrepancies",
            value: String(discrepancies),
            icon: TriangleAlert,
            tone: discrepancies > 0 ? "warning" : "neutral",
          },
          {
            label: "Added here",
            value: String(additional),
            icon: PackagePlus,
            tone: additional > 0 ? "warning" : "neutral",
          },
        ]}
      />

      <CheckInList
        containerId={container.id}
        warehouses={warehouses}
        defaultWarehouseId={user.warehouseId}
        cargoTypes={cargoTypes}
        otherContainers={otherContainers}
        canAmend={mayAmend}
        canConfirmUnchecked={can(user.role, "container.confirmUnchecked")}
        addable={addable.map((c) => ({
          id: c.id,
          label: `${c.reference} · ${c.shippingMark ?? c.sender.fullName} · ${c.description}`,
        }))}
        rows={container.cargoLines.map((line) => {
          const c = line.cargo;
          /* China's count if the counter recorded one, otherwise whatever was
             declared at booking. Zero rather than null, so the arithmetic
             always has something to subtract from and a short count is never
             silently skipped. */
          const expectedPackages =
            c.chinaReceiving?.packagesCount ?? c.declaredPackages ?? 0;
          return {
            id: c.id,
            reference: c.reference,
            shippingMark: c.shippingMark,
            customer: c.sender.fullName,
            customerPhone: null,
            description: c.description,
            cargoTypes: [
              ...new Set(
                c.packages
                  .map((k) => k.cargoType)
                  .filter((t): t is string => Boolean(t))
              ),
            ],
            photos: c._count.photos,
            expectedPackages,
            expectedPieces:
              c.chinaReceiving?.piecesCount ??
              c.packages.reduce((sum, k) => sum + (k.pieces ?? 0), 0),
            expectedCbm: c.chinaReceiving
              ? formatCbm(c.chinaReceiving.cbm)
              : null,
            expectedWeight: c.chinaReceiving?.weightKg
              ? `${Number(c.chinaReceiving.weightKg).toFixed(2)} kg`
              : null,
            arrivedPackages: c.darReceiving?.packagesCount ?? null,
            arrivedPieces: c.darReceiving?.piecesCount ?? null,
            arrivedCbm: c.darReceiving?.cbm ? formatCbm(c.darReceiving.cbm) : null,
            arrivedWeight: c.darReceiving?.weightKg
              ? `${Number(c.darReceiving.weightKg).toFixed(2)} kg`
              : null,
            discrepancy: c.darReceiving?.discrepancy ?? false,
            verified: c.darReceiving?.verified ?? false,
            missing: c.status === "MISSING_AT_DAR",
            condition: c.darReceiving?.condition ?? null,
            damaged:
              !!c.darReceiving && c.darReceiving.condition !== "GOOD",
            hasCase: c.exceptions.length > 0,
            /* Put on this manifest at Dar rather than loaded in Guangzhou. The
               case the amendment opened is the only mark it carries. */
            added: c.exceptions.some(
              (e) => e.type === "UNIDENTIFIED_CARGO" || e.type === "WRONG_CONTAINER"
            ),
            /* Decimals are formatted to strings here: a Prisma Decimal must
               never cross into a client component as a float. */
            china: c.chinaReceiving
              ? {
                  packagesCount: c.chinaReceiving.packagesCount,
                  piecesCount: c.chinaReceiving.piecesCount,
                  weightKg: c.chinaReceiving.weightKg?.toString() ?? null,
                  cbm: c.chinaReceiving.cbm.toString(),
                }
              : null,
            existing: c.darReceiving
              ? {
                  packagesCount: c.darReceiving.packagesCount,
                  piecesCount: c.darReceiving.piecesCount,
                  weightKg: c.darReceiving.weightKg?.toString() ?? null,
                  cbm: c.darReceiving.cbm?.toString() ?? null,
                  condition: c.darReceiving.condition,
                  location: c.darReceiving.location,
                  notes: c.darReceiving.notes,
                  discrepancyNotes: c.darReceiving.discrepancyNotes,
                  warehouseId: c.darReceiving.warehouseId,
                }
              : null,
          };
        })}
      />

    </div>
  );
}
