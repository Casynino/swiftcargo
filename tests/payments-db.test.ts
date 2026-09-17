import assert from "node:assert/strict";
import { after, describe, test } from "node:test";

import { Prisma, PrismaClient } from "@prisma/client";

/**
 * Against the real database, inside a transaction that is always rolled back,
 * so nothing written here survives the test.
 */
const prisma = new PrismaClient();
const ROLLBACK = new Error("rollback");

async function inRollback(fn: (tx: Prisma.TransactionClient) => Promise<void>) {
  try {
    await prisma.$transaction(async (tx) => {
      await fn(tx);
      throw ROLLBACK;
    });
  } catch (error) {
    if (error !== ROLLBACK) throw error;
  }
}

after(() => prisma.$disconnect());

describe("database guarantees", () => {
  test("the live rate is 2,700 and comes from the database", async () => {
    const live = await prisma.exchangeRate.findFirst({
      where: { fromCurrency: "USD", toCurrency: "TZS", active: true },
      orderBy: { effectiveFrom: "desc" },
    });
    assert.ok(live, "an active USD → TZS rate exists");
    assert.equal(live.rate.toString(), "2700");
  });

  test("the same payment cannot be recorded twice", async () => {
    const invoice = await prisma.invoice.findFirst({ where: { status: { not: "DRAFT" } } });
    assert.ok(invoice, "needs one issued invoice in the database");
    await inRollback(async (tx) => {
      const data = {
        invoiceId: invoice.id,
        customerId: invoice.customerId,
        amount: new Prisma.Decimal(1000),
        currency: "TZS",
        baseCurrencyAmount: new Prisma.Decimal(1000),
        method: "CASH" as const,
        status: "PENDING" as const,
        idempotencyKey: "test-double-submit",
      };
      await tx.payment.create({ data: { ...data, reference: "TEST-DUP-1" } });
      await assert.rejects(
        tx.payment.create({ data: { ...data, reference: "TEST-DUP-2" } }),
        (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002"
      );
    });
  });

  test("publishing a new rate does not touch an issued invoice", async () => {
    const invoice = await prisma.invoice.findFirst({
      where: { status: { not: "DRAFT" }, fxRate: { not: null } },
    });
    assert.ok(invoice);
    await inRollback(async (tx) => {
      await tx.exchangeRate.updateMany({ where: { active: true }, data: { active: false, effectiveTo: new Date() } });
      await tx.exchangeRate.create({ data: { rate: new Prisma.Decimal(2800), notes: "test" } });
      const after = await tx.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
      assert.equal(after.fxRate!.toString(), invoice.fxRate!.toString());
      assert.equal(after.totalTzs!.toString(), invoice.totalTzs!.toString());
    });
  });
});
