import assert from "node:assert/strict";
import { after, describe, test } from "node:test";

import { Prisma, PrismaClient } from "@prisma/client";

/**
 * What the database itself refuses, whatever the code in front of it does.
 * Against the real database, inside a transaction that is always rolled back.
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

const refusedByForeignKey = (e: unknown) =>
  e instanceof Prisma.PrismaClientKnownRequestError && (e.code === "P2003" || e.code === "P2014");

after(() => prisma.$disconnect());

describe("evidence outlives a mistaken hard delete", () => {
  test("a consignment with a timeline cannot be deleted out from under it", async () => {
    const cargo = await prisma.cargo.findFirst({
      where: { history: { some: {} }, invoices: { none: {} } },
      select: { id: true },
    });
    assert.ok(cargo, "needs one uninvoiced consignment with history");
    await inRollback(async (tx) => {
      await assert.rejects(tx.cargo.delete({ where: { id: cargo.id } }), refusedByForeignKey);
    });
  });

  test("a container's expenses are not erased with the container", async () => {
    const expense = await prisma.containerExpense.findFirst({
      where: { containerId: { not: null } },
      select: { containerId: true },
    });
    if (!expense?.containerId) return;
    await inRollback(async (tx) => {
      await assert.rejects(
        tx.container.delete({ where: { id: expense.containerId! } }),
        refusedByForeignKey
      );
    });
  });

  test("the sailing a live bill names cannot be taken off the container", async () => {
    const invoice = await prisma.invoice.findFirst({
      where: { containerCargoId: { not: null } },
      select: { containerCargoId: true },
    });
    if (!invoice?.containerCargoId) return;
    await inRollback(async (tx) => {
      await assert.rejects(
        tx.containerCargo.delete({ where: { id: invoice.containerCargoId! } }),
        refusedByForeignKey
      );
    });
  });

  test("a bill cannot name a sailing line that does not exist", async () => {
    const invoice = await prisma.invoice.findFirst({ select: { id: true } });
    assert.ok(invoice);
    await inRollback(async (tx) => {
      await assert.rejects(
        tx.invoice.update({ where: { id: invoice.id }, data: { containerCargoId: "no-such-line" } }),
        refusedByForeignKey
      );
    });
  });
});
