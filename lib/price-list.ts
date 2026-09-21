import "server-only";

import { Prisma, type CargoCondition, type RateBasis, type ServiceType } from "@prisma/client";

import { formatCurrency, usdToTzs } from "@/lib/currency";
import { billingMeasurement, priceConsignment } from "@/lib/invoice-draft";
import { carriesAgreedRate, darConfirmationGap } from "@/lib/price-confirmation";
import { applyVat, companySettings, currentExchangeRate } from "@/lib/pricing";
import { prisma, type TxClient } from "@/lib/prisma";
import { UNSAILED_TO_PRICE } from "@/lib/unsailed-pricing";

/**
 * WHAT IS WAITING FOR A PRICE, WITH THE PRICE ALREADY WORKED OUT.
 *
 * Measured in China or at Dar, with nothing but drafts billed against it. The figure on
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
    /* Measured anywhere is enough: Finance prices from China's figures the
       day the boxes are received, and Dar's count re-prices a draft if it
       differs. */
    OR: [{ chinaReceiving: { isNot: null } }, { darReceiving: { isNot: null } }],
    /* Nobody is billed for boxes nobody found. */
    status: { notIn: ["MISSING_AT_DAR", "CANCELLED"] },
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
  /** The rate being charged, or null where lines differ. */
  rate: string | null;
  /** The book's own rate, beside an agreed one. */
  standardRate: string | null;
  agreed: boolean;
  /** The unit this bill charges in, and the unit the rate book prices in.
      They differ only where somebody changed it for this consignment. */
  basis: RateBasis | null;
  bookBasis: RateBasis | null;
  billableCbm: string | null;
  /** What a per-kilo rate would be multiplied by. */
  weightKg: string | null;
  /** The freight on the bill as it stands, before extras and discount. */
  freight: string;
  extra: string;
  discountOff: string;
  /** Not GOOD: the tag the Dar floor put on when the boxes came off damaged. */
  condition: CargoCondition | null;
  damaged: boolean;
  /**
   * DAR HAS FINISHED WITH THE CONSIGNMENT.
   *
   * Signed off, or measured and flagged — either way the figure has stopped
   * moving. False while the floor is still ruling on it, and the row is then
   * shown with its figure so Finance can read what the container will come to,
   * and left out of what one press confirms. See darConfirmationGap.
   */
  darConfirmed: boolean;
  /** Why it is still with Dar, in the words the row shows. Null once finished. */
  darWaiting: string | null;
  /** Dar recorded a difference against the manifest — short, over or damaged. */
  darFlagged: boolean;
  totalUsd: string | null;
  totalLabel: string | null;
  totalTzsLabel: string | null;
  totalTzs: number;
  total: number;
  blockedReason: string | null;
};

