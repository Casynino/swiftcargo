import type { CargoStatus, ExceptionStatus, ExceptionType } from "@prisma/client";

/**
 * WHAT A CASE IS, not how the queue counts it.
 *
 * The vocabulary the issues list shares between the server page and the client
 * table: which pill a fault belongs under, what it is called, and whether its
 * cargo is standing in a warehouse. Kept apart from lib/exception-queue.ts so
 * the table can import it without dragging the database client into a browser
 * bundle.
 */

export type ExceptionGroupKey =
  | "missing"
  | "damaged"
  | "mismatch"
  | "hold"
  | "other";

/**
 * Which pill a case belongs under.
 *
 * `satisfies Record<ExceptionType, …>` makes a new exception type a compile
 * error here rather than a case that silently lands in "Other" and is never
 * chased.
 */
const TYPE_GROUP = {
  MISSING_CARGO: "missing",
  /* Standing behind a customs desk is not missing in the sense of lost, but it
     is cargo we do not have on the floor, and the same person chases it. */
  CUSTOMS_HOLD: "missing",
  DAMAGED_CARGO: "damaged",
  /* Dar raises PACKAGE_MISMATCH only when the count is not short — a short
     count is raised as MISSING_CARGO — so this is paperwork disagreeing with
     boxes that are here, not a shortage. */
  PACKAGE_MISMATCH: "mismatch",
  WEIGHT_DIFFERENCE: "mismatch",
  CBM_DIFFERENCE: "mismatch",
  WRONG_CUSTOMER: "mismatch",
  WRONG_CONTAINER: "mismatch",
  // A box nobody can put a name to stops at the counter until somebody decides.
  UNIDENTIFIED_CARGO: "hold",
  SHIPMENT_DELAY: "other",
  PAYMENT_DISCREPANCY: "other",
  CUSTOMER_COMPLAINT: "other",
  DELIVERY_FAILURE: "other",
  OTHER: "other",
} as const satisfies Record<ExceptionType, ExceptionGroupKey>;

export function groupOf(type: ExceptionType): ExceptionGroupKey {
  return TYPE_GROUP[type];
}

function typesIn(group: ExceptionGroupKey): ExceptionType[] {
  return (Object.keys(TYPE_GROUP) as ExceptionType[]).filter(
    (type) => TYPE_GROUP[type] === group
  );
}

export const EXCEPTION_GROUPS: Record<
  ExceptionGroupKey,
  { label: string; types: ExceptionType[] }
> = {
  missing: { label: "Missing", types: typesIn("missing") },
  damaged: { label: "Damaged", types: typesIn("damaged") },
  mismatch: {
    label: "Wrong item, container or volume",
    types: typesIn("mismatch"),
  },
  hold: { label: "On hold", types: typesIn("hold") },
  other: { label: "Other", types: typesIn("other") },
};

export const EXCEPTION_TYPE_LABELS: Record<ExceptionType, string> = {
  MISSING_CARGO: "Missing cargo",
  DAMAGED_CARGO: "Damaged cargo",
  PACKAGE_MISMATCH: "Package count mismatch",
  WEIGHT_DIFFERENCE: "Weight difference",
  CBM_DIFFERENCE: "Volume difference",
  WRONG_CUSTOMER: "Wrong customer",
  WRONG_CONTAINER: "Wrong container",
  UNIDENTIFIED_CARGO: "Unidentified cargo",
  CUSTOMS_HOLD: "Customs hold",
  SHIPMENT_DELAY: "Shipment delay",
  PAYMENT_DISCREPANCY: "Payment discrepancy",
  CUSTOMER_COMPLAINT: "Customer complaint",
  DELIVERY_FAILURE: "Delivery failure",
  OTHER: "Something else",
};

export const OPEN_STATUSES: ExceptionStatus[] = [
  "OPEN",
  "INVESTIGATING",
  "WAITING_CUSTOMER",
  "WAITING_FINANCE",
  "WAITING_WAREHOUSE",
  "ESCALATED",
];

export const FINISHED_STATUSES: ExceptionStatus[] = ["RESOLVED", "CLOSED"];

/**
 * Where a cargo status puts the boxes: standing in one of our warehouses, or
 * not. Derived from the status the floor already recorded rather than from the
 * kind of case, because a missing-cargo case whose consignment was later booked
 * in at Dar is a box on the shelf, whatever the case was opened as.
 */
const IN_A_WAREHOUSE: Record<CargoStatus, boolean> = {
  REGISTERED: false,
  RECEIVED_CHINA: true,
  ASSIGNED_TO_CONTAINER: true,
  CONTAINER_LOADED: false,
  DEPARTED_CHINA: false,
  IN_TRANSIT: false,
  ARRIVED_TANZANIA: false,
  RECEIVED_DAR: true,
  READY_FOR_RELEASE: true,
  COLLECTED: false,
  DELIVERED: false,
  MISSING_AT_DAR: false,
  CANCELLED: false,
};

export function cargoIsHere(status: CargoStatus): boolean {
  return IN_A_WAREHOUSE[status];
}

export function daysOpen(openedAt: Date, until: Date | null = null) {
  const end = (until ?? new Date()).getTime();
  return Math.max(0, Math.floor((end - openedAt.getTime()) / 86_400_000));
}
