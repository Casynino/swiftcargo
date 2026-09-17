import "server-only";

import { Prisma } from "@prisma/client";

import { prisma, type TxClient } from "@/lib/prisma";

/**
 * WHAT THE WAREHOUSE'S FIGURES ARE WORTH.
 *
 * The Guangzhou floor records what arrived — cargo type, packages, pieces,
 * volume. This turns that into money, per line, against the live rate book.
 *
 * IT IS AN INDICATION, NOT A BILL. Nothing here is stored: the rate book can
 * change tomorrow and this figure moves with it, which is exactly right for a
 * consignment nobody has invoiced. The moment Finance raises an invoice, the
 * rate is pinned onto it and stops moving — that is the difference between an
 * estimate and a demand for money, and it is why this file writes nothing.
 *
 * WHO SEES IT is decided by the caller. The warehouse fills the form and never
 * sees a price; Finance opens the same consignment and sees every line valued.
 */

export type ValuedLine = {
  reference: string;
  /** The carbon page this kind of goods was written on, for the printed bill. */
  paperReceiptNo: string | null;
  description: string;
  descriptionZh: string | null;
  cargoType: string | null;
  quantity: number;
  pieces: number | null;
  cbm: Prisma.Decimal;
  weightKg: Prisma.Decimal | null;
  /** The rate found, or null when the book has no line for this type. */
  rate: Prisma.Decimal | null;
  basis: "PER_CBM" | "PER_KG" | "FLAT" | null;
  amount: Prisma.Decimal;
  /** Why a line could not be valued. Null when it could. */
  blocked: string | null;
};

export type Valuation = {
  lines: ValuedLine[];
  subtotal: Prisma.Decimal;
  /** Lines the rate book could not price. Finance has to look at these. */
  unpriced: number;
  currency: string;
};

type PackageLike = {
  reference: string;
  paperReceiptNo: string | null;
  description: string | null;
  descriptionZh: string | null;
  cargoType: string | null;
  quantity: number;
  pieces: number | null;
  cbm: Prisma.Decimal;
  weightKg: Prisma.Decimal | null;
};

/**
 * Price a consignment's lines against the live book.
 *
 * One query for every rate in play rather than one per line: a delivery of ten
 * items would otherwise be ten round trips to say the same three things.
 */
export async function valueLines(
  packages: PackageLike[],
  options: { service?: "LCL" | "FCL"; customerId?: string } = {},
  client: TxClient | typeof prisma = prisma
): Promise<Valuation> {
  return valueWith(await loadRateBook(options, client), packages);
}

export type RateBook = {
  rates: RateRow[];
  agreed: RateRow[];
};

type RateRow = {
  cargoType: string | null;
  rate: Prisma.Decimal;
  basis: string;
  currency: string;
};

/**
 * Read the book once.
 *
 * Split out from the arithmetic so receiving can load it BEFORE opening its
 * transaction. Pricing inside the transaction would hold the cargo record, the
 * packages and the delivery note open across two more queries, and a slow rate
 * lookup would start timing out the one write the warehouse cannot lose.
 */
export async function loadRateBook(
  options: { service?: "LCL" | "FCL"; customerId?: string } = {},
  client: TxClient | typeof prisma = prisma
): Promise<RateBook> {
  const service = options.service ?? "LCL";
  const now = new Date();

  const live = {
    active: true,
    service,
    effectiveFrom: { lte: now },
    OR: [{ effectiveTo: null }, { effectiveTo: { gte: now } }],
  };

  const [rates, agreed] = await Promise.all([
    client.shippingRate.findMany({ where: live, orderBy: { effectiveFrom: "desc" } }),
    options.customerId
      ? client.customerRate.findMany({
          where: { ...live, customerId: options.customerId },
          orderBy: { effectiveFrom: "desc" },
        })
      : Promise.resolve([]),
  ]);

  return { rates, agreed };
}

