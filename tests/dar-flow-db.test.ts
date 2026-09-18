import assert from "node:assert/strict";
import Module from "node:module";
import path from "node:path";
import { after, before, describe, test } from "node:test";

import { Prisma, PrismaClient } from "@prisma/client";

/**
 * The Dar floor, against the real database, inside a transaction that is always
 * rolled back.
 *
 * What is under test is the end of a discharge: expected against counted, the
 * categories a clerk has to answer for, what may be signed off, what blocks the
 * box and what never blocks it. The refusals matter more than the successes —
 * every one of them is a real carton somebody would otherwise have ruled on
 * without looking.
 *
 * `server-only` refuses to load outside the Next server. The modules under test
 * are server code for that reason alone, so it is answered with an empty module
 * before they are loaded.
 */
const resolve = (Module as unknown as { _resolveFilename: (...args: unknown[]) => string })
  ._resolveFilename;
(Module as unknown as { _resolveFilename: (...args: unknown[]) => string })._resolveFilename =
  function (this: unknown, request: unknown, ...rest: unknown[]) {
    if (request === "server-only") {
      return path.join(__dirname, "..", "node_modules", "server-only", "empty.js");
    }
    return resolve.call(this, request, ...rest);
  };

const prisma = new PrismaClient();
const ROLLBACK = new Error("rollback");

type Confirm = typeof import("@/lib/container-confirmation");
type Release = typeof import("@/lib/release");
type Rbac = typeof import("@/lib/rbac");
type List = typeof import("@/lib/price-list");
let confirmLib: Confirm;
let releaseLib: Release;
let rbac: Rbac;
let listLib: List;

before(async () => {
  confirmLib = await import("@/lib/container-confirmation");
  releaseLib = await import("@/lib/release");
  rbac = await import("@/lib/rbac");
  listLib = await import("@/lib/price-list");
});

after(() => prisma.$disconnect());

async function inRollback(fn: (tx: Prisma.TransactionClient) => Promise<void>) {
  try {
    await prisma.$transaction(
      async (tx) => {
        await fn(tx);
        throw ROLLBACK;
      },
      { timeout: 60_000 }
    );
  } catch (error) {
    if (error !== ROLLBACK) throw error;
  }
}

async function actor(tx: Prisma.TransactionClient, role: "DAR_WAREHOUSE" | "MANAGER") {
  const user = await tx.user.findFirst({ where: { role } });
  assert.ok(user, `needs a ${role} user`);
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    department: user.department,
    warehouseId: user.warehouseId,
    customerId: null,
  };
}

let seq = 0;
const tag = () => `DART${Date.now().toString(36)}${seq++}`;

/** A landed container with nothing on it yet. */
async function landedContainer(tx: Prisma.TransactionClient) {
  const mark = tag();
  const container = await tx.container.create({
    data: {
      reference: `TEST-${mark}`,
      type: "HQ_40",
      status: "ARRIVED",
      originPort: "Guangzhou",
      destinationPort: "Dar es Salaam",
    },
  });
  return container;
}

/**
 * One consignment on that container, in whichever state the test needs.
 *
 * "unchecked" is the state that matters: on the manifest, and nobody in Dar has
 * said a word about it.
 */
