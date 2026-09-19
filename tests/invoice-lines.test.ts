import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { Prisma } from "@prisma/client";

import { billLines } from "@/lib/invoice-lines";

/** A bill always prints something above its total. */
describe("the lines a bill is printed from", () => {
  const base = {
    subtotal: new Prisma.Decimal("318.50"),
    billableCbm: new Prisma.Decimal("0.910"),
    appliedRate: new Prisma.Decimal("350"),
    rateBasis: "PER_CBM",
    cargo: { reference: "SC0013", description: "Ladies handbags" },
  };

  test("its own lines, untouched, when it has them", () => {
    const items = [
      { id: "a", description: "Sea freight", quantity: 1, unitPrice: 318.5, amount: 318.5 },
      { id: "b", description: "Storage", quantity: 2, unitPrice: 5, amount: 10 },
    ];
    assert.deepEqual(billLines({ ...base, items }), items);
  });

  test("a bill with no lines prints what it knows, and the figures still add up", () => {
    const lines = billLines({ ...base, items: [] });
    assert.equal(lines.length, 1);
    assert.match(lines[0].description, /SC0013/);
    assert.equal(new Prisma.Decimal(lines[0].amount).toFixed(2), "318.50");
    assert.equal(new Prisma.Decimal(lines[0].quantity).toFixed(3), "0.910");
    assert.equal(new Prisma.Decimal(lines[0].unitPrice).toFixed(2), "350.00");
    assert.equal(lines[0].unit, "CBM");
    /* quantity × unit price is the amount: nothing is invented to fill a box. */
    assert.equal(
      new Prisma.Decimal(lines[0].quantity).mul(new Prisma.Decimal(lines[0].unitPrice)).toFixed(2),
      "318.50"
    );
  });

  test("with no rate on record it carries the amount alone", () => {
    const lines = billLines({ ...base, items: [], billableCbm: null, appliedRate: null });
    assert.equal(new Prisma.Decimal(lines[0].quantity).toFixed(0), "1");
    assert.equal(new Prisma.Decimal(lines[0].unitPrice).toFixed(2), "318.50");
    assert.equal(lines[0].unit, null);
  });
});
