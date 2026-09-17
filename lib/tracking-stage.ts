import type { CargoStatus, ContainerStatus } from "@prisma/client";

/**
 * WHERE THE CARGO IS, IN THE CUSTOMER'S WORDS.
 *
 * One function turns the record — the cargo's own status history, what the
 * container did, whether a bill has been issued and paid, and whether the
 * release check passes — into the nine steps a customer recognises. The public
 * tracking page and the portal both read it, so the two can never tell the same
 * person two different stories about the same boxes.
 *
 * Pure on purpose: no database, no clock of its own. Everything it knows is
 * passed in, which is what lets the test in tests/tracking-stage.test.ts pin
 * each rule down without a fixture container.
 *
 * It says nothing about money beyond "pending", "being confirmed" and "paid".
 * The amounts belong behind a sign-in; see lib/tracking.ts for why.
 */

export type StageKey =
  | "RECEIVED_CHINA"
  | "LOADED"
  | "DEPARTED"
  | "AT_SEA"
  | "ARRIVED_DAR"
  | "RECEIVED_DAR"
  | "INVOICED"
  | "READY"
  | "HANDED_OVER";

export type PaymentState = "NOT_BILLED" | "PENDING" | "CONFIRMING" | "PAID";

export type JourneyStep = {
  key: StageKey;
  /** English — the page passes it through t(). */
  label: string;
  /** A short English explanation for a step that is not a bare fact. */
  detail: string | null;
  at: Date | null;
  state: "done" | "current" | "upcoming";
};

export type Journey = {
  headline: string;
  tone: "neutral" | "progress" | "good" | "warn" | "bad";
  steps: JourneyStep[];
  payment: PaymentState;
  /** The promised arrival, only while the box has not arrived. */
  eta: Date | null;
  /** The promise has passed and the box is still at sea. */
  etaPassed: boolean;
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
  } | null;
  billing: {
    /** When the first live (issued, not cancelled) invoice went out. Null: none yet. */
    issuedAt: Date | null;
    /** Verified payments do not yet cover the live invoices. */
    owes: boolean;
    /** The customer has told us about a payment Finance has not checked. */
    pendingClaim: boolean;
  };
  /** lib/release.ts said yes. */
  releasable: boolean;
  /** An operational hold or an open case — never which one. */
  onHold: boolean;
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
  return billing.pendingClaim ? "CONFIRMING" : "PENDING";
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
    CONFIRMING: "We are confirming your payment",
    PAID: "Paid",
  };

  const etaOpen = container?.eta && !reached.ARRIVED_DAR ? container.eta : null;

  const draft: Omit<JourneyStep, "state">[] = [
    {
      key: "RECEIVED_CHINA",
      label: "Received at our Guangzhou warehouse",
      detail: null,
      at: stamps.RECEIVED_CHINA ?? null,
    },
    {
      key: "LOADED",
      label: "Loaded into a container",
      detail: null,
      at: stamps.ASSIGNED_TO_CONTAINER ?? stamps.CONTAINER_LOADED ?? null,
    },
    {
      key: "DEPARTED",
      label: "Departed China",
      detail: null,
      at: departedAt,
    },
    {
      key: "AT_SEA",
      label: "At sea",
      detail: reached.ARRIVED_DAR
        ? null
        : etaOpen
          ? etaOpen.getTime() < now.getTime()
            ? "Running later than planned — we will update the date"
            : "Expected in Dar es Salaam"
          : null,
      at: reached.ARRIVED_DAR ? null : etaOpen,
    },
    {
      key: "ARRIVED_DAR",
      label: "Arrived in Dar es Salaam",
      detail: null,
      at: arrivedAt,
    },
    {
      key: "RECEIVED_DAR",
      label: "Received at our Dar warehouse",
      detail: null,
      at: stamps.RECEIVED_DAR ?? null,
    },
    {
      key: "INVOICED",
      label: "Invoice issued",
      detail: paymentDetail[payment],
      at: billing.issuedAt,
    },
    {
      key: "READY",
      label: "Ready for collection",
      detail: null,
      at: stamps.READY_FOR_RELEASE ?? null,
    },
    {
      key: "HANDED_OVER",
      label: status === "DELIVERED" ? "Delivered" : "Collected",
      detail: null,
      at: stamps.DELIVERED ?? stamps.COLLECTED ?? null,
    },
  ];

  const lastReached = draft.reduce(
    (last, step, index) => (reached[step.key] ? index : last),
    -1
  );

  const steps: JourneyStep[] = draft.map((step, index) => ({
    ...step,
    state: reached[step.key]
      ? index === lastReached && !handedOver && !cancelled
        ? "current"
        : "done"
      : "upcoming",
  }));

  let headline: string;
  let tone: Journey["tone"];
  let notice: string | null = null;

  if (cancelled) {
    headline = "Cancelled";
    tone = "bad";
    notice = "This consignment was cancelled. Contact us if that is not what you expected.";
  } else if (handedOver) {
    headline = status === "DELIVERED" ? "Delivered" : "Collected";
    tone = "good";
  } else if (status === "MISSING_AT_DAR") {
    headline = "Being located";
    tone = "warn";
    notice = "Our team is checking this consignment and will contact you.";
  } else if (ready) {
    headline = "Ready for collection";
    tone = "good";
  } else if (input.onHold) {
    headline = "On hold";
    tone = "warn";
    notice = "We are checking something on this consignment. Our team will be in touch.";
  } else if (reached.RECEIVED_DAR) {
    headline =
      payment === "PENDING"
        ? "At our Dar warehouse — payment pending"
        : payment === "CONFIRMING"
          ? "At our Dar warehouse — confirming your payment"
          : payment === "NOT_BILLED"
            ? "At our Dar warehouse — invoice being prepared"
            : "At our Dar warehouse";
    tone = payment === "PENDING" ? "warn" : "progress";
  } else if (reached.ARRIVED_DAR) {
    headline = "Arrived in Dar es Salaam";
    tone = "progress";
  } else if (reached.DEPARTED) {
    headline = "At sea";
    tone = "progress";
  } else if (reached.LOADED) {
    headline = "Loaded in Guangzhou";
    tone = "progress";
  } else if (reached.RECEIVED_CHINA) {
    headline = "Received in Guangzhou";
    tone = "progress";
  } else {
    headline = "Waiting for your goods in Guangzhou";
    tone = "neutral";
  }

  return {
    headline,
    tone,
    steps,
    payment,
    eta: etaOpen,
    etaPassed: Boolean(etaOpen && etaOpen.getTime() < now.getTime()),
    notice,
  };
}
