import { Prisma } from "@prisma/client";

type Money = Prisma.Decimal | string | number;

/**
 * HOW A BILL'S VAT IS SAID, ONE WAY EVERYWHERE.
 *
 * A bill priced with VAT inside it (`vatInclusive`, the company's rule since
 * prices started to include it) reads the way a Tanzanian VAT receipt does:
 * the amount before VAT, the VAT that is part of the price, and the total —
 * which is the price. Printing "Sub total 380 · VAT 68.40 · Total 448.40" on
 * such a bill is exactly the double charge the owner saw. A bill issued before
 * the rule changed still reads as it was issued, VAT added on top.
 *
 * Every figure is read off the invoice row; nothing here decides an amount.
 */
export function vatLines(invoice: {
  subtotal: Money;
  vatAmount: Money;
  total: Money;
  vatPercent: Money;
  vatInclusive: boolean;
}) {
  const percent = new Prisma.Decimal(invoice.vatPercent);
  const pct = percent.mod(1).isZero() ? percent.toFixed(0) : percent.toFixed(2);
  const vat = new Prisma.Decimal(invoice.vatAmount);

  if (!invoice.vatInclusive) {
    return {
      baseLabel: "Sub total",
      base: new Prisma.Decimal(invoice.subtotal),
      vatLabel: `VAT (${pct}%)`,
      vat,
      note: null as string | null,
      noteSw: null as string | null,
    };
  }
  return {
    baseLabel: "Before VAT",
    base: new Prisma.Decimal(invoice.total).sub(vat),
    vatLabel: `VAT (${pct}%) included`,
    vat,
    note: `The invoice total includes customs, shipping and clearance fees, and ${pct}% VAT.`,
    noteSw: `Jumla ya ankara hii inajumuisha ushuru wa forodha, usafirishaji na gharama za clearance, pamoja na VAT ${pct}%.`,
  };
}
