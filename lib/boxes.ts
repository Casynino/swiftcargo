import "server-only";

import { generateQrToken } from "@/lib/ids";
import type { TxClient } from "@/lib/prisma";

/**
 * KEEP ONE BOX ROW PER PHYSICAL BOX.
 *
 * A package line's count is the number of cartons; this makes the box rows
 * match it. More cartons than rows: new rows, numbered on from the highest box
 * this consignment has ever had, each with a fresh random code. Fewer: the
 * highest-numbered boxes nobody has scanned in Dar or handed over are voided —
 * kept, so a printed sticker still scans to an answer — and a line taken off
 * the consignment voids all of its boxes the same way.
 *
 * The count only falls before Dar has checked the boxes in (see
 * lib/cargo-corrections.ts); a box Dar has touched is never voided here.
 */
export async function syncBoxes(tx: TxClient, packageId: string) {
  const pkg = await tx.cargoPackage.findUnique({
    where: { id: packageId },
    select: { id: true, cargoId: true, quantity: true, deletedAt: true },
  });
  if (!pkg) return;

  const live = await tx.cargoBox.findMany({
    where: { packageId, voidedAt: null },
    orderBy: { sequence: "asc" },
    select: { id: true, sequence: true, darReceivedAt: true, collectedAt: true },
  });
  const wanted = pkg.deletedAt ? 0 : Math.max(pkg.quantity, 0);

  if (live.length < wanted) {
    const top = await tx.cargoBox.aggregate({
      where: { cargoId: pkg.cargoId },
      _max: { sequence: true },
    });
    let next = (top._max.sequence ?? 0) + 1;
    await tx.cargoBox.createMany({
      data: Array.from({ length: wanted - live.length }, () => ({
        cargoId: pkg.cargoId,
        packageId: pkg.id,
        sequence: next++,
        qrToken: generateQrToken(),
      })),
    });
    return;
  }

  if (live.length > wanted) {
    const spare = live
      .filter((box) => !box.darReceivedAt && !box.collectedAt)
      .slice(-(live.length - wanted))
      .map((box) => box.id);
    if (spare.length > 0) {
      await tx.cargoBox.updateMany({
        where: { id: { in: spare } },
        data: { voidedAt: new Date() },
      });
    }
  }
}

/** Every line of a consignment — used after lines are created in bulk. */
export async function syncCargoBoxes(tx: TxClient, cargoId: string) {
  const packages = await tx.cargoPackage.findMany({
    where: { cargoId },
    orderBy: { reference: "asc" },
    select: { id: true },
  });
  for (const pkg of packages) await syncBoxes(tx, pkg.id);
}
