import assert from "node:assert/strict";
import Module from "node:module";
import path from "node:path";
import { after, before, describe, test } from "node:test";

import { Prisma, PrismaClient } from "@prisma/client";

/**
 * THE MONEY CHAIN, END TO END, AGAINST THE REAL DATABASE.
 *
 * Dar confirms a count → Finance confirms the price → a bill is issued once and
 * only once → money lands in two currencies → the balance comes out in whole
 * shillings → the pickup note follows the money both ways.
 *
 * Everything that can run inside a transaction is rolled back. The one test
 * that cannot — two presses of Confirm racing each other needs two real
 * transactions, and a rolled-back one commits nothing for the other to see —
 * cleans up after itself instead.
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

/**
 * THE TWO THINGS A SERVER ACTION NEEDS THAT A TEST HAS NOT GOT.
 *
 * A session, and Next's cache. Both are answered before any project file is
 * loaded, so an action can be called here exactly as a form calls it — and the
 * permission check is the real one out of lib/rbac.ts, so a refusal in this
 * file is the refusal the desk would be given.
 */
const nodeRequire = Module.createRequire(__filename);
let signedIn: { id: string; name: string; role: string } | null = null;

function preload(request: string, exports: Record<string, unknown>) {
  const filename = nodeRequire.resolve(request);
  nodeRequire.cache[filename] = {
    id: filename,
    filename,
    path: path.dirname(filename),
    loaded: true,
    exports,
    children: [],
    paths: [],
  } as unknown as NodeJS.Module;
}

const prisma = new PrismaClient();
const ROLLBACK = new Error("rollback");

type Confirm = typeof import("@/lib/price-confirmation");
type List = typeof import("@/lib/price-list");
type Balance = typeof import("@/lib/invoice-balance");
type Note = typeof import("@/lib/pickup-note");
type Rbac = typeof import("@/lib/rbac");
type PriceActions = typeof import("@/lib/actions/price-list");
type PaymentActions = typeof import("@/lib/actions/payments");
type InvoiceActions = typeof import("@/lib/actions/invoices");
let confirmLib: Confirm;
let listLib: List;
let balanceLib: Balance;
let noteLib: Note;
let rbac: Rbac;
let priceActions: PriceActions;
let invoiceActions: InvoiceActions;
let paymentActions: PaymentActions;

before(async () => {
  rbac = await import("@/lib/rbac");
  preload("next/cache", {
    revalidatePath: () => {},
    revalidateTag: () => {},
    unstable_cache: (fn: unknown) => fn,
  });
  preload("@/lib/session", {
    currentUser: async () => signedIn,
    requireUser: async () => signedIn,
    requireStaff: async () => signedIn,
    requirePermission: authorizeAs,
    authorize: authorizeAs,
    authorizeAny: async (permissions: string[]) => {
      if (!signedIn) throw new Error("Not signed in.");
      if (!permissions.some((p) => rbac.can(signedIn!.role as never, p as never))) {
        throw new Error("You do not have permission to do that.");
      }
      return signedIn;
    },
    authorizeCustomer: async () => {
      throw new Error("Not permitted.");
    },
    requireCustomer: async () => {
      throw new Error("Not permitted.");
    },
  });
  confirmLib = await import("@/lib/price-confirmation");
  listLib = await import("@/lib/price-list");
  balanceLib = await import("@/lib/invoice-balance");
  noteLib = await import("@/lib/pickup-note");
  priceActions = await import("@/lib/actions/price-list");
  paymentActions = await import("@/lib/actions/payments");
  invoiceActions = await import("@/lib/actions/invoices");
});

async function authorizeAs(permission: string) {
  if (!signedIn) throw new Error("Not signed in.");
  if (!rbac.isStaff(signedIn.role as never)) throw new Error("Not permitted.");
  if (!rbac.can(signedIn.role as never, permission as never)) {
    throw new Error("You do not have permission to do that.");
  }
  return signedIn;
}

/** A form as the browser posts it. */
function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.append(key, value);
  return data;
}

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

type Client = Prisma.TransactionClient | typeof prisma;

