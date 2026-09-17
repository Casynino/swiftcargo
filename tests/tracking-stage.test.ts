import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  publicJourney,
  type JourneyInput,
  type StageKey,
} from "@/lib/tracking-stage";

const NOW = new Date("2026-09-17T10:00:00Z");
const day = (n: number) => new Date(NOW.getTime() + n * 86_400_000);

function input(over: Partial<JourneyInput> = {}): JourneyInput {
  return {
    status: "REGISTERED",
    stamps: {},
    container: null,
    billing: { issuedAt: null, owes: false, pendingClaim: false },
    releasable: false,
    onHold: false,
    now: NOW,
    ...over,
  };
}

const state = (j: ReturnType<typeof publicJourney>, key: StageKey) =>
  j.steps.find((s) => s.key === key)!.state;

describe("public journey", () => {
  test("nothing received yet: every step upcoming", () => {
    const j = publicJourney(input());
    assert.equal(j.headline, "Waiting for your goods in Guangzhou");
    assert.ok(j.steps.every((s) => s.state === "upcoming"));
    assert.equal(j.payment, "NOT_BILLED");
  });

  test("received in China is the current step, stamped from history", () => {
    const j = publicJourney(
      input({ status: "RECEIVED_CHINA", stamps: { RECEIVED_CHINA: day(-3) } })
    );
    assert.equal(j.headline, "Received in Guangzhou");
    assert.equal(state(j, "RECEIVED_CHINA"), "current");
    assert.equal(state(j, "LOADED"), "upcoming");
    assert.deepEqual(j.steps[0].at, day(-3));
  });

  test("at sea shows the ETA and not an arrival", () => {
    const j = publicJourney(
      input({
        status: "IN_TRANSIT",
        container: { status: "IN_TRANSIT", departedAt: day(-10), arrivedAt: null, eta: day(18) },
      })
    );
    assert.equal(j.headline, "At sea");
    assert.equal(state(j, "DEPARTED"), "done");
    assert.equal(state(j, "AT_SEA"), "current");
    assert.equal(state(j, "ARRIVED_DAR"), "upcoming");
    assert.deepEqual(j.eta, day(18));
    assert.equal(j.etaPassed, false);
    /* Loading is implied even with no history row for it. */
    assert.equal(state(j, "LOADED"), "done");
  });

  test("a passed ETA is admitted rather than shown as a date in the past", () => {
    const j = publicJourney(
      input({
        status: "IN_TRANSIT",
        container: { status: "IN_TRANSIT", departedAt: day(-40), arrivedAt: null, eta: day(-2) },
      })
    );
    assert.equal(j.etaPassed, true);
    assert.match(j.steps.find((s) => s.key === "AT_SEA")!.detail ?? "", /later than planned/);
  });

  test("the container moving ahead of the cargo row still moves the customer's view", () => {
    const j = publicJourney(
      input({
        status: "CONTAINER_LOADED",
        container: { status: "DEPARTED", departedAt: day(-1), arrivedAt: null, eta: day(28) },
      })
    );
    assert.equal(j.headline, "At sea");
  });

  test("a container that arrived does not make the consignment received", () => {
    const j = publicJourney(
      input({
        status: "ARRIVED_TANZANIA",
        container: { status: "ARRIVED", departedAt: day(-30), arrivedAt: day(-1), eta: day(-2) },
      })
    );
    assert.equal(j.headline, "Arrived in Dar es Salaam");
    assert.equal(state(j, "RECEIVED_DAR"), "upcoming");
    assert.equal(j.eta, null, "no ETA once arrived");
  });

  test("received at Dar with an unpaid bill says payment pending, no amount", () => {
    const j = publicJourney(
      input({
        status: "RECEIVED_DAR",
        billing: { issuedAt: day(-1), owes: true, pendingClaim: false },
      })
    );
    assert.equal(j.headline, "At our Dar warehouse — payment pending");
    assert.equal(j.payment, "PENDING");
    assert.equal(state(j, "INVOICED"), "current");
    assert.equal(j.steps.find((s) => s.key === "INVOICED")!.detail, "Payment pending");
    const text = [j.headline, j.notice, ...j.steps.flatMap((s) => [s.label, s.detail])].join(" ");
    assert.ok(!/\d/.test(text), "no figures in anything a stranger reads");
  });

  test("a claimed payment is being confirmed, not paid", () => {
    const j = publicJourney(
      input({
        status: "RECEIVED_DAR",
        billing: { issuedAt: day(-1), owes: true, pendingClaim: true },
      })
    );
    assert.equal(j.payment, "CONFIRMING");
    assert.notEqual(j.headline, "Ready for collection");
  });

  test("received and not yet billed", () => {
    const j = publicJourney(input({ status: "RECEIVED_DAR" }));
    assert.equal(j.headline, "At our Dar warehouse — invoice being prepared");
    assert.equal(state(j, "INVOICED"), "upcoming");
  });

  test("checked in at Dar with no container on record", () => {
    /* Cargo that was already on the Dar floor when the system started: one
       history row, no sailing. The earlier steps are implied by being received,
       and none of them is given a date nobody recorded. */
    const j = publicJourney(
      input({ status: "RECEIVED_DAR", stamps: { RECEIVED_DAR: day(-1) } })
    );
    for (const key of ["RECEIVED_CHINA", "LOADED", "DEPARTED", "AT_SEA", "ARRIVED_DAR"] as StageKey[]) {
      assert.equal(state(j, key), "done", key);
      assert.equal(j.steps.find((s) => s.key === key)!.at, null, key);
    }
    assert.equal(state(j, "RECEIVED_DAR"), "current");
    assert.deepEqual(j.steps.find((s) => s.key === "RECEIVED_DAR")!.at, day(-1));
    assert.equal(state(j, "INVOICED"), "upcoming");
    assert.equal(state(j, "HANDED_OVER"), "upcoming");
    assert.equal(j.eta, null);
  });

  test("ready is only what the release check says", () => {
    const paidButNotReleasable = publicJourney(
      input({
        status: "READY_FOR_RELEASE",
        billing: { issuedAt: day(-2), owes: false, pendingClaim: false },
        releasable: false,
      })
    );
    assert.notEqual(paidButNotReleasable.headline, "Ready for collection");
    assert.equal(state(paidButNotReleasable, "READY"), "upcoming");

    const releasable = publicJourney(
      input({
        status: "RECEIVED_DAR",
        billing: { issuedAt: day(-2), owes: false, pendingClaim: false },
        releasable: true,
      })
    );
    assert.equal(releasable.headline, "Ready for collection");
    assert.equal(state(releasable, "READY"), "current");
    assert.equal(state(releasable, "INVOICED"), "done");
  });

  test("a hold outranks progress and never says why", () => {
    const j = publicJourney(
      input({
        status: "RECEIVED_DAR",
        billing: { issuedAt: day(-2), owes: false, pendingClaim: false },
        onHold: true,
      })
    );
    assert.equal(j.headline, "On hold");
    assert.equal(j.tone, "warn");
    assert.ok(j.notice);
  });

  test("missing at Dar is being located, never received", () => {
    const j = publicJourney(
      input({
        status: "MISSING_AT_DAR",
        stamps: { RECEIVED_CHINA: day(-40) },
        container: { status: "ARRIVED", departedAt: day(-30), arrivedAt: day(-2), eta: day(-3) },
      })
    );
    assert.equal(j.headline, "Being located");
    assert.equal(state(j, "ARRIVED_DAR"), "current");
    assert.equal(state(j, "RECEIVED_DAR"), "upcoming");
  });

  test("collected and delivered close every step", () => {
    const collected = publicJourney(
      input({
        status: "COLLECTED",
        billing: { issuedAt: day(-5), owes: false, pendingClaim: false },
        stamps: { COLLECTED: day(-1) },
      })
    );
    assert.equal(collected.headline, "Collected");
    assert.ok(collected.steps.every((s) => s.state === "done"));

    const delivered = publicJourney(
      input({ status: "DELIVERED", billing: { issuedAt: day(-5), owes: false, pendingClaim: false } })
    );
    assert.equal(delivered.steps.at(-1)!.label, "Delivered");
  });

  test("cancelled keeps what history proves and nothing current", () => {
    const j = publicJourney(
      input({ status: "CANCELLED", stamps: { RECEIVED_CHINA: day(-3) } })
    );
    assert.equal(j.headline, "Cancelled");
    assert.equal(state(j, "RECEIVED_CHINA"), "done");
    assert.equal(state(j, "LOADED"), "upcoming");
    assert.ok(!j.steps.some((s) => s.state === "current"));
  });
});
