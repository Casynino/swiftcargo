import { Prisma } from "@prisma/client";

/**
 * THE ONLY PLACE MONEY CHANGES CURRENCY.
 *
 * Shillings are what the business collects and what a balance is kept in. Dollars
 * are what the rate book prices in and what a customer may also hand over. Every
 * screen, action and report that turns one into the other calls this file, so a
 * bill, the receipt printed for it and the ledger it lands in cannot disagree by
 * a shilling because two places rounded differently.
 *
 * Decimal throughout. A JavaScript number cannot hold 0.1 exactly, and the
 * difference turns up as a customer who owes TZS 1 on a bill they paid in full.
 *
 * Rounding happens once, at the end: dollars to the cent, shillings to the whole
 * shilling, half away from zero. An intermediate figure (a rate, a CBM times a
 * rate) is never rounded on the way.
 */

export const BASE_CURRENCY = "TZS";
export const PRICING_CURRENCY = "USD";
export const CURRENCIES = ["TZS", "USD"] as const;
export type Currency = (typeof CURRENCIES)[number];

type Numeric = Prisma.Decimal | number | string;

const D = (value: Numeric) => new Prisma.Decimal(value);
const HALF_UP = Prisma.Decimal.ROUND_HALF_UP;

export function isCurrency(value: unknown): value is Currency {
  return value === "TZS" || value === "USD";
}

/** A rate that can convert: present, finite and above zero. */
export function isUsableRate(rate: Numeric | null | undefined): rate is Numeric {
  if (rate === null || rate === undefined || rate === "") return false;
  try {
    const r = D(rate);
    return r.isFinite() && r.greaterThan(0);
  } catch {
    return false;
  }
}

function requireRate(rate: Numeric | null | undefined): Prisma.Decimal {
  if (!isUsableRate(rate)) {
    throw new Error("A positive exchange rate is required to convert currency.");
  }
  return D(rate);
}

/** Final-stage rounding for a figure held in `currency`. */
export function roundMoney(value: Numeric, currency: string): Prisma.Decimal {
  return D(value).toDecimalPlaces(currency === "TZS" ? 0 : 2, HALF_UP);
}

/** USD × rate = TZS, whole shillings. */
export function usdToTzs(usd: Numeric, rate: Numeric | null | undefined): Prisma.Decimal {
  return D(usd).mul(requireRate(rate)).toDecimalPlaces(0, HALF_UP);
}

/** TZS ÷ rate = USD, to the cent. */
export function tzsToUsd(tzs: Numeric, rate: Numeric | null | undefined): Prisma.Decimal {
  return D(tzs).div(requireRate(rate)).toDecimalPlaces(2, HALF_UP);
}

/** Any supported amount expressed in shillings, the currency balances are kept in. */
export function toBase(
  amount: Numeric,
  currency: string,
  rate: Numeric | null | undefined
): Prisma.Decimal {
  if (currency === "TZS") return roundMoney(amount, "TZS");
  if (currency === "USD") return usdToTzs(amount, rate);
  throw new Error(`Unsupported currency ${currency}.`);
}

/** Shillings expressed in `currency`. */
export function fromBase(
  tzs: Numeric,
  currency: string,
  rate: Numeric | null | undefined
): Prisma.Decimal {
  if (currency === "TZS") return roundMoney(tzs, "TZS");
  if (currency === "USD") return tzsToUsd(tzs, rate);
  throw new Error(`Unsupported currency ${currency}.`);
}

/** Convert between the two supported currencies. */
export function convert(
  amount: Numeric,
  from: string,
  to: string,
  rate: Numeric | null | undefined
): Prisma.Decimal {
  if (from === to) return roundMoney(amount, to);
  return fromBase(toBase(amount, from, rate), to, rate);
}

/** "TZS 36,450" · "USD 13.50" — the code first, so nobody reads one as the other. */
export function formatCurrency(value: Numeric | null | undefined, currency: string) {
  if (value === null || value === undefined || value === "") return "—";
  const rounded = roundMoney(value, currency);
  const digits = currency === "TZS" ? 0 : 2;
  const [whole, frac] = rounded.abs().toFixed(digits).split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${rounded.isNegative() ? "−" : ""}${currency} ${grouped}${frac ? `.${frac}` : ""}`;
}

/** "1 USD = 2,700 TZS" */
export function formatRate(rate: Numeric | null | undefined) {
  if (!isUsableRate(rate)) return "no rate";
  const r = D(rate);
  const shown = r.isInteger() ? r.toFixed(0) : r.toDecimalPlaces(4).toString();
  const [whole, frac] = shown.split(".");
  return `1 USD = ${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}${frac ? `.${frac}` : ""} TZS`;
}
