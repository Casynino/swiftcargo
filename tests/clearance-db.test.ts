import assert from "node:assert/strict";
import Module from "node:module";
import path from "node:path";
import { after, before, describe, test } from "node:test";

import { Prisma, PrismaClient } from "@prisma/client";

/**
 * Arrived ≠ cleared ≠ ready, against the real database, always rolled back.
 *
 * The rule under test is the customer's: nobody is told to come for goods
 * still in customs, a payment never makes boxes in clearance ready, and the
 * ready message is sent exactly once, by whichever event completes it.
 */
const resolve = (Module as unknown as { _resolveFilename: (...args: unknown[]) => string })
  ._resolveFilename;
(Module as unknown as { _resolveFilename: (...args: unknown[]) => string })._resolveFilename =
  function (this: unknown, request: unknown, ...rest: unknown[]) {
    if (request === "server-only") {
      return path.join(__dirname, "..", "node_modules", "server-only", "empty.js");
    }
    return resolve.call(this, request, ...rest);
  };

const prisma = new PrismaClient();
const ROLLBACK = new Error("rollback");

let clearance: typeof import("@/lib/clearance");
let release: typeof import("@/lib/release");

before(async () => {
  clearance = await import("@/lib/clearance");
  release = await import("@/lib/release");
});
after(() => prisma.$disconnect());

async function inRollback(fn: (tx: Prisma.TransactionClient) => Promise<void>) {
  try {
    await prisma.$transaction(
      async (tx) => {
        await fn(tx);
        throw ROLLBACK;
      },
      { timeout: 60_000 }
    );
  } catch (error) {
    if (error !== ROLLBACK) throw error;
  }
}

async function darDesk(tx: Prisma.TransactionClient) {
  const user = await tx.user.findFirstOrThrow({ where: { role: "DAR_WAREHOUSE" } });
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    department: user.department,
    warehouseId: user.warehouseId,
    customerId: null,
  };
}

let seq = 0;
const tag = () => `CLR${Date.now().toString(36)}${seq++}`;

/** Booked in at Dar and signed off; billed, and paid in full when asked. */
async function atDar(
  tx: Prisma.TransactionClient,
  paid: boolean,
  booked = true,
  unbookedStatus: "IN_TRANSIT" | "ARRIVED_TANZANIA" = "IN_TRANSIT"
) {
  const mark = tag();
  const customer = await tx.customer.create({
    data: { code: `T-${mark}`, fullName: `Test ${mark}`, phone: `+2557${String(Date.now()).slice(-6)}${seq % 100}`.slice(0, 13) },
  });
  const cargo = await tx.cargo.create({
    data: {
      reference: `T-${mark}`,
      qrToken: `T-QR-${mark}`,
      senderId: customer.id,
      receiverId: customer.id,
      description: "Test goods",
      status: booked ? "RECEIVED_DAR" : unbookedStatus,
    },
  });
  if (booked) {
    const warehouse = await tx.warehouse.findFirstOrThrow({ where: { kind: "TANZANIA" } });
    await tx.darReceiving.create({
      data: {
        cargoId: cargo.id,
        warehouseId: warehouse.id,
        packagesCount: 2,
        cbm: new Prisma.Decimal("0.5"),
        condition: "GOOD",
        verified: true,
        verifiedAt: new Date(),
      },
    });
  }
  const invoice = await tx.invoice.create({
    data: {
      number: `T-INV-${mark}`,
      customerId: customer.id,
      cargoId: cargo.id,
      status: paid ? "PAID" : "ISSUED",
      issuedAt: new Date(),
      subtotal: new Prisma.Decimal("100"),
      total: new Prisma.Decimal("100"),
      currency: "USD",
      fxRate: new Prisma.Decimal("2700"),
      totalTzs: new Prisma.Decimal("270000"),
    },
  });
  if (paid) {
    await tx.payment.create({
      data: {
        reference: `T-PAY-${mark}`,
        invoiceId: invoice.id,
        customerId: customer.id,
        amount: new Prisma.Decimal("100"),
        currency: "USD",
        fxRate: new Prisma.Decimal("2700"),
        baseCurrencyAmount: new Prisma.Decimal("270000"),
        status: "VERIFIED",
        verifiedAt: new Date(),
      },
    });
    await tx.pickupNote.create({
      data: {
        noteNumber: `T-PN-${mark}`,
        cargoId: cargo.id,
        customerId: customer.id,
        amountPaid: new Prisma.Decimal("100"),
        status: "ACTIVE",
      },
    });
  }
  return { cargo, customer };
}

