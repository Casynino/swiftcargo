import "server-only";

import type { StickerData } from "@/components/app/cargo-sticker";
import { syncCargoBoxes } from "@/lib/boxes";
import { formatCbm, formatDate } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { packageQrDataUrl } from "@/lib/qr";

/**
 * THE STICKERS FOR A SET OF CONSIGNMENTS — ONE PER PHYSICAL BOX.
 *
 * Every live box gets its own sticker with its own code, numbered across its
 * consignment. A consignment whose boxes were never drawn (entered before box
 * codes existed) has them drawn here first, so printing is never the moment a
 * box turns out to have no code.
 */
export async function stickersFor(cargoIds: string[], onlyBoxId?: string | null): Promise<StickerData[]> {
  for (const id of cargoIds) {
    const missing = await prisma.cargoPackage.count({
      where: { cargoId: id, deletedAt: null, boxes: { none: {} } },
    });
    if (missing > 0) await prisma.$transaction((tx) => syncCargoBoxes(tx, id));
  }

  const cargos = await prisma.cargo.findMany({
    where: { id: { in: cargoIds }, deletedAt: null },
    orderBy: { reference: "asc" },
    include: {
      sender: { select: { fullName: true, phone: true } },
      chinaReceiving: { select: { receivedAt: true } },
      boxes: {
        where: { voidedAt: null, ...(onlyBoxId ? { id: onlyBoxId } : {}) },
        orderBy: { sequence: "asc" },
        include: { package: true },
      },
      _count: { select: { boxes: { where: { voidedAt: null } } } },
    },
  });

  const stickers: StickerData[] = [];
  for (const cargo of cargos) {
    const received = formatDate(cargo.chinaReceiving?.receivedAt ?? cargo.createdAt);
    for (const box of cargo.boxes) {
      const pkg = box.package;
      stickers.push({
        reference: cargo.reference,
        shippingMark: cargo.shippingMark,
        customerName: cargo.sender.fullName,
        customerPhone: cargo.sender.phone,
        description: pkg.description ?? cargo.description,
        cargoType: pkg.cargoType,
        sequence: box.sequence,
        total: cargo._count.boxes,
        packageRef: pkg.reference,
        packagesLabel: `${pkg.packageType.toLowerCase()}${pkg.pieces ? ` · ${pkg.pieces} pcs on line` : ""}`,
        weightLabel: pkg.weightKg && pkg.quantity === 1 ? `${Number(pkg.weightKg).toFixed(2)} kg` : null,
        /* The line's volume is for the whole line; on a line of one box it is
           this box's, and only then is it printed. */
        cbmLabel: pkg.quantity === 1 ? formatCbm(pkg.cbm) : null,
        receivedOn: received,
        receiptNo: pkg.paperReceiptNo ?? cargo.paperReceiptNo,
        /* 520px across a 58mm square is ~11 pixels per QR module — matched to
           what a 203dpi thermal head can actually lay down. */
        qr: await packageQrDataUrl(box.qrToken, 520),
      });
    }
  }
  return stickers;
}
