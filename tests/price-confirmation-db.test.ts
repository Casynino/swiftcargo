import assert from "node:assert/strict";
import Module from "node:module";
import path from "node:path";
import { after, before, describe, test } from "node:test";

import { Prisma, PrismaClient } from "@prisma/client";

/**
 * The one-press price confirmation, against the real database, inside a
 * transaction that is always rolled back.
 *
 * `server-only` refuses to load outside the Next server. The modules under test
 * are server code for that reason alone, so it is answered with an empty module
 * before they are loaded.
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

type Lib = typeof import("@/lib/price-confirmation");
type ListLib = typeof import("@/lib/price-list");
type Rbac = typeof import("@/lib/rbac");
type Pricing = typeof import("@/lib/pricing");
type Currency = typeof import("@/lib/currency");
let lib: Lib;
let listLib: ListLib;
let rbac: Rbac;
let pricing: Pricing;
let currency: Currency;

before(async () => {
  lib = await import("@/lib/price-confirmation");
  listLib = await import("@/lib/price-list");
  rbac = await import("@/lib/rbac");
  pricing = await import("@/lib/pricing");
  currency = await import("@/lib/currency");
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

async function actor(tx: Prisma.TransactionClient) {
  const user = await tx.user.findFirst({ where: { role: "FINANCE" } });
  assert.ok(user, "needs a Finance user");
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

/** A consignment Dar has counted, with one line and no container. */
async function darCargo(
  tx: Prisma.TransactionClient,
  tag: string,
  line: { cargoType: string | null; cbm: string }
) {
  const warehouse = await tx.warehouse.findFirst({ where: { kind: "TANZANIA" } });
  assert.ok(warehouse, "needs a Dar warehouse");
  const customer = await tx.customer.create({
    data: { code: `TEST-${tag}`, fullName: `Test ${tag}`, phone: `+2559900${tag.length}${tag}` },
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
  await tx.cargoPackage.create({
    data: {
      cargoId: cargo.id,
      reference: `TEST-${tag}-P1`,
      quantity: 2,
      cbm: new Prisma.Decimal(line.cbm),
      cargoType: line.cargoType,
    },
  });
  await tx.darReceiving.create({
    data: {
      cargoId: cargo.id,
      warehouseId: warehouse.id,
      packagesCount: 2,
      cbm: new Prisma.Decimal(line.cbm),
      verified: true,
      verifiedAt: new Date(),
    },
  });
  return { cargo, customer };
}

/** A clean rate book for the test: one banded type, and no general rate. */
async function rateBook(tx: Prisma.TransactionClient) {
  await tx.shippingRate.updateMany({
    where: { service: "LCL", cargoType: null, active: true },
    data: { active: false },
  });
  await tx.shippingRate.create({
    data: {
      service: "LCL",
      cargoType: "TEST Shoes",
      basis: "PER_CBM",
      rate: new Prisma.Decimal(400),
      effectiveFrom: new Date(Date.now() - 60_000),
    },
  });
}

async function withVat(tx: Prisma.TransactionClient, amount: string) {
  const settings = await pricing.companySettings(tx);
  return pricing.applyVat(
    new Prisma.Decimal(amount),
    new Prisma.Decimal(settings?.vatPercent ?? 0)
  ).total;
}

describe("confirming prices a list at a time", () => {
  test("Support, Finance, the Manager and the owner may confirm; the floors may not", () => {
    for (const role of ["CUSTOMER_SUPPORT", "FINANCE", "MANAGER", "ADMIN"] as const) {
      assert.ok(rbac.can(role, "invoice.priceConfirm"), role);
    }
    for (const role of ["CHINA_WAREHOUSE", "DAR_WAREHOUSE", "CUSTOMER"] as const) {
      assert.ok(!rbac.can(role, "invoice.priceConfirm"), role);
    }
  });

  test("untyped cargo is named, then priced the moment a type is picked on the row", async () => {
    await inRollback(async (tx) => {
      await rateBook(tx);
      const me = await actor(tx);
      const { cargo } = await darCargo(tx, "PL1", { cargoType: null, cbm: "0.5" });

      const first = await lib.priceWaitingCargo(tx, me, cargo.id, {
        reason: "test",
        keepAgreedRate: false,
      });
      assert.equal(first.kind, "blocked");
      assert.equal(await tx.invoice.count({ where: { cargoId: cargo.id } }), 0);

      const listed = await listLib.priceListFor({ id: cargo.id }, tx);
      assert.equal(listed.ready, 0);
      assert.ok(listed.rows[0].blockedReason, "the row says why");

      const picked = await lib.setWaitingCargoType(tx, me, {
        cargoId: cargo.id,
        cargoType: "TEST Shoes",
        allowedTypes: ["TEST Shoes"],
      });
      assert.equal(picked.changed, 1);
      assert.equal(picked.outcome.kind, "raised");

      const change = await tx.fieldChange.findFirstOrThrow({
        where: { entity: "CargoPackage", field: "cargoType", newValue: "TEST Shoes" },
        orderBy: { createdAt: "desc" },
      });
      assert.equal(change.oldValue, null, "old value kept");
      assert.equal(change.actorId, me.id);

      const draft = await tx.invoice.findFirstOrThrow({ where: { cargoId: cargo.id } });
      assert.equal(draft.status, "DRAFT");
      assert.equal(draft.appliedRate?.toString(), "400");
      assert.equal(draft.total.toString(), (await withVat(tx, "200")).toString());
      assert.match(draft.number, /^INV-/);

      const after = await listLib.priceListFor({ id: cargo.id }, tx);
      assert.equal(after.ready, 1);
      assert.equal(after.rows[0].invoiceNumber, draft.number);
    });
  });

  test("a type with no rate of its own takes the general rate", async () => {
    await inRollback(async (tx) => {
      await rateBook(tx);
      await tx.shippingRate.create({
        data: {
          service: "LCL",
          cargoType: null,
          basis: "PER_CBM",
          rate: new Prisma.Decimal(300),
          effectiveFrom: new Date(Date.now() - 1_000),
        },
      });
      const me = await actor(tx);
      const { cargo } = await darCargo(tx, "PL2", { cargoType: "TEST Unbanded", cbm: "1" });

      const outcome = await lib.priceWaitingCargo(tx, me, cargo.id, {
        reason: "test",
        keepAgreedRate: false,
      });
      assert.equal(outcome.kind, "raised");
      const draft = await tx.invoice.findFirstOrThrow({ where: { cargoId: cargo.id } });
      assert.equal(draft.appliedRate?.toString(), "300");
    });
  });

  test("one press issues at the pinned rate, keeps an agreed rate, and a blocked row blocks only itself", async () => {
    await inRollback(async (tx) => {
      await rateBook(tx);
      const me = await actor(tx);
      const good = await darCargo(tx, "PL3", { cargoType: "TEST Shoes", cbm: "1" });
      const stuck = await darCargo(tx, "PL4", { cargoType: null, cbm: "1" });

      const rated = await lib.setWaitingRate(tx, me, {
        cargoId: good.cargo.id,
        rate: new Prisma.Decimal(350),
      });
      assert.equal(rated.total.toString(), (await withVat(tx, "350")).toString());
      assert.ok(
        await tx.fieldChange.findFirst({
          where: { field: "appliedRate", oldValue: "400", newValue: "350", actorId: me.id },
        }),
        "the old rate is written first"
      );

      const ctx = await lib.confirmContext(7, tx);
      assert.ok(ctx, "a live exchange rate");

      const blocked = await lib.confirmCargoPrice(tx, me, stuck.cargo.id, ctx);
      assert.equal(blocked.kind, "blocked");
      assert.equal(await tx.invoice.count({ where: { cargoId: stuck.cargo.id } }), 0);

      const issued = await lib.confirmCargoPrice(tx, me, good.cargo.id, ctx);
      assert.equal(issued.kind, "issued");

      const bill = await tx.invoice.findFirstOrThrow({ where: { cargoId: good.cargo.id } });
      assert.equal(bill.status, "ISSUED");
      assert.equal(bill.appliedRate?.toString(), "350", "the agreed rate survives confirming");
      assert.equal(bill.standardRate?.toString(), "400");
      assert.equal(bill.exchangeRateId, ctx.fx.id, "the rate row is pinned");
      assert.equal(bill.fxRate?.toString(), ctx.fx.rate.toString());
      assert.equal(
        bill.totalTzs?.toString(),
        currency.usdToTzs(bill.total, ctx.fx.rate).toString()
      );
      assert.ok(bill.paymentSnapshot !== null, "accounts copied onto the bill");
      assert.equal(bill.issuedById, me.id);
      assert.ok(bill.issuedAt && bill.dueAt);
      assert.equal(
        await tx.notification.count({
          where: { customerId: good.customer.id, kind: "invoice.issued" },
        }),
        1,
        "the customer is told"
      );

      const again = await lib.confirmCargoPrice(tx, me, good.cargo.id, ctx);
      assert.equal(again.kind, "skipped", "a bill already out is not issued twice");

      await assert.rejects(
        lib.setWaitingCargoType(tx, me, {
          cargoId: good.cargo.id,
          cargoType: "TEST Shoes",
          allowedTypes: ["TEST Shoes"],
        }),
        lib.PriceListRefused
      );
    });
  });
});
