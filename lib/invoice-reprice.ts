import "server-only";

import { Prisma } from "@prisma/client";

import { recordAudit, recordFieldChange } from "@/lib/audit";
import { usdToTzs } from "@/lib/currency";
import { billingMeasurement, priceConsignment } from "@/lib/invoice-draft";
import { applyVat } from "@/lib/pricing";
import { prisma, type TxClient } from "@/lib/prisma";
import type { SessionUser } from "@/lib/session";

export type RepriceResult = {
  repriced: string[];
  blocked: string | null;
};

const ZERO = new Prisma.Decimal(0);

/**
 * A CORRECTED MEASUREMENT HAS TO REACH THE BILL — WHILE THE BILL IS A DRAFT.
 *
 * Correcting a line or Dar's count changed the record and left the draft
 * standing on the old figure, so a consignment re-measured after check-in was
 * billed the volume Guangzhou typed, with the right number on the cargo page
 * and the wrong one on the bill.
 *
 * Only DRAFT is touched. An issued, part-paid or paid bill is a figure the
 * customer has been given; moving it is Finance's, through a discount or a
 * re-price with a reason, and never happens because somebody edited a volume.
 *
 * The freight lines are replaced from the rate book and everything else on the
 * draft — storage, a charge, a discount — is kept and re-added, so VAT is taken
 * once on the whole. A per-CBM figure Finance typed onto the draft does not
 * survive: the lines under it are the book's again, and a header claiming a
 * special rate over them would contradict its own arithmetic.
 *
 * Every total that moves is written to FieldChange before it takes effect.
 */
export async function repriceDraftInvoices(
  client: TxClient,
  actor: SessionUser,
  cargoId: string,
  reason: string
): Promise<RepriceResult> {
  const cargo = await client.cargo.findFirst({
    where: { id: cargoId, deletedAt: null },
    include: {
      darReceiving: true,
      chinaReceiving: true,
      invoices: { where: { status: "DRAFT" }, include: { items: true } },
    },
  });
  if (!cargo || cargo.invoices.length === 0) return { repriced: [], blocked: null };

  const priced = await priceConsignment(
    {
      id: cargo.id,
      description: cargo.description,
      commodity: cargo.commodity,
      service: cargo.service,
      receiverId: cargo.receiverId,
      ...billingMeasurement(cargo),
    },
    client
  );
  /* A gap in the rate book leaves the draft as it was and says so. A draft
     zeroed because a type has no live rate is worse than a stale one. */
  if (priced.blockedReason) return { repriced: [], blocked: priced.blockedReason };

  const repriced: string[] = [];
  for (const invoice of cargo.invoices) {
    const kept = invoice.items.filter((i) => i.category !== "Freight");
    const freight = invoice.items.filter((i) => i.category === "Freight");

    const sameFreight =
      freight.length === priced.items.length &&
      freight.every((line, index) => {
        const next = priced.items[index];
        return (
          line.description === next.description &&
          line.quantity.equals(next.quantity) &&
          line.unitPrice.equals(next.unitPrice) &&
          line.amount.equals(next.amount)
        );
      });
    if (sameFreight) continue;

    const keptSum = kept.reduce((sum, i) => sum.add(i.amount), ZERO);
    const takenOff = kept
      .filter((i) => i.category === "Discount")
      .reduce((sum, i) => sum.add(i.amount.negated()), ZERO);
    const subtotal = priced.amount.add(keptSum);
    const { vatAmount, total } = applyVat(subtotal, invoice.vatPercent);

    await recordFieldChange(
      {
        actor,
        entity: "Invoice",
        entityId: invoice.id,
        field: "total",
        oldValue: invoice.total.toString(),
        newValue: total.toString(),
        reason,
      },
      client
    );
    const volumeBefore = invoice.billableCbm?.toString() ?? null;
    const volumeAfter = priced.billableCbm?.toString() ?? null;
    if (volumeBefore !== volumeAfter) {
      await recordFieldChange(
        {
          actor,
          entity: "Invoice",
          entityId: invoice.id,
          field: "billableCbm",
          oldValue: volumeBefore,
          newValue: volumeAfter,
          reason,
        },
        client
      );
    }

    /* Re-stated as a claim: Finance issuing the draft in the same second must
       leave an issued bill exactly as the customer was told it. */
    const claim = await client.invoice.updateMany({
      where: { id: invoice.id, status: "DRAFT" },
      data: {
        billableCbm: priced.billableCbm,
        billableKg: priced.billableKg,
        standardRate: priced.standardRate,
        appliedRate: priced.appliedRate,
        rateBasis: priced.basis,
        discount: priced.discount.add(takenOff),
        subtotal,
        vatAmount,
        total,
        currency: priced.currency,
        totalTzs: invoice.fxRate ? usdToTzs(total, invoice.fxRate) : null,
      },
    });
    if (claim.count === 0) {
      throw new Error(`${invoice.number} was issued while it was being re-priced.`);
    }

    await client.invoiceItem.deleteMany({
      where: { invoiceId: invoice.id, category: "Freight" },
    });
    await client.invoiceItem.createMany({
      data: priced.items.map((item) => ({ ...item, invoiceId: invoice.id })),
    });

    await recordAudit(
      {
        actor,
        action: "invoice.reprice.measurement",
        entity: "Invoice",
        entityId: invoice.id,
        summary: `Re-priced draft ${invoice.number} for ${cargo.reference} from the corrected measurements — ${invoice.currency} ${invoice.total} → ${priced.currency} ${total}`,
        metadata: {
          reason,
          from: invoice.total.toString(),
          to: total.toString(),
          explanation: priced.explanation,
        },
      },
      client
    );
    repriced.push(invoice.number);
  }

  return { repriced, blocked: null };
}

/**
 * The same, in its own transaction, for a server action whose correction has
 * already committed. It cannot fail the correction: the record is saved, and a
 * rate book having a bad moment must not tell the clerk their count did not
 * happen. The draft stays as it was and Finance still sees it as a draft.
 */
export async function repriceDraftsAfterCorrection(
  actor: SessionUser,
  cargoId: string,
  reason: string
): Promise<RepriceResult | null> {
  try {
    return await prisma.$transaction((tx) =>
      repriceDraftInvoices(tx, actor, cargoId, reason)
    );
  } catch {
    return null;
  }
}
