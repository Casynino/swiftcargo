import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  DEFAULT_TRANSIT_DAYS,
  deadlineForDeparture,
  derivedStatus,
  generateSailings,
  generatedSailing,
  mondayOf,
} from "@/lib/sailing-schedule";

/**
 * THE SCHEDULE IS ARITHMETIC, SO IT IS TESTED AS ARITHMETIC.
 *
 * No database: the rule that makes the public page — cargo in by Friday, packed
 * that Friday, sails Monday, thirty days at sea — either holds for every week
 * of a year or it does not, and the weeks worth checking are the ones where
 * the Friday and the Monday are not in the same month, or not in the same year.
 *
 * Every date is UTC midnight, which is what the module works in.
 */

const DAY = 24 * 60 * 60 * 1000;
const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const iso = (value: Date) => value.toISOString().slice(0, 10);

const FRIDAY = 5;
const MONDAY = 1;

describe("the weekly sailing rule", () => {
  test("the deadline is the Friday three days before the Monday", () => {
    /* 1 January 2024 was a Monday, and its Friday was in the year before. */
    assert.equal(iso(deadlineForDeparture(day("2024-01-01"))), "2023-12-29");
    assert.equal(iso(deadlineForDeparture(day("2025-11-03"))), "2025-10-31");
    assert.equal(iso(deadlineForDeparture(day("2024-03-04"))), "2024-03-01");
  });

  test("a Monday is its own week; a Sunday belongs to the week that ended", () => {
    assert.equal(iso(mondayOf(day("2026-09-14"))), "2026-09-14");
    assert.equal(iso(mondayOf(day("2026-09-20"))), "2026-09-14");
    assert.equal(iso(mondayOf(day("2026-09-21"))), "2026-09-21");
  });

  test("every week of a year sails on a Monday for cargo in by Friday", () => {
    /* Fifty-three weeks from the first Monday of 2025, which carries the run
       through both ends of the year and through February in a leap year. */
    const sailings = generateSailings({
      now: day("2025-01-06"),
      count: 53,
      transitDays: DEFAULT_TRANSIT_DAYS,
    });
    assert.equal(sailings.length, 53);

    for (const sailing of sailings) {
      assert.equal(sailing.departureDate.getUTCDay(), MONDAY, iso(sailing.departureDate));
      assert.equal(sailing.cargoDeadline.getUTCDay(), FRIDAY, iso(sailing.cargoDeadline));
      /* The box is packed on the deadline day itself. */
      assert.equal(+sailing.loadingDate, +sailing.cargoDeadline);
      assert.equal(
        sailing.departureDate.getTime() - sailing.cargoDeadline.getTime(),
        3 * DAY
      );
      assert.equal(
        sailing.estimatedArrival.getTime() - sailing.departureDate.getTime(),
        DEFAULT_TRANSIT_DAYS * DAY
      );
    }

    /* And they run one week apart, with no week dropped or repeated. */
    for (let i = 1; i < sailings.length; i += 1) {
      assert.equal(
        sailings[i].departureDate.getTime() - sailings[i - 1].departureDate.getTime(),
        7 * DAY
      );
    }
  });

  test("a week whose Friday and Monday are in different months", () => {
    const sailing = generatedSailing(day("2025-11-03"), { now: day("2025-10-27") });
    assert.equal(iso(sailing.cargoDeadline), "2025-10-31");
    assert.equal(iso(sailing.departureDate), "2025-11-03");
    assert.equal(iso(sailing.estimatedArrival), "2025-12-03");
  });

  test("a week whose Friday and Monday are in different years", () => {
    const sailing = generatedSailing(day("2024-01-01"), { now: day("2023-12-26") });
    assert.equal(iso(sailing.cargoDeadline), "2023-12-29");
    assert.equal(iso(sailing.departureDate), "2024-01-01");
    assert.equal(iso(sailing.estimatedArrival), "2024-01-31");
  });

  test("thirty days at sea counts February the twenty-ninth", () => {
    /* Monday 12 February 2024, a leap year. Thirty days later is 13 March, and
       it is only 13 March if the twenty-ninth is counted. */
    const leap = generatedSailing(day("2024-02-12"), { now: day("2024-02-05") });
    assert.equal(iso(leap.estimatedArrival), "2024-03-13");

    /* The same Monday in a year that is not a leap year lands a day earlier in
       the month. */
    const ordinary = generatedSailing(day("2025-02-10"), { now: day("2025-02-03") });
    assert.equal(iso(ordinary.estimatedArrival), "2025-03-12");
  });

  test("a longer lane is thirty-five days, not thirty", () => {
    const sailing = generatedSailing(day("2026-06-01"), {
      transitDays: 35,
      now: day("2026-05-25"),
    });
    assert.equal(iso(sailing.estimatedArrival), "2026-07-06");
  });

  test("the week a customer is standing in is shown until its Monday has gone", () => {
    /* Saturday: this coming Monday's deadline was yesterday, so it shows and it
       shows as closed. */
    const saturday = generateSailings({ now: day("2026-09-19"), count: 2 });
    assert.equal(iso(saturday[0].departureDate), "2026-09-21");
    assert.equal(saturday[0].status, "CLOSED");
    assert.equal(saturday[0].bookingOpen, false);
    assert.equal(iso(saturday[1].cargoDeadline), "2026-09-25");
    assert.equal(saturday[1].bookingOpen, true);

    /* Tuesday: Monday's ship has gone and the next one is taking cargo. */
    const tuesday = generateSailings({ now: day("2026-09-22"), count: 1 });
    assert.equal(iso(tuesday[0].departureDate), "2026-09-28");
    assert.equal(iso(tuesday[0].cargoDeadline), "2026-09-25");
  });
});

