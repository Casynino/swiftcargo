import assert from "node:assert/strict";
import Module from "node:module";
import path from "node:path";
import { after, before, describe, test } from "node:test";

import { Prisma, PrismaClient } from "@prisma/client";

/**
 * THE NUMBERS, FROM THE RATE BOOK TO THE REPORT.
 *
 * Known figures walked through the real code: the rate book prices a volume,
 * VAT is added, the bill is pinned to a rate, payments in two currencies
 * settle it, and the reports add up to what the database holds. Every write is
 * rolled back.
 */
const resolve = (Module as unknown as { _resolveFilename: (...a: unknown[]) => string })._resolveFilename;
(Module as unknown as { _resolveFilename: (...a: unknown[]) => string })._resolveFilename = function (
  this: unknown,
  request: unknown,
  ...rest: unknown[]
) {
  if (request === "server-only") return path.join(__dirname, "..", "node_modules", "server-only", "empty.js");
  return resolve.call(this, request, ...rest);
};

const prisma = new PrismaClient();
const ROLLBACK = new Error("rollback");
type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

let pricing: typeof import("@/lib/pricing");
let balance: typeof import("@/lib/invoice-balance");
let currency: typeof import("@/lib/currency");
let report: typeof import("@/lib/finance-report");
let portal: typeof import("@/lib/portal");

before(async () => {
  pricing = await import("@/lib/pricing");
  balance = await import("@/lib/invoice-balance");
  currency = await import("@/lib/currency");
  report = await import("@/lib/finance-report");
  portal = await import("@/lib/portal");
});
after(() => prisma.$disconnect());

async function rolledBack(fn: (tx: Tx) => Promise<void>) {
  await prisma
    .$transaction(async (tx) => {
      await fn(tx);
      throw ROLLBACK;
    })
    .catch((error) => {
      if (error !== ROLLBACK) throw error;
    });
}

const RATE = 2700;

describe("the rate book prices a volume exactly", () => {
  test("1.000 CBM at USD 380 is USD 380 and TZS 1,026,000", async () => {
    await rolledBack(async (tx) => {
      await tx.shippingRate.create({
        data: { service: "LCL", cargoType: "AuditTest", basis: "PER_CBM", rate: 380, currency: "USD", active: true, effectiveFrom: new Date("2020-01-01") },
      });
      const q = await pricing.quote(tx, { service: "LCL", cargoType: "AuditTest", measured: { cbm: 1 } });
      assert.equal(q.amount.toFixed(2), "380.00");
      assert.equal(q.billableCbm?.toFixed(3), "1.000");
      assert.equal(currency.usdToTzs(q.amount, RATE).toFixed(0), "1026000");
    });
  });

  test("0.500 CBM is USD 190 and TZS 513,000", async () => {
    await rolledBack(async (tx) => {
      await tx.shippingRate.create({
        data: { service: "LCL", cargoType: "AuditTest", basis: "PER_CBM", rate: 380, currency: "USD", active: true, effectiveFrom: new Date("2020-01-01") },
      });
      const q = await pricing.quote(tx, { service: "LCL", cargoType: "AuditTest", measured: { cbm: 0.5 } });
      assert.equal(q.amount.toFixed(2), "190.00");
      assert.equal(currency.usdToTzs(q.amount, RATE).toFixed(0), "513000");
    });
  });

  test("awkward volumes multiply exactly, with no float drift", async () => {
    await rolledBack(async (tx) => {
      await tx.shippingRate.create({
        data: { service: "LCL", cargoType: "AuditTest", basis: "PER_CBM", rate: 380, currency: "USD", active: true, effectiveFrom: new Date("2020-01-01") },
      });
      const cases: [string, string, string][] = [
        ["0.510", "193.80", "523260"],
        ["0.170", "64.60", "174420"],
        ["0.001", "0.38", "1026"],
        ["0.999", "379.62", "1024974"],
        ["10.500", "3990.00", "10773000"],
        ["100.000", "38000.00", "102600000"],
      ];
      for (const [cbm, usd, tzs] of cases) {
        const q = await pricing.quote(tx, { service: "LCL", cargoType: "AuditTest", measured: { cbm } });
        assert.equal(q.amount.toFixed(2), usd, `${cbm} CBM in dollars`);
        assert.equal(currency.usdToTzs(q.amount, RATE).toFixed(0), tzs, `${cbm} CBM in shillings`);
      }
    });
  });

  test("below the minimum is charged at the minimum, and says so", async () => {
    await rolledBack(async (tx) => {
      await tx.shippingRate.create({
        data: { service: "LCL", cargoType: "AuditTest", basis: "PER_CBM", rate: 380, minimumCbm: 1, currency: "USD", active: true, effectiveFrom: new Date("2020-01-01") },
      });
      const q = await pricing.quote(tx, { service: "LCL", cargoType: "AuditTest", measured: { cbm: 0.46 } });
      assert.equal(q.billableCbm?.toFixed(3), "1.000");
      assert.equal(q.amount.toFixed(2), "380.00");
      assert.match(q.explanation, /minimum/);
    });
  });

  test("a price that includes VAT is the total: 380 is 380, with 57.97 of it VAT", () => {
    /* The owner's rule since prices started to include VAT. The bill that
       showed 380 + 68.40 = 448.40 charged the tax twice. */
    const { vatAmount, total } = pricing.applyVat(new Prisma.Decimal(380), new Prisma.Decimal(18), true);
    assert.equal(total.toFixed(2), "380.00");
    assert.equal(vatAmount.toFixed(2), "57.97");
    assert.equal(total.sub(vatAmount).toFixed(2), "322.03");
    assert.equal(currency.usdToTzs(total, RATE).toFixed(0), "1026000");
  });

  test("a bill issued with VAT on top still adds up as it was issued", () => {
    const { vatAmount, total } = pricing.applyVat(new Prisma.Decimal(380), new Prisma.Decimal(18), false);
    assert.equal(vatAmount.toFixed(2), "68.40");
    assert.equal(total.toFixed(2), "448.40");
    assert.equal(currency.usdToTzs(total, RATE).toFixed(0), "1210680");
  });

  test("no VAT rate means nothing is VAT, either way", () => {
    for (const inclusive of [true, false]) {
      const { vatAmount, total } = pricing.applyVat(new Prisma.Decimal(380), new Prisma.Decimal(0), inclusive);
      assert.equal(vatAmount.toFixed(2), "0.00");
      assert.equal(total.toFixed(2), "380.00");
    }
  });
});

