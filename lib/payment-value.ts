import { Prisma } from "@prisma/client";

import {
  isUsableRate,
  roundMoney,
  toBase,
  tzsToUsd,
  usdToTzs,
} from "@/lib/currency";
import { balanceOf, invoiceRate, paymentTzs } from "@/lib/invoice-balance";

/**
 * WHAT A PAYMENT IS WORTH, DECIDED ONCE.
 *
 * Every way money comes in — the Record Payment dialog, a merged payment, a
 * customer's own claim — values it here, so the shilling figure written onto
 * the payment row is worked out by one rule.
 */

type Numeric = Prisma.Decimal | number | string;

type InvoiceForValue = Parameters<typeof balanceOf>[0];

/** An amount as typed, checked for the precision its currency allows. */
export function parseAmount(
  raw: unknown,
  currency: string
): { amount: Prisma.Decimal } | { error: string } {
  const text = String(raw ?? "").replace(/,/g, "").trim();
  if (!text) return { error: "An amount is required." };
  if (!/^\d+(\.\d+)?$/.test(text)) return { error: "That is not an amount." };
  const amount = new Prisma.Decimal(text);
  if (amount.lessThanOrEqualTo(0)) return { error: "The amount must be more than zero." };
  const places = amount.decimalPlaces();
  if (currency === "TZS" && places > 0) {
    return { error: "Shillings are taken in whole shillings." };
  }
  if (currency === "USD" && places > 2) {
    return { error: "Dollars are taken to the cent." };
  }
  return { amount };
}

/**
 * The rate a payment against this bill is taken at.
 *
 * The bill's own rate unless somebody agreed another at the counter. Using the
 * bill's rate is what lets USD 13.50 settle a USD 13.50 bill to the shilling
 * after the board has moved; today's rate is only the last resort for a bill
 * that somehow has none.
 */
export function paymentRate(
  invoice: Pick<InvoiceForValue, "fxRate">,
  override: Numeric | null | undefined,
  live: Numeric | null | undefined
): Prisma.Decimal | null {
  if (isUsableRate(override)) return new Prisma.Decimal(override);
  const own = invoiceRate(invoice);
  if (own) return own;
  return isUsableRate(live) ? new Prisma.Decimal(live) : null;
}

/** The figures written onto one payment row. */
export function valuePayment(
  amount: Numeric,
  currency: string,
  invoiceCurrency: string,
  rate: Prisma.Decimal | null
) {
  if (currency === "USD" && !rate) {
    throw new Error("A dollar payment needs an exchange rate.");
  }
  const baseCurrencyAmount = toBase(amount, currency, rate);
  /* The dollar figure, kept for screens that still read it. It never settles a
     bill — `baseCurrencyAmount` does. */
  const creditedAmount =
    currency === invoiceCurrency || !rate
      ? null
      : invoiceCurrency === "USD"
        ? tzsToUsd(baseCurrencyAmount, rate)
        : baseCurrencyAmount;
  return { baseCurrencyAmount, creditedAmount };
}

/** Shillings already claimed against the bill and waiting for Finance. */
export function pendingTzsOn(invoice: InvoiceForValue): Prisma.Decimal {
  return invoice.payments
    .filter((p) => p.status === "PENDING")
    .reduce((sum, p) => sum.add(paymentTzs(p, invoice) ?? 0), new Prisma.Decimal(0));
}

/**
 * What may still be taken against the bill without overpaying it, in shillings:
 * the verified balance less whatever is already waiting to be verified.
 */
export function stillTakeableTzs(invoice: InvoiceForValue): Prisma.Decimal | null {
  const owing = balanceOf(invoice).outstandingTzs;
  if (!owing) return null;
  const left = owing.sub(pendingTzsOn(invoice));
  return left.greaterThan(0) ? left : new Prisma.Decimal(0);
}

export type Slice<T> = {
  invoice: T;
  /** In the currency handed over. */
  amount: Prisma.Decimal;
  rate: Prisma.Decimal | null;
  baseCurrencyAmount: Prisma.Decimal;
};

/**
 * One lot of money spread across several bills, oldest first.
 *
 * Kept in shillings. A dollar slice that clears a bill is valued at exactly
 * what the bill owed in shillings: the customer paid the smallest whole cent
 * that settles it, and the fraction of a cent above that is not a credit worth
 * chasing — it is the coin not existing.
 */
export function spreadPayment<T extends InvoiceForValue>(
  invoices: T[],
  amount: Prisma.Decimal,
  currency: string,
  live: Numeric | null | undefined
): { slices: Slice<T>[]; left: Prisma.Decimal } | { error: string; invoice: T } {
  let left = amount;
  const slices: Slice<T>[] = [];

  for (const invoice of invoices) {
    if (left.lessThanOrEqualTo(0)) break;
    const owingTzs = stillTakeableTzs(invoice);
    if (owingTzs === null) return { error: "has no exchange rate", invoice };
    if (owingTzs.lessThanOrEqualTo(0)) continue;

    const rate = paymentRate(invoice, null, live);
    if (currency === "TZS") {
      const slice = Prisma.Decimal.min(left, owingTzs);
      slices.push({ invoice, amount: slice, rate, baseCurrencyAmount: slice });
      left = left.sub(slice);
      continue;
    }

    if (!rate) return { error: "has no exchange rate", invoice };
    const owingUsd = owingTzs.div(rate).toDecimalPlaces(2, Prisma.Decimal.ROUND_UP);
    const slice = Prisma.Decimal.min(left, owingUsd);
    const clears = slice.equals(owingUsd);
    slices.push({
      invoice,
      amount: slice,
      rate,
      baseCurrencyAmount: clears ? owingTzs : Prisma.Decimal.min(usdToTzs(slice, rate), owingTzs),
    });
    left = left.sub(slice);
  }

  return { slices, left: roundMoney(left, currency) };
}
