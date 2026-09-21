import "server-only";

import { cache } from "react";

import { Prisma, type RateBasis, type ServiceType } from "@prisma/client";

import { chargeableCbm } from "@/lib/cbm";
import { prisma, type TxClient } from "@/lib/prisma";

/**
 * WHAT A CONSIGNMENT COSTS, AND WHY.
 *
 * Every figure this returns carries its working: which rate was found, which
 * rate was actually applied, and the gap between them. Storing only the final
 * number is how a discount becomes invisible and an argument about a bill
 * becomes unanswerable.
 *
 * RATES ARE NEVER HARD-CODED. Everything here reads the rate book, and a
 * consignment the book cannot price is reported as unpriceable rather than
 * silently charged zero — the boxes are on the floor either way, and Finance
 * needs to know the book has a hole in it.
 */

export type Quote = {
  /** The published rate on the day, before anything customer-specific. */
  standardRate: Prisma.Decimal | null;
  /** What was actually used. Equal to standardRate unless the customer has terms. */
  appliedRate: Prisma.Decimal | null;
  basis: RateBasis | null;
  currency: string;
  /** Volume or weight actually billed, after any minimum. */
  billableCbm: Prisma.Decimal | null;
  billableKg: Prisma.Decimal | null;
  /** appliedRate × billable, before VAT. */
  amount: Prisma.Decimal;
  /** standardRate × billable − amount. Positive means the customer saved money. */
  discount: Prisma.Decimal;
  /** Set when the book could not price it. `amount` is zero and must not be billed. */
  blockedReason: string | null;
  /** Human sentence for the invoice line. */
  explanation: string;
};

type Measured = {
  cbm: Prisma.Decimal | number | string | null | undefined;
  weightKg?: Prisma.Decimal | number | string | null | undefined;
};

const ZERO = new Prisma.Decimal(0);

/**
 * Find the rate that applies.
 *
 * Order matters and is the commercial policy: a rate agreed with this customer
 * beats the published one, a rate for this commodity beats the general one, and
 * a rate that has expired is not a rate. `effectiveFrom <= now` is checked
 * because a rate published in advance must not start applying early.
 */
export async function resolveRate(
  client: TxClient | typeof prisma,
  input: {
    /**
     * Whose terms to look for. Absent for the public calculator, which is
     * asking what the rate book says and has nobody to ask it about — an
     * agreed rate belongs to a customer and is not a figure to show a stranger.
     */
    customerId?: string | null;
    service: ServiceType;
    cargoType?: string | null;
  }
) {
  const now = new Date();
  const live = {
    active: true,
    effectiveFrom: { lte: now },
    OR: [{ effectiveTo: null }, { effectiveTo: { gte: now } }],
  };

  /*
    NULL MEANS THE GENERAL RATE, NOT "ANY RATE".

    Written as `cargoType: input.cargoType ?? undefined`, an unbanded
    consignment matched no filter at all and took whichever rate happened to
    have been added most recently — so a warehouse adding "Iron coil" at 550 on
    Tuesday silently repriced every untyped consignment in the system. The
    named band is asked for only when there is a name to ask about; otherwise
    the question is explicitly the general rate.
  */
  const named = input.cargoType?.trim() || null;

  const standard =
    (named
      ? await client.shippingRate.findFirst({
          where: { ...live, service: input.service, cargoType: named },
          orderBy: { effectiveFrom: "desc" },
        })
      : null) ??
    /* Fall back to the general rate for the service — a commodity nobody has
       banded yet still has to be billable. */
    (await client.shippingRate.findFirst({
      where: { ...live, service: input.service, cargoType: null },
      orderBy: { effectiveFrom: "desc" },
    }));

  const forCustomer = input.customerId ?? null;
  const agreed = !forCustomer
    ? null
    : ((named
        ? await client.customerRate.findFirst({
            where: {
              ...live,
              customerId: forCustomer,
              service: input.service,
              cargoType: named,
            },
            orderBy: { effectiveFrom: "desc" },
          })
        : null) ??
      (await client.customerRate.findFirst({
        where: {
          ...live,
          customerId: forCustomer,
          service: input.service,
          cargoType: null,
        },
        orderBy: { effectiveFrom: "desc" },
      })));

  return { standard, agreed };
}

/**
 * Price a consignment.
 *
 * The billable quantity is not the measured one: sea freight has a floor, so
 * half a cubic metre is charged as one when the rate book says so. Both the
 * measured and the billable figures reach the invoice, because a customer
 * looking at a bill for 1.000 m³ on a 0.46 m³ consignment is owed an
 * explanation and "minimum 1 m³" is it.
 */
