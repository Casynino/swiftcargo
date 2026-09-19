import assert from "node:assert/strict";
import Module from "node:module";
import path from "node:path";
import { before, describe, test } from "node:test";

/**
 * A DAY IN DAR, NOT A DAY ON THE SERVER.
 *
 * Vercel runs in UTC and Tanzania is three hours ahead, so a period cut on the
 * server's clock puts every takings between midnight and 03:00 into the day
 * before — and the first three hours of a month into the month before.
 */
const resolve = (Module as unknown as { _resolveFilename: (...a: unknown[]) => string })._resolveFilename;
(Module as unknown as { _resolveFilename: (...a: unknown[]) => string })._resolveFilename = function (
  this: unknown,
  request: unknown,
  ...rest: unknown[]
) {
  if (request === "server-only") return path.join(__dirname, "..", "node_modules", "server-only", "empty.js");
  return resolve.call(this, request, ...rest);
};

let report: typeof import("@/lib/finance-report");
let dar: typeof import("@/lib/dar-time");
before(async () => {
  report = await import("@/lib/finance-report");
  dar = await import("@/lib/dar-time");
});

/* 01:30 on the first of September in Dar es Salaam. */
const FIRST_OF_MONTH_EARLY = new Date("2026-08-31T22:30:00.000Z");
/* Midnight in Dar on the first of September. */
const DAR_MONTH_START = new Date("2026-08-31T21:00:00.000Z");

describe("periods are cut on the Tanzanian calendar", () => {
  test("01:30 on the first is in that month, and in that day", () => {
    const { current } = report.periodRange("month", FIRST_OF_MONTH_EARLY);
    assert.equal(current.from.toISOString(), DAR_MONTH_START.toISOString());
    assert.equal(current.label, "September 2026");
    assert.ok(report.within(FIRST_OF_MONTH_EARLY, current), "the payment is in September");

    const today = report.periodRange("today", FIRST_OF_MONTH_EARLY).current;
    assert.equal(today.from.toISOString(), DAR_MONTH_START.toISOString());
    assert.ok(report.within(FIRST_OF_MONTH_EARLY, today), "the payment is in today's takings");
  });

  test("the month before ends where this one starts, with nothing lost between", () => {
    const { current, previous } = report.periodRange("month", FIRST_OF_MONTH_EARLY);
    assert.equal(previous.to.toISOString(), current.from.toISOString());
    assert.equal(previous.label, "August 2026");
    /* 23:30 on the last day of August in Dar. */
    const lateInAugust = new Date("2026-08-31T20:30:00.000Z");
    assert.ok(report.within(lateInAugust, previous));
    assert.ok(!report.within(lateInAugust, current));
  });

  test("a day is twenty-four hours and a week starts on Monday, in Dar", () => {
    const day = report.periodRange("today", FIRST_OF_MONTH_EARLY).current;
    assert.equal(day.to.getTime() - day.from.getTime(), 86_400_000);
    /* The first of September 2026 is a Tuesday; its week began on Monday. */
    const week = report.periodRange("week", FIRST_OF_MONTH_EARLY).current;
    assert.equal(week.from.toISOString(), "2026-08-30T21:00:00.000Z");
    assert.equal(dar.darFields(week.from).weekday, 0);
  });

  test("the calendar month helper agrees with the period", () => {
    const m = report.monthRange(2026, 8);
    assert.equal(m.from.toISOString(), DAR_MONTH_START.toISOString());
    assert.equal(m.to.toISOString(), "2026-09-30T21:00:00.000Z");
    assert.equal(m.label, "September 2026");
  });
});
