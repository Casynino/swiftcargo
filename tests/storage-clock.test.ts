import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { storageState } from "@/lib/storage-clock";

/* 18 Sep 2026, 10:00 in Dar es Salaam. */
const arrived = new Date("2026-09-18T07:00:00Z");
const on = (iso: string) => new Date(iso);
const state = (now: Date, perDay: number | null = 5) =>
  storageState({ arrivedAt: arrived, freeDays: 7, perDay, currency: "USD", now });

describe("the storage clock", () => {
  test("the day it arrives is day one, with every free day left", () => {
    const s = state(on("2026-09-18T20:00:00Z"));
    assert.equal(s.dayNumber, 1);
    assert.equal(s.daysRemaining, 7);
    assert.equal(s.expired, false);
    assert.equal(s.lastFreeDay.toISOString().slice(0, 10), "2026-09-24");
  });

  test("counts Dar days, not UTC days", () => {
    /* 22:30 UTC on the 18th is 01:30 on the 19th in Dar: day two. */
    assert.equal(state(on("2026-09-18T22:30:00Z")).dayNumber, 2);
  });

  test("day seven is the last free day and day eight may be charged", () => {
    const seventh = state(on("2026-09-24T12:00:00Z"));
    assert.equal(seventh.daysRemaining, 1);
    assert.equal(seventh.expired, false);
    const eighth = state(on("2026-09-25T12:00:00Z"));
    assert.equal(eighth.expired, true);
    assert.equal(eighth.chargeableDays, 1);
    assert.equal(eighth.accrued, 5);
  });

  test("no configured rate means nothing accrues", () => {
    const s = state(on("2026-10-01T12:00:00Z"), null);
    assert.equal(s.expired, true);
    assert.equal(s.perDay, null);
    assert.equal(s.accrued, null);
  });
});
