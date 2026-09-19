import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";

import { CargoSticker, LABEL_MM } from "@/components/app/cargo-sticker";
import { PrintButton } from "@/components/app/print-button";
import { SmartBack } from "@/components/app/smart-back";
import { recordAudit } from "@/lib/audit";
import { stickersFor } from "@/lib/box-labels";
import { prisma } from "@/lib/prisma";
import { canAny } from "@/lib/rbac";
import { requireStaff } from "@/lib/session";

import { primeLocale } from "@/lib/server-t";
export const metadata: Metadata = { title: "Box labels" };

/**
 * EVERY BOX LABEL IN ONE CONTAINER, IN ONE PRINT.
 *
 * The container has no code of its own — it only organises consignments whose
 * boxes already carry theirs. This prints each of those box stickers again,
 * consignment by consignment, for a floor relabelling a load.
 */
export default async function ContainerLabelsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await primeLocale();
  const user = await requireStaff();
  if (!canAny(user.role, ["receiving.china", "receiving.dar"])) redirect("/app/no-access");
  const { id } = await params;

  const container = await prisma.container.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, reference: true, cargoLines: { select: { cargoId: true } } },
  });
  if (!container) notFound();

  const stickers = await stickersFor(container.cargoLines.map((l) => l.cargoId));

  await recordAudit({
    actor: user,
    action: "cargo.label.print",
    entity: "Container",
    entityId: container.id,
    summary: `Printed ${stickers.length} box label(s) for container ${container.reference}`,
  });

  return (
    <div className="mx-auto max-w-3xl space-y-6 print:max-w-none print:space-y-0">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div>
          <SmartBack fallbackHref={`/app/containers/${container.id}`} fallbackLabel={container.reference} />
          <p className="mt-1 text-xs text-muted-foreground">
            {stickers.length} box label{stickers.length === 1 ? "" : "s"} in {container.reference}. One code per
            physical box. {LABEL_MM.width} × {LABEL_MM.height} mm.
          </p>
        </div>
        <PrintButton label={`Print ${stickers.length} label${stickers.length === 1 ? "" : "s"}`} />
      </div>
      <div className="-mx-4 overflow-x-auto px-4 print:mx-0 print:overflow-visible print:px-0">
        <div className="mx-auto flex w-max flex-col items-center gap-4 print:gap-0">
          {stickers.map((sticker) => (
            <CargoSticker key={`${sticker.reference}-${sticker.sequence}`} data={sticker} />
          ))}
        </div>
      </div>
    </div>
  );
}
