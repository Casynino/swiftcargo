/**
 * Demo data across the whole business, so every screen has something on it.
 *
 * Idempotent by reference: running it twice adds nothing. It writes the same
 * rows the app writes — statuses, history, notifications and audit lines — so
 * the dashboards and charts are exercised rather than merely populated.
 */
import { PrismaClient, Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import { refuseProductionDatabase } from "./guard";

refuseProductionDatabase("prisma/dev/seed-demo.ts");

const prisma = new PrismaClient();
const pad = (n: number, w = 6) => String(n).padStart(w, "0");
const Y = new Date().getFullYear();

async function seq(tx: any, key: string) {
  const c = await tx.counter.upsert({
    where: { key },
    create: { key, value: 1 },
    update: { value: { increment: 1 } },
  });
  return c.value;
}
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);
const daysAhead = (n: number) => new Date(Date.now() + n * 86_400_000);

const PEOPLE = [
  ["Fatuma Said", "+255713220145", "Said General Supplies"],
  ["Emmanuel Massawe", "+255754889001", null],
  ["Zainab Ally", "+255678334220", "Zainab Fashion House"],
  ["Peter Kimambo", "+255715447789", "Kimambo Hardware"],
  ["Neema Mushi", "+255689110234", null],
  ["Hamisi Bakari", "+255762558890", "Bakari Motors"],
] as const;

const GOODS = [
  ["Ladies handbags and purses", "General goods", 18, [55, 40, 38]],
  ["LED bulbs and fittings", "Electronics", 12, [50, 35, 30]],
  ["Cotton fabric rolls", "General goods", 24, [110, 40, 40]],
  ["Hand tools and fasteners", "General goods", 9, [60, 45, 35]],
  ["Kitchen plastics", "General goods", 30, [70, 50, 45]],
  ["Motorcycle spares", "General goods", 15, [65, 45, 40]],
] as const;

