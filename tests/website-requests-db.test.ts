import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { after, describe, test } from "node:test";

import { Prisma, PrismaClient } from "@prisma/client";

/*
  THE HOOK GOES IN BEFORE ANY FILE OF OURS DOES.

  `import` is hoisted and would run first, so the modules under test are loaded
  by hand, after tests/stubs/hook.cjs has swapped the four things a test process
  cannot have: the request's headers, Next's cache, the `server-only` marker and
  the session. Everything else is the real code against the real database.
*/
const load = createRequire(import.meta.url);
load("./stubs/hook.cjs");

const { nextBookingReference, nextPickupReference } =
  load("@/lib/ids") as typeof import("@/lib/ids");
const { estimate, publicRateBook } =
  load("@/lib/public-estimate") as typeof import("@/lib/public-estimate");
const { submitBooking, submitPickupRequest } =
  load("@/lib/actions/requests") as typeof import("@/lib/actions/requests");
const { publicSailings, generateSailings } =
  load("@/lib/sailing-schedule") as typeof import("@/lib/sailing-schedule");

/**
 * THE WEBSITE, AGAINST THE REAL DATABASE.
 *
 * Three things worth proving and no way to prove them with a stub: that the
 * calculator's figure is the rate book's figure with the invoice's minimum and
 * the configured VAT on it; that two people pressing Send in the same second
 * cannot be handed the same reference; and that nothing a stranger posts can
 * approve their own request or name its own price.
 *
 * The pricing work runs inside a transaction that is always rolled back. The
 * concurrency and submission tests cannot — a rolled-back counter proves
 * nothing about a counter — so they write, and clean up after themselves.
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

/** A rate book with nothing in it but the rows this test put there. */
async function ownRateBook(
  tx: Prisma.TransactionClient,
  rows: {
    cargoType: string | null;
    rate: string;
    minimumCbm?: string | null;
    published?: boolean;
  }[]
) {
  await tx.shippingRate.updateMany({ where: {}, data: { active: false } });
  await tx.customerRate.updateMany({ where: {}, data: { active: false } });
  /* Staggered a second apart: "the newest row for this type" is only a
     question with an answer if two rows do not share a timestamp. */
  let index = 0;
  for (const row of rows) {
    index += 1;
    await tx.shippingRate.create({
      data: {
        service: "LCL",
        basis: "PER_CBM",
        cargoType: row.cargoType,
        rate: new Prisma.Decimal(row.rate),
        currency: "USD",
        minimumCbm: row.minimumCbm ? new Prisma.Decimal(row.minimumCbm) : null,
        published: row.published ?? true,
        active: true,
        effectiveFrom: new Date(Date.now() - 60_000 + index * 1_000),
      },
    });
  }
}

/** A known VAT percentage and a known exchange rate, for one transaction. */
async function ownMoney(tx: Prisma.TransactionClient, vat: string, fx: string) {
  await tx.companySetting.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", vatPercent: new Prisma.Decimal(vat) },
    update: { vatPercent: new Prisma.Decimal(vat) },
  });
  await tx.exchangeRate.updateMany({ where: {}, data: { active: false } });
  await tx.exchangeRate.create({
    data: {
      fromCurrency: "USD",
      toCurrency: "TZS",
      rate: new Prisma.Decimal(fx),
      active: true,
      effectiveFrom: new Date(),
    },
  });
}

