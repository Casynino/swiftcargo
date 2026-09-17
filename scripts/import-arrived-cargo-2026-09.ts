/**
 * CARGO ALREADY STANDING IN DAR WHEN THE SYSTEM STARTED, ENTERED ONCE.
 *
 *   DATABASE_URL=… DIRECT_URL=… npx tsx scripts/import-arrived-cargo-2026-09.ts [--dry-run]
 *
 * The owner's list of consignments that had landed and been checked in at the
 * Dar es Salaam warehouse before this system held them. Each row of the list
 * becomes one consignment in RECEIVED_DAR: one package line carrying the goods
 * in English and Chinese, and Dar's receiving row with the count and volume
 * from the list, in good condition and signed off. Nothing else is written —
 *
 *   no China receiving row, because nobody has a Guangzhou measurement for
 *   these, and a copy of Dar's figures under China's name would show a
 *   variance of zero that nobody measured;
 *   no container, because the list does not say which sailing brought them;
 *   no weight, because the list has none;
 *   no cargo type on the line, because choosing the rate-book category is the
 *   pricing decision, and the line is where the floor or Finance chooses it;
 *   no invoice, because a bill is raised from the rate book by Finance;
 *   no customer notification, because nothing new happened to the goods.
 *
 * The customers must already exist under the codes below with the names below.
 * A customer is identified by their phone number and the list carries none, so
 * this script will not create one.
 *
 * The goods value on the list is the customer's declared value, not a charge.
 * No column holds a declared value, and the internal notes are read on both
 * warehouse floors, which are never shown money — so the figures are kept on
 * each consignment's append-only import entry in the audit log.
 *
 * Safe to run again. Every consignment written leaves an audit entry carrying
 * its import key, and a key already present is skipped. The whole run is one
 * transaction: any failure writes nothing. --dry-run does all of it and rolls
 * back.
 */
import { Prisma, PrismaClient } from "@prisma/client";

import { calculateCbm } from "../lib/cbm";
import { formatCurrency, usdToTzs } from "../lib/currency";
import { generateQrToken, nextCargoReference, packageReference } from "../lib/ids";

const D = (v: string | number) => new Prisma.Decimal(v);

const IMPORT = "arrived-cargo-2026-09";
const ACTOR_EMAIL = "import@historical";

type Item = {
  en: string;
  zh: string;
  /** Packages. */
  quantity: number;
  pieces: number;
  /** USD, per piece. */
  unitPrice: string;
  /** USD, as the owner wrote it. */
  amount: string;
  cbm: string;
};

type Listed = {
  code: string;
  name: string;
  items: Item[];
  expected: { cbm: string; value: string; quantity: number; pieces: number };
};

/* Exactly as the owner gave them. Nothing here is corrected. */
const LIST: Listed[] = [
  {
    code: "CUS-000001",
    name: "AGU",
    items: [
      { en: "Blender", zh: "搅拌机", quantity: 1, pieces: 4, unitPrice: "2.00", amount: "8.00", cbm: "0.17" },
    ],
    expected: { cbm: "0.17", value: "8.00", quantity: 1, pieces: 4 },
  },
  {
    code: "CUS-000002",
    name: "INTELTECH SERVICE LTD",
    items: [
      { en: "Filter", zh: "滤芯", quantity: 74, pieces: 1000, unitPrice: "1.00", amount: "1000.00", cbm: "8.45" },
      { en: "Filter", zh: "滤芯", quantity: 8, pieces: 100, unitPrice: "3.00", amount: "300.00", cbm: "1.16" },
      { en: "Auto Parts", zh: "汽车配件", quantity: 6, pieces: 60, unitPrice: "2.00", amount: "120.00", cbm: "0.31" },
      { en: "Auto Parts", zh: "汽车配件", quantity: 4, pieces: 80, unitPrice: "1.00", amount: "80.00", cbm: "0.15" },
    ],
    expected: { cbm: "10.07", value: "1500.00", quantity: 92, pieces: 1240 },
  },
  {
    code: "CUS-000003",
    name: "SKILL COMPANY LIMITED",
    items: [
      { en: "Water Tank", zh: "水箱", quantity: 1, pieces: 1, unitPrice: "100.00", amount: "100.00", cbm: "1.55" },
      { en: "Drilling Equipment", zh: "钻井设备", quantity: 4, pieces: 1, unitPrice: "1000.00", amount: "1000.00", cbm: "5.83" },
    ],
    expected: { cbm: "7.38", value: "1100.00", quantity: 5, pieces: 2 },
  },
  {
    code: "CUS-000004",
    name: "LUCIANA ELIJAH",
    items: [
      { en: "Mattress", zh: "床垫", quantity: 3, pieces: 3, unitPrice: "50.00", amount: "150.00", cbm: "0.51" },
      { en: "Cook Ware", zh: "锅具", quantity: 2, pieces: 16, unitPrice: "5.00", amount: "80.00", cbm: "0.45" },
      { en: "Lunch Box", zh: "餐盒", quantity: 1, pieces: 6, unitPrice: "3.00", amount: "18.00", cbm: "0.05" },
    ],
    expected: { cbm: "1.01", value: "248.00", quantity: 6, pieces: 25 },
  },
];

