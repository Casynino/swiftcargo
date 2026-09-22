import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";

import { formatDateTime, formatMoney } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { qrDataUrl, qrPayload } from "@/lib/qr";
import { attachment } from "@/lib/pdf-kit";
import { renderPickupNotePdf, type PickupNotePdf } from "@/lib/pickup-note-pdf";
import { requirePermission } from "@/lib/session";

/* jsPDF and Prisma need Node, never the edge. */
export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * THE PICKUP NOTE AS A DOWNLOAD.
 *
 * A file, not a print dialog. The counter sends this to a customer on WhatsApp
 * or keeps it with the day's paperwork; printing is the button beside it and
 * opens the browser's own dialog on the sheet. Two buttons, two jobs.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  await requirePermission("finance.view");
  const { id } = await params;

  const [note, company] = await Promise.all([
    prisma.pickupNote.findUnique({
      where: { id },
      include: {
        customer: true,
        cargo: {
          include: {
            darReceiving: { select: { packagesCount: true } },
            sender: { select: { fullName: true } },
            boxes: {
              where: { voidedAt: null },
              orderBy: { sequence: "asc" },
              include: { package: { select: { reference: true, description: true } } },
            },
            containerLines: {
              take: 1,
              orderBy: { createdAt: "desc" },
              include: { container: { select: { reference: true } } },
            },
          },
        },
        issuedBy: { select: { name: true } },
      },
    }),
    prisma.companySetting.findUnique({ where: { id: "singleton" } }),
  ]);

  if (!note) {
    return NextResponse.json({ error: "Pickup note not found." }, { status: 404 });
  }

  const stamp: PickupNotePdf["stamp"] =
    note.status === "ACTIVE"
      ? note.onCredit
        ? { text: "Released on credit", sw: "Imetolewa kwa mkopo", tone: "amber" }
        : { text: "Paid in full", sw: "Imelipwa yote", tone: "green" }
      : note.status === "USED"
        ? { text: "Collected", sw: "Imechukuliwa", tone: "grey" }
        : { text: "Withdrawn", sw: "Imefutwa", tone: "red" };

  /* The logo off the disk, as the invoice does: an <img> tag is a browser
     thing and this is drawn on a server. */
  let logo: string | null = null;
  try {
    const file = await fs.readFile(
      path.join(process.cwd(), "public", "brand", "swift-cargo.png")
    );
    logo = `data:image/png;base64,${file.toString("base64")}`;
  } catch {
    /* A missing logo prints the name instead. */
  }

  const boxes = note.cargo.boxes;
  const pdf = renderPickupNotePdf({
    number: note.noteNumber,
    issued: formatDateTime(note.issuedAt) ?? "",
    company: {
      name: company?.name ?? "Swift Cargo",
      tagline: company?.tagline ?? null,
      address: company?.darAddress ?? null,
      phone: company?.phone ?? null,
      email: company?.email ?? null,
    },
    logo,
    qr: await qrDataUrl(qrPayload(note.qrToken), 520),
    customer: {
      name: note.customer.fullName,
      code: note.customer.code,
      phone: note.customer.phone,
    },
    senderName:
      note.cargo.sender.fullName === note.customer.fullName
        ? null
        : note.cargo.sender.fullName,
    cargoReference: note.cargo.reference,
    container: note.cargo.containerLines[0]?.container.reference ?? null,
    packages: boxes.length || note.cargo.darReceiving?.packagesCount || 0,
    goods: note.cargo.description,
    settledLabel: note.onCredit ? "Paid so far" : "Settled",
    settled: formatMoney(note.amountPaid, note.currency),
    settledTzs: note.amountTzs ? formatMoney(note.amountTzs, "TZS") : "—",
    stamp,
    onCredit: note.onCredit
      ? {
          reason: note.creditReason,
          dueAt: note.creditDueAt ? formatDateTime(note.creditDueAt) : null,
        }
      : null,
    boxes: boxes.map((box) => ({
      sequence: box.sequence,
      label: box.package.description ?? box.package.reference,
      collected: box.collectedAt !== null,
    })),
    issuedBy: note.issuedBy?.name ?? null,
  });

  return new NextResponse(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": attachment(
        `${note.noteNumber} ${note.customer.fullName}`
      ),
      "Cache-Control": "no-store",
    },
  });
}
