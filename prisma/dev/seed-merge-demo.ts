/**
 * Customers carrying several open bills, so Merge Payment has something to
 * merge.
 *
 * Dev only. It adds cargo and bills to customers who already exist; it never
 * touches a bill that is already there, and it is safe to run twice — every
 * run mints fresh references from the same Counter the app uses.
 */
import { Prisma, PrismaClient } from "@prisma/client";
import { refuseProductionDatabase } from "./guard";

refuseProductionDatabase("prisma/dev/seed-merge-demo.ts");

const prisma = new PrismaClient();
const Y = new Date().getFullYear();
const pad = (n: number) => String(n).padStart(6, "0");
const daysAgo = (d: number) => new Date(Date.now() - d * 86_400_000);

async function seq(tx: Prisma.TransactionClient, key: string) {
  const row = await tx.counter.upsert({
    where: { key },
    create: { key, value: 1 },
    update: { value: { increment: 1 } },
    select: { value: true },
  });
  return row.value;
}

async function main() {
  const staff = await prisma.user.findFirst({ select: { id: true } });
  if (!staff) throw new Error("No user to attribute the cargo to.");

  /* Customers who already have at least one open bill — giving THEM more is
     what makes the merge screen worth opening. */
  const candidates = await prisma.customer.findMany({
    where: {
      invoices: { some: { status: { in: ["ISSUED", "PARTIALLY_PAID", "OVERDUE"] } } },
    },
    select: { id: true, fullName: true, shippingMark: true },
    orderBy: { fullName: "asc" },
    take: 4,
  });

  for (const [n, customer] of candidates.entries()) {
    /* Two extra bills each, so every one of them needs a merge rather than an
       ordinary payment. */
    for (const k of [0, 1]) {
      await prisma.$transaction(async (tx) => {
        const reference = `SWC-${Y}-${pad(await seq(tx, `cargo:${Y}`))}`;
        const cargo = await tx.cargo.create({
          data: {
            reference,
            qrToken: `SWQmerge${n}${k}${Date.now()}`,
            senderId: customer.id,
            receiverId: customer.id,
            shippingMark: customer.shippingMark,
            service: "LCL",
            description: k === 0 ? "Kitchen utensils" : "Shoe boxes",
            commodity: "GENERAL",
            status: "IN_TRANSIT",
            createdById: staff.id,
            createdAt: daysAgo(20 - n),
          },
        });

        const total = new Prisma.Decimal(k === 0 ? 318.5 : 204.75);
        await tx.invoice.create({
          data: {
            number: `INV-${Y}-${pad(await seq(tx, `invoice:${Y}`))}`,
            customerId: customer.id,
            cargoId: cargo.id,
            status: "ISSUED",
            subtotal: total,
            total,
            currency: "USD",
            issuedAt: daysAgo(14 - n),
            dueAt: daysAgo(-7),
            issuedById: staff.id,
          },
        });
      });
    }
    console.log(`  ${customer.fullName}: +2 open bills`);
  }

  const withMany = await prisma.customer.findMany({
    where: {
      invoices: { some: { status: { in: ["ISSUED", "PARTIALLY_PAID", "OVERDUE"] } } },
    },
    select: {
      fullName: true,
      _count: {
        select: {
          invoices: { where: { status: { in: ["ISSUED", "PARTIALLY_PAID", "OVERDUE"] } } },
        },
      },
    },
  });
  console.log("\nCustomers with open bills:");
  for (const c of withMany.sort((a, b) => b._count.invoices - a._count.invoices)) {
    console.log(`  ${c._count.invoices}  ${c.fullName}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