describe("the public calculator prices what the invoice would price", () => {
  test("the rate book's own rate, and the rate book's own minimum", async () => {
    await inRollback(async (tx) => {
      await ownRateBook(tx, [
        { cargoType: "Shoes", rate: "320", minimumCbm: "1" },
        { cargoType: null, rate: "450" },
      ]);
      await ownMoney(tx, "18", "2500");

      /* Two cubic metres of shoes: 2 × 320 = 640, VAT 115.20, total 755.20. */
      const priced = await estimate({ cargoType: "Shoes", cbm: "2", client: tx });
      assert.equal(priced.kind, "priced");
      if (priced.kind !== "priced") return;
      assert.equal(priced.rate, "320");
      assert.equal(priced.billableCbm, "2.000");
      assert.equal(priced.minimumApplied, false);
      assert.equal(priced.freight, "USD 640.00");
      assert.equal(priced.vat, "USD 115.20");
      assert.equal(priced.total, "USD 755.20");
      /* 755.20 × 2,500 = 1,888,000, to the whole shilling. */
      assert.equal(priced.totalTzs, "TZS 1,888,000");
    });
  });

  test("below the minimum is charged at the minimum", async () => {
    await inRollback(async (tx) => {
      await ownRateBook(tx, [{ cargoType: "Shoes", rate: "320", minimumCbm: "1" }]);
      await ownMoney(tx, "0", "2500");

      const priced = await estimate({ cargoType: "Shoes", cbm: "0.46", client: tx });
      assert.equal(priced.kind, "priced");
      if (priced.kind !== "priced") return;
      assert.equal(priced.measuredCbm, "0.460");
      assert.equal(priced.billableCbm, "1.000");
      assert.equal(priced.minimumApplied, true);
      assert.equal(priced.total, "USD 320.00");
      assert.match(priced.explanation, /minimum/);
    });
  });

  test("a type with no rate of its own falls to the general rate", async () => {
    await inRollback(async (tx) => {
      await ownRateBook(tx, [
        { cargoType: "Shoes", rate: "320" },
        { cargoType: null, rate: "450" },
      ]);
      await ownMoney(tx, "0", "2500");

      const priced = await estimate({ cargoType: "Engine parts", cbm: "1", client: tx });
      assert.equal(priced.kind, "priced");
      if (priced.kind !== "priced") return;
      assert.equal(priced.rate, "450");
      assert.equal(priced.total, "USD 450.00");
    });
  });

  test("a book with neither says the team will quote", async () => {
    await inRollback(async (tx) => {
      await ownRateBook(tx, [{ cargoType: "Shoes", rate: "320" }]);
      await ownMoney(tx, "0", "2500");

      const priced = await estimate({ cargoType: "Engine parts", cbm: "1", client: tx });
      assert.equal(priced.kind, "quote-required");
    });
  });

  test("the type list is the published rate book, newest row per type", async () => {
    await inRollback(async (tx) => {
      await ownRateBook(tx, [
        { cargoType: "Shoes", rate: "300" },
        { cargoType: "Shoes", rate: "320" },
        { cargoType: "Iron coil", rate: "550" },
        { cargoType: "Internal only", rate: "100", published: false },
        { cargoType: null, rate: "450" },
      ]);

      const book = await publicRateBook("LCL", tx);
      const names = book.map((row) => row.cargoType).sort();
      assert.deepEqual(names, ["Iron coil", "Shoes"]);
      /* The later row wins, and the general rate is not offered as a category. */
      assert.equal(book.find((row) => row.cargoType === "Shoes")?.rate, "320");
    });
  });

  test("no customer means no customer's agreed rate", async () => {
    await inRollback(async (tx) => {
      await ownRateBook(tx, [{ cargoType: "Shoes", rate: "320" }]);
      await ownMoney(tx, "0", "2500");

      const customer = await tx.customer.create({
        data: { code: "TEST-EST-1", fullName: "Test Estimate", phone: "+255700000991" },
      });
      await tx.customerRate.create({
        data: {
          customerId: customer.id,
          service: "LCL",
          cargoType: "Shoes",
          basis: "PER_CBM",
          rate: new Prisma.Decimal("150"),
          active: true,
          effectiveFrom: new Date(Date.now() - 60_000),
        },
      });

      const priced = await estimate({ cargoType: "Shoes", cbm: "1", client: tx });
      assert.equal(priced.kind, "priced");
      if (priced.kind !== "priced") return;
      assert.equal(priced.rate, "320");
    });
  });
});