async function actor(tx: Client) {
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

/**
 * A consignment standing on the Dar floor, priced by the general rate.
 *
 * `confirmed` is the whole point of most of these tests: a receiving row means
 * the counting started, verified means the floor signed it off.
 */
async function landed(
  tx: Client,
  tag: string,
  options: { confirmed: boolean; discrepancy?: boolean; cbm?: string } = {
    confirmed: true,
  }
) {
  const warehouse = await tx.warehouse.findFirst({ where: { kind: "TANZANIA" } });
  assert.ok(warehouse, "needs a Dar warehouse");
  const customer = await tx.customer.create({
    data: {
      code: `FCT-${tag}`,
      fullName: `Finance chain ${tag}`,
      phone: `+25579000${tag}`,
    },
  });
  const cargo = await tx.cargo.create({
    data: {
      reference: `FCT-${tag}`,
      qrToken: `FCT-QR-${tag}`,
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
      packagesCount: 4,
      cbm: new Prisma.Decimal(options.cbm ?? "2"),
      discrepancy: options.discrepancy ?? false,
      verified: options.confirmed,
      verifiedAt: options.confirmed ? new Date() : null,
    },
  });
  return { cargo, customer };
}

/** Everything the fixture above wrote, taken back out in dependency order. */
async function unseed(cargoId: string, customerId: string) {
  const invoices = await prisma.invoice.findMany({
    where: { cargoId },
    select: { id: true },
  });
  const ids = invoices.map((i) => i.id);
  await prisma.receipt.deleteMany({ where: { invoiceId: { in: ids } } });
  await prisma.payment.deleteMany({ where: { invoiceId: { in: ids } } });
  await prisma.customerContact.deleteMany({ where: { invoiceId: { in: ids } } });
  await prisma.invoiceItem.deleteMany({ where: { invoiceId: { in: ids } } });
  await prisma.auditLog.deleteMany({ where: { entityId: { in: [...ids, cargoId] } } });
  await prisma.fieldChange.deleteMany({ where: { entityId: { in: [...ids, cargoId] } } });
  await prisma.invoice.deleteMany({ where: { cargoId } });
  await prisma.pickupNote.deleteMany({ where: { cargoId } });
  await prisma.notification.deleteMany({ where: { customerId } });
  await prisma.cargoStatusHistory.deleteMany({ where: { cargoId } });
  await prisma.darReceiving.deleteMany({ where: { cargoId } });
  await prisma.cargoPackage.deleteMany({ where: { cargoId } });
  await prisma.cargo.deleteMany({ where: { id: cargoId } });
  await prisma.customer.deleteMany({ where: { id: customerId } });
}

/**
 * A bill of USD 13.50 already in the customer's hands, at the live rate.
 *
 * Written rather than confirmed from the rate book: these tests are about what
 * the counter does with a bill, and a round figure the arithmetic can be
 * checked against by hand is worth more here than a figure derived from a rate
 * that may be re-published tomorrow.
 */
async function issuedBill(
  cargoId: string,
  customerId: string,
  actorId: string,
  rate: { id: string; rate: Prisma.Decimal }
) {
  const { nextInvoiceNumber } = await import("@/lib/ids");
  return prisma.$transaction(async (tx) =>
    tx.invoice.create({
      data: {
        /* From the Counter, inside this transaction, like every other number. */
        number: await nextInvoiceNumber(tx),
        customerId,
        cargoId,
        status: "ISSUED",
        issuedAt: new Date(),
        dueAt: new Date(Date.now() + 7 * 86_400_000),
        subtotal: new Prisma.Decimal("13.50"),
        total: new Prisma.Decimal("13.50"),
        currency: "USD",
        exchangeRateId: rate.id,
        fxRate: rate.rate,
        totalTzs: new Prisma.Decimal("36450"),
        issuedById: actorId,
      },
    })
  );
}

/** What the bill still owes, read back from the rows. */
async function owing(invoiceId: string) {
  return balanceLib.balanceOf(
    await prisma.invoice.findUniqueOrThrow({
      where: { id: invoiceId },
      include: { payments: true },
    })
  );
}

/** Holds every caller until `count` of them have arrived. */
function barrier(count: number) {
  let arrived = 0;
  let release!: () => void;
  const open = new Promise<void>((resolve) => {
    release = resolve;
  });
  return () => {
    arrived += 1;
    if (arrived >= count) release();
    return open;
  };
}

/** A bill of USD 13.50 at 1 USD = 2,700 TZS — TZS 36,450 to the shilling. */
function bill(payments: Parameters<Balance["balanceOf"]>[0]["payments"]) {
  return {
    total: new Prisma.Decimal("13.50"),
    currency: "USD",
    fxRate: new Prisma.Decimal("2700"),
    totalTzs: new Prisma.Decimal("36450"),
    payments,
  };
}

const paid = (
  amount: string,
  currency: "USD" | "TZS",
  baseCurrencyAmount: string,
  status = "VERIFIED"
) => ({
  status,
  amount: new Prisma.Decimal(amount),
  currency,
  fxRate: new Prisma.Decimal("2700"),
  baseCurrencyAmount: new Prisma.Decimal(baseCurrencyAmount),
});

describe("Finance waits for nobody", () => {
  test("a count Dar has not signed off is still Finance's to issue", async () => {
    await inRollback(async (tx) => {
      const me = await actor(tx);
      const { cargo } = await landed(tx, "UNC", { confirmed: false });

      const ctx = await confirmLib.confirmContext(7, tx);
      assert.ok(ctx, "needs a published exchange rate");

      const outcome = await confirmLib.confirmCargoPrice(tx, me, cargo.id, ctx);
      assert.equal(outcome.kind, "issued");
    });
  });

  test("a count Dar flagged is priced on the figure Dar recorded, and says it is flagged", async () => {
    /* Eight cartons where the manifest promised ten. The floor has finished and
       said what it found; the shortage is a case of its own and the customer is
       still billed for what landed. Waiting for that case to close would leave
       every damaged bale unbillable for as long as the claim takes. */
    await inRollback(async (tx) => {
      const me = await actor(tx);
      const { cargo } = await landed(tx, "FLG", {
        confirmed: false,
        discrepancy: true,
      });

      const list = await listLib.priceListFor({ id: cargo.id }, tx);
      assert.equal(list.rows[0].darFlagged, true, "the row carries the flag");
      assert.equal(list.rows[0].darConfirmed, true, "and is Finance's to price");
      assert.equal(list.ready, 1);

      const ctx = await confirmLib.confirmContext(7, tx);
      assert.ok(ctx);
      const outcome = await confirmLib.confirmCargoPrice(tx, me, cargo.id, ctx);
      assert.equal(outcome.kind, "issued");
    });
  });

  test("an unsigned count is on the list with its figure, and in the press", async () => {
    await inRollback(async (tx) => {
      const { cargo } = await landed(tx, "ROW", { confirmed: false });
      const list = await listLib.priceListFor({ id: cargo.id }, tx);
      assert.equal(list.rows.length, 1);
      assert.ok(list.rows[0].totalLabel, "with the figure it comes to");
      assert.equal(list.rows[0].darWaiting, null);
      assert.equal(list.ready, 1);
    });
  });

  test("cargo measured in Guangzhou is priced before it sails", async () => {
    await inRollback(async (tx) => {
      const me = await actor(tx);
      const { cargo } = await landed(tx, "CHN", { confirmed: true });
      await tx.darReceiving.delete({ where: { cargoId: cargo.id } });
      await tx.cargo.update({ where: { id: cargo.id }, data: { status: "RECEIVED_CHINA" } });
      await tx.chinaReceiving.create({
        data: {
          cargoId: cargo.id,
          warehouseId: (await tx.warehouse.findFirstOrThrow({ where: { kind: "CHINA" } })).id,
          packagesCount: 4,
          cbm: new Prisma.Decimal("2"),
        },
      });
      const list = await listLib.priceListFor({ id: cargo.id }, tx);
      assert.equal(list.rows.length, 1, "on Finance's list from China's figures");
      const ctx = await confirmLib.confirmContext(7, tx);
      assert.ok(ctx);
      const outcome = await confirmLib.confirmCargoPrice(tx, me, cargo.id, ctx);
      assert.equal(outcome.kind, "issued");
    });
  });

  test("signed and unsigned counts are both priced", async () => {
    await inRollback(async (tx) => {
      const me = await actor(tx);
      const ready = await landed(tx, "OK1", { confirmed: true });
      const waiting = await landed(tx, "WT1", { confirmed: false });
      const ctx = await confirmLib.confirmContext(7, tx);
      assert.ok(ctx);

      const first = await confirmLib.confirmCargoPrice(tx, me, ready.cargo.id, ctx);
      const second = await confirmLib.confirmCargoPrice(tx, me, waiting.cargo.id, ctx);

      assert.equal(first.kind, "issued");
      assert.equal(second.kind, "issued", "an unsigned Dar count does not hold Finance up");
    });
  });

  test("confirming pins the rate row, the accounts and the person who pressed", async () => {
    await inRollback(async (tx) => {
      const me = await actor(tx);
      const { cargo } = await landed(tx, "PIN", { confirmed: true });
      const ctx = await confirmLib.confirmContext(7, tx);
      assert.ok(ctx);

      const outcome = await confirmLib.confirmCargoPrice(tx, me, cargo.id, ctx);
      assert.equal(outcome.kind, "issued");

      const invoice = await tx.invoice.findFirstOrThrow({ where: { cargoId: cargo.id } });
      assert.equal(invoice.exchangeRateId, ctx.fx.id, "the rate ROW, not just the figure");
      assert.equal(invoice.fxRate?.toString(), ctx.fx.rate.toString());
      assert.ok(invoice.paymentSnapshot, "the collection accounts as they stood");
      assert.equal(invoice.issuedById, me.id);
      assert.ok(invoice.issuedAt, "and when");
      assert.equal(
        invoice.totalTzs?.toString(),
        invoice.total.mul(ctx.fx.rate).toDecimalPlaces(0).toString()
      );
    });
  });
});

describe("a measurement goes back to the floor, not into Finance's hands", () => {
  /* Through the real server action, session and all: this one commits, so it
     clears up after itself like the race does. */
  test("the signature comes off, a case goes to Dar, and it returns priced", async () => {
    const me = await actor(prisma);
    const { cargo, customer } = await landed(prisma, "BACK", { confirmed: true });
    try {
      signedIn = { id: me.id, name: me.name ?? "Finance", role: "FINANCE" };
      const sent = await priceActions.queryCountWithDar(
        {},
        form({
          cargoId: cargo.id,
          kind: "CBM_DIFFERENCE",
          reason: "6 CBM for four cartons cannot be right",
        })
      );
      assert.ok(sent.ok, sent.error);

      const back = await prisma.darReceiving.findUniqueOrThrow({
        where: { cargoId: cargo.id },
      });
      assert.equal(back.verified, false, "Dar's signature is off");
      assert.equal(back.verifiedAt, null);
      assert.equal(back.discrepancy, false, "and the floor's own flag is untouched");

      const opened = await prisma.exceptionCase.findFirstOrThrow({
        where: { cargoId: cargo.id },
      });
      assert.equal(opened.department, "DAR_WAREHOUSE", "addressed to the floor");
      assert.equal(opened.type, "CBM_DIFFERENCE", "named for the figure to re-check");
      assert.equal(opened.status, "OPEN");

      const changed = await prisma.fieldChange.findFirstOrThrow({
        where: { entity: "DarReceiving", entityId: back.id, field: "verified" },
      });
      assert.equal(changed.oldValue, "true", "old value first");
      assert.equal(changed.actorId, me.id);


      /* Dar re-measures and signs it off; it comes back onto the list. */
      await prisma.darReceiving.update({
        where: { cargoId: cargo.id },
        data: { verified: true, verifiedAt: new Date() },
      });
      const returned = await listLib.priceListFor({ id: cargo.id });
      assert.equal(returned.ready, 1);
    } finally {
      signedIn = null;
      await prisma.exceptionEvent.deleteMany({
        where: { case: { cargoId: cargo.id } },
      });
      await prisma.exceptionCase.deleteMany({ where: { cargoId: cargo.id } });
      await unseed(cargo.id, customer.id);
    }
  });

  test("a bill already out is corrected on the bill, never by a re-measure", async () => {
    const me = await actor(prisma);
    const { cargo, customer } = await landed(prisma, "BILLD", { confirmed: true });
    try {
      const ctx = await confirmLib.confirmContext(7);
      assert.ok(ctx);
      await prisma.$transaction((tx) => confirmLib.confirmCargoPrice(tx, me, cargo.id, ctx), {
        timeout: 30_000,
      });

      signedIn = { id: me.id, name: me.name ?? "Finance", role: "FINANCE" };
      const refused = await priceActions.queryCountWithDar(
        {},
        form({ cargoId: cargo.id, kind: "CBM_DIFFERENCE", reason: "looks high" })
      );
      assert.ok(refused.error, "refused");
      assert.match(refused.error!, /already billed/);
      const still = await prisma.darReceiving.findUniqueOrThrow({
        where: { cargoId: cargo.id },
      });
      assert.equal(still.verified, true, "and nothing moved");
    } finally {
      signedIn = null;
      await unseed(cargo.id, customer.id);
    }
  });

  test("neither warehouse can send a measurement back — they have no price to read", async () => {
    const me = await actor(prisma);
    for (const role of ["DAR_WAREHOUSE", "CHINA_WAREHOUSE"] as const) {
      signedIn = { id: me.id, name: "floor", role };
      await assert.rejects(
        priceActions.queryCountWithDar(
          {},
          form({ cargoId: "whatever", kind: "OTHER", reason: "because" })
        ),
        /permission/
      );
    }
    signedIn = null;
  });
});

describe("one consignment, one bill", () => {
  /*
    TWO REAL TRANSACTIONS, BECAUSE THAT IS THE BUG.

    Confirming reads "has this cargo a bill yet?" and then writes one. Inside a
    single rolled-back transaction the two presses cannot race; they have to be
    two connections, and the loser has to see what the winner committed. So this
    one commits and clears up after itself.
  */
  test("two presses of Confirm in the same second raise one bill, not two", async () => {
    const me = await actor(prisma);
    const { cargo, customer } = await landed(prisma, "RACE", { confirmed: true });
    try {
      const ctx = await confirmLib.confirmContext(7);
      assert.ok(ctx, "needs a published exchange rate");

      /* Both transactions are open, and each has run a statement, before either
         is allowed to price. Without that, whichever one the pool hands a
         connection to first finishes before the other has begun and the race
         never happens — the test would pass against the very code it exists to
         catch. */
      const bothOpen = barrier(2);
      const press = () =>
        prisma.$transaction(
          async (tx) => {
            await tx.cargo.findFirst({ where: { id: cargo.id }, select: { id: true } });
            await bothOpen();
            return confirmLib.confirmCargoPrice(tx, me, cargo.id, ctx);
          },
          { timeout: 30_000 }
        );
      const outcomes = await Promise.all([press(), press()]);

      const invoices = await prisma.invoice.findMany({ where: { cargoId: cargo.id } });
      assert.equal(invoices.length, 1, "one consignment, one bill");
      assert.equal(invoices[0].status, "ISSUED");
      assert.equal(
        outcomes.filter((o) => o.kind === "issued").length,
        1,
        "and only one press claims to have issued it"
      );

      /* And a third press afterwards changes nothing: idempotent, not merely
         race-free. */
      const again = await press();
      assert.notEqual(again.kind, "issued");
      assert.equal(await prisma.invoice.count({ where: { cargoId: cargo.id } }), 1);
      assert.equal(
        await prisma.payment.count({ where: { invoiceId: invoices[0].id } }),
        0,
        "and confirming never creates a charge"
      );
    } finally {
      await unseed(cargo.id, customer.id);
    }
  });

  test("a consignment with no sailing has nowhere to hang a second bill either", async () => {
    await inRollback(async (tx) => {
      const me = await actor(tx);
      const { cargo } = await landed(tx, "ONE", { confirmed: true });

      await confirmLib.priceWaitingCargo(tx, me, cargo.id, {
        reason: "test",
        keepAgreedRate: true,
      });
      await confirmLib.priceWaitingCargo(tx, me, cargo.id, {
        reason: "test",
        keepAgreedRate: true,
      });

      assert.equal(await tx.invoice.count({ where: { cargoId: cargo.id } }), 1);
    });
  });

  /*
    AND THE DATABASE HOLDS IT WITHOUT THE APPLICATION'S HELP.

    The lock is the defence that gives the loser a sentence to read. This is the
    one that holds when nobody takes the lock — a script, a console, a caller
    written next year that does not know about it.
  */
  test("the database itself refuses a second live bill on an unsailed consignment", async () => {
    await inRollback(async (tx) => {
      const me = await actor(tx);
      const { cargo, customer } = await landed(tx, "IDX", { confirmed: true });
      const rate = await tx.exchangeRate.findFirstOrThrow({
        where: { active: true },
        orderBy: { effectiveFrom: "desc" },
      });
      const bill = (number: string, status: "ISSUED" | "CANCELLED") => ({
        number,
        customerId: customer.id,
        cargoId: cargo.id,
        status,
        total: new Prisma.Decimal("13.50"),
        currency: "USD",
        exchangeRateId: rate.id,
        fxRate: rate.rate,
        issuedById: me.id,
      });

      await tx.invoice.create({ data: bill(`FCT-IDX-1-${cargo.id.slice(-6)}`, "ISSUED") });
      await assert.rejects(
        tx.invoice.create({ data: bill(`FCT-IDX-2-${cargo.id.slice(-6)}`, "ISSUED") }),
        (error: unknown) =>
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002" &&
          /* Named, so this cannot pass one day because some other constraint
             happened to fire on the same row. */
          String((error.meta as { target?: string[] })?.target).includes("cargoId"),
        "a second live bill is refused by the index, not by the application"
      );
    });
  });

  test("a bill cancelled in error leaves the consignment billable again", async () => {
    await inRollback(async (tx) => {
      const me = await actor(tx);
      const { cargo, customer } = await landed(tx, "CANX", { confirmed: true });
      const rate = await tx.exchangeRate.findFirstOrThrow({
        where: { active: true },
        orderBy: { effectiveFrom: "desc" },
      });
      const bill = (number: string, status: "ISSUED" | "CANCELLED") => ({
        number,
        customerId: customer.id,
        cargoId: cargo.id,
        status,
        total: new Prisma.Decimal("13.50"),
        currency: "USD",
        exchangeRateId: rate.id,
        fxRate: rate.rate,
        issuedById: me.id,
      });

      /* Two cancelled bills and a live one: a bill raised in error is cancelled,
         never deleted, and none of that may stop the right bill being raised. */
      await tx.invoice.create({ data: bill(`FCT-CANX-1-${cargo.id.slice(-6)}`, "CANCELLED") });
      await tx.invoice.create({ data: bill(`FCT-CANX-2-${cargo.id.slice(-6)}`, "CANCELLED") });
      await tx.invoice.create({ data: bill(`FCT-CANX-3-${cargo.id.slice(-6)}`, "ISSUED") });
      assert.equal(await tx.invoice.count({ where: { cargoId: cargo.id } }), 3);
    });
  });
});

describe("a bill paid in two currencies", () => {
  test("USD 10 then TZS 9,500 against USD 13.50 settles it with TZS 50 in hand", () => {
    const balance = balanceLib.balanceOf(
      bill([paid("10", "USD", "27000"), paid("9500", "TZS", "9500")])
    );
    assert.equal(balance.totalTzs?.toString(), "36450");
    assert.equal(balance.paidTzs?.toString(), "36500");
    assert.equal(balance.outstandingTzs?.toString(), "0");
    assert.equal(balance.creditTzs?.toString(), "50", "overpayment is a credit, not a negative");
    assert.equal(balance.settled, true);
  });

  test("USD 10 then TZS 9,450 settles it to the shilling with nothing over", () => {
    const balance = balanceLib.balanceOf(
      bill([paid("10", "USD", "27000"), paid("9450", "TZS", "9450")])
    );
    assert.equal(balance.paidTzs?.toString(), "36450");
    assert.equal(balance.outstandingTzs?.toString(), "0");
    assert.equal(balance.creditTzs?.toString(), "0");
    assert.equal(balance.settled, true);
  });

  test("the dollars alone leave the shillings still owing", () => {
    const balance = balanceLib.balanceOf(bill([paid("10", "USD", "27000")]));
    assert.equal(balance.outstandingTzs?.toString(), "9450");
    assert.equal(balance.settled, false);
    assert.equal(
      balanceLib.impliedStatus({ ...bill([paid("10", "USD", "27000")]), status: "ISSUED" }),
      "PARTIALLY_PAID"
    );
  });

  test("a claim nobody has checked is worth nothing", () => {
    const balance = balanceLib.balanceOf(
      bill([paid("13.50", "USD", "36450", "PENDING")])
    );
    assert.equal(balance.paidTzs?.toString(), "0");
    assert.equal(balance.outstandingTzs?.toString(), "36450");
    assert.equal(balance.settled, false);
  });

  test("a payment taken back puts the balance back up", () => {
    const balance = balanceLib.balanceOf(
      bill([paid("10", "USD", "27000", "REVERSED"), paid("9450", "TZS", "9450")])
    );
    assert.equal(balance.paidTzs?.toString(), "9450");
    assert.equal(balance.outstandingTzs?.toString(), "27000");
    assert.equal(balance.settled, false);
  });

  test("a shortfall written off counts against the bill like money does", () => {
    const balance = balanceLib.balanceOf(
      bill([paid("13", "USD", "35100"), paid("1350", "TZS", "1350")])
    );
    assert.equal(balance.outstandingTzs?.toString(), "0");
    assert.equal(balance.settled, true);
  });

  test("two payments on one bill keep their own rate, and neither is re-valued", () => {
    /* The counter agreed 2,650 for the cash and the board said 2,700 for the
       transfer. Each is worth what it was taken at, and the bill is not
       restated at either. */
    const balance = balanceLib.balanceOf({
      total: new Prisma.Decimal("13.50"),
      currency: "USD",
      fxRate: new Prisma.Decimal("2700"),
      totalTzs: new Prisma.Decimal("36450"),
      payments: [
        {
          status: "VERIFIED",
          amount: new Prisma.Decimal("10"),
          currency: "USD",
          fxRate: new Prisma.Decimal("2650"),
          baseCurrencyAmount: new Prisma.Decimal("26500"),
        },
        paid("9950", "TZS", "9950"),
      ],
    });
    assert.equal(balance.paidTzs?.toString(), "36450");
    assert.equal(balance.totalTzs?.toString(), "36450", "the bill kept its own rate");
    assert.equal(balance.settled, true);
  });
});

describe("the note that lets somebody collect", () => {
  test("written when the last shilling lands, and only once", async () => {
    await inRollback(async (tx) => {
      const me = await actor(tx);
      const { cargo, customer } = await landed(tx, "NOTE", { confirmed: true });
      const ctx = await confirmLib.confirmContext(7, tx);
      assert.ok(ctx);
      await confirmLib.confirmCargoPrice(tx, me, cargo.id, ctx);
      const invoice = await tx.invoice.findFirstOrThrow({ where: { cargoId: cargo.id } });

      const none = await noteLib.issuePickupNoteIfSettled(tx, cargo.id, me.id);
      assert.equal(none, null, "nothing is written while the bill is owing");

      await tx.payment.create({
        data: {
          reference: `FCT-PAY-${cargo.id.slice(-6)}`,
          invoiceId: invoice.id,
          customerId: customer.id,
          amount: invoice.totalTzs!,
          currency: "TZS",
          fxRate: invoice.fxRate,
          baseCurrencyAmount: invoice.totalTzs!,
          method: "CASH",
          status: "VERIFIED",
          paidAt: new Date(),
        },
      });

      const note = await noteLib.issuePickupNoteIfSettled(tx, cargo.id, me.id);
      assert.ok(note, "written the moment the bill is settled");
      assert.equal(note.cargoId, cargo.id, "linked to the exact cargo");
      assert.equal(note.customerId, customer.id);
      assert.equal(note.status, "ACTIVE");
      assert.ok(note.qrToken, "and carries the code the counter scans");
      assert.match(note.noteNumber, /^PN-/);

      const twice = await noteLib.issuePickupNoteIfSettled(tx, cargo.id, me.id);
      assert.equal(twice, null, "a live note is never written over");
      assert.equal(await tx.pickupNote.count({ where: { cargoId: cargo.id } }), 1);
    });
  });

  test("withdrawn when the payment it rested on is taken back, with a new code after", async () => {
    await inRollback(async (tx) => {
      const me = await actor(tx);
      const { cargo, customer } = await landed(tx, "WDR", { confirmed: true });
      const ctx = await confirmLib.confirmContext(7, tx);
      assert.ok(ctx);
      await confirmLib.confirmCargoPrice(tx, me, cargo.id, ctx);
      const invoice = await tx.invoice.findFirstOrThrow({ where: { cargoId: cargo.id } });

      const payment = await tx.payment.create({
        data: {
          reference: `FCT-REV-${cargo.id.slice(-6)}`,
          invoiceId: invoice.id,
          customerId: customer.id,
          amount: invoice.totalTzs!,
          currency: "TZS",
          fxRate: invoice.fxRate,
          baseCurrencyAmount: invoice.totalTzs!,
          method: "CASH",
          status: "VERIFIED",
          paidAt: new Date(),
        },
      });
      const note = await noteLib.issuePickupNoteIfSettled(tx, cargo.id, me.id);
      assert.ok(note);

      await tx.payment.update({
        where: { id: payment.id },
        data: { status: "REVERSED", reversedAt: new Date(), reversedReason: "test" },
      });
      const withdrawn = await noteLib.withdrawPickupNoteIfOwing(tx, cargo.id, "test");
      assert.ok(withdrawn, "the permission goes with the money");
      assert.equal(withdrawn.noteNumber, note.noteNumber);

      const dead = await tx.pickupNote.findUniqueOrThrow({ where: { cargoId: cargo.id } });
      assert.equal(dead.status, "CANCELLED");

      /* Paid again: one consignment still has one live permission, and the
         printout somebody may be holding does not come back to life. */
      await tx.payment.update({
        where: { id: payment.id },
        data: { status: "VERIFIED", reversedAt: null, reversedReason: null },
      });
      const again = await noteLib.issuePickupNoteIfSettled(tx, cargo.id, me.id);
      assert.ok(again);
      assert.equal(await tx.pickupNote.count({ where: { cargoId: cargo.id } }), 1);
      assert.notEqual(again.qrToken, note.qrToken, "a withdrawn code is never revived");
    });
  });
});

/**
 * THE COUNTER, THROUGH THE REAL ACTIONS.
 *
 * A bill of USD 13.50 at 2,700 — TZS 36,450. Ten dollars in cash, then the rest
 * in shillings, which is how a Dar counter actually takes money: two payments,
 * two rows, two rates, one bill. This commits, and clears up afterwards.
 */
describe("one bill settled in two currencies, at the counter", () => {
  test("USD 10 then TZS 9,450: two rows, and the balance to the shilling", async () => {
    const me = await actor(prisma);
    const { cargo, customer } = await landed(prisma, "MIX", { confirmed: true });
    try {
      const rate = await prisma.exchangeRate.findFirstOrThrow({
        where: { fromCurrency: "USD", toCurrency: "TZS", active: true },
        orderBy: { effectiveFrom: "desc" },
      });
      const invoice = await issuedBill(cargo.id, customer.id, me.id, rate);
      const invoiceId = invoice.id;
      assert.equal(invoice.totalTzs?.toString(), "36450", "the bill in shillings");

      signedIn = { id: me.id, name: me.name ?? "Finance", role: "FINANCE" };

      const press = () =>
        paymentActions.recordPayment(
          {},
          form({
            invoiceId,
            amount: "10",
            currency: "USD",
            method: "CASH",
            idempotencyKey: `mix-usd-${invoiceId}`,
          })
        );
      const cash = await press();
      assert.ok(cash.ok, cash.error);
      /* The same press landing twice — a double click, a retry on a bad line. */
      assert.ok((await press()).ok, "a repeat press is accepted and changes nothing");
      assert.equal(
        await prisma.payment.count({ where: { invoiceId, currency: "USD" } }),
        1,
        "one row, not two"
      );

      const usd = await prisma.payment.findFirstOrThrow({
        where: { invoiceId, currency: "USD" },
      });
      /* Finance recording it is Finance confirming it — the owner's decision. */
      assert.equal(usd.status, "VERIFIED", "Finance's own recording counts at once");
      assert.equal(usd.fxRate?.toString(), rate.rate.toString(), "its own rate");
      assert.equal(usd.baseCurrencyAmount?.toString(), "27000", "and its own shillings");
      assert.equal(usd.method, "CASH");
      assert.equal(usd.recordedById, me.id, "and who took it");
      assert.ok(usd.paidAt, "and when");
      assert.match(usd.reference, /^PAY-/);
      assert.equal((await owing(invoiceId)).outstandingTzs?.toString(), "9450");
      const again = await paymentActions.verifyPayment({}, form({ paymentId: usd.id }));
      assert.ok(again.error, "and there is nothing left to verify");
      assert.equal(
        (await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } })).status,
        "PARTIALLY_PAID"
      );
      assert.ok(
        await prisma.receipt.findFirst({ where: { paymentId: usd.id } }),
        "and a receipt the customer can hold"
      );

      /* TZS 9,500 is fifty more than the bill has left. Refused until somebody
         says, on the record, that they meant it. */
      const over = await paymentActions.recordPayment(
        {},
        form({ invoiceId, amount: "9500", currency: "TZS", method: "MOBILE_MONEY" })
      );
      assert.ok(over.error, "overpayment refused");
      assert.match(over.error!, /more than/);
      assert.equal(
        await prisma.payment.count({ where: { invoiceId } }),
        1,
        "and nothing was written by the refusal"
      );

      const shillings = await paymentActions.recordPayment(
        {},
        form({
          invoiceId,
          amount: "9450",
          currency: "TZS",
          method: "MOBILE_MONEY",
          transactionRef: "MPESA-TEST-1",
          notes: "Second half, at the counter",
        })
      );
      assert.ok(shillings.ok, shillings.error);
      const tzs = await prisma.payment.findFirstOrThrow({
        where: { invoiceId, currency: "TZS" },
      });
      assert.equal(tzs.baseCurrencyAmount?.toString(), "9450");
      assert.equal(tzs.method, "MOBILE_MONEY");
      assert.equal(tzs.transactionRef, "MPESA-TEST-1");
      assert.equal(tzs.notes, "Second half, at the counter");
      assert.notEqual(tzs.id, usd.id, "its own row against the same bill");
      assert.equal(tzs.status, "VERIFIED");

      const done = await prisma.invoice.findUniqueOrThrow({
        where: { id: invoiceId },
        include: { payments: true },
      });
      const balance = balanceLib.balanceOf(done);
      assert.equal(balance.paidTzs?.toString(), "36450");
      assert.equal(balance.outstandingTzs?.toString(), "0");
      assert.equal(balance.creditTzs?.toString(), "0", "nothing over");
      assert.equal(done.status, "PAID");
      assert.equal(
        done.payments.filter((p) => p.status === "VERIFIED").length,
        2,
        "two payments, one bill"
      );

      const note = await prisma.pickupNote.findUnique({ where: { cargoId: cargo.id } });
      assert.ok(note, "settled in full is the moment the note is written");
      assert.equal(note.status, "ACTIVE");
      assert.equal(note.customerId, customer.id);
      assert.ok(note.qrToken);

      const reversed = await paymentActions.reversePayment(
        {},
        form({ paymentId: usd.id, reason: "The cash was miscounted" })
      );
      assert.ok(reversed.ok, reversed.error);
      assert.equal(
        (await owing(invoiceId)).outstandingTzs?.toString(),
        "27000",
        "the balance goes back up by exactly what was taken back"
      );
      const withdrawn = await prisma.pickupNote.findUniqueOrThrow({
        where: { cargoId: cargo.id },
      });
      assert.equal(
        withdrawn.status,
        "CANCELLED",
        "and the permission to collect goes with it"
      );
    } finally {
      signedIn = null;
      await unseed(cargo.id, customer.id);
    }
  });

  test("Support hands a claim up and can never make it true", async () => {
    const me = await actor(prisma);
    const { cargo, customer } = await landed(prisma, "SUPQ", { confirmed: true });
    try {
      const rate = await prisma.exchangeRate.findFirstOrThrow({
        where: { active: true },
        orderBy: { effectiveFrom: "desc" },
      });
      const invoice = await issuedBill(cargo.id, customer.id, me.id, rate);

      signedIn = { id: me.id, name: "Support", role: "CUSTOMER_SUPPORT" };
      const claimed = await paymentActions.recordPayment(
        {},
        form({
          invoiceId: invoice.id,
          amount: "36450",
          currency: "TZS",
          method: "MOBILE_MONEY",
        })
      );
      assert.ok(claimed.ok, claimed.error);
      const claim = await prisma.payment.findFirstOrThrow({
        where: { invoiceId: invoice.id },
      });
      assert.equal(claim.status, "PENDING");

      await assert.rejects(
        paymentActions.verifyPayment({}, form({ paymentId: claim.id })),
        /permission/,
        "and cannot verify it"
      );
      assert.equal(
        (await prisma.payment.findUniqueOrThrow({ where: { id: claim.id } })).status,
        "PENDING"
      );
      assert.equal(
        await prisma.pickupNote.count({ where: { cargoId: cargo.id } }),
        0,
        "so nothing may be collected on it"
      );
    } finally {
      signedIn = null;
      await unseed(cargo.id, customer.id);
    }
  });
});

