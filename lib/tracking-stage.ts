import type { CargoStatus, ContainerStatus } from "@prisma/client";

import { sailingDelay } from "@/lib/eta";

/**
 * WHERE THE CARGO IS, IN THE CUSTOMER'S WORDS.
 *
 * One function turns the record — the cargo's own status history, what the
 * container did, whether the box has a frozen manifest, whether Dar has counted
 * it, whether a price is waiting or a bill has gone out, what has been paid and
 * whether the release check passes — into the stage a customer recognises. The
 * public tracking page and the portal both read it, so the two can never tell
 * the same person two different stories about the same boxes.
 *
 * Pure on purpose: no database, no clock of its own. Everything it knows is
 * passed in, which is what lets the test in tests/tracking-stage.test.ts pin
 * each rule down without a fixture container.
 *
 * TWO GRAINS, AND WHY.
 *
 * `steps` is the spine — nine stations a box passes through, drawn as a line on
 * the page. `stage` is where it is standing RIGHT NOW, and it is finer than the
 * spine because the customer's question is not "which station" but "what is
 * happening to my goods today": waiting for a container, being packed, being
 * counted off the box in Dar, part paid. The headline is the stage's own words,
 * so nobody has to compose a sentence at the call site.
 *
 * WHAT THE DATA CANNOT SAY, AND IS THEREFORE NOT CLAIMED.
 *
 * "Received in China" and "stored in the China warehouse" are one event here:
 * the counter measures and puts the boxes down in the same breath, and there is
 * no put-away scan to make the second a separate fact. One stage carries both.
 *
 * "Price confirmed" and "invoice issued" are also one event — confirming a
 * waiting price issues the bill in the same transaction (lib/price-confirmation
 * .ts), so there is no moment at which a price is agreed and no bill exists.
 * What IS separate, and is shown, is the draft still waiting to be confirmed.
 *
 * Neither is invented. Both are reported to the owner as a missing event rather
 * than guessed at from a status that does not mean it.
 *
 * It says nothing about money beyond "pending", "part paid", "being confirmed"
 * and "paid". The amounts belong behind a sign-in; see lib/tracking.ts for why.
 */

/**
 * The nine stations the drawn line has.
 *
 * FROZEN. The public page keys an icon table and a place-name switch off this
 * union, so a tenth station is a change to that page and not to this file. The
 * finer detail the owner asked for lives in `StageCode`, which no exhaustive
 * switch depends on.
 */
export type StageKey =
  | "RECEIVED_CHINA"
  | "LOADED"
  | "DEPARTED"
  | "AT_SEA"
  | "ARRIVED_DAR"
  | "RECEIVED_DAR"
  | "CLEARANCE"
  | "CLEARED"
  | "INVOICED"
  | "READY"
  | "HANDED_OVER";

/**
 * WHERE IT IS STANDING NOW — the owner's own list of stages.
 *
 * Every one of these is read off a fact somebody recorded: a status, a
 * container's status, a frozen packing list, a receiving row, a draft, an
 * issued bill, verified money, the release check.
 */
export type StageCode =
  /** Nothing has reached the Guangzhou counter under this reference. */
  | "AWAITING_CHINA"
  /** Counted, measured and standing on the Guangzhou floor. */
  | "RECEIVED_CHINA"
  /** On a container's manifest, and the box is still open. */
  | "ASSIGNED"
  /** Sealed: the manifest is frozen and nothing more goes in. */
  | "PACKED"
  /** The box has left Guangzhou. */
  | "SHIPPED"
  | "AT_SEA"
  /** The vessel is in and the box discharged; this consignment is not off it yet. */
  | "ARRIVED_DAR"
  /** Dar has it on the floor and has not signed the count off. */
  | "DAR_VERIFICATION"
  /** The ship is in and customs has the goods, at the port. Not ready, whatever is paid. */
  | "IN_CLEARANCE"
  /** Customs is done; the goods are on their way from the port to our warehouse. */
  | "CLEARED_TO_WAREHOUSE"
  /** Booked in at our warehouse before customs signed off. Still not ready. */
  | "WAREHOUSE_CLEARANCE"
  /** Counted in at Dar. Nothing priced yet. */
  | "RECEIVED_DAR"
  /** A price has been worked out and is waiting on the price list. */
  | "PRICING"
  /** A bill is out, and nothing has been claimed or verified against it. */
  | "PAYMENT_PENDING"
  /** The customer says they have paid; Finance has not checked it. */
  | "CONFIRMING_PAYMENT"
  /** Verified money has arrived, and it is not all of it. */
  | "PART_PAID"
  | "PAID"
  | "READY"
  | "COLLECTED"
  | "DELIVERED"
  | "CANCELLED";

