import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { Role } from "@prisma/client";

import {
  ROLE_PERMISSIONS,
  can,
  canAmendCargo,
  cargoCustody,
  isStaff,
  type Permission,
} from "@/lib/rbac";

/**
 * THE DEPARTMENT BOUNDARIES, WRITTEN DOWN WHERE A CHANGE TO THEM FAILS.
 *
 * Not a restatement of the table — these are the rules the business would be
 * harmed by losing, each one asserted as the sentence an owner would say. A
 * permission added to the wrong list is a two-character edit and reads as an
 * improvement; it fails here, with the reason attached.
 */

const DESKS: Role[] = [
  "CHINA_WAREHOUSE",
  "DAR_WAREHOUSE",
  "CUSTOMER_SUPPORT",
  "FINANCE",
];

/** Anything that shows, sets or moves money. */
const MONEY: Permission[] = [
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
  "payroll.prepare",
  "payroll.approve",
];

describe("the warehouses are never shown a price", () => {
  for (const role of ["CHINA_WAREHOUSE", "DAR_WAREHOUSE"] as Role[]) {
    test(`${role} holds no money permission at all`, () => {
      /* A clerk who knows a wider box is a bigger bill has a reason to measure
         it narrower, and the office has no way to tell. The floor is asked to
         measure honestly, which is easier when measuring has no visible price
         attached. */
      const held = MONEY.filter((p) => can(role, p));
      assert.deepEqual(held, [], `${role} can see or move money: ${held.join(", ")}`);
    });
  }

  test("Dar acts on the release answer and cannot influence it", () => {
    assert.ok(can("DAR_WAREHOUSE", "release.execute"));
    assert.ok(can("DAR_WAREHOUSE", "release.view"));
    for (const p of ["invoice.issue", "invoice.discount", "payment.verify"] as Permission[]) {
      assert.equal(can("DAR_WAREHOUSE", p), false, p);
    }
  });

  test("China loads and seals; Dar receives and releases; neither does the other's half", () => {
    assert.ok(can("CHINA_WAREHOUSE", "container.load"));
    assert.ok(can("CHINA_WAREHOUSE", "container.seal"));
    assert.equal(can("CHINA_WAREHOUSE", "receiving.dar"), false);
    assert.equal(can("CHINA_WAREHOUSE", "release.execute"), false);

    assert.ok(can("DAR_WAREHOUSE", "receiving.dar"));
    assert.equal(can("DAR_WAREHOUSE", "container.load"), false);
    assert.equal(can("DAR_WAREHOUSE", "container.seal"), false);
    assert.equal(can("DAR_WAREHOUSE", "receiving.china"), false);
  });
});

