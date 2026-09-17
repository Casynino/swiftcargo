import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ClipboardList } from "lucide-react";

import { CheckInList } from "@/components/app/check-in-list";
import { PageHeader } from "@/components/app/page-header";
import { VerifyContainerButton } from "@/components/app/verify-buttons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCbm, formatDate } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { requirePermission } from "@/lib/session";
import { cargoTypeOptions } from "@/lib/valuation";

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

  const selectedCargo = cargoId
    ? await prisma.cargo.findFirst({
        where: { id: cargoId, deletedAt: null },
        include: { chinaReceiving: true, darReceiving: true, sender: true },
      })
    : null;

  const done = container.cargoLines.filter((l) => l.cargo.darReceiving).length;
  const missing = container.cargoLines.filter(
    (l) => l.cargo.status === "MISSING_AT_DAR"
  ).length;
  const waiting = container.cargoLines.length - done - missing;
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
                Packing list
              </Link>
            </Button>
            {/* The last move of checking a container in: sign off everything
                counted and clean. Anything flagged stays flagged. */}
            {toVerify > 0 ? (
              <VerifyContainerButton
                containerId={container.id}
                pending={toVerify}
              />
            ) : null}
          </>
        }
      />

      <CheckInList
        containerId={container.id}
        warehouses={warehouses}
        defaultWarehouseId={user.warehouseId}
        cargoTypes={cargoTypes}
        otherContainers={otherContainers}
        canAmend={mayAmend}
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
