import "server-only";

import {
  attachment,
  bytes,
  field,
  footer,
  HAIR,
  letterhead,
  MUTED,
  NAVY,
  panel,
  sheet,
  text,
  WHITE,
} from "@/lib/pdf-kit";
import type { PackingSnapshot } from "@/lib/packing-list";

/**
 * THE PACKING LIST AS A FILE.
 *
 * The document that goes to the shipping line and to customs, and the one Dar
 * checks the boxes off against — so it is drawn from the snapshot, never from
 * the live rows. A list a port is holding and a list this system redraws a
 * week later have to say the same thing.
 *
 * It runs to as many pages as the manifest needs, and every page carries the
 * container's number and its own page count: a sheet that comes adrift from
 * the staple must still say what it belongs to.
 */
export function renderPackingListPdf(input: {
  snapshot: PackingSnapshot;
  company: { name: string; tagline?: string | null; address?: string | null; phone?: string | null; email?: string | null };
  logo?: string | null;
  /** Null while the box is still open — the list is provisional until the seal. */
  number: string;
  provisional: boolean;
}): Uint8Array {
  const snap = input.snapshot;
  const s = sheet("a4", 12);
  const { doc } = s;
  const width = s.right - s.margin;

  const head = () =>
    letterhead(s, {
      company: input.company,
      title: "Packing list",
      subtitle: input.provisional ? "Provisional" : "Orodha ya mizigo",
      number: input.number,
      issued: snap.issuedAt ? `Issued ${snap.issuedAt}` : null,
      logo: input.logo,
    });

  let y = head();

  /* ------------------------------------------------- the sailing itself */
  const facts: [string, string][] = [
    ["Container", snap.container],
    ["Seal", snap.sealNumber ?? "—"],
    ["Vessel", snap.vessel ?? "—"],
    ["Voyage", snap.voyage ?? "—"],
    ["From", snap.originPort ?? "—"],
    ["To", snap.destinationPort ?? "—"],
    ["Packed", snap.packedAt ?? "—"],
    ["ETA", snap.eta ?? "—"],
  ];
  const cols = 4;
  const cw = width / cols;
  const rows = Math.ceil(facts.length / cols);
  panel(s, s.margin, y, width, rows * 12, { fill: WHITE, radius: 2 });
  facts.forEach(([k, v], i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    field(s, k, v, s.margin + col * cw + 4, y + 5 + row * 12, { width: cw - 8, size: 8.5 });
  });
  y += rows * 12 + 5;

  /* The totals, which are what a shipping line reads first. */
  const totals: [string, string][] = [
    ["Consignments", String(snap.totalCargo)],
    ["Customers", String(snap.totalCustomers)],
    ["Packages", String(snap.totalPackages)],
    ["Pieces", snap.totalPieces ? String(snap.totalPieces) : "—"],
    ["Weight", snap.totalWeightKg ? `${snap.totalWeightKg} kg` : "—"],
    ["Volume", `${snap.totalCbm} CBM`],
  ];
  const tw = width / totals.length;
  doc.setFillColor(NAVY[0], NAVY[1], NAVY[2]);
  doc.roundedRect(s.margin, y, width, 13, 2, 2, "F");
  totals.forEach(([k, v], i) => {
    text(s, k, s.margin + tw * i + 4, y + 5, { size: 5.4, caps: true, bold: true, color: [159, 216, 245] });
    text(s, v, s.margin + tw * i + 4, y + 10, { size: 9.5, bold: true, color: WHITE });
  });
  y += 19;

  /* ------------------------------------------------------- the manifest */
  const columns: { label: string; width: number; align?: "right" }[] = [
    { label: "#", width: 8 },
    { label: "Tracking", width: 20 },
    { label: "Mark", width: 24 },
    { label: "Customer", width: 34 },
    { label: "Goods", width: 46 },
    { label: "Note", width: 14 },
    { label: "Pkgs", width: 12, align: "right" },
    { label: "Pieces", width: 13, align: "right" },
    { label: "Weight", width: 16, align: "right" },
    { label: "CBM", width: 15, align: "right" },
  ];
  const totalW = columns.reduce((sum, c) => sum + c.width, 0);
  const scale = width / totalW;

  const header = () => {
    doc.setFillColor(241, 245, 249);
    doc.rect(s.margin, y, width, 7, "F");
    let x = s.margin;
    for (const c of columns) {
      const w = c.width * scale;
      text(s, c.label, c.align === "right" ? x + w - 2 : x + 2, y + 4.7, {
        size: 5.8,
        caps: true,
        bold: true,
        color: MUTED,
        align: c.align ?? "left",
      });
      x += w;
    }
    y += 7;
  };
  header();

  snap.lines.forEach((line, i) => {
    if (y > s.bottom - 16) {
      doc.addPage();
      y = head();
      header();
    }
    const cells = [
      String(i + 1),
      line.cargoReference,
      line.shippingMark ?? "—",
      line.customer,
      line.description,
      line.paperReceiptNo ?? "—",
      String(line.packages),
      line.pieces ? String(line.pieces) : "—",
      line.weightKg ?? "—",
      line.cbm,
    ];
    if (i % 2 === 1) {
      doc.setFillColor(249, 250, 251);
      doc.rect(s.margin, y, width, 6.5, "F");
    }
    let x = s.margin;
    columns.forEach((c, ci) => {
      const w = c.width * scale;
      text(s, cells[ci] ?? "", c.align === "right" ? x + w - 2 : x + 2, y + 4.4, {
        size: 6.8,
        bold: ci === 1,
        maxWidth: w - 4,
        align: c.align ?? "left",
      });
      x += w;
    });
    doc.setDrawColor(HAIR[0], HAIR[1], HAIR[2]);
    doc.setLineWidth(0.1);
    doc.line(s.margin, y + 6.5, s.right, y + 6.5);
    y += 6.5;
  });

  /* Every page says which sailing it belongs to and where it sits in the
     stack: one sheet off a staple is still evidence. */
  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page);
    footer(
      s,
      `${snap.container}${snap.sealNumber ? ` · seal ${snap.sealNumber}` : ""} · page ${page} of ${pages}`,
      input.company.name
    );
  }

  return bytes(s);
}

export { attachment as packingListAttachment };
