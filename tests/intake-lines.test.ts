import assert from "node:assert/strict";
import Module from "node:module";
import path from "node:path";
import { before, describe, test } from "node:test";

/* lib/dates is server code and says so; answered with an empty module so the
   rules that depend on it can be read without a Next server. */
const resolve = (Module as unknown as { _resolveFilename: (...args: unknown[]) => string })
  ._resolveFilename;
(Module as unknown as { _resolveFilename: (...args: unknown[]) => string })._resolveFilename =
  function (this: unknown, request: unknown, ...rest: unknown[]) {
    if (request === "server-only") {
      return path.join(__dirname, "..", "node_modules", "server-only", "empty.js");
    }
    return resolve.call(this, request, ...rest);
  };

/* Imported after the shim is in place, which a hoisted `import` would not be. */
type Lib = typeof import("@/lib/intake-lines");
let readIntakeLines: Lib["readIntakeLines"];
let readReceivingDate: Lib["readReceivingDate"];

before(async () => {
  const lib = await import("@/lib/intake-lines");
  readIntakeLines = lib.readIntakeLines;
  readReceivingDate = lib.readReceivingDate;
});

/**
 * What the Guangzhou counter is allowed to write down.
 *
 * No database: this is the boundary between a request body and the warehouse's
 * own figures, and the whole point of it is that it holds without anything else
 * being true.
 */

function form(rows: Record<string, string>[]) {
  const data = new FormData();
  for (const row of rows) {
    /* Parallel arrays, the way the form posts them — every row contributes one
       entry to every field, including the empty ones, or the columns come apart
       against each other. */
    for (const field of [
      "itemReceiptNo",
      "itemDescription",
      "itemDescriptionZh",
      "itemCargoType",
      "itemPackageType",
      "itemQuantity",
      "itemPieces",
      "itemCbm",
      "itemLength",
      "itemWidth",
      "itemHeight",
      "itemWeightKg",
    ]) {
      data.append(field, row[field] ?? "");
    }
  }
  return data;
}

const goodRow = {
  itemReceiptNo: "0002989",
  itemDescription: "Shoes",
  itemCargoType: "General",
  itemPackageType: "CARTON",
  itemQuantity: "4",
  itemPieces: "200",
  itemCbm: "1.2000",
  itemWeightKg: "80",
};

describe("a measurement below zero never reaches the floor", () => {
  for (const [field, name] of [
    ["itemWeightKg", "weight"],
    ["itemCbm", "volume"],
    ["itemLength", "length"],
    ["itemWidth", "width"],
    ["itemHeight", "height"],
    ["itemPieces", "pieces"],
  ] as const) {
    test(`${name} cannot be negative`, () => {
      const result = readIntakeLines(form([{ ...goodRow, [field]: "-5" }]));
      assert.equal(result.lines.length, 0, "nothing is saved");
      assert.match(result.error ?? "", /below zero/);
      assert.match(result.error ?? "", new RegExp(name));
      assert.match(result.error ?? "", /Item 1/);
    });
  }

  test("one bad row refuses the whole delivery, not just its own line", () => {
    const result = readIntakeLines(
      form([goodRow, { ...goodRow, itemDescription: "Toys", itemCbm: "-1" }])
    );
    assert.equal(result.lines.length, 0);
    assert.match(result.error ?? "", /Item 2/);
  });

  test("the row is named, so the clerk knows which one", () => {
    const result = readIntakeLines(
      form([goodRow, goodRow, { ...goodRow, itemWeightKg: "-0.5" }])
    );
    assert.match(result.error ?? "", /Item 3: weight/);
  });
});

