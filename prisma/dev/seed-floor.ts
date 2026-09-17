import { PrismaClient, Prisma } from "@prisma/client";
import { refuseProductionDatabase } from "./guard";

refuseProductionDatabase("prisma/dev/seed-floor.ts");

const prisma = new PrismaClient();

/**
 * THIRTY CONSIGNMENTS ON THE GUANGZHOU FLOOR.
 *
 * Written to land in exactly the state `receiveNewCargo` leaves a consignment
 * in — reference, item lines with cargo types, a China receiving record, both
 * timeline rows, a delivery note with its snapshot, the valuation the rate book
 * gives on the day, and the customer's notification. Anything less and the
 * screens under test would be reading data no clerk could ever have produced.
 *
 * Everything sits at RECEIVED_CHINA, waiting for a container, because that is
 * the point on the route where there is most to try: loading, sealing, the
 * packing list, the sailing, Dar's review, the bill and the money.
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

const PEOPLE = [
  ["Salma Mbwana", "+255713445001", "Salma Fashion"],
  ["Juma Kileo", "+255754882110", null],
  ["Rehema Nyerere", "+255689221340", "Rehema General Supplies"],
  ["Baraka Mtei", "+255715330982", null],
  ["Asha Rajabu", "+255762118840", "Asha Cosmetics"],
  ["Daniel Shirima", "+255678995521", "Shirima Motors"],
  ["Halima Sultan", "+255713667201", null],
  ["Frank Mwenda", "+255754220118", "Mwenda Hardware"],
  ["Zuhura Iddi", "+255689774412", null],
  ["Emmanuel Lyimo", "+255715008834", "Lyimo Electronics"],
] as const;

/** Goods that exist, priced by bands that exist in the rate book. */
const GOODS = [
  ["Ladies shoes", "女士鞋", "Shoes", "CARTON"],
  ["Men's leather shoes", "男士皮鞋", "Shoes", "CARTON"],
  ["Cotton fabric rolls", "棉布卷", "Clothing", "BALE"],
  ["Ladies handbags", "女士手提包", "Hand Bags", "CARTON"],
  ["Phone chargers and cables", "手机充电器", "Mobile Accessories", "CARTON"],
  ["Bluetooth earphones", "蓝牙耳机", "Phone Accessories", "CARTON"],
  ["LED bulbs and fittings", "LED灯泡", "Electronic", "CARTON"],
  ["Kitchen plastics", "厨房塑料", "Kitchen Items", "BAG"],
  ["Stainless steel pots", "不锈钢锅", "Kitchen Items", "CARTON"],
  ["Ceramic floor tiles", "瓷砖", "Tiles", "PALLET"],
  ["Roofing sheets", "屋顶板", "Roofing Sheets", "CRATE"],
  ["Motorcycle spare parts", "摩托车配件", "Car Spare Parts", "CARTON"],
  ["Car filters", "汽车滤清器", "Car Filters", "CARTON"],
  ["Engine oil 20L", "机油", "Engine Oil", "DRUM"],
  ["Bolts and nuts assorted", "螺栓螺母", "Bolt & Nuts", "BAG"],
  ["Hand tools", "手动工具", "Hardware", "CARTON"],
  ["Sewing machine heads", "缝纫机头", "Machinery", "CRATE"],
  ["Office chairs", "办公椅", "Furniture", "CARTON"],
  ["School exercise books", "练习本", "Books & Stationary", "CARTON"],
  ["Baby toys", "婴儿玩具", "Toys", "CARTON"],
  ["Face creams and lotions", "面霜", "Cosmetics", "CARTON"],
  ["Solar panels 150W", "太阳能板", "Solar Items", "PALLET"],
  ["Television sets 32\"", "电视机", "Television", "CARTON"],
  ["Bicycle frames", "自行车架", "Bicycles", "CRATE"],
  ["Aluminium foil rolls", "铝箔", "Aluminium Foils", "CARTON"],
  ["Sanitary fittings", "卫浴配件", "Sanitary", "CARTON"],
  ["Caps and socks", "帽子袜子", "Caps & Socks", "BALE"],
  ["Artificial flowers", "人造花", "Artificial Flowers", "CARTON"],
  ["Gym dumbbells", "哑铃", "Gym Tools", "CRATE"],
  ["Iron coils", "钢卷", "Iron coil", "PALLET"],
] as const;

/* Deterministic, so re-running gives the same shapes rather than a new random
   warehouse every time somebody wants to compare two screens. */
