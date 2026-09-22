import assert from "node:assert/strict";
import test from "node:test";

import { manifestTally } from "@/lib/manifest-tally";

const line = (
  expectedPackages: number,
  receivedPackages: number | null,
  missing = false
) => ({ expectedPackages, receivedPackages, missing });

test("the owner's example: 100 expected, 98 received, 2 missing", () => {
  const t = manifestTally([line(100, 98)]);
  assert.equal(t.expected, 100);
  assert.equal(t.received, 98);
  assert.equal(t.missing, 2);
  assert.equal(t.available, 98);
  assert.equal(t.discrepancy, 2);
});

test("a consignment that never came off counts every package as missing", () => {
  const t = manifestTally([line(60, 60), line(40, null, true)]);
  /* The packing list still says a hundred. */
  assert.equal(t.expected, 100);
  assert.equal(t.received, 60);
  assert.equal(t.missing, 40);
  assert.equal(t.available, 60);
});

test("a consignment nobody has counted yet is not missing", () => {
  const t = manifestTally([line(50, 50), line(50, null)]);
  assert.equal(t.missing, 0);
  assert.equal(t.uncheckedLines, 1);
  assert.equal(t.inProgress, true);
  assert.equal(t.received, 50);
});

test("more off the box than the paper said is an over, not a negative missing", () => {
  const t = manifestTally([line(10, 12)]);
  assert.equal(t.missing, 0);
  assert.equal(t.over, 2);
  assert.equal(t.discrepancy, 2);
  assert.equal(t.available, 12);
});

test("shortages and overs in one box are both counted", () => {
  const t = manifestTally([line(10, 8), line(10, 11), line(5, null, true)]);
  assert.equal(t.expected, 25);
  assert.equal(t.received, 19);
  assert.equal(t.missing, 7);
  assert.equal(t.over, 1);
  assert.equal(t.discrepancy, 8);
});

test("a box counted clean has nothing to answer for", () => {
  const t = manifestTally([line(30, 30), line(70, 70)]);
  assert.deepEqual(
    { missing: t.missing, over: t.over, discrepancy: t.discrepancy, inProgress: t.inProgress },
    { missing: 0, over: 0, discrepancy: 0, inProgress: false }
  );
});

test("an empty box is not a discrepancy", () => {
  const t = manifestTally([]);
  assert.equal(t.expected, 0);
  assert.equal(t.discrepancy, 0);
  assert.equal(t.inProgress, false);
});