/**
 * SOMETHING IS WRONG WITH THESE BOXES, SAID IN WORDS A CUSTOMER MAY READ.
 *
 * The company's own vocabulary for these is a case file — a reference, a
 * department, a staff note, an evidence folder. None of that crosses. What
 * crosses is which KIND of trouble it is, so a customer whose goods arrived
 * broken is told so rather than vaguely "on hold", and one sentence saying
 * somebody will be in touch.
 */
export type IssueCode =
  /** On the manifest, not on the floor. */
  | "MISSING"
  /** Dar booked it in damaged, wet, or repacked. */
  | "DAMAGED"
  /** Dar's count did not match the manifest. */
  | "DISCREPANCY"
  /** A case is open on the consignment. */
  | "INVESTIGATING"
  /** A hold the warehouse put on for a reason that is not money. */
  | "HOLD";

export type PaymentState =
  | "NOT_BILLED"
  | "PENDING"
  | "PART_PAID"
  | "CONFIRMING"
  | "PAID";

export type JourneyStep = {
  key: StageKey;
  /** English — the page passes it through t(). */
  label: string;
  /** A few English words for a step that is not a bare fact. */
  detail: string | null;
  at: Date | null;
  /**
   * What `at` is the date OF — "Arrived", "Cleared". A bare date under
   * "Arrived in Dar — clearance in progress" read as the day it was cleared.
   */
  atLabel: string;
  state: "done" | "current" | "upcoming";
};

export type Journey = {
  /** Where the boxes are standing now, at the owner's grain. */
  stage: StageCode;
  /** `stage`'s own words, or the trouble's. The page renders this as it is. */
  headline: string;
  tone: "neutral" | "progress" | "good" | "warn" | "bad";
  steps: JourneyStep[];
  payment: PaymentState;
  /** Null while nothing is wrong. Never carries a case reference or a note. */
  issue: IssueCode | null;
  /** The release check said yes, or the goods have already gone. */
  ready: boolean;
  /** The promised arrival, only while the box has not arrived. */
  eta: Date | null;
  /** The promise has passed and the box is still at sea. */
  etaPassed: boolean;
  /** Whole days past the promised arrival. Zero unless `etaPassed`. */
  lateByDays: number;
  /** Null while nothing stops the cargo moving. */
  notice: string | null;
};

export type JourneyInput = {
  status: CargoStatus;
  /** First time the cargo entered each status, from CargoStatusHistory. */
  stamps: Partial<Record<CargoStatus, Date>>;
  container: {
    status: ContainerStatus;
    departedAt: Date | null;
    arrivedAt: Date | null;
    eta: Date | null;
    /**
     * When the manifest froze. Sealing issues it without anybody pressing
     * anything, so this is also the honest answer to "is the box shut".
     */
    packingListAt: Date | null;
  } | null;
  billing: {
    /** When the first live (issued, not cancelled) invoice went out. Null: none yet. */
    issuedAt: Date | null;
    /** Verified payments do not yet cover the live invoices. */
    owes: boolean;
    /** The customer has told us about a payment Finance has not checked. */
    pendingClaim: boolean;
    /** Verified money has arrived against a live bill. */
    paidSome: boolean;
    /** A price is worked out and waiting to be confirmed. No bill exists yet. */
    drafted: boolean;
  };
  /** lib/release.ts said yes. */
  releasable: boolean;
  /** An operational hold, or an open case. */
  onHold: boolean;
  /** Dar has a receiving row for this consignment. */
  receivedAtDar: boolean;
  /**
   * Customs clearance, at the port. It starts when the ship is in and the
   * box discharged, and clearedAt is when it finished — before the goods are
   * brought to our warehouse. Left out, the consignment is treated as cleared — the
   * shape records had before clearance was its own step.
   */
  clearance?: { clearedAt: Date | null };
  /** Dar has a receiving row and has not signed the count off. */
  awaitingDarVerification: boolean;
  /** Dar booked the boxes in damaged, part damaged or wet. Repacked is not damage. */
  damaged: boolean;
  /** Dar's count or condition did not match what the manifest promised. */
  discrepancy: boolean;
  /** A case is open on this consignment. Never which case. */
  caseOpen: boolean;
  now: Date;
};

