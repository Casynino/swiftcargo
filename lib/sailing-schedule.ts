import type { SailingStatus } from "@prisma/client";

import { prisma, type TxClient } from "@/lib/prisma";

/**
 * THE SCHEDULE IS A RULE, NOT A LIST OF DATES.
 *
 * Guangzhou takes cargo until Friday, packs the box that Friday, and the ship
 * leaves the Monday after. Thirty days later it is off Dar es Salaam. That is
 * the whole of it, and it repeats every week, so the public page is generated
 * from the rule rather than typed — a list of dates somebody has to remember to
 * extend is a website that quietly goes blank in the new year.
 *
 * A stored `ShipmentSchedule` row is the EXCEPTION: the week that slipped, the
 * week with a vessel worth naming, the week cancelled for a holiday. It names
 * the generated week it stands in for (`weekOf`) and replaces it whole. An
 * unpublished row removes that week from the page altogether, which is how a
 * week is taken off without inventing a status for it.
 *
 * Nothing here is hard-coded to a year. The arithmetic is done on UTC midnights
 * so a week does not gain or lose a day on a machine in another timezone, and
 * the dates are displayed in Dar time like every other date in the system —
 * midnight UTC is three in the morning in Dar, which is the same day.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** Friday, then Monday. Sunday is 0 in JavaScript, which is the trap here. */
const FRIDAY = 5;
const MONDAY = 1;

/** Days at sea when nobody has said otherwise. This lane's habit, not a law. */
export const DEFAULT_TRANSIT_DAYS = 30;

export const DEFAULT_ORIGIN = "Guangzhou";
export const DEFAULT_DESTINATION = "Dar es Salaam";

/**
 * The moment the Guangzhou counter stops taking cargo for a Friday deadline.
 *
 * The end of that Friday where the warehouse is, which is UTC+8, so sixteen
 * hours after the UTC midnight the deadline is stored at. A customer whose van
 * arrives at eight on Friday evening in Guangzhou made the boat, and a
 * comparison against midnight UTC would have told them they had not.
 */
const CHINA_DAY_END_MS = 16 * 60 * 60 * 1000;

/** How long before the deadline the page starts saying "hurry". */
const CUTOFF_WARNING_DAYS = 2;

/** After this many days at sea a departed ship is simply in transit. */
const DEPARTED_FOR_DAYS = 2;

export type SailingSource = "generated" | "published";

export type Sailing = {
  /** The stored row, when a stored row is what this is. */
  id: string | null;
  /** The voyage or vessel reference, when the sailing has one. */
  reference: string | null;
  vessel: string | null;
  shippingLine: string | null;
  /** The Monday this sailing departs. The key a week is known by. */
  weekOf: Date;
  /**
   * Unique across the list, which `weekOf` is not: an extra sailing on a
   * Saturday belongs to the same week as the generated Monday beside it, and
   * two rows keyed on that week are two rows a list cannot tell apart.
   */
  key: string;
  /** Last day Guangzhou accepts cargo. Friday. */
  cargoDeadline: Date;
  /** The day the container is packed. The same Friday, unless a row says not. */
  loadingDate: Date;
  /** Leaves China. Monday. */
  departureDate: Date;
  transitDays: number;
  /** Departure plus the days at sea. An estimate and labelled as one. */
  estimatedArrival: Date;
  origin: string;
  destination: string;
  status: SailingStatus;
  /** Whether a customer may still put cargo on this one. */
  bookingOpen: boolean;
  notes: string | null;
  source: SailingSource;
};

/** The sentence that must sit under every arrival date on a public screen. */
export const ARRIVAL_CAVEAT =
  "Estimated arrival — subject to shipping, port, customs and clearance conditions.";

function utcMidnight(value: Date): Date {
  return new Date(
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate())
  );
}

function addDays(value: Date, days: number): Date {
  return new Date(value.getTime() + days * DAY_MS);
}

/**
 * The Monday of the week `value` falls in.
 *
 * Sunday belongs to the week that has just ended, not the one beginning, which
 * is the ISO convention and also what a warehouse means by "this week": cargo
 * brought in on Sunday missed Friday's box.
 */
