import "server-only";

import {
  attachment,
  bytes,
  field,
  footer,
  GREEN,
  HAIR,
  letterhead,
  MUTED,
  NAVY,
  panel,
  sheet,
  text,
  widthOf,
  WHITE,
} from "@/lib/pdf-kit";

/**
 * THE DELIVERY NOTE AS A FILE.
 *
 * What the Guangzhou counter hands back when goods are taken in: who brought
 * them, what was counted, what it measured, and the code that opens the
 * consignment. The same document as the sheet on screen, drawn onto A4 so it
 * can be sent to a customer who is not standing at the counter.
 *
 * It is a receipt for goods, not a bill. No price appears on it — the charge
 * is worked out later from the volume and the rate for the category, and the
 * note says so in both languages rather than implying a figure.
 */
export type DeliveryNotePdf = {
  number: string;
  issued: string;
  company: { name: string; tagline?: string | null; address?: string | null; phone?: string | null; email?: string | null };
  logo?: string | null;
  qr?: string | null;
  customer: { name: string; code: string; phone: string };
  shippingMark: string | null;
  cargoReference: string;
  receivedAt: string;
  warehouse: string;
  container: string | null;
  packages: number;
  pieces: number | null;
  weight: string | null;
  cbm: string;
  condition: string;
  goods: string;
  lines: {
    reference: string;
    goods: string;
    packedAs: string;
    quantity: number;
    dimensions: string;
    cbm: string;
    weight: string;
  }[];
  issuedBy: string | null;
};

