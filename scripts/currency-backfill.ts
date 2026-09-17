/**
 * Moves an existing database onto shilling balances. Safe to run more than once.
 *
 *   npx tsx scripts/currency-backfill.ts
 *
 * 1. Publishes the company default rate (1 USD = 2,700 TZS) if it is not already
 *    the live rate, closing the previous row rather than editing it.
 * 2. Writes the shilling value onto every payment recorded before payments
 *    carried one, at that payment's own rate, or its bill's.
 * 3. Rounds each bill's stored shilling total to whole shillings at the bill's
 *    own pinned rate. No bill is re-rated.
 * 4. Re-derives each issued bill's status from its payments.
 */
import { Prisma, PrismaClient } from "@prisma/client";

import { roundMoney, usdToTzs } from "../lib/currency";
import { impliedStatus, invoiceRate } from "../lib/invoice-balance";

const prisma = new PrismaClient();
const DEFAULT_RATE = new Prisma.Decimal(2700);

async function main() {
  const live = await prisma.exchangeRate.findFirst({
    where: { fromCurrency: "USD", toCurrency: "TZS", active: true },
    orderBy: { effectiveFrom: "desc" },
  });
  if (!live || !live.rate.equals(DEFAULT_RATE)) {
    const admin = await prisma.user.findFirst({ where: { role: "ADMIN" } });
    const now = new Date();
    await prisma.$transaction(async (tx) => {
      await tx.exchangeRate.updateMany({
        where: { fromCurrency: "USD", toCurrency: "TZS", active: true },
        data: { active: false, effectiveTo: now },
      });
      const row = await tx.exchangeRate.create({
        data: {
          fromCurrency: "USD",
          toCurrency: "TZS",
          rate: DEFAULT_RATE,
          effectiveFrom: now,
          notes: "Company default rate",
          createdById: admin?.id ?? null,
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: admin?.id ?? null,
          actorEmail: admin?.email ?? null,
          actorRole: admin?.role ?? null,
          action: "fx.set",
          entity: "ExchangeRate",
          entityId: row.id,
          summary: `USD → TZS ${live ? `${live.rate.toString()} → ` : ""}2700 — Company default rate`,
          metadata: {
            oldValue: live?.rate.toString() ?? null,
            newValue: "2700",
            previousRateId: live?.id ?? null,
            reason: "Company default rate",
          },
        },
      });
    });
    console.log(`Published 1 USD = 2,700 TZS${live ? ` (was ${live.rate.toString()})` : ""}.`);
  } else {
    console.log("2,700 is already the live rate.");
  }

  const payments = await prisma.payment.findMany({
    where: { baseCurrencyAmount: null },
    include: { invoice: { select: { fxRate: true } } },
  });
  let valued = 0;
  for (const p of payments) {
    let base: Prisma.Decimal | null = null;
    let rate = p.fxRate && p.fxRate.greaterThan(1) ? p.fxRate : invoiceRate(p.invoice);
    if (p.currency === "TZS") base = roundMoney(p.amount, "TZS");
    else if (rate) base = usdToTzs(p.amount, rate);
    if (!base) {
      console.warn(`  ${p.reference}: ${p.currency} with no rate — left for Finance.`);
      continue;
    }
    await prisma.payment.update({
      where: { id: p.id },
      data: { baseCurrencyAmount: base, fxRate: p.fxRate ?? rate },
    });
    valued++;
  }
  console.log(`Valued ${valued} payment(s) in shillings.`);

  const invoices = await prisma.invoice.findMany({ include: { payments: true } });
  let rounded = 0;
  let restated = 0;
  for (const invoice of invoices) {
    const rate = invoiceRate(invoice);
    const totalTzs =
      invoice.currency === "TZS" ? roundMoney(invoice.total, "TZS") : rate ? usdToTzs(invoice.total, rate) : null;
    const data: Prisma.InvoiceUpdateInput = {};
    if (totalTzs && !(invoice.totalTzs && invoice.totalTzs.equals(totalTzs))) {
      data.totalTzs = totalTzs;
      rounded++;
    }
    const status = impliedStatus(invoice);
    if (status !== invoice.status) {
      data.status = status;
      restated++;
      console.log(`  ${invoice.number}: ${invoice.status} → ${status}`);
    }
    if (Object.keys(data).length) {
      await prisma.invoice.update({ where: { id: invoice.id }, data });
    }
  }
  console.log(`Rounded ${rounded} bill total(s) to whole shillings; ${restated} status(es) re-derived.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
