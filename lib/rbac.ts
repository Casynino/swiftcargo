import type { Role, CargoStatus } from "@prisma/client";

/**
 * Permission model.
 *
 * Roles are coarse — six staff desks and a customer. Permissions are fine.
 * Every server action and every page guard asks for a PERMISSION, never a role,
 * so adding a seventh department later is an edit to one table in this file
 * rather than a search-and-replace across two hundred call sites.
 */
export type Permission =
  // --- Cargo ---------------------------------------------------------------
  | "cargo.view"
  | "cargo.create"
  /** The whole company's cargo, anywhere on the route. A floor sees its floor. */
  | "cargo.viewAll"
  | "cargo.edit"
  | "cargo.delete"
  /// Internal notes, cost inputs, staff names. Never reaches a customer.
  | "cargo.viewInternal"
  /**
   * CUSTODY. A consignment's life has two halves and the record belongs to a
   * different floor in each — see `canAmendCargo`.
   *
   * `amendChina` covers cargo still on the Guangzhou shelf or on the water.
   * `amendDar` covers it from the moment Dar confirms the box was discharged.
   * Editing and deleting both ask one of these BESIDE `cargo.edit` /
   * `cargo.delete`, so a desk can hold the verb and still be unable to use it
   * on cargo that is not its own.
   *
   * Guangzhou holds the outbound half because it typed the record and is who
   * notices the mistake — and a container sits on the water for twenty-eight
   * days, which is a long time for a wrong CBM to be untouchable. Dar holds the
   * landed half because by confirming discharge it has said the boxes are here
   * and counted; after that they are on Dar's floor and are Dar's to answer for.
   * The handover is the Dar receiving.
   *
   * Dar holds both halves, at the owner's instruction: a container is
   * discharged and its consignments stay ARRIVED_TANZANIA until each is booked
   * in, so the clerk holding a bale whose record is wrong was looking at cargo
   * the system still called Guangzhou's. Guangzhou holds only its own half.
   */
  | "cargo.amendChina"
  | "cargo.amendDar"
  /// Stop a release for a reason that is not money: a customs question, a
  /// dispute, an open case on the boxes.
  | "cargo.hold"
  | "cargo.photo"
  | "cargo.scan"

  // --- Warehouse -----------------------------------------------------------
  | "receiving.china"
  | "receiving.dar"
  | "receiving.verify"
  | "deliveryNote.view"
  | "deliveryNote.issue"
  | "inventory.view"
  | "warehouse.reports"

  // --- Containers, packing lists, the voyage -------------------------------
  | "container.view"
  | "container.create"
  | "container.edit"
  | "container.load"
  /// Sealing closes the box. Nothing may be added afterwards, so it is a
  /// separate permission from loading it.
  | "container.seal"
  | "container.depart"
  | "container.arrive"
  | "container.close"
  | "container.delete"
  | "packingList.view"
  | "packingList.issue"
  | "shipment.view"
  | "shipment.edit"
  | "shipment.document"
  /**
   * Replacing a computed CBM with a typed one.
   *
   * Held narrowly, because the computed figure is the only thing standing
   * between a measurement and an invoice. An override writes the old value, the
   * new value, the actor and the reason to FieldChange before it takes effect.
   */
  | "cbm.override"

  // --- Money ---------------------------------------------------------------
  /// A customer's bill. NOT the company's books — see `accounting.view`.
  | "finance.view"
  /// The company's own money: ledgers, expenses, container profit.
  | "accounting.view"
  /// Move money between the company's own accounts, and count the tin. Not the
  /// same as recording income — nothing here touches a customer's bill.
  | "accounting.manage"
  | "invoice.create"
  | "invoice.edit"
  | "invoice.issue"
  /**
   * Confirming the prices the rate book worked out when Dar checked cargo in,
   * and correcting a waiting row's cargo type or rate on the way.
   *
   * Narrower than `invoice.issue`: it only ever turns the system's own drafts
   * into bills, a list at a time, and only touches a price nobody has been
   * asked for yet. Support holds it because the owner wants the counter able to
   * price cargo and send the bill in the same conversation.
   */
  | "invoice.priceConfirm"
  | "invoice.discount"
  | "invoice.cancel"
  | "rate.view"
  | "rate.manage"
  | "customerRate.manage"
  | "fx.manage"
  /// Hand a payment claim up for Finance to check. Support collects at the
  /// counter and takes screenshots off customers; neither is a verification.
  | "payment.submit"
  | "payment.record"
  /// The only permission that can turn a claim into money. Finance alone.
  | "payment.verify"
  | "receipt.issue"
  | "expense.view"
  | "expense.record"
  | "expense.approve"
  | "profit.view"
  /// Build the month's salary run and send it up. Never agrees it.
  | "payroll.prepare"
  /**
   * Agree the month's salaries, which pays them. Deliberately not held by the
   * desk that prepares the figures: the split between the two is the control.
   */
  | "payroll.approve"

  // --- Release -------------------------------------------------------------
  | "release.view"
  /// Hand the boxes over. The DECISION that they may go is computed and cannot
  /// be held by anybody — this is only the authority to act on that answer.
  | "release.execute"
  | "delivery.manage"

  // --- Exceptions ----------------------------------------------------------
  | "exception.view"
  | "exception.raise"
  | "exception.assign"
  | "exception.resolve"
  | "exception.close"
  | "exception.approve"

  // --- Customers and communication -----------------------------------------
  | "customer.view"
  | "customer.manage"
  | "customer.merge"
  | "conversation.view"
  | "conversation.reply"
  | "conversation.assign"
  | "request.view"
  | "request.manage"
  | "notification.send"

  // --- Oversight and configuration -----------------------------------------
  | "search.global"
  | "record.review"
  | "report.view"
  | "audit.view"
  | "records.viewDeleted"
  | "user.manage"
  | "settings.manage"
  | "warehouse.manage"
  | "content.manage";

