import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { CargoSticker, LABEL_MM, type StickerData } from "@/components/app/cargo-sticker";
import { PrintButton } from "@/components/app/print-button";
import { recordAudit } from "@/lib/audit";
import { formatCbm, formatDate } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { packageQrDataUrl } from "@/lib/qr";
import { requirePermission } from "@/lib/session";
import { SmartBack } from "@/components/app/smart-back";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const cargo = await prisma.cargo.findFirst({
    where: { OR: [{ id }, { reference: id.toUpperCase() }] },
    select: { reference: true, sender: { select: { fullName: true } } },
  });
  return {
    title: {
      absolute: cargo
        ? `Labels ${cargo.reference} - ${cargo.sender.fullName}`
        : "Cargo labels",
    },
  };
}

/**
 * LABELS FOR ONE CONSIGNMENT — ONE PER BOX.
 *
 * Printed at the Guangzhou counter the moment the cargo is received, while the
 * boxes are still on the floor in front of the clerk. Five cartons is five
 * labels, each with a different code and each numbered "3 of 5".
 *
 * The reference may be the id or the tracking number, because the number is
 * what somebody has in their hand.
 */
export default async function CargoLabelPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  /* Every desk may look a box up; only a desk that handles the boxes may print
     what goes on them. The route table matches on prefixes and /app/cargo
     already resolves to cargo.view, so this guard is the whole gate. */
  const user = await requirePermission("receiving.china");
  const { id } = await params;
  const key = decodeURIComponent(id);

  const cargo = await prisma.cargo.findFirst({
    where: { deletedAt: null, OR: [{ id: key }, { reference: key.toUpperCase() }] },
    include: {
      sender: { select: { fullName: true, phone: true } },
      chinaReceiving: { select: { receivedAt: true } },
      packages: {
        where: { deletedAt: null },
        orderBy: { reference: "asc" },
      },
    },
  });
  if (!cargo) notFound();

  /* Opening this page is the only signal we have that labels were printed — the
     browser's print dialog is invisible to us. It over-counts an abandoned
     reprint, which is the safer direction: a label printed and not counted
     would let a missing sticker look like it never existed. */
  await recordAudit({
    actor: user,
    action: "cargo.label.print",
    entity: "Cargo",
    entityId: cargo.id,
    summary: `Printed ${cargo.packages.length} label(s) for ${cargo.reference}`,
  });

  const received = formatDate(cargo.chinaReceiving?.receivedAt ?? cargo.createdAt);

  const stickers: StickerData[] = await Promise.all(
    cargo.packages.map(async (pkg, index) => ({
      reference: cargo.reference,
      shippingMark: cargo.shippingMark,
      customerName: cargo.sender.fullName,
      customerPhone: cargo.sender.phone,
      description: pkg.description ?? cargo.description,
      cargoType: pkg.cargoType,
      sequence: index + 1,
      total: cargo.packages.length,
      packageRef: pkg.reference,
      packagesLabel: `${pkg.quantity} ${pkg.packageType.toLowerCase()}`,
      weightLabel: pkg.weightKg ? `${Number(pkg.weightKg).toFixed(2)} kg` : null,
      cbmLabel: formatCbm(pkg.cbm),
      receivedOn: received,
      /* 520px across a 58mm square is ~11 pixels per QR module — matched to
         what a 203dpi thermal head can actually lay down. */
      qr: await packageQrDataUrl(pkg.qrToken, 520),
    }))
  );

  return (
    <div className="mx-auto max-w-3xl space-y-6 print:max-w-none print:space-y-0">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div>
          <SmartBack fallbackHref={`/app/cargo/${cargo.id}`} fallbackLabel={`${cargo.reference}`} />
          <p className="mt-1 text-xs text-muted-foreground">
            One code per box — never copy a label onto two. {LABEL_MM.width} ×{" "}
            {LABEL_MM.height} mm.
          </p>
        </div>
        <PrintButton
          label={`Print ${stickers.length} label${stickers.length === 1 ? "" : "s"}`}
        />
      </div>

      {/* A scroll frame, not a centring one: the sheet is a fixed 100mm and
          cannot shrink, so on a narrow phone centring puts the left half behind
          x=0 where no scroll can reach it. Printing is unaffected. */}
      <div className="-mx-4 overflow-x-auto px-4 print:mx-0 print:overflow-visible print:px-0">
        <div className="mx-auto flex w-max flex-col items-center gap-4 print:gap-0">
          {stickers.map((sticker) => (
            <CargoSticker key={sticker.packageRef} data={sticker} />
          ))}
        </div>
      </div>
    </div>
  );
}