export type PriceList = {
  rows: PriceListRow[];
  /** From CompanySetting, so the row dialog adds up to what the bill says. */
  vatPercent: string;
  /** Prices already contain VAT: the dialog adds nothing on top. */
  vatIncluded: boolean;
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
          include: { items: true },
        },
      },
    }),
    companySettings(client),
    currentExchangeRate(client),
  ]);
  const vatPercent = new Prisma.Decimal(settings?.vatPercent ?? 0);
  const tzsOf = (usd: Prisma.Decimal) => (fx ? usdToTzs(usd, fx.rate) : null);

  /*
    THE UNIT THE RATE BOOK PRICES IN, BESIDE THE UNIT THE BILL CHARGES IN.

    A desk changing a rate has to be told which of the two numbers it is
    quoting, and a rate per kilo typed against a rate per cubic metre is the
    mistake that makes a bill ten times wrong. Asked once per cargo type rather
    than once per row: a container of ninety consignments is four or five types.
  */
  const bookBasisCache = new Map<string, RateBasis | null>();
  const bookBasisFor = async (service: ServiceType, cargoType: string | null) => {
    const key = `${service}|${cargoType ?? ""}`;
    if (!bookBasisCache.has(key)) {
      const now = new Date();
      const live = {
        active: true,
        effectiveFrom: { lte: now },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: now } }],
      };
      const rate =
        (cargoType
          ? await client.shippingRate.findFirst({
              where: { ...live, service, cargoType },
              orderBy: { effectiveFrom: "desc" },
              select: { basis: true },
            })
          : null) ??
        (await client.shippingRate.findFirst({
          where: { ...live, service, cargoType: null },
          orderBy: { effectiveFrom: "desc" },
          select: { basis: true },
        }));
      bookBasisCache.set(key, rate?.basis ?? null);
    }
    return bookBasisCache.get(key) ?? null;
  };

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
      packages: item.darReceiving?.packagesCount ?? item.chinaReceiving?.packagesCount ?? null,
      cbm: (item.darReceiving?.cbm ?? item.chinaReceiving?.cbm)?.toString() ?? null,
      weightKg:
        (item.darReceiving?.weightKg ?? item.chinaReceiving?.weightKg)?.toString() ??
        null,
      condition: item.darReceiving?.condition ?? null,
      damaged: !!item.darReceiving && item.darReceiving.condition !== "GOOD",
      darWaiting: darConfirmationGap(item),
      darConfirmed: darConfirmationGap(item) === null,
      darFlagged: item.darReceiving?.discrepancy === true,
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
    let basis: RateBasis | null = null;
    let freight = new Prisma.Decimal(0);
    let extra = new Prisma.Decimal(0);
    let discountOff = new Prisma.Decimal(0);

    if (draft) {
      /* Two drafts only when a consignment's lines split across sailings; the
         row carries both, since confirming issues both. */
      total = item.invoices.reduce((sum, i) => sum.add(i.total), new Prisma.Decimal(0));
      rate = draft.appliedRate;
      standardRate = draft.standardRate;
      billableCbm = draft.billableCbm;
      basis = draft.rateBasis;
      agreed = carriesAgreedRate(draft);
      for (const invoice of item.invoices) {
        for (const line of invoice.items) {
          if (line.category === "Charge") extra = extra.add(line.amount);
          else if (line.category === "Discount") discountOff = discountOff.sub(line.amount);
          else freight = freight.add(line.amount);
        }
      }
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
        total = applyVat(priced.amount, vatPercent, settings?.pricesIncludeVat ?? true).total;
        rate = priced.appliedRate;
        standardRate = priced.standardRate;
        billableCbm = priced.billableCbm;
        basis = priced.basis;
        freight = priced.amount;
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
      basis,
      bookBasis: await bookBasisFor(item.service, base.types[0] ?? null),
      billableCbm: billableCbm?.toString() ?? null,
      freight: freight.toString(),
      extra: extra.toString(),
      discountOff: discountOff.toString(),
      totalUsd: total?.toString() ?? null,
      totalLabel: total ? formatCurrency(total, draft?.currency ?? "USD") : null,
      totalTzsLabel: tzs ? formatCurrency(tzs, "TZS") : null,
      totalTzs: tzs ? Number(tzs) : 0,
      total: total ? Number(total) : 0,
      blockedReason,
    });
  }

  /* What one press will actually issue: priced, and signed off by Dar. The band
     above the list counts and totals these alone, so the figure on the button
     is the figure that goes out. */
  const ready = rows.filter((r) => !r.blockedReason && r.darConfirmed);
  const sumUsd = ready.reduce((sum, r) => sum.add(r.totalUsd ?? 0), new Prisma.Decimal(0));
  const sumTzs = fx ? ready.reduce((sum, r) => sum + r.totalTzs, 0) : null;
  return {
    rows,
    vatPercent: vatPercent.toString(),
    vatIncluded: settings?.pricesIncludeVat ?? true,
    ready: ready.length,
    totalUsdLabel: formatCurrency(sumUsd, "USD"),
    totalTzsLabel: sumTzs === null ? null : formatCurrency(sumTzs, "TZS"),
    fxRate: fx?.rate.toString() ?? null,
  };
}

export const priceListForContainer = (containerId: string) =>
  priceListFor(WAITING_ON_CONTAINER(containerId));

export const priceListWithoutContainer = () => priceListFor(UNSAILED_TO_PRICE);