// ---------------------------------------------------------------------------
// Role bundles
// ---------------------------------------------------------------------------

/**
 * Guangzhou. Receive, identify, record, photograph, load, seal, dispatch.
 *
 * It does not scan: labels are read in Dar, against a manifest. In Guangzhou
 * the goods are in front of the clerk and the paper note is in their hand.
 *
 * IT HAS NO FINANCIAL PERMISSION AT ALL. The floor records what arrived and
 * never sees what it is worth: a clerk who knows a wider box is a bigger bill
 * has a reason to measure it narrower, and the office has no way to tell.
 * Customers asking about money are sent to the office, which is where the
 * answer is anyway.
 */
const CHINA_WAREHOUSE: Permission[] = [
  "cargo.view",
  "cargo.create",
  "cargo.edit",
  "cargo.delete",
  "cargo.viewInternal",
  "cargo.amendChina",
  "cargo.hold",
  "cargo.photo",
  "receiving.china",
  "deliveryNote.view",
  "deliveryNote.issue",
  "inventory.view",
  "warehouse.reports",
  "container.view",
  "container.create",
  "container.edit",
  "container.load",
  "container.seal",
  "container.depart",
  "packingList.view",
  "packingList.issue",
  "shipment.view",
  "shipment.edit",
  "shipment.document",
  "exception.view",
  "exception.raise",
  "exception.resolve",
  "customer.view",
  "search.global",
];

/**
 * Dar es Salaam. Receive the container, verify against the packing list, store,
 * and hand over what the system says may be handed over.
 *
 * It holds `release.execute` but nothing that sets a price: `finance.view` lets
 * it read a bill that already exists, because somebody collecting goods asks
 * whether they are paid up, and `release.view` gives it the answer it must act
 * on. It cannot raise, price, discount or verify anything, so the floor acts on
 * the release answer and cannot influence it.
 */
/**
 * DAR RECEIVES, KEEPS AND RELEASES. THAT IS THE WHOLE JOB.
 *
 * What arrived, what is on the floor, what may go out. They read a container
 * because a container is what the goods came off — `container.view` opens the
 * box from the dock — but they do not run sailings, and the bill is not theirs:
 * `finance.view` came off this list because an invoice is Finance's document
 * and a floor that can read prices is a floor that can be argued with about
 * them. Arranging a delivery is Support's job, so `delivery.manage` went too.
 */