describe("where a sailing is", () => {
  /* One week to ask every question of: cargo in by Friday 25 September 2026,
     sails Monday the 28th, due about 28 October. */
  const sailing = generatedSailing(day("2026-09-28"), { now: day("2026-09-01") });
  const at = (isoDate: string, hour = 0) =>
    derivedStatus(sailing, new Date(`${isoDate}T${String(hour).padStart(2, "0")}:00:00.000Z`));

  test("open until the cut-off is in sight", () => {
    assert.equal(at("2026-09-20"), "OPEN_FOR_BOOKING");
  });

  test("the last two days say so", () => {
    assert.equal(at("2026-09-24"), "CUTOFF_APPROACHING");
    assert.equal(at("2026-09-25", 12), "CUTOFF_APPROACHING");
  });

  test("a van arriving Friday evening in Guangzhou is still in time", () => {
    /* Friday 23:00 in Guangzhou is 15:00 UTC — the deadline is the end of the
       day where the warehouse is, not the end of the day in UTC. */
    assert.equal(at("2026-09-25", 15), "CUTOFF_APPROACHING");
    assert.equal(at("2026-09-25", 17), "CLOSED");
  });

  test("closed, departed, in transit, arrived", () => {
    assert.equal(at("2026-09-27"), "CLOSED");
    assert.equal(at("2026-09-28"), "DEPARTED");
    assert.equal(at("2026-10-05"), "IN_TRANSIT");
    assert.equal(at("2026-10-28"), "ARRIVED");
  });

  test("a status a person set is not argued with by the clock", () => {
    const delayed = { ...sailing, status: "DELAYED" as const };
    assert.equal(derivedStatus(delayed, day("2026-09-20")), "OPEN_FOR_BOOKING");
    /* …but the merge keeps DELAYED, which is what the page shows. */
    const cancelled = generatedSailing(day("2026-09-28"), { now: day("2026-09-20") });
    assert.equal(cancelled.status, "OPEN_FOR_BOOKING");
  });
});