export function renderDeliveryNotePdf(input: DeliveryNotePdf): Uint8Array {
  const s = sheet("a4", 14);
  const { doc } = s;
  const width = s.right - s.margin;

  let y = letterhead(s, {
    company: input.company,
    title: "Delivery note",
    subtitle: "Hati ya kupokea mzigo",
    number: input.number,
    issued: `Issued ${input.issued}`,
    logo: input.logo,
  });

  /* --------------------------------------- whose goods, and the code */
  const codeW = 46;
  const cardW = width - codeW - 5;
  const cardH = 52;

  panel(s, s.margin, y, cardW, cardH, { radius: 3 });
  text(s, "Customer · Mteja", s.margin + 6, y + 8, {
    size: 5.6,
    caps: true,
    bold: true,
    color: MUTED,
  });
  text(s, input.customer.name, s.margin + 6, y + 16, {
    size: 16,
    bold: true,
    caps: true,
    maxWidth: cardW - 12,
  });
  text(
    s,
    [input.customer.code, input.customer.phone].filter(Boolean).join(" · "),
    s.margin + 6,
    y + 21.5,
    { size: 8.5, color: [90, 100, 110] }
  );

  /* The two facts the note is kept for. */
  const boxW = (cardW - 12) / 2;
  panel(s, s.margin + 6, y + 25, boxW - 1, 12, { fill: WHITE, radius: 2 });
  field(s, "Tracking no.", input.cargoReference, s.margin + 10, y + 30);
  panel(s, s.margin + 7 + boxW, y + 25, boxW - 1, 12, { fill: WHITE, radius: 2 });
  field(s, "Packages", String(input.packages), s.margin + 11 + boxW, y + 30);

  /* Received, and keep it. */
  const condition = input.condition.toLowerCase().replace("_", " ");
  const gotW = widthOf(s, "Received", { size: 8, bold: true, caps: true });
  const gotSwW = widthOf(s, `· ${condition} · Imepokelewa`, { size: 7.5 });
  doc.setFillColor(236, 253, 245);
  doc.setDrawColor(GREEN[0], GREEN[1], GREEN[2]);
  doc.setLineWidth(0.3);
  doc.roundedRect(s.margin + 6, y + 40, gotW + gotSwW + 10, 7, 3.5, 3.5, "FD");
  text(s, "Received", s.margin + 10, y + 44.7, { size: 8, bold: true, caps: true, color: GREEN });
  text(s, `· ${condition} · Imepokelewa`, s.margin + 10 + gotW + 2, y + 44.7, {
    size: 7.5,
    color: GREEN,
  });

  const keepTextW = widthOf(s, "Keep this note", { size: 8, bold: true, caps: true });
  const keepSwW = widthOf(s, "· Hifadhi hati hii", { size: 7.5 });
  const keepX = s.margin + 9 + gotW + gotSwW + 10;
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(HAIR[0], HAIR[1], HAIR[2]);
  doc.roundedRect(keepX, y + 40, keepTextW + keepSwW + 10, 7, 3.5, 3.5, "FD");
  text(s, "Keep this note", keepX + 4, y + 44.7, { size: 8, bold: true, caps: true, color: NAVY });
  text(s, "· Hifadhi hati hii", keepX + 4 + keepTextW + 2, y + 44.7, { size: 7.5, color: MUTED });

  const codeX = s.right - codeW;
  doc.setFillColor(NAVY[0], NAVY[1], NAVY[2]);
  doc.roundedRect(codeX, y, codeW, cardH, 3, 3, "F");
  if (input.qr) {
    const q = 34;
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(codeX + (codeW - q - 4) / 2, y + 4, q + 4, q + 4, 2, 2, "F");
    try {
      doc.addImage(input.qr, "PNG", codeX + (codeW - q) / 2, y + 6, q, q, "dn", "FAST");
    } catch {
      /* A code that will not decode is not worth failing the document over. */
    }
  }
  text(s, "Scan to track", codeX + codeW / 2, y + 44, {
    size: 5.2,
    bold: true,
    caps: true,
    color: [159, 216, 245],
    align: "center",
  });
  text(s, "Fuatilia mzigo wako", codeX + codeW / 2, y + 48.5, {
    size: 5,
    color: [206, 220, 232],
    align: "center",
  });

  y += cardH + 6;

  /* ------------------------------------------------------ the receipt */
  const cells: [string, string][] = [
    ["Received", input.receivedAt],
    ["At", input.warehouse],
    ["Container", input.container ?? "—"],
    ["Pieces", input.pieces ? String(input.pieces) : "—"],
    ["Weight", input.weight ? `${input.weight} kg` : "—"],
    ["Volume", `${input.cbm} CBM`],
  ];
  const cw = width / 3;
  panel(s, s.margin, y, width, 28, { fill: WHITE, radius: 2 });
  cells.forEach(([k, v], i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    field(s, k, v, s.margin + col * cw + 4, y + 5.5 + row * 14, { width: cw - 8, size: 9 });
  });
  y += 34;

  text(s, "Goods · Bidhaa", s.margin, y, { size: 5.6, caps: true, bold: true, color: MUTED });
  text(s, input.goods, s.margin + 26, y, { size: 9, bold: true, maxWidth: width - 30 });
  y += 6;

  /* --------------------------------------------------------- the lines */
  if (input.lines.length > 0) {
    const columns: { label: string; width: number; align?: "right" }[] = [
      { label: "Line", width: 22 },
      { label: "Goods", width: 48 },
      { label: "Packed as", width: 24 },
      { label: "Qty", width: 12, align: "right" },
      { label: "L x W x H", width: 32, align: "right" },
      { label: "CBM", width: 16, align: "right" },
      { label: "Weight", width: 22, align: "right" },
    ];
    const totalW = columns.reduce((sum, c) => sum + c.width, 0);
    const scale = width / totalW;

    doc.setFillColor(NAVY[0], NAVY[1], NAVY[2]);
    doc.rect(s.margin, y, width, 7, "F");
    let x = s.margin;
    for (const c of columns) {
      const w = c.width * scale;
      /* Right-aligned headers sit a little further in than their figures:
         the caps spacing adds half a point per letter, which walks the last
         one off the edge of the sheet. */
      text(s, c.label, c.align === "right" ? x + w - 3.5 : x + 2, y + 4.7, {
        size: 5.8,
        caps: true,
        bold: true,
        color: [159, 216, 245],
        align: c.align ?? "left",
      });
      x += w;
    }
    y += 7;

    input.lines.forEach((line, i) => {
      if (y > s.bottom - 60) return;
      if (i % 2 === 1) {
        doc.setFillColor(245, 249, 252);
        doc.rect(s.margin, y, width, 6.5, "F");
      }
      const cellValues = [
        line.reference,
        line.goods,
        line.packedAs,
        String(line.quantity),
        line.dimensions,
        line.cbm,
        line.weight,
      ];
      let cx = s.margin;
      columns.forEach((c, ci) => {
        const w = c.width * scale;
        text(s, cellValues[ci] ?? "", c.align === "right" ? cx + w - 2 : cx + 2, y + 4.4, {
          size: 6.8,
          bold: ci === 0,
          maxWidth: w - 4,
          align: c.align ?? "left",
        });
        cx += w;
      });
      y += 6.5;
    });

    /* The totals, off the lines themselves. */
    doc.setDrawColor(NAVY[0], NAVY[1], NAVY[2]);
    doc.setLineWidth(0.5);
    doc.line(s.margin, y, s.right, y);
    text(s, "Total", s.margin + 2, y + 5, { size: 7, bold: true, caps: true });
    let tx = s.margin;
    columns.forEach((c, ci) => {
      const w = c.width * scale;
      if (ci === 3) text(s, String(input.packages), tx + w - 2, y + 5, { size: 7, bold: true, align: "right" });
      if (ci === 5) text(s, input.cbm, tx + w - 2, y + 5, { size: 7, bold: true, align: "right" });
      if (ci === 6 && input.weight) {
        text(s, `${input.weight} kg`, tx + w - 2, y + 5, { size: 7, bold: true, align: "right" });
      }
      tx += w;
    });
    y += 12;
  }

  /* ---------------------------------------------------------- the terms */
  const termW = (width - 4) / 2;
  panel(s, s.margin, y, termW, 20, { radius: 2 });
  text(s, "What we received", s.margin + 4, y + 5.5, { size: 7, bold: true, caps: true, color: NAVY });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.6);
  doc.setTextColor(90, 100, 110);
  doc.text(
    doc.splitTextToSize(
      "This note records the goods Swift Cargo received for you at our Guangzhou warehouse. The final charge is worked out from the measured volume and the rate for its category.",
      termW - 8
    ),
    s.margin + 4,
    y + 9.5
  );

  panel(s, s.margin + termW + 4, y, termW, 20, { fill: [255, 242, 234], border: [255, 214, 194], radius: 2 });
  text(s, "Tulichopokea", s.margin + termW + 8, y + 5.5, {
    size: 7,
    bold: true,
    caps: true,
    color: [179, 68, 15],
  });
  doc.setTextColor(120, 80, 60);
  doc.text(
    doc.splitTextToSize(
      "Hati hii inaonyesha mzigo tuliopokea kwa ajili yako kwenye ghala letu Guangzhou. Gharama ya mwisho inahesabiwa kwa ujazo (CBM) uliopimwa na bei ya aina ya bidhaa.",
      termW - 8
    ),
    s.margin + termW + 8,
    y + 9.5
  );
  y += 28;

  /* ------------------------------------------------------- signatures */
  const sigW = (width - 10) / 2;
  [
    ["Delivered by · Aliyeleta", "Name and signature"],
    [
      "Received by · Aliyepokea",
      input.issuedBy ? `${input.company.name} — ${input.issuedBy}` : input.company.name,
    ],
  ].forEach(([title, sub], i) => {
    const x = s.margin + i * (sigW + 10);
    doc.setDrawColor(150, 160, 170);
    doc.setLineDashPattern([1, 1], 0);
    doc.line(x, y + 10, x + sigW, y + 10);
    doc.setLineDashPattern([], 0);
    text(s, title, x, y + 14, { size: 6.4, bold: true, caps: true, color: [90, 100, 110] });
    text(s, sub, x, y + 17.5, { size: 6.2, color: MUTED });
  });

  footer(s, [input.company.email, input.company.phone].filter(Boolean).join(" · "), input.company.name);
  return bytes(s);
}

export { attachment as deliveryNoteAttachment };