async function consignment(
  tx: Prisma.TransactionClient,
  containerId: string,
  state: "unchecked" | "counted" | "damaged" | "missing" | "flagged" | "signed"
) {
  const mark = tag();
  const warehouse = await tx.warehouse.findFirst({ where: { kind: "TANZANIA" } });
  assert.ok(warehouse, "needs a Dar warehouse");
  const customer = await tx.customer.create({
    data: { code: `TEST-${mark}`, fullName: `Test ${mark}`, phone: `+2559${mark.slice(-8)}` },
  });
  const cargo = await tx.cargo.create({
    data: {
      reference: `TEST-${mark}`,
      qrToken: `TEST-QR-${mark}`,
      senderId: customer.id,
      receiverId: customer.id,
      description: "Test goods",
      declaredPackages: 4,
      status: state === "missing" ? "MISSING_AT_DAR" : state === "unchecked" ? "ARRIVED_TANZANIA" : "RECEIVED_DAR",
    },
  });
  await tx.chinaReceiving.create({
    data: {
      cargoId: cargo.id,
      warehouseId: (await tx.warehouse.findFirstOrThrow({ where: { kind: "CHINA" } })).id,
      packagesCount: 4,
      cbm: new Prisma.Decimal("1.2"),
      weightKg: new Prisma.Decimal("80"),
    },
  });
  await tx.containerCargo.create({
    data: {
      containerId,
      cargoId: cargo.id,
      packagesCount: 4,
      cbm: new Prisma.Decimal("1.2"),
    },
  });

  if (state !== "unchecked" && state !== "missing") {
    await tx.darReceiving.create({
      data: {
        cargoId: cargo.id,
        warehouseId: warehouse.id,
        containerId,
        packagesCount: state === "flagged" ? 3 : 4,
        cbm: new Prisma.Decimal("1.2"),
        condition: state === "damaged" ? "DAMAGED" : "GOOD",
        discrepancy: state === "damaged" || state === "flagged",
        verified: state === "signed",
        verifiedAt: state === "signed" ? new Date() : null,
      },
    });
  }
  return { cargo, customer };
}

describe("what the floor has to answer for before it signs a box off", () => {
  test("missing and damaged are counted, and neither is unchecked", async () => {
    await inRollback(async (tx) => {
      const container = await landedContainer(tx);
      await consignment(tx, container.id, "counted");
      await consignment(tx, container.id, "damaged");
      await consignment(tx, container.id, "missing");
      await consignment(tx, container.id, "unchecked");

      const counts = confirmLib.tally(await confirmLib.linesOf(tx, container.id));
      assert.equal(counts.expected.length, 4, "four on the manifest");
      assert.equal(counts.counted.length, 2, "two have a Dar count");
      assert.equal(counts.missing.length, 1);
      assert.equal(counts.damaged.length, 1);
      assert.equal(counts.unchecked.length, 1, "only the one nobody touched");
      assert.equal(counts.toSign.length, 1, "the damaged one is not signed off");
    });
  });

  test("a consignment already signed off is not signed off twice", async () => {
    await inRollback(async (tx) => {
      const container = await landedContainer(tx);
      await consignment(tx, container.id, "signed");
      const counts = confirmLib.tally(await confirmLib.linesOf(tx, container.id));
      assert.equal(counts.counted.length, 1);
      assert.equal(counts.toSign.length, 0);
    });
  });
});