describe("who may touch the money", () => {
  test("neither warehouse can price, bill or take a payment", () => {
    for (const role of ["CHINA_WAREHOUSE", "DAR_WAREHOUSE"] as const) {
      for (const permission of [
        "invoice.create",
        "invoice.issue",
        "invoice.priceConfirm",
        "invoice.discount",
        "invoice.edit",
        "invoice.cancel",
        "payment.submit",
        "payment.record",
        "payment.verify",
        "rate.manage",
        "fx.manage",
      ] as const) {
        assert.ok(!rbac.can(role, permission), `${role} must not hold ${permission}`);
      }
    }
  });

  test("China is shown no money at all", () => {
    assert.ok(!rbac.can("CHINA_WAREHOUSE", "finance.view"));
    assert.ok(!rbac.can("DAR_WAREHOUSE", "finance.view"));
  });

  test("Support hands a claim up and can never make one true", () => {
    assert.ok(rbac.can("CUSTOMER_SUPPORT", "payment.submit"));
    assert.ok(!rbac.can("CUSTOMER_SUPPORT", "payment.verify"));
    assert.ok(!rbac.can("CUSTOMER_SUPPORT", "invoice.edit"));
    assert.ok(!rbac.can("CUSTOMER_SUPPORT", "invoice.cancel"));
    assert.ok(!rbac.can("CUSTOMER_SUPPORT", "rate.manage"));
  });

  test("verifying money is Finance's and management's, and nobody else's", () => {
    for (const role of ["FINANCE", "MANAGER", "ADMIN"] as const) {
      assert.ok(rbac.can(role, "payment.verify"), role);
    }
    for (const role of [
      "CHINA_WAREHOUSE",
      "DAR_WAREHOUSE",
      "CUSTOMER_SUPPORT",
      "CUSTOMER",
    ] as const) {
      assert.ok(!rbac.can(role, "payment.verify"), role);
    }
  });
});


