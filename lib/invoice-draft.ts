import "server-only";

import { Prisma, type RateBasis, type ServiceType } from "@prisma/client";

import { prisma, type TxClient } from "@/lib/prisma";
import { quote } from "@/lib/pricing";
import { valueLines } from "@/lib/valuation";

export type DraftItem = {
  description: string;
  /** Copied onto the bill so a customer can check it against their receipt. */
  paperReceiptNo: string | null;
  packages: number | null;
  pieces: number | null;
  quantity: Prisma.Decimal;
  unit: string;
  unitPrice: Prisma.Decimal;
  amount: Prisma.Decimal;
  category: string;
  taxable: boolean;
};

export type PricedConsignment = {
  billableCbm: Prisma.Decimal | null;
  billableKg: Prisma.Decimal | null;
  standardRate: Prisma.Decimal | null;
  appliedRate: Prisma.Decimal | null;
  basis: RateBasis | null;
  discount: Prisma.Decimal;
  amount: Prisma.Decimal;
  currency: string;
  explanation: string;
  blockedReason: string | null;
  items: DraftItem[];
};

const ZERO = new Prisma.Decimal(0);

/**
 * WHAT TO CHARGE FOR ONE CONSIGNMENT.
 *
 * A delivery is rarely one commodity. Two hundred cartons of shoes and a
 * machine on the same note are not the same money per cubic metre, and billing
 * the whole lot at one rate is how a company either loses on the machine or
 * overcharges on the shoes. So each recorded line is priced at the rate for its
 * own cargo type and the invoice carries one item per line — the customer can
 * see which goods cost what, and an argument about the bill is an argument
 * about one line rather than the whole thing.
 *
 * Consignments received before cargo types existed have no typed lines. Those
 * still price the old way, on the consignment's commodity, so historic cargo
 * remains billable.
 *
 * The lines are read as they stand. They belong to whichever floor holds the
 * cargo, and Dar corrects them after check-in the way Guangzhou does before
 * departure, so a bill is struck on the last corrected figure rather than on
 * the first one typed.
 *
 * NOTHING HERE IS FROZEN. The caller writes these figures onto an invoice, and
 * that write is what pins them.
 */
export async function priceConsignment(
  cargo: {
  id: string;
  description: string;
  commodity: string | null;
  service: ServiceType;
  receiverId: string;
  measuredCbm: Prisma.Decimal | null;
  measuredKg: Prisma.Decimal | null;
  },
  /* A transaction when the caller has just corrected the lines and must price
     what it wrote rather than what was committed before it. */
  client: TxClient | typeof prisma = prisma
): Promise<PricedConsignment> {
  const packages = await client.cargoPackage.findMany({
    where: { cargoId: cargo.id, deletedAt: null, cargoType: { not: null } },
    orderBy: { reference: "asc" },
  });

  if (packages.length === 0) {
    const priced = await quote(client, {
      customerId: cargo.receiverId,
      service: cargo.service,
      cargoType: cargo.commodity,
      measured: { cbm: cargo.measuredCbm, weightKg: cargo.measuredKg },
    });

    return {
      ...priced,
      items: priced.blockedReason
        ? []
        : [
            {
              description: `Sea freight — ${cargo.description}`,
              paperReceiptNo: null,
              packages: null,
              pieces: null,
              quantity: new Prisma.Decimal(
                priced.billableCbm ?? priced.billableKg ?? 1
              ),
              unit:
                priced.basis === "PER_CBM"
                  ? "CBM"
                  : priced.basis === "PER_KG"
                    ? "kg"
                    : "container",
              unitPrice: new Prisma.Decimal(priced.appliedRate ?? 0),
              amount: priced.amount,
              category: "Freight",
              taxable: true,
            },
          ],
    };
  }

  const valuation = await valueLines(packages, {
    service: cargo.service,
    customerId: cargo.receiverId,
  });

  const unpriceable = valuation.lines.find((l) => l.blocked);
  if (unpriceable) {
    return {
      billableCbm: null,
      billableKg: null,
      standardRate: null,
      appliedRate: null,
      basis: null,
      discount: ZERO,
      amount: ZERO,
      currency: valuation.currency,
      explanation: "",
      blockedReason: `${unpriceable.reference}: ${unpriceable.blocked}`,
      items: [],
    };
  }

  let cbm = ZERO;
  let kg = ZERO;
  const items: DraftItem[] = valuation.lines.map((line) => {
    const byWeight = line.basis === "PER_KG";
    if (byWeight) kg = kg.add(line.weightKg ?? ZERO);
    else cbm = cbm.add(line.cbm);

    return {
      description: [line.description, line.cargoType]
        .filter(Boolean)
        .join(" — "),
      paperReceiptNo: line.paperReceiptNo,
      packages: line.quantity,
      pieces: line.pieces,
      quantity: byWeight ? (line.weightKg ?? ZERO) : line.cbm,
      unit: byWeight ? "kg" : line.basis === "FLAT" ? "consignment" : "CBM",
      unitPrice: line.rate ?? ZERO,
      amount: line.amount,
      category: "Freight",
      taxable: true,
    };
  });

  /* One rate can be named on the invoice header only when every line shares it.
     Mixed loads leave it blank rather than pick a winner: a header saying $380
     over lines charged at $500 is worse than a header saying nothing. */
  const bases = new Set(valuation.lines.map((l) => l.basis));
  const rates = new Set(valuation.lines.map((l) => l.rate?.toString()));
  const single = rates.size === 1 ? valuation.lines[0].rate : null;

  const types = [...new Set(valuation.lines.map((l) => l.cargoType))];

  return {
    billableCbm: cbm.greaterThan(0) ? cbm.toDecimalPlaces(4) : null,
    billableKg: kg.greaterThan(0) ? kg.toDecimalPlaces(3) : null,
    standardRate: single,
    appliedRate: single,
    basis: bases.size === 1 ? (valuation.lines[0].basis as RateBasis) : null,
    discount: ZERO,
    amount: valuation.subtotal,
    currency: valuation.currency,
    explanation:
      types.length === 1
        ? `${types[0]} at ${valuation.currency} ${single?.toString() ?? "?"}`
        : `${valuation.lines.length} lines across ${types.length} cargo types`,
    blockedReason: null,
    items,
  };
}

/**
 * The totals an untyped consignment is billed on: Dar's where Dar recorded one,
 * China's where it did not. Dar weighed and measured what actually came off the
 * container, so its figure replaces Guangzhou's for billing — Guangzhou's stays
 * on its own row as the other half of the comparison.
 */
export function billingMeasurement(cargo: {
  darReceiving: { cbm: Prisma.Decimal | null; weightKg: Prisma.Decimal | null } | null;
  chinaReceiving: { cbm: Prisma.Decimal | null; weightKg: Prisma.Decimal | null } | null;
}) {
  return {
    measuredCbm: cargo.darReceiving?.cbm ?? cargo.chinaReceiving?.cbm ?? null,
    measuredKg: cargo.darReceiving?.weightKg ?? cargo.chinaReceiving?.weightKg ?? null,
  };
}
