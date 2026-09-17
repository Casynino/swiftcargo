import "server-only";

import { jsPDF } from "jspdf";

import type { Cell, ReportTable } from "@/lib/report-tables";

type RGB = [number, number, number];

const NAVY: RGB = [14, 76, 135];
const INK: RGB = [23, 23, 23];
const MUTED: RGB = [115, 115, 115];
const HAIR: RGB = [229, 229, 229];
const ZEBRA: RGB = [247, 247, 248];
const WHITE: RGB = [255, 255, 255];
const RED: RGB = [185, 28, 28];

const MARGIN = 36;

/* The built-in Helvetica only draws Windows-1252. An arrow or a Chinese vendor
   name would otherwise print as a row of boxes, so they are folded or dropped
   here, the same way the invoice does it. */
function plain(value: Cell | null | undefined) {
  return String(value ?? "")
    .replace(/[→⟶]/g, "-")
    .replace(/[−–]/g, "-")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[^\x20-\x7E\xA0-\xFF—€]/g, "");
}

const grouped = (n: number, places: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: places, maximumFractionDigits: places });

/**
 * A report as a document somebody can hand over.
 *
 * The same table the CSV carries, set on paper: a navy band, the company, the
 * title and period, the report's own sentence saying what it includes, and a
 * banded table that repeats its header on every page. Wide registers turn the
 * page on its side rather than crushing ten columns into portrait.
 *
 * Nothing here computes a figure. Money cells arrive as numbers and are only
 * grouped for reading — shillings whole, everything else to the cent.
 */
