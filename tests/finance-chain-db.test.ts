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
let confirmLib: Confirm;
let listLib: List;
let balanceLib: Balance;
let noteLib: Note;
let rbac: Rbac;
let priceActions: PriceActions;

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

describe("Finance prices nothing Dar has not confirmed", () => {
  test("a count Dar has not signed off is named, not issued", async () => {
    await inRollback(async (tx) => {
      const me = await actor(tx);
      const { cargo } = await landed(tx, "UNC", { confirmed: false });

      const ctx = await confirmLib.confirmContext(7, tx);
      assert.ok(ctx, "needs a published exchange rate");

      const outcome = await confirmLib.confirmCargoPrice(tx, me, cargo.id, ctx);
      assert.equal(outcome.kind, "blocked");
      assert.match(
        outcome.kind === "blocked" ? outcome.reason : "",
        /has not confirmed the count/
      );
      assert.equal(
        await tx.invoice.count({ where: { cargoId: cargo.id, status: { not: "DRAFT" } } }),
        0,
        "nothing was issued"
      );
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

  test("the row is on the list with its figure, and out of what one press confirms", async () => {
    await inRollback(async (tx) => {
      const { cargo } = await landed(tx, "ROW", { confirmed: false });

      const before = await listLib.priceListFor({ id: cargo.id }, tx);
      assert.equal(before.rows.length, 1, "Finance still sees the consignment");
      assert.equal(before.rows[0].darConfirmed, false);
      assert.ok(before.rows[0].totalLabel, "and the figure it will come to");
      assert.equal(before.ready, 0, "but it is not in the press");

      await tx.darReceiving.update({
        where: { cargoId: cargo.id },
        data: { verified: true, verifiedAt: new Date() },
      });

      const after = await listLib.priceListFor({ id: cargo.id }, tx);
      assert.equal(after.rows[0].darConfirmed, true);
      assert.equal(after.rows[0].darWaiting, null);
      assert.equal(after.ready, 1);
    });
  });

  test("one unconfirmed consignment blocks only itself", async () => {
    await inRollback(async (tx) => {
      const me = await actor(tx);
      const ready = await landed(tx, "OK1", { confirmed: true });
      const waiting = await landed(tx, "WT1", { confirmed: false });
      const ctx = await confirmLib.confirmContext(7, tx);
      assert.ok(ctx);

      const first = await confirmLib.confirmCargoPrice(tx, me, ready.cargo.id, ctx);
      const second = await confirmLib.confirmCargoPrice(tx, me, waiting.cargo.id, ctx);

      assert.equal(first.kind, "issued");
      assert.equal(second.kind, "blocked");

      const issued = await tx.invoice.findFirstOrThrow({
        where: { cargoId: ready.cargo.id },
      });
      assert.equal(issued.status, "ISSUED");
      assert.equal(await tx.invoice.count({ where: { cargoId: waiting.cargo.id } }), 0);
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

      const waiting = await listLib.priceListFor({ id: cargo.id });
      assert.equal(waiting.ready, 0, "and it is out of the press meanwhile");

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