describe("confirming a container at Dar", () => {
  test("refuses while anything is unchecked, and names it", async () => {
    await inRollback(async (tx) => {
      const container = await landedContainer(tx);
      await consignment(tx, container.id, "counted");
      const waiting = await consignment(tx, container.id, "unchecked");

      await assert.rejects(
        async () =>
          confirmLib.confirmContainerAtDar(tx, await actor(tx, "DAR_WAREHOUSE"), {
            container,
            overrideReason: "",
            mayOverride: false,
          }),
        (error: Error) => {
          assert.ok(error instanceof confirmLib.ConfirmationRefused);
          assert.match(error.message, new RegExp(waiting.cargo.reference));
          return true;
        }
      );
    });
  });

  test("a reason alone is not the authority to sign off over it", async () => {
    await inRollback(async (tx) => {
      const container = await landedContainer(tx);
      await consignment(tx, container.id, "unchecked");

      await assert.rejects(
        async () =>
          confirmLib.confirmContainerAtDar(tx, await actor(tx, "DAR_WAREHOUSE"), {
            container,
            overrideReason: "The lorry left and the shift ended",
            mayOverride: false,
          }),
        (error: Error) => {
          assert.ok(error instanceof confirmLib.ConfirmationRefused);
          assert.match(error.message, /manager/i);
          return true;
        }
      );
    });
  });

  test("the authority without a reason is still refused", async () => {
    await inRollback(async (tx) => {
      const container = await landedContainer(tx);
      await consignment(tx, container.id, "unchecked");

      await assert.rejects(
        async () =>
          confirmLib.confirmContainerAtDar(tx, await actor(tx, "MANAGER"), {
            container,
            overrideReason: "x",
            mayOverride: true,
          }),
        (error: Error) => error instanceof confirmLib.ConfirmationRefused
      );
    });
  });

  test("the override opens a case on every consignment it rules over", async () => {
    await inRollback(async (tx) => {
      const container = await landedContainer(tx);
      const clean = await consignment(tx, container.id, "counted");
      const waiting = await consignment(tx, container.id, "unchecked");
      const boss = await actor(tx, "MANAGER");

      const result = await confirmLib.confirmContainerAtDar(tx, boss, {
        container,
        overrideReason: "Shift ended with three marks unreadable",
        mayOverride: true,
      });

      assert.equal(result.overridden, true);
      assert.deepEqual(result.stranded, [waiting.cargo.reference]);

      const signed = await tx.darReceiving.findUniqueOrThrow({
        where: { cargoId: clean.cargo.id },
      });
      assert.equal(signed.verified, true, "the counted one is signed off");

      const opened = await tx.exceptionCase.findFirstOrThrow({
        where: { cargoId: waiting.cargo.id },
      });
      assert.equal(opened.containerId, container.id, "linked to the container");
      assert.equal(opened.customerId, waiting.customer.id, "and to the customer");
      assert.equal(opened.raisedById, boss.id, "with a name on it");
      assert.equal(opened.status, "OPEN");
      assert.match(opened.description ?? "", /three marks unreadable/);

      const events = await tx.exceptionEvent.findMany({ where: { caseId: opened.id } });
      assert.equal(events.length, 1, "the case keeps its own opening event");

      const history = await tx.containerEvent.findMany({
        where: { containerId: container.id },
      });
      assert.ok(
        history.some((e) => (e.note ?? "").includes("over 1 unchecked")),
        "the container keeps the override on its history"
      );
    });
  });

  test("a second confirmation does not open a second case on the same cargo", async () => {
    await inRollback(async (tx) => {
      const container = await landedContainer(tx);
      const waiting = await consignment(tx, container.id, "unchecked");
      const boss = await actor(tx, "MANAGER");
      const input = {
        container,
        overrideReason: "Shift ended",
        mayOverride: true,
      };

      await confirmLib.confirmContainerAtDar(tx, boss, input);
      const again = await confirmLib.confirmContainerAtDar(tx, boss, input);

      assert.deepEqual(again.stranded, [], "nothing newly stranded");
      const cases = await tx.exceptionCase.count({ where: { cargoId: waiting.cargo.id } });
      assert.equal(cases, 1, "one case, not two");
    });
  });

  test("a container still being filled in Guangzhou cannot be confirmed", async () => {
    await inRollback(async (tx) => {
      const container = await landedContainer(tx);
      await tx.container.update({ where: { id: container.id }, data: { status: "LOADING" } });
      await consignment(tx, container.id, "counted");

      await assert.rejects(
        async () =>
          confirmLib.confirmContainerAtDar(tx, await actor(tx, "DAR_WAREHOUSE"), {
            container: { ...container, status: "LOADING" },
            overrideReason: "",
            mayOverride: false,
          }),
        (error: Error) => {
          assert.ok(error instanceof confirmLib.ConfirmationRefused);
          assert.match(error.message, /not been discharged/i);
          return true;
        }
      );
    });
  });

  test("an empty box is not a container that checked out clean", async () => {
    await inRollback(async (tx) => {
      const container = await landedContainer(tx);
      await assert.rejects(
        async () =>
          confirmLib.confirmContainerAtDar(tx, await actor(tx, "DAR_WAREHOUSE"), {
            container,
            overrideReason: "",
            mayOverride: false,
          }),
        (error: Error) => {
          assert.ok(error instanceof confirmLib.ConfirmationRefused);
          assert.match(error.message, /no cargo/i);
          return true;
        }
      );
    });
  });

  test("missing and damaged never block it", async () => {
    await inRollback(async (tx) => {
      const container = await landedContainer(tx);
      const clean = await consignment(tx, container.id, "counted");
      const hurt = await consignment(tx, container.id, "damaged");
      const gone = await consignment(tx, container.id, "missing");

      const result = await confirmLib.confirmContainerAtDar(
        tx,
        await actor(tx, "DAR_WAREHOUSE"),
        { container, overrideReason: "", mayOverride: false }
      );

      assert.equal(result.overridden, false);
      assert.equal(result.counts.toSign.length, 1);
      assert.equal(result.counts.missing.length, 1);
      assert.equal(result.counts.damaged.length, 1);

      assert.equal(
        (await tx.darReceiving.findUniqueOrThrow({ where: { cargoId: clean.cargo.id } }))
          .verified,
        true
      );
      assert.equal(
        (await tx.darReceiving.findUniqueOrThrow({ where: { cargoId: hurt.cargo.id } }))
          .verified,
        false,
        "a wet bale is not signed off by confirming the box around it"
      );
      assert.equal(
        await tx.darReceiving.count({ where: { cargoId: gone.cargo.id } }),
        0,
        "and nothing was invented for the one that never came off"
      );
    });
  });

  test("China's figures are not touched by the confirmation", async () => {
    await inRollback(async (tx) => {
      const container = await landedContainer(tx);
      const { cargo } = await consignment(tx, container.id, "flagged");
      const before = await tx.chinaReceiving.findUniqueOrThrow({
        where: { cargoId: cargo.id },
      });

      await confirmLib.confirmContainerAtDar(tx, await actor(tx, "DAR_WAREHOUSE"), {
        container,
        overrideReason: "",
        mayOverride: false,
      });

      const after = await tx.chinaReceiving.findUniqueOrThrow({
        where: { cargoId: cargo.id },
      });
      assert.equal(after.packagesCount, before.packagesCount, "4, as China counted");
      assert.equal(after.cbm.toString(), before.cbm.toString());
      const dar = await tx.darReceiving.findUniqueOrThrow({ where: { cargoId: cargo.id } });
      assert.equal(dar.packagesCount, 3, "and Dar's own count stands beside it");
    });
  });
});

