/**
 * DAYS AND MONTHS AS DAR ES SALAAM COUNTS THEM.
 *
 * Every timestamp is stored in UTC and every screen prints Tanzanian time
 * (lib/format.ts). The arithmetic in between — "today", "this month", "the
 * last thirty days" — was being done with the server's own clock, which on
 * Vercel is UTC. Three hours of every Tanzanian day therefore landed in
 * yesterday's takings, and a payment taken at 01:00 on the first of the month
 * was counted in the month before.
 *
 * Tanzania keeps no summer time, so the offset is a fixed three hours and the
 * maths is exact. These return real UTC instants; only the civil fields they
 * are derived from are Tanzanian.
 */

export const DAR_OFFSET_MS = 3 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** The civil date in Dar es Salaam at this instant. */
export function darFields(at: Date = new Date()) {
  const shifted = new Date(at.getTime() + DAR_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth(),
    day: shifted.getUTCDate(),
    /** Monday = 0, as a week is read here. */
    weekday: (shifted.getUTCDay() + 6) % 7,
    hour: shifted.getUTCHours(),
  };
}

/** Midnight in Dar on a given civil date, as the instant it actually happens. */
export function darMidnight(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month, day) - DAR_OFFSET_MS);
}

/** The start of the Dar day this instant falls in. */
export function darStartOfDay(at: Date = new Date()): Date {
  const { year, month, day } = darFields(at);
  return darMidnight(year, month, day);
}

/** `days` whole Dar days back from the start of today. */
export function darDaysAgo(days: number, at: Date = new Date()): Date {
  return new Date(darStartOfDay(at).getTime() - days * DAY_MS);
}

/** The start of the Dar month this instant falls in, shifted by `months`. */
export function darStartOfMonth(at: Date = new Date(), months = 0): Date {
  const { year, month } = darFields(at);
  return darMidnight(year, month + months, 1);
}

/** The Monday that begins this Dar week, shifted by `weeks`. */
export function darStartOfWeek(at: Date = new Date(), weeks = 0): Date {
  const { weekday } = darFields(at);
  return new Date(darStartOfDay(at).getTime() - (weekday - weeks * 7) * DAY_MS);
}

/** The start of the Dar quarter this instant falls in, shifted by `quarters`. */
export function darStartOfQuarter(at: Date = new Date(), quarters = 0): Date {
  const { year, month } = darFields(at);
  return darMidnight(year, Math.floor(month / 3) * 3 + quarters * 3, 1);
}

/** The start of the Dar year this instant falls in, shifted by `years`. */
export function darStartOfYear(at: Date = new Date(), years = 0): Date {
  const { year } = darFields(at);
  return darMidnight(year + years, 0, 1);
}
