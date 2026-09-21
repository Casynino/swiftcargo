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
  /// Customs is done and the goods are ours to store. Split off `receiving.dar`
  /// because clearing is a paper step on a bill, not a count on a scale:
  /// Finance pays the duty and files the entry, so Finance says when it is
  /// through, and holding it no longer implies the authority to write what
  /// physically came off the container.
  | "cargo.clear"

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
  /**
   * WHICH CONTAINER A CONSIGNMENT CAME OFF, CORRECTED AFTER IT LANDED.
   *
   * Loading is Guangzhou's and stops at the seal — `container.load` refuses
   * once the box is shut, and it should. But a manifest is a piece of paper
   * written in another country, and the first person to read it against actual
   * cargo stands in Dar with the goods in front of them: a consignment listed
   * that never came off, a bale that came off a box it was never listed on.
   * Without this the floor would have to leave a wrong manifest standing, and
   * the container's price list would be a list of the wrong cargo.
   *
   * It is not a second `container.load`. It reaches only landed containers, it
   * refuses anything Dar has already counted or Finance has already billed, and
   * every use writes the old container and the new one to FieldChange.
   */
  | "container.amendArrived"
  /**
   * SIGNING A CONTAINER OFF OVER CARGO NOBODY COUNTED.
   *
   * Confirming a container is the floor saying every consignment on the
   * manifest was looked at. Where some were not — the lorry left, the shift
   * ended, half the marks are unreadable — that is a decision with a person's
   * name on it, not a clerk's shortcut, so it sits above the desk that does the
   * counting. It asks for a reason, it opens a case on every consignment nobody
   * checked so none of them is lost, and it is written to the audit log.
   */
  | "container.confirmUnchecked"
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
  /// Agreeing what the system recorded against what the account actually holds.
  /// Separate from `record.review` so the money half can sit with Finance
  /// without the approvals queue and the control room going with it.
  | "record.reconcile"
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
  /* A COLLECTION IN CHINA IS A CHINA JOB.
     The van goes out of Guangzhou, so the queue of people asking for one has to
     be openable by the floor that answers it. Support still sees the same rows;
     what China gains is taking one, putting a day against it and closing it when
     the boxes are in. None of it prices anything — the requests screen carries no
     money, for the same reason the receiving screens do not. */
  "request.view",
  "request.manage",
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
  "cargo.clear",
  "deliveryNote.view",
  "inventory.view",
  "warehouse.reports",
  "container.view",
  "container.arrive",
  "container.close",
  /* The floor that opens the box is the floor that discovers the manifest is
     wrong, and by the owner's decision it is the floor that corrects it. */
  "container.amendArrived",
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
  /*
    `receiving.china` IS NOT HERE, AND THE ABSENCE IS THE POINT.

    It was, and it is the one thing on this list that would have let the desk
    say what physically arrived: it opens the intake form, registers a customer
    at the counter, and writes the ChinaReceiving row carrying the packages,
    the weight and the volume a bill is priced from. Nobody at a desk in Dar
    can see boxes in Guangzhou, so every figure entered here would be somebody
    else's word typed in by a third party — no scale, no photographs, no shelf.
    The floor measures; this desk explains what the floor measured.
  */
  "deliveryNote.view",
  "container.view",
  /* By the owner's decision the port steps are anybody's who hears first: the
     customer's clearing agent often rings this desk to say the box is in, or
     that the entry is through. Marking it is one press on a record that says
     who pressed it; what came off the container is still the floor's to count. */
  "container.arrive",
  "cargo.clear",
  /* The customer rings to say their goods were not on the sailing they were
     told about. The counter that takes the call is the counter that can put it
     right, rather than passing it to the floor and back. */
  "container.amendArrived",
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
  /* Finance carries the container through the port, by the owner's decision:
     it is the desk holding the bill of lading and paying the duty, so it is
     the desk that knows the box has landed and that the entry is through.
     `container.arrive` marks the landing (and undoes it while nothing stands
     on it); `cargo.clear` says customs is finished. Neither writes a
     measurement — what came off the container is still the floor's word. */
  "container.view",
  "container.arrive",
  "cargo.clear",
  /* Finance is the other desk that notices: a container whose price list does
     not add up to the cargo standing in the warehouse. */
  "container.amendArrived",
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
  /* Agreeing the books against the bank. The desk that holds the accounts is
     the desk that can see a statement, and every agreement is signed with the
     name of whoever made it. */
  "record.reconcile",
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
    /* Above the floor that counts, for the reason the permission itself gives. */
    "container.confirmUnchecked",
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
 * Everything except the things that would let an operator rewrite the rules
 * they operate under: who may do what, what the company is configured to be,
 * and the two destructive verbs. Removing these is the entire reason MANAGER
 * exists as a role rather than as a second ADMIN — the owner can hand over the
 * running of the business without handing over the keys to the system.
 *
 * The manager does hire and move staff — the owner's decision, and the air
 * side's habit: the person running the floor is the person who knows who has
 * left. What they may not do is make another owner, which `lib/actions/users.ts`
 * refuses at the action, so the Staff screen is theirs without the keys being.
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
// Where a signed-in person lands
// ---------------------------------------------------------------------------

/**
 * THERE IS NO TABLE OF ROUTES HERE, AND THERE WAS.
 *
 * It listed a permission for every prefix under /app and claimed to be the
 * cheapest of three layers. Nothing imported it. Middleware decides two things
 * on the edge, where the database is unreachable — is somebody signed in, and
 * are they staff — and says in its own words why it will not decide a third
 * from a role frozen into a token at sign-in. Every page behind /app calls
 * `requirePermission` against the live row, and every server action calls
 * `authorize`.
 *
 * So the table was not a layer. It was a second opinion nobody asked, and it
 * had already drifted: it said /app/finance wanted `accounting.view`, which
 * Support does not hold, while the page itself wants `finance.view`, which
 * Support does. Anybody wiring it up in good faith would have shut the support
 * desk out of the screens it exists to read. A map that is never walked stops
 * matching the ground, and the only safe thing to do with one is not keep it.
 */

/** The dashboard renders the right department view, so there is one landing. */
export const POST_LOGIN_PATH = "/app/dashboard";
export const CUSTOMER_LANDING_PATH = "/portal";