describe("the support desk explains; it does not do", () => {
  /** Everything Support must be refused, and the sentence for why. */
  const REFUSED: [Permission, string][] = [
    ["receiving.china", "cannot say what physically arrived in Guangzhou"],
    ["receiving.dar", "cannot say what physically came off the container"],
    ["receiving.verify", "cannot sign off somebody else's count"],
    ["container.create", "cannot open a container"],
    ["container.load", "cannot pack one"],
    ["container.seal", "cannot shut one"],
    ["container.depart", "cannot sail one"],
    ["packingList.issue", "cannot freeze a manifest"],
    ["cargo.scan", "cannot scan cargo in or out"],
    ["payment.record", "cannot record money as taken"],
    ["payment.verify", "cannot turn a claim into money"],
    ["receipt.issue", "cannot issue a receipt"],
    ["rate.manage", "cannot move the rate book"],
    ["customerRate.manage", "cannot agree a customer rate"],
    ["fx.manage", "cannot move the board rate"],
    ["invoice.create", "cannot raise a bill by hand"],
    ["invoice.issue", "cannot issue one by hand"],
    ["invoice.cancel", "cannot cancel one"],
    ["release.execute", "cannot hand the boxes over"],
    ["record.reconcile", "cannot agree the books against the bank"],
    ["cargo.hold", "cannot stop a release"],
    ["cbm.override", "cannot overwrite a measured volume"],
    ["user.manage", "cannot make accounts"],
    ["settings.manage", "cannot change what the company is"],
  ];

  for (const [permission, why] of REFUSED) {
    test(`Support ${why}`, () => {
      assert.equal(can("CUSTOMER_SUPPORT", permission), false, permission);
    });
  }

  test("and can answer every question a customer rings about", () => {
    /* Without ringing Finance. The desk reads the bill, the rate book, the
       release answer and the whole company's cargo, and may hand a payment
       claim up and confirm a waiting price. */
    for (const p of [
      "cargo.viewAll",
      "container.view",
      "packingList.view",
      "shipment.view",
      "finance.view",
      "rate.view",
      "release.view",
      "payment.submit",
      "invoice.priceConfirm",
      "invoice.discount",
      "customer.view",
      "customer.manage",
      "conversation.reply",
      "notification.send",
      "search.global",
      "exception.raise",
      "delivery.manage",
    ] as Permission[]) {
      assert.ok(can("CUSTOMER_SUPPORT", p), p);
    }
  });

  test("the port steps belong to every desk in Dar that may hear first", () => {
    /* By the owner's decision, arrival and clearance are marked by whichever
       of these desks learns of it — the floor, Finance with the bill of
       lading, Support with the clearing agent on the phone, the manager, the
       owner. Clearing has a permission of its own so that holding it carries
       no authority over what the boxes are. Guangzhou holds neither. */
    for (const role of ["DAR_WAREHOUSE", "FINANCE", "CUSTOMER_SUPPORT", "MANAGER", "ADMIN"] as Role[]) {
      assert.ok(can(role, "container.arrive"), `${role} marks arrival`);
      assert.ok(can(role, "cargo.clear"), `${role} marks clearance`);
    }
    assert.equal(can("CHINA_WAREHOUSE", "container.arrive"), false);
    assert.equal(can("CHINA_WAREHOUSE", "cargo.clear"), false);
    assert.equal(can("CUSTOMER_SUPPORT", "receiving.dar"), false);

    /* Clearing is a paper step. It carries no authority over what the boxes
       actually are: Finance still cannot write a receiving count. */
    assert.equal(can("FINANCE", "receiving.dar"), false);
    assert.equal(can("FINANCE", "receiving.verify"), false);
    assert.equal(can("FINANCE", "cbm.override"), false);
  });

  test("Finance reconciles; the approvals queue stays the manager's", () => {
    assert.ok(can("FINANCE", "record.reconcile"));
    /* The money half only. Approvals, the control room and the management
       report are still `record.review`, and Finance does not hold it. */
    assert.equal(can("FINANCE", "record.review"), false);
    assert.equal(can("CUSTOMER_SUPPORT", "record.reconcile"), false);
    for (const role of ["MANAGER", "ADMIN"] as Role[]) {
      assert.ok(can(role, "record.reconcile"), role);
    }
  });

  test("every desk adds and edits customers; only Finance, the manager and the owner delete", () => {
    for (const role of ["CHINA_WAREHOUSE", "DAR_WAREHOUSE", "CUSTOMER_SUPPORT", "FINANCE", "MANAGER", "ADMIN"] as Role[]) {
      assert.ok(can(role, "customer.create"), role);
      assert.ok(can(role, "customer.manage"), role);
    }
    const deleters = (Object.keys(ROLE_PERMISSIONS) as Role[]).filter((r) => can(r, "customer.delete"));
    assert.deepEqual(deleters.sort(), ["ADMIN", "FINANCE", "MANAGER"]);
    assert.equal(can("CUSTOMER", "customer.manage"), false);
  });

  test("payment.verify is Finance's and nobody else's", () => {
    const holders = (Object.keys(ROLE_PERMISSIONS) as Role[]).filter((r) =>
      can(r, "payment.verify")
    );
    assert.deepEqual(holders.sort(), ["ADMIN", "FINANCE", "MANAGER"]);
  });
});

