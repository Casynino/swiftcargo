import { Prisma } from "@prisma/client";

import { formatCurrency, fromBase, isUsableRate, roundMoney, usdToTzs } from "@/lib/currency";

/**
 * WHAT IS STILL OWED.
 *
 * There is no balance column. This is the only definition of "outstanding" in
 * the system, and every screen that shows a figure calls it — the customer
 * portal, the release check, the chase list and the receipt all have to agree,
 * and the only way to guarantee that is for there to be one function.
 *
 * A stored balance drifts the first time a payment is reversed and nobody
 * remembers to decrement it. This cannot drift: it is recomputed from the rows
 * every time it is asked for.
 */

type Numeric = Prisma.Decimal | number | string;

type PaymentLike = {
  status: string;
  amount: Numeric;
  currency: string;
  /** The rate this payment was taken at. */
  fxRate: Numeric | null;
  /**
   * What the payment is worth in shillings. Written when it is recorded; older
   * rows without it are valued from `amount` at their own rate.
   */
  baseCurrencyAmount: Numeric | null;
  /** Dollar credit, kept for rows raised before balances moved to shillings. */
  creditedAmount?: Numeric | null;
};

type InvoiceLike = {
  total: Numeric;
  currency: string;
  /** The rate pinned when the bill was raised or issued. */
  fxRate: Numeric | null;
  totalTzs?: Numeric | null;
  payments: PaymentLike[];
};

const ZERO = () => new Prisma.Decimal(0);

/**
 * THE BILL'S OWN RATE, OR NONE.
 *
 * Never today's rate: a bill agreed at 2,650 is still 2,650 after the board
 * moves. A figure of 1 or less is a column that was never filled in, not a rate.
 */
export function invoiceRate(invoice: Pick<InvoiceLike, "fxRate">): Prisma.Decimal | null {
  if (!isUsableRate(invoice.fxRate)) return null;
  const rate = new Prisma.Decimal(invoice.fxRate);
  return rate.greaterThan(1) ? rate : null;
}

/** The bill in shillings, at its pinned rate. Null when a dollar bill has no rate. */
export function totalTzsOf(invoice: Omit<InvoiceLike, "payments">): Prisma.Decimal | null {
  if (invoice.currency === "TZS") return roundMoney(invoice.total, "TZS");
  const rate = invoiceRate(invoice);
  return rate ? usdToTzs(invoice.total, rate) : null;
}

/**
 * One payment in shillings.
 *
 * Shillings handed over are exactly that many shillings. Dollars are valued at
 * the rate the payment was taken at — which defaults to the bill's own rate, so
 * USD 13.50 against a USD 13.50 bill settles it to the shilling whatever the
 * board says today.
 */
export function paymentTzs(
  payment: PaymentLike,
  invoice: Pick<InvoiceLike, "fxRate">
): Prisma.Decimal | null {
  if (payment.baseCurrencyAmount !== null && payment.baseCurrencyAmount !== undefined) {
    return new Prisma.Decimal(payment.baseCurrencyAmount);
  }
  if (payment.currency === "TZS") return roundMoney(payment.amount, "TZS");
  const own = isUsableRate(payment.fxRate) && new Prisma.Decimal(payment.fxRate).greaterThan(1)
    ? payment.fxRate
    : invoiceRate(invoice);
  return own ? usdToTzs(payment.amount, own) : null;
}

export type Balance = {
  currency: string;
  rate: Prisma.Decimal | null;
  /** Shilling figures. Null only for a dollar bill that never had a rate. */
  totalTzs: Prisma.Decimal | null;
  paidTzs: Prisma.Decimal | null;
  outstandingTzs: Prisma.Decimal | null;
  creditTzs: Prisma.Decimal | null;
  /** The same figures in the bill's own currency, converted once at the end. */
  total: Prisma.Decimal;
  paid: Prisma.Decimal;
  outstanding: Prisma.Decimal;
  credit: Prisma.Decimal;
  settled: boolean;
};

/**
 * Everything a screen needs to know about what is owed.
 *
 * ONLY `VERIFIED` COUNTS. A payment somebody uploaded a screenshot for is
 * PENDING and is worth nothing until Finance says otherwise — that rule is the
 * difference between this system and a WhatsApp group, and it lives here so no
 * screen can forget it.
 *
 * KEPT IN SHILLINGS. Each payment is valued in whole shillings and the sum is
 * compared with the bill in whole shillings; dollars are worked out from that
 * once. Converting every payment to dollars first and rounding each to the cent
 * is how TZS 50 of change turns into a two-cent credit worth TZS 54.
 */
