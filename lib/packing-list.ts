import "server-only";

import { Prisma } from "@prisma/client";

import { nextPackingListNumber } from "@/lib/ids";
import { prisma, type TxClient } from "@/lib/prisma";

export type PackingLine = {
  cargoReference: string;
  shippingMark: string | null;
  customer: string;
  customerCode: string;
  phone: string;
  description: string;
  /** The carbon book page the delivery was written on, as the paper says it. */
  paperReceiptNo: string | null;
  packages: number;
  pieces: number | null;
  weightKg: string | null;
  cbm: string;
  notes: string | null;
  items?: {
    reference: string;
    paperReceiptNo: string | null;
    description: string | null;
    descriptionZh: string | null;
    cargoType: string | null;
    packageType: string;
    quantity: number;
    pieces: number | null;
    cbm: string;
    weightKg: string | null;
    balerNumber: string | null;
    /* Customs columns. Absent on lists frozen before they existed. */
    netWeightKg?: string | null;
    modelNo?: string | null;
    /** Declared value of one piece, USD. */
    unitValue?: string | null;
    /** Pieces × unit value, USD — worked out here, never typed. */
    amount?: string | null;
  }[];
};

export type PackingSnapshot = {
  container: string;
  reference: string;
  sealNumber: string | null;
  vessel: string | null;
  voyage: string | null;
  shippingLine: string | null;
  originPort: string | null;
  destinationPort: string | null;
  /** Which Guangzhou floor the box was loaded from. */
  originWarehouse: string | null;
  /** When the box was shut, when the vessel left, when it is due. As recorded. */
  packedAt: string | null;
  shippedAt: string | null;
  eta: string | null;
  /** Who froze the sheet. The document has to answer for itself. */
  issuedBy: string | null;
  issuedAt: string | null;
  totalCbm: string;
  totalPackages: number;
  totalPieces: number;
  totalWeightKg: string | null;
  totalCargo: number;
  totalCustomers: number;
  /**
   * WHICH DRAWING OF THIS SHEET THIS IS.
   *
   * A list printed for a shipping line mid-load and the list frozen at the seal
   * carry the same number, because that number may already be on paper at a
   * port. They are not the same document, and somebody holding one of them has
   * to be able to tell which one it is. The early print is 1; the seal writes 2.
   */
  version: number;
  lines: PackingLine[];
};

/**
 * THE PACKING LIST IS NOT TYPED BY ANYBODY.
 *
 * It is the cargo inside the container, read back out. Load a consignment and
 * the list has it; take one out again while the box is still open and the list
 * loses it. There is no second data entry to keep in step, because there is no
 * second copy of the information.
 *
 * The document freezes when the container is sealed — see `issueFor`. Until
 * then the screen renders this live, which is the honest answer to "what is on
 * the list" for a box people are still loading.
 */
