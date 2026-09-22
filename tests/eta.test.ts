import assert from "node:assert/strict";
import test from "node:test";

import { expectedArrival, sailingDelay } from "@/lib/eta";

const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

test("thirty-five days at sea from the day the box left", () => {
  assert.equal(
    expectedArrival(day("2026-09-22")).toISOString().slice(0, 10),
    "2026-10-27"
  );
});

test("a crossing quoted differently keeps the days it was given", () => {
  assert.equal(
    expectedArrival(day("2026-09-22"), 40).toISOString().slice(0, 10),
    "2026-11-01"
  );
});

test("the promised day itself is not late", () => {
  const late = sailingDelay({
    eta: day("2026-10-22"),
    atSea: true,
    now: new Date("2026-10-22T23:30:00.000Z"),
  });
  assert.equal(late.late, false);
  assert.equal(late.days, 0);
});

test("the day after the promise is one day late", () => {
  const late = sailingDelay({
    eta: day("2026-10-22"),
    atSea: true,
    now: new Date("2026-10-23T06:00:00.000Z"),
  });
  assert.equal(late.late, true);
  assert.equal(late.days, 1);
});

test("day 35 of a 22 September sailing is still the crossing; day 36 is a delay", () => {
  const eta = expectedArrival(day("2026-09-22"));
  /* Day 35 — the day it was promised for. */
  assert.equal(
    sailingDelay({ eta, atSea: true, now: new Date("2026-10-27T09:00:00.000Z") }).late,
    false
  );
  /* Day 36. */
  assert.equal(
    sailingDelay({ eta, atSea: true, now: new Date("2026-10-28T09:00:00.000Z") }).late,
    true
  );
});

test("a box that landed is never late, whatever the calendar says", () => {
  const late = sailingDelay({
    eta: day("2026-10-22"),
    arrived: day("2026-10-30"),
    atSea: true,
    now: new Date("2026-11-05T00:00:00.000Z"),
  });
  assert.equal(late.late, false);
});

test("a box that has not sailed is not late", () => {
  const late = sailingDelay({
    eta: day("2026-10-22"),
    atSea: false,
    now: new Date("2026-11-05T00:00:00.000Z"),
  });
  assert.equal(late.late, false);
});

test("no promise, no delay", () => {
  assert.equal(
    sailingDelay({ eta: null, atSea: true, now: new Date() }).late,
    false
  );
});
