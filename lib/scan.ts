import "server-only";

import { prisma } from "@/lib/prisma";
import type { SessionUser } from "@/lib/session";

export type ScannedBox = {
  id: string;
  sequence: number;
  /** Boxes on the consignment that are live (not voided). */
  of: number;
  packageId: string;
  containerId: string | null;
  darReceivedAt: Date | null;
  damagedAt: Date | null;
  missingAt: Date | null;
  collectedAt: Date | null;
  voidedAt: Date | null;
};

export type ScannedToken = {
  cargoId: string;
  reference: string;
  /** The one physical box the code names, when it names a box. */
  box: ScannedBox | null;
  /** Present when the code scanned was a pickup note rather than a label. */
  pickupNote: { id: string; noteNumber: string; status: string } | null;
};

/**
 * WHAT A SCANNED CODE NAMES.
 *
 * A box sticker names one physical box; the older per-line and consignment
 * codes name the consignment; a pickup note names the consignment it lets go.
 * Every one resolves to the same record, and a box code also says which box.
 *
 * The token is looked up, never parsed: it names exactly one thing or nothing.
 * Deleted cargo is nothing.
 */
export async function resolveScanToken(token: string): Promise<ScannedToken | null> {
  const select = { id: true, reference: true, deletedAt: true } as const;

  const box = await prisma.cargoBox.findUnique({
    where: { qrToken: token },
    include: {
      cargo: { select },
      package: { select: { containerId: true } },
    },
  });
  if (box) {
    const of = await prisma.cargoBox.count({
      where: { cargoId: box.cargoId, voidedAt: null },
    });
    return live(box.cargo, null, {
      id: box.id,
      sequence: box.sequence,
      of,
      packageId: box.packageId,
      containerId: box.package.containerId,
      darReceivedAt: box.darReceivedAt,
      damagedAt: box.damagedAt,
      missingAt: box.missingAt,
      collectedAt: box.collectedAt,
      voidedAt: box.voidedAt,
    });
  }

  const pkg = await prisma.cargoPackage.findUnique({
    where: { qrToken: token },
    select: { cargo: { select } },
  });
  if (pkg) return live(pkg.cargo, null, null);

  const cargo = await prisma.cargo.findUnique({ where: { qrToken: token }, select });
  if (cargo) return live(cargo, null, null);

  const note = await prisma.pickupNote.findUnique({
    where: { qrToken: token },
    select: { id: true, noteNumber: true, status: true, cargo: { select } },
  });
  if (note) {
    return live(note.cargo, { id: note.id, noteNumber: note.noteNumber, status: note.status }, null);
  }
  return null;
}

function live(
  cargo: { id: string; reference: string; deletedAt: Date | null },
  pickupNote: ScannedToken["pickupNote"],
  box: ScannedBox | null
): ScannedToken | null {
  if (cargo.deletedAt) return null;
  return { cargoId: cargo.id, reference: cargo.reference, box, pickupNote };
}

/**
 * Write the scan down, whatever it found.
 *
 * Never allowed to break the scan itself: a history that cannot be written is
 * a problem to fix, not a reason to leave a clerk holding a box with a blank
 * screen.
 */
export async function recordScan(input: {
  token: string;
  user: SessionUser | null;
  workflow: string;
  action: string;
  result: "ok" | "warning" | "refused" | "unknown";
  detail?: string | null;
  boxId?: string | null;
  cargoId?: string | null;
  containerId?: string | null;
}) {
  try {
    await prisma.scanEvent.create({
      data: {
        token: input.token.slice(0, 200),
        boxId: input.boxId ?? null,
        cargoId: input.cargoId ?? null,
        userId: input.user?.id ?? null,
        role: input.user?.role ?? null,
        department: input.user?.department ?? null,
        workflow: input.workflow,
        action: input.action,
        result: input.result,
        detail: input.detail?.slice(0, 500) ?? null,
        containerId: input.containerId ?? null,
      },
    });
  } catch (error) {
    console.error("scan history not written", error);
  }
}