describe("two people pressing Send in the same second", () => {
  test("no two requests are handed the same reference", async () => {
    const wanted = 25;
    const refs = await Promise.all(
      Array.from({ length: wanted }, () =>
        prisma.$transaction((tx) => nextPickupReference(tx))
      )
    );
    assert.equal(new Set(refs).size, wanted);
    for (const ref of refs) assert.match(ref, /^SPU-\d{6}$/);

    const bookings = await Promise.all(
      Array.from({ length: wanted }, () =>
        prisma.$transaction((tx) => nextBookingReference(tx))
      )
    );
    assert.equal(new Set(bookings).size, wanted);
    for (const ref of bookings) assert.match(ref, /^SVC-\d{6}$/);

    /* And the two series do not step on one another. */
    assert.equal(new Set([...refs, ...bookings]).size, wanted * 2);
  });

  test("the reference on the row is the reference the customer was given", async () => {
    const made: string[] = [];
    try {
      const results = await Promise.all(
        Array.from({ length: 5 }, (_, i) =>
          submitPickupRequest({}, pickupForm({ phone: `+25578000${100 + i}` }))
        )
      );
      for (const result of results) {
        assert.ok(result.reference, result.error ?? "no reference");
        made.push(result.reference!);
      }
      assert.equal(new Set(made).size, made.length);

      const rows = await prisma.pickupRequest.findMany({
        where: { reference: { in: made } },
        select: { reference: true },
      });
      assert.equal(rows.length, made.length);
    } finally {
      await prisma.pickupRequest.deleteMany({ where: { reference: { in: made } } });
    }
  });
});

/** A filled-in collection form, plus anything the caller wants to smuggle in. */
function pickupForm(options: { phone: string; extra?: Record<string, string> }) {
  const form = new FormData();
  form.set("contactName", "Test Visitor");
  form.set("contactPhone", options.phone);
  form.set("pickupLocation", "Unit 4, Baiyun, Guangzhou");
  form.set("commodity", "Shoes");
  form.set("packages", "12");
  form.set("estimatedCbm", "1.5");
  for (const [key, value] of Object.entries(options.extra ?? {})) form.set(key, value);
  return form;
}

function bookingForm(options: { phone: string; extra?: Record<string, string> }) {
  const form = new FormData();
  form.set("type", "SHARED_CARGO");
  form.set("contactName", "Test Visitor");
  form.set("contactPhone", options.phone);
  form.set("commodity", "Shoes");
  form.set("estimatedCbm", "2");
  form.set("termsAccepted", "on");
  for (const [key, value] of Object.entries(options.extra ?? {})) form.set(key, value);
  return form;
}