const DAR_WAREHOUSE: Permission[] = [
  "cargo.view",
  "cargo.edit",
  "cargo.viewInternal",
  "cargo.amendDar",
  /* The same reach Guangzhou has over cargo not yet booked in at Dar. Every
     use is written to the consignment's history with the name of whoever did
     it, and the line rules still hold — see lib/cargo-corrections.ts. */
  "cargo.amendChina",
  "cargo.hold",
  "cargo.photo",
  "cargo.scan",
  "receiving.dar",
  "receiving.verify",
  "deliveryNote.view",
  "inventory.view",
  "warehouse.reports",
  "container.view",
  "container.arrive",
  "container.close",
  "packingList.view",
  "shipment.view",
  "shipment.document",
  "release.view",
  "release.execute",
  "exception.view",
  "exception.raise",
  "exception.resolve",
  "customer.view",
  "search.global",
];

/**
 * The desk that talks to customers.
 *
 * Read access along the whole chain, so "where is my cargo" is answered without
 * ringing another department — and deliberately no authority anywhere on it. It
 * may hand a payment claim up (`payment.submit`) and never verify one; it may
 * see a bill and never set a rate or a discount; it may raise a case and never
 * release a box.
 */
const CUSTOMER_SUPPORT: Permission[] = [
  "cargo.view",
  "cargo.viewAll",
  "cargo.photo",
  "receiving.china",
  "deliveryNote.view",
  "container.view",
  "packingList.view",
  "shipment.view",
  "finance.view",
  "payment.submit",
  /* The customer on the phone asks for a better rate or a little off, and the
     counter answers in the same call. Every change asks why and is recorded
     against the name of whoever made it. */
  "invoice.discount",
  /* Confirming the waiting prices, as Finance does. A counter that can price
     cargo and cannot turn that price into a bill sends the customer away to
     wait for somebody else. A bill already issued, paid or collected is not
     reached through this. */
  "invoice.priceConfirm",
  "release.view",
  "exception.view",
  "exception.raise",
  "customer.view",
  "customer.manage",
  "conversation.view",
  "conversation.reply",
  "conversation.assign",
  "request.view",
  "request.manage",
  /* Arranging a delivery is a conversation with a customer about an address and
     a day, not a warehouse job. It moved here when it came off the Dar floor,
     so the capability stayed with somebody who is not an administrator. */
  "delivery.manage",
  "notification.send",
  "search.global",
  "rate.view",
];

/**
 * Finance. Rates, invoices, payments, receipts, the books and container profit.
 *
 * `payment.verify` lives here and nowhere else.
 */
const FINANCE: Permission[] = [
  "cargo.view",
  "cargo.viewAll",
  "cargo.viewInternal",
  "deliveryNote.view",
  "container.view",
  "packingList.view",
  "shipment.view",
  "finance.view",
  "accounting.view",
  "accounting.manage",
  "invoice.create",
  "invoice.edit",
  "invoice.issue",
  "invoice.priceConfirm",
  "invoice.discount",
  "invoice.cancel",
  "rate.view",
  "rate.manage",
  "customerRate.manage",
  "fx.manage",
  "payment.submit",
  "payment.record",
  "payment.verify",
  "receipt.issue",
  "expense.view",
  "expense.record",
  "profit.view",
  /* Finance sets out the salary run and sends it up. payroll.approve stays
     off this list: the desk that writes the figures must not be the desk that
     agrees them. */
  "payroll.prepare",
  "release.view",
  "exception.view",
  "exception.raise",
  "exception.resolve",
  "customer.view",
  "customer.manage",
  "report.view",
  "audit.view",
  "search.global",
];

/** Every permission that exists, in declaration order, without duplicates. */
const ALL: Permission[] = Array.from(
  new Set<Permission>([
    ...CHINA_WAREHOUSE,
    ...DAR_WAREHOUSE,
    ...CUSTOMER_SUPPORT,
    ...FINANCE,
    // Held by nobody but the owner and, where noted, the manager.
    "cargo.amendChina",
    "cargo.amendDar",
    "cargo.delete",
    "cbm.override",
    "container.delete",
    "customer.merge",
    "delivery.manage",
    "exception.assign",
    "exception.close",
    "exception.approve",
    "expense.approve",
    /* Signing off the month's salaries — the owner and the manager. */
    "payroll.approve",
    "record.review",
    "report.view",
    "audit.view",
    "records.viewDeleted",
    "user.manage",
    "settings.manage",
    "warehouse.manage",
    "content.manage",
    "release.execute",
  ])
);

