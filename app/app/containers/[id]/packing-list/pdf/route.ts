import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";

import { LOADABLE_CONTAINER_STATUSES } from "@/lib/constants";
import { formatDate } from "@/lib/format";
import { buildSnapshot, type PackingSnapshot } from "@/lib/packing-list";
import { attachment } from "@/lib/pdf-kit";
import { renderPackingListPdf } from "@/lib/packing-list-pdf";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * THE PACKING LIST AS A DOWNLOAD.
 *
 * The same rule as the page beside it: once the box is sealed the frozen copy
 * is what comes out, because the paper a port is holding cannot be rewritten
 * by a later correction. Before the seal it is drawn live and says so on its
 * face.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  await requirePermission("packingList.view");
  const { id } = await params;

  const [list, company, box] = await Promise.all([
    prisma.packingList.findUnique({
      where: { containerId: id },
      include: { issuedBy: { select: { name: true } } },
    }),
    prisma.companySetting.findUnique({ where: { id: "singleton" } }),
    prisma.container.findUnique({
      where: { id },
      select: { status: true, reference: true },
    }),
  ]);

  const stillOpen = !!box && LOADABLE_CONTAINER_STATUSES.includes(box.status);
  const snapshot = (list && !stillOpen
    ? (list.snapshot as unknown as PackingSnapshot)
    : await buildSnapshot(prisma, id)) as PackingSnapshot | null;

  if (!snapshot) {
    return NextResponse.json({ error: "Packing list not found." }, { status: 404 });
  }

  let logo: string | null = null;
  try {
    const file = await fs.readFile(
      path.join(process.cwd(), "public", "brand", "swift-cargo.png")
    );
    logo = `data:image/png;base64,${file.toString("base64")}`;
  } catch {
    /* A missing logo prints the name instead. */
  }

  /* The snapshot keeps its dates as ISO strings so the frozen copy cannot
     drift with a locale; a document a person reads wants the day. */
  const day = (value: string | null) =>
    value ? (formatDate(new Date(value)) ?? value.slice(0, 10)) : null;
  const dated: PackingSnapshot = {
    ...snapshot,
    packedAt: day(snapshot.packedAt),
    shippedAt: day(snapshot.shippedAt),
    eta: day(snapshot.eta),
    issuedAt: day(snapshot.issuedAt),
  };

  const number = list?.number ?? snapshot.reference ?? snapshot.container;
  const pdf = renderPackingListPdf({
    snapshot: dated,
    company: {
      name: company?.name ?? "Swift Cargo",
      tagline: company?.tagline ?? null,
      address: company?.chinaAddress ?? company?.darAddress ?? null,
      phone: company?.phone ?? null,
      email: company?.email ?? null,
    },
    logo,
    number,
    provisional: stillOpen || !list,
  });

  return new NextResponse(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": attachment(`Packing list ${snapshot.container}`),
      "Cache-Control": "no-store",
    },
  });
}