export function balanceOf(invoice: InvoiceLike): Balance {
  const verified = invoice.payments.filter((p) => p.status === "VERIFIED");
  const rate = invoiceRate(invoice);
  const total = new Prisma.Decimal(invoice.total);
  const totalTzs = totalTzsOf(invoice);

  let paidTzs: Prisma.Decimal | null = totalTzs ? ZERO() : null;
  for (const p of verified) {
    if (!paidTzs) break;
    const value = paymentTzs(p, invoice);
    paidTzs = value ? paidTzs.add(value) : null;
  }

  if (totalTzs && paidTzs) {
    const diff = totalTzs.sub(paidTzs);
    const outstandingTzs = diff.greaterThan(0) ? diff : ZERO();
    const creditTzs = diff.lessThan(0) ? diff.abs() : ZERO();
    const inOwn = (tzs: Prisma.Decimal) =>
      invoice.currency === "TZS" ? tzs : fromBase(tzs, "USD", rate);
    return {
      currency: invoice.currency,
      rate,
      totalTzs,
      paidTzs,
      outstandingTzs,
      creditTzs,
      total,
      paid: inOwn(paidTzs),
      outstanding: inOwn(outstandingTzs),
      credit: inOwn(creditTzs),
      settled: outstandingTzs.lessThanOrEqualTo(0),
    };
  }

  /* A dollar bill with no rate at all can only be kept in dollars. */
  const paid = verified.reduce(
    (sum, p) =>
      sum.add(
        new Prisma.Decimal(
          p.currency === invoice.currency ? p.amount : (p.creditedAmount ?? 0)
        )
      ),
    ZERO()
  );
  const diff = total.sub(paid);
  return {
    currency: invoice.currency,
    rate,
    totalTzs: null,
    paidTzs: null,
    outstandingTzs: null,
    creditTzs: null,
    total,
    paid,
    outstanding: diff.greaterThan(0) ? diff : ZERO(),
    credit: diff.lessThan(0) ? diff.abs() : ZERO(),
    settled: diff.lessThanOrEqualTo(0),
  };
}

/** Sum of money that actually landed, in the bill's own currency. */
export function paidOn(invoice: InvoiceLike): Prisma.Decimal {
  return balanceOf(invoice).paid;
}

/** Total minus what has actually landed, in the bill's own currency. Never below zero. */
export function outstandingOf(invoice: InvoiceLike): Prisma.Decimal {
  return balanceOf(invoice).outstanding;
}

/** Still owed in shillings — the figure a customer is asked to pay. */
export function outstandingTzsOf(invoice: InvoiceLike): Prisma.Decimal | null {
  return balanceOf(invoice).outstandingTzs;
}

/** Overpaid, when it happens. Shown separately rather than as a negative balance. */
export function creditOn(invoice: InvoiceLike): Prisma.Decimal {
  return balanceOf(invoice).credit;
}

export function isSettled(invoice: InvoiceLike): boolean {
  return balanceOf(invoice).settled;
}

/**
 * The status an invoice's payments imply.
 *
 * Derived rather than trusted: the stored column is what screens filter on, and
 * this is what keeps it honest whenever a payment is verified, rejected or
 * reversed. DRAFT and CANCELLED are decisions a person made and are never
 * overwritten by arithmetic.
 */
export function impliedStatus(
  invoice: InvoiceLike & { status: string; dueAt?: Date | null }
): "DRAFT" | "ISSUED" | "PARTIALLY_PAID" | "PAID" | "OVERDUE" | "CANCELLED" {
  if (invoice.status === "DRAFT") return "DRAFT";
  if (invoice.status === "CANCELLED") return "CANCELLED";

  const balance = balanceOf(invoice);
  if (balance.settled) return "PAID";

  const overdue = invoice.dueAt ? invoice.dueAt.getTime() < Date.now() : false;
  const anything = balance.paidTzs ? balance.paidTzs.greaterThan(0) : balance.paid.greaterThan(0);
  if (anything) return overdue ? "OVERDUE" : "PARTIALLY_PAID";
  return overdue ? "OVERDUE" : "ISSUED";
}

/**
 * What several bills still owe together.
 *
 * Shillings are summed in shillings. The dollar figure beside it is each bill's
 * own dollar balance added up — an equivalent, not a conversion of the total at
 * any one rate. A dollar bill with no rate cannot be counted in shillings and is
 * kept apart, never added to them.
 */
export function owedAcross(invoices: InvoiceLike[]) {
  let tzs = ZERO();
  let usd = ZERO();
  let unconverted = ZERO();
  for (const invoice of invoices) {
    const b = balanceOf(invoice);
    if (b.outstandingTzs) {
      tzs = tzs.add(b.outstandingTzs);
      usd = usd.add(invoice.currency === "USD" ? b.outstanding : fromBase(b.outstandingTzs, "USD", b.rate));
    } else {
      unconverted = unconverted.add(b.outstanding);
    }
  }
  const owes = tzs.greaterThan(0) || unconverted.greaterThan(0);
  const primary = [
    tzs.greaterThan(0) || !unconverted.greaterThan(0) ? formatCurrency(tzs, "TZS") : null,
    unconverted.greaterThan(0) ? formatCurrency(unconverted, "USD") : null,
  ]
    .filter(Boolean)
    .join(" + ");
  return {
    tzs,
    usd,
    unconverted,
    owes,
    /** "TZS 36,450" */
    primary,
    /** "≈ USD 13.50" */
    equivalent: usd.greaterThan(0) ? `≈ ${formatCurrency(usd, "USD")}` : "",
  };
}
