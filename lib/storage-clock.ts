/**
 * THE STORAGE CLOCK.
 *
 * It starts the moment the goods are marked CLEARED, by the owner's decision —
 * cleared is when they enter the Dar warehouse's operational flow — and at
 * nothing else: not the Dar warehouse checking them in (that is an internal
 * verification that never moves the date), not the price, not the invoice,
 * not the payment, not the ship's arrival. Days are counted on the Dar es
 * Salaam calendar (UTC+3, no summer time), so goods cleared at 01:00 local time
 * are on their first day, not the previous one's.
 *
 * Day 1 is the day it was cleared. With seven free days, day 7 is the last free
 * one and day 8 is the first that may be charged.
 *
 * Pure: the caller supplies the settings and the clock.
 */

const DAR_OFFSET_MS = 3 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Days since the epoch on the Dar es Salaam calendar. */
function darDay(at: Date) {
  return Math.floor((at.getTime() + DAR_OFFSET_MS) / DAY_MS);
}

/** Midday, Dar time, on a Dar calendar day — safe to format in any zone. */
function dateOfDarDay(day: number) {
  return new Date(day * DAY_MS - DAR_OFFSET_MS + 12 * 60 * 60 * 1000);
}

export type StorageState = {
  arrivedAt: Date;
  freeDays: number;
  /** Which day of storage today is, from 1. */
  dayNumber: number;
  /** Free days left, today included. Zero once the free period is over. */
  daysRemaining: number;
  lastFreeDay: Date;
  expired: boolean;
  /** Days past the free period, today included. */
  chargeableDays: number;
  /** The configured rate, or null when storage is not charged. */
  perDay: number | null;
  currency: string;
  /** chargeableDays × perDay, or null when there is no rate. */
  accrued: number | null;
};

export function storageState(input: {
  arrivedAt: Date;
  freeDays: number;
  perDay: number | string | { toString(): string } | null | undefined;
  currency: string;
  now: Date;
}): StorageState {
  const freeDays = Math.max(0, Math.floor(input.freeDays));
  const start = darDay(input.arrivedAt);
  const dayNumber = Math.max(1, darDay(input.now) - start + 1);
  const daysRemaining = Math.max(0, freeDays - dayNumber + 1);
  const chargeableDays = Math.max(0, dayNumber - freeDays);
  const rate = input.perDay == null ? 0 : Number(input.perDay.toString());
  const perDay = Number.isFinite(rate) && rate > 0 ? rate : null;

  return {
    arrivedAt: input.arrivedAt,
    freeDays,
    dayNumber,
    daysRemaining,
    lastFreeDay: dateOfDarDay(start + Math.max(freeDays, 1) - 1),
    expired: dayNumber > freeDays,
    chargeableDays,
    perDay,
    currency: input.currency,
    accrued: perDay === null ? null : Math.round(perDay * chargeableDays * 100) / 100,
  };
}

/**
 * WHEN THE CLOCK STARTED: the moment the goods were cleared.
 *
 * The Dar warehouse checking the goods in is verification running beside the
 * clock, not a gate on it: goods cleared on the 24th and checked in on the 25th
 * started storage on the 24th.
 *
 * `receivedAt` is read only by a caller that has no clearance to give (the
 * older shape, from before clearance was recorded), where booking in was the
 * start. Null clearance means read, and not cleared: no clock.
 */
export function storageStart(
  receivedAt: Date | null | undefined,
  clearedAt: Date | null | undefined
): Date | null {
  if (clearedAt === undefined) return receivedAt ?? null;
  return clearedAt;
}