const GRAND = { items: 10, cbm: "18.63", value: "2856.00" };

const importKey = (code: string, index: number) => `${IMPORT}/${code}/${index + 1}`;

/**
 * THE LIST IS CHECKED AGAINST ITSELF BEFORE THE DATABASE IS OPENED.
 *
 * Every total the owner wrote is recomputed in Decimal, and every amount is
 * checked as pieces × unit price — which is how every row on the list reads.
 * A disagreement stops the run: it is a typing mistake in the list or here,
 * and either way it is not something to load into the books.
 */
function checkList() {
  const problems: string[] = [];
  let items = 0;
  let cbm = D(0);
  let value = D(0);

  for (const customer of LIST) {
    let c = D(0);
    let v = D(0);
    let q = 0;
    let p = 0;
    customer.items.forEach((item, i) => {
      const perPiece = D(item.pieces).mul(item.unitPrice);
      if (!perPiece.equals(item.amount)) {
        problems.push(
          `${customer.code} item ${i + 1}: ${item.pieces} pcs × USD ${item.unitPrice} = ${perPiece}, list says ${item.amount}`
        );
      }
      if (!(item.quantity > 0) || !(item.pieces > 0) || !D(item.cbm).greaterThan(0)) {
        problems.push(`${customer.code} item ${i + 1}: quantity, pieces and CBM must all be above zero`);
      }
      c = c.add(item.cbm);
      v = v.add(item.amount);
      q += item.quantity;
      p += item.pieces;
    });
    const e = customer.expected;
    if (!c.equals(e.cbm)) problems.push(`${customer.code}: CBM ${c} ≠ ${e.cbm}`);
    if (!v.equals(e.value)) problems.push(`${customer.code}: value USD ${v} ≠ ${e.value}`);
    if (q !== e.quantity) problems.push(`${customer.code}: quantity ${q} ≠ ${e.quantity}`);
    if (p !== e.pieces) problems.push(`${customer.code}: pieces ${p} ≠ ${e.pieces}`);
    items += customer.items.length;
    cbm = cbm.add(c);
    value = value.add(v);
  }
  if (items !== GRAND.items) problems.push(`items ${items} ≠ ${GRAND.items}`);
  if (!cbm.equals(GRAND.cbm)) problems.push(`total CBM ${cbm} ≠ ${GRAND.cbm}`);
  if (!value.equals(GRAND.value)) problems.push(`total value USD ${value} ≠ ${GRAND.value}`);

  if (problems.length) {
    throw new Error(`The list does not add up; nothing was written.\n  ${problems.join("\n  ")}`);
  }
  return { items, cbm, value };
}

