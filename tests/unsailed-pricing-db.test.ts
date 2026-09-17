import assert from "node:assert/strict";
import { after, describe, test } from "node:test";

import { Prisma, PrismaClient } from "@prisma/client";

import { unsailedToPrice } from "@/lib/unsailed-pricing";

/**
 * Against the real database, inside a transaction that is always rolled back.
 */
const prisma = new PrismaClient();
const ROLLBACK = new Error("rollback");

async function inRollback(fn: (tx: Prisma.TransactionClient) => Promise<void>) {
  try {
    await prisma.$transaction(
      async (tx) => {
        await fn(tx);
        throw ROLLBACK;
      },
      { timeout: 30_000 }
    );
  } catch (error) {
    if (error !== ROLLBACK) throw error;
  }
}

after(() => prisma.$disconnect());

async function darCargo(tx: Prisma.TransactionClient, tag: string) {
  const warehouse = await tx.warehouse.findFirst({ where: { kind: "TANZANIA" } });
  assert.ok(warehouse, "needs a Dar warehouse");
  const customer = await tx.customer.create({
    data: { code: `TEST-${tag}`, fullName: `Test ${tag}`, phone: `+2550000${tag}` },
  });
  const cargo = await tx.cargo.create({
    data: {
      reference: `TEST-${tag}`,
      qrToken: `TEST-QR-${tag}`,
      senderId: customer.id,
      receiverId: customer.id,
      description: "Test goods",
      status: "RECEIVED_DAR",
    },
  });
  await tx.darReceiving.create({
    data: {
      cargoId: cargo.id,
      warehouseId: warehouse.id,
      packagesCount: 1,
      cbm: new Prisma.Decimal("0.5"),
      verified: true,
      verifiedAt: new Date(),
    },
  });
  return { cargo, customer };
}

const listed = async (tx: Prisma.TransactionClient, id: string) =>
  (await unsailedToPrice(tx)).some((row) => row.id === id);

describe("cargo in Dar with no container, waiting for a price", () => {
  test("listed until a bill is issued, drafts included", async () => {
    await inRollback(async (tx) => {
      const { cargo, customer } = await darCargo(tx, "UNSAILED1");
      assert.ok(await listed(tx, cargo.id), "counted at Dar and unbilled");

      const invoice = await tx.invoice.create({
        data: {
          number: "TEST-INV-UNSAILED1",
          customerId: customer.id,
          cargoId: cargo.id,
          status: "DRAFT",
        },
      });
      assert.ok(await listed(tx, cargo.id), "a draft is still Finance's to confirm");

      await tx.invoice.update({ where: { id: invoice.id }, data: { status: "ISSUED" } });
      assert.ok(!(await listed(tx, cargo.id)), "an issued bill takes it off the list");
    });
  });

  test("cargo on a container is priced on the container, not here", async () => {
    await inRollback(async (tx) => {
      const { cargo } = await darCargo(tx, "UNSAILED2");
      const container = await tx.container.create({
        data: { reference: "TEST-BOX-UNSAILED2", status: "ARRIVED" },
      });
      await tx.containerCargo.create({
        data: { containerId: container.id, cargoId: cargo.id },
      });
      assert.ok(!(await listed(tx, cargo.id)));
    });
  });

  test("nothing Dar has not counted", async () => {
    await inRollback(async (tx) => {
      const { cargo } = await darCargo(tx, "UNSAILED3");
      await tx.darReceiving.delete({ where: { cargoId: cargo.id } });
      assert.ok(!(await listed(tx, cargo.id)));
    });
  });
});