describe("the manager runs the business; the owner owns it", () => {
  /** The keys to the system, as opposed to the running of it. */
  const OWNER_ONLY: Permission[] = [
    "settings.manage",
    "fx.manage",
    "warehouse.manage",
    "container.delete",
  ];

  for (const p of OWNER_ONLY) {
    test(`the manager does not hold ${p}`, () => {
      assert.equal(can("MANAGER", p), false);
      assert.ok(can("ADMIN", p), "and the owner does");
    });
  }

  test("the manager may delete cargo, by the owner's later decision", () => {
    /* Unlike container.delete, this one is not held back from the manager —
       see the comment on MANAGER in lib/rbac.ts. */
    assert.ok(can("MANAGER", "cargo.delete"));
  });

  test("the manager hires and moves staff, by the owner's decision", () => {
    /* The person running the floor is the person who knows who has left, so
       the Staff screen is theirs. What stops it becoming a second set of keys
       is `lib/actions/users.ts`, which refuses to create an ADMIN, to move
       anybody into or out of ADMIN, or to touch an ADMIN's account, for any
       actor who is not one — and writes `user.escalationBlocked` when it does. */
    assert.ok(can("MANAGER", "user.manage"));
  });

  test("the manager holds oversight and the approvals the split depends on", () => {
    for (const p of [
      "record.review",
      "report.view",
      "audit.view",
      "records.viewDeleted",
      "expense.approve",
      "payroll.approve",
      "exception.approve",
      "exception.close",
    ] as Permission[]) {
      assert.ok(can("MANAGER", p), p);
    }
    /* Prepared by Finance, agreed by the manager. The split is the control. */
    assert.equal(can("FINANCE", "payroll.approve"), false);
    assert.ok(can("FINANCE", "payroll.prepare"));
  });

  test("the manager is otherwise the owner", () => {
    const missing = ROLE_PERMISSIONS.ADMIN.filter((p) => !can("MANAGER", p));
    assert.deepEqual(missing.sort(), [...OWNER_ONLY].sort());
  });
});

describe("the customer gate", () => {
  test("a customer holds no staff permission at all", () => {
    assert.deepEqual(ROLE_PERMISSIONS.CUSTOMER, []);
    assert.equal(isStaff("CUSTOMER"), false);
    for (const role of DESKS) assert.ok(isStaff(role), role);
  });

  test("no permission is granted by an absent role", () => {
    assert.equal(can(null, "cargo.view"), false);
    assert.equal(can(undefined, "finance.view"), false);
  });
});

describe("custody follows the cargo", () => {
  test("Guangzhou holds the outbound half, Dar the landed half", () => {
    assert.equal(cargoCustody("RECEIVED_CHINA"), "CHINA");
    assert.equal(cargoCustody("IN_TRANSIT"), "CHINA");
    assert.equal(cargoCustody("ARRIVED_TANZANIA"), "CHINA");
    assert.equal(cargoCustody("RECEIVED_DAR"), "DAR");
    assert.equal(cargoCustody("COLLECTED"), "DAR");

    assert.ok(canAmendCargo("CHINA_WAREHOUSE", "ARRIVED_TANZANIA"));
    assert.equal(canAmendCargo("CHINA_WAREHOUSE", "RECEIVED_DAR"), false);
    /* Dar holds both halves: a clerk with a bale in their hands was looking at
       cargo the system still called Guangzhou's. */
    assert.ok(canAmendCargo("DAR_WAREHOUSE", "ARRIVED_TANZANIA"));
    assert.ok(canAmendCargo("DAR_WAREHOUSE", "RECEIVED_DAR"));
    /* By the owner's later decision, Support holds both custody halves paired
       with cargo.edit — it may correct a record on either floor. Custody is
       still not the verb: cargo.delete is the one it does not also hold. */
    assert.ok(canAmendCargo("CUSTOMER_SUPPORT", "RECEIVED_CHINA"));
    assert.ok(canAmendCargo("CUSTOMER_SUPPORT", "RECEIVED_DAR"));
    assert.equal(can("CUSTOMER_SUPPORT", "cargo.delete"), false);
  });
});