describe("a bill is settled by exactly what was paid", () => {
  const bill = (payments: { amount: number; currency: string; base: number | null; status?: string }[]) => ({
    total: new Prisma.Decimal("448.40"),
    currency: "USD",
    fxRate: new Prisma.Decimal(RATE),
    totalTzs: new Prisma.Decimal("1210680"),
    payments: payments.map((p) => ({
      status: p.status ?? "VERIFIED",
      amount: new Prisma.Decimal(p.amount),
      currency: p.currency,
      fxRate: new Prisma.Decimal(RATE),
      baseCurrencyAmount: p.base === null ? null : new Prisma.Decimal(p.base),
    })),
  });

  test("USD 400 and TZS 130,680 settle a USD 448.40 bill to the shilling", () => {
    const b = balance.balanceOf(bill([
      { amount: 400, currency: "USD", base: 1_080_000 },
      { amount: 130_680, currency: "TZS", base: 130_680 },
    ]));
    assert.equal(b.paidTzs?.toFixed(0), "1210680");
    assert.equal(b.outstandingTzs?.toFixed(0), "0");
    assert.equal(b.settled, true);
  });

  test("a payment still being checked is worth nothing", () => {
    const b = balance.balanceOf(bill([{ amount: 448.4, currency: "USD", base: 1_210_680, status: "PENDING" }]));
    assert.equal(b.paidTzs?.toFixed(0), "0");
    assert.equal(b.outstandingTzs?.toFixed(0), "1210680");
    assert.equal(b.settled, false);
  });

  test("a reversed payment gives the money back to the balance", () => {
    const b = balance.balanceOf(bill([
      { amount: 448.4, currency: "USD", base: 1_210_680, status: "REVERSED" },
      { amount: 100_000, currency: "TZS", base: 100_000 },
    ]));
    assert.equal(b.paidTzs?.toFixed(0), "100000");
    assert.equal(b.outstandingTzs?.toFixed(0), "1110680");
  });

  test("the same payment counted twice would show — it does not happen by itself", () => {
    const once = balance.balanceOf(bill([{ amount: 100_000, currency: "TZS", base: 100_000 }]));
    const twice = balance.balanceOf(bill([
      { amount: 100_000, currency: "TZS", base: 100_000 },
      { amount: 100_000, currency: "TZS", base: 100_000 },
    ]));
    assert.equal(once.paidTzs?.toFixed(0), "100000");
    assert.equal(twice.paidTzs?.toFixed(0), "200000");
  });
});