describe("what a stranger may write", () => {
  test("a posted status, price or assignment reaches nothing", async () => {
    const references: { pickup?: string; booking?: string } = {};
    try {
      const staff = await prisma.user.findFirst({
        where: { role: "CUSTOMER_SUPPORT" },
        select: { id: true },
      });
      const customer = await prisma.customer.findFirst({ select: { id: true } });

      const smuggled = {
        status: "APPROVED",
        staffNotes: "approved by me",
        assignedToId: staff?.id ?? "anything",
        customerId: customer?.id ?? "anything",
        scheduledDate: "2030-01-01",
        completedAt: "2030-01-01",
        cargoId: "anything",
        quotedAmount: "1",
        quotedCurrency: "TZS",
        quotedAt: "2030-01-01",
        convertedCustomerId: customer?.id ?? "anything",
        convertedAt: "2030-01-01",
        reference: "SPU-000001",
      };

      const pickup = await submitPickupRequest(
        {},
        pickupForm({ phone: "+255788000201", extra: smuggled })
      );
      assert.ok(pickup.reference, pickup.error ?? "not created");
      references.pickup = pickup.reference;

      const row = await prisma.pickupRequest.findUniqueOrThrow({
        where: { reference: pickup.reference! },
      });
      assert.equal(row.status, "SUBMITTED");
      assert.equal(row.staffNotes, null);
      assert.equal(row.assignedToId, null);
      assert.equal(row.scheduledDate, null);
      assert.equal(row.completedAt, null);
      assert.equal(row.cargoId, null);
      /* Nobody is signed in, so the request belongs to no customer either. */
      assert.equal(row.customerId, null);
      assert.notEqual(row.reference, "SPU-000001");

      const booking = await submitBooking(
        {},
        bookingForm({ phone: "+255788000202", extra: smuggled })
      );
      assert.ok(booking.reference, booking.error ?? "not created");
      references.booking = booking.reference;

      const service = await prisma.containerBooking.findUniqueOrThrow({
        where: { reference: booking.reference! },
      });
      assert.equal(service.status, "SUBMITTED");
      assert.equal(service.staffNotes, null);
      assert.equal(service.assignedToId, null);
      assert.equal(service.quotedAmount, null);
      assert.equal(service.quotedCurrency, "USD");
      assert.equal(service.quotedAt, null);
      assert.equal(service.convertedCustomerId, null);
      assert.equal(service.convertedAt, null);
      assert.equal(service.customerId, null);
    } finally {
      if (references.pickup) {
        await prisma.pickupRequest.deleteMany({ where: { reference: references.pickup } });
      }
      if (references.booking) {
        await prisma.containerBooking.deleteMany({
          where: { reference: references.booking },
        });
      }
    }
  });

  test("a clearance request without a port is refused", async () => {
    const refused = await submitBooking(
      {},
      bookingForm({
        phone: "+255788000203",
        extra: { type: "CUSTOMS_CLEARANCE", portOfDischarge: "" },
      })
    );
    assert.ok(refused.error, "should have been refused");
    assert.equal(refused.reference, undefined);
  });

  test("the trap field is answered and nothing is written", async () => {
    const before = await prisma.pickupRequest.count();
    const result = await submitPickupRequest(
      {},
      pickupForm({ phone: "+255788000204", extra: { website: "https://spam" } })
    );
    assert.ok(result.ok);
    assert.equal(result.reference, undefined);
    assert.equal(await prisma.pickupRequest.count(), before);
  });
});