const spread = (i: number, lo: number, hi: number) =>
  lo + ((i * 7919) % (hi - lo + 1));

async function main() {
  const y = new Date().getFullYear();

  const [warehouse, actor, rates] = await Promise.all([
    prisma.warehouse.findFirst({ where: { active: true, kind: "CHINA" } }),
    prisma.user.findFirst({ where: { email: "china@swiftcargo.co.tz" } }),
    prisma.shippingRate.findMany({
      where: {
        active: true,
        service: "LCL",
        effectiveFrom: { lte: new Date() },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: new Date() } }],
      },
      orderBy: { effectiveFrom: "desc" },
    }),
  ]);

  if (!warehouse) throw new Error("No active China warehouse to receive against.");
  if (!actor) throw new Error("No china@swiftcargo.co.tz user to receive as.");

  const rateFor = (cargoType: string) =>
    rates.find((r) => r.cargoType === cargoType) ??
    rates.find((r) => r.cargoType === null) ??
    null;

  /* Receipt numbers continue the carbon book rather than starting again. */
  const lastNote = await prisma.cargo.findFirst({
    where: { paperReceiptNo: { not: null } },
    orderBy: { paperReceiptNo: "desc" },
    select: { paperReceiptNo: true },
  });
  let note = Number(lastNote?.paperReceiptNo ?? 3001);

  let made = 0;

  for (let i = 0; i < 30; i++) {
    const [name, phone, biz] = PEOPLE[i % PEOPLE.length];
    const [description, zh, cargoType, packageType] = GOODS[i];

    /* Every third consignment carries a second line, because mixed loads are
       the case the pricing and the packing list have to get right. */
    const second = i % 3 === 0 ? GOODS[(i + 11) % GOODS.length] : null;

    note += 1;
    const receiptNo = pad(note, 7);

    await prisma.$transaction(async (tx) => {
      const customer =
        (await tx.customer.findFirst({ where: { phone } })) ??
        (await (async () => {
          const code = `CUS-${pad(await seq(tx, "customer"))}`;
          const slug = name.toUpperCase().replace(/[^A-Z0-9]+/g, "").slice(0, 8);
          const digits = code.replace(/\D/g, "").replace(/^0+/, "") || "0";
          return tx.customer.create({
            data: {
              code,
              fullName: name,
              businessName: biz,
              phone,
              country: "Tanzania",
              city: "Dar es Salaam",
              shippingMark: `SWC-${slug}-${digits}`,
            },
          });
        })());

      const lines = [
        {
          description,
          descriptionZh: zh,
          cargoType,
          packageType,
          quantity: spread(i, 2, 24),
          pieces: spread(i + 3, 10, 300),
          cbm: new Prisma.Decimal((spread(i, 25, 320) / 100).toFixed(4)),
          weightKg: new Prisma.Decimal(spread(i + 5, 15, 480)),
        },
        ...(second
          ? [
              {
                description: second[0],
                descriptionZh: second[1],
                cargoType: second[2],
                packageType: second[3],
                quantity: spread(i + 2, 1, 9),
                pieces: spread(i + 7, 5, 80),
                cbm: new Prisma.Decimal((spread(i + 1, 20, 180) / 100).toFixed(4)),
                weightKg: new Prisma.Decimal(spread(i + 9, 8, 150)),
              },
            ]
          : []),
      ];

      const totalPackages = lines.reduce((n, l) => n + l.quantity, 0);
      const totalPieces = lines.reduce((n, l) => n + (l.pieces ?? 0), 0);
      const totalCbm = lines.reduce(
        (sum, l) => sum.add(l.cbm),
        new Prisma.Decimal(0)
      );
      const totalWeight = lines.reduce(
        (sum, l) => sum.add(l.weightKg),
        new Prisma.Decimal(0)
      );

      const valued = lines.map((l) => {
        const rate = rateFor(l.cargoType);
        const amount =
          rate?.basis === "PER_KG"
            ? l.weightKg.mul(rate.rate).toDecimalPlaces(2)
            : rate
              ? l.cbm.mul(rate.rate).toDecimalPlaces(2)
              : new Prisma.Decimal(0);
        return { line: l, rate, amount };
      });
      const subtotal = valued.reduce(
        (sum, v) => sum.add(v.amount),
        new Prisma.Decimal(0)
      );

      const reference = `SWC-${y}-${pad(await seq(tx, `cargo:${y}`))}`;
      const summary =
        lines.length === 1
          ? lines[0].description
          : `${lines[0].description} and ${lines.length - 1} more`;

      const cargo = await tx.cargo.create({
        data: {
          reference,
          qrToken: `SWQ${reference.replace(/\D/g, "")}${i}`,
          senderId: customer.id,
          receiverId: customer.id,
          shippingMark: customer.shippingMark,
          paperReceiptNo: receiptNo,
          service: "LCL",
          description: summary,
          declaredPackages: totalPackages,
          declaredCbm: totalCbm,
          status: "RECEIVED_CHINA",
          createdById: actor.id,
          estimatedValue: subtotal,
          estimatedCurrency: rates[0]?.currency ?? "USD",
          estimatedAt: new Date(),
          valuationSnapshot: {
            pricedOn: new Date().toISOString(),
            currency: rates[0]?.currency ?? "USD",
            subtotal: subtotal.toString(),
            unpriced: valued.filter((v) => !v.rate).length,
            lines: valued.map((v, n) => ({
              line: n + 1,
              description: v.line.description,
              cargoType: v.line.cargoType,
              quantity: v.line.quantity,
              pieces: v.line.pieces,
              cbm: v.line.cbm.toString(),
              weightKg: v.line.weightKg.toString(),
              rate: v.rate?.rate.toString() ?? null,
              basis: v.rate?.basis ?? null,
              amount: v.amount.toString(),
              blocked: v.rate ? null : "No live rate for this cargo type.",
            })),
          },
        },
      });

      await tx.cargoStatusHistory.createMany({
        data: [
          { cargoId: cargo.id, to: "REGISTERED", actorId: actor.id },
          {
            cargoId: cargo.id,
            from: "REGISTERED",
            to: "RECEIVED_CHINA",
            reason: `Received at Guangzhou against note ${receiptNo}`,
            actorId: actor.id,
          },
        ],
      });

      await tx.cargoPackage.createMany({
        data: lines.map((l, n) => ({
          cargoId: cargo.id,
          reference: `${reference}-P${n + 1}`,
          packageType: l.packageType as never,
          description: l.description,
          descriptionZh: l.descriptionZh,
          cargoType: l.cargoType,
          quantity: l.quantity,
          pieces: l.pieces,
          unit: "CM" as const,
          weightKg: l.weightKg,
          cbm: l.cbm,
          /* Typed straight in, the way the counter takes it. */
          cbmOverridden: true,
        })),
      });

      await tx.chinaReceiving.create({
        data: {
          cargoId: cargo.id,
          warehouseId: warehouse.id,
          packagesCount: totalPackages,
          piecesCount: totalPieces,
          weightKg: totalWeight,
          cbm: totalCbm,
          condition: "GOOD",
          receivedById: actor.id,
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
            description: summary,
            packagesCount: totalPackages,
            piecesCount: totalPieces,
            cbm: totalCbm.toString(),
            weightKg: totalWeight.toString(),
            condition: "GOOD",
            warehouse: warehouse.name,
            receivedAt: new Date().toISOString(),
            sender: { code: customer.code, name: customer.fullName, phone: customer.phone },
            receiver: { name: customer.fullName, phone: customer.phone },
            supplier: null,
            supplierRef: null,
            lines: lines.map((l, n) => ({
              reference: `${reference}-P${n + 1}`,
              description: l.description,
              descriptionZh: l.descriptionZh,
              cargoType: l.cargoType,
              type: l.packageType,
              quantity: l.quantity,
              pieces: l.pieces,
              unit: "CM",
              length: null,
              width: null,
              height: null,
              weightKg: l.weightKg.toString(),
              cbm: l.cbm.toString(),
              balerNumber: null,
            })),
          },
        },
      });

      await tx.notification.create({
        data: {
          customerId: customer.id,
          kind: "cargo.received_china",
          title: `${reference} received at our China warehouse`,
          body: `${totalPackages} package(s) received in Guangzhou. It will wait here until it is loaded into a container — we will tell you when it sails.`,
          href: "/portal",
        },
      });

      made++;
      console.log(
        `${reference}  ${customer.fullName.padEnd(20)} ${String(totalPackages).padStart(3)} pkg  ${totalCbm.toString().padStart(7)} m³  ${rates[0]?.currency ?? "USD"} ${subtotal}`
      );
    });
  }

  const onFloor = await prisma.cargo.count({
    where: { deletedAt: null, status: "RECEIVED_CHINA" },
  });
  console.log(`\nAdded ${made}. ${onFloor} consignments now waiting in Guangzhou.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
