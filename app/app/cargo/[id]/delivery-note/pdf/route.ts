import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";

import { renderDeliveryNotePdf } from "@/lib/delivery-note-pdf";
import { formatDateTime } from "@/lib/format";
import { attachment } from "@/lib/pdf-kit";
import { prisma } from "@/lib/prisma";
import { qrDataUrl, qrPayload } from "@/lib/qr";
import { requirePermission } from "@/lib/session";

export const runtime = "nodejs";
export const maxDuration = 60;

/** The snapshot the note froze when the goods were taken in. */
type Snapshot = {
  cargoReference: string;
  shippingMark: string | null;
  sender: { name: string; phone: string; code: string };
  description: string;
  warehouse: string;
  receivedAt: string;
  packagesCount: number;
  piecesCount: number | null;
  weightKg: string | null;
  cbm: string;
  condition: string;
  lines: {
    reference: string;
    type: string;
    description: string | null;
    quantity: number;
    unit: string;
    length: string | null;
    width: string | null;
    height: string | null;
    cbm: string;
    weightKg: string | null;
    balerNumber: string | null;
  }[];
};

/**
 * THE DELIVERY NOTE AS A DOWNLOAD.
 *
 * Drawn from the note's own snapshot, never from the live consignment: the
 * paper a customer in Guangzhou is holding says what was counted that day,
 * and a correction made next week does not rewrite what they were handed.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  await requirePermission("deliveryNote.view");
  const { id } = await params;

  const note = await prisma.deliveryNote.findUnique({
    where: { cargoId: id },
    include: { issuedBy: { select: { name: true } } },
  });
  if (!note) {
    return NextResponse.json({ error: "Delivery note not found." }, { status: 404 });
  }

  const [company, cargo] = await Promise.all([
    prisma.companySetting.findUnique({ where: { id: "singleton" } }),
    prisma.cargo.findUnique({
      where: { id },
      select: {
        qrToken: true,
        containerLines: {
          take: 1,
          orderBy: { createdAt: "desc" },
          include: { container: { select: { reference: true } } },
        },
      },
    }),
  ]);

  const snap = note.snapshot as unknown as Snapshot;

  let logo: string | null = null;
  try {
    const file = await fs.readFile(
      path.join(process.cwd(), "public", "brand", "swift-cargo.png")
    );
    logo = `data:image/png;base64,${file.toString("base64")}`;
  } catch {
    /* A missing logo prints the name instead. */
  }

  const pdf = renderDeliveryNotePdf({
    number: note.number,
    issued: formatDateTime(note.issuedAt) ?? "",
    company: {
      name: company?.name ?? "Swift Cargo",
      tagline: company?.tagline ?? null,
      address: company?.chinaAddress ?? null,
      phone: company?.phone ?? null,
      email: company?.email ?? null,
    },
    logo,
    qr: cargo ? await qrDataUrl(qrPayload(cargo.qrToken), 520) : null,
    customer: snap.sender,
    shippingMark: snap.shippingMark,
    cargoReference: snap.cargoReference,
    receivedAt: formatDateTime(new Date(snap.receivedAt)) ?? snap.receivedAt,
    warehouse: snap.warehouse,
    container: cargo?.containerLines[0]?.container.reference ?? null,
    packages: snap.packagesCount,
    pieces: snap.piecesCount,
    weight: snap.weightKg,
    cbm: Number(snap.cbm).toFixed(3),
    condition: snap.condition,
    goods: snap.description,
    lines: snap.lines.map((line) => ({
      reference: line.reference,
      goods: line.description ?? "—",
      packedAs:
        line.type.charAt(0) + line.type.slice(1).toLowerCase() +
        (line.balerNumber ? ` · bale ${line.balerNumber}` : ""),
      quantity: line.quantity,
      dimensions:
        line.length && line.width && line.height
          ? `${line.length} x ${line.width} x ${line.height} ${line.unit.toLowerCase()}`
          : "—",
      cbm: Number(line.cbm).toFixed(3),
      weight: line.weightKg ? `${Number(line.weightKg).toFixed(2)} kg` : "—",
    })),
    issuedBy: note.issuedBy?.name ?? null,
  });

  return new NextResponse(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": attachment(
        `${note.number} ${snap.sender.name}`
      ),
      "Cache-Control": "no-store",
    },
  });
}