describe("a price changed from the collection list", () => {
  test("category, volume and rate move the bill together, each written down", async () => {
    const me = await actor(prisma);
    const { cargo, customer } = await landed(prisma, "RPC", { confirmed: true });
    try {
      const ctx = await confirmLib.confirmContext(7);
      assert.ok(ctx);
      await prisma.$transaction((tx) => confirmLib.confirmCargoPrice(tx, me, cargo.id, ctx), {
        timeout: 30_000,
      });
      const invoice = await prisma.invoice.findFirstOrThrow({
        where: { cargoId: cargo.id, status: { not: "DRAFT" } },
        include: { items: true },
      });
      const freight = invoice.items.filter((i) => i.unit === "CBM");
      assert.equal(freight.length, 1, "one freight line");
      const other = await prisma.shippingRate.findFirst({
        where: { active: true, service: "LCL", basis: "PER_CBM", cargoType: { not: null } },
        select: { cargoType: true, rate: true },
      });
      assert.ok(other, "needs a categorised rate");

      signedIn = { id: me.id, name: me.name ?? "Support", role: "CUSTOMER_SUPPORT" };
      const done = await invoiceActions.repriceInvoice(
        {},
        form({
          invoiceId: invoice.id,
          rate: "500",
          category: other.cargoType!,
          cbm: "1.5",
          reason: "Measured again with the customer",
        })
      );
      assert.ok(done.ok, done.error);

      const after = await prisma.invoice.findUniqueOrThrow({
        where: { id: invoice.id },
        include: { items: true },
      });
      const line = after.items.find((i) => i.unit === "CBM")!;
      assert.equal(line.quantity.toString(), "1.5");
      assert.equal(line.category, other.cargoType);
      assert.equal(line.amount.toString(), "750");
      assert.equal(after.billableCbm?.toString(), "1.5");
      assert.equal(after.appliedRate?.toString(), "500");
      assert.equal(after.standardRate?.toString(), other.rate.toString(), "the book rate of the new category");

      const trail = await prisma.fieldChange.findMany({ where: { entityId: invoice.id } });
      assert.ok(trail.some((c) => c.field === "category" && c.newValue === other.cargoType));
      assert.ok(trail.some((c) => c.field === "billableCbm" && c.newValue === "1.5"));
    } finally {
      signedIn = null;
      await unseed(cargo.id, customer.id);
    }
  });
});
