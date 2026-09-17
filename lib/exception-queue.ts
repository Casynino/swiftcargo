import type { Prisma } from "@prisma/client";

import { EXCEPTION_GROUPS, FINISHED_STATUSES, OPEN_STATUSES } from "@/lib/exception-groups";
import { prisma } from "@/lib/prisma";

/**
 * THE ISSUES QUEUE, AS NUMBERS AND FILTERS.
 *
 * Every figure above the queue is a real count against the database, not a
 * slice of whatever happened to be loaded into the table — the table is capped
 * and filtered, and a card that only counted the visible rows would read
 * "0 damaged" while three damaged cases sat one pill away.
 *
 * Two filters, answering different questions. A *set* chooses which cases —
 * open, found, waiting on Finance, finished — and a *group* narrows that set by
 * what went wrong. Keeping them apart is what makes "damaged cargo that was
 * later found" askable.
 */

export type QueueSet = "open" | "found" | "compensation" | "closed";

const QUEUE_SETS: QueueSet[] = ["open", "found", "compensation", "closed"];

export function isQueueSet(value: string | undefined): value is QueueSet {
  return !!value && (QUEUE_SETS as string[]).includes(value);
}

/**
 * A case on cargo that was soft-deleted is a dead end nobody can open. A case
 * with no cargo at all — a complaint, a payment query — is still a case.
 */
export const LIVE_CARGO: Prisma.ExceptionCaseWhereInput = {
  OR: [{ cargoId: null }, { cargo: { deletedAt: null } }],
};

/**
 * Cargo reported missing that has since been booked in at Dar.
 *
 * There is no "found" status on a case: receiving a MISSING_AT_DAR consignment
 * moves the cargo to RECEIVED_DAR and writes a DarReceiving row, and that is the
 * fact. Read off the cargo so the card cannot disagree with the warehouse.
 */
const FOUND: Prisma.ExceptionCaseWhereInput = {
  type: "MISSING_CARGO",
  cargo: { status: { not: "MISSING_AT_DAR" }, darReceiving: { isNot: null } },
};

const OPEN: Prisma.ExceptionCaseWhereInput = {
  status: { in: OPEN_STATUSES },
};

/**
 * Finished, minus the ones that ended with the box turning up — those have
 * their own card, and folding them into "closed" would hide the most
 * reassuring number on the page.
 */
const FINISHED: Prisma.ExceptionCaseWhereInput = {
  status: { in: FINISHED_STATUSES },
  NOT: FOUND,
};

export function whereForSet(set: QueueSet): Prisma.ExceptionCaseWhereInput {
  switch (set) {
    case "found":
      return FOUND;
    case "compensation":
      /* There is no payout record on a case. A case parked with Finance is the
         nearest honest reading of "money the company has agreed and not paid". */
      return { status: "WAITING_FINANCE" };
    case "closed":
      return FINISHED;
    case "open":
    default:
      return OPEN;
  }
}

export type QueueCounts = {
  open: number;
  missing: number;
  damaged: number;
  found: number;
  compensation: number;
  closed: number;
};

export async function queueCounts(): Promise<QueueCounts> {
  const count = (...where: Prisma.ExceptionCaseWhereInput[]) =>
    prisma.exceptionCase.count({ where: { AND: [LIVE_CARGO, ...where] } });

  const [open, missing, damaged, found, compensation, closed] =
    await Promise.all([
      count(OPEN),
      count(OPEN, { type: { in: EXCEPTION_GROUPS.missing.types } }),
      count(OPEN, { type: { in: EXCEPTION_GROUPS.damaged.types } }),
      count(FOUND),
      count(whereForSet("compensation")),
      count(FINISHED),
    ]);

  return { open, missing, damaged, found, compensation, closed };
}
