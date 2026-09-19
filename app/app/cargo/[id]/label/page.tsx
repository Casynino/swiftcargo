import Link from "next/link";
import { CheckCircle2, Plus } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";

import { CargoSticker, LABEL_MM, type StickerData } from "@/components/app/cargo-sticker";
import { PrintButton } from "@/components/app/print-button";
import { recordAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { stickersFor } from "@/lib/box-labels";
import { requireStaff } from "@/lib/session";
import { canAny } from "@/lib/rbac";
import { SmartBack } from "@/components/app/smart-back";

import { primeLocale, T } from "@/lib/server-t";
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
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ box?: string; received?: string }>;
}) {
  await primeLocale();
  /* Every desk may look a box up; only a desk that handles the boxes may print
     what goes on them. The route table matches on prefixes and /app/cargo
     already resolves to cargo.view, so this guard is the whole gate. */
  /* Guangzhou prints them; Dar reprints the one that was torn or soaked. */
  const user = await requireStaff();
  if (!canAny(user.role, ["receiving.china", "receiving.dar"])) redirect("/app/no-access");
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
    summary: `Printed box label(s) for ${cargo.reference}`,
  });

  /* ?box= reprints one sticker — the one that was torn or went missing —
     without printing the whole consignment again. */
  const { box, received } = await searchParams;
  const stickers: StickerData[] = await stickersFor([cargo.id], box ?? null);
  if (stickers.length === 0) notFound();

  return (
    <div className="mx-auto max-w-3xl space-y-6 print:max-w-none print:space-y-0">
      {received ? (
        <div className="rounded-2xl border border-success/40 bg-success/10 p-4 print:hidden">
          <p className="flex items-center gap-2 font-semibold text-success">
            <CheckCircle2 className="size-5" />
            Received · {cargo.reference}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Print the labels and stick one on each box — {stickers.length} box
            {stickers.length === 1 ? "" : "es"}.
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:flex">
            <PrintButton
              primary
              className="w-full sm:w-auto"
              label={`Print ${stickers.length} label${stickers.length === 1 ? "" : "s"}`}
            />
            <Link
              href="/app/receive/new"
              className="focus-ring inline-flex h-10 items-center justify-center gap-1.5 rounded-md border bg-background px-4 text-sm font-medium hover:bg-secondary"
            >
              <Plus className="size-4" />
              {T("Receive next")}
            </Link>
          </div>
        </div>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div>
          <SmartBack fallbackHref={`/app/cargo/${cargo.id}`} fallbackLabel={`${cargo.reference}`} />
          <p className="mt-1 text-xs text-muted-foreground">
            One code per physical box — never copy a label onto two. {LABEL_MM.width} ×{" "}
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
            <CargoSticker key={`${sticker.reference}-${sticker.sequence}`} data={sticker} />
          ))}
        </div>
      </div>
    </div>
  );
}
