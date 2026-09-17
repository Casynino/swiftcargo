import { PrismaClient, Prisma } from "@prisma/client";
import { refuseProductionDatabase } from "./guard";

refuseProductionDatabase("prisma/dev/seed-demo-cargo.ts");
const prisma = new PrismaClient();

const pad = (n: number, w = 6) => String(n).padStart(w, "0");
async function seq(tx: any, key: string) {
  const c = await tx.counter.upsert({ where: { key }, create: { key, value: 1 }, update: { value: { increment: 1 } } });
  return c.value;
}

const PEOPLE = [
  { name: "Joseph Mwakalinga", phone: "+255754110220", biz: "Mwakalinga Hardware" },
  { name: "Grace Kimaro", phone: "+255689334455", biz: null },
  { name: "Rashid Juma", phone: "+255715907788", biz: "Juma Electronics" },
];

const CARGO = [
  { desc: "Hardware tools and fittings", commodity: "General goods", pkgs: 8, dims: [80, 50, 45], qty: 8, w: 22 },
  { desc: "Kitchenware and plastics", commodity: "General goods", pkgs: 20, dims: [70, 45, 50], qty: 20, w: 11 },
  { desc: "Phone accessories and chargers", commodity: "Electronics", pkgs: 6, dims: [55, 40, 35], qty: 6, w: 18 },
];

async function main() {
  const y = new Date().getFullYear();
  for (let i = 0; i < PEOPLE.length; i++) {
    const p = PEOPLE[i];
    const spec = CARGO[i];
    await prisma.$transaction(async (tx) => {
      const code = `CUS-${pad(await seq(tx, "customer"))}`;
      const slug = p.name.toUpperCase().replace(/[^A-Z0-9]+/g, "").slice(0, 8);
      const digits = code.replace(/\D/g, "").replace(/^0+/, "") || "0";
      const customer = await tx.customer.create({
        data: { code, fullName: p.name, businessName: p.biz, phone: p.phone, shippingMark: `SWC-${slug}-${digits}`, city: "Dar es Salaam" },
      });

      const reference = `SWC-${y}-${pad(await seq(tx, `cargo:${y}`))}`;
      const cargo = await tx.cargo.create({
        data: {
          reference, qrToken: `SWQseed${i}${Date.now()}`,
          senderId: customer.id, receiverId: customer.id,
          shippingMark: customer.shippingMark,
          service: "LCL", description: spec.desc, commodity: spec.commodity,
          status: "RECEIVED_CHINA",
        },
      });
      await tx.cargoStatusHistory.createMany({ data: [
        { cargoId: cargo.id, to: "REGISTERED" },
        { cargoId: cargo.id, from: "REGISTERED", to: "RECEIVED_CHINA", reason: "Received at the Guangzhou warehouse" },
      ]});

      const [l, w, h] = spec.dims;
      const cbm = new Prisma.Decimal(l).mul(w).mul(h).mul(spec.qty).div(1_000_000).toDecimalPlaces(4);
      await tx.cargoPackage.create({
        data: {
          cargoId: cargo.id, reference: `${reference}-P1`, packageType: "CARTON",
          quantity: spec.qty, unit: "CM", length: l, width: w, height: h,
          weightKg: spec.w, cbm, description: spec.desc,
        },
      });

      const gz = await tx.warehouse.findUniqueOrThrow({ where: { code: "GZ" } });
      await tx.chinaReceiving.create({
        data: {
          cargoId: cargo.id, warehouseId: gz.id, packagesCount: spec.pkgs,
          weightKg: new Prisma.Decimal(spec.w).mul(spec.qty), cbm, condition: "GOOD",
        },
      });
      console.log(`${reference}  ${p.name}  ${cbm} m3`);
    });
  }
}
main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