export async function buildSnapshot(
  client: TxClient | typeof prisma,
  containerId: string,
  /* Who froze this drawing and which one it is. Absent while the sheet is still
     live, because a list nobody has issued has not been issued by anybody. */
  issued?: { by: string | null; at: Date; version: number }
): Promise<PackingSnapshot | null> {
  const container = await client.container.findFirst({
    where: { id: containerId, deletedAt: null },
    include: {
      shipment: true,
      cargoLines: {
        orderBy: { createdAt: "asc" },
        include: {
          cargo: {
            select: {
              reference: true,
              shippingMark: true,
              description: true,
              paperReceiptNo: true,
              sender: { select: { fullName: true, code: true, phone: true } },
              /* The Guangzhou floor the goods were taken in on. The container
                 itself has never been asked which warehouse it was loaded from,
                 and the cargo inside it answers the question first-hand. */
              chinaReceiving: {
                select: {
                  piecesCount: true,
                  warehouse: { select: { name: true } },
                },
              },
              packages: {
                where: { deletedAt: null },
                orderBy: { reference: "asc" },
                select: {
                  reference: true,
                  paperReceiptNo: true,
                  description: true,
                  descriptionZh: true,
                  cargoType: true,
                  packageType: true,
                  quantity: true,
                  pieces: true,
                  cbm: true,
                  weightKg: true,
                  balerNumber: true,
                  netWeightKg: true,
                  modelNo: true,
                  declaredUnitValue: true,
                },
              },
            },
          },
        },
      },
    },
  });
  if (!container) return null;

  const lines: PackingLine[] = container.cargoLines.map((l) => {
    const itemPieces = l.cargo.packages.reduce(
      (sum, k) => sum + (k.pieces ?? 0),
      0
    );
    return {
      cargoReference: l.cargo.reference,
      shippingMark: l.cargo.shippingMark,
      customer: l.cargo.sender.fullName,
      customerCode: l.cargo.sender.code,
      phone: l.cargo.sender.phone,
      description: l.cargo.description,
      paperReceiptNo: l.cargo.paperReceiptNo,
      packages: l.packagesCount,
      /* Counted off the goods; the receiving row answers for a consignment
         whose lines were never broken out. Nothing tallied stays null rather
         than becoming a zero the reader would take for a count. */
      pieces:
        itemPieces > 0 ? itemPieces : (l.cargo.chinaReceiving?.piecesCount ?? null),
      weightKg: l.weightKg?.toString() ?? null,
      cbm: l.cbm.toString(),
      notes: l.notes,
      items: l.cargo.packages.map((k) => ({
        reference: k.reference,
        paperReceiptNo: k.paperReceiptNo,
        description: k.description,
        descriptionZh: k.descriptionZh,
        cargoType: k.cargoType,
        packageType: k.packageType,
        quantity: k.quantity,
        pieces: k.pieces,
        cbm: k.cbm.toString(),
        weightKg: k.weightKg?.toString() ?? null,
        balerNumber: k.balerNumber,
        netWeightKg: k.netWeightKg?.toString() ?? null,
        modelNo: k.modelNo,
        unitValue: k.declaredUnitValue?.toString() ?? null,
        /* The paper list's AMOUNT: pieces × unit price, or packages × unit
           price where no pieces were counted. Decimal, rounded to the cent. */
        amount: k.declaredUnitValue
          ? k.declaredUnitValue
              .mul(k.pieces ?? k.quantity)
              .toDecimalPlaces(2)
              .toString()
          : null,
      })),
    };
  });

  /* Every total is summed here, from the lines above and nowhere else. A figure
     on this sheet that somebody could type is a figure that can disagree with
     the rows printed under it. */
  const totalCbm = container.cargoLines.reduce(
    (sum, l) => sum.add(l.cbm),
    new Prisma.Decimal(0)
  );
  const totalWeight = container.cargoLines.reduce(
    (sum, l) => sum.add(l.weightKg ?? 0),
    new Prisma.Decimal(0)
  );

  const warehouses = [
    ...new Set(
      container.cargoLines
        .map((l) => l.cargo.chinaReceiving?.warehouse.name)
        .filter((n): n is string => Boolean(n))
    ),
  ];

  return {
    container: container.containerNumber ?? container.reference,
    reference: container.reference,
    sealNumber: container.sealNumber,
    vessel: container.shipment?.vessel ?? null,
    voyage: container.shipment?.voyage ?? null,
    shippingLine: container.shipment?.shippingLine ?? null,
    originPort: container.originPort,
    destinationPort: container.destinationPort,
    /* Named only when the whole box came off one floor. Two warehouses on one
       sheet is a fact, not a field to pick a winner from. */
    originWarehouse: warehouses.length === 1 ? warehouses[0] : null,
    packedAt: (container.sealedAt ?? container.loadedAt)?.toISOString() ?? null,
    shippedAt: container.shipment?.departureDate?.toISOString() ?? null,
    eta: container.shipment?.eta?.toISOString() ?? null,
    issuedBy: issued?.by ?? null,
    issuedAt: issued?.at.toISOString() ?? null,
    version: issued?.version ?? 0,
    totalCbm: totalCbm.toString(),
    totalPackages: lines.reduce((sum, l) => sum + l.packages, 0),
    totalPieces: lines.reduce((sum, l) => sum + (l.pieces ?? 0), 0),
    totalWeightKg: totalWeight.greaterThan(0) ? totalWeight.toString() : null,
    totalCargo: lines.length,
    totalCustomers: new Set(lines.map((l) => l.customerCode)).size,
    lines,
  };
}

/**
 * Freeze it.
 *
 * Called when the container is sealed, so nobody has to remember to issue one.
 * Idempotent: a container that already has a list keeps the one it has, because
 * the number on it may already be on paper at a port.
 */
export async function issueFor(
  tx: TxClient,
  containerId: string,
  actorId: string,
  { atSeal = false }: { atSeal?: boolean } = {}
) {
  const existing = await tx.packingList.findUnique({
    where: { containerId },
    select: { id: true, number: true, snapshot: true },
  });

  /* The name goes in the document, not just the foreign key. A sheet read at a
     port is read by somebody who has no database in front of them. */
  const actor = await tx.user.findUnique({
    where: { id: actorId },
    select: { name: true },
  });

  /* A list issued early, for a shipping line that wanted the number before the
     box was shut, was drawn while loading was still going on. The seal is the
     moment its contents become true, so the number stays and the lines are
     taken again from what is in the box now — otherwise cargo loaded after the
     early print is missing from the manifest that sails with it. The drawing
     that replaces it says so: the two sheets share a number and are not the
     same document. */
  if (existing && atSeal) {
    const was = (existing.snapshot as { version?: number } | null)?.version ?? 1;
    const snapshot = await buildSnapshot(tx, containerId, {
      by: actor?.name ?? null,
      at: new Date(),
      version: was + 1,
    });
    if (snapshot && snapshot.lines.length > 0) {
      await tx.packingList.update({
        where: { id: existing.id },
        data: { snapshot: snapshot as unknown as Prisma.InputJsonValue },
      });
    }
    return { id: existing.id, number: existing.number };
  }
  if (existing) return { id: existing.id, number: existing.number };

  const snapshot = await buildSnapshot(tx, containerId, {
    by: actor?.name ?? null,
    at: new Date(),
    version: 1,
  });
  if (!snapshot || snapshot.lines.length === 0) return null;

  const number = await nextPackingListNumber(tx);
  return tx.packingList.create({
    data: {
      number,
      containerId,
      issuedById: actorId,
      snapshot: snapshot as unknown as Prisma.InputJsonValue,
    },
    select: { id: true, number: true },
  });
}