describe("a package count is a whole number of things", () => {
  test("zero packages is refused rather than rounded up to one", () => {
    const result = readIntakeLines(form([{ ...goodRow, itemQuantity: "0" }]));
    assert.equal(result.lines.length, 0);
    assert.match(result.error ?? "", /at least one/);
  });

  test("half a carton is refused", () => {
    const result = readIntakeLines(form([{ ...goodRow, itemQuantity: "2.5" }]));
    assert.equal(result.lines.length, 0);
    assert.match(result.error ?? "", /whole number/);
  });

  test("blank means one package, which is what leaving it alone means", () => {
    const result = readIntakeLines(form([{ ...goodRow, itemQuantity: "" }]));
    assert.equal(result.error, undefined);
    assert.equal(result.lines[0].quantity, 1);
  });

  test("a fractional piece count is refused", () => {
    const result = readIntakeLines(form([{ ...goodRow, itemPieces: "1.5" }]));
    assert.match(result.error ?? "", /whole number/);
  });
});

describe("what a good delivery reads as", () => {
  test("every column arrives on the line it was typed on", () => {
    const { lines, error } = readIntakeLines(
      form([
        {
          ...goodRow,
          itemDescriptionZh: "鞋",
          itemLength: "60",
          itemWidth: "40",
          itemHeight: "50",
        },
      ])
    );
    assert.equal(error, undefined);
    assert.deepEqual(lines, [
      {
        paperReceiptNo: "0002989",
        description: "Shoes",
        descriptionZh: "鞋",
        cargoType: "General",
        packageType: "CARTON",
        quantity: 4,
        pieces: 200,
        cbm: 1.2,
        length: 60,
        width: 40,
        height: 50,
        weightKg: 80,
      },
    ]);
  });

  test("a row somebody started and abandoned is dropped, not saved empty", () => {
    const { lines, error } = readIntakeLines(
      form([goodRow, { ...goodRow, itemDescription: "  " }])
    );
    assert.equal(error, undefined);
    assert.equal(lines.length, 1);
  });

  test("an unknown package type falls back rather than reaching the database", () => {
    const { lines } = readIntakeLines(
      form([{ ...goodRow, itemPackageType: "SUBMARINE" }])
    );
    assert.equal(lines[0].packageType, "CARTON");
  });

  test("zero is a legitimate weight and is not confused with a negative one", () => {
    const { lines, error } = readIntakeLines(
      form([{ ...goodRow, itemWeightKg: "0" }])
    );
    assert.equal(error, undefined);
    assert.equal(lines[0].weightKg, 0);
  });
});

describe("the day the boxes arrived", () => {
  const now = new Date("2026-09-18T11:00:00.000Z");

  test("blank is now, and is not a backdate", () => {
    const result = readReceivingDate("", now);
    assert.ok(!("error" in result));
    assert.equal(result.receivedAt.getTime(), now.getTime());
    assert.equal(result.backdated, false);
  });

  test("a page of the book typed up later keeps the day it was written", () => {
    const result = readReceivingDate("2026-09-15", now);
    assert.ok(!("error" in result));
    assert.equal(result.receivedAt.toISOString().slice(0, 10), "2026-09-15");
    assert.equal(result.backdated, true, "and says so, for the audit line");
  });

  test("today typed out in full is not a backdate", () => {
    const result = readReceivingDate("2026-09-18", now);
    assert.ok(!("error" in result));
    assert.equal(result.backdated, false);
  });

  test("tomorrow is refused — cargo cannot be received before it gets here", () => {
    const result = readReceivingDate("2026-09-19", now);
    assert.ok("error" in result);
    assert.match(result.error, /future/);
  });

  test("a minute from now is refused too, not just a whole day", () => {
    const result = readReceivingDate(
      "2026-09-18T11:01:00.000Z",
      now
    );
    assert.ok("error" in result);
  });

  test("the year 226 is refused rather than stored", () => {
    const result = readReceivingDate("0226-09-18", now);
    assert.ok("error" in result);
    assert.match(result.error, /check the year/);
  });

  test("nonsense is refused rather than read as now", () => {
    const result = readReceivingDate("not a date", now);
    assert.ok("error" in result);
  });
});