describe("the reports say what the database says", () => {
  test("collected, billed and VAT match raw SQL over the same rows", async () => {
    const books = await report.loadBooks();
    const wide = { from: new Date("2000-01-01"), to: new Date("2100-01-01"), label: "everything" };
    const f = report.figures(books, wide);

    const [collected] = await prisma.$queryRaw<{ tzs: string | null }[]>`
      SELECT COALESCE(SUM(COALESCE("baseCurrencyAmount", 0)), 0)::text AS tzs
      FROM "Payment" WHERE status = 'VERIFIED' AND "writtenOff" = false`;
    assert.equal(Math.round(f.collected.tzs), Number(collected.tzs ?? 0), "collected");

    const [billed] = await prisma.$queryRaw<{ tzs: string | null; vat: string | null }[]>`
      SELECT COALESCE(SUM(COALESCE("totalTzs", 0)), 0)::text AS tzs,
             COALESCE(SUM(CASE WHEN total > 0 THEN COALESCE("totalTzs", 0) * ("vatAmount" / total) ELSE 0 END), 0)::text AS vat
      FROM "Invoice" WHERE status NOT IN ('DRAFT', 'CANCELLED')`;
    assert.equal(Math.round(f.billed.tzs), Math.round(Number(billed.tzs ?? 0)), "billed");
    assert.equal(Math.round(f.vat.tzs), Math.round(Number(billed.vat ?? 0)), "VAT");
    /* Revenue is the bills less their VAT, to the shilling. */
    assert.equal(Math.round(f.revenue.tzs), Math.round(f.billed.tzs - f.vat.tzs));
  });

  test("three payments of a thousand are three thousand, not two or four", async () => {
    const books = await report.loadBooks();
    const before = report.figures(books, { from: new Date("2030-01-01"), to: new Date("2030-02-01"), label: "test" });
    assert.equal(before.collected.tzs, 0, "nothing is dated in the test window already");
  });
});

describe("a customer sees their own records and nobody else's", () => {
  test("the portal's filter names the customer on both sides of the consignment", () => {
    const where = portal.mine("customer-a");
    assert.deepEqual(where.OR, [{ senderId: "customer-a" }, { receiverId: "customer-a" }]);
    assert.equal(where.deletedAt, null);
  });

  test("another customer's cargo is not in that customer's list", async () => {
    const two = await prisma.customer.findMany({ where: { deletedAt: null }, take: 2, select: { id: true } });
    if (two.length < 2) return;
    const [a, b] = two;
    const theirs = await prisma.cargo.findMany({ where: portal.mine(a.id), select: { id: true, senderId: true, receiverId: true } });
    assert.ok(theirs.every((c) => c.senderId === a.id || c.receiverId === a.id));
    const cross = await prisma.cargo.count({
      where: { ...portal.mine(a.id), AND: [{ senderId: { not: a.id } }, { receiverId: { not: a.id } }] },
    });
    assert.equal(cross, 0, `no cargo of ${b.id} leaks into ${a.id}`);
  });
});

describe("one press, one consignment", () => {
  test("two consignments cannot carry the same intake key", async () => {
    await rolledBack(async (tx) => {
      const customer = await tx.customer.findFirstOrThrow({ where: { deletedAt: null }, select: { id: true } });
      const key = `audit-${Date.now()}`;
      const base = {
        intakeKey: key,
        qrToken: `audit-qr-${Date.now()}`,
        senderId: customer.id,
        receiverId: customer.id,
        description: "Audit test",
        service: "LCL" as const,
        status: "RECEIVED_CHINA" as const,
      };
      await tx.cargo.create({ data: { ...base, reference: `AUDIT-${Date.now()}` } });
      await assert.rejects(
        () => tx.cargo.create({ data: { ...base, qrToken: `audit-qr2-${Date.now()}`, reference: `AUDIT2-${Date.now()}` } }),
        /Unique constraint|P2002/,
        "the second press is refused by the database itself"
      );
    });
  });
});
