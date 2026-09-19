/**
 * READS THE DATABASE AND ASKS IT THE QUESTIONS THE SCREENS ASSUME.
 *
 * Every check is a claim the system makes somewhere: an invoice equals its
 * lines, a balance is its payments, a QR names one cargo, a container's totals
 * are its contents. Read-only — it writes nothing and changes nothing.
 *
 * `npx tsx scripts/audit-integrity.ts`
 */
import { PrismaClient, Prisma } from "@prisma/client";

const prisma = new PrismaClient();
const D = (v: unknown) => new Prisma.Decimal((v ?? 0) as never);
let bad = 0;

function check(name: string, rows: unknown[], detail?: (row: never) => string) {
  if (rows.length === 0) {
    console.log(`  ok   ${name}`);
    return;
  }
  bad += rows.length;
  console.log(`  FAIL ${name} — ${rows.length}`);
  for (const row of rows.slice(0, 5)) {
    console.log(`       ${detail ? detail(row as never) : JSON.stringify(row)}`);
  }
}

async function main() {
  console.log("\nINVOICES");
  const invoices = await prisma.invoice.findMany({
    include: { items: true, payments: true },
  });
  check(
    "subtotal = sum of its lines",
    invoices.filter((i) => {
      const lines = i.items.reduce((s, it) => s.add(D(it.amount)), D(0));
      return !lines.sub(D(i.subtotal)).abs().lessThanOrEqualTo(0.005);
    }),
    (i: (typeof invoices)[number]) =>
      `${i.number}: lines ${i.items.reduce((s, it) => s.add(D(it.amount)), D(0))} vs subtotal ${i.subtotal}`
  );
  check(
    "total = subtotal + VAT",
    invoices.filter((i) => !D(i.subtotal).add(D(i.vatAmount)).sub(D(i.total)).abs().lessThanOrEqualTo(0.005)),
    (i: (typeof invoices)[number]) => `${i.number}: ${i.subtotal} + ${i.vatAmount} ≠ ${i.total}`
  );
  check(
    "VAT = subtotal × vatPercent",
    invoices.filter((i) => {
      const expect = D(i.subtotal).mul(D(i.vatPercent)).div(100).toDecimalPlaces(2);
      return !expect.sub(D(i.vatAmount)).abs().lessThanOrEqualTo(0.02);
    }),
    (i: (typeof invoices)[number]) => `${i.number}: ${i.vatPercent}% of ${i.subtotal} ≠ ${i.vatAmount}`
  );
  check(
    "totalTzs = total × pinned rate",
    invoices.filter((i) => {
      if (i.totalTzs === null || i.fxRate === null) return false;
      const expect = D(i.total).mul(D(i.fxRate)).toDecimalPlaces(0);
      return !expect.sub(D(i.totalTzs)).abs().lessThanOrEqualTo(1);
    }),
    (i: (typeof invoices)[number]) => `${i.number}: ${i.total} × ${i.fxRate} ≠ ${i.totalTzs}`
  );
  check("issued bill with no pinned rate", invoices.filter((i) => i.status !== "DRAFT" && i.status !== "CANCELLED" && i.currency === "USD" && !i.fxRate),
    (i: (typeof invoices)[number]) => `${i.number}`);
  check("negative line, subtotal or total", invoices.filter((i) => D(i.total).lessThan(0) || i.items.some((it) => D(it.amount).lessThan(0) && it.category !== "Discount")),
    (i: (typeof invoices)[number]) => `${i.number}`);
  check(
    "two live bills on one consignment",
    Object.entries(
      invoices
        .filter((i) => i.status !== "CANCELLED")
        .reduce<Record<string, number>>((m, i) => ({ ...m, [i.cargoId]: (m[i.cargoId] ?? 0) + 1 }), {})
    ).filter(([, n]) => n > 1),
    ([cargoId, n]: [string, number]) => `cargo ${cargoId}: ${n} bills`
  );

  console.log("\nPAYMENTS");
  const payments = await prisma.payment.findMany({ include: { invoice: true } });
  check(
    "baseCurrencyAmount = amount at its own rate",
    payments.filter((p) => {
      if (p.baseCurrencyAmount === null) return false;
      const rate = p.fxRate ?? p.invoice.fxRate;
      const expect = p.currency === "TZS" ? D(p.amount) : rate ? D(p.amount).mul(D(rate)).toDecimalPlaces(0) : null;
      return expect !== null && !expect.sub(D(p.baseCurrencyAmount)).abs().lessThanOrEqualTo(1);
    }),
    (p: (typeof payments)[number]) => `${p.reference}: ${p.amount} ${p.currency} @ ${p.fxRate ?? p.invoice.fxRate} ≠ ${p.baseCurrencyAmount}`
  );
  check("zero or negative payment", payments.filter((p) => D(p.amount).lessThanOrEqualTo(0)), (p: (typeof payments)[number]) => p.reference);
  check("verified payment on a cancelled bill", payments.filter((p) => p.status === "VERIFIED" && p.invoice.status === "CANCELLED"), (p: (typeof payments)[number]) => p.reference);
  const dupes = await prisma.$queryRaw<{ invoiceid: string; amount: string; n: bigint }[]>`
    SELECT "invoiceId" AS invoiceid, amount::text, count(*) AS n
    FROM "Payment"
    WHERE status = 'VERIFIED'
    GROUP BY "invoiceId", amount, "paidAt", currency
    HAVING count(*) > 1`;
  check("same amount verified twice on one bill, same instant", dupes, (d: (typeof dupes)[number]) => `invoice ${d.invoiceid} × ${d.n}`);

  console.log("\nRECEIPTS");
  const receipts = await prisma.receipt.findMany({ include: { payment: true } });
  /* A reversal keeps its receipt on purpose: the customer is holding a piece
     of paper, and a receipt pointing at nothing is worse than one pointing at
     a payment marked reversed. Anything else is wrong. */
  check(
    "receipt against a payment that was never verified",
    receipts.filter((r) => r.payment.status !== "VERIFIED" && r.payment.status !== "REVERSED"),
    (r: (typeof receipts)[number]) => r.number
  );

  console.log("\nCARGO AND CONTAINERS");
  const cargo = await prisma.cargo.findMany({
    where: { deletedAt: null },
    include: { packages: { where: { deletedAt: null } }, chinaReceiving: true, darReceiving: true, containerLines: { include: { container: true } } },
  });
  check(
    "China receiving volume = its own lines",
    cargo.filter((c) => {
      if (!c.chinaReceiving || c.packages.length === 0) return false;
      const lines = c.packages.reduce((s, p) => s.add(D(p.cbm)), D(0));
      return !lines.sub(D(c.chinaReceiving.cbm)).abs().lessThanOrEqualTo(0.005);
    }),
    (c: (typeof cargo)[number]) => `${c.reference}: lines ${c.packages.reduce((s, p) => s.add(D(p.cbm)), D(0))} vs china ${c.chinaReceiving?.cbm}`
  );
  check("negative measurement", cargo.filter((c) => c.packages.some((p) => D(p.cbm).lessThan(0) || p.quantity < 0)), (c: (typeof cargo)[number]) => c.reference);
  check(
    "on two containers that are both still going somewhere",
    cargo.filter((c) => c.containerLines.filter((l) => !["CLOSED"].includes(l.container.status) && !l.container.deletedAt).length > 1),
    (c: (typeof cargo)[number]) => c.reference
  );
  check("cargo with no sender or receiver", cargo.filter((c) => !c.senderId || !c.receiverId), (c: (typeof cargo)[number]) => c.reference);

  const containers = await prisma.container.findMany({
    where: { deletedAt: null },
    include: { cargoLines: { include: { cargo: { include: { packages: { where: { deletedAt: null } } } } } } },
  });
  check(
    "container line volume = that cargo's own packages in it",
    containers.flatMap((box) =>
      box.cargoLines.filter((line) => {
        const inBox = line.cargo.packages.filter((p) => p.containerId === box.id);
        if (inBox.length === 0) return false;
        const sum = inBox.reduce((s, p) => s.add(D(p.cbm)), D(0));
        return !sum.sub(D(line.cbm)).abs().lessThanOrEqualTo(0.005);
      }).map((line) => ({ box: box.reference, cargo: line.cargoId, line: line.cbm.toString() }))
    ),
    (r: { box: string; cargo: string; line: string }) => `${r.box} / ${r.cargo}: line ${r.line}`
  );

  console.log("\nIDENTITY");
  /*
    A single-carton line and its one box share a code on purpose (migration
    0007): the sticker already printed for the line is that box's sticker, and
    reissuing it would strand paper in Guangzhou. Every other sharing is two
    different things answering to one code, which is what this looks for.
  */
  const qrDupes = await prisma.$queryRaw<{ token: string; n: bigint }[]>`
    SELECT token, count(*) AS n FROM (
      SELECT "qrToken" AS token FROM "Cargo" WHERE "qrToken" IS NOT NULL
      UNION ALL SELECT "qrToken" FROM "CargoPackage" WHERE "qrToken" IS NOT NULL
      UNION ALL SELECT b."qrToken" FROM "CargoBox" b
        WHERE b."qrToken" IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM "CargoPackage" p
            WHERE p.id = b."packageId" AND p."qrToken" = b."qrToken"
          )
      UNION ALL SELECT "qrToken" FROM "PickupNote" WHERE "qrToken" IS NOT NULL
    ) t GROUP BY token HAVING count(*) > 1`;
  check("one code, one thing", qrDupes, (q: (typeof qrDupes)[number]) => `${q.token} × ${q.n}`);
  const phoneDupes = await prisma.$queryRaw<{ phone: string; n: bigint }[]>`
    SELECT phone, count(*) AS n FROM "Customer" WHERE "deletedAt" IS NULL GROUP BY phone HAVING count(*) > 1`;
  check("one customer per phone", phoneDupes, (p: (typeof phoneDupes)[number]) => `${p.phone} × ${p.n}`);
  const markDupes = await prisma.$queryRaw<{ mark: string; n: bigint }[]>`
    SELECT "shippingMark" AS mark, count(*) AS n FROM "Customer"
    WHERE "deletedAt" IS NULL AND "shippingMark" IS NOT NULL GROUP BY "shippingMark" HAVING count(*) > 1`;
  check("one mark, one customer", markDupes, (m: (typeof markDupes)[number]) => `${m.mark} × ${m.n}`);

  console.log("\nRELEASE");
  const notes = await prisma.pickupNote.findMany({ include: { cargo: true } });
  check("pickup note on cargo that was never checked in at Dar", notes.filter((n) => !n.cargo.clearedAt && !n.onCredit), (n: (typeof notes)[number]) => n.noteNumber);

  console.log(bad === 0 ? "\nEverything the screens assume holds.\n" : `\n${bad} row(s) to look at.\n`);
  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