describe("what the website publishes as its schedule", () => {
  const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
  const on = (iso: string) => new Date(`${iso}T09:00:00.000Z`);

  /** A published row for one week, inside the caller's transaction. */
  async function publish(
    tx: Prisma.TransactionClient,
    row: {
      weekOf?: string | null;
      cargoDeadline: string;
      departureDate: string;
      vessel?: string;
      published?: boolean;
      status?: "OPEN_FOR_BOOKING" | "DELAYED" | "CANCELLED";
      notes?: string;
    }
  ) {
    await tx.shipmentSchedule.create({
      data: {
        weekOf: row.weekOf ? day(row.weekOf) : null,
        cargoDeadline: day(row.cargoDeadline),
        loadingDate: day(row.cargoDeadline),
        departureDate: day(row.departureDate),
        transitDays: 30,
        estimatedArrival: new Date(
          day(row.departureDate).getTime() + 30 * 24 * 60 * 60 * 1000
        ),
        vessel: row.vessel ?? null,
        published: row.published ?? true,
        status: row.status ?? "OPEN_FOR_BOOKING",
        notes: row.notes ?? null,
      },
    });
  }

  /** Nothing but the rows a test writes. */
  const only = (tx: Prisma.TransactionClient) =>
    tx.shipmentSchedule.deleteMany({ where: {} });

  test("with nothing published it is the rule, week after week", async () => {
    await inRollback(async (tx) => {
      await only(tx);
      const sailings = await publicSailings({ now: on("2026-09-22"), count: 4, client: tx });
      assert.deepEqual(
        sailings.map((s) => s.departureDate.toISOString().slice(0, 10)),
        ["2026-09-28", "2026-10-05", "2026-10-12", "2026-10-19"]
      );
      assert.ok(sailings.every((s) => s.source === "generated"));
    });
  });

  test("a published week replaces the generated one rather than doubling it", async () => {
    await inRollback(async (tx) => {
      await only(tx);
      /* Slipped by two days, and named. */
      await publish(tx, {
        weekOf: "2026-10-05",
        cargoDeadline: "2026-10-02",
        departureDate: "2026-10-07",
        vessel: "MSC Kalamata",
        notes: "Two days late out of Nansha.",
      });

      const sailings = await publicSailings({ now: on("2026-09-22"), count: 4, client: tx });
      const week = sailings.filter(
        (s) => s.weekOf.toISOString().slice(0, 10) === "2026-10-05"
      );
      assert.equal(week.length, 1);
      assert.equal(week[0].source, "published");
      assert.equal(week[0].vessel, "MSC Kalamata");
      assert.equal(week[0].departureDate.toISOString().slice(0, 10), "2026-10-07");
      assert.equal(week[0].notes, "Two days late out of Nansha.");
      /* Every other week is still the rule. */
      assert.equal(sailings.length, 4);
      assert.equal(sailings.filter((s) => s.source === "generated").length, 3);
    });
  });

  test("a row published without a week is placed by the week it sails in", async () => {
    await inRollback(async (tx) => {
      await only(tx);
      await publish(tx, {
        cargoDeadline: "2026-09-30",
        departureDate: "2026-10-03",
        vessel: "Maersk Cabo Verde",
      });
      const sailings = await publicSailings({ now: on("2026-09-22"), count: 4, client: tx });
      const week = sailings.filter(
        (s) => s.weekOf.toISOString().slice(0, 10) === "2026-09-28"
      );
      assert.equal(week.length, 1);
      assert.equal(week[0].vessel, "Maersk Cabo Verde");
    });
  });

  test("a second sailing in one week is an extra, shown beside the first", async () => {
    await inRollback(async (tx) => {
      await only(tx);
      await publish(tx, { weekOf: "2026-09-28", cargoDeadline: "2026-09-25", departureDate: "2026-09-28", vessel: "First" });
      await publish(tx, { cargoDeadline: "2026-09-30", departureDate: "2026-10-02", vessel: "Second" });
      const sailings = await publicSailings({ now: on("2026-09-22"), count: 2, client: tx });
      const names = sailings.map((s) => s.vessel);
      assert.ok(names.includes("First"));
      assert.ok(names.includes("Second"));
      /* And no two rows share the key a list is drawn by. */
      assert.equal(new Set(sailings.map((s) => s.key)).size, sailings.length);
    });
  });

  test("an unpublished row takes its week off the page altogether", async () => {
    await inRollback(async (tx) => {
      await only(tx);
      await publish(tx, {
        weekOf: "2026-10-05",
        cargoDeadline: "2026-10-02",
        departureDate: "2026-10-05",
        published: false,
      });
      const sailings = await publicSailings({ now: on("2026-09-22"), count: 4, client: tx });
      assert.ok(
        !sailings.some((s) => s.weekOf.toISOString().slice(0, 10) === "2026-10-05")
      );
      assert.equal(sailings.length, 3);
    });
  });

  test("delayed and cancelled are kept; the clock does not talk them out of it", async () => {
    await inRollback(async (tx) => {
      await only(tx);
      await publish(tx, { weekOf: "2026-09-28", cargoDeadline: "2026-09-25", departureDate: "2026-09-28", status: "DELAYED" });
      await publish(tx, { weekOf: "2026-10-05", cargoDeadline: "2026-10-02", departureDate: "2026-10-05", status: "CANCELLED" });
      const sailings = await publicSailings({ now: on("2026-09-22"), count: 3, client: tx });
      assert.equal(sailings[0].status, "DELAYED");
      assert.equal(sailings[0].bookingOpen, false);
      assert.equal(sailings[1].status, "CANCELLED");
      assert.equal(sailings[1].bookingOpen, false);
      /* The untouched week is still open. */
      assert.equal(sailings[2].status, "OPEN_FOR_BOOKING");
    });
  });

  test("the generated weeks the page asks for are the weeks it gets", async () => {
    await inRollback(async (tx) => {
      await only(tx);
      const generated = generateSailings({ now: on("2026-12-28"), count: 3 });
      const sailings = await publicSailings({ now: on("2026-12-28"), count: 3, client: tx });
      assert.deepEqual(
        sailings.map((s) => s.departureDate.toISOString()),
        generated.map((s) => s.departureDate.toISOString())
      );
    });
  });
});
