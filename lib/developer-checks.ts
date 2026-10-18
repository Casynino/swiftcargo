import "server-only";

import { impliedStatus } from "@/lib/invoice-balance";
import type { Finding } from "@/lib/developer-overview";
import { businessFindings } from "@/lib/developer-system";
import { prisma } from "@/lib/prisma";
import { readUpload } from "@/lib/storage";

/**
 * WHAT IS WRONG, AND WHAT TO DO ABOUT IT.
 *
 * Each check looks for one way this system goes wrong — a bill that disagrees
 * with its payments, a count that disagrees with its lines, storage not being
 * charged, errors, photos that will not load — and, when it finds it, says what
 * is wrong, why it matters and what to do. A check that cannot run reports
 * nothing rather than a false alarm, and never stops the others.
 */

const DAY = 86_400_000;

type Check = () => Promise<Finding[]>;

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

const errors: Check = async () => {
  const since = new Date(Date.now() - DAY);
  const rows = await prisma.systemEvent.findMany({
    where: { kind: "ERROR", createdAt: { gte: since } },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: { message: true, path: true },
  });
  if (rows.length === 0) return [];
  const byMessage = new Map<string, { n: number; path: string | null }>();
  for (const r of rows) {
    const cur = byMessage.get(r.message) ?? { n: 0, path: r.path };
    cur.n++;
    byMessage.set(r.message, cur);
  }
  const top = [...byMessage].sort((a, b) => b[1].n - a[1].n).slice(0, 4);
  return [
    {
      key: "errors",
      tone: rows.length >= 5 ? "fix" : "look",
      title: `${plural(rows.length, "server error")} in the last 24 hours`,
      detail: "Something failed on the server while somebody was using it. They saw an error page, or the action did not happen.",
      fix: "Open the page named below and repeat what the person was doing. If the same message keeps coming, that is the bug to fix.",
      lines: top.map(([message, v]) => `${v.n}× ${message}${v.path ? ` — ${v.path}` : ""}`),
    },
  ];
};

const photos: Check = async () => {
  const last = await prisma.cargoPhoto.findFirst({ orderBy: { createdAt: "desc" }, select: { url: true } });
  if (!last?.url.startsWith("/uploads/")) return [];
  const segments = last.url.slice("/uploads/".length).split("/");
  const timeout = new Promise<"timeout">((r) => setTimeout(() => r("timeout"), 4000));
  const result = await Promise.race([readUpload(segments).then((f) => (f ? "ok" : "missing")).catch(() => "failed"), timeout]);
  if (result === "ok") return [];
  return [
    {
      key: "photos",
      tone: "fix",
      title: "Photos cannot be loaded",
      detail:
        result === "missing"
          ? "The newest cargo photo is recorded but its file is not in storage."
          : "The photo storage is not answering. Every cargo photo and receipt picture will show as broken, for staff and customers.",
      fix: "Open Vercel → the project's Storage and Billing. An unpaid invoice or a blocked store is the usual cause; the photos come back as soon as it is settled.",
    },
  ];
};

const invoiceStatus: Check = async () => {
  const bills = await prisma.invoice.findMany({
    where: { status: { in: ["ISSUED", "PARTIALLY_PAID", "PAID", "OVERDUE"] } },
    select: {
      id: true, number: true, status: true, total: true, currency: true, fxRate: true, totalTzs: true, dueAt: true,
      payments: { select: { status: true, amount: true, currency: true, fxRate: true, baseCurrencyAmount: true, creditedAmount: true } },
    },
    take: 3000,
  });
  const drift = bills.filter((b) => (b.status === "PAID") !== (impliedStatus(b) === "PAID"));
  if (drift.length === 0) return [];
  return [
    {
      key: "status-drift",
      tone: "fix",
      title: `${plural(drift.length, "bill")} marked paid or unpaid wrongly`,
      detail: "The status on the bill disagrees with the verified payments against it. A customer may be told they owe money they have paid — or released goods they have not paid for.",
      fix: "Open the bill and check its payments. If a payment was verified or reversed by hand, the status needs refreshing from the invoice page.",
      lines: drift.slice(0, 5).map((b) => `${b.number} is marked ${b.status.toLowerCase().replace("_", " ")}`),
      href: `/app/finance/invoices/${drift[0].id}`,
    },
  ];
};

