import assert from "node:assert/strict";
import Module from "node:module";
import path from "node:path";
import { after, before, describe, test } from "node:test";

import { Prisma, PrismaClient } from "@prisma/client";

/**
 * ONE PHYSICAL BOX, ONE CODE — against the real database, rolled back.
 */
const resolve = (
  Module as unknown as { _resolveFilename: (...args: unknown[]) => string }
)._resolveFilename;
(
  Module as unknown as { _resolveFilename: (...args: unknown[]) => string }
)._resolveFilename = function (this: unknown, request: unknown, ...rest: unknown[]) {
  if (request === "server-only") {
    return path.join(__dirname, "..", "node_modules", "server-only", "empty.js");
  }
  return resolve.call(this, request, ...rest);
};

const prisma = new PrismaClient();
const ROLLBACK = new Error("rollback");
let boxes: typeof import("@/lib/boxes");

before(async () => {
  boxes = await import("@/lib/boxes");
});
after(() => prisma.$disconnect());

async function inRollback(fn: (tx: Prisma.TransactionClient) => Promise<void>) {
  try {
    await prisma.$transaction(async (tx) => {
      await fn(tx);
      throw ROLLBACK;
    }, { timeout: 60_000 });
  } catch (error) {
    if (error !== ROLLBACK) throw error;
  }
}

async function aLine(tx: Prisma.TransactionClient, quantity: number) {
  const stamp = `BX${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const customer = await tx.customer.create({
    data: { code: stamp, fullName: `Box ${stamp}`, phone: `+2557${Math.floor(Math.random() * 1e8)}` },
  });
  const cargo = await tx.cargo.create({
    data: {
      reference: stamp,
      qrToken: `SWQ${stamp}c`,
      senderId: customer.id,
      receiverId: customer.id,
      description: "Test",
    },
  });
  const pkg = await tx.cargoPackage.create({
    data: { cargoId: cargo.id, reference: `${stamp}-P1`, quantity, cbm: new Prisma.Decimal(1) },
  });
  return { cargo, pkg };
}

describe("a box for every carton", () => {
  test("seventy-four cartons are seventy-four codes, all different", async () => {
    await inRollback(async (tx) => {
      const { pkg } = await aLine(tx, 74);
      await boxes.syncBoxes(tx, pkg.id);
      const rows = await tx.cargoBox.findMany({ where: { packageId: pkg.id } });
      assert.equal(rows.length, 74);
      assert.equal(new Set(rows.map((r) => r.qrToken)).size, 74, "no two boxes share a code");
      assert.deepEqual(
        rows.map((r) => r.sequence).sort((a, b) => a - b),
        Array.from({ length: 74 }, (_, i) => i + 1),
        "numbered 1 to 74"
      );
      assert.ok(rows.every((r) => /^SWQ/.test(r.qrToken) && r.qrToken.length > 20));
    });
  });

  test("running it twice changes nothing", async () => {
    await inRollback(async (tx) => {
      const { pkg } = await aLine(tx, 3);
      await boxes.syncBoxes(tx, pkg.id);
      await boxes.syncBoxes(tx, pkg.id);
      assert.equal(await tx.cargoBox.count({ where: { packageId: pkg.id } }), 3);
    });
  });

  test("a count raised adds boxes numbered on; a count lowered voids, never deletes", async () => {
    await inRollback(async (tx) => {
      const { pkg } = await aLine(tx, 3);
      await boxes.syncBoxes(tx, pkg.id);
      await tx.cargoPackage.update({ where: { id: pkg.id }, data: { quantity: 5 } });
      await boxes.syncBoxes(tx, pkg.id);
      assert.equal(await tx.cargoBox.count({ where: { packageId: pkg.id, voidedAt: null } }), 5);

      await tx.cargoPackage.update({ where: { id: pkg.id }, data: { quantity: 2 } });
      await boxes.syncBoxes(tx, pkg.id);
      const all = await tx.cargoBox.findMany({ where: { packageId: pkg.id }, orderBy: { sequence: "asc" } });
      assert.equal(all.length, 5, "the rows are kept");
      assert.deepEqual(all.filter((b) => !b.voidedAt).map((b) => b.sequence), [1, 2]);

      /* Raised again, the voided numbers are not reused: a sticker already
         printed with "4" must never come to mean a different box. */
      await tx.cargoPackage.update({ where: { id: pkg.id }, data: { quantity: 3 } });
      await boxes.syncBoxes(tx, pkg.id);
      const live = await tx.cargoBox.findMany({ where: { packageId: pkg.id, voidedAt: null }, orderBy: { sequence: "asc" } });
      assert.deepEqual(live.map((b) => b.sequence), [1, 2, 6]);
    });
  });

  test("a box Dar has scanned is never voided", async () => {
    await inRollback(async (tx) => {
      const { pkg } = await aLine(tx, 2);
      await boxes.syncBoxes(tx, pkg.id);
      const second = await tx.cargoBox.findFirstOrThrow({ where: { packageId: pkg.id, sequence: 2 } });
      await tx.cargoBox.update({ where: { id: second.id }, data: { darReceivedAt: new Date() } });
      await tx.cargoPackage.update({ where: { id: pkg.id }, data: { quantity: 1 } });
      await boxes.syncBoxes(tx, pkg.id);
      const kept = await tx.cargoBox.findUniqueOrThrow({ where: { id: second.id } });
      assert.equal(kept.voidedAt, null);
    });
  });

  test("a line taken off voids all of its boxes", async () => {
    await inRollback(async (tx) => {
      const { pkg } = await aLine(tx, 4);
      await boxes.syncBoxes(tx, pkg.id);
      await tx.cargoPackage.update({ where: { id: pkg.id }, data: { deletedAt: new Date() } });
      await boxes.syncBoxes(tx, pkg.id);
      assert.equal(await tx.cargoBox.count({ where: { packageId: pkg.id, voidedAt: null } }), 0);
      assert.equal(await tx.cargoBox.count({ where: { packageId: pkg.id } }), 4);
    });
  });
});
