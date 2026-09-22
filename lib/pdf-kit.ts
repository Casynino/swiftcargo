import "server-only";

import { jsPDF } from "jspdf";

/**
 * THE PIECES EVERY DOCUMENT WE HAND OUT IS BUILT FROM.
 *
 * A downloaded document is a file, not a print dialog. Printing is the
 * browser's job and is one button; downloading is a PDF this server draws and
 * is another, and the two are never the same press — a clerk asked to "print
 * or download" reaches for whichever the counter needs and should not have to
 * discover that one of them opens the other.
 *
 * The invoice has its own renderer (lib/invoice-pdf.ts) with a layout the
 * business has been sending out for months; this kit is for the documents
 * drawn since — the pickup note, the packing list and the box labels — so they
 * share a letterhead, a rule and a footer rather than three hand-measured
 * copies of the same header.
 *
 * Millimetres throughout. These are physical objects: a label is 100mm wide on
 * any printer honest about its scaling.
 */
export type RGB = [number, number, number];

export const NAVY: RGB = [11, 39, 66];
export const NAVY_SOFT: RGB = [36, 84, 128];
export const INK: RGB = [11, 27, 43];
export const BODY: RGB = [70, 82, 94];
export const MUTED: RGB = [128, 141, 153];
export const HAIR: RGB = [214, 226, 238];
export const PANEL: RGB = [245, 249, 252];
export const WHITE: RGB = [255, 255, 255];
export const ORANGE: RGB = [244, 97, 31];
export const GREEN: RGB = [5, 150, 105];

export type Sheet = {
  doc: jsPDF;
  /** Page width and height, and the usable box inside the margins. */
  w: number;
  h: number;
  margin: number;
  right: number;
  bottom: number;
};

export function sheet(
  format: "a4" | [number, number] = "a4",
  margin = 12
): Sheet {
  const doc = new jsPDF({
    unit: "mm",
    format,
    orientation: "portrait",
    compress: true,
  });
  const w = doc.internal.pageSize.getWidth();
  const h = doc.internal.pageSize.getHeight();
  return { doc, w, h, margin, right: w - margin, bottom: h - margin };
}

export function text(
  s: Sheet,
  value: string,
  x: number,
  y: number,
  options: {
    size?: number;
    bold?: boolean;
    color?: RGB;
    align?: "left" | "center" | "right";
    /** Upper-cases and widens, for the small grey labels over a figure. */
    caps?: boolean;
    maxWidth?: number;
  } = {}
) {
  const { doc } = s;
  doc.setFont("helvetica", options.bold ? "bold" : "normal");
  doc.setFontSize(options.size ?? 9);
  const [r, g, b] = options.color ?? INK;
  doc.setTextColor(r, g, b);
  let out = value;
  if (options.caps) {
    out = value.toUpperCase();
    doc.setCharSpace(0.5);
  }
  if (options.maxWidth) {
    out = doc.splitTextToSize(out, options.maxWidth)[0] ?? out;
  }
  doc.text(out, x, y, { align: options.align ?? "left" });
  if (options.caps) doc.setCharSpace(0);
}

/**
 * How wide a string will be, measured in the font it will be drawn in.
 *
 * jsPDF measures with whatever font and size were last set, so measuring
 * without setting them first gives the width of a different string in a
 * different size — which is how a pill ends up shorter than the words inside
 * it.
 */
export function widthOf(
  s: Sheet,
  value: string,
  options: { size?: number; bold?: boolean; caps?: boolean } = {}
): number {
  const { doc } = s;
  doc.setFont("helvetica", options.bold ? "bold" : "normal");
  doc.setFontSize(options.size ?? 9);
  const out = options.caps ? value.toUpperCase() : value;
  /* The caps style widens every gap by half a point. */
  return doc.getTextWidth(out) + (options.caps ? out.length * 0.5 : 0);
}

/** A label in small grey caps with its figure underneath. */
export function field(
  s: Sheet,
  label: string,
  value: string,
  x: number,
  y: number,
  options: { width?: number; size?: number } = {}
) {
  text(s, label, x, y, { size: 5.6, caps: true, color: MUTED, bold: true });
  text(s, value, x, y + 5, {
    size: options.size ?? 10,
    bold: true,
    maxWidth: options.width,
  });
}

