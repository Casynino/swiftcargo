import { jsPDF } from "jspdf";

/**
 * THE INVOICE AS A FILE.
 *
 * The Download button used to open the printable page and raise the browser's
 * print dialog, which on a phone produces nothing that can be attached to a
 * WhatsApp message. This draws the same document — the company's printed form,
 * section for section as components/app/invoice-document.tsx lays it out — into
 * a real PDF on the server.
 *
 * Everything arrives already formatted by lib/invoice-pdf-data.ts. This module
 * reads no database and does no arithmetic beyond layout: a second place that
 * worked out a balance would be a second place that could disagree with the
 * screen the bill was checked on.
 */

export type PdfTone = "red" | "amber" | "green" | "grey";

type PaymentLine = {
  number: string;
  name: string;
  institution: string;
  branch: string | null;
};

export type InvoicePdfInput = {
  /** A data URL of the logo, read from disk by the caller. */
  logo?: string | null;
  /** The invoice's own verification code, as a PNG data URL. Never a cargo code. */
  qr?: string | null;
  stamp: { label: string; tone: PdfTone };
  company: {
    name: string;
    addressLines: string[];
    taxLine: string | null;
    email: string | null;
    contact: string | null;
    tagline: string;
  };
  issuedOn: string;
  dueOn: string;
  customer: {
    headline: string;
    personName: string | null;
    phone: string;
    address: string;
    code: string;
  };
  details: [string, string][];
  items: {
    receiptNo: string;
    description: string;
    packages: string;
    pieces: string;
    quantity: string;
    unitPrice: string;
    amount: string;
    /** A negative line — a discount or credit — printed in green as on screen. */
    credit: boolean;
  }[];
  notes: string | null;
  banks: PaymentLine[];
  mobile: PaymentLine[];
  totals: {
    /** "Sub total", or "Before VAT" on a bill whose price contains it. */
    subtotalLabel: string;
    subtotal: string;
    vatLabel: string;
    vat: string;
    total: string;
    totalTzs: string | null;
    paid: string | null;
  };
  /** Null on a cancelled bill, which has nothing left to pay. */
  due: {
    settled: boolean;
    headline: string;
    sub: string | null;
    credit: string | null;
  } | null;
  terms: string[];
  storage: {
    sw: { heading: string; body: string };
    en: { heading: string; body: string };
  } | null;
  issuedLine: string | null;
  /** The invoice number, repeated on continuation pages. */
  reference: string;
};

type RGB = [number, number, number];

const PAGE_W = 595.28; // A4 in points
const PAGE_H = 841.89;
const MARGIN = 40;
const RIGHT = PAGE_W - MARGIN;
const CONTENT = RIGHT - MARGIN;
const BOTTOM = PAGE_H - 34; // nothing in the body may cross this

const NAVY: RGB = [14, 76, 135]; // navy-700
const NAVY_DEEP: RGB = [8, 43, 77]; // navy-900
const NAVY_RULE: RGB = [52, 106, 158];
const INK: RGB = [23, 23, 23];
const BODY: RGB = [64, 64, 64];
const MUTED: RGB = [115, 115, 115];
const HAIR: RGB = [229, 229, 229];
const PANEL: RGB = [247, 247, 248];
const GREY_ROW: RGB = [241, 241, 242];
const WHITE: RGB = [255, 255, 255];
const EMERALD: RGB = [5, 150, 105];
const EMERALD_INK: RGB = [4, 120, 87];
const RED_INK: RGB = [185, 28, 28];
const RED_LINE: RGB = [254, 202, 202];
const ORANGE: RGB = [234, 88, 12];

const TONES: Record<PdfTone, { line: RGB; fill: RGB; ink: RGB }> = {
  red: { line: [220, 38, 38], fill: [254, 242, 242], ink: RED_INK },
  amber: { line: [245, 158, 11], fill: [255, 251, 235], ink: [180, 83, 9] },
  green: { line: [5, 150, 105], fill: [236, 253, 245], ink: EMERALD_INK },
  grey: { line: [163, 163, 163], fill: [245, 245, 245], ink: [82, 82, 82] },
};

