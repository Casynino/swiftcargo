import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { Prisma } from "@prisma/client";

import {
  convert,
  formatCurrency,
  formatRate,
  tzsToUsd,
  usdToTzs,
} from "@/lib/currency";
import { balanceOf, impliedStatus } from "@/lib/invoice-balance";
import {
  parseAmount,
  paymentRate,
  spreadPayment,
  stillTakeableTzs,
  valuePayment,
} from "@/lib/payment-value";
import { can } from "@/lib/rbac";

const D = (v: number | string) => new Prisma.Decimal(v);
const RATE = D(2700);

type Pay = {
  status: string;
  amount: Prisma.Decimal;
  currency: string;
  fxRate: Prisma.Decimal | null;
  baseCurrencyAmount: Prisma.Decimal | null;
};

/** A payment recorded the way the actions record one. */
function pay(amount: string, currency: "TZS" | "USD", rate = RATE, status = "VERIFIED"): Pay {
  const { baseCurrencyAmount } = valuePayment(D(amount), currency, "USD", rate);
  return { status, amount: D(amount), currency, fxRate: rate, baseCurrencyAmount };
}

function bill(totalUsd: string, payments: Pay[] = [], fxRate = RATE) {
  return { total: D(totalUsd), currency: "USD", fxRate, status: "ISSUED", payments };
}

describe("conversion", () => {
  test("USD × rate = TZS in whole shillings", () => {
    assert.equal(usdToTzs("13.50", RATE).toString(), "36450");
    assert.equal(usdToTzs("0.01", RATE).toString(), "27");
    assert.equal(usdToTzs("99.99", RATE).toString(), "269973");
  });

  test("TZS ÷ rate = USD to the cent", () => {
    assert.equal(tzsToUsd("36450", RATE).toFixed(2), "13.50");
    assert.equal(tzsToUsd("50", RATE).toFixed(2), "0.02");
    assert.equal(convert("27000", "TZS", "USD", RATE).toFixed(2), "10.00");
  });

  test("rounds once, half up, with no float error", () => {
    // 0.1 + 0.2 in floats is 0.30000000000000004
    assert.equal(usdToTzs(D("0.1").add("0.2"), RATE).toString(), "810");
    assert.equal(usdToTzs("1.005", RATE).toString(), "2714"); // 2713.5 → 2714
  });

  test("a missing or zero rate refuses to convert", () => {
    assert.throws(() => usdToTzs("10", null));
    assert.throws(() => usdToTzs("10", 0));
    assert.throws(() => usdToTzs("10", -2700));
  });

  test("formatting names the currency", () => {
    assert.equal(formatCurrency("36450", "TZS"), "TZS 36,450");
    assert.equal(formatCurrency("13.5", "USD"), "USD 13.50");
    assert.equal(formatRate(RATE), "1 USD = 2,700 TZS");
  });
});

describe("amount input", () => {
  test("accepts valid amounts, refuses the rest", () => {
    assert.ok("amount" in parseAmount("36,450", "TZS"));
    assert.ok("amount" in parseAmount("13.50", "USD"));
    assert.ok("error" in parseAmount("0", "TZS"));
    assert.ok("error" in parseAmount("-5", "USD"));
    assert.ok("error" in parseAmount("", "USD"));
    assert.ok("error" in parseAmount("abc", "TZS"));
    assert.ok("error" in parseAmount("100.5", "TZS"));
    assert.ok("error" in parseAmount("1.005", "USD"));
  });
});