describe("what Finance reads is what Dar counted", () => {
  test("the price list takes Dar's figures and carries the damaged tag", async () => {
    await inRollback(async (tx) => {
      const container = await landedContainer(tx);
      const hurt = await consignment(tx, container.id, "damaged");

      const list = await listLib.priceListFor(
        listLib.WAITING_ON_CONTAINER(container.id),
        tx
      );
      const row = list.rows.find((r) => r.cargoId === hurt.cargo.id);
      assert.ok(row, "the damaged consignment is on the list");
      assert.equal(row.damaged, true, "tagged for whoever prices it");
      assert.equal(row.condition, "DAMAGED");
      assert.equal(row.packages, 4, "Dar's count, not China's declaration");
    });
  });

  test("cargo that never came off is not on the list at all", async () => {
    await inRollback(async (tx) => {
      const container = await landedContainer(tx);
      const gone = await consignment(tx, container.id, "missing");

      const list = await listLib.priceListFor(
        listLib.WAITING_ON_CONTAINER(container.id),
        tx
      );
      assert.ok(
        !list.rows.some((r) => r.cargoId === gone.cargo.id),
        "nobody is billed for boxes nobody found"
      );
    });
  });
});

describe("the release answer the Dar counter acts on", () => {
  const paidInvoice = {
    status: "ISSUED",
    total: new Prisma.Decimal(100),
    currency: "USD",
    fxRate: new Prisma.Decimal(2500),
    payments: [
      {
        status: "VERIFIED",
        amount: new Prisma.Decimal(250_000),
        currency: "TZS",
        fxRate: new Prisma.Decimal(2500),
        baseCurrencyAmount: new Prisma.Decimal(250_000),
        creditedAmount: null,
      },
    ],
  };

  const settled = {
    status: "RECEIVED_DAR",
    operationalHold: false,
    operationalHoldReason: null,
    clearedAt: new Date() as Date | null,
    pickupNote: { status: "ACTIVE", onCredit: false },
    darReceiving: { verified: true, discrepancy: false },
    invoices: [paidInvoice],
    exceptions: [],
  };

  test("everything clear lets the boxes go", () => {
    assert.equal(releaseLib.checkRelease(settled).ok, true);
  });

  test("paid in full is still refused while it is in customs clearance", () => {
    const check = releaseLib.checkRelease({ ...settled, clearedAt: null });
    assert.equal(check.ok, false);
    assert.match(check.blockedBy ?? "", /clearance/i);
  });

  test("a damaged consignment is not available for pickup", () => {
    const check = releaseLib.checkRelease({
      ...settled,
      darReceiving: { verified: false, discrepancy: true },
    });
    assert.equal(check.ok, false);
    assert.ok(check.blockedBy);
  });

  test("an open case stops it, whatever has been paid", () => {
    const check = releaseLib.checkRelease({
      ...settled,
      exceptions: [{ status: "OPEN", reference: "EXC-TEST" }],
    });
    assert.equal(check.ok, false);
    assert.match(check.blockedBy ?? "", /EXC-TEST/);
  });

  test("a spent pickup note cannot let the same goods out twice", () => {
    const check = releaseLib.checkRelease({
      ...settled,
      pickupNote: { status: "USED", onCredit: false },
    });
    assert.equal(check.ok, false);
    assert.match(check.blockedBy ?? "", /already been used/i);
  });

  test("unpaid goods are refused, and the refusal names no figure", () => {
    const check = releaseLib.checkRelease({
      ...settled,
      pickupNote: null,
      invoices: [{ ...paidInvoice, payments: [] }],
    });
    assert.equal(check.ok, false);
    assert.ok(
      !/\d/.test(check.blockedBy ?? ""),
      "the floor is told it is unpaid, never how much"
    );
  });

  test("Finance's credit note is the one way unpaid goods leave", () => {
    const check = releaseLib.checkRelease({
      ...settled,
      pickupNote: { status: "ACTIVE", onCredit: true },
      invoices: [{ ...paidInvoice, payments: [] }],
    });
    assert.equal(check.ok, true, "released on a written decision, not on a screenshot");
  });

  test("goods already handed over cannot be handed over again", () => {
    const check = releaseLib.checkRelease({ ...settled, status: "COLLECTED" });
    assert.equal(check.ok, false);
  });
});