/* The physical chain, in order. A later status implies every earlier one — a
   consignment received in Dar was loaded in Guangzhou even if the history row
   for loading is missing from a migrated record. */
const RANK: Record<CargoStatus, number> = {
  REGISTERED: 0,
  RECEIVED_CHINA: 1,
  ASSIGNED_TO_CONTAINER: 2,
  CONTAINER_LOADED: 2,
  DEPARTED_CHINA: 3,
  IN_TRANSIT: 4,
  ARRIVED_TANZANIA: 5,
  /* Did not come off the container: it got as far as the box arriving, and no
     further. Never ranked as received. */
  MISSING_AT_DAR: 5,
  RECEIVED_DAR: 6,
  READY_FOR_RELEASE: 6,
  COLLECTED: 6,
  DELIVERED: 6,
  /* An exit, not a place. What it reached before is read from the stamps. */
  CANCELLED: 0,
};

const CONTAINER_RANK: Record<ContainerStatus, number> = {
  OPEN: 0,
  LOADING: 0,
  LOADED: 2,
  SEALED: 2,
  DEPARTED: 3,
  IN_TRANSIT: 4,
  ARRIVED: 5,
  CLOSED: 5,
};

function stampedRank(stamps: JourneyInput["stamps"]) {
  let best = 0;
  for (const [status, at] of Object.entries(stamps)) {
    if (!at) continue;
    const rank = RANK[status as CargoStatus];
    if (status !== "CANCELLED" && status !== "MISSING_AT_DAR" && rank > best) {
      best = rank;
    }
  }
  return best;
}

export function paymentState(billing: JourneyInput["billing"]): PaymentState {
  if (!billing.issuedAt) return "NOT_BILLED";
  if (!billing.owes) return "PAID";
  /* A claim Finance has not checked leads whatever else has landed: the
     customer's question is about the money they say they sent, and answering
     "part paid" to somebody waiting on a screenshot reads as a refusal. */
  if (billing.pendingClaim) return "CONFIRMING";
  return billing.paidSome ? "PART_PAID" : "PENDING";
}

/** What each stage is called on a customer's screen. English is the key. */
const STAGE_LABEL: Record<StageCode, string> = {
  AWAITING_CHINA: "Waiting for your goods in Guangzhou",
  RECEIVED_CHINA: "Received and stored in our Guangzhou warehouse",
  ASSIGNED: "Assigned to a container in Guangzhou",
  PACKED: "Container packed and sealed in Guangzhou",
  SHIPPED: "Shipped from China",
  AT_SEA: "At sea",
  ARRIVED_DAR: "Arrived in Dar es Salaam",
  DAR_VERIFICATION: "Arrived in Dar — being checked in",
  IN_CLEARANCE: "At Dar port — clearance in progress",
  CLEARED_TO_WAREHOUSE: "Cleared — on the way to our Dar warehouse",
  WAREHOUSE_CLEARANCE: "At our Dar warehouse — clearance in progress",
  RECEIVED_DAR: "At our Dar warehouse — invoice being prepared",
  PRICING: "At our Dar warehouse — price being confirmed",
  PAYMENT_PENDING: "At our Dar warehouse — payment required before pickup",
  CONFIRMING_PAYMENT: "At our Dar warehouse — confirming your payment",
  PART_PAID: "At our Dar warehouse — balance due before pickup",
  PAID: "At our Dar warehouse — paid, pickup note being prepared",
  READY: "Ready for pickup",
  COLLECTED: "Collected",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
};

