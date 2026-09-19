import { NextResponse } from "next/server";

import { renderInvoicePdf } from "@/lib/invoice-pdf";
import { invoiceLogo, loadInvoicePdf } from "@/lib/invoice-pdf-data";
import { invoiceQr } from "@/lib/invoice-verify";
import { prisma } from "@/lib/prisma";
import { requireCustomer } from "@/lib/session";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * The customer's own invoice as a file, the same document Finance sends.
 *
 * Ownership is asked of the database before anything is rendered: the id in
 * the address only ever finds a bill that is already this customer's. A draft
 * is nobody's bill yet and is never handed out.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireCustomer();
  const { id } = await params;

  const owned = await prisma.invoice.findFirst({
    where: { id, customerId: user.customerId, status: { not: "DRAFT" } },
    select: { id: true },
  });
  if (!owned) return NextResponse.json({ error: "Invoice not found." }, { status: 404 });

  const loaded = await loadInvoicePdf(owned.id);
  if (!loaded) return NextResponse.json({ error: "Invoice not found." }, { status: 404 });

  const qr = await invoiceQr(owned.id, 360).catch(() => null);
  const pdf = renderInvoicePdf({ ...loaded.input, logo: await invoiceLogo(), qr });
  const { ascii, full } = loaded.fileName;

  return new NextResponse(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(full)}`,
      "Cache-Control": "no-store",
    },
  });
}
