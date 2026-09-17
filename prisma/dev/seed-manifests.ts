import { PrismaClient, Prisma, type CargoStatus } from "@prisma/client";
import { refuseProductionDatabase } from "./guard";

refuseProductionDatabase("prisma/dev/seed-manifests.ts");

const prisma = new PrismaClient();

/**
 * TEN CONSIGNMENTS IN EVERY SAILING CONTAINER.
 *
 * Demo data for the screens that are read rather than filled in: a sealed
 * container's manifest, Dar's review sheet, the packing list. A box holding two
 * consignments cannot show whether a manifest of forty reads well.
 *
 * Each consignment is built the way the app builds one — item lines with cargo
 * types, a China receiving record, both timeline rows, the valuation the rate
 * book gives — and then loaded onto its container and moved to whatever status
 * that container is already at. Nothing here is a shortcut around the model.
 */

const pad = (n: number, w = 6) => String(n).padStart(w, "0");

async function seq(tx: Prisma.TransactionClient, key: string) {
  const c = await tx.counter.upsert({
    where: { key },
    create: { key, value: 1 },
    update: { value: { increment: 1 } },
  });
  return c.value;
}

const GOODS = [
  ["Ladies shoes", "女士鞋", "Shoes", "CARTON"],
  ["Cotton fabric rolls", "棉布卷", "Clothing", "BALE"],
  ["Ladies handbags", "女士手提包", "Hand Bags", "CARTON"],
  ["Phone chargers", "手机充电器", "Mobile Accessories", "CARTON"],
  ["LED bulbs", "LED灯泡", "Electronic", "CARTON"],
  ["Kitchen plastics", "厨房塑料", "Kitchen Items", "BAG"],
  ["Ceramic tiles", "瓷砖", "Tiles", "PALLET"],
  ["Motorcycle spares", "摩托车配件", "Car Spare Parts", "CARTON"],
  ["Hand tools", "手动工具", "Hardware", "CARTON"],
  ["Office chairs", "办公椅", "Furniture", "CARTON"],
  ["School books", "练习本", "Books & Stationary", "CARTON"],
  ["Baby toys", "婴儿玩具", "Toys", "CARTON"],
  ["Face creams", "面霜", "Cosmetics", "CARTON"],
  ["Solar panels", "太阳能板", "Solar Items", "PALLET"],
  ["Bicycle frames", "自行车架", "Bicycles", "CRATE"],
] as const;

/** Where a consignment sits, given where its container is. */
const CARGO_STATUS: Record<string, CargoStatus> = {
  SEALED: "CONTAINER_LOADED",
  DEPARTED: "DEPARTED_CHINA",
  IN_TRANSIT: "IN_TRANSIT",
  ARRIVED: "ARRIVED_TANZANIA",
};

const spread = (i: number, lo: number, hi: number) =>
  lo + ((i * 7919) % (hi - lo + 1));