/**
 * Fold text onto the character set the built-in font actually has.
 *
 * Helvetica in jsPDF is WinAnsi. A character outside it does not fall back — it
 * prints as a stray mark with the rest of the line letter-spaced into garbage.
 * The minus formatCurrency puts on a negative figure and the arrows in a route
 * are replaced rather than dropped, because losing them changes the meaning.
 */
function winAnsi(value: string) {
  return String(value)
    .replace(/[→⟶]/g, "—")
    .replace(/[−–]/g, "-")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[^\x20-\x7E\xA0-\xFF—€]/g, "");
}

/**
 * What is left of a typed label once the font has had it — or the fallback.
 *
 * Guangzhou types descriptions in Chinese, and every Chinese character is
 * dropped from the page rather than drawn. A charges row whose description
 * vanished is a price with nothing against it, so an emptied label is replaced
 * with a word that cannot itself disappear. Brackets that held only Chinese are
 * closed up rather than printed around a hole.
 */
export function latinLabel(text: string, fallback: string): string {
  const sieve = (value: string) =>
    winAnsi(value)
      .replace(/\(\s*\)/g, "")
      .replace(/\s*[-—]\s*$/, "")
      .replace(/\s{2,}/g, " ")
      .trim();
  const kept = sieve(text);
  if (kept.length > 0) return kept;
  const spare = sieve(fallback);
  return spare.length > 0 ? spare : "Goods";
}

