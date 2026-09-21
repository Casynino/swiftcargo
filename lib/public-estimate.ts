import "server-only";

import { Prisma, type ServiceType } from "@prisma/client";

import { ESTIMATE_CAVEAT, FX_CAVEAT } from "@/lib/constants";
import { formatCurrency, usdToTzs } from "@/lib/currency";
import { applyVat, companySettings, currentExchangeRate, quote } from "@/lib/pricing";
import { prisma, type TxClient } from "@/lib/prisma";

export { ESTIMATE_CAVEAT, FX_CAVEAT };

/**
 * WHAT THE PUBLIC CALCULATOR IS ALLOWED TO SAY.
 *
 * The same rate book, the same minimum, the same VAT percentage and the same
 * exchange-rate row the counter bills from — reached through lib/pricing.ts and
 * lib/currency.ts, not re-derived here. A calculator that does its own
 * arithmetic is a calculator that disagrees with the invoice, and the customer
 * remembers the number the website gave them.
 *
 * The maths happens on the server and in Decimal. A JavaScript number in a
 * browser cannot hold 0.1, and a freight estimate that ends in .30000000000004
 * is not a figure anybody trusts.
 *
 * NO CUSTOMER, NO CUSTOMER RATE. The figure is the published rate for the type,
 * because an agreed rate is somebody's private terms and the website is a
 * stranger asking.
 */

export type EstimateLine = { label: string; amount: string };

export type Estimate =
  /** The book has no live rate for this type, and no general rate either. */
  | { kind: "quote-required"; cargoType: string | null; reason: string }
  | {
      kind: "priced";
      cargoType: string | null;
      /** What was measured, and what would actually be charged after a minimum. */
      measuredCbm: string;
      billableCbm: string | null;
      minimumApplied: boolean;
      rate: string;
      currency: string;
      /** Freight, VAT and the total, already formatted for display. */
      lines: EstimateLine[];
      freight: string;
      vatPercent: string;
      vat: string;
      total: string;
      /** The same total in shillings, at the live rate, or null if none is set. */
      totalTzs: string | null;
      exchangeRate: string | null;
      explanation: string;
    };

/**
 * The cargo types a customer may pick, and what each one costs.
 *
 * Read from the rate book, so a type the company stops carrying stops being
 * offered without a deploy. Published rows only: an internal rate is still a
 * rate, and it is not one to show a stranger.
 */
export async function publicRateBook(
  service: ServiceType = "LCL",
  client: TxClient | typeof prisma = prisma
) {
  const rows = await client.shippingRate.findMany({
    where: {
      active: true,
      published: true,
      service,
      basis: "PER_CBM",
      cargoType: { not: null },
      effectiveFrom: { lte: new Date() },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: new Date() } }],
    },
    orderBy: [{ cargoType: "asc" }, { effectiveFrom: "desc" }],
    select: { cargoType: true, rate: true, currency: true, minimumCbm: true },
  });

  /* One row per type: the newest, when the book still holds the old one beside
     it. Superseding a rate publishes a new row rather than editing the old. */
  const seen = new Set<string>();
  return rows
    .filter((row) => {
      const key = row.cargoType!.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((row) => ({
      cargoType: row.cargoType!,
      rate: row.rate.toString(),
      currency: row.currency,
      minimumCbm: row.minimumCbm ? row.minimumCbm.toString() : null,
    }));
}

/**
 * Price a volume the way the invoice would.
 *
 * `cargoType` is matched against the rate book by name, exactly as the billing
 * code matches it, so a type with no row of its own falls to the general rate
 * for the service — the owner's decision, copied from the air side. A book with
 * neither leaves the figure unsaid rather than inventing one.
 */
export async function estimate(input: {
  cargoType: string | null;
  cbm: string | number;
  service?: ServiceType;
  client?: TxClient | typeof prisma;
}): Promise<Estimate> {
  const client = input.client ?? prisma;
  const service = input.service ?? "LCL";
  const cargoType = input.cargoType?.trim() || null;

  const priced = await quote(client, {
    service,
    cargoType,
    measured: { cbm: input.cbm },
  });

  if (priced.blockedReason || !priced.appliedRate) {
    return {
      kind: "quote-required",
      cargoType,
      reason: priced.blockedReason ?? "The rate book has nothing for this.",
    };
  }

  const settings = await companySettings(client);
  const vatPercent = new Prisma.Decimal(settings?.vatPercent ?? 0);
  const vatInside = settings?.pricesIncludeVat ?? true;
  const { vatAmount, total } = applyVat(priced.amount, vatPercent, vatInside);

  const fx = await currentExchangeRate(client);
  const totalTzs = fx ? usdToTzs(total, fx.rate) : null;

  const measured = new Prisma.Decimal(input.cbm || 0);
  const billable = priced.billableCbm;

  return {
    kind: "priced",
    cargoType,
    measuredCbm: measured.toFixed(3),
    billableCbm: billable ? billable.toFixed(3) : null,
    minimumApplied: !!billable && billable.greaterThan(measured),
    rate: priced.appliedRate.toString(),
    currency: priced.currency,
    lines: [
      { label: "Sea freight", amount: formatCurrency(priced.amount, priced.currency) },
      /* A price that contains VAT is one price: nothing about tax is said
         (the owner's decision). Only a book priced before VAT adds a line. */
      ...(vatInside || vatAmount.isZero()
        ? []
        : [
            {
              label: `VAT at ${vatPercent.toDecimalPlaces(2).toString()}%`,
              amount: formatCurrency(vatAmount, priced.currency),
            },
          ]),
    ],
    freight: formatCurrency(priced.amount, priced.currency),
    vatPercent: vatPercent.toDecimalPlaces(2).toString(),
    vat: formatCurrency(vatAmount, priced.currency),
    total: formatCurrency(total, priced.currency),
    totalTzs: totalTzs ? formatCurrency(totalTzs, "TZS") : null,
    exchangeRate: fx ? fx.rate.toString() : null,
    explanation: priced.explanation,
  };
}