export function rule(s: Sheet, y: number, color: RGB = HAIR) {
  const [r, g, b] = color;
  s.doc.setDrawColor(r, g, b);
  s.doc.setLineWidth(0.2);
  s.doc.line(s.margin, y, s.right, y);
}

export function panel(
  s: Sheet,
  x: number,
  y: number,
  w: number,
  h: number,
  options: { fill?: RGB; border?: RGB; radius?: number } = {}
) {
  const { doc } = s;
  const [fr, fg, fb] = options.fill ?? PANEL;
  doc.setFillColor(fr, fg, fb);
  const [br, bg, bb] = options.border ?? HAIR;
  doc.setDrawColor(br, bg, bb);
  doc.setLineWidth(0.2);
  doc.roundedRect(x, y, w, h, options.radius ?? 2, options.radius ?? 2, "FD");
}

/**
 * The company's own band across the top: name, address, and what the document
 * is with its number. Returns the y the body may start at.
 */
export function letterhead(
  s: Sheet,
  input: {
    company: { name: string; tagline?: string | null; address?: string | null; phone?: string | null };
    title: string;
    /** The same words in Swahili, for a document a customer holds. */
    subtitle?: string | null;
    number: string;
    issued?: string | null;
    logo?: string | null;
  }
): number {
  const { doc } = s;
  const bandH = 30;
  const [nr, ng, nb] = NAVY;
  doc.setFillColor(nr, ng, nb);
  doc.rect(0, 0, s.w, bandH, "F");

  let x = s.margin;
  if (input.logo) {
    const tile = 16;
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(x, 7, tile, tile, 2, 2, "F");
    try {
      doc.addImage(input.logo, "PNG", x + 1.5, 8.5, tile - 3, tile - 3, "logo", "FAST");
    } catch {
      /* A logo that will not decode is not worth failing a document over. */
    }
    x += tile + 4;
  }

  text(s, input.company.name, x, 13, { size: 13, bold: true, color: WHITE, caps: true });
  if (input.company.tagline) {
    text(s, input.company.tagline, x, 17.5, { size: 5.8, caps: true, color: [255, 178, 125] });
  }
  const contact = [input.company.address, input.company.phone].filter(Boolean).join(" · ");
  if (contact) {
    text(s, contact, x, 22, { size: 6.4, color: [206, 220, 232], maxWidth: s.w * 0.5 });
  }

  text(s, input.title, s.right, 11, { size: 6.4, caps: true, bold: true, color: [159, 216, 245], align: "right" });
  if (input.subtitle) {
    text(s, input.subtitle, s.right, 15, { size: 5.8, caps: true, color: [206, 220, 232], align: "right" });
  }
  text(s, input.number, s.right, 22, { size: 14, bold: true, color: WHITE, align: "right" });
  if (input.issued) {
    text(s, input.issued, s.right, 26.5, { size: 6.4, color: [206, 220, 232], align: "right" });
  }

  /* The brand stripe, the same one the screen sheet carries. */
  const [orr, org, orb] = ORANGE;
  doc.setFillColor(orr, org, orb);
  doc.rect(s.margin, bandH - 2.2, (s.right - s.margin) * 0.45, 1.2, "F");
  doc.setFillColor(79, 201, 240);
  doc.rect(s.margin + (s.right - s.margin) * 0.45, bandH - 2.2, (s.right - s.margin) * 0.55, 1.2, "F");

  return bandH + 8;
}

export function footer(s: Sheet, left: string, right: string) {
  rule(s, s.bottom - 5);
  text(s, left, s.margin, s.bottom, { size: 6.2, color: MUTED });
  text(s, right, s.right, s.bottom, { size: 6.2, color: NAVY, bold: true, caps: true, align: "right" });
}

export function bytes(s: Sheet): Uint8Array {
  return new Uint8Array(s.doc.output("arraybuffer"));
}

/**
 * The filename a browser saves it under.
 *
 * A downloads folder full of "document.pdf" tells nobody which sailing or
 * which customer they are holding, so the document's own number goes in it.
 */
export function attachment(name: string) {
  const safe = name.replace(/[^A-Za-z0-9 ._-]+/g, " ").replace(/\s+/g, " ").trim();
  return `attachment; filename="${safe}.pdf"`;
}