class DryRun extends Error {}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const totals = checkList();

  /* Prisma fills in whatever the project's .env holds for a variable the shell
     did not set, so DATABASE_URL pointed at one database and DIRECT_URL
     silently read from .env would write to the other. Both must name the same
     database — Neon's pooled and direct hosts differ only by "-pooler". */
  const pooled = process.env.DATABASE_URL;
  const direct = process.env.DIRECT_URL;
  if (!pooled) throw new Error("DATABASE_URL is not set.");
  const where = (u: string) => {
    const parsed = new URL(u);
    return `${parsed.hostname.replace("-pooler.", ".")}${parsed.pathname}`;
  };
  if (direct && where(direct) !== where(pooled)) {
    throw new Error("DATABASE_URL and DIRECT_URL name different databases. Set both for the same one.");
  }
  const url = direct || pooled;
  /* The host only. The URL carries the password. */
  console.log(`Database host: ${new URL(url).hostname}${dryRun ? " (dry run: rolled back)" : ""}`);

  const prisma = new PrismaClient({ datasourceUrl: url });

  const stats = {
    customersProcessed: 0,
    customersCreated: 0,
    customersExisting: 0,
    cargoProcessed: 0,
    cargoCreated: 0,
    cargoSkipped: 0,
  };
  const created: string[] = [];
  const skipped: string[] = [];

  try {
    const run = async (tx: Prisma.TransactionClient) => {
      /* Two runs started at once would both see no import key and both write. */
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${IMPORT}))`;

      const dar = await tx.warehouse.findFirst({
        where: { code: "DAR", kind: "TANZANIA", active: true },
        select: { id: true },
      });
      if (!dar) throw new Error("No active Dar es Salaam warehouse (code DAR). Nothing was written.");

      const customers = new Map<string, { id: string; shippingMark: string | null }>();
      const missing: string[] = [];
      for (const listed of LIST) {
        stats.customersProcessed++;
        const found = await tx.customer.findUnique({
          where: { code: listed.code },
          select: { id: true, fullName: true, shippingMark: true, deletedAt: true },
        });
        if (!found) {
          missing.push(`${listed.code} ${listed.name}`);
          continue;
        }
        if (found.deletedAt || found.fullName.trim().toUpperCase() !== listed.name.toUpperCase()) {
          throw new Error(
            `${listed.code} is "${found.fullName}"${found.deletedAt ? " (deleted)" : ""} in the database, not "${listed.name}". Nothing was written.`
          );
        }
        stats.customersExisting++;
        customers.set(listed.code, { id: found.id, shippingMark: found.shippingMark });
      }
      if (missing.length) {
        throw new Error(
          `Not on the books: ${missing.join(", ")}. A customer needs a phone number and the list has none, so register them first. Nothing was written.`
        );
      }

      for (const listed of LIST) {
        const customer = customers.get(listed.code)!;
        for (const [index, item] of listed.items.entries()) {
          stats.cargoProcessed++;
          const key = importKey(listed.code, index);

          const done = await tx.auditLog.findFirst({
            where: { action: "cargo.import", metadata: { path: ["importKey"], equals: key } },
            select: { entityId: true },
          });
          if (done) {
            stats.cargoSkipped++;
            skipped.push(key);
            continue;
          }

          /* The same goods for the same customer entered some other way — at a
             counter, or by an earlier script without the key. Loading a second
             copy is a second bill, so it stops here for a person to decide. */
          const lookalike = await tx.cargo.findFirst({
            where: {
              receiverId: customer.id,
              deletedAt: null,
              packages: {
                some: {
                  deletedAt: null,
                  description: item.en,
                  quantity: item.quantity,
                  pieces: item.pieces,
                  cbm: D(item.cbm),
                },
              },
            },
            select: { reference: true },
          });
          if (lookalike) {
            throw new Error(
              `${lookalike.reference} already holds ${item.en} (${item.quantity} packages, ${item.pieces} pieces, ${item.cbm} m³) for ${listed.code} without this import's key (${key}). Nothing was written.`
            );
          }

          const reference = await nextCargoReference(tx);
          const cbm = D(item.cbm).toDecimalPlaces(4);
          /* Typed straight from the list with no sides to multiply, which is a
             hand-entered volume by the same rule the receiving counter applies. */
          const derived = calculateCbm({ length: null, width: null, height: null, quantity: item.quantity, unit: "CM" });
          const byHand = derived === null || !derived.equals(cbm);
          const now = new Date();

          const cargo = await tx.cargo.create({
            data: {
              reference,
              qrToken: generateQrToken(),
              senderId: customer.id,
              receiverId: customer.id,
              shippingMark: customer.shippingMark,
              service: "LCL",
              description: item.en,
              declaredPackages: item.quantity,
              declaredCbm: cbm,
              status: "RECEIVED_DAR",
            },
          });

          await tx.cargoPackage.create({
            data: {
              cargoId: cargo.id,
              reference: packageReference(reference, 1),
              description: item.en,
              descriptionZh: item.zh,
              quantity: item.quantity,
              pieces: item.pieces,
              cbm,
              cbmOverridden: byHand,
            },
          });

          await tx.darReceiving.create({
            data: {
              cargoId: cargo.id,
              warehouseId: dar.id,
              containerId: null,
              packagesCount: item.quantity,
              piecesCount: item.pieces,
              weightKg: null,
              cbm,
              condition: "GOOD",
              discrepancy: false,
              verified: true,
              verifiedAt: now,
              receivedAt: now,
              notes: "Already in the Dar es Salaam warehouse before this system; entered from the owner's list of arrived cargo.",
            },
          });

          await tx.cargoStatusHistory.create({
            data: {
              cargoId: cargo.id,
              from: null,
              to: "RECEIVED_DAR",
              reason: "Already checked in at the Dar es Salaam warehouse before this system; entered from the owner's list of arrived cargo",
            },
          });

          await tx.auditLog.create({
            data: {
              actorEmail: ACTOR_EMAIL,
              action: "cargo.import",
              entity: "Cargo",
              entityId: cargo.id,
              summary: `${reference} entered as already received at Dar — ${item.en} / ${item.zh}, ${item.quantity} package(s), ${item.pieces} piece(s), ${cbm.toFixed(2)} m³ for ${listed.name} (${listed.code})`,
              metadata: {
                importKey: key,
                source: "Owner's list of cargo arrived and checked in at Dar",
                customerCode: listed.code,
                description: item.en,
                descriptionZh: item.zh,
                packages: item.quantity,
                pieces: item.pieces,
                cbm: cbm.toString(),
                declaredGoodsValue: {
                  currency: "USD",
                  unitPricePerPiece: item.unitPrice,
                  amount: item.amount,
                },
              },
            },
          });

          stats.cargoCreated++;
          created.push(`${reference}  ${listed.code}  ${item.en} / ${item.zh}`);
        }
      }

      if (stats.cargoCreated > 0) {
        await tx.auditLog.create({
          data: {
            actorEmail: ACTOR_EMAIL,
            action: "import.run",
            entity: "Cargo",
            summary: `Entered ${stats.cargoCreated} consignment(s) already received at Dar from the owner's list (${IMPORT})`,
            metadata: { import: IMPORT, created: stats.cargoCreated, skipped: stats.cargoSkipped },
          },
        });
      }

      if (dryRun) throw new DryRun();
    };

    try {
      await prisma.$transaction(run, { maxWait: 30_000, timeout: 300_000 });
    } catch (error) {
      if (!(error instanceof DryRun)) throw error;
    }

    const fx = await prisma.exchangeRate.findFirst({
      where: { fromCurrency: "USD", toCurrency: "TZS", active: true },
      orderBy: { effectiveFrom: "desc" },
      select: { rate: true },
    });

    console.log("");
    console.log(`Customers processed ${stats.customersProcessed} · created ${stats.customersCreated} · existing ${stats.customersExisting}`);
    console.log(`Cargo processed ${stats.cargoProcessed} · created ${stats.cargoCreated} · skipped ${stats.cargoSkipped}`);
    if (created.length) console.log(`${dryRun ? "Would create" : "Created"}:\n  ${created.join("\n  ")}`);
    if (skipped.length) console.log(`Already imported: ${skipped.length}`);
    console.log("");
    console.log(`Total CBM ${totals.cbm.toFixed(2)} across ${totals.items} consignments`);
    console.log(
      `Declared goods value ${formatCurrency(totals.value, "USD")}${
        fx ? ` = ${formatCurrency(usdToTzs(totals.value, fx.rate), "TZS")} at 1 USD = ${fx.rate.toString()} TZS` : " (no live exchange rate)"
      }`
    );
    for (const listed of LIST) {
      const e = listed.expected;
      console.log(
        `  ${listed.code} ${listed.name}: ${listed.items.length} item(s), ${e.quantity} packages, ${e.pieces} pieces, ${D(e.cbm).toFixed(2)} m³, ${formatCurrency(e.value, "USD")}`
      );
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