const STAGE_TONE: Record<StageCode, Journey["tone"]> = {
  AWAITING_CHINA: "neutral",
  RECEIVED_CHINA: "progress",
  ASSIGNED: "progress",
  PACKED: "progress",
  SHIPPED: "progress",
  AT_SEA: "progress",
  ARRIVED_DAR: "progress",
  DAR_VERIFICATION: "progress",
  IN_CLEARANCE: "progress",
  CLEARED_TO_WAREHOUSE: "progress",
  WAREHOUSE_CLEARANCE: "progress",
  RECEIVED_DAR: "progress",
  PRICING: "progress",
  PAYMENT_PENDING: "warn",
  CONFIRMING_PAYMENT: "progress",
  PART_PAID: "warn",
  PAID: "progress",
  READY: "good",
  COLLECTED: "good",
  DELIVERED: "good",
  CANCELLED: "bad",
};

/** The trouble, named without naming the case. */
const ISSUE_HEADLINE: Record<IssueCode, string> = {
  MISSING: "Being located",
  DAMAGED: "Damage recorded",
  DISCREPANCY: "Checking the count",
  INVESTIGATING: "Under review",
  HOLD: "On hold",
};

const ISSUE_NOTICE: Record<IssueCode, string> = {
  MISSING: "Our team is checking this consignment and will contact you.",
  DAMAGED:
    "We recorded damage when we counted these goods in. Our team will contact you about it.",
  DISCREPANCY:
    "The count did not match our paperwork. We are checking it and will contact you.",
  INVESTIGATING:
    "We are looking into something on this consignment. Our team will be in touch.",
  HOLD: "We are checking something on this consignment. Our team will be in touch.",
};

/**
 * Which trouble to say, when there is more than one.
 *
 * Worst first, and "worst" is whatever changes the customer's day most: boxes
 * nobody can find, then boxes that arrived broken, then a count that does not
 * add up, then an open question, then a hold.
 */
function issueOf(input: JourneyInput): IssueCode | null {
  if (input.status === "MISSING_AT_DAR") return "MISSING";
  if (input.damaged) return "DAMAGED";
  if (input.discrepancy) return "DISCREPANCY";
  if (input.caseOpen) return "INVESTIGATING";
  if (input.onHold) return "HOLD";
  return null;
}

/**
 * WHERE IT IS STANDING, FROM THE FACTS AND NOTHING ELSE.
 *
 * Read top to bottom: the finished states first, then money — which only ever
 * speaks for goods already counted in at Dar — then the physical chain
 * backwards from the quay to the Guangzhou counter.
 */
function stageOf(
  input: JourneyInput,
  rank: number,
  payment: PaymentState,
  ready: boolean
): StageCode {
  const { status, container, billing } = input;

  if (status === "CANCELLED") return "CANCELLED";
  if (status === "DELIVERED") return "DELIVERED";
  if (status === "COLLECTED") return "COLLECTED";
  if (ready) return "READY";

  /*
    CLEARED IS WHERE MONEY SPEAKS — by the owner's decision.

    Clearance is when the goods enter our warehouse's flow and storage starts.
    The Dar warehouse checking them in afterwards is internal verification:
    the customer is never shown a check-in stage, and it does not hold back
    their payment status. A record from before clearance was recorded has no
    clearance to read, and being booked in stands for it.
  */
  const cleared = input.clearance
    ? input.clearance.clearedAt !== null
    : rank >= 6 && input.receivedAtDar;

  if (rank >= 5 && cleared && status !== "MISSING_AT_DAR") {
    switch (payment) {
      case "PAID":
        return "PAID";
      case "PART_PAID":
        return "PART_PAID";
      case "CONFIRMING":
        return "CONFIRMING_PAYMENT";
      case "PENDING":
        return "PAYMENT_PENDING";
      case "NOT_BILLED":
        return billing.drafted ? "PRICING" : "RECEIVED_DAR";
    }
  }

  /* Landed and still with customs — at the port, or already on our floor
     because the team booked it in during inspection. */
  if (rank >= 6 && input.receivedAtDar && status !== "MISSING_AT_DAR") {
    return "WAREHOUSE_CLEARANCE";
  }
  if (rank >= 5 && input.clearance && input.status !== "MISSING_AT_DAR") {
    return "IN_CLEARANCE";
  }
  if (rank >= 5) return "ARRIVED_DAR";
  if (rank >= 4) return "AT_SEA";
  if (rank >= 3) return "SHIPPED";
  if (rank >= 2) {
    /* The seal is the fact, and sealing freezes the manifest without anybody
       pressing anything — so a frozen list means the box is shut even if the
       consignment row has not caught up with the bulk status change. */
    return container?.packingListAt || status === "CONTAINER_LOADED"
      ? "PACKED"
      : "ASSIGNED";
  }
  if (rank >= 1) return "RECEIVED_CHINA";
  return "AWAITING_CHINA";
}