export function mondayOf(value: Date): Date {
  const day = utcMidnight(value);
  const weekday = day.getUTCDay();
  const back = weekday === 0 ? 6 : weekday - MONDAY;
  return addDays(day, -back);
}

/**
 * The Friday whose cargo goes on the ship leaving `monday`.
 *
 * Friday, Saturday, Sunday, Monday: three days back, every week of the year.
 * Written as arithmetic on the two weekday constants rather than as the literal
 * 3, so the rule reads the way the warehouse says it.
 */
export function deadlineForDeparture(monday: Date): Date {
  return addDays(monday, -(MONDAY + 7 - FRIDAY));
}

/**
 * The generated sailing for one departure Monday.
 *
 * Exported so the arithmetic can be tested a year at a time without a database
 * anywhere near it.
 */
export function generatedSailing(
  monday: Date,
  options: {
    transitDays?: number;
    origin?: string;
    destination?: string;
    now?: Date;
  } = {}
): Sailing {
  const transitDays = options.transitDays ?? DEFAULT_TRANSIT_DAYS;
  const departureDate = utcMidnight(monday);
  const cargoDeadline = deadlineForDeparture(departureDate);

  return withDerivedStatus(
    {
      id: null,
      reference: null,
      vessel: null,
      shippingLine: null,
      weekOf: departureDate,
      key: departureDate.toISOString().slice(0, 10),
      cargoDeadline,
      loadingDate: cargoDeadline,
      departureDate,
      transitDays,
      estimatedArrival: addDays(departureDate, transitDays),
      origin: options.origin ?? DEFAULT_ORIGIN,
      destination: options.destination ?? DEFAULT_DESTINATION,
      status: "OPEN_FOR_BOOKING",
      bookingOpen: true,
      notes: null,
      source: "generated",
    },
    options.now ?? new Date()
  );
}

/**
 * Where a sailing is, worked out from the clock.
 *
 * DELAYED and CANCELLED are never derived — no date can tell you a ship is late,
 * only a person can — so a stored row that says either keeps it.
 */
export function derivedStatus(sailing: Sailing, now: Date): SailingStatus {
  const closesAt = sailing.cargoDeadline.getTime() + CHINA_DAY_END_MS;
  const at = now.getTime();

  if (at >= sailing.estimatedArrival.getTime()) return "ARRIVED";
  if (at >= sailing.departureDate.getTime() + DEPARTED_FOR_DAYS * DAY_MS) {
    return "IN_TRANSIT";
  }
  if (at >= sailing.departureDate.getTime()) return "DEPARTED";
  if (at > closesAt) return "CLOSED";
  if (at >= closesAt - CUTOFF_WARNING_DAYS * DAY_MS) return "CUTOFF_APPROACHING";
  return "OPEN_FOR_BOOKING";
}

/** A status a person set, which the clock is not allowed to argue with. */
const ASSERTED: SailingStatus[] = ["DELAYED", "CANCELLED"];

function withDerivedStatus(sailing: Sailing, now: Date): Sailing {
  const status = ASSERTED.includes(sailing.status)
    ? sailing.status
    : derivedStatus(sailing, now);
  return {
    ...sailing,
    status,
    bookingOpen: status === "OPEN_FOR_BOOKING" || status === "CUTOFF_APPROACHING",
  };
}

/**
 * The next `count` sailings under the rule, starting from the week `now` is in.
 *
 * The week a customer is standing in is included even once its Friday has gone,
 * because "you have missed this one, the next is Monday week" is the answer
 * they came for, and a page that simply drops it leaves them counting backwards.
 */
export function generateSailings(options: {
  now?: Date;
  count?: number;
  transitDays?: number;
  origin?: string;
  destination?: string;
}): Sailing[] {
  const now = options.now ?? new Date();
  const count = Math.max(0, Math.min(options.count ?? 8, 104));

  /* The week's departure is its Monday. Once that Monday has sailed, the week a
     customer can still act on is the next one. */
  let monday = mondayOf(now);
  if (now.getTime() >= addDays(monday, 1).getTime()) monday = addDays(monday, 7);

  return Array.from({ length: count }, (_, i) =>
    generatedSailing(addDays(monday, i * 7), { ...options, now })
  );
}