const kinds = async (tx: Prisma.TransactionClient, customerId: string) =>
  (await tx.notification.findMany({ where: { customerId }, orderBy: { createdAt: "asc" } })).map(
    (n) => n.kind
  );

describe("arrived is not cleared, and cleared is not ready", () => {
  test("paid in full and in clearance may not be released or announced", async () => {
    await inRollback(async (tx) => {
      const { cargo, customer } = await atDar(tx, true);
      const row = await tx.cargo.findUniqueOrThrow({ where: { id: cargo.id }, include: release.RELEASE_INCLUDE });
      assert.equal(release.checkRelease(row).ok, false);
      assert.equal(await clearance.announceIfReady(tx, cargo.id, null), false);
      assert.deepEqual(await kinds(tx, customer.id), []);
    });
  });

  test("clearing paid goods makes them ready and says so exactly once", async () => {
    await inRollback(async (tx) => {
      const me = await darDesk(tx);
      const { cargo, customer } = await atDar(tx, true);
      const result = await clearance.clearCargo(tx, [cargo.id], me);
      assert.deepEqual(result.cleared, [cargo.reference]);

      const after = await tx.cargo.findUniqueOrThrow({ where: { id: cargo.id } });
      assert.equal(after.status, "READY_FOR_RELEASE");
      assert.ok(after.clearedAt);
      assert.equal(after.clearedById, me.id);
      assert.deepEqual(await kinds(tx, customer.id), ["cargo.ready"]);

      /* A payment verified later, or a second press, says nothing more. */
      assert.equal(await clearance.announceIfReady(tx, cargo.id, me), false);
      const again = await clearance.clearCargo(tx, [cargo.id], me);
      assert.deepEqual(again.cleared, []);
      assert.deepEqual(await kinds(tx, customer.id), ["cargo.ready"]);

      const audit = await tx.fieldChange.findFirst({ where: { entityId: cargo.id, field: "clearance" } });
      assert.equal(audit?.newValue, "Cleared");
    });
  });

  test("cleared with money owing says payment is required, and is not ready", async () => {
    await inRollback(async (tx) => {
      const me = await darDesk(tx);
      const { cargo, customer } = await atDar(tx, false);
      await clearance.clearCargo(tx, [cargo.id], me);
      const after = await tx.cargo.findUniqueOrThrow({ where: { id: cargo.id } });
      assert.equal(after.status, "RECEIVED_DAR");
      const notes = await tx.notification.findMany({ where: { customerId: customer.id } });
      assert.equal(notes.length, 1);
      assert.equal(notes[0].kind, "cargo.cleared");
      assert.match(notes[0].body ?? "", /Payment is still required/);
    });
  });

  test("cleared at the port, then ready the moment our warehouse books it in", async () => {
    await inRollback(async (tx) => {
      const me = await darDesk(tx);
      const { cargo, customer } = await atDar(tx, true, false, "ARRIVED_TANZANIA");
      const result = await clearance.clearCargo(tx, [cargo.id], me);
      assert.deepEqual(result.cleared, [cargo.reference], "customs clears it at the port");
      assert.equal((await tx.cargo.findUniqueOrThrow({ where: { id: cargo.id } })).status, "ARRIVED_TANZANIA");
      const first = await tx.notification.findMany({ where: { customerId: customer.id } });
      assert.equal(first.length, 1);
      assert.equal(first[0].kind, "cargo.cleared");
      assert.match(first[0].body ?? "", /brought to our Dar warehouse/);

      const warehouse = await tx.warehouse.findFirstOrThrow({ where: { kind: "TANZANIA" } });
      await tx.darReceiving.create({
        data: { cargoId: cargo.id, warehouseId: warehouse.id, packagesCount: 2, condition: "GOOD", verified: true, verifiedAt: new Date() },
      });
      await tx.cargo.update({ where: { id: cargo.id }, data: { status: "RECEIVED_DAR" } });
      await clearance.announceDarArrival(tx, cargo, { arrivedAt: new Date(), actorId: me.id });
      assert.equal((await tx.cargo.findUniqueOrThrow({ where: { id: cargo.id } })).status, "READY_FOR_RELEASE");
      assert.deepEqual(await kinds(tx, customer.id), ["cargo.cleared", "cargo.ready"]);
    });
  });

  test("goods still at sea cannot be cleared", async () => {
    await inRollback(async (tx) => {
      const me = await darDesk(tx);
      const { cargo } = await atDar(tx, true, false);
      const result = await clearance.clearCargo(tx, [cargo.id], me);
      assert.deepEqual(result.cleared, []);
      assert.deepEqual(result.skipped, [cargo.reference]);
    });
  });
});
