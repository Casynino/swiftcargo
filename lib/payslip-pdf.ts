import "server-only";

import { jsPDF } from "jspdf";

import type { PayrollFigure } from "@/lib/payroll";

type RGB = [number, number, number];

const NAVY: RGB = [14, 76, 135];
const INK: RGB = [23, 23, 23];
const MUTED: RGB = [115, 115, 115];
const HAIR: RGB = [229, 229, 229];

const MARGIN = 48;

/* The built-in Helvetica only draws Windows-1252; anything else would print as
   a row of boxes on somebody's pay slip. */
function plain(value: string | null | undefined) {
  return String(value ?? "")
    .replace(/[−–]/g, "-")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[^\x20-\x7E\xA0-\xFF—]/g, "");
}

export type PayslipInput = {
  company: string;
  address: string | null;
  logo: string | null;
  code: string;
  period: string;
  paidOn: string;
  paidFrom: string;
  expenseReference: string;
  approvedBy: string | null;
  name: string;
  roleLabel: string;
  note: string | null;
  gross: PayrollFigure;
  allowance: PayrollFigure;
  deduction: PayrollFigure;
  net: PayrollFigure;
  /** "1 USD = 2,700 TZS", when the slip was struck in shillings. */
  rateLabel: string | null;
};

/**
 * One page per person, in one file.
 *
 * Nothing here computes a figure. Every amount arrives already written out by
 * lib/payroll.ts from the run's own snapshot lines, at the rate frozen on the
 * cost the run became — so a slip printed next year says what was paid this
 * month.
 */
export function renderPayslipsPdf(slips: PayslipInput[]): Uint8Array {
  const doc = new jsPDF({ unit: "pt", format: "a4", orientation: "portrait", compress: true });
  const W = doc.internal.pageSize.getWidth();
  const CONTENT = W - MARGIN * 2;

  const font = (size: number, style: "normal" | "bold" = "normal", colour: RGB = INK) => {
    doc.setFontSize(size);
    doc.setFont("helvetica", style);
    doc.setTextColor(colour[0], colour[1], colour[2]);
  };

  slips.forEach((slip, index) => {
    if (index > 0) doc.addPage();

    doc.setFillColor(NAVY[0], NAVY[1], NAVY[2]);
    doc.rect(0, 0, W, 6, "F");

    let x = MARGIN;
    if (slip.logo) {
      try {
        const props = doc.getImageProperties(slip.logo);
        const h = 34;
        doc.addImage(slip.logo, "PNG", MARGIN, 30, (h * props.width) / props.height, h, "logo", "FAST");
        x = MARGIN + (h * props.width) / props.height + 14;
      } catch {
        /* A logo that cannot be read leaves the name to carry the page. */
      }
    }
    font(10, "bold", MUTED);
    doc.text(plain(slip.company.toUpperCase()), x, 44);
    if (slip.address) {
      font(8, "normal", MUTED);
      doc.text(plain(slip.address), x, 57);
    }
    font(18, "bold");
    doc.text("Payslip", W - MARGIN, 46, { align: "right" });
    font(9, "normal", MUTED);
    doc.text(plain(`${slip.period} · ${slip.code}`), W - MARGIN, 60, { align: "right" });

    let y = 100;
    doc.setDrawColor(HAIR[0], HAIR[1], HAIR[2]);
    doc.setLineWidth(0.6);
    doc.line(MARGIN, y, W - MARGIN, y);
    y += 24;

    const pair = (label: string, value: string, px: number, py: number) => {
      font(8, "normal", MUTED);
      doc.text(plain(label), px, py);
      font(10.5, "bold");
      doc.text(plain(value), px, py + 14);
    };
    pair("Employee", slip.name, MARGIN, y);
    pair("Role", slip.roleLabel, MARGIN + CONTENT / 2, y);
    y += 38;
    pair("Paid on", slip.paidOn, MARGIN, y);
    pair("Paid from", slip.paidFrom, MARGIN + CONTENT / 2, y);
    y += 44;

    const amount = (figure: PayrollFigure, py: number, bold = false) => {
      font(bold ? 12 : 10.5, bold ? "bold" : "normal");
      doc.text(plain(figure.lead), W - MARGIN, py, { align: "right" });
      if (figure.sub) {
        font(8, "normal", MUTED);
        doc.text(plain(figure.sub), W - MARGIN - 150, py, { align: "right" });
      }
    };

    doc.setFillColor(NAVY[0], NAVY[1], NAVY[2]);
    doc.rect(MARGIN, y, CONTENT, 20, "F");
    font(8.5, "bold", [255, 255, 255]);
    doc.text("Description", MARGIN + 8, y + 13.5);
    doc.text("Amount", W - MARGIN - 8, y + 13.5, { align: "right" });
    y += 38;

    const line = (label: string, figure: PayrollFigure, sign = "") => {
      font(10.5, "normal");
      doc.text(plain(label), MARGIN + 8, y);
      amount(
        sign && figure.lead !== "—" ? { lead: `${sign}${figure.lead}`, sub: figure.sub } : figure,
        y
      );
      y += 12;
      doc.setDrawColor(HAIR[0], HAIR[1], HAIR[2]);
      doc.line(MARGIN, y, W - MARGIN, y);
      y += 20;
    };
    line("Monthly salary", slip.gross);
    line("Allowances", slip.allowance, "+ ");
    line("Deductions", slip.deduction, "- ");

    doc.setDrawColor(INK[0], INK[1], INK[2]);
    doc.setLineWidth(1);
    doc.line(MARGIN, y - 14, W - MARGIN, y - 14);
    font(12, "bold");
    doc.text("Net pay", MARGIN + 8, y + 4);
    amount(slip.net, y + 4, true);
    y += 34;

    font(8.5, "normal", MUTED);
    const notes = [
      slip.note ? `Note: ${slip.note}` : null,
      slip.rateLabel ? `Shillings at ${slip.rateLabel}, the rate the salaries were paid at.` : null,
      `Booked as ${slip.expenseReference}${slip.approvedBy ? `, agreed by ${slip.approvedBy}` : ""}.`,
    ].filter((n): n is string => Boolean(n));
    for (const n of notes) {
      const wrapped = doc.splitTextToSize(plain(n), CONTENT) as string[];
      doc.text(wrapped, MARGIN, y);
      y += wrapped.length * 11 + 4;
    }

    const H = doc.internal.pageSize.getHeight();
    doc.setDrawColor(HAIR[0], HAIR[1], HAIR[2]);
    doc.setLineWidth(0.5);
    doc.line(MARGIN, H - 36, W - MARGIN, H - 36);
    font(7, "normal", MUTED);
    doc.text(plain(`${slip.company} · Payslip ${slip.code} · ${slip.name}`), MARGIN, H - 24);
    doc.text(`${index + 1} of ${slips.length}`, W - MARGIN, H - 24, { align: "right" });
  });

  return new Uint8Array(doc.output("arraybuffer"));
}
