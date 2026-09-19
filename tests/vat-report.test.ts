import assert from "node:assert/strict";
import Module from "node:module";
import path from "node:path";
import { before, describe, test } from "node:test";

/**
 * VAT IS NOT REVENUE. It is collected with the bill and owed to TRA; the
 * profit and loss that counted it as the company's money overstated every
 * period by the tax rate.
 */
const resolve = (Module as unknown as { _resolveFilename: (...args: unknown[]) => string })._resolveFilename;
(Module as unknown as { _resolveFilename: (...args: unknown[]) => string })._resolveFilename = function (
  this: unknown,
  request: unknown,
  ...rest: unknown[]
) {
  if (request === "server-only") return path.join(__dirname, "..", "node_modules", "server-only", "empty.js");
  return resolve.call(this, request, ...rest);
};

let report: typeof import("@/lib/finance-report");
before(async () => {
  report = await import("@/lib/finance-report");
});

const m = (usd: number) => ({ usd, tzs: usd * 2700 });
const bill = (total: number, vat: number, owing = 0) => ({
  id: String(total),
  at: new Date("2026-09-10"),
  total: m(total),
  vat: m(vat),
  owing: m(owing),
  discount: m(0),
  storage: m(0),
  cbm: 1,
  credit: false,
  collectedAt: null,
  paid: owing === 0,
  partPaid: false,
  toVerify: false,
  customerId: "c",
});

describe("VAT in the profit and loss", () => {
  test("revenue and profit leave out the VAT; what customers owe does not", () => {
    const books = {
      bills: [bill(118, 18), bill(59, 9, 59)],
      money: [],
      costs: [{ at: new Date("2026-09-12"), amount: m(50), paid: true }],
      china: [],
      dar: [],
      boxes: [],
    } as unknown as Parameters<typeof report.figures>[0];
    const f = report.figures(books, { from: new Date("2026-09-01"), to: new Date("2026-09-30"), label: "September" });

    assert.equal(f.billed.usd, 177);
    assert.equal(f.vat.usd, 27);
    assert.equal(f.revenue.usd, 150);
    assert.equal(f.profit.usd, 100);
    assert.equal(Math.round(f.margin! * 100) / 100, 66.67);
    /* Collection is measured against the bills as sent, VAT and all. */
    assert.equal(Math.round(f.collectionRate! * 100) / 100, Math.round((118 / 177) * 10000) / 100);
  });
});
