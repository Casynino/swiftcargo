import "server-only";

import type { CargoStatus, Prisma } from "@prisma/client";

import { CARGO_FLOW } from "@/lib/constants";
import { prisma, type TxClient } from "@/lib/prisma";
import type { SessionUser } from "@/lib/session";

/**
 * MOVING A CONSIGNMENT FORWARD.
 *
 * The status column and the history table are written together, always, in one
 * transaction — a cargo whose status says RECEIVED_DAR with nothing in its
 * history saying when is a record that cannot be questioned, and every argument
 * with a customer is about exactly that "when".
 *
 * Returns false when the status was already what was asked for. Callers that
 * fan out notifications check it, so a re-submitted form does not tell three
 * hundred customers their ship sailed twice.
 */
export async function setCargoStatus(
  tx: TxClient,
  cargoId: string,
  to: CargoStatus,
  actor: Pick<SessionUser, "id"> | null,
  reason?: string
): Promise<boolean> {
  const current = await tx.cargo.findUnique({
    where: { id: cargoId },
    select: { status: true },
  });
  if (!current || current.status === to) return false;

  await tx.cargo.update({ where: { id: cargoId }, data: { status: to } });
  await tx.cargoStatusHistory.create({
    data: {
      cargoId,
      from: current.status,
      to,
      reason: reason ?? null,
      actorId: actor?.id ?? null,
    },
  });
  return true;
}

/**
 * The same, for a whole container's worth at once.
 *
 * A ship sails with three hundred consignments on it. Doing this one row at a
 * time is three hundred round trips inside one transaction, and the transaction
 * is holding locks the whole time. `updateMany` plus one `createMany` is two
 * statements whatever the count.
 *
 * Rows already at the target status are excluded from BOTH statements, so the
 * history never gains a line saying a consignment moved from IN_TRANSIT to
 * IN_TRANSIT.
 */
export async function setCargoStatusBulk(
  tx: TxClient,
  cargoIds: string[],
  to: CargoStatus,
  actor: SessionUser | null,
  reason?: string
): Promise<number> {
  if (cargoIds.length === 0) return 0;

  const moving = await tx.cargo.findMany({
    where: { id: { in: cargoIds }, status: { not: to } },
    select: { id: true, status: true },
  });
  if (moving.length === 0) return 0;

  await tx.cargo.updateMany({
    where: { id: { in: moving.map((c) => c.id) } },
    data: { status: to },
  });

  await tx.cargoStatusHistory.createMany({
    data: moving.map((c) => ({
      cargoId: c.id,
      from: c.status,
      to,
      reason: reason ?? null,
      actorId: actor?.id ?? null,
    })),
  });

  return moving.length;
}

/** How far along the eleven milestones, for a progress bar. */
export function cargoProgress(status: CargoStatus) {
  if (status === "CANCELLED") return 0;
  if (status === "DELIVERED") return 100;
  const index = CARGO_FLOW.indexOf(status);
  if (index < 0) return 0;
  return Math.round(((index + 1) / CARGO_FLOW.length) * 100);
}

/**
 * Everything a cargo detail page needs, in one query.
 *
 * Written as a constant rather than inline so the detail page, the support
 * customer-context panel and the printable delivery note all read the SAME
 * shape. Three screens quietly selecting three different subsets is how one of
 * them ends up showing a stale figure nobody can explain.
 */
export const CARGO_DETAIL_INCLUDE = {
  sender: true,
  receiver: true,
  supplier: true,
  packages: { where: { deletedAt: null }, orderBy: { reference: "asc" } },
  photos: { include: { uploadedBy: true }, orderBy: { takenAt: "desc" } },
  chinaReceiving: { include: { warehouse: true, receivedBy: true } },
  darReceiving: { include: { warehouse: true, receivedBy: true, container: true } },
  deliveryNote: true,
  containerLines: { include: { container: { include: { shipment: true } } } },
  invoices: {
    include: { payments: true, receipts: true },
    orderBy: { createdAt: "desc" },
  },
  release: { include: { releasedBy: true } },
  deliveryRequest: true,
  exceptions: { orderBy: { createdAt: "desc" } },
  history: { include: { actor: true }, orderBy: { createdAt: "asc" } },
} satisfies Prisma.CargoInclude;

export type CargoDetail = Prisma.CargoGetPayload<{
  include: typeof CARGO_DETAIL_INCLUDE;
}>;

export async function cargoByReference(reference: string) {
  return prisma.cargo.findFirst({
    where: { reference, deletedAt: null },
    include: CARGO_DETAIL_INCLUDE,
  });
}

/**
 * One consignment, with everything hanging off it.
 *
 * `seesMoney` STRIPS THE VALUATION RATHER THAN HIDING IT. A page that simply
 * does not render the figure still ships the whole record into the browser as
 * serialised server-component data, so a warehouse clerk reading the page
 * source found `estimatedValue` sitting there in plain text. Not rendering a
 * number is not the same as not sending it, and the wall between the floor and
 * the price has to hold in the payload, not just on the screen.
 */
export async function cargoById(id: string, seesMoney = false) {
  const cargo = await prisma.cargo.findFirst({
    where: { id, deletedAt: null },
    include: CARGO_DETAIL_INCLUDE,
  });
  if (!cargo) return null;
  if (seesMoney) return cargo;

  return {
    ...cargo,
    estimatedValue: null,
    estimatedCurrency: null,
    estimatedAt: null,
    valuationSnapshot: null,
  };
}

/**
 * The container a consignment is CURRENTLY on.
 *
 * A consignment split across two sailings has two lines; the current one is the
 * latest. Most cargo has exactly one and this is a no-op — it exists so the
 * screens that say "which container" do not have to each decide what to do when
 * there are two.
 */
export function currentContainerLine<
  T extends { loadedAt: Date | null; createdAt: Date }
>(lines: T[]): T | null {
  if (lines.length === 0) return null;
  return [...lines].sort(
    (a, b) =>
      (b.loadedAt ?? b.createdAt).getTime() - (a.loadedAt ?? a.createdAt).getTime()
  )[0];
}
