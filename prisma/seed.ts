import { PrismaClient, type Role } from "@prisma/client";
import bcrypt from "bcryptjs";

import { refuseProductionDatabase } from "./dev/guard";

refuseProductionDatabase("prisma/seed.ts");

const prisma = new PrismaClient();

/**
 * Enough of a company to sign in to and drive.
 *
 * DEVELOPMENT ONLY. Six desks share one password from the environment and the
 * rate book carries placeholder prices; neither belongs on a live database,
 * which is seeded by prisma/seed.production.ts instead.
 *
 * Real details where they are real — the Guangzhou warehouse address and the
 * Dar office are the company's actual ones, because the whole China flow starts
 * with a customer handing that address to their supplier and a placeholder
 * there is a placeholder in the most important string in the system.
 *
 * Idempotent throughout: every write is an upsert on a natural key, so running
 * it twice changes nothing and running it against a database with data in it
 * adds the missing rows rather than trampling the present ones.
 */

/* The fallback is printed in .env.example, so on a live database it is a
   password the whole internet knows. Production must say what it wants. */
if (process.env.NODE_ENV === "production" && !process.env.SEED_ADMIN_PASSWORD) {
  throw new Error("Set SEED_ADMIN_PASSWORD before seeding a production database.");
}
const PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "ChangeMe123!";

/** What the customer agrees to by being billed. Editable in settings. */
const INVOICE_TERMS = [
  "All payments must be made to our official bank account within 48-72 hours.",
  "The invoice total includes Customs, Shipping, and Clearance fees, plus 18% VAT.",
  "Any USD rate change before payment will require a revised invoice.",
  "A storage fee of $5 per day will apply after 7 days of non-payment or failure to collect your shipment.",
  "Complaints must be raised within 24 hours of invoice issuance.",
].join("\n");