const invoiceTotals: Check = async () => {
  const rows = await prisma.$queryRaw<{ number: string; id: string }[]>`
    SELECT i."number", i."id" FROM "Invoice" i
    WHERE i."status" NOT IN ('DRAFT', 'CANCELLED')
      AND EXISTS (SELECT 1 FROM "InvoiceItem" it WHERE it."invoiceId" = i."id")
      AND abs(i."subtotal" - (SELECT COALESCE(SUM(it."amount"), 0) FROM "InvoiceItem" it WHERE it."invoiceId" = i."id")) > 0.05
    LIMIT 20`;
  if (rows.length === 0) return [];
  return [
    {
      key: "totals",
      tone: "fix",
      title: `${plural(rows.length, "bill")} whose total does not match its lines`,
      detail: "The amount the customer is asked to pay is not the sum of what the bill lists. Somebody is being over- or under-charged.",
      fix: "Open the bill and compare the lines to the total. Re-price it from the invoice page if a line was changed.",
      lines: rows.slice(0, 5).map((r) => r.number),
      href: `/app/finance/invoices/${rows[0].id}`,
    },
  ];
};

const chinaCount: Check = async () => {
  const rows = await prisma.$queryRaw<{ reference: string; id: string; counted: number; lines: number }[]>`
    SELECT c."reference", c."id", cr."packagesCount" AS counted, s.q::int AS lines
    FROM "ChinaReceiving" cr
    JOIN "Cargo" c ON c."id" = cr."cargoId" AND c."deletedAt" IS NULL
    JOIN (SELECT "cargoId", SUM("quantity") q FROM "CargoPackage" WHERE "deletedAt" IS NULL GROUP BY "cargoId") s ON s."cargoId" = cr."cargoId"
    LEFT JOIN "DarReceiving" d ON d."cargoId" = cr."cargoId"
    WHERE d."id" IS NULL AND cr."packagesCount" <> s.q
    LIMIT 20`;
  if (rows.length === 0) return [];
  return [
    {
      key: "china-count",
      tone: "look",
      title: `${plural(rows.length, "consignment")} whose package count disagrees with its lines`,
      detail: "The count on the cargo card is not the sum of its package lines. Dar will see a shortage or surplus that is not real.",
      fix: "Open the cargo and correct a line (any change re-adds the totals), or ask the China warehouse to recount.",
      lines: rows.slice(0, 5).map((r) => `${r.reference}: card says ${r.counted}, lines add to ${r.lines}`),
      href: `/app/cargo/${rows[0].id}`,
    },
  ];
};

const noAccount: Check = async () => {
  const n = await prisma.payment.count({ where: { status: "VERIFIED", accountId: null, writtenOff: false } });
  if (n === 0) return [];
  return [
    {
      key: "no-account",
      tone: "look",
      title: `${plural(n, "verified payment")} with no account`,
      detail: "Money was verified but nobody said which account it reached. It is on the bill but missing from every account's balance, so the books will not add up.",
      fix: "Open the payment in the ledger and name the account it landed in.",
      href: "/app/finance/ledger",
    },
  ];
};