/**
 * The manager runs the business; the owner owns it.
 *
 * Everything except the four things that would let an operator rewrite the
 * rules they operate under: who may do what, what the company is configured to
 * be, and the two destructive verbs. Removing these is the entire reason
 * MANAGER exists as a role rather than as a second ADMIN — the owner can hand
 * over the running of the business without handing over the keys to the system.
 */
const MANAGER: Permission[] = ALL.filter(
  (p) =>
    p !== "settings.manage" &&
    /* The rate every new bill is priced at moves only on Finance's word or the
       owner's — the people who answer for the books. */
    p !== "fx.manage" &&
    p !== "warehouse.manage" &&
    p !== "cargo.delete" &&
    p !== "container.delete"
);

/**
 * A customer holds NO staff permission at all.
 *
 * Their access is not a smaller version of a clerk's — it is a different gate.
 * Nothing they can reach goes through `can()`; every portal query is scoped by
 * the customerId on their own user row, server-side. An empty array here is the
 * statement that /app is closed to them, not an oversight.
 */
const CUSTOMER: Permission[] = [];

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  ADMIN: ALL,
  MANAGER,
  CUSTOMER_SUPPORT,
  CHINA_WAREHOUSE,
  DAR_WAREHOUSE,
  FINANCE,
  CUSTOMER,
};

export function can(role: Role | undefined | null, permission: Permission) {
  if (!role) return false;
  return ROLE_PERMISSIONS[role].includes(permission);
}

export function canAny(
  role: Role | undefined | null,
  permissions: Permission[]
) {
  return permissions.some((p) => can(role, p));
}

/** Staff reach /app. Customers reach /portal. Nobody reaches both. */
export function isStaff(role: Role | undefined | null) {
  return !!role && role !== "CUSTOMER";
}

// ---------------------------------------------------------------------------
// Custody
// ---------------------------------------------------------------------------

export type CargoCustody = "CHINA" | "DAR";

/**
 * Whose floor a consignment's record belongs to, decided by where the boxes are.
 *
 * CHINA covers everything up to and including the water. From RECEIVED_DAR
 * onward it is Dar's — Dar said the boxes were there by receiving them.
 *
 * The tail states are deliberately DAR rather than a third case. A collected or
 * delivered consignment is finished, and a finished consignment is nobody's to
 * retype; in practice only management touches one, and management holds both
 * halves anyway.
 */
export function cargoCustody(status: CargoStatus): CargoCustody {
  switch (status) {
    case "REGISTERED":
    case "RECEIVED_CHINA":
    case "ASSIGNED_TO_CONTAINER":
    case "CONTAINER_LOADED":
    case "DEPARTED_CHINA":
    case "IN_TRANSIT":
    case "ARRIVED_TANZANIA":
      return "CHINA";
    default:
      return "DAR";
  }
}

/**
 * May this desk change this consignment's record at all?
 *
 * Custody and nothing else — the caller still asks for `cargo.edit` or
 * `cargo.delete` beside it. Holding the verb is not enough: a warehouse may
 * only use it on cargo that is currently its own.
 *
 * It lives here, alone, because the alternative is spelling the rule out at
 * every call site — both buttons on the cargo page, the edit page deciding
 * whether to open, and each server action — and those drift apart. A door that
 * opens on a wider rule than the action behind it is a form that refuses to
 * save.
 */