export async function quote(
  client: TxClient | typeof prisma,
  input: {
    customerId?: string | null;
    service: ServiceType;
    cargoType?: string | null;
    measured: Measured;
  }
): Promise<Quote> {
  const { standard, agreed } = await resolveRate(client, input);

  if (!standard && !agreed) {
    return {
      standardRate: null,
      appliedRate: null,
      basis: null,
      currency: "USD",
      billableCbm: null,
      billableKg: null,
      amount: ZERO,
      discount: ZERO,
      blockedReason: `No live rate for ${input.service}${
        input.cargoType ? ` / ${input.cargoType}` : ""
      }.`,
      explanation: "",
    };
  }

  /* The agreed rate decides the basis when there is one — a customer on a flat
     deal is not also billed per cubic metre. */
  const basis = (agreed?.basis ?? standard!.basis) as RateBasis;
  const currency = agreed?.currency ?? standard!.currency;
  const appliedRate = new Prisma.Decimal(agreed?.rate ?? standard!.rate);
  const standardRate = standard ? new Prisma.Decimal(standard.rate) : appliedRate;

  if (basis === "FLAT") {
    const amount = appliedRate;
    return {
      standardRate,
      appliedRate,
      basis,
      currency,
      billableCbm: null,
      billableKg: null,
      amount,
      discount: standardRate.sub(appliedRate),
      blockedReason: null,
      explanation: `Flat rate, ${input.service}`,
    };
  }

  if (basis === "PER_KG") {
    const measuredKg = input.measured.weightKg
      ? new Prisma.Decimal(input.measured.weightKg)
      : null;
    if (!measuredKg || measuredKg.lessThanOrEqualTo(0)) {
      return {
        standardRate,
        appliedRate,
        basis,
        currency,
        billableCbm: null,
        billableKg: null,
        amount: ZERO,
        discount: ZERO,
        blockedReason: "This rate is per kilogram and nothing has been weighed.",
        explanation: "",
      };
    }
    const floor = standard?.minimumKg ?? null;
    const billableKg =
      floor && measuredKg.lessThan(floor) ? new Prisma.Decimal(floor) : measuredKg;
    const amount = billableKg.mul(appliedRate).toDecimalPlaces(2);

    return {
      standardRate,
      appliedRate,
      basis,
      currency,
      billableCbm: null,
      billableKg,
      amount,
      discount: billableKg.mul(standardRate).sub(amount).toDecimalPlaces(2),
      blockedReason: null,
      explanation: `${billableKg} kg at ${currency} ${appliedRate}/kg${
        floor && measuredKg.lessThan(floor) ? ` (minimum ${floor} kg)` : ""
      }`,
    };
  }

  // PER_CBM
  const measuredCbm = input.measured.cbm
    ? new Prisma.Decimal(input.measured.cbm)
    : null;
  if (!measuredCbm || measuredCbm.lessThanOrEqualTo(0)) {
    return {
      standardRate,
      appliedRate,
      basis,
      currency,
      billableCbm: null,
      billableKg: null,
      amount: ZERO,
      discount: ZERO,
      blockedReason: "Nothing has been measured, so there is no volume to bill.",
      explanation: "",
    };
  }

  const floor = standard?.minimumCbm ?? null;
  const billableCbm = chargeableCbm(measuredCbm, floor);
  const amount = billableCbm.mul(appliedRate).toDecimalPlaces(2);

  return {
    standardRate,
    appliedRate,
    basis,
    currency,
    billableCbm,
    billableKg: null,
    amount,
    discount: billableCbm.mul(standardRate).sub(amount).toDecimalPlaces(2),
    blockedReason: null,
    explanation: `${billableCbm.toFixed(3)} CBM at ${currency} ${appliedRate}/CBM${
      floor && measuredCbm.lessThan(floor)
        ? ` (minimum ${new Prisma.Decimal(floor).toFixed(3)} CBM)`
        : ""
    }`,
  };
}

/**
 * VAT and the total.
 *
 * The percentage comes from CompanySetting, never from a constant here — a tax
 * rate changes by law, and a deploy is the wrong way to answer a change in the
 * law. It is written onto the invoice at issue, so a rate change next year does
 * not restate last year's bills.
 */
export function applyVat(
  subtotal: Prisma.Decimal,
  vatPercent: Prisma.Decimal,
  /**
   * Whether the prices already contain VAT — `CompanySetting.pricesIncludeVat`
   * for a bill being priced, `Invoice.vatInclusive` for one being restated as
   * it was. Required, so no caller can fall back to adding it on top.
   */
  inclusive: boolean
) {
  if (inclusive) {
    /* 380 is 380. The VAT is the part of it the tax office is owed:
       380 × 18 / 118 = 57.97, rounded once to the cent. */
    const total = subtotal.toDecimalPlaces(2);
    const vatAmount = vatPercent.greaterThan(0)
      ? total.mul(vatPercent).div(vatPercent.add(100)).toDecimalPlaces(2)
      : new Prisma.Decimal(0);
    return { vatAmount, total };
  }
  const vatAmount = subtotal.mul(vatPercent).div(100).toDecimalPlaces(2);
  return { vatAmount, total: subtotal.add(vatAmount).toDecimalPlaces(2) };
}

/**
 * The live USD → TZS rate, as a row rather than a number.
 *
 * Invoices pin the ROW, not the figure, so a bill can always be traced back to
 * the rate it was raised at and who set it.
 */
const liveRate = cache(async () =>
  prisma.exchangeRate.findFirst({
    where: { fromCurrency: "USD", toCurrency: "TZS", active: true },
    orderBy: { effectiveFrom: "desc" },
  })
);

export async function currentExchangeRate(
  client: TxClient | typeof prisma = prisma
) {
  /* One read per request for the ordinary case. A page that prices twenty
     rows was asking the database for the same rate twenty times, and every
     one of those is a round trip to another continent. Inside a transaction
     the caller's own client is used, never the cached read. */
  if (client === prisma) return liveRate();
  return client.exchangeRate.findFirst({
    where: { fromCurrency: "USD", toCurrency: "TZS", active: true },
    orderBy: { effectiveFrom: "desc" },
  });
}

const settingsOnce = cache(async () =>
  prisma.companySetting.findUnique({ where: { id: "singleton" } })
);

export async function companySettings(client: TxClient | typeof prisma = prisma) {
  if (client === prisma) return settingsOnce();
  return client.companySetting.findUnique({ where: { id: "singleton" } });
}
