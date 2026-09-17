import "server-only";

import { prisma } from "@/lib/prisma";

export type ScannedToken = {
  cargoId: string;
  reference: string;
  /** Present when the code scanned was a pickup note rather than a label. */
  pickupNote: { id: string; noteNumber: string; status: string } | null;
};

/**
 * WHAT A SCANNED CODE NAMES.
 *
 * Three kinds of paper carry a code: the sticker on one box, the consignment's
 * own label, and the pickup note Finance writes when the goods may go. All
 * three resolve to one consignment, and the Dar counter scanning a customer's
 * pickup note has to land on the same record the box labels do — a note whose
 * code finds nothing is a customer sent back to Finance for no reason.
 *
 * The token is looked up, never parsed: it names exactly one thing or nothing.
 * Deleted cargo is nothing.
 */
export async function resolveScanToken(token: string): Promise<ScannedToken | null> {
  const select = { id: true, reference: true, deletedAt: true } as const;

  const pkg = await prisma.cargoPackage.findUnique({
    where: { qrToken: token },
    select: { cargo: { select } },
  });
  if (pkg) return live(pkg.cargo, null);

  const cargo = await prisma.cargo.findUnique({ where: { qrToken: token }, select });
  if (cargo) return live(cargo, null);

  const note = await prisma.pickupNote.findUnique({
    where: { qrToken: token },
    select: { id: true, noteNumber: true, status: true, cargo: { select } },
  });
  if (note) {
    return live(note.cargo, { id: note.id, noteNumber: note.noteNumber, status: note.status });
  }
  return null;
}

function live(
  cargo: { id: string; reference: string; deletedAt: Date | null },
  pickupNote: ScannedToken["pickupNote"]
): ScannedToken | null {
  if (cargo.deletedAt) return null;
  return { cargoId: cargo.id, reference: cargo.reference, pickupNote };
}