describe("the Dar floor never sees a price and cannot set one", () => {
  const money = [
    "finance.view",
    "accounting.view",
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
    "profit.view",
  ] as const;

  test("no money permission reaches the Dar warehouse", () => {
    for (const permission of money) {
      assert.equal(
        rbac.can("DAR_WAREHOUSE", permission),
        false,
        `DAR_WAREHOUSE must not hold ${permission}`
      );
    }
  });

  test("it receives, keeps and releases", () => {
    for (const permission of ["receiving.dar", "receiving.verify", "release.execute", "container.arrive", "container.close"] as const) {
      assert.equal(rbac.can("DAR_WAREHOUSE", permission), true);
    }
  });

  test("signing a box off over uncounted cargo sits above the counting desk", () => {
    assert.equal(rbac.can("DAR_WAREHOUSE", "container.confirmUnchecked"), false);
    assert.equal(rbac.can("CUSTOMER_SUPPORT", "container.confirmUnchecked"), false);
    assert.equal(rbac.can("FINANCE", "container.confirmUnchecked"), false);
    assert.equal(rbac.can("MANAGER", "container.confirmUnchecked"), true);
    assert.equal(rbac.can("ADMIN", "container.confirmUnchecked"), true);
  });

  test("once Dar holds the boxes, the record is Dar's to amend", () => {
    assert.equal(rbac.cargoCustody("ARRIVED_TANZANIA"), "CHINA");
    assert.equal(rbac.cargoCustody("RECEIVED_DAR"), "DAR");
    assert.equal(rbac.canAmendCargo("DAR_WAREHOUSE", "RECEIVED_DAR"), true);
    assert.equal(rbac.canAmendCargo("CHINA_WAREHOUSE", "RECEIVED_DAR"), false);
  });
});