async function main() {
  const gz = await prisma.warehouse.findUniqueOrThrow({ where: { code: "GZ" } });
  const dar = await prisma.warehouse.findUniqueOrThrow({ where: { code: "DAR" } });
  const finance = await prisma.user.findUniqueOrThrow({
    where: { email: "finance@swiftcargo.co.tz" },
  });
  const china = await prisma.user.findUniqueOrThrow({
    where: { email: "china@swiftcargo.co.tz" },
  });
  const darUser = await prisma.user.findUniqueOrThrow({
    where: { email: "dar@swiftcargo.co.tz" },
  });
  const support = await prisma.user.findUniqueOrThrow({
    where: { email: "support@swiftcargo.co.tz" },
  });
  const fx = await prisma.exchangeRate.findFirstOrThrow({
    where: { active: true },
  });
  const settings = await prisma.companySetting.findUniqueOrThrow({
    where: { id: "singleton" },
  });

  // --- Sailings on the public schedule -------------------------------------
  if ((await prisma.shipmentSchedule.count()) === 0) {
    for (const [i, offset] of [8, 24, 40].entries()) {
      await prisma.shipmentSchedule.create({
        data: {
          vessel: ["MSC Kalamata", "Maersk Cabo Verde", "CMA CGM Zephyr"][i],
          voyage: ["FR431A", "MK220E", "CZ118W"][i],
          shippingLine: ["MSC", "Maersk", "CMA CGM"][i],
          cargoDeadline: daysAhead(offset - 3),
          departureDate: daysAhead(offset),
          estimatedArrival: daysAhead(offset + 29),
          published: true,
        },
      });
    }
    console.log("3 sailings published");
  }

  // --- A second container, mid-voyage, with six customers on it ------------
  const already = await prisma.container.findFirst({
    where: { containerNumber: "MSKU4471902" },
  });
  if (already) {
    console.log("demo container already present — nothing to do");
    return;
  }

  const container = await prisma.$transaction(async (tx) => {
    const reference = `SWC-CN-${Y}-${pad(await seq(tx, `container:${Y}`), 3)}`;
    const c = await tx.container.create({
      data: {
        reference,
        containerNumber: "MSKU4471902",
        type: "HQ_40",
        status: "IN_TRANSIT",
        sealNumber: "SL-771204",
        sealedAt: daysAgo(19),
        loadingStartedAt: daysAgo(24),
        loadedAt: daysAgo(19),
        cargoDeadline: daysAgo(21),
        capacityCbm: 67,
        originPort: "Guangzhou",
        destinationPort: "Dar es Salaam",
      },
    });
    await tx.containerEvent.createMany({
      data: [
        { containerId: c.id, to: "OPEN", createdAt: daysAgo(26) },
        { containerId: c.id, from: "LOADING", to: "SEALED", note: "Seal SL-771204", createdAt: daysAgo(19) },
        { containerId: c.id, from: "SEALED", to: "DEPARTED", createdAt: daysAgo(18) },
        { containerId: c.id, from: "DEPARTED", to: "IN_TRANSIT", createdAt: daysAgo(17) },
      ],
    });
    await tx.shipment.create({
      data: {
        reference: `SHP-${Y}-${pad(await seq(tx, `shipment:${Y}`))}`,
        containerId: c.id,
        shippingLine: "Maersk",
        vessel: "Maersk Cabo Verde",
        voyage: "MK218E",
        billOfLading: "MAEU772104",
        originPort: "Guangzhou",
        destinationPort: "Dar es Salaam",
        departureDate: daysAgo(18),
        eta: daysAhead(9),
        status: "IN_TRANSIT",
      },
    });
    return c;
  });

  for (const [i, [name, phone, biz]] of PEOPLE.entries()) {
    const [description, commodity, qty, dims] = GOODS[i];
    await prisma.$transaction(async (tx) => {
      const code = `CUS-${pad(await seq(tx, "customer"))}`;
      const slug = name.toUpperCase().replace(/[^A-Z0-9]+/g, "").slice(0, 8);
      const digits = code.replace(/\D/g, "").replace(/^0+/, "") || "0";
      const customer = await tx.customer.create({
        data: {
          code,
          fullName: name,
          businessName: biz,
          phone,
          email: `${slug.toLowerCase()}@example.co.tz`,
          city: "Dar es Salaam",
          country: "Tanzania",
          shippingMark: `SWC-${slug}-${digits}`,
        },
      });

      const reference = `SWC-${Y}-${pad(await seq(tx, `cargo:${Y}`))}`;
      const cargo = await tx.cargo.create({
        data: {
          reference,
          qrToken: `SWQdemo${i}${Date.now()}`,
          senderId: customer.id,
          receiverId: customer.id,
          shippingMark: customer.shippingMark,
          service: "LCL",
          description,
          commodity,
          status: "IN_TRANSIT",
          createdById: china.id,
          createdAt: daysAgo(30 - i),
        },
      });

      const [l, w, h] = dims;
      const cbm = new Prisma.Decimal(l).mul(w).mul(h).mul(qty).div(1_000_000)
        .toDecimalPlaces(4);
      const weight = new Prisma.Decimal(qty).mul(13.5).toDecimalPlaces(2);

      await tx.cargoPackage.create({
        data: {
          cargoId: cargo.id,
          reference: `${reference}-P1`,
          packageType: i % 2 === 0 ? "CARTON" : "BALE",
          description,
          quantity: qty,
          unit: "CM",
          length: l,
          width: w,
          height: h,
          weightKg: 13.5,
          cbm,
          containerId: container.id,
          balerNumber: `GZ/26-3${i}-2`,
        },
      });

      await tx.chinaReceiving.create({
        data: {
          cargoId: cargo.id,
          warehouseId: gz.id,
          packagesCount: qty,
          piecesCount: qty * 4,
          weightKg: weight,
          cbm,
          condition: "GOOD",
          location: `Rack ${String.fromCharCode(65 + i)}-0${i + 1}`,
          receivedById: china.id,
          receivedAt: daysAgo(26 - i),
        },
      });

      await tx.containerCargo.create({
        data: {
          containerId: container.id,
          cargoId: cargo.id,
          packagesCount: 1,
          weightKg: weight,
          cbm,
          loadedAt: daysAgo(20),
        },
      });

      await tx.cargoStatusHistory.createMany({
        data: [
          { cargoId: cargo.id, to: "REGISTERED", actorId: china.id, createdAt: daysAgo(30 - i) },
          { cargoId: cargo.id, from: "REGISTERED", to: "RECEIVED_CHINA", reason: "Received at the Guangzhou warehouse", actorId: china.id, createdAt: daysAgo(26 - i) },
          { cargoId: cargo.id, from: "RECEIVED_CHINA", to: "ASSIGNED_TO_CONTAINER", reason: `Assigned to container ${container.reference}`, actorId: china.id, createdAt: daysAgo(20) },
          { cargoId: cargo.id, from: "ASSIGNED_TO_CONTAINER", to: "CONTAINER_LOADED", reason: `Container ${container.reference} sealed`, actorId: china.id, createdAt: daysAgo(19) },
          { cargoId: cargo.id, from: "CONTAINER_LOADED", to: "DEPARTED_CHINA", reason: `Container ${container.reference}`, actorId: china.id, createdAt: daysAgo(18) },
          { cargoId: cargo.id, from: "DEPARTED_CHINA", to: "IN_TRANSIT", reason: `Container ${container.reference}`, actorId: china.id, createdAt: daysAgo(17) },
        ],
      });

      await tx.notification.createMany({
        data: [
          { customerId: customer.id, kind: "cargo.received_china", title: `${reference} received in China`, body: `We have received ${qty} package(s) at our Guangzhou warehouse.`, href: "/portal", createdAt: daysAgo(26 - i) },
          { customerId: customer.id, kind: "container.departed", title: "Your cargo has left China", body: "Container MSKU4471902 has departed.", href: "/portal", createdAt: daysAgo(18) },
        ],
      });

      console.log(`${reference}  ${name}  ${cbm} m3`);
    });
  }

  // --- Costs on the first container, so the profit report has both sides ---
  const first = await prisma.container.findFirstOrThrow({
    where: { containerNumber: "MSCU7741203" },
  });
  const types = await prisma.expenseType.findMany();
  const costs: [string, number][] = [
    ["Ocean freight", 1850],
    ["Clearing & forwarding", 640],
    ["Port charges", 410],
    ["Transport to warehouse", 220],
  ];
  for (const [name, amount] of costs) {
    const type = types.find((t) => t.name === name);
    await prisma.$transaction(async (tx) => {
      await tx.containerExpense.create({
        data: {
          reference: `EXP-${Y}-${pad(await seq(tx, `expense:${Y}`))}`,
          containerId: first.id,
          expenseTypeId: type?.id ?? null,
          amount,
          currency: "USD",
          status: "PAID",
          expenseDate: daysAgo(3),
          description: name,
          recordedById: finance.id,
        },
      });
    });
  }
  console.log("4 container costs recorded");

  // --- Website requests, so Support has a queue ---------------------------
  await prisma.$transaction(async (tx) => {
    await tx.quoteRequest.create({
      data: {
        reference: `QT-${pad(await seq(tx, "quote"))}`,
        contactName: "Salma Mrisho",
        contactPhone: "+255714002233",
        contactEmail: "salma@example.co.tz",
        service: "LCL",
        commodity: "Beauty products",
        originCity: "Guangzhou",
        destination: "Dar es Salaam",
        estimatedCbm: 2.4,
        notes: "First time shipping, need advice on the whole process.",
      },
    });
    await tx.pickupRequest.create({
      data: {
        reference: `PU-${pad(await seq(tx, "pickup"))}`,
        pickupLocation: "Guangzhou, Baiyun — Yongfu Road electronics market, shop 3B",
        contactName: "Mr Chen",
        contactPhone: "+8613500221144",
        cargoDescription: "6 cartons phone accessories",
        packages: 6,
        commodity: "Electronics",
        preferredDate: daysAhead(3),
      },
    });
    await tx.containerBooking.create({
      data: {
        reference: `BK-${pad(await seq(tx, "booking"))}`,
        type: "FULL_CONTAINER",
        contactName: "Juma Traders Ltd",
        contactPhone: "+255766114400",
        contactEmail: "ops@jumatraders.co.tz",
        pickupAddress: "Foshan, Guangdong — Lecong furniture market",
        destination: "Dar es Salaam",
        commodity: "Furniture",
        containerType: "HQ_40",
        estimatedCbm: 58,
        termsAccepted: true,
      },
    });
  });
  console.log("3 website requests");

  // --- A customer login and a conversation --------------------------------
  const fatuma = await prisma.customer.findFirstOrThrow({
    where: { fullName: "Fatuma Said" },
  });
  if (!(await prisma.user.findUnique({ where: { email: "fatuma@example.co.tz" } }))) {
    await prisma.user.create({
      data: {
        name: fatuma.fullName,
        email: "fatuma@example.co.tz",
        phone: fatuma.phone,
        role: "CUSTOMER",
        passwordHash: await bcrypt.hash(
          process.env.SEED_ADMIN_PASSWORD ?? "SwiftCargo2026!",
          10
        ),
        customerId: fatuma.id,
      },
    });
    console.log("customer login: fatuma@example.co.tz");
  }

  const fatumaCargo = await prisma.cargo.findFirstOrThrow({
    where: { senderId: fatuma.id },
  });
  await prisma.$transaction(async (tx) => {
    const conversation = await tx.conversation.create({
      data: {
        reference: `TKT-${Y}-${pad(await seq(tx, `conversation:${Y}`))}`,
        customerId: fatuma.id,
        cargoId: fatumaCargo.id,
        subject: "When will my handbags arrive?",
        status: "WAITING_STAFF",
        staffUnread: true,
        lastMessageAt: daysAgo(1),
        messages: {
          create: [
            {
              body: "Hello, my supplier says the goods left three weeks ago. When can I collect?",
              createdAt: daysAgo(1),
            },
          ],
        },
      },
    });
    await tx.notification.create({
      data: {
        userId: support.id,
        kind: "message.received",
        title: `${fatuma.fullName}: When will my handbags arrive?`,
        body: "Hello, my supplier says the goods left three weeks ago…",
        href: `/app/support/${conversation.id}`,
        createdAt: daysAgo(1),
      },
    });
  });
  console.log("1 customer conversation");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
