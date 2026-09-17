import { prisma } from "@/lib/prisma";
import { impliedStatus } from "@/lib/invoice-balance";

/**
 * Bring an invoice's stored status back in line with its payments.
 *
 * The status column exists so screens can filter cheaply; the truth is always
 * the payment rows. This is called after anything that moves money, so the two
 * can never drift far enough for somebody to act on the wrong one.
 */
export async function refreshInvoiceStatus(invoiceId: string) {
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: { payments: true },
  });
  if (!invoice) return;
  if (invoice.status === "DRAFT" || invoice.status === "CANCELLED") return;

  const should = impliedStatus(invoice);
  if (should !== invoice.status) {
    await prisma.invoice.update({
      where: { id: invoice.id },
      data: { status: should },
    });
  }
}