async function main() {
  const y = new Date().getFullYear();

  const [warehouse, actor, rates, customers] = await Promise.all([
    prisma.warehouse.findFirst({ where: { active: true, kind: "CHINA" } }),
    prisma.user.findFirst({ where: { email: "china@swiftcargo.co.tz" } }),
    prisma.shippingRate.findMany({
      where: { active: true, service: "LCL" },
      orderBy: { effectiveFrom: "desc" },
    }),
    prisma.customer.findMany({
      where: { deletedAt: null },
      orderBy: { code: "asc" },
      select: { id: true, code: true, fullName: true, phone: true, shippingMark: true },
    }),
  ]);

  if (!warehouse || !actor) throw new Error("Seed the demo data first.");
  if (customers.length === 0) throw new Error("No customers to ship for.");

  const rateFor = (type: string) =>
    rates.find((r) => r.cargoType === type) ??
    rates.find((r) => r.cargoType === null) ??
    null;

  const containers = await prisma.container.findMany({
    where: {
      deletedAt: null,
      status: { in: ["SEALED", "DEPARTED", "IN_TRANSIT", "ARRIVED"] },
    },
    include: { _count: { select: { cargoLines: true } } },
    orderBy: { reference: "asc" },
  });

  const last = await prisma.cargo.findFirst({
    where: { paperReceiptNo: { not: null } },
    orderBy: { paperReceiptNo: "desc" },
    select: { paperReceiptNo: true },
  });
  let note = Number(last?.paperReceiptNo ?? 3100);

  for (const container of containers) {
    const wanted = 10 - container._count.cargoLines;
    if (wanted <= 0) {
      console.log(`${container.reference} already carries ${container._count.cargoLines}`);
      continue;
    }

    const status = CARGO_STATUS[container.status] ?? "CONTAINER_LOADED";

    for (let i = 0; i < wanted; i++) {
      const customer = customers[(i * 3 + container.reference.length) % customers.length];
      const [description, zh, cargoType, packageType] =
        GOODS[(i + container.reference.length) % GOODS.length];
      note += 1;
      const receiptNo = pad(note, 7);

      await prisma.$transaction(async (tx) => {
        const quantity = spread(i, 3, 26);
        const pieces = spread(i + 4, 12, 260);
        const cbm = new Prisma.Decimal((spread(i, 40, 310) / 100).toFixed(4));
        const weightKg = new Prisma.Decimal(spread(i + 6, 40, 520));

        const rate = rateFor(cargoType);
        const amount =
          rate?.basis === "PER_KG"
            ? weightKg.mul(rate.rate).toDecimalPlaces(2)
            : rate
              ? cbm.mul(rate.rate).toDecimalPlaces(2)
              : new Prisma.Decimal(0);

        const reference = `SWC-${y}-${pad(await seq(tx, `cargo:${y}`))}`;

        const cargo = await tx.cargo.create({
          data: {
            reference,
            qrToken: `SWQ${reference.replace(/\D/g, "")}${i}`,
            senderId: customer.id,
            receiverId: customer.id,
            shippingMark: customer.shippingMark,
            paperReceiptNo: receiptNo,
            service: "LCL",
            description,
            declaredPackages: quantity,
            declaredCbm: cbm,
            status,
            createdById: actor.id,
            estimatedValue: amount,
            estimatedCurrency: rates[0]?.currency ?? "USD",
            estimatedAt: new Date(),
            valuationSnapshot: {
              pricedOn: new Date().toISOString(),
              currency: rates[0]?.currency ?? "USD",
              subtotal: amount.toString(),
              unpriced: rate ? 0 : 1,
              lines: [
                {
                  line: 1,
                  description,
                  cargoType,
                  quantity,
                  pieces,
                  cbm: cbm.toString(),
                  weightKg: weightKg.toString(),
                  rate: rate?.rate.toString() ?? null,
                  basis: rate?.basis ?? null,
                  amount: amount.toString(),
                  blocked: rate ? null : "No live rate for this cargo type.",
                },
              ],
            },
          },
        });

        /* The whole journey, so the timeline is not a record that begins
           halfway through. */
        const journey: CargoStatus[] = [
          "REGISTERED",
          "RECEIVED_CHINA",
          "ASSIGNED_TO_CONTAINER",
          "CONTAINER_LOADED",
          "DEPARTED_CHINA",
          "IN_TRANSIT",
          "ARRIVED_TANZANIA",
        ];
        const upTo = journey.slice(0, journey.indexOf(status) + 1);
        await tx.cargoStatusHistory.createMany({
          data: upTo.map((to, n) => ({
            cargoId: cargo.id,
            from: n === 0 ? null : upTo[n - 1],
            to,
            actorId: actor.id,
          })),
        });

        await tx.cargoPackage.create({
          data: {
            cargoId: cargo.id,
            reference: `${reference}-P1`,
            packageType: packageType as never,
            description,
            descriptionZh: zh,
            cargoType,
            quantity,
            pieces,
            unit: "CM",
            weightKg,
            cbm,
            cbmOverridden: true,
            containerId: container.id,
          },
        });

        await tx.chinaReceiving.create({
          data: {
            cargoId: cargo.id,
            warehouseId: warehouse.id,
            packagesCount: quantity,
            piecesCount: pieces,
            weightKg,
            cbm,
            condition: "GOOD",
            receivedById: actor.id,
          },
        });

        await tx.containerCargo.create({
          data: {
            containerId: container.id,
            cargoId: cargo.id,
            packagesCount: quantity,
            weightKg,
            cbm,
            loadedAt: container.sealedAt ?? new Date(),
          },
        });

        await tx.deliveryNote.create({
          data: {
            number: `DN-${y}-${pad(await seq(tx, `deliveryNote:${y}`))}`,
            cargoId: cargo.id,
            issuedById: actor.id,
            snapshot: {
              cargoReference: reference,
              paperReceiptNo: receiptNo,
              shippingMark: customer.shippingMark,
              description,
              packagesCount: quantity,
              piecesCount: pieces,
              cbm: cbm.toString(),
              weightKg: weightKg.toString(),
              condition: "GOOD",
              warehouse: warehouse.name,
              receivedAt: new Date().toISOString(),
              sender: { code: customer.code, name: customer.fullName, phone: customer.phone },
              receiver: { name: customer.fullName, phone: customer.phone },
              supplier: null,
              supplierRef: null,
              lines: [
                {
                  reference: `${reference}-P1`,
                  description,
                  descriptionZh: zh,
                  cargoType,
                  type: packageType,
                  quantity,
                  pieces,
                  unit: "CM",
                  length: null,
                  width: null,
                  height: null,
                  weightKg: weightKg.toString(),
                  cbm: cbm.toString(),
                  balerNumber: null,
                },
              ],
            },
          },
        });
      });
    }

    console.log(`${container.reference} (${container.status}) — added ${wanted}`);
  }

  /* The frozen packing list must agree with what is now inside. */
  for (const container of containers) {
    const list = await prisma.packingList.findUnique({
      where: { containerId: container.id },
      select: { id: true },
    });
    if (list) {
      await prisma.packingList.delete({ where: { id: list.id } });
      console.log(`  ${container.reference}: packing list cleared, reissue it`);
    }
  }

  const totals = await prisma.container.findMany({
    where: { id: { in: containers.map((c) => c.id) } },
    select: { reference: true, status: true, _count: { select: { cargoLines: true } } },
  });
  console.log("");
  for (const t of totals) {
    console.log(`${t.reference} ${t.status} → ${t._count.cargoLines} consignments`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