export function publicJourney(input: JourneyInput): Journey {
  const { status, stamps, container, billing, now } = input;

  const handedOver = status === "COLLECTED" || status === "DELIVERED";
  const cancelled = status === "CANCELLED";

  /*
    HOW FAR IT PHYSICALLY GOT.

    The cargo's own status, or the container's when the container has moved on
    and the consignment row has not caught up yet — a box cannot be at sea
    while the cargo inside it is still on the Guangzhou floor. A cancelled
    consignment keeps what its history proves and nothing more.
  */
  const containerRank = !container || cancelled
    ? 0
    : Math.max(
        CONTAINER_RANK[container.status],
        container.departedAt ? 3 : 0,
        container.arrivedAt ? 5 : 0
      );
  let rank = Math.max(
    cancelled ? 0 : RANK[status],
    stampedRank(stamps),
    containerRank
  );
  /* The container arriving is not the consignment being received: only the
     cargo's own record can say it came off the box. A consignment now marked
     missing keeps no older stamp that claims otherwise. */
  if (status === "MISSING_AT_DAR") rank = Math.min(rank, 5);

  const payment = paymentState(billing);
  const invoiced = payment !== "NOT_BILLED";
  const ready = !cancelled && (input.releasable || handedOver);
  const stage = stageOf(input, rank, payment, ready);
  const issue = cancelled ? null : issueOf(input);

  const arrivedAt =
    container?.arrivedAt ?? stamps.ARRIVED_TANZANIA ?? null;
  const departedAt =
    container?.departedAt ?? stamps.DEPARTED_CHINA ?? null;

  const reached: Record<StageKey, boolean> = {
    RECEIVED_CHINA: rank >= 1 || ready,
    LOADED: rank >= 2 || ready,
    DEPARTED: rank >= 3 || ready,
    AT_SEA: rank >= 3 || ready,
    ARRIVED_DAR: rank >= 5 || ready,
    /* Customs happens at the port, before our warehouse. A record from before
       clearance was a step (no clearance given) passes through it as done. */
    CLEARANCE: (rank >= 5 && status !== "MISSING_AT_DAR") || ready,
    CLEARED:
      ready ||
      (input.clearance
        ? input.clearance.clearedAt !== null
        : rank >= 6 && input.receivedAtDar),
    RECEIVED_DAR: rank >= 6 || ready,
    /* A release needs a bill, so ready implies invoiced. Invoicing does not
       imply any physical step — a bill can go out while the box is at sea. */
    INVOICED: invoiced || ready,
    READY: ready,
    HANDED_OVER: handedOver,
  };

  const paymentDetail: Record<PaymentState, string | null> = {
    NOT_BILLED: null,
    PENDING: "Payment pending",
    PART_PAID: "Part paid — a balance is still due",
    CONFIRMING: "We are confirming your payment",
    PAID: "Paid",
  };

  const etaOpen = container?.eta && !reached.ARRIVED_DAR ? container.eta : null;

  /*
    THIRTY DAYS IS THE PROMISE; THE THIRTY-FIRST IS A DELAY.

    Whole days, so a box due on the 22nd reads "expected" all that day and
    "delayed" on the 23rd — a customer told at ten in the morning that their
    cargo is late, on the very day they were promised it, is being told
    something untrue by a clock. The word is the owner's: not "running later
    than planned", which is what a company says when it does not want to say
    delayed.
  */
  const delay = sailingDelay({
    eta: etaOpen,
    arrived: container?.arrivedAt ?? null,
    atSea: !reached.ARRIVED_DAR,
    now,
  });

  /*
    THE FIVE STEPS A CUSTOMER FOLLOWS — the owner's list.

    Received in Guangzhou, in transit, arrived in Dar and in clearance,
    cleared and ready for pickup, collected. What happens inside our walls
    between them — loading onto a container, sealing it, booking it into the
    Dar warehouse — is ours, not a milestone for the customer: it said the same
    thing twice ("Departed China", then "At sea") and left a customer reading
    ten stations for a journey of five. The facts behind every step are the
    same records as before; only fewer are shown.
  */
  const draft: Omit<JourneyStep, "state">[] = [
    {
      key: "RECEIVED_CHINA",
      label: "Received in Guangzhou",
      detail: null,
      at: stamps.RECEIVED_CHINA ?? null,
      atLabel: "Received",
    },
    {
      key: "AT_SEA",
      label: "In transit",
      /* The expected day is printed by the page beside this step; only a date
         that has already gone by needs words. */
      detail: delay.late ? "Delayed" : null,
      at: departedAt,
      atLabel: "Left China",
    },
    {
      key: "CLEARANCE",
      label: "Arrived in Dar — clearance in progress",
      detail: null,
      at: arrivedAt,
      atLabel: "Arrived",
    },
    /* Cleared and ready are one step to the customer (the owner's word): once
       customs lets the goods go they are there to collect. Release is still
       computed — an unpaid bill keeps them — so the step says, in a few words,
       what is left to do. */
    {
      key: "CLEARED",
      label: "Cleared — ready for pickup",
      detail: ready
        ? "Bring your ID to collect"
        : reached.CLEARED && !handedOver && payment !== "PAID"
          ? "Pay first, then collect"
          : null,
      at: input.clearance?.clearedAt ?? stamps.READY_FOR_RELEASE ?? null,
      atLabel: "Cleared",
    },
    {
      key: "HANDED_OVER",
      label: status === "DELIVERED" ? "Delivered" : "Collected",
      detail: null,
      at: stamps.DELIVERED ?? stamps.COLLECTED ?? null,
      atLabel: status === "DELIVERED" ? "Delivered" : "Collected",
    },
  ];

  /* The line is the goods' physical journey. Money is not a place — a bill
     can go out while the ship is at sea — so it is reported beside the line
     (payment), never as a station on it. */
  /* Booked into our warehouse before customs signed off: the goods are on
     our floor, but clearance is what they are waiting on, so that is where
     the marker stands. */
  const lastReached =
    stage === "WAREHOUSE_CLEARANCE"
      ? draft.findIndex((step) => step.key === "CLEARANCE")
      : draft.reduce((last, step, index) => (reached[step.key] ? index : last), -1);

  const steps: JourneyStep[] = draft.map((step, index) => ({
    ...step,
    state: reached[step.key]
      ? index === lastReached && !handedOver && !cancelled
        ? "current"
        : "done"
      : "upcoming",
  }));

  /*
    WHAT THE BADGE SAYS.

    The stage, unless something is wrong AND the wrong thing still stands
    between the customer and their goods. Damage recorded on boxes the release
    check has already cleared is a conversation, not a barrier: that customer
    reads "Ready for collection" with the damage in the notice under it, rather
    than being sent away by a badge.
  */
  const blocking = issue !== null && !ready && !handedOver;
  const headline = blocking ? ISSUE_HEADLINE[issue] : STAGE_LABEL[stage];

  const notice = cancelled
    ? "This consignment was cancelled. Contact us if that is not what you expected."
    : issue !== null
      ? ISSUE_NOTICE[issue]
      : null;

  return {
    stage,
    headline,
    tone: cancelled
      ? "bad"
      : issue !== null && !handedOver
        ? "warn"
        : STAGE_TONE[stage],
    steps,
    payment,
    issue,
    ready,
    eta: etaOpen,
    etaPassed: delay.late,
    lateByDays: delay.days,
    notice,
  };
}