describe("invoice balances", () => {
  test("rate book: 1.5 CBM × USD 9 = USD 13.50 = TZS 36,450", () => {
    const usd = D("1.5").mul("9");
    assert.equal(usd.toFixed(2), "13.50");
    assert.equal(balanceOf(bill(usd.toFixed(2))).totalTzs!.toString(), "36450");
  });

  test("exact TZS payment settles", () => {
    const b = balanceOf(bill("13.50", [pay("36450", "TZS")]));
    assert.equal(b.outstandingTzs!.toString(), "0");
    assert.equal(b.creditTzs!.toString(), "0");
    assert.ok(b.settled);
  });

  test("partial TZS payment leaves TZS 26,450 and its USD equivalent", () => {
    const b = balanceOf(bill("13.50", [pay("10000", "TZS")]));
    assert.equal(b.paidTzs!.toString(), "10000");
    assert.equal(b.outstandingTzs!.toString(), "26450");
    assert.equal(b.outstanding.toFixed(2), "9.80");
    assert.equal(impliedStatus(bill("13.50", [pay("10000", "TZS")])), "PARTIALLY_PAID");
  });

  test("full USD payment settles", () => {
    const b = balanceOf(bill("13.50", [pay("13.50", "USD")]));
    assert.equal(b.paidTzs!.toString(), "36450");
    assert.ok(b.settled);
    assert.equal(impliedStatus(bill("13.50", [pay("13.50", "USD")])), "PAID");
  });

  test("mixed USD 10 + TZS 9,450 settles exactly", () => {
    const b = balanceOf(bill("13.50", [pay("10", "USD"), pay("9450", "TZS")]));
    assert.equal(b.paidTzs!.toString(), "36450");
    assert.equal(b.outstandingTzs!.toString(), "0");
    assert.equal(b.creditTzs!.toString(), "0");
  });

  test("mixed payment with odd shillings stays exact in TZS", () => {
    // Converted to dollars one by one this would round to a two-cent credit.
    const b = balanceOf(bill("13.50", [pay("10", "USD"), pay("9500", "TZS")]));
    assert.equal(b.creditTzs!.toString(), "50");
    assert.equal(b.outstandingTzs!.toString(), "0");
  });

  test("overpayment: TZS 36,500 on TZS 36,450 leaves TZS 50 credit", () => {
    const b = balanceOf(bill("13.50", [pay("36500", "TZS")]));
    assert.equal(b.creditTzs!.toString(), "50");
    assert.equal(b.outstandingTzs!.toString(), "0");
  });

  test("only VERIFIED payments count", () => {
    const b = balanceOf(
      bill("13.50", [pay("36450", "TZS", RATE, "PENDING"), pay("36450", "TZS", RATE, "REJECTED")])
    );
    assert.equal(b.outstandingTzs!.toString(), "36450");
  });

  test("pending claims reduce what may still be taken", () => {
    const invoice = bill("13.50", [pay("30000", "TZS", RATE, "PENDING")]);
    assert.equal(stillTakeableTzs(invoice)!.toString(), "6450");
  });
});

describe("rate changes", () => {
  test("an invoice issued at 2,700 keeps 2,700 after the rate becomes 2,800", () => {
    const issued = bill("13.50");
    const newRate = D(2800);
    // The live rate is only a fallback; the bill's own rate wins.
    assert.equal(paymentRate(issued, null, newRate)!.toString(), "2700");
    assert.equal(balanceOf(issued).totalTzs!.toString(), "36450");
    // A USD payment taken after the change still settles it.
    const rate = paymentRate(issued, null, newRate)!;
    const b = balanceOf(bill("13.50", [pay("13.50", "USD", rate)]));
    assert.ok(b.settled);
    assert.equal(b.creditTzs!.toString(), "0");
  });

  test("a counter override values only that payment", () => {
    const issued = bill("13.50");
    assert.equal(paymentRate(issued, D(2750), RATE)!.toString(), "2750");
    assert.equal(valuePayment(D("10"), "USD", "USD", D(2750)).baseCurrencyAmount.toString(), "27500");
  });
});

describe("one payment across several bills", () => {
  test("TZS spread oldest first and exact", () => {
    const a = { ...bill("13.50"), number: "A" };
    const b = { ...bill("10.00"), number: "B" };
    const r = spreadPayment([a, b], D(50000), "TZS", RATE);
    assert.ok(!("error" in r));
    if ("error" in r) return;
    assert.deepEqual(r.slices.map((s) => s.baseCurrencyAmount.toString()), ["36450", "13550"]);
    assert.equal(r.left.toString(), "0");
  });

  test("USD spread across bills at different pinned rates", () => {
    const a = { ...bill("13.50", [], D(2650)), number: "A" };
    const b = { ...bill("10.00", [], D(2700)), number: "B" };
    const r = spreadPayment([a, b], D("23.50"), "USD", RATE);
    if ("error" in r) throw new Error(r.error);
    assert.deepEqual(r.slices.map((s) => s.baseCurrencyAmount.toString()), ["35775", "27000"]);
    assert.equal(r.left.toString(), "0");
  });

  test("money beyond the bills is reported, not absorbed", () => {
    const a = { ...bill("13.50"), number: "A" };
    const r = spreadPayment([a], D(40000), "TZS", RATE);
    if ("error" in r) throw new Error(r.error);
    assert.equal(r.left.toString(), "3550");
  });
});

describe("permissions", () => {
  test("only Finance and Admin can change the exchange rate", () => {
    assert.equal(can("FINANCE", "fx.manage"), true);
    assert.equal(can("ADMIN", "fx.manage"), true);
    assert.equal(can("MANAGER", "fx.manage"), false);
    assert.equal(can("CUSTOMER_SUPPORT", "fx.manage"), false);
    assert.equal(can("CHINA_WAREHOUSE", "fx.manage"), false);
    assert.equal(can("DAR_WAREHOUSE", "fx.manage"), false);
    assert.equal(can("CUSTOMER", "fx.manage"), false);
  });

  test("warehouses never see pricing; support cannot verify money", () => {
    assert.equal(can("CHINA_WAREHOUSE", "finance.view"), false);
    assert.equal(can("DAR_WAREHOUSE", "rate.manage"), false);
    assert.equal(can("CUSTOMER_SUPPORT", "payment.verify"), false);
    assert.equal(can("CUSTOMER_SUPPORT", "rate.manage"), false);
  });
});
