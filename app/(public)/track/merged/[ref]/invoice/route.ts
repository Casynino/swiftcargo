import { NextResponse } from "next/server";

import { renderInvoicePdf } from "@/lib/invoice-pdf";
import { invoiceLogo } from "@/lib/invoice-pdf-data";
import { loadMergedInvoicePdf } from "@/lib/merged-invoice-pdf-data";
import { clientAddress, hit } from "@/lib/rate-limit";
import { trackKeyValid } from "@/lib/track-key";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * THE MERGED INVOICE, FROM THE LINK IN THE MERGED-PAYMENT MESSAGE.
 *
 * No session, same as a single consignment's invoice — the key in the link
 * stands in for one, signed over the payment reference so it cannot be
 * composed for a reference somebody only guessed at. See
 * lib/merged-invoice-pdf-data.ts for where every figure on it comes from.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ ref: string }> }
) {
  const { ref } = await params;
  const url = new URL(request.url);
  const transactionRef = decodeURIComponent(ref);

  const address = await clientAddress();
  if (!hit(`track-merged-pdf:${address}`, 20, 10 * 60 * 1000).ok) {
    return NextResponse.json(
      { error: "Too many downloads. Try again in a few minutes." },
      { status: 429 }
    );
  }

  if (!trackKeyValid(transactionRef, url.searchParams.get("k"))) {
    return NextResponse.json({ error: "This link cannot open an invoice." }, { status: 404 });
  }

  const loaded = await loadMergedInvoicePdf(transactionRef);
  if (!loaded) return NextResponse.json({ error: "Payment not found." }, { status: 404 });

  const pdf = renderInvoicePdf({ ...loaded.input, logo: await invoiceLogo() });
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