export function canAmendCargo(
  role: Role | undefined | null,
  status: CargoStatus
) {
  return can(
    role,
    cargoCustody(status) === "CHINA" ? "cargo.amendChina" : "cargo.amendDar"
  );
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

/**
 * Which permission opens which door.
 *
 * Evaluated longest-prefix-first, so a specific rule always beats the catch-all
 * above it and a misplaced row cannot open a hole. This table is NOT the gate on
 * its own: the /app layout requires a session, every data-bearing page re-asserts
 * its own permission with `requirePermission`, and every server action calls
 * `authorize`. Three layers, and this one is the cheapest.
 */
export const ROUTE_PERMISSIONS: { prefix: string; permission: Permission }[] = [
  { prefix: "/app/scan", permission: "cargo.scan" },
  { prefix: "/app/cargo", permission: "cargo.view" },

  { prefix: "/app/receive/dar", permission: "receiving.dar" },
  { prefix: "/app/receive", permission: "receiving.china" },
  { prefix: "/app/inventory", permission: "inventory.view" },
  { prefix: "/app/release", permission: "release.execute" },
  { prefix: "/app/deliveries", permission: "delivery.manage" },
  { prefix: "/app/reports", permission: "warehouse.reports" },

  /* Longest prefix wins, so the money view of a finished sailing is gated on
     the books rather than on the warehouse's right to see a container. */
  { prefix: "/app/containers/closed", permission: "accounting.view" },
  { prefix: "/app/containers", permission: "container.view" },
  { prefix: "/app/packing-lists", permission: "packingList.view" },

  /* Every desk can see a case, because a case concerns all of them at once.
     What each may DO to one is gated action by action inside — so a China clerk
     and a Dar clerk reach the same page and are offered different buttons. */
  { prefix: "/app/exceptions", permission: "exception.view" },

  /* The company's own money, ahead of /app/finance: `finance.view` is a
     customer's bill and is held by Support and both warehouses, but the books
     are not theirs. */
  { prefix: "/app/finance/expenses", permission: "expense.view" },
  { prefix: "/app/finance/reports", permission: "profit.view" },
  { prefix: "/app/finance/rates", permission: "rate.view" },
  { prefix: "/app/finance/exchange-rate", permission: "fx.manage" },
  { prefix: "/app/finance/verify", permission: "payment.verify" },
  { prefix: "/app/finance/payments", permission: "payment.submit" },
  { prefix: "/app/finance/containers", permission: "finance.view" },
  { prefix: "/app/finance/accounts", permission: "accounting.view" },
  { prefix: "/app/finance/ledger", permission: "accounting.view" },
  { prefix: "/app/finance/audit", permission: "accounting.view" },
  { prefix: "/app/finance/credit", permission: "finance.view" },
  { prefix: "/app/finance/payroll", permission: "payroll.prepare" },
  { prefix: "/app/finance/collections", permission: "finance.view" },
  { prefix: "/app/finance/pickup-notes", permission: "finance.view" },
  { prefix: "/app/finance/invoices", permission: "finance.view" },
  { prefix: "/app/finance/receipts", permission: "finance.view" },
  { prefix: "/app/finance", permission: "accounting.view" },

  { prefix: "/app/support/requests", permission: "request.view" },
  { prefix: "/app/support", permission: "conversation.view" },

  { prefix: "/app/customers", permission: "customer.view" },
  { prefix: "/app/search", permission: "search.global" },

  { prefix: "/app/admin/users", permission: "user.manage" },
  { prefix: "/app/admin/audit", permission: "audit.view" },
  { prefix: "/app/admin/deleted", permission: "records.viewDeleted" },
  { prefix: "/app/admin/rates", permission: "rate.manage" },
  { prefix: "/app/admin/warehouses", permission: "warehouse.manage" },
  { prefix: "/app/admin/content", permission: "content.manage" },
  { prefix: "/app/admin/markets", permission: "content.manage" },
  { prefix: "/app/admin/settings", permission: "settings.manage" },
  { prefix: "/app/admin", permission: "report.view" },

  /* Guarded on the reviewer's permission rather than report.view: Finance also
     reads reports, and the desk this workspace exists to check must not be able
     to stand inside it. */
  { prefix: "/app/manager/payroll", permission: "payroll.approve" },
  { prefix: "/app/manager", permission: "record.review" },
];

export function permissionForPath(pathname: string): Permission | null {
  const match = ROUTE_PERMISSIONS.filter(
    (r) => pathname === r.prefix || pathname.startsWith(`${r.prefix}/`)
  ).sort((a, b) => b.prefix.length - a.prefix.length)[0];
  return match?.permission ?? null;
}

/** The dashboard renders the right department view, so there is one landing. */
export const POST_LOGIN_PATH = "/app/dashboard";
export const CUSTOMER_LANDING_PATH = "/portal";
