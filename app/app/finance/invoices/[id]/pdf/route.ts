import { NextResponse } from "next/server";

import { t } from "@/lib/i18n";
import { renderInvoicePdf } from "@/lib/invoice-pdf";
import { invoiceQr } from "@/lib/invoice-verify";
import { invoiceLogo, loadInvoicePdf } from "@/lib/invoice-pdf-data";
import { requirePermission } from "@/lib/session";

/* jsPDF and Prisma need Node, never the edge; a long period or a thick
   document can outrun a short default function timeout. */
export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * The invoice as a downloadable file.
 *
 * A route handler rather than a button that calls `window.print()`: the office
 * needs something it can send, and a print dialog on a phone produces nothing
 * to attach to a WhatsApp message.
 *
 * A DRAFT is refused. Nobody in Finance has confirmed its price, and the whole
 * point of a downloadable invoice is that it can leave the building — so this
 * is where the draft rule has to be a hard stop rather than a label.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  await requirePermission("finance.view");
  const { id } = await params;

  const loaded = await loadInvoicePdf(decodeURIComponent(id));
  if (!loaded) {
    return NextResponse.json({ error: t("en", "Invoice not found.") }, { status: 404 });
  }

  if (loaded.status === "DRAFT") {
    return NextResponse.json(
      {
        error: t(
          "en",
          "This price has not been confirmed yet. Confirm it before downloading or sending the invoice."
        ),
      },
      { status: 409 }
    );
  }

  const qr = await invoiceQr(id, 360).catch(() => null);
  const pdf = renderInvoicePdf({ ...loaded.input, logo: await invoiceLogo(), qr });
  const { ascii, full } = loaded.fileName;

  return new NextResponse(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      // attachment, not inline: the point is a file on the phone that can be
      // forwarded, not another tab. The quoted ASCII name comes first for
      // clients that do not read RFC 5987; filename* carries the real one.
      "Content-Disposition": `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(full)}`,
      "Cache-Control": "no-store",
    },
  });
}