const storageNotCharging: Check = async () => {
  const company = await prisma.companySetting.findUnique({ where: { id: "singleton" }, select: { freeStorageDays: true, storagePerDay: true } });
  if (!company || Number(company.storagePerDay) <= 0) return [];
  const cutoff = new Date(Date.now() - (company.freeStorageDays + 1) * DAY);
  const bills = await prisma.invoice.findMany({
    where: {
      status: { in: ["ISSUED", "PARTIALLY_PAID", "PAID", "OVERDUE"] },
      storageWaivedAt: null,
      items: { none: { category: "Storage" } },
      cargo: { deletedAt: null, clearedAt: { lt: cutoff }, release: { is: null }, status: { notIn: ["COLLECTED", "DELIVERED", "CANCELLED", "MISSING_AT_DAR"] } },
    },
    select: { number: true, cargo: { select: { reference: true } } },
    take: 20,
  });
  if (bills.length === 0) return [];
  return [
    {
      key: "storage",
      tone: "fix",
      title: `Storage is not being added to ${plural(bills.length, "bill")}`,
      detail: "These goods are past their free days and the nightly job should have charged storage. It has not, so the company is losing money — or the job has stopped.",
      fix: "Check that the storage cron is listed in Vercel → Crons and ran last night. Opening the bill and pressing 'Charge storage again' adds it now.",
      lines: bills.slice(0, 5).map((b) => `${b.number} · ${b.cargo.reference}`),
    },
  ];
};

const exchangeRate: Check = async () => {
  const rate = await prisma.exchangeRate.findFirst({ where: { active: true, fromCurrency: "USD", toCurrency: "TZS" }, orderBy: { effectiveFrom: "desc" }, select: { effectiveFrom: true } });
  if (!rate) {
    return [{ key: "rate", tone: "fix", title: "There is no exchange rate", detail: "No bill can be issued and no shilling payment can be valued without one.", fix: "Set today's rate in Finance → Rates.", href: "/app/finance/exchange-rate" }];
  }
  const age = Math.floor((Date.now() - rate.effectiveFrom.getTime()) / DAY);
  if (age <= 7) return [];
  return [{ key: "rate", tone: "look", title: `The exchange rate is ${age} days old`, detail: "New bills and payments are valued at this rate. If the market has moved, customers are charged the old figure.", fix: "Check today's rate and publish it in Finance → Rates.", href: "/app/finance/exchange-rate" }];
};

const contradiction: Check = async () => {
  const rows = await prisma.cargo.findMany({
    where: { deletedAt: null, status: { in: ["IN_TRANSIT", "DEPARTED_CHINA"] }, containerLines: { some: { container: { status: "ARRIVED" } } } },
    select: { reference: true, id: true },
    take: 20,
  });
  if (rows.length === 0) return [];
  return [
    {
      key: "contradiction",
      tone: "look",
      title: `${plural(rows.length, "consignment")} still "at sea" on a container that has arrived`,
      detail: "The container was marked arrived but these consignments never moved with it, so customers are still told their goods are on the way.",
      fix: "Open the container in Arrived containers. Undo and re-mark it arrived, or check each consignment in at Dar.",
      lines: rows.slice(0, 5).map((r) => r.reference),
      href: `/app/cargo/${rows[0].id}`,
    },
  ];
};

const missingSettings: Check = async () => {
  const missing = ["AUTH_SECRET", "DATABASE_URL", "DIRECT_URL", "BLOB_READ_WRITE_TOKEN", "CRON_SECRET", "NEXT_PUBLIC_SITE_URL"].filter((n) => !process.env[n]?.trim());
  if (missing.length === 0) return [];
  return [{ key: "env", tone: "fix", title: `${plural(missing.length, "required setting")} missing`, detail: "Parts of the system will not work without these.", fix: "Add them in Vercel → Settings → Environment Variables, then redeploy.", lines: missing }];
};

const ALL: Check[] = [errors, photos, invoiceStatus, invoiceTotals, chinaCount, noAccount, storageNotCharging, exchangeRate, contradiction, missingSettings, businessFindings];

export async function systemChecks(): Promise<Finding[]> {
  const settled = await Promise.allSettled(ALL.map((c) => c()));
  return settled.flatMap((r) => (r.status === "fulfilled" ? r.value : [])) as Finding[];
}
