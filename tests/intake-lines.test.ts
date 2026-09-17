import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { readIntakeLines } from "@/lib/intake-lines";

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
