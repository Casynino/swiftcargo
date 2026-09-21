import { NextResponse } from "next/server";

import { renderInvoicePdf } from "@/lib/invoice-pdf";
import { invoiceLogo, loadInvoicePdf } from "@/lib/invoice-pdf-data";
import { invoiceQr } from "@/lib/invoice-verify";
import { prisma } from "@/lib/prisma";
import { clientAddress, hit } from "@/lib/rate-limit";
import { trackKeyValid } from "@/lib/track-key";
import { referenceFromInput } from "@/lib/tracking";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * The customer's invoice, from the link in their own message.
 *
 * No session: the customer tapped a WhatsApp link and may never have had an
 * account. The key in that link is what stands in for one — it is signed over
 * this reference and cannot be made for another — and the bill must belong to
 * this consignment. A draft is nobody's bill yet and is never handed out.
 */
export async function GET(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const url = new URL(request.url);
  const reference = referenceFromInput(decodeURIComponent(code));
  const invoiceId = url.searchParams.get("i") ?? "";

  const address = await clientAddress();
  if (!hit(`track-pdf:${address}`, 20, 10 * 60 * 1000).ok) {
    return NextResponse.json({ error: "Too many downloads. Try again in a few minutes." }, { status: 429 });
  }

  if (!reference || !invoiceId || !trackKeyValid(reference, url.searchParams.get("k"))) {
    return NextResponse.json({ error: "This link cannot open an invoice." }, { status: 404 });
  }

  const invoice = await prisma.invoice.findFirst({
    where: {
      id: invoiceId,
      status: { not: "DRAFT" },
      cargo: { deletedAt: null, reference: { equals: reference, mode: "insensitive" } },
    },
    select: { id: true },
  });
  if (!invoice) return NextResponse.json({ error: "Invoice not found." }, { status: 404 });

  const loaded = await loadInvoicePdf(invoice.id);
  if (!loaded) return NextResponse.json({ error: "Invoice not found." }, { status: 404 });

  const qr = await invoiceQr(invoice.id, 360).catch(() => null);
  const pdf = renderInvoicePdf({ ...loaded.input, logo: await invoiceLogo(), qr });
  const { ascii, full } = loaded.fileName;

  return new NextResponse(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(full)}`,
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}
