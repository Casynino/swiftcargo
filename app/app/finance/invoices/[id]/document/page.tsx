import { Download } from "lucide-react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { InvoiceDocument } from "@/components/app/invoice-document";
import { AutoPrint, PrintButton } from "@/components/app/print-button";
import { formatDate } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { SmartBack } from "@/components/app/smart-back";
import { Button } from "@/components/ui/button";

/*
  THE FILENAME IS THE PAGE TITLE.

  A browser saving to PDF names the file after the document title, and an
  office with forty invoices in a downloads folder cannot tell one
  "invoice.pdf" from another. The customer's name goes in the title so the file
  arrives already named after the person it is for.
*/
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const invoice = await prisma.invoice.findUnique({
    where: { id },
    select: { number: true, customer: { select: { fullName: true } } },
  });
  if (!invoice) return { title: "Invoice" };
  /* Absolute, so the layout's "· Swift Cargo" suffix stays out of the filename. */
  return {
    title: { absolute: `${invoice.number} - ${invoice.customer.fullName}` },
  };
}

export default async function InvoiceDocumentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePermission("finance.view");
  const { id } = await params;

  const invoice = await prisma.invoice.findUnique({ where: { id }, select: { number: true, status: true } });
  if (!invoice) notFound();

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center justify-between print:hidden">
        <SmartBack fallbackHref={`/app/finance/invoices/${id}`} fallbackLabel={`${invoice.number}`} />
        <div className="flex items-center gap-2">
          {/* A draft's price is unconfirmed and the file route refuses it. */}
          {invoice.status !== "DRAFT" ? (
            <Button asChild>
              <a href={`/app/finance/invoices/${id}/pdf`} download>
                <Download />
                Download PDF
              </a>
            </Button>
          ) : null}
          <PrintButton label="Print" />
        </div>
        <AutoPrint />
      </div>
      <InvoiceDocument id={id} />
    </div>
  );
}
