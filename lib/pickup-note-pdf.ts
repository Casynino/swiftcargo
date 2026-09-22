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
  type RGB,
} from "@/lib/pdf-kit";

/**
 * THE PICKUP NOTE AS A FILE.
 *
 * The same document as the sheet on screen — the letterhead, who may collect,
 * the code, the figures, the boxes and the two signatures — drawn onto A4 so
 * it can be sent. Downloading is not printing: this returns a PDF, and the
 * Print button beside it opens the browser's dialog on the page. Neither does
 * the other's job.
 *
 * Everything here is a snapshot taken when the note was written. The figures
 * stay true even if the invoice moves afterwards, which is the whole reason a
 * pickup note exists.
 */
export type PickupNotePdf = {
  number: string;
  issued: string;
  company: { name: string; tagline?: string | null; address?: string | null; phone?: string | null; email?: string | null };
  logo?: string | null;
  qr?: string | null;
  customer: { name: string; code: string; phone: string | null };
  senderName?: string | null;
  cargoReference: string;
  container: string | null;
  packages: number;
  goods: string;
  settledLabel: string;
  settled: string;
  settledTzs: string;
  stamp: { text: string; sw: string; tone: "green" | "amber" | "grey" | "red" };
  onCredit: { reason: string | null; dueAt: string | null } | null;
  boxes: { sequence: number; label: string; collected: boolean }[];
  issuedBy: string | null;
};

const TONES: Record<PickupNotePdf["stamp"]["tone"], { ink: RGB; fill: RGB }> = {
  green: { ink: GREEN, fill: [236, 253, 245] },
  amber: { ink: [180, 83, 9], fill: [255, 251, 235] },
  grey: { ink: [82, 82, 82], fill: [245, 245, 245] },
  red: { ink: [185, 28, 28], fill: [254, 242, 242] },
};

