/**
 * Renders one invoice to a PDF on disk, through the same loader the download
 * route uses, so the document can be checked without a browser or a session.
 *
 *   npx tsx scripts/try-invoice-pdf.ts INV-2026-000016 /path/to/out.pdf
 */
import { writeFile } from "node:fs/promises";

import { renderInvoicePdf } from "../lib/invoice-pdf";
import { invoiceLogo, loadInvoicePdf } from "../lib/invoice-pdf-data";
import { prisma } from "../lib/prisma";

async function main() {
  const [key = "INV-2026-000016", out = "invoice-sample.pdf"] = process.argv.slice(2);
  const loaded = await loadInvoicePdf(key);
  if (!loaded) throw new Error(`No invoice ${key}.`);
  if (loaded.status === "DRAFT") console.warn(`${key} is a DRAFT; the route would refuse it.`);

  const pdf = renderInvoicePdf({ ...loaded.input, logo: await invoiceLogo() });
  await writeFile(out, pdf);
  console.log(`${out} · ${pdf.byteLength} bytes · route filename "${loaded.fileName.full}" (ascii "${loaded.fileName.ascii}")`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
