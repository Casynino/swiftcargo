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
  packages: number;
  weightKg: string | null;
  cbm: string;
  items?: {
    reference: string;
    description: string | null;
    descriptionZh: string | null;
    cargoType: string | null;
    packageType: string;
    quantity: number;
    pieces: number | null;
    cbm: string;
    weightKg: string | null;
    balerNumber: string | null;
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
  totalCbm: string;
  totalCustomers: number;
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
  containerId: string
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
              sender: { select: { fullName: true, code: true, phone: true } },
              packages: {
                where: { deletedAt: null },
                orderBy: { reference: "asc" },
                select: {
                  reference: true,
                  description: true,
                  descriptionZh: true,
                  cargoType: true,
                  packageType: true,
                  quantity: true,
                  pieces: true,
                  cbm: true,
                  weightKg: true,
                  balerNumber: true,
                },
              },
            },
          },
        },
      },
    },
  });
  if (!container) return null;

  const totalCbm = container.cargoLines.reduce(
    (sum, l) => sum.add(l.cbm),
    new Prisma.Decimal(0)
  );

  return {
    container: container.containerNumber ?? container.reference,
    reference: container.reference,
    sealNumber: container.sealNumber,
    vessel: container.shipment?.vessel ?? null,
    voyage: container.shipment?.voyage ?? null,
    shippingLine: container.shipment?.shippingLine ?? null,
    originPort: container.originPort,
    destinationPort: container.destinationPort,
    totalCbm: totalCbm.toString(),
    totalCustomers: new Set(
      container.cargoLines.map((l) => l.cargo.sender.code)
    ).size,
    lines: container.cargoLines.map((l) => ({
      cargoReference: l.cargo.reference,
      shippingMark: l.cargo.shippingMark,
      customer: l.cargo.sender.fullName,
      customerCode: l.cargo.sender.code,
      phone: l.cargo.sender.phone,
      description: l.cargo.description,
      packages: l.packagesCount,
      weightKg: l.weightKg?.toString() ?? null,
      cbm: l.cbm.toString(),
      items: l.cargo.packages.map((k) => ({
        reference: k.reference,
        description: k.description,
        descriptionZh: k.descriptionZh,
        cargoType: k.cargoType,
        packageType: k.packageType,
        quantity: k.quantity,
        pieces: k.pieces,
        cbm: k.cbm.toString(),
        weightKg: k.weightKg?.toString() ?? null,
        balerNumber: k.balerNumber,
      })),
    })),
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
    select: { id: true, number: true },
  });
  /* A list issued early, for a shipping line that wanted the number before the
     box was shut, was drawn while loading was still going on. The seal is the
     moment its contents become true, so the number stays and the lines are
     taken again from what is in the box now — otherwise cargo loaded after the
     early print is missing from the manifest that sails with it. */
  if (existing && atSeal) {
    const snapshot = await buildSnapshot(tx, containerId);
    if (snapshot && snapshot.lines.length > 0) {
      await tx.packingList.update({
        where: { id: existing.id },
        data: { snapshot: snapshot as unknown as Prisma.InputJsonValue },
      });
    }
    return existing;
  }
  if (existing) return existing;

  const snapshot = await buildSnapshot(tx, containerId);
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
