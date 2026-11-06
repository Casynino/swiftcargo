/**
 * THE PAPER A BOX LABEL PRINTS ON: 100 × 150 mm, NO MARGIN, ONE LABEL A PAGE.
 *
 * Left to itself a browser adds its own margin around the page, and a label
 * that is exactly as big as the paper no longer fits inside what is left — so it
 * slides over, is cut at the edge, or pushes the next one onto a blank sheet.
 * The built-in browser inside WeChat is the least forgiving of all, and it is
 * where Guangzhou opens this page. These rules say what the paper is, take the
 * margin away, and start every label on a fresh sheet.
 */
export function LabelPaper() {
  return (
    <style>{`
      @page { size: 100mm 150mm; margin: 0; }
      @media print {
        html, body { width: 100mm; margin: 0 !important; padding: 0 !important; background: #fff !important; }
        main { padding: 0 !important; }
        .sticker {
          margin: 0 !important;
          break-after: page;
          page-break-after: always;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        .sticker:last-child { break-after: auto; page-break-after: auto; }
      }
    `}</style>
  );
}