/** The arithmetic, against a book already read. */
export function valueWith(book: RateBook, packages: PackageLike[]): Valuation {
  const { rates, agreed } = book;

  const findRate = (cargoType: string | null) => {
    /*
      A rate agreed with this customer beats the published one. Same order as
      the invoice engine, because the estimate and the bill must never disagree
      about which rate applies.

      A TYPE WITH NO RATE OF ITS OWN TAKES THE GENERAL RATE. The owner's
      decision, copied from how the air side prices: a rate published for a
      cargo type wins, and anything the book has not banded yet is charged at
      the general rate for the service, so one press can confirm a whole
      container instead of stopping at every type nobody has priced. The price
      list shows the rate each line took, so a line on the general rate is
      visible to whoever confirms it. Only a book with no general rate either
      leaves a line unpriced, and that line is named.
    */
    const exact = <T extends { cargoType: string | null }>(list: T[]) =>
      list.find((r) => r.cargoType === cargoType);
    const general = <T extends { cargoType: string | null }>(list: T[]) =>
      list.find((r) => r.cargoType === null);

    if (cargoType === null) return general(agreed) ?? general(rates) ?? null;
    return exact(agreed) ?? exact(rates) ?? general(agreed) ?? general(rates) ?? null;
  };

  const currency = rates[0]?.currency ?? "USD";
  let subtotal = new Prisma.Decimal(0);
  let unpriced = 0;

  const lines: ValuedLine[] = packages.map((p) => {
    const found = findRate(p.cargoType);

    if (!found) {
      unpriced++;
      return {
        reference: p.reference,
        paperReceiptNo: p.paperReceiptNo,
        description: p.description ?? "",
        descriptionZh: p.descriptionZh,
        cargoType: p.cargoType,
        quantity: p.quantity,
        pieces: p.pieces,
        cbm: p.cbm,
        weightKg: p.weightKg,
        rate: null,
        basis: null,
        amount: new Prisma.Decimal(0),
        blocked: p.cargoType
          ? `No live rate for "${p.cargoType}" and no general rate.`
          : "No cargo type was chosen at receiving.",
      };
    }

    const rate = new Prisma.Decimal(found.rate);
    let amount = new Prisma.Decimal(0);
    let blocked: string | null = null;

    if (found.basis === "PER_KG") {
      if (!p.weightKg || p.weightKg.lessThanOrEqualTo(0)) {
        blocked = `"${p.cargoType}" is billed by weight and nothing was weighed.`;
        unpriced++;
      } else {
        amount = p.weightKg.mul(rate).toDecimalPlaces(2);
      }
    } else if (found.basis === "FLAT") {
      amount = rate;
    } else {
      if (p.cbm.lessThanOrEqualTo(0)) {
        blocked = "No volume was recorded for this line.";
        unpriced++;
      } else {
        amount = p.cbm.mul(rate).toDecimalPlaces(2);
      }
    }

    subtotal = subtotal.add(amount);

    return {
      reference: p.reference,
      paperReceiptNo: p.paperReceiptNo,
      description: p.description ?? "",
      descriptionZh: p.descriptionZh,
      cargoType: p.cargoType,
      quantity: p.quantity,
      pieces: p.pieces,
      cbm: p.cbm,
      weightKg: p.weightKg,
      rate,
      basis: found.basis as ValuedLine["basis"],
      amount,
      blocked,
    };
  });

  return { lines, subtotal, unpriced, currency };
}

/**
 * The cargo types the warehouse can choose from, straight off the rate book.
 *
 * Loose cargo only. A whole-container rate — 20GP, 40HQ — is a price for hiring
 * the box, not a description of what is in it, and offering it at the receiving
 * counter invites a clerk to file three cartons of shoes as a forty-foot
 * container.
 */
export async function cargoTypeOptions(): Promise<string[]> {
  const now = new Date();
  const rates = await prisma.shippingRate.findMany({
    where: {
      active: true,
      service: "LCL",
      effectiveFrom: { lte: now },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: now } }],
      cargoType: { not: null },
    },
    select: { cargoType: true },
    distinct: ["cargoType"],
    orderBy: { cargoType: "asc" },
  });
  return rates.map((r) => r.cargoType!).filter(Boolean);
}
