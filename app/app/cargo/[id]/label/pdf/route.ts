import { NextResponse } from "next/server";

import { stickersFor } from "@/lib/box-labels";
import { recordAudit } from "@/lib/audit";
import { attachment } from "@/lib/pdf-kit";
import { renderLabelsPdf } from "@/lib/label-pdf";
import { prisma } from "@/lib/prisma";
import { canAny } from "@/lib/rbac";
import { requireStaff } from "@/lib/session";
import { viewerLocale } from "@/lib/viewer-locale";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * THE BOX LABELS AS A DOWNLOAD.
 *
 * One 100 × 150 mm page per box, the size a thermal roll is already cut to, so
 * nothing has to be scaled by whoever prints it. Guangzhou sends the file to a
 * label printer or to a supplier packing on our behalf; the Print button on
 * the page drives the printer in front of the clerk. Two buttons, two jobs.
 *
 * `?box=` takes one sticker — the one that was torn or soaked — rather than
 * the whole consignment again.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  /* Guangzhou prints them; Dar reprints the one that was damaged. The same
     gate as the page, because a route is a door of its own. */
  const user = await requireStaff();
  if (!canAny(user.role, ["receiving.china", "receiving.dar"])) {
    return NextResponse.json({ error: "Not your desk." }, { status: 403 });
  }

  const { id } = await params;
  const key = decodeURIComponent(id);
  const cargo = await prisma.cargo.findFirst({
    where: { deletedAt: null, OR: [{ id: key }, { reference: key.toUpperCase() }] },
    select: { id: true, reference: true },
  });
  if (!cargo) {
    return NextResponse.json({ error: "Cargo not found." }, { status: 404 });
  }

  const box = new URL(request.url).searchParams.get("box");
  const locale = await viewerLocale();
  const stickers = await stickersFor([cargo.id], box, locale);
  if (stickers.length === 0) {
    return NextResponse.json({ error: "Nothing to label." }, { status: 404 });
  }

  /* Taking the file is as much a print as opening the page is — it is the
     same labels leaving the building, and the consignment's history says so. */
  await recordAudit({
    actor: user,
    action: "cargo.label.print",
    entity: "Cargo",
    entityId: cargo.id,
    summary: `Downloaded ${stickers.length} box label(s) for ${cargo.reference}`,
  });

  return new NextResponse(Buffer.from(renderLabelsPdf(stickers)), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": attachment(
        `Labels ${cargo.reference}${box ? ` box ${stickers[0].sequence}` : ""}`
      ),
      "Cache-Control": "no-store",
    },
  });
}