async function main() {
  const passwordHash = await bcrypt.hash(PASSWORD, 10);

  // --- Company -------------------------------------------------------------
  await prisma.companySetting.upsert({
    where: { id: "singleton" },
    update: {},
    create: {
      id: "singleton",
      name: "Swift Cargo",
      tagline: "On time, Every time",
      phone: "+255 767 852 126",
      altPhone: "+255 656 852 121",
      whatsapp: "255767852126",
      darAddress: "PSSSF Commercial Complex, 2nd Floor, Dar es Salaam, Tanzania",
      chinaAddress: "广州市白云区石井街庆丰庆隆中188号 C1-01",
      vatPercent: 18,
      freeStorageDays: 7,
      invoiceTerms: INVOICE_TERMS,
    },
  });

  /* The four accounts printed at the foot of every invoice. Upserted on the
     account number so re-seeding cannot double them. */
  const BANKS = [
    { accountNumber: "20110091072", bankName: "NMB BANK", currency: "TZS", branch: "OHIO" },
    { accountNumber: "20110091073", bankName: "NMB BANK", currency: "USD", branch: "OHIO" },
    { accountNumber: "0150912623900", bankName: "CRDB BANK", currency: "TZS", branch: "MWENGE" },
    { accountNumber: "0250912623900", bankName: "CRDB BANK", currency: "USD", branch: "MWENGE" },
  ];
  for (const [index, bank] of BANKS.entries()) {
    const existing = await prisma.bankAccount.findFirst({
      where: { accountNumber: bank.accountNumber },
    });
    if (existing) continue;
    await prisma.bankAccount.create({
      data: {
        ...bank,
        accountName: "REDSUN TZ COMPANY LIMITED",
        sortOrder: index,
      },
    });
  }

  // --- Warehouses ----------------------------------------------------------
  const china = await prisma.warehouse.upsert({
    where: { code: "GZ" },
    update: {},
    create: {
      code: "GZ",
      name: "Guangzhou Warehouse",
      kind: "CHINA",
      /* In Chinese first, because this is the string a customer forwards to a
         factory and a driver in Baiyun has to read it off a phone. */
      addressLocal: "广州市白云区石井街庆丰庆隆中188号 C1-01",
      addressEnglish:
        "C1-01, No. 188 Qingfeng Qinglong Zhong, Shijing Street, Baiyun District, Guangzhou",
      city: "Guangzhou",
      country: "China",
    },
  });

  const dar = await prisma.warehouse.upsert({
    where: { code: "DAR" },
    update: {},
    create: {
      code: "DAR",
      name: "Dar es Salaam Warehouse",
      kind: "TANZANIA",
      addressEnglish: "PSSSF Commercial Complex, 2nd Floor, Dar es Salaam",
      city: "Dar es Salaam",
      country: "Tanzania",
      phone: "+255 767 852 126",
    },
  });

  // --- Staff ---------------------------------------------------------------
  const staff: {
    email: string;
    name: string;
    role: Role;
    department: "MANAGEMENT" | "CUSTOMER_SUPPORT" | "CHINA_WAREHOUSE" | "DAR_WAREHOUSE" | "FINANCE";
    warehouseId?: string;
  }[] = [
    { email: "admin@swiftcargo.co.tz", name: "System Administrator", role: "ADMIN", department: "MANAGEMENT" },
    { email: "manager@swiftcargo.co.tz", name: "Operations Manager", role: "MANAGER", department: "MANAGEMENT" },
    { email: "support@swiftcargo.co.tz", name: "Customer Support", role: "CUSTOMER_SUPPORT", department: "CUSTOMER_SUPPORT" },
    { email: "china@swiftcargo.co.tz", name: "Guangzhou Warehouse", role: "CHINA_WAREHOUSE", department: "CHINA_WAREHOUSE", warehouseId: china.id },
    { email: "dar@swiftcargo.co.tz", name: "Dar Warehouse", role: "DAR_WAREHOUSE", department: "DAR_WAREHOUSE", warehouseId: dar.id },
    { email: "finance@swiftcargo.co.tz", name: "Finance Officer", role: "FINANCE", department: "FINANCE" },
  ];

  for (const person of staff) {
    await prisma.user.upsert({
      where: { email: person.email },
      update: { role: person.role, department: person.department },
      create: {
        email: person.email,
        name: person.name,
        role: person.role,
        department: person.department,
        warehouseId: person.warehouseId ?? null,
        passwordHash,
      },
    });
  }

  // --- Exchange rate -------------------------------------------------------
  const existingFx = await prisma.exchangeRate.findFirst({
    where: { fromCurrency: "USD", toCurrency: "TZS", active: true },
  });
  if (!existingFx) {
    await prisma.exchangeRate.create({
      data: {
        fromCurrency: "USD",
        toCurrency: "TZS",
        rate: 2700,
        notes: "Opening rate. Finance publishes the next one from the Rate book.",
      },
    });
  }

  // --- Rate book -----------------------------------------------------------
  // Rates live here, never in a React component. These are placeholders with a
  // shape, not the company's real commercial terms — Finance sets those.
  const rates = [
    { service: "LCL" as const, cargoType: null, basis: "PER_CBM" as const, rate: 250, minimumCbm: 0.5 },
    { service: "LCL" as const, cargoType: "Electronics", basis: "PER_CBM" as const, rate: 320, minimumCbm: 0.5 },
    { service: "FCL" as const, cargoType: "20GP", basis: "FLAT" as const, rate: 2800, minimumCbm: null },
    { service: "FCL" as const, cargoType: "40HQ", basis: "FLAT" as const, rate: 4200, minimumCbm: null },
  ];

  for (const rate of rates) {
    const found = await prisma.shippingRate.findFirst({
      where: { service: rate.service, cargoType: rate.cargoType, active: true },
    });
    if (!found) {
      await prisma.shippingRate.create({
        data: {
          origin: "China",
          destination: "Tanzania",
          service: rate.service,
          cargoType: rate.cargoType,
          basis: rate.basis,
          rate: rate.rate,
          minimumCbm: rate.minimumCbm,
          currency: "USD",
          published: true,
        },
      });
    }
  }

  // --- Container cost categories ------------------------------------------
  const expenseTypes = [
    "Ocean freight",
    "Clearing & forwarding",
    "Port charges",
    "Customs duty",
    "Transport to warehouse",
    "Handling & labour",
    "Documentation",
    "Demurrage",
  ];
  for (const name of expenseTypes) {
    await prisma.expenseType.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }

  console.log("Seeded. Staff sign in with the address above and SEED_ADMIN_PASSWORD.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
