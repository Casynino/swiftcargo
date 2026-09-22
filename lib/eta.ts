/**
 * WHEN THE BOX IS DUE, AND WHEN IT IS LATE.
 *
 * The lane has one habit: thirty-five days from the day the box leaves
 * Guangzhou. That is the promise the customer is given the moment departure is
 * pressed, so it is computed from the departure date rather than typed — a
 * clerk asked for an arrival date types the day they are thinking of, and a
 * customer holds us to it either way.
 *
 * It is a promise, not a fact. Days one to thirty-five are the crossing; on the
 * thirty-sixth, with the box still at sea, the sailing is delayed and everybody
 * who can see the container — staff on the page, the customer on the tracking
 * link — is told so in the same word. A shipping line that says otherwise is
 * the reason the date stays editable.
 */
const DAY_MS = 24 * 60 * 60 * 1000;

/** The owner's figure for this lane, and the only one a departure promises. */
export const SEA_TRANSIT_DAYS = 35;

export function expectedArrival(
  departure: Date,
  transitDays: number = SEA_TRANSIT_DAYS
): Date {
  return new Date(departure.getTime() + transitDays * DAY_MS);
}

/**
 * How late a sailing is, counted in whole days past the promise.
 *
 * Nothing is late until the promised day has fully passed: a box due on the
 * 22nd is on time all day on the 22nd, and late on the 23rd. Whole days only,
 * because "delayed by 0.4 days" is not something anybody says out loud.
 *
 * A box that has landed cannot be late, whatever the calendar says — the
 * question it answers is "where is my cargo", and the answer is "here".
 */
export function sailingDelay(input: {
  eta: Date | null | undefined;
  /** The day it actually landed. Set means the crossing is over. */
  arrived?: Date | null;
  /** Still at sea? A box that never sailed is not late either. */
  atSea: boolean;
  now?: Date;
}): { late: boolean; days: number; eta: Date | null } {
  const eta = input.eta ?? null;
  const now = input.now ?? new Date();
  if (!eta || input.arrived || !input.atSea) return { late: false, days: 0, eta };

  /* Whole days between the two, on the calendar day rather than the hour: a
     departure recorded at nine in the morning must not make a box "late" at
     nine in the morning thirty days later and on time at eight. */
  const days = Math.floor((startOfDay(now) - startOfDay(eta)) / DAY_MS);
  return { late: days > 0, days: days > 0 ? days : 0, eta };
}

function startOfDay(value: Date): number {
  return Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate());
}

/** The container statuses that mean the box is on the water. */
export const AT_SEA_STATUSES = ["DEPARTED", "IN_TRANSIT"] as const;
