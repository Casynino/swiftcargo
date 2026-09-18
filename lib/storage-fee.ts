import "server-only";

import { Prisma } from "@prisma/client";

import { storageState } from "@/lib/storage-clock";

/**
 * WHAT A CONSIGNMENT HAS COST IN FLOOR SPACE.
 *
 * Counted from the day Dar booked it in, not from the day it was billed: the
 * boxes start taking up room the moment they come off the container, whatever
 * the office is doing about the paperwork.
 *
 * The free days come off first, and a rate of zero means the business does not
 * charge storage — which is the default, because a rate nobody has agreed must
 * never appear on a customer's bill.
 *
 * Nothing here charges anything. It works out a figure and hands it to a
 * person, because whether to bill a customer who was three days late is a
 * commercial decision and not arithmetic.
 */
export type StoragePosition = {
  /** Which Dar calendar day of storage this is, the arrival day being day 1. */
  daysHeld: number;
  freeDays: number;
  /** Days beyond the free allowance. Zero while they are still within it. */
  chargeableDays: number;
  perDay: Prisma.Decimal;
  currency: string;
  amount: Prisma.Decimal;
  /** False when no rate is set — the control says so rather than charging nil. */
  configured: boolean;
  /** Already on the bill, so the button offers to remove it instead. */
  onTheBill: Prisma.Decimal | null;
};

export function storagePosition(input: {
  receivedAt: Date | null;
  collectedAt: Date | null;
  freeDays: number;
  perDay: Prisma.Decimal | number;
  currency: string;
  onTheBill?: Prisma.Decimal | null;
}): StoragePosition {
  const perDay = new Prisma.Decimal(input.perDay ?? 0);
  const freeDays = Math.max(0, input.freeDays);

  if (!input.receivedAt) {
    return {
      daysHeld: 0,
      freeDays,
      chargeableDays: 0,
      perDay,
      currency: input.currency,
      amount: new Prisma.Decimal(0),
      configured: perDay.greaterThan(0),
      onTheBill: input.onTheBill ?? null,
    };
  }

  /* Stops counting the day it was handed over. A collected consignment cannot
     keep accruing rent on a floor it is no longer standing on.

     Counted in Dar calendar days with the arrival day as day one, by the same
     clock the customer is shown (lib/storage-clock.ts): seven free days means
     day eight is the first that may be charged. */
  const clock = storageState({
    arrivedAt: input.receivedAt,
    freeDays,
    perDay: null,
    currency: input.currency,
    now: input.collectedAt ?? new Date(),
  });
  const daysHeld = clock.dayNumber;
  const chargeableDays = clock.chargeableDays;

  return {
    daysHeld,
    freeDays,
    chargeableDays,
    perDay,
    currency: input.currency,
    amount: perDay.mul(chargeableDays).toDecimalPlaces(2),
    configured: perDay.greaterThan(0),
    onTheBill: input.onTheBill ?? null,
  };
}