export function renderPickupNotePdf(input: PickupNotePdf): Uint8Array {
  const s = sheet("a4", 14);
  const { doc } = s;
  const width = s.right - s.margin;

  let y = letterhead(s, {
    company: input.company,
    title: "Pickup note",
    subtitle: "Hati ya kuchukua mzigo",
    number: input.number,
    issued: `Issued ${input.issued}`,
    logo: input.logo,
  });

  /* ---------------------------------------- who collects, and the code */
  const codeW = 46;
  const cardW = width - codeW - 5;
  const cardH = 52;

  panel(s, s.margin, y, cardW, cardH, { radius: 3 });
  text(s, "Collect by · Anayechukua", s.margin + 6, y + 8, {
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

  /* The two figures the counter checks before it hands anything over. */
  const boxW = (cardW - 12) / 2;
  panel(s, s.margin + 6, y + 25, boxW - 1, 12, { fill: WHITE, radius: 2 });
  field(s, "Tracking no.", input.cargoReference, s.margin + 10, y + 30);
  panel(s, s.margin + 7 + boxW, y + 25, boxW - 1, 12, { fill: WHITE, radius: 2 });
  field(s, "Boxes to collect", input.packages ? String(input.packages) : "—", s.margin + 11 + boxW, y + 30);

  /* The stamp, and what to bring. */
  const tone = TONES[input.stamp.tone];
  const stampTextW = widthOf(s, input.stamp.text, { size: 8, bold: true, caps: true });
  const stampSwW = widthOf(s, `· ${input.stamp.sw}`, { size: 7.5 });
  const stampW = stampTextW + stampSwW + 10;
  doc.setFillColor(tone.fill[0], tone.fill[1], tone.fill[2]);
  doc.setDrawColor(tone.ink[0], tone.ink[1], tone.ink[2]);
  doc.setLineWidth(0.3);
  doc.roundedRect(s.margin + 6, y + 40, stampW, 7, 3.5, 3.5, "FD");
  text(s, input.stamp.text, s.margin + 10, y + 44.7, { size: 8, bold: true, caps: true, color: tone.ink });
  text(s, `· ${input.stamp.sw}`, s.margin + 10 + stampTextW + 2, y + 44.7, {
    size: 7.5,
    color: tone.ink,
  });

  const bringTextW = widthOf(s, "Bring photo ID", { size: 8, bold: true, caps: true });
  const bringSwW = widthOf(s, "· Leta kitambulisho", { size: 7.5 });
  const bringX = s.margin + 9 + stampW;
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(HAIR[0], HAIR[1], HAIR[2]);
  doc.roundedRect(bringX, y + 40, bringTextW + bringSwW + 10, 7, 3.5, 3.5, "FD");
  text(s, "Bring photo ID", bringX + 4, y + 44.7, { size: 8, bold: true, caps: true, color: NAVY });
  text(s, "· Leta kitambulisho", bringX + 4 + bringTextW + 2, y + 44.7, {
    size: 7.5,
    color: MUTED,
  });

  /* The code, in its own dark tile — the thing the door actually reads. */
  const codeX = s.right - codeW;
  doc.setFillColor(NAVY[0], NAVY[1], NAVY[2]);
  doc.roundedRect(codeX, y, codeW, cardH, 3, 3, "F");
  if (input.qr) {
    const q = 34;
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(codeX + (codeW - q - 4) / 2, y + 4, q + 4, q + 4, 2, 2, "F");
    try {
      doc.addImage(input.qr, "PNG", codeX + (codeW - q) / 2, y + 6, q, q, "pickup", "FAST");
    } catch {
      /* A code that will not decode is not worth failing the document over. */
    }
  }
  /* Two lines: the caption is wider than the tile in one, and a word running
     off the edge of a dark panel looks like a fault in the print. */
  text(s, "Scan at the", codeX + codeW / 2, y + 43, {
    size: 5.2,
    bold: true,
    caps: true,
    color: [159, 216, 245],
    align: "center",
  });
  text(s, "Dar counter", codeX + codeW / 2, y + 46.5, {
    size: 5.2,
    bold: true,
    caps: true,
    color: [159, 216, 245],
    align: "center",
  });
  text(s, "Valid once only", codeX + codeW / 2, y + 50, { size: 5, color: [206, 220, 232], align: "center" });

  y += cardH + 6;

  /* ------------------------------------------------- the rest of the facts */
  const cells: [string, string][] = [
    ["Container", input.container ?? "—"],
    [input.settledLabel, input.settled],
    ["In shillings", input.settledTzs],
    ["Goods", input.goods],
  ];
  const cw = width / cells.length;
  panel(s, s.margin, y, width, 14, { fill: WHITE, radius: 2 });
  cells.forEach(([k, v], i) => {
    if (i > 0) {
      doc.setDrawColor(HAIR[0], HAIR[1], HAIR[2]);
      doc.line(s.margin + cw * i, y, s.margin + cw * i, y + 14);
    }
    field(s, k, v, s.margin + cw * i + 4, y + 5.5, { width: cw - 8, size: 9 });
  });
  y += 20;

  if (input.onCredit) {
    panel(s, s.margin, y, width, 11, { fill: [255, 251, 235], border: [252, 211, 77], radius: 2 });
    text(s, "Released on credit.", s.margin + 4, y + 5, { size: 7.5, bold: true, color: [146, 64, 14] });
    text(
      s,
      [input.onCredit.reason, input.onCredit.dueAt ? `Balance due by ${input.onCredit.dueAt}.` : null]
        .filter(Boolean)
        .join(" "),
      s.margin + 4,
      y + 8.8,
      { size: 7, color: [146, 64, 14], maxWidth: width - 8 }
    );
    y += 16;
  }

  /* ------------------------------------------------------ box by box */
  if (input.boxes.length > 0) {
    text(s, "Boxes · Mizigo", s.margin, y, { size: 9, bold: true, caps: true });
    text(s, "Each box is scanned as it is handed over", s.right, y, {
      size: 6.4,
      color: MUTED,
      align: "right",
    });
    y += 4;

    const cols = 3;
    const colW = width / cols;
    const rows = Math.ceil(input.boxes.length / cols);
    const boxesH = rows * 5.5 + 6;
    panel(s, s.margin, y, width, Math.min(boxesH, s.bottom - y - 58), { fill: WHITE, radius: 2 });

    let printed = 0;
    for (const box of input.boxes) {
      const col = printed % cols;
      const row = Math.floor(printed / cols);
      const bx = s.margin + col * colW + 4;
      const by = y + 6 + row * 5.5;
      if (by > s.bottom - 62) {
        text(s, `… and ${input.boxes.length - printed} more`, bx, by, { size: 6.6, color: MUTED });
        break;
      }
      doc.setDrawColor(150, 160, 170);
      doc.setLineWidth(0.2);
      if (box.collected) {
        doc.setFillColor(GREEN[0], GREEN[1], GREEN[2]);
        doc.roundedRect(bx, by - 2.6, 3, 3, 0.5, 0.5, "F");
      } else {
        doc.roundedRect(bx, by - 2.6, 3, 3, 0.5, 0.5, "S");
      }
      text(s, `${box.sequence}/${input.boxes.length}`, bx + 4.5, by, { size: 6.8, bold: true });
      text(s, box.label, bx + 15, by, { size: 6.8, color: [90, 100, 110], maxWidth: colW - 20 });
      printed += 1;
    }
    y += Math.min(boxesH, s.bottom - y - 58) + 6;
  }

  /* --------------------------------------------------------- the terms */
  const termW = (width - 4) / 2;
  panel(s, s.margin, y, termW, 20, { radius: 2 });
  text(s, "This note releases the cargo above", s.margin + 4, y + 5.5, { size: 7, bold: true, caps: true, color: NAVY });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.6);
  doc.setTextColor(90, 100, 110);
  doc.text(
    doc.splitTextToSize(
      "Our warehouse checks every box against it and asks for identification. It is valid once only and is marked used the moment the goods are handed over.",
      termW - 8
    ),
    s.margin + 4,
    y + 9.5
  );

  panel(s, s.margin + termW + 4, y, termW, 20, { fill: [255, 242, 234], border: [255, 214, 194], radius: 2 });
  text(s, "Hati hii ni idhini ya kuchukua mzigo", s.margin + termW + 8, y + 5.5, {
    size: 7,
    bold: true,
    caps: true,
    color: [179, 68, 15],
  });
  doc.setTextColor(120, 80, 60);
  doc.text(
    doc.splitTextToSize(
      "Ghala letu litakagua kila mzigo na kuomba kitambulisho chenye picha. Inatumika mara moja tu, na itawekwa alama ya kutumika mara mzigo utakapokabidhiwa.",
      termW - 8
    ),
    s.margin + termW + 8,
    y + 9.5
  );
  y += 28;

  /* ----------------------------------------------------- signatures */
  const sigW = (width - 10) / 2;
  [
    ["Collected by · Aliyechukua", "Name, ID number and signature"],
    ["Released by · Aliyekabidhi", input.issuedBy ? `Note issued by ${input.issuedBy}` : "Name and signature"],
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

export { attachment as pickupNoteAttachment };
