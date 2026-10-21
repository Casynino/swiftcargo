import type { jsPDF } from "jspdf";

/**
 * A PDF'S BUILT-IN FONT HAS NO CHINESE IN IT.
 *
 * Guangzhou writes goods in whatever is quickest at the counter — "auto parts"
 * beside the Chinese for it — and Helvetica, the font these documents are set
 * in, cannot draw those characters. jsPDF does not skip them: it prints each
 * as a stray Latin symbol, so a clean note came out reading "auto parts)·f'MNö".
 * Anything the font cannot draw is left out, and the Latin words that remain
 * print as written. The record itself is not touched — only what is drawn.
 */
const KEEP = /[^\u0009\u000A -~ -ÿ–—‘’“”•…€]/g;

export function latin(value: string): string {
  if (!value) return value;
  const out = value.replace(KEEP, " ").replace(/[ \t]{2,}/g, " ").replace(/\s+([,.;:)])/g, "$1").trim();
  return out === "" ? "—" : out;
}

const clean = (t: unknown): unknown => (typeof t === "string" ? latin(t) : Array.isArray(t) ? t.map((x) => (typeof x === "string" ? latin(x) : x)) : t);

/** Makes every string drawn or measured on this document safe for its font. */
export function latinOnly(doc: jsPDF) {
  const text = doc.text.bind(doc);
  const split = doc.splitTextToSize.bind(doc);
  const width = doc.getTextWidth.bind(doc);
  doc.text = ((t: unknown, ...rest: unknown[]) => (text as (...a: unknown[]) => unknown)(clean(t), ...rest)) as typeof doc.text;
  doc.splitTextToSize = ((t: unknown, ...rest: unknown[]) => (split as (...a: unknown[]) => unknown)(clean(t), ...rest)) as typeof doc.splitTextToSize;
  doc.getTextWidth = ((t: string) => width(latin(t))) as typeof doc.getTextWidth;
  return doc;
}
