import type { Metadata } from "next";

import { IntakeForm } from "@/components/app/intake-form";
import { PageHeader } from "@/components/app/page-header";
import { SectionTabs } from "@/components/app/section-tabs";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { cargoTypeOptions } from "@/lib/valuation";

export const metadata: Metadata = { title: "Receive cargo" };

/**
 * The counter, on one page.
 *
 * China warehouses see China warehouses. A clerk in Guangzhou choosing "Dar es
 * Salaam" from a dropdown is a receiving record filed against the wrong floor,
 * and nothing downstream would notice.
 */
export default async function ReceiveNewPage() {
  const user = await requirePermission("receiving.china");

  /* The warehouse is not asked for and so is not fetched — the action files the
     receiving record against the clerk's own posting. See receiveNewCargo. */
  const [cargoTypes, suppliers, lastLineNote, lastCargoNote] = await Promise.all([
    cargoTypeOptions(),
    /* The factories we already know, to be picked rather than retyped. A name
       not on the list is still accepted at the counter and registered there. */
    prisma.supplier.findMany({
      orderBy: { name: "asc" },
      select: { name: true },
      take: 300,
    }),
    /* The carbon book runs in order, so the next number is almost always the
       last one plus one. Offered filled in; the clerk overwrites it when the
       book has skipped or a pad was started out of sequence.

       Asked of the item lines, not of the consignments: a delivery of three
       kinds of goods uses three pages, and a consignment only records the
       first of them. Counting from there handed the same numbers out twice. */
    prisma.cargoPackage.findFirst({
      where: { paperReceiptNo: { not: null } },
      orderBy: { paperReceiptNo: "desc" },
      select: { paperReceiptNo: true },
    }),
    /* Consignments taken in before the number moved onto the lines still hold
       the highest page used. Ignoring them restarted the book. */
    prisma.cargo.findFirst({
      where: { paperReceiptNo: { not: null } },
      orderBy: { paperReceiptNo: "desc" },
      select: { paperReceiptNo: true },
    }),
  ]);

  const lastNote = [lastLineNote?.paperReceiptNo, lastCargoNote?.paperReceiptNo]
    .filter((v): v is string => Boolean(v))
    .sort((a, b) => Number(b) - Number(a))[0];

  const nextReceiptNo = lastNote
    ? String(Number(lastNote) + 1).padStart(lastNote.length, "0")
    : undefined;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title="Receive cargo"
        description="A driver is at the door. Everything below happens in one go — the reference, the delivery note and the customer's notification."
        back={{ href: "/app/inventory", label: "Warehouse floor" }}
      />
      <SectionTabs />
      <IntakeForm
        cargoTypes={cargoTypes}
        nextReceiptNo={nextReceiptNo}
        suppliers={suppliers.map((s) => s.name)}
      />
    </div>
  );
}
