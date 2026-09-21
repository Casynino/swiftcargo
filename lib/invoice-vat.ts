import { Prisma } from "@prisma/client";

type Money = Prisma.Decimal | string | number;

/**
 * WHETHER A BILL SAYS ANYTHING ABOUT VAT AT ALL.
 *
 * By the owner's decision the company's prices already contain VAT, and a
 * customer is shown one price and nothing about tax: no "before VAT", no VAT
 * line, no sentence. `vatAmount` is still worked out and stored on the row —
 * the finance reports take revenue net of it — but it is not printed.
 *
 * A bill issued before the rule changed had VAT added on top, and that bill
 * still reads as it was issued: sub total, VAT, total.
 *
 * Every figure is read off the invoice row; nothing here decides an amount.
 */
export function vatLines(invoice: {
  subtotal: Money;
  vatAmount: Money;
  vatPercent: Money;
  vatInclusive: boolean;
}) {
  const percent = new Prisma.Decimal(invoice.vatPercent);
  const pct = percent.mod(1).isZero() ? percent.toFixed(0) : percent.toFixed(2);
  const vat = new Prisma.Decimal(invoice.vatAmount);
  /* Shown only on a bill that added VAT on top of its price. */
  const shown = !invoice.vatInclusive && vat.greaterThan(0);
  return {
    shown,
    baseLabel: "Sub total",
    base: new Prisma.Decimal(invoice.subtotal),
    vatLabel: `VAT (${pct}%)`,
    vat,
  };
}
