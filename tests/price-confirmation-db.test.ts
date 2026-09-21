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
    new Prisma.Decimal(settings?.vatPercent ?? 0),
    settings?.pricesIncludeVat ?? true
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

/**
 * THE PER-CARGO PRICE DIALOG, AGAINST THE DATABASE.
 *
 * Four boxes go into it and any of them may be empty, which is the whole
 * difficulty: empty is not zero. A rate and a freight total both empty mean
 * "price this from the rate book again"; a rate typed beats a total typed; and
 * pressing Save twice with the same extra in the box must not charge it twice.
 */
describe("the price for one cargo, set from the row", () => {
  test("a typed rate beats a typed total, and the book's rate stays beside it", async () => {
    await inRollback(async (tx) => {
      await rateBook(tx);
      const me = await actor(tx);
      const { cargo } = await darCargo(tx, "ROW1", { cargoType: "TEST Shoes", cbm: "2" });

      const saved = await lib.setWaitingPrice(tx, me, {
        cargoId: cargo.id,
        basis: "PER_CBM",
        rate: new Prisma.Decimal(300),
        /* Typed as well, and deliberately ignored: the rate is the figure
           somebody agreed and the total is what falls out of it. */
        freight: new Prisma.Decimal(999),
        extra: null,
        discount: null,
        reason: "Agreed on the phone",
      });
      assert.equal(saved.total.toString(), (await withVat(tx, "600")).toString());

      const invoice = await tx.invoice.findFirstOrThrow({ where: { cargoId: cargo.id } });
      assert.equal(invoice.status, "DRAFT");
      assert.equal(invoice.appliedRate?.toString(), "300");
      assert.equal(invoice.standardRate?.toString(), "400", "the book's own rate is kept");
      assert.ok(lib.carriesAgreedRate(invoice), "and it reads as an agreement");

      const moved = await tx.fieldChange.findMany({
        where: { entity: "Invoice", entityId: invoice.id },
      });
      assert.ok(
        moved.some((f) => f.field === "appliedRate") && moved.some((f) => f.field === "total"),
        "the old rate and the old total are on the record first"
      );
    });
  });

  test("an extra and a discount are their own lines, and saving twice does not stack them", async () => {
    await inRollback(async (tx) => {
      await rateBook(tx);
      const me = await actor(tx);
      const { cargo } = await darCargo(tx, "ROW2", { cargoType: "TEST Shoes", cbm: "1" });

      const input = {
        cargoId: cargo.id,
        basis: "PER_CBM" as const,
        rate: new Prisma.Decimal(400),
        freight: null,
        extra: new Prisma.Decimal(50),
        discount: new Prisma.Decimal(20),
        reason: "Repacked, and a little off",
      };
      await lib.setWaitingPrice(tx, me, input);
      const second = await lib.setWaitingPrice(tx, me, input);

      assert.equal(second.total.toString(), (await withVat(tx, "430")).toString());
      const invoice = await tx.invoice.findFirstOrThrow({
        where: { cargoId: cargo.id },
        include: { items: true },
      });
      assert.equal(invoice.items.filter((i) => i.category === "Charge").length, 1);
      assert.equal(invoice.items.filter((i) => i.category === "Discount").length, 1);
      assert.equal(invoice.discount.toString(), "20");
    });
  });

  test("both boxes empty puts the row back on the rate book", async () => {
    await inRollback(async (tx) => {
      await rateBook(tx);
      const me = await actor(tx);
      const { cargo } = await darCargo(tx, "ROW3", { cargoType: "TEST Shoes", cbm: "1" });

      await lib.setWaitingPrice(tx, me, {
        cargoId: cargo.id,
        basis: "PER_CBM",
        rate: new Prisma.Decimal(120),
        freight: null,
        extra: null,
        discount: null,
        reason: "Agreed, then regretted",
      });
      const back = await lib.setWaitingPrice(tx, me, {
        cargoId: cargo.id,
        basis: "PER_CBM",
        rate: null,
        freight: null,
        extra: null,
        discount: null,
        reason: "Back to the published rate",
      });

      assert.equal(back.total.toString(), (await withVat(tx, "400")).toString());
      const invoice = await tx.invoice.findFirstOrThrow({ where: { cargoId: cargo.id } });
      assert.equal(invoice.appliedRate?.toString(), "400");
      assert.equal(
        lib.carriesAgreedRate(invoice),
        false,
        "and it no longer claims to be an agreement"
      );
    });
  });

  test("a freight total typed by hand clears the rate rather than claiming one", async () => {
    await inRollback(async (tx) => {
      await rateBook(tx);
      const me = await actor(tx);
      const { cargo } = await darCargo(tx, "ROW4", { cargoType: "TEST Shoes", cbm: "1" });

      const saved = await lib.setWaitingPrice(tx, me, {
        cargoId: cargo.id,
        basis: "PER_CBM",
        rate: null,
        freight: new Prisma.Decimal(275),
        extra: null,
        discount: null,
        reason: "One price for the lot",
      });
      assert.equal(saved.total.toString(), (await withVat(tx, "275")).toString());

      const invoice = await tx.invoice.findFirstOrThrow({ where: { cargoId: cargo.id } });
      assert.equal(invoice.appliedRate, null, "nobody derived this from a rate");
      assert.equal(invoice.rateBasis, "FLAT");
    });
  });

  test("a bill that has gone out still corrects, at its own pinned rate", async () => {
    await inRollback(async (tx) => {
      await rateBook(tx);
      const me = await actor(tx);
      const { cargo } = await darCargo(tx, "ROW5", { cargoType: "TEST Shoes", cbm: "1" });

      await lib.setWaitingPrice(tx, me, {
        cargoId: cargo.id,
        basis: "PER_CBM",
        rate: null,
        freight: null,
        extra: null,
        discount: null,
        reason: "From the book",
      });
      await tx.invoice.updateMany({
        where: { cargoId: cargo.id },
        data: {
          status: "ISSUED",
          issuedAt: new Date(),
          fxRate: new Prisma.Decimal(2700),
          totalTzs: new Prisma.Decimal(1_080_000),
        },
      });

      const before = await tx.invoice.findFirstOrThrow({ where: { cargoId: cargo.id } });
      const corrected = await lib.setWaitingPrice(tx, me, {
        cargoId: cargo.id,
        basis: "PER_CBM",
        rate: new Prisma.Decimal(350),
        freight: null,
        extra: null,
        discount: new Prisma.Decimal(50),
        reason: "Agreed with the customer after the bill went out",
      });
      assert.equal(corrected.issued, true);
      assert.equal(corrected.total.toString(), (await withVat(tx, "300")).toString());

      const after = await tx.invoice.findFirstOrThrow({ where: { cargoId: cargo.id } });
      assert.equal(after.status, "ISSUED", "it is still the same bill");
      assert.equal(after.appliedRate?.toString(), "350");
      assert.equal(
        after.fxRate?.toString(),
        "2700",
        "the rate it was agreed at is never re-read"
      );
      assert.equal(
        after.totalTzs?.toString(),
        corrected.total.mul(2700).toString(),
        "the shillings are re-struck at that same pinned rate"
      );
      assert.ok(
        await tx.fieldChange.count({
          where: { entityId: after.id, field: "total", newValue: after.total.toString() },
        }),
        "the old total is on the record"
      );
      assert.notEqual(before.total.toString(), after.total.toString());
    });
  });

  test("money on the bill closes the door", async () => {
    await inRollback(async (tx) => {
      await rateBook(tx);
      const me = await actor(tx);
      const { cargo, customer } = await darCargo(tx, "ROW6", {
        cargoType: "TEST Shoes",
        cbm: "1",
      });

      await lib.setWaitingPrice(tx, me, {
        cargoId: cargo.id,
        basis: "PER_CBM",
        rate: null,
        freight: null,
        extra: null,
        discount: null,
        reason: "From the book",
      });
      const invoice = await tx.invoice.findFirstOrThrow({ where: { cargoId: cargo.id } });
      await tx.invoice.update({
        where: { id: invoice.id },
        data: { status: "ISSUED", issuedAt: new Date() },
      });
      await tx.payment.create({
        data: {
          reference: `TEST-PAY-${cargo.id.slice(-6)}`,
          invoiceId: invoice.id,
          customerId: customer.id,
          amount: new Prisma.Decimal(100),
          currency: "USD",
          method: "CASH",
          status: "VERIFIED",
        },
      });

      await assert.rejects(
        () =>
          lib.setWaitingPrice(tx, me, {
            cargoId: cargo.id,
            basis: "PER_CBM",
            rate: new Prisma.Decimal(100),
            freight: null,
            extra: null,
            discount: null,
            reason: "Second thoughts",
          }),
        (error: unknown) =>
          error instanceof lib.PriceListRefused &&
          /Money has already been taken/.test(error.message)
      );
    });
  });

  test("an issued bill moves without a reason, and the change is recorded", async () => {
    await inRollback(async (tx) => {
      await rateBook(tx);
      const me = await actor(tx);
      const { cargo } = await darCargo(tx, "ROW7", { cargoType: "TEST Shoes", cbm: "1" });

      await lib.setWaitingPrice(tx, me, {
        cargoId: cargo.id,
        basis: "PER_CBM",
        rate: null,
        freight: null,
        extra: null,
        discount: null,
        reason: "From the book",
      });
      await tx.invoice.updateMany({
        where: { cargoId: cargo.id },
        data: { status: "ISSUED", issuedAt: new Date() },
      });

      /* The owner's decision: an issued bill moves without a typed reason.
         The change itself is still recorded, with who made it. */
      await lib.setWaitingPrice(tx, me, {
        cargoId: cargo.id,
        basis: "PER_CBM",
        rate: new Prisma.Decimal(100),
        freight: null,
        extra: null,
        discount: null,
        reason: "",
      });
      const after = await tx.invoice.findFirstOrThrow({ where: { cargoId: cargo.id } });
      assert.equal(after.appliedRate?.toString(), "100");
    });
  });
});
