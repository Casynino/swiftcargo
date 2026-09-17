import { Prisma } from "@prisma/client";
import type { MeasurementUnit } from "@prisma/client";

/**
 * VOLUME, AND THE UNIT THAT PRODUCED IT.
 *
 * Sea freight is sold by the cubic metre, so this function decides what the
 * customer pays. Everything here exists to stop one mistake: a measurement in
 * centimetres treated as metres, or the other way round.
 *
 *   60 × 40 × 40 cm  = 0.096 m³   — a plausible carton
 *   60 × 40 × 40 m   = 96,000 m³  — a plausible invoice, if nobody checks
 *
 * The unit is therefore stored on the row beside the numbers, never inferred
 * from magnitude. "That figure is too big to be metres" is a guess, and a guess
 * about a bill is not good enough.
 */

/** One cubic metre, in cubic centimetres. */
const CM3_PER_M3 = 1_000_000;

export type CbmInput = {
  length: number | string | Prisma.Decimal | null | undefined;
  width: number | string | Prisma.Decimal | null | undefined;
  height: number | string | Prisma.Decimal | null | undefined;
  quantity?: number | null;
  unit: MeasurementUnit;
};

function d(v: number | string | Prisma.Decimal | null | undefined) {
  if (v === null || v === undefined || v === "") return null;
  const dec = new Prisma.Decimal(v);
  return dec.isNaN() ? null : dec;
}

/**
 * CBM from dimensions, as a Decimal.
 *
 * Returns null when any dimension is missing — a partial measurement is not a
 * small volume, it is an unknown one, and rounding it to zero would quietly
 * ship somebody's cargo for free.
 *
 *   CM: L × W × H × qty ÷ 1,000,000
 *   M : L × W × H × qty
 *
 * Decimal throughout rather than JS numbers: 0.1 × 0.1 × 0.1 in floating point
 * is 0.0010000000000000002, and that trailing dust reaches an invoice.
 */
export function calculateCbm(input: CbmInput): Prisma.Decimal | null {
  const l = d(input.length);
  const w = d(input.width);
  const h = d(input.height);
  if (!l || !w || !h) return null;

  const qty = new Prisma.Decimal(
    input.quantity === null || input.quantity === undefined ? 1 : input.quantity
  );
  if (qty.lessThanOrEqualTo(0)) return new Prisma.Decimal(0);

  const raw = l.mul(w).mul(h).mul(qty);
  const cubic = input.unit === "CM" ? raw.div(CM3_PER_M3) : raw;

  /* Four decimal places, matching the column. Rounded half-up because the
     alternative — truncating — always favours the same side, and over a
     container of three hundred lines that is a systematic loss. */
  return cubic.toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP);
}

/** The same, as a plain number, for the public calculator and for display. */
export function cbmNumber(input: CbmInput): number | null {
  const value = calculateCbm(input);
  return value ? value.toNumber() : null;
}

/** Sum of many lines. Missing measurements contribute nothing and are counted. */
export function totalCbm(
  lines: { cbm: Prisma.Decimal | number | string | null | undefined }[]
): Prisma.Decimal {
  return lines.reduce((sum, line) => {
    const value = d(line.cbm);
    return value ? sum.add(value) : sum;
  }, new Prisma.Decimal(0));
}

/**
 * What is actually billed.
 *
 * Sea freight has a floor: half a cubic metre is charged as one, because the
 * space it occupies on the ship is not divisible by how full the box is. The
 * minimum lives in the rate book, never in this file — a number hard-coded here
 * is a number Finance cannot change.
 */
export function chargeableCbm(
  cbm: Prisma.Decimal | number | string,
  minimumCbm?: Prisma.Decimal | number | string | null
): Prisma.Decimal {
  const actual = new Prisma.Decimal(cbm);
  const floor = d(minimumCbm);
  if (!floor) return actual;
  return actual.lessThan(floor) ? floor : actual;
}

/**
 * Does a stored CBM still match the dimensions beside it?
 *
 * Used to render "overridden" on a screen without trusting the flag alone, and
 * to catch a row whose measurements were edited without the volume being
 * recomputed. Compared at four decimal places, which is the column's own
 * precision — anything tighter reports a difference that does not exist.
 */
export function cbmMatchesDimensions(
  stored: Prisma.Decimal | number | string,
  input: CbmInput
): boolean {
  const computed = calculateCbm(input);
  if (!computed) return true; // nothing to disagree with
  return new Prisma.Decimal(stored)
    .toDecimalPlaces(4)
    .equals(computed.toDecimalPlaces(4));
}

/**
 * The difference between what China measured and what Dar measured.
 *
 * Positive means Dar found more. Returned rather than resolved: the system does
 * not decide which warehouse was right, it shows both figures and the gap, and
 * a person decides. That is the whole reason both rows are kept.
 */
export function variance(
  china: Prisma.Decimal | number | string | null | undefined,
  dar: Prisma.Decimal | number | string | null | undefined
): { difference: Prisma.Decimal; percent: number | null } | null {
  const a = d(china);
  const b = d(dar);
  if (!a || !b) return null;

  const difference = b.sub(a);
  const percent = a.isZero()
    ? null
    : difference.div(a).mul(100).toDecimalPlaces(2).toNumber();

  return { difference, percent };
}