export function renderInvoicePdf(input: InvoicePdfInput): Uint8Array {
  const doc = new jsPDF({ unit: "pt", format: "a4", compress: true });

  const ink = (c: RGB) => doc.setTextColor(c[0], c[1], c[2]);
  const fill = (c: RGB) => doc.setFillColor(c[0], c[1], c[2]);
  const stroke = (c: RGB, width = 0.6) => {
    doc.setDrawColor(c[0], c[1], c[2]);
    doc.setLineWidth(width);
  };
  const font = (size: number, style: "normal" | "bold" = "normal") => {
    doc.setFontSize(size);
    doc.setFont("helvetica", style);
  };

  function put(
    value: string,
    x: number,
    y: number,
    {
      size = 8.5,
      style = "normal" as "normal" | "bold",
      align = "left" as "left" | "right" | "center",
      colour = INK,
      spacing = 0,
    } = {}
  ) {
    font(size, style);
    ink(colour);
    // Letter-spacing is left-aligned only: jsPDF measures a right-aligned line
    // without it and the text would overrun its edge.
    doc.text(winAnsi(value), x, y, align === "left" && spacing ? { charSpace: spacing } : { align });
  }

  /** Wrapped lines at the given width, in the font they will be drawn with. */
  function wrap(value: string, width: number, size: number, style: "normal" | "bold" = "normal"): string[] {
    font(size, style);
    return doc.splitTextToSize(winAnsi(value), width) as string[];
  }

  function lines(value: string[], x: number, y: number, leading: number, size: number, colour: RGB, style: "normal" | "bold" = "normal") {
    font(size, style);
    ink(colour);
    value.forEach((line, i) => doc.text(line, x, y + i * leading));
  }

  /** The small uppercase field name every block on the form is titled with. */
  function label(value: string, x: number, y: number, colour = MUTED, size = 6.8) {
    put(value.toUpperCase(), x, y, { size, style: "bold", colour, spacing: 0.9 });
  }

  let y = 0;

  /**
   * A page with no mark on it is a page nobody can attribute, so a continuation
   * carries the band and the invoice number.
   */
  function newPage() {
    doc.addPage();
    fill(NAVY);
    doc.rect(0, 0, PAGE_W, 5, "F");
    put(`${input.reference} — continued`, MARGIN, 32, { size: 8, style: "bold", colour: MUTED });
    y = 48;
  }

  /** Reserve vertical space, breaking the page rather than running off it. */
  function need(height: number) {
    if (y + height > BOTTOM) {
      newPage();
      return true;
    }
    return false;
  }

  // ------------------------------------------------------------- letterhead
  // The house letterhead the pickup note, delivery note and combined bill
  // wear: a navy band across the top, the mark on a white tile, the company in
  // white, INVOICE with its number and stamp on the right, and the orange-to-
  // cyan rule under it. Phones and email are at the foot, under "Contact us".
  const bandH = 104;
  fill(NAVY);
  doc.rect(0, 0, PAGE_W, bandH, "F");

  const tile = 46;
  fill(WHITE);
  doc.roundedRect(MARGIN, 24, tile, tile, 9, 9, "F");
  if (input.logo) {
    const props = doc.getImageProperties(input.logo);
    const inner = tile - 6;
    const w = props.width >= props.height ? inner : (inner * props.width) / props.height;
    const h = props.width >= props.height ? (inner * props.height) / props.width : inner;
    doc.addImage(input.logo, "PNG", MARGIN + (tile - w) / 2, 24 + (tile - h) / 2, w, h, "logo", "FAST");
  }
  const textX = MARGIN + tile + 12;
  put(input.company.name.toUpperCase(), textX, 38, { size: 13, style: "bold", colour: WHITE, spacing: 1.2 });
  put(input.company.tagline.toUpperCase(), textX, 48, { size: 6, style: "bold", colour: [255, 178, 125], spacing: 1.4 });
  const companyInfo = [input.company.addressLines.join(", "), input.company.taxLine ?? ""]
    .filter(Boolean)
    .flatMap((line) => wrap(line, 230, 6.8));
  lines(companyInfo, textX, 60, 8.5, 6.8, [200, 214, 228]);

  put("INVOICE", RIGHT, 34, { size: 7.5, style: "bold", align: "right", colour: [159, 216, 245] });
  put("BILI", RIGHT, 43, { size: 6, align: "right", colour: [170, 186, 204] });
  put(input.reference, RIGHT, 62, { size: 17, style: "bold", align: "right", colour: WHITE });
  const tone = TONES[input.stamp.tone];
  const stampText = input.stamp.label.toUpperCase();
  font(6.8, "bold");
  const stampW = doc.getTextWidth(stampText) + stampText.length * 1.3 + 14;
  fill(tone.fill);
  stroke(tone.line, 1.1);
  doc.roundedRect(RIGHT - stampW, 68, stampW, 14, 3, 3, "FD");
  put(stampText, RIGHT - stampW + 7, 77.5, { size: 6.8, style: "bold", colour: tone.ink, spacing: 1.3 });

  if (input.qr) {
    const size = 50;
    const x = RIGHT - 158 - size;
    fill(WHITE);
    doc.roundedRect(x - 4, 20, size + 8, size + 8, 5, 5, "F");
    doc.addImage(input.qr, "PNG", x, 24, size, size, "verify", "FAST");
    put("SCAN TO VERIFY", x + size / 2, 24 + size + 12, { size: 5, style: "bold", align: "center", colour: [159, 216, 245] });
  }

  // The rule: orange to peach to cyan, in three even steps.
  const ruleY = bandH - 12;
  const third = CONTENT / 3;
  ([[244, 97, 31], [255, 178, 125], [79, 201, 240]] as RGB[]).forEach((c, i) => {
    fill(c);
    doc.rect(MARGIN + i * third, ruleY, third + 0.5, 3, "F");
  });

  y = bandH + 16;
  input.details = [["Issued", input.issuedOn], ["Due", input.dueOn], ...input.details.filter(([k]) => k !== "Issued" && k !== "Due")];

  // ------------------------------------------- who, and which sailing
  const boxGap = 12;
  const boxW = (CONTENT - boxGap) / 2;
  const pad = 14;
  const rightX = MARGIN + boxW + boxGap;

  const headline = wrap(latinLabel(input.customer.headline, input.customer.code), boxW - pad * 2, 12, "bold");
  const person = input.customer.personName ? wrap(latinLabel(input.customer.personName, ""), boxW - pad * 2, 8.5) : [];
  const keyW = 44;
  const customerRows = (
    [
      ["Phone", input.customer.phone],
      ["Address", winAnsi(input.customer.address).trim() || "—"],
      ["Code", input.customer.code],
    ] as const
  ).map(([k, v]) => [k, wrap(v, boxW - pad * 2 - keyW, 8.5)] as const);

  // Measured from the first baseline to the last, plus the padding either side.
  const leftH =
    pad + 6 + 17 + (headline.length - 1) * 14 + 12 + person.length * 11 + 6 +
    customerRows.reduce((sum, [, v]) => sum + v.length * 11 + 4, 0) - 15 + pad;
  const detailRowH = 15;
  const rightH = pad * 2 + 2 + (input.details.length - 1) * detailRowH;
  const infoH = Math.max(leftH, rightH);

  need(infoH);
  fill(PANEL);
  doc.roundedRect(MARGIN, y, boxW, infoH, 5, 5, "F");
  doc.roundedRect(rightX, y, boxW, infoH, 5, 5, "F");

  let ly = y + pad + 6;
  label("Invoice to", MARGIN + pad, ly);
  ly += 17;
  lines(headline, MARGIN + pad, ly, 14, 12, INK, "bold");
  ly += (headline.length - 1) * 14 + 12;
  if (person.length) {
    lines(person, MARGIN + pad, ly, 11, 8.5, BODY);
    ly += person.length * 11;
  }
  ly += 6;
  for (const [k, v] of customerRows) {
    put(k, MARGIN + pad, ly, { size: 8.5, style: "bold", colour: MUTED });
    lines(v, MARGIN + pad + keyW, ly, 11, 8.5, INK);
    ly += v.length * 11 + 4;
  }

  let ry = y + pad + 6;
  input.details.forEach(([k, v], i) => {
    put(k, rightX + pad, ry, { size: 8.5, style: "bold", colour: MUTED });
    put(v, rightX + boxW - pad, ry, {
      size: 8.5,
      style: k === "Invoice no" ? "bold" : "normal",
      align: "right",
      colour: k === "Invoice no" ? NAVY : INK,
    });
    if (i < input.details.length - 1) {
      stroke(HAIR, 0.6);
      doc.line(rightX + pad, ry + 5, rightX + boxW - pad, ry + 5);
    }
    ry += detailRowH;
  });

  y += infoH + 16;

  // ---------------------------------------------------------------- charges
  const columns = [
    { head: "Receipt", w: 50, right: false },
    { head: "Description", w: 0, right: false },
    { head: "Packages", w: 52, right: true },
    { head: "Pieces", w: 42, right: true },
    { head: "Chargeable", w: 64, right: true },
    { head: "Rate", w: 76, right: true },
    { head: "Amount", w: 80, right: true },
  ];
  columns[1].w = CONTENT - columns.reduce((sum, c) => sum + c.w, 0);
  const colX: number[] = [];
  columns.reduce((x, c) => (colX.push(x), x + c.w), MARGIN);
  const cellPad = 7;
  const headH = 22;

  function tableHead() {
    fill(NAVY);
    doc.rect(MARGIN, y, CONTENT, headH, "F");
    columns.forEach((c, i) => {
      const x = c.right ? colX[i] + c.w - cellPad : colX[i] + cellPad;
      put(c.head.toUpperCase(), x, y + 14, { size: 6.8, style: "bold", colour: WHITE, align: c.right ? "right" : "left" });
    });
    y += headH;
  }

  need(headH + 30);
  tableHead();

  input.items.forEach((item, index) => {
    const cells = [
      item.receiptNo,
      latinLabel(item.description.toUpperCase(), "Goods").toUpperCase(),
      item.packages,
      item.pieces,
      item.quantity,
      item.unitPrice,
      item.amount,
    ].map((value, i) => wrap(value, columns[i].w - cellPad * 2, 8.5, i === 1 || i === 6 ? "bold" : "normal"));
    const rowH = Math.max(...cells.map((c) => c.length)) * 11 + 12;

    if (need(rowH)) tableHead();

    if (index % 2 === 1) {
      fill([250, 250, 250]);
      doc.rect(MARGIN, y, CONTENT, rowH, "F");
    }
    cells.forEach((cell, i) => {
      const c = columns[i];
      const colour: RGB = i === 0 ? MUTED : i === 6 && item.credit ? EMERALD_INK : INK;
      font(8.5, i === 1 || i === 6 ? "bold" : "normal");
      ink(colour);
      cell.forEach((line, n) => {
        const x = c.right ? colX[i] + c.w - cellPad : colX[i] + cellPad;
        doc.text(line, x, y + 15 + n * 11, { align: c.right ? "right" : "left" });
      });
    });
    stroke(HAIR, 0.7);
    doc.line(MARGIN, y, MARGIN, y + rowH);
    doc.line(RIGHT, y, RIGHT, y + rowH);
    doc.line(MARGIN, y + rowH, RIGHT, y + rowH);
    y += rowH;
  });

  if (input.notes) {
    const note = wrap(input.notes, CONTENT - 28, 8.5);
    const noteH = note.length * 11 + 14;
    y += 10;
    need(noteH);
    fill(PANEL);
    doc.rect(MARGIN, y, CONTENT, noteH, "F");
    fill(NAVY);
    doc.rect(MARGIN, y, 3, noteH, "F");
    lines(note, MARGIN + 16, y + 16, 11, 8.5, BODY);
    y += noteH;
  }

  y += 18;

  // ------------------------------------------------- how to pay, and totals
  const totalsW = 214;
  const payW = CONTENT - totalsW - 20;
  const totalsX = RIGHT - totalsW;
  const accPad = 12;
  const accGap = 14;
  const accW = (payW - accPad * 2 - accGap) / 2;
  const ACC_LEADING = 9.6;

  type Block = { text: string[]; size: number; style: "normal" | "bold"; colour: RGB };
  const account = (a: PaymentLine, mobile: boolean): Block[] => {
    const number: Block = { text: wrap(a.number, accW, 9.5, "bold"), size: 9.5, style: "bold", colour: INK };
    const name: Block = { text: wrap(a.name.toUpperCase(), accW, 7.5), size: 7.5, style: "normal", colour: BODY };
    const where: Block = { text: wrap(a.institution.toUpperCase(), accW, 7.5, "bold"), size: 7.5, style: "bold", colour: NAVY };
    const branch: Block[] = a.branch
      ? [{ text: wrap(a.branch.toUpperCase(), accW, 7.5), size: 7.5, style: "normal", colour: MUTED }]
      : [];
    return mobile ? [where, number, name] : [number, name, where, ...branch];
  };
  const blockH = (blocks: Block[]) => blocks.reduce((sum, b) => sum + b.text.length * ACC_LEADING, 0);

  /** Accounts two to a row, each row as tall as the taller of its pair. */
  const grid = (list: PaymentLine[], mobile: boolean) => {
    const entries = list.map((a) => account(a, mobile));
    const rows: Block[][][] = [];
    for (let i = 0; i < entries.length; i += 2) rows.push(entries.slice(i, i + 2));
    const heights = rows.map((row) => Math.max(...row.map(blockH)));
    const height = heights.reduce((s, h) => s + h, 0) + Math.max(0, rows.length - 1) * 8;
    return { rows, heights, height };
  };
  const bankGrid = grid(input.banks, false);
  const mobileGrid = grid(input.mobile, true);
  const hasAccounts = input.banks.length + input.mobile.length > 0;
  const accountsH = hasAccounts
    ? accPad * 2 +
      bankGrid.height +
      mobileGrid.height +
      (input.banks.length && input.mobile.length ? 18 : 0)
    : 0;
  const payH = 16 + accountsH;

  const rowH = 22;
  const navyRows: [string, string, boolean][] = [
    [input.totals.vatLabel, input.totals.vat, false],
    ["Total", input.totals.total, true],
    ...(input.totals.totalTzs ? [["Total", input.totals.totalTzs, true] as [string, string, boolean]] : []),
    ...(input.totals.paid ? [["Paid", input.totals.paid, false] as [string, string, boolean]] : []),
  ];
  const dueH = input.due ? 42 + (input.due.sub ? 11 : 0) + (input.due.credit ? 11 : 0) : 0;
  const totalsH = rowH + navyRows.length * rowH + dueH;

  need(Math.max(payH, totalsH));
  const top = y;

  // Payment info
  label("Payment info", MARGIN, top + 6);
  if (hasAccounts) {
    fill(PANEL);
    doc.roundedRect(MARGIN, top + 16, payW, accountsH, 5, 5, "F");
    let ay = top + 16 + accPad + 8;
    const drawGrid = (g: ReturnType<typeof grid>) => {
      g.rows.forEach((row, r) => {
        row.forEach((blocks, c) => {
          let by = ay;
          for (const b of blocks) {
            lines(b.text, MARGIN + accPad + c * (accW + accGap), by, ACC_LEADING, b.size, b.colour, b.style);
            by += b.text.length * ACC_LEADING;
          }
        });
        ay += g.heights[r] + 8;
      });
      ay -= 8;
    };
    drawGrid(bankGrid);
    if (input.banks.length && input.mobile.length) {
      stroke(HAIR, 0.7);
      doc.line(MARGIN + accPad, ay + 1, MARGIN + payW - accPad, ay + 1);
      ay += 18;
    }
    drawGrid(mobileGrid);
  }

  // Totals
  let ty = top;
  fill(GREY_ROW);
  doc.rect(totalsX, ty, totalsW, rowH, "F");
  put(input.totals.subtotalLabel.toUpperCase(), totalsX + 14, ty + 14.5, { size: 8.5, style: "bold" });
  put(input.totals.subtotal, RIGHT - 14, ty + 14.5, { size: 8.5, style: "bold", align: "right" });
  ty += rowH;

  fill(NAVY);
  doc.rect(totalsX, ty, totalsW, navyRows.length * rowH, "F");
  navyRows.forEach(([k, v, strong], i) => {
    if (i > 0) {
      stroke(NAVY_RULE, 0.6);
      doc.line(totalsX, ty, RIGHT, ty);
    }
    const colour: RGB = k === "Paid" ? [216, 226, 238] : WHITE;
    const size = strong && i === 1 ? 10 : 8.5;
    put(k.toUpperCase(), totalsX + 14, ty + 14.5, { size, style: strong ? "bold" : "normal", colour });
    put(v, RIGHT - 14, ty + 14.5, { size, style: strong ? "bold" : "normal", colour, align: "right" });
    ty += rowH;
  });

  // The figure the customer is asked to pay, in shillings first.
  if (input.due) {
    fill(input.due.settled ? EMERALD : NAVY_DEEP);
    doc.rect(totalsX, ty, totalsW, dueH, "F");
    label(input.due.settled ? "Paid in full" : "Amount due", totalsX + 14, ty + 13, [190, 204, 220], 6.3);
    put(input.due.headline, totalsX + 14, ty + 33, { size: 17, style: "bold", colour: WHITE });
    let sy = ty + 33;
    if (input.due.sub) {
      sy += 11;
      put(input.due.sub, totalsX + 14, sy, { size: 7.5, colour: [205, 215, 228] });
    }
    if (input.due.credit) {
      sy += 11;
      put(input.due.credit, totalsX + 14, sy, { size: 7.5, colour: [205, 215, 228] });
    }
    ty += dueH;
  }

  y = Math.max(top + payH, ty) + 18;

  // ------------------------------------------------ terms, storage, footer
  stroke(HAIR, 0.8);
  need(40);
  doc.line(MARGIN, y, RIGHT, y);
  y += 18;

  if (input.terms.length > 0) {
    need(30);
    label("Terms & conditions", MARGIN, y, [82, 82, 82]);
    y += 15;
    input.terms.forEach((term, i) => {
      const text = wrap(term, CONTENT - 16, 7.8);
      need(text.length * 10 + 3);
      put(`${i + 1}.`, MARGIN, y, { size: 7.8, colour: BODY });
      lines(text, MARGIN + 16, y, 10, 7.8, BODY);
      y += text.length * 10 + 3;
    });
    y += 8;
  }

  // Red, in both languages, Kiswahili first: it is the one part of the bill
  // that costs the customer money if it goes unread.
  if (input.storage) {
    const colW = (CONTENT - 28 - 18) / 2;
    const parts = [input.storage.sw, input.storage.en].map((p) => ({
      heading: wrap(p.heading.toUpperCase(), colW, 7.5, "bold"),
      body: wrap(p.body, colW, 7.5),
    }));
    const innerH = Math.max(...parts.map((p) => p.heading.length * 10 + 4 + p.body.length * 10));
    const boxH = 32 + innerH + 2;
    need(boxH);
    fill(WHITE);
    stroke(RED_LINE, 1);
    doc.roundedRect(MARGIN, y, CONTENT, boxH, 5, 5, "FD");
    label("Storage policy", MARGIN + 14, y + 16);
    parts.forEach((p, i) => {
      const x = MARGIN + 14 + i * (colW + 18);
      let py = y + 32;
      lines(p.heading, x, py, 10, 7.5, RED_INK, "bold");
      py += p.heading.length * 10 + 4;
      lines(p.body, x, py, 10, 7.5, RED_INK);
    });
    y += boxH + 8;
  }

  // How to reach us, at the foot where a customer looks for it.
  need(52);
  stroke(HAIR, 0.8);
  doc.line(MARGIN, y, RIGHT, y);
  y += 14;
  label("Contact us · Wasiliana nasi", MARGIN, y, NAVY, 6.8);
  put(input.company.name.toUpperCase(), RIGHT, y, { size: 7.5, style: "bold", align: "right", colour: NAVY });
  y += 10;
  if (input.company.addressLines.length) {
    put(input.company.addressLines.join(", "), MARGIN, y, { size: 7.2, colour: BODY });
  }
  put(input.company.tagline.toUpperCase(), RIGHT, y, { size: 6, style: "bold", align: "right", colour: ORANGE });
  y += 10;
  const reach = [input.company.contact, input.company.email].filter(Boolean).join("  ·  ");
  if (reach) {
    put(reach, MARGIN, y, { size: 7.2, colour: BODY });
    y += 10;
  }
  if (input.issuedLine) {
    put(input.issuedLine, MARGIN, y, { size: 6.8, colour: MUTED });
  }

  // Page numbers once the page count is known. A one-page bill is not told it
  // is page one of one.
  const pages = doc.getNumberOfPages();
  if (pages > 1) {
    for (let p = 1; p <= pages; p++) {
      doc.setPage(p);
      put(`${input.reference} · page ${p} of ${pages}`, RIGHT, PAGE_H - 18, { size: 7, align: "right", colour: MUTED });
    }
  }

  return new Uint8Array(doc.output("arraybuffer"));
}