export function renderReportPdf(
  report: ReportTable,
  meta: { company: string; period: string; preparedBy: string; logo?: string | null }
): Uint8Array {
  const landscape = report.columns.length > 6;
  const doc = new jsPDF({ unit: "pt", format: "a4", orientation: landscape ? "landscape" : "portrait", compress: true });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const CONTENT = W - MARGIN * 2;
  const BOTTOM = H - 40;

  const font = (size: number, style: "normal" | "bold" = "normal", colour: RGB = INK) => {
    doc.setFontSize(size);
    doc.setFont("helvetica", style);
    doc.setTextColor(colour[0], colour[1], colour[2]);
  };
  const fill = (c: RGB) => doc.setFillColor(c[0], c[1], c[2]);

  /* Column widths from what each column has to hold, capped so one long
     description cannot starve the figures, then scaled to the page. */
  font(7.5);
  const sample = [...report.rows.slice(0, 200), ...(report.total ? [report.total] : [])];
  const natural = report.columns.map((column, i) => {
    const widest = Math.max(
      doc.getTextWidth(plain(column.label)),
      ...sample.map((row) => doc.getTextWidth(plain(display(row[i]))))
    );
    return Math.min(Math.max(widest + 10, column.money || column.numeric ? 48 : 56), 190);
  });
  const scale = CONTENT / natural.reduce((s, w) => s + w, 0);
  const widths = natural.map((w) => w * scale);
  const xs = widths.map((_, i) => MARGIN + widths.slice(0, i).reduce((s, w) => s + w, 0));
  const right = (i: number) => Boolean(report.columns[i]?.money || report.columns[i]?.numeric);

  /* A shilling column holds whole shillings already; only a figure that
     arrived with a fraction — a dollar balance, a cent — is shown with one. */
  function display(value: Cell | undefined) {
    if (typeof value === "number") return grouped(value, Number.isInteger(value) ? 0 : 2);
    return value ?? "";
  }

  function fit(text: string, width: number) {
    let out = plain(text);
    if (doc.getTextWidth(out) <= width) return out;
    while (out.length > 1 && doc.getTextWidth(`${out}...`) > width) out = out.slice(0, -1);
    return `${out}...`;
  }

  let y = 0;

  function band(first: boolean) {
    fill(NAVY);
    doc.rect(0, 0, W, 6, "F");
    if (first) {
      let x = MARGIN;
      if (meta.logo) {
        try {
          const props = doc.getImageProperties(meta.logo);
          const h = 30;
          doc.addImage(meta.logo, "PNG", MARGIN, 22, (h * props.width) / props.height, h, "logo", "FAST");
          x = MARGIN + (h * props.width) / props.height + 12;
        } catch {
          /* A logo that cannot be read leaves the name to carry the page. */
        }
      }
      font(9, "bold", MUTED);
      doc.text(plain(meta.company.toUpperCase()), x, 34);
      font(16, "bold");
      doc.text(plain(report.title), x, 52);
      font(8.5, "normal", MUTED);
      doc.text(plain(meta.period), W - MARGIN, 34, { align: "right" });
      doc.text(
        plain(`Prepared by ${meta.preparedBy} · ${new Date().toLocaleString("en-GB", { timeZone: "Africa/Dar_es_Salaam" })}`),
        W - MARGIN,
        48,
        { align: "right" }
      );
      y = 72;
      font(8.5, "normal", MUTED);
      const lines = doc.splitTextToSize(plain(report.description), CONTENT) as string[];
      doc.text(lines, MARGIN, y);
      y += lines.length * 11 + 8;
    } else {
      font(8, "bold", MUTED);
      doc.text(plain(`${report.title} — ${meta.period} — continued`), MARGIN, 26);
      y = 40;
    }
  }

  function header() {
    fill(NAVY);
    doc.rect(MARGIN, y, CONTENT, 18, "F");
    font(7.5, "bold", WHITE);
    report.columns.forEach((column, i) => {
      const text = fit(column.label, widths[i] - 8);
      if (right(i)) doc.text(text, xs[i] + widths[i] - 4, y + 12, { align: "right" });
      else doc.text(text, xs[i] + 4, y + 12);
    });
    y += 18;
  }

  function row(cells: Cell[], index: number, bold = false) {
    if (y + 15 > BOTTOM) {
      doc.addPage();
      band(false);
      header();
    }
    if (bold) {
      doc.setDrawColor(INK[0], INK[1], INK[2]);
      doc.setLineWidth(0.8);
      doc.line(MARGIN, y, MARGIN + CONTENT, y);
    } else if (index % 2 === 1) {
      fill(ZEBRA);
      doc.rect(MARGIN, y, CONTENT, 15, "F");
    }
    report.columns.forEach((_, i) => {
      const value = cells[i];
      const negative = typeof value === "number" && value < 0;
      font(7.5, bold ? "bold" : "normal", negative ? RED : INK);
      const text = fit(String(display(value)), widths[i] - 8);
      if (right(i)) doc.text(text, xs[i] + widths[i] - 4, y + 10.5, { align: "right" });
      else doc.text(text, xs[i] + 4, y + 10.5);
    });
    y += 15;
  }

  band(true);
  header();
  if (report.rows.length === 0) {
    /* An empty report says so in words. A header with nothing under it reads as
       a document that failed to render. */
    font(9, "bold");
    doc.text("Nothing recorded for this period.", MARGIN, y + 18);
    font(8, "normal", MUTED);
    doc.text("The report ran; there is no activity on record inside the window chosen.", MARGIN, y + 32);
    y += 40;
  } else {
    report.rows.forEach((cells, i) => row(cells, i));
    if (report.total) row(report.total, 0, true);
  }

  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page);
    doc.setDrawColor(HAIR[0], HAIR[1], HAIR[2]);
    doc.setLineWidth(0.5);
    doc.line(MARGIN, H - 28, W - MARGIN, H - 28);
    font(7, "normal", MUTED);
    doc.text(plain(`${meta.company} · ${report.title} · ${meta.period}`), MARGIN, H - 17);
    doc.text(`Page ${page} of ${pages}`, W - MARGIN, H - 17, { align: "right" });
  }

  return new Uint8Array(doc.output("arraybuffer"));
}
