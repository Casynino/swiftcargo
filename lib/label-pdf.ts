import "server-only";

import type { StickerData } from "@/components/app/cargo-sticker";
import { attachment, bytes, HAIR, MUTED, NAVY, sheet, text, WHITE } from "@/lib/pdf-kit";

/**
 * BOX LABELS AS A FILE, ONE PAGE PER BOX.
 *
 * 100 × 150 mm — the courier standard every thermal roll is already cut to —
 * so a page IS a label and nothing has to be scaled by whoever prints it.
 *
 * One code per physical box, never one copied onto two. Five cartons make five
 * pages, each numbered "3 / 5", because four boxes on the Dar floor being one
 * short of a delivery is exactly what that number is for.
 *
 * The download is a separate act from printing: Guangzhou sends this file to a
 * label printer, a phone, or a supplier who is packing on our behalf, and the
 * Print button beside it drives the printer in front of the clerk.
 */
export function renderLabelsPdf(stickers: StickerData[]): Uint8Array {
  const s = sheet([100, 150], 5);
  const { doc } = s;
  const width = s.right - s.margin;

  stickers.forEach((sticker, index) => {
    if (index > 0) doc.addPage([100, 150], "portrait");

    /* The mark, big enough to read across a warehouse. */
    doc.setFillColor(NAVY[0], NAVY[1], NAVY[2]);
    doc.rect(0, 0, s.w, 26, "F");
    text(s, sticker.shippingMark ?? sticker.customerName, s.margin, 13, {
      size: 20,
      bold: true,
      caps: true,
      color: WHITE,
      maxWidth: width - 22,
    });
    text(s, sticker.customerName, s.margin, 20, {
      size: 8,
      color: [206, 220, 232],
      maxWidth: width - 22,
    });
    /* Which box of how many, in the corner the Dar floor counts from. */
    text(s, `${sticker.sequence} / ${sticker.total}`, s.right, 16, {
      size: 14,
      bold: true,
      color: WHITE,
      align: "right",
    });

    let y = 34;
    text(s, sticker.reference, s.margin, y, { size: 17, bold: true });
    y += 7;
    text(s, sticker.description, s.margin, y, { size: 9, color: [70, 82, 94], maxWidth: width });
    y += 6;

    if (sticker.qr) {
      const q = 52;
      try {
        doc.addImage(sticker.qr, "PNG", (s.w - q) / 2, y, q, q, `qr-${index}`, "FAST");
      } catch {
        /* A code that will not decode is not worth failing the sheet over. */
      }
      y += q + 4;
    }

    text(s, sticker.packageRef, s.w / 2, y, { size: 8, bold: true, align: "center", color: MUTED });
    y += 7;

    doc.setDrawColor(HAIR[0], HAIR[1], HAIR[2]);
    doc.setLineWidth(0.3);
    doc.line(s.margin, y, s.right, y);
    y += 6;

    /* What the floor in Dar checks the box against. */
    const facts: [string, string | null][] = [
      ["Packages", sticker.packagesLabel],
      ["Weight", sticker.weightLabel],
      ["Volume", sticker.cbmLabel],
      ["Type", sticker.cargoType],
      ["Receipt", sticker.receiptNo ?? null],
      ["Received", sticker.receivedOn],
    ];
    for (const [k, v] of facts) {
      if (!v) continue;
      text(s, k, s.margin, y, { size: 6.4, caps: true, bold: true, color: MUTED });
      text(s, v, s.right, y, { size: 8.5, bold: true, align: "right", maxWidth: width - 25 });
      y += 6;
    }

    if (sticker.customerPhone) {
      y += 2;
      text(s, sticker.customerPhone, s.margin, y, { size: 8, color: [70, 82, 94] });
    }

    /* No arrow: the PDF core fonts have no glyph for it and it prints as
       punctuation soup on a label nobody can re-print once the box has gone. */
    text(s, "Swift Cargo · Guangzhou to Dar es Salaam", s.w / 2, s.h - 6, {
      size: 6.4,
      color: MUTED,
      align: "center",
    });
  });

  return bytes(s);
}

export { attachment as labelsAttachment };
