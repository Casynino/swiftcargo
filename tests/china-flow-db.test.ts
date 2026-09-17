import assert from "node:assert/strict";
import Module from "node:module";
import path from "node:path";
import { after, before, describe, test } from "node:test";

import { Prisma, PrismaClient } from "@prisma/client";

/**
 * The Guangzhou end of the chain, against the real database, inside a
 * transaction that is always rolled back.
 *
 * `server-only` refuses to load outside the Next server, and lib/packing-list
 * is server code for that reason alone, so it is answered with an empty module
 * before it is imported.
 */
const resolve = (
  Module as unknown as { _resolveFilename: (...args: unknown[]) => string }
)._resolveFilename;
(
  Module as unknown as { _resolveFilename: (...args: unknown[]) => string }
)._resolveFilename = function (this: unknown, request: unknown, ...rest: unknown[]) {
  if (request === "server-only") {
    return path.join(__dirname, "..", "node_modules", "server-only", "empty.js");
  }
  return resolve.call(this, request, ...rest);
};

const prisma = new PrismaClient();
const ROLLBACK = new Error("rollback");

type PackingLib = typeof import("@/lib/packing-list");
let packing: PackingLib;

before(async () => {
  packing = await import("@/lib/packing-list");
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

let tag = 0;
const next = () => `CN${Date.now().toString(36)}${tag++}`;

/**
 * One container in Guangzhou with two customers' cargo in it, measured and
 * loaded the way the counter and the loading bay leave it.
 */
async function loadedContainer(tx: Prisma.TransactionClient) {
  const warehouse = await tx.warehouse.findFirst({
    where: { kind: "CHINA" },
    select: { id: true, name: true },
  });
  assert.ok(warehouse, "needs a China warehouse");

  const container = await tx.container.create({
    data: {
      reference: `TEST-${next()}`,
      type: "HQ_40",
      status: "LOADING",
      originPort: "Guangzhou",
      destinationPort: "Dar es Salaam",
    },
  });
  await tx.shipment.create({
    data: {
      reference: `TEST-SHP-${next()}`,
      containerId: container.id,
      vessel: "MV Test",
      voyage: "001E",
    },
  });

  const made: { cargoId: string; reference: string }[] = [];
  for (const [index, spec] of [
    { name: "Amina", packages: 4, pieces: 200, cbm: "1.2000", weight: "80.000" },
    { name: "Baraka", packages: 5, pieces: null, cbm: "0.5000", weight: "60.000" },
  ].entries()) {
    const code = next();
    const customer = await tx.customer.create({
      data: {
        code: `TEST-${code}`,
        fullName: `Test ${spec.name}`,
        phone: `+2557000${code.slice(-5)}`,
        shippingMark: `TEST ${spec.name.toUpperCase()}`,
      },
    });
    const reference = `TEST-${next()}`;
    const cargo = await tx.cargo.create({
      data: {
        reference,
        qrToken: `TEST-QR-${next()}`,
        senderId: customer.id,
        receiverId: customer.id,
        shippingMark: customer.shippingMark,
        paperReceiptNo: `000300${index}`,
        description: "Assorted goods",
        status: "ASSIGNED_TO_CONTAINER",
      },
    });
    await tx.cargoPackage.create({
      data: {
        cargoId: cargo.id,
        reference: `${reference}-P1`,
        paperReceiptNo: `000300${index}`,
        description: "Shoes",
        descriptionZh: "鞋",
        cargoType: "General",
        quantity: spec.packages,
        pieces: spec.pieces,
        cbm: new Prisma.Decimal(spec.cbm),
        weightKg: new Prisma.Decimal(spec.weight),
        containerId: container.id,
        qrToken: `TEST-PQR-${next()}`,
      },
    });
    await tx.chinaReceiving.create({
      data: {
        cargoId: cargo.id,
        warehouseId: warehouse.id,
        packagesCount: spec.packages,
        piecesCount: spec.pieces,
        weightKg: new Prisma.Decimal(spec.weight),
        cbm: new Prisma.Decimal(spec.cbm),
        location: "Row C",
      },
    });
    await tx.containerCargo.create({
      data: {
        containerId: container.id,
        cargoId: cargo.id,
        packagesCount: spec.packages,
        cbm: new Prisma.Decimal(spec.cbm),
        weightKg: new Prisma.Decimal(spec.weight),
        loadedAt: new Date(),
      },
    });
    made.push({ cargoId: cargo.id, reference });
  }

  return { container, warehouse, cargo: made };
}

describe("the packing list is read back out of the container", () => {
  test("every total is the sum of the lines printed under it", async () => {
    await inRollback(async (tx) => {
      const { container } = await loadedContainer(tx);
      const snap = await packing.buildSnapshot(tx, container.id);
      assert.ok(snap);

      const cbm = snap.lines.reduce((sum, l) => sum + Number(l.cbm), 0);
      assert.equal(Number(snap.totalCbm), cbm);
      assert.equal(
        snap.totalPackages,
        snap.lines.reduce((sum, l) => sum + l.packages, 0)
      );
      assert.equal(
        snap.totalWeightKg === null ? 0 : Number(snap.totalWeightKg),
        snap.lines.reduce((sum, l) => sum + Number(l.weightKg ?? 0), 0)
      );
      assert.equal(snap.totalCargo, snap.lines.length);
      assert.equal(snap.totalCustomers, 2);
      /* One consignment was never tallied by piece; the total counts what was
         counted rather than reading the blank as a zero for that customer. */
      assert.equal(snap.totalPieces, 200);
    });
  });

  test("it carries what the shipping line and customs read it for", async () => {
    await inRollback(async (tx) => {
      const { container, warehouse } = await loadedContainer(tx);
      const snap = await packing.buildSnapshot(tx, container.id);
      assert.ok(snap);

      assert.equal(snap.originWarehouse, warehouse.name);
      assert.equal(snap.destinationPort, "Dar es Salaam");
      assert.equal(snap.vessel, "MV Test");
      assert.equal(snap.voyage, "001E");
      for (const line of snap.lines) {
        assert.ok(line.paperReceiptNo, "the carbon page number is on the row");
        assert.ok(line.customerCode);
        assert.ok(line.items?.length);
        assert.equal(line.items?.[0].descriptionZh, "鞋");
        assert.equal(line.items?.[0].cargoType, "General");
        assert.ok(line.items?.[0].paperReceiptNo);
      }
    });
  });

  test("a volume is charged to the box it went into, not to the whole delivery", async () => {
    await inRollback(async (tx) => {
      const { container, cargo } = await loadedContainer(tx);

      /* The delivery was measured at 1.2 CBM; only half of it caught this
         sailing. The manifest has to claim the half, because the other half is
         on somebody else's packing list. */
      await tx.containerCargo.updateMany({
        where: { containerId: container.id, cargoId: cargo[0].cargoId },
        data: { packagesCount: 2, cbm: new Prisma.Decimal("0.6000") },
      });

      const snap = await packing.buildSnapshot(tx, container.id);
      assert.ok(snap);
      const split = snap.lines.find((l) => l.cargoReference === cargo[0].reference);
      assert.equal(Number(split?.cbm), 0.6);
      assert.equal(split?.packages, 2);
      assert.equal(Number(snap.totalCbm), 1.1);
    });
  });

  test("freezing it stamps who drew it and which drawing it is", async () => {
    await inRollback(async (tx) => {
      const { container } = await loadedContainer(tx);
      const staff = await tx.user.findFirst({ select: { id: true, name: true } });
      assert.ok(staff, "needs a member of staff");

      const early = await packing.issueFor(tx, container.id, staff.id);
      assert.ok(early, "an early print is a real document");

      const first = await tx.packingList.findUniqueOrThrow({
        where: { containerId: container.id },
      });
      const firstSnap = first.snapshot as unknown as { version: number; issuedBy: string | null };
      assert.equal(firstSnap.version, 1);
      assert.equal(firstSnap.issuedBy, staff.name);

      /* The seal redraws it from what is in the box now. The number stays,
         because it may already be on paper at a port; the drawing does not. */
      const sealed = await packing.issueFor(tx, container.id, staff.id, {
        atSeal: true,
      });
      assert.equal(sealed?.number, early.number);

      const second = await tx.packingList.findUniqueOrThrow({
        where: { containerId: container.id },
      });
      assert.equal(
        (second.snapshot as unknown as { version: number }).version,
        2
      );
    });
  });

  test("an empty box has no packing list to issue", async () => {
    await inRollback(async (tx) => {
      const container = await tx.container.create({
        data: { reference: `TEST-${next()}`, type: "HQ_40", status: "OPEN" },
      });
      const staff = await tx.user.findFirstOrThrow({ select: { id: true } });
      assert.equal(await packing.issueFor(tx, container.id, staff.id), null);
    });
  });
});

describe("a consignment sits in one box at a time", () => {
  test("nothing live is on two containers that are both still going somewhere", async () => {
    /*
      The physical fact is single-valued by construction — a package holds one
      containerId — but the commercial line is per sailing, and a consignment
      genuinely split across two sailings has two of them. What must never
      happen is the same cargo counted on two boxes that are both still
      travelling: it would be loaded twice, billed twice and checked in twice.
    */
    const live = await prisma.containerCargo.groupBy({
      by: ["cargoId"],
      where: { container: { status: { notIn: ["CLOSED"] }, deletedAt: null } },
      _count: { cargoId: true },
      having: { cargoId: { _count: { gt: 1 } } },
    });
    assert.deepEqual(
      live.map((row) => row.cargoId),
      [],
      "a consignment is on more than one container that has not closed"
    );
  });

  test("a container line's packages really are in that container", async () => {
    const lines = await prisma.containerCargo.findMany({
      where: { container: { deletedAt: null, status: { in: ["OPEN", "LOADING"] } } },
      select: { containerId: true, cargoId: true, packagesCount: true, cbm: true },
    });
    for (const line of lines) {
      const packages = await prisma.cargoPackage.findMany({
        where: {
          cargoId: line.cargoId,
          containerId: line.containerId,
          deletedAt: null,
        },
        select: { quantity: true, cbm: true },
      });
      const cbm = packages.reduce(
        (sum, p) => sum.add(p.cbm),
        new Prisma.Decimal(0)
      );
      assert.ok(
        cbm.equals(line.cbm),
        `open container line ${line.cargoId} claims ${line.cbm} CBM; its packages add to ${cbm}`
      );
      assert.equal(
        packages.reduce((sum, p) => sum + p.quantity, 0),
        line.packagesCount,
        `open container line ${line.cargoId} claims ${line.packagesCount} packages`
      );
    }
  });
});

describe("what Guangzhou measures is kept as Guangzhou measured it", () => {
  test("a receiving row's volume is the sum of its own lines", async () => {
    const received = await prisma.chinaReceiving.findMany({
      where: { cargo: { deletedAt: null, packages: { some: { deletedAt: null } } } },
      select: {
        cbm: true,
        cargo: {
          select: {
            reference: true,
            packages: { where: { deletedAt: null }, select: { cbm: true } },
          },
        },
      },
      take: 200,
    });
    for (const row of received) {
      const lines = row.cargo.packages.reduce(
        (sum, p) => sum.add(p.cbm),
        new Prisma.Decimal(0)
      );
      assert.ok(
        lines.equals(row.cbm),
        `${row.cargo.reference}: receiving says ${row.cbm} CBM, its lines add to ${lines}`
      );
    }
  });

  test("no stored volume is negative", async () => {
    assert.equal(
      await prisma.cargoPackage.count({ where: { cbm: { lt: 0 } } }),
      0
    );
    assert.equal(
      await prisma.cargoPackage.count({ where: { weightKg: { lt: 0 } } }),
      0
    );
    assert.equal(
      await prisma.containerCargo.count({ where: { cbm: { lt: 0 } } }),
      0
    );
  });
});