type StoredRow = {
  id: string;
  weekOf: Date | null;
  origin: string;
  destination: string;
  cargoDeadline: Date;
  loadingDate: Date | null;
  departureDate: Date;
  transitDays: number;
  estimatedArrival: Date;
  vessel: string | null;
  voyage: string | null;
  shippingLine: string | null;
  status: SailingStatus;
  published: boolean;
  notes: string | null;
};

function fromRow(row: StoredRow, now: Date): Sailing {
  return withDerivedStatus(
    {
      id: row.id,
      reference: row.voyage ?? null,
      vessel: row.vessel,
      shippingLine: row.shippingLine,
      weekOf: row.weekOf ? utcMidnight(row.weekOf) : mondayOf(row.departureDate),
      key: row.id,
      cargoDeadline: row.cargoDeadline,
      loadingDate: row.loadingDate ?? row.cargoDeadline,
      departureDate: row.departureDate,
      transitDays: row.transitDays,
      estimatedArrival: row.estimatedArrival,
      origin: row.origin,
      destination: row.destination,
      status: row.status,
      bookingOpen: false,
      notes: row.notes,
      source: "published",
    },
    now
  );
}

/**
 * What the website shows: the generated weeks, overridden by anything stored.
 *
 * A stored row wins its week outright. An unpublished row removes that week —
 * the only way to take a generated week off the page, and deliberately not a
 * status, because "there is no boat that week" and "the boat is cancelled" are
 * different sentences to a customer. A stored row with no `weekOf` is an extra
 * sailing and is folded in by departure date.
 */
export async function publicSailings(
  options: {
    now?: Date;
    count?: number;
    client?: TxClient | typeof prisma;
  } = {}
): Promise<Sailing[]> {
  const now = options.now ?? new Date();
  const count = options.count ?? 8;
  const client = options.client ?? prisma;

  const generated = generateSailings({ now, count });
  const horizon = generated.at(-1)?.departureDate ?? now;

  const rows = (await client.shipmentSchedule.findMany({
    where: {
      OR: [
        { weekOf: { gte: mondayOf(now), lte: horizon } },
        { departureDate: { gte: mondayOf(now), lte: horizon } },
      ],
    },
    orderBy: { departureDate: "asc" },
    select: {
      id: true,
      weekOf: true,
      origin: true,
      destination: true,
      cargoDeadline: true,
      loadingDate: true,
      departureDate: true,
      transitDays: true,
      estimatedArrival: true,
      vessel: true,
      voyage: true,
      shippingLine: true,
      status: true,
      published: true,
      notes: true,
    },
  })) as StoredRow[];

  const overrides = new Map<number, StoredRow>();
  const extras: StoredRow[] = [];
  for (const row of rows) {
    if (row.weekOf) {
      overrides.set(utcMidnight(row.weekOf).getTime(), row);
      continue;
    }
    /* A row published before `weekOf` existed still stands in for its week when
       it sails on that week's Monday — otherwise the page would show the boat
       twice, once as the rule imagines it and once as somebody typed it. A
       sailing on any other day is a genuine extra and stays one. */
    const departure = utcMidnight(row.departureDate);
    if (departure.getUTCDay() === MONDAY && !overrides.has(departure.getTime())) {
      overrides.set(departure.getTime(), row);
    } else {
      extras.push(row);
    }
  }

  const merged: Sailing[] = [];
  for (const week of generated) {
    const override = overrides.get(week.weekOf.getTime());
    if (!override) {
      merged.push(week);
      continue;
    }
    /* Hidden means the week is not on the page at all. */
    if (override.published) merged.push(fromRow(override, now));
  }
  for (const extra of extras) {
    if (extra.published) merged.push(fromRow(extra, now));
  }

  return merged.sort(
    (a, b) => a.departureDate.getTime() - b.departureDate.getTime()
  );
}

/** The one a booking form should default to: the next week still open. */
export function nextOpenSailing(sailings: Sailing[]): Sailing | null {
  return sailings.find((s) => s.bookingOpen) ?? null;
}
