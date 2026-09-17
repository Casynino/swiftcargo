import "server-only";

import { Prisma } from "@prisma/client";

import { formatCurrency, usdToTzs } from "@/lib/currency";
import { billingMeasurement, priceConsignment } from "@/lib/invoice-draft";
import { carriesAgreedRate } from "@/lib/price-confirmation";
import { applyVat, companySettings, currentExchangeRate } from "@/lib/pricing";
import { prisma, type TxClient } from "@/lib/prisma";
import { UNSAILED_TO_PRICE } from "@/lib/unsailed-pricing";

/**
 * WHAT IS WAITING FOR A PRICE, WITH THE PRICE ALREADY WORKED OUT.
 *
 * Counted at Dar, with nothing but drafts billed against it. The figure on
 * each row is the draft the rate book raised at check-in; cargo checked in
 * before drafts were raised automatically has none, and its row shows what the
 * book would charge today, worked out here and written nowhere — confirming is
 * what raises and issues it.
 *
 * No money leaves this file for a desk without finance.view: the caller checks
 * the permission before asking.
 */

export const WAITING_ON_CONTAINER = (containerId: string) =>
  ({
    deletedAt: null,
    darReceiving: { isNot: null },
    containerLines: { some: { containerId } },
    invoices: { none: { status: { notIn: ["DRAFT", "CANCELLED"] } } },
  }) satisfies Prisma.CargoWhereInput;

export type PriceListRow = {
  cargoId: string;
  reference: string;
  description: string;
  customer: string;
  customerCode: string;
  packages: number | null;
  /** Dar's volume, which is what the bill is struck on. */
  cbm: string | null;
  /** Distinct cargo types on the lines; empty when nothing is typed. */
  types: string[];
  /** Lines at more than one type — changed per line on the cargo, not here. */
  mixed: boolean;
  invoiceId: string | null;
  invoiceNumber: string | null;
  /** The rate per CBM being charged, or null where lines differ. */
  rate: string | null;
  /** The book's own rate, beside an agreed one. */
  standardRate: string | null;
  agreed: boolean;
  billableCbm: string | null;
  totalUsd: string | null;
  totalLabel: string | null;
  totalTzsLabel: string | null;
  totalTzs: number;
  total: number;
  blockedReason: string | null;
};

export type PriceList = {
  rows: PriceListRow[];
  /** Rows that can be confirmed now. */
  ready: number;
  totalUsdLabel: string;
  totalTzsLabel: string | null;
  fxRate: string | null;
};

export async function priceListFor(
  where: Prisma.CargoWhereInput,
  client: TxClient | typeof prisma = prisma
): Promise<PriceList> {
  const [cargo, settings, fx] = await Promise.all([
    client.cargo.findMany({
      where,
      orderBy: { createdAt: "asc" },
      take: 300,
      include: {
        receiver: { select: { code: true, fullName: true } },
        darReceiving: true,
        chinaReceiving: true,
        packages: {
          where: { deletedAt: null },
          select: { cargoType: true },
        },
        invoices: {
          where: { status: "DRAFT" },
          orderBy: { createdAt: "asc" },
        },
      },
    }),
    companySettings(client),
    currentExchangeRate(client),
  ]);
  const vatPercent = new Prisma.Decimal(settings?.vatPercent ?? 0);
  const tzsOf = (usd: Prisma.Decimal) => (fx ? usdToTzs(usd, fx.rate) : null);

  const rows: PriceListRow[] = [];
  for (const item of cargo) {
    const types = [
      ...new Set(item.packages.map((p) => p.cargoType).filter((t): t is string => Boolean(t))),
    ];
    const untyped = item.packages.some((p) => !p.cargoType);
    const base = {
      cargoId: item.id,
      reference: item.reference,
      description: item.description,
      customer: item.receiver.fullName,
      customerCode: item.receiver.code,
      packages: item.darReceiving?.packagesCount ?? null,
      cbm: item.darReceiving?.cbm?.toString() ?? null,
      types: item.packages.length === 0 && item.commodity ? [item.commodity] : types,
      mixed: types.length > 1 || (types.length === 1 && untyped),
    };

    const draft = item.invoices[0] ?? null;
    let total: Prisma.Decimal | null = null;
    let rate: Prisma.Decimal | null = null;
    let standardRate: Prisma.Decimal | null = null;
    let billableCbm: Prisma.Decimal | null = null;
    let blockedReason: string | null = null;
    let agreed = false;

    if (draft) {
      /* Two drafts only when a consignment's lines split across sailings; the
         row carries both, since confirming issues both. */
      total = item.invoices.reduce((sum, i) => sum.add(i.total), new Prisma.Decimal(0));
      rate = draft.appliedRate;
      standardRate = draft.standardRate;
      billableCbm = draft.billableCbm;
      agreed = carriesAgreedRate(draft);
    } else {
      const priced = await priceConsignment(
        {
          id: item.id,
          description: item.description,
          commodity: item.commodity,
          service: item.service,
          receiverId: item.receiverId,
          ...billingMeasurement(item),
        },
        client
      );
      if (priced.blockedReason) {
        blockedReason =
          base.types.length === 0
            ? "No cargo type yet, and the rate book has no general rate. Choose a type."
            : priced.blockedReason;
      } else {
        total = applyVat(priced.amount, vatPercent).total;
        rate = priced.appliedRate;
        standardRate = priced.standardRate;
        billableCbm = priced.billableCbm;
      }
    }

    const tzs = total ? tzsOf(total) : null;
    rows.push({
      ...base,
      invoiceId: draft?.id ?? null,
      invoiceNumber: draft?.number ?? null,
      rate: rate?.toString() ?? null,
      standardRate: standardRate?.toString() ?? null,
      agreed,
      billableCbm: billableCbm?.toString() ?? null,
      totalUsd: total?.toString() ?? null,
      totalLabel: total ? formatCurrency(total, draft?.currency ?? "USD") : null,
      totalTzsLabel: tzs ? formatCurrency(tzs, "TZS") : null,
      totalTzs: tzs ? Number(tzs) : 0,
      total: total ? Number(total) : 0,
      blockedReason,
    });
  }

  const ready = rows.filter((r) => !r.blockedReason);
  const sumUsd = ready.reduce((sum, r) => sum.add(r.totalUsd ?? 0), new Prisma.Decimal(0));
  const sumTzs = fx ? ready.reduce((sum, r) => sum + r.totalTzs, 0) : null;
  return {
    rows,
    ready: ready.length,
    totalUsdLabel: formatCurrency(sumUsd, "USD"),
    totalTzsLabel: sumTzs === null ? null : formatCurrency(sumTzs, "TZS"),
    fxRate: fx?.rate.toString() ?? null,
  };
}

export const priceListForContainer = (containerId: string) =>
  priceListFor(WAITING_ON_CONTAINER(containerId));

export const priceListWithoutContainer = () => priceListFor(UNSAILED_TO_PRICE);
