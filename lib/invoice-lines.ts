import { Prisma } from "@prisma/client";

/**
 * THE LINES A BILL IS PRINTED FROM.
 *
 * Normally its own rows. A bill that has none — eight exist from an early
 * import, and nothing in the app can make another — would otherwise print a
 * total with nothing above it, which is the one thing a customer holding an
 * invoice cannot be asked to accept.
 *
 * The stand-in says only what the bill itself already stores: the cargo it is
 * for, the volume it was billed on, the rate that was applied and the
 * subtotal. Nothing is invented; if the bill does not know a rate, the line
 * carries the amount and no unit price.
 */
type LineLike = {
  id?: string;
  description: string;
  category?: string | null;
  quantity: Prisma.Decimal | number | string;
  unit?: string | null;
  unitPrice: Prisma.Decimal | number | string;
  amount: Prisma.Decimal | number | string;
  /** Carried by a real line; absent on the stand-in, which knows no lines. */
  paperReceiptNo?: string | null;
  packages?: number | null;
  pieces?: number | null;
};

type BillLike = {
  items: LineLike[];
  subtotal: Prisma.Decimal | number | string;
  billableCbm?: Prisma.Decimal | null;
  billableKg?: Prisma.Decimal | null;
  appliedRate?: Prisma.Decimal | null;
  rateBasis?: string | null;
  cargo?: { reference?: string | null; description?: string | null } | null;
};

export function billLines(invoice: BillLike): LineLike[] {
  if (invoice.items.length > 0) return invoice.items;

  const perKg = invoice.rateBasis === "PER_KG";
  const quantity = (perKg ? invoice.billableKg : invoice.billableCbm) ?? null;
  const subtotal = new Prisma.Decimal(invoice.subtotal);
  const goods = invoice.cargo?.description?.trim();

  return [
    {
      id: "derived",
      description: [
        "Sea freight",
        invoice.cargo?.reference ? `— ${invoice.cargo.reference}` : null,
        goods ? `(${goods})` : null,
      ]
        .filter(Boolean)
        .join(" "),
      category: "Freight",
      quantity: quantity ?? 1,
      unit: quantity ? (perKg ? "kg" : "CBM") : null,
      unitPrice: invoice.appliedRate ?? subtotal,
      amount: subtotal,
      paperReceiptNo: null,
      packages: null,
      pieces: null,
    },
  ];
}
