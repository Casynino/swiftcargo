import "server-only";

import { impliedStatus } from "@/lib/invoice-balance";
import type { Finding } from "@/lib/developer-overview";
import { prisma } from "@/lib/prisma";
import { JOBS } from "@/lib/jobs";
import { readUpload } from "@/lib/storage";

/**
 * WHAT IS WRONG WITH THE SYSTEM, AND WHAT TO DO ABOUT IT.
 *
 * Only the system's own faults — errors, jobs that stopped, data that
 * disagrees with itself, settings that are missing. Never the business's
 * to-dos (a payment awaiting verification, a rate to refresh): those belong
 * to Finance and the floors, and are not the developer's to chase.
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
      fix: "Open the bill and check its payments. To change it, work as Finance and refresh the status from the invoice page.", workAs: "FINANCE",
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
      fix: "Open the bill and compare the lines to the total. To correct it, work as Finance and re-price it from the invoice page.", workAs: "FINANCE",
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
      fix: "Open the cargo to see it. To correct it, work as the China warehouse and correct a line (any change re-adds the totals).", workAs: "CHINA_WAREHOUSE",
      lines: rows.slice(0, 5).map((r) => `${r.reference}: card says ${r.counted}, lines add to ${r.lines}`),
      href: `/app/cargo/${rows[0].id}`,
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
      fix: "Check that the storage cron is listed in Vercel → Crons and ran last night. Working as Finance and pressing 'Charge storage again' on the bill adds it now.", workAs: "FINANCE",
      lines: bills.slice(0, 5).map((b) => `${b.number} · ${b.cargo.reference}`),
    },
  ];
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
      fix: "Open the cargo to see it. To correct it, work as the Dar warehouse: undo and re-mark the container arrived, or check each consignment in.", workAs: "DAR_WAREHOUSE",
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

/* ------------------------------------------------------------------ */
/* Checks that look at the machinery itself.                           */
/* ------------------------------------------------------------------ */

const database: Check = async () => {
  const times: number[] = [];
  for (let i = 0; i < 3; i++) {
    const t = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    times.push(Date.now() - t);
  }
  const avg = Math.round(times.reduce((a, b) => a + b, 0) / times.length);
  if (avg < 400) return [];
  return [{ key: "db-slow", tone: "look", title: `The database is slow (${avg} ms)`, detail: "Every page waits on it, so everything will feel sluggish.", fix: "Check the database provider's status page. If it stays slow, look at the Speed & size section for which question is slow." }];
};

const jobsOnTime: Check = async () => {
  const out: Finding[] = [];
  for (const job of JOBS) {
    const last = await prisma.jobRun.findFirst({ where: { name: job.name }, orderBy: { startedAt: "desc" }, select: { startedAt: true, ok: true, result: true } });
    if (!last) continue;
    const lateBy = Date.now() - last.startedAt.getTime() - job.everyHours * 1.5 * 3_600_000;
    if (!last.ok) {
      out.push({ key: `job-${job.name}`, tone: "fix", title: `"${job.label}" failed on its last run`, detail: last.result ?? "It stopped with an error.", fix: "Fix the error shown, then run it again: open its address once while signed in as the developer, or wait for the next night." });
    } else if (lateBy > 0) {
      out.push({ key: `job-${job.name}`, tone: "fix", title: `"${job.label}" has not run on time`, detail: `It last ran ${last.startedAt.toLocaleString("en-GB", { timeZone: "Africa/Dar_es_Salaam" })}, and should run every ${job.everyHours} hours.`, fix: "In Vercel → the project → Crons, check it is listed and enabled, and that CRON_SECRET is set." });
    }
  }
  return out;
};

const auditProtected: Check = async () => {
  const rows = await prisma.$queryRaw<{ n: number }[]>`SELECT count(*)::int AS n FROM pg_trigger WHERE tgname = 'swift_protect_developer_audit_trg'`;
  if ((rows[0]?.n ?? 0) > 0) return [];
  return [{ key: "audit-trigger", tone: "fix", title: "The developer's audit lines are no longer protected", detail: "The database rule that stops them being edited or deleted is missing, so the developer's trail could be rewritten.", fix: "Run the database migrations again (npx prisma migrate deploy) so migration 0024 restores it." }];
};

const rateOnBills: Check = async () => {
  const n = await prisma.invoice.count({ where: { status: { notIn: ["DRAFT", "CANCELLED"] }, currency: "USD", OR: [{ fxRate: null }, { fxRate: { lte: 1 } }] } });
  if (n === 0) return [];
  return [{ key: "fx-pinned", tone: "look", title: `${plural(n, "issued bill")} with no exchange rate pinned`, detail: "A bill in dollars must keep the rate it was issued at. Without it, shilling balances cannot be worked out reliably.", fix: "Open one of them in Finance and check how it was issued; this should not happen from the screens." }];
};

const guessing: Check = async () => {
  const since = new Date(Date.now() - DAY);
  const [failed, dev] = await Promise.all([
    prisma.loginEvent.count({ where: { ok: false, createdAt: { gte: since } } }),
    prisma.loginEvent.count({ where: { ok: false, createdAt: { gte: since }, user: { role: "DEVELOPER" } } }),
  ]);
  const out: Finding[] = [];
  if (failed >= 20) out.push({ key: "guessing", tone: "look", title: `${failed} failed sign-ins in 24 hours`, detail: "More than typing mistakes: somebody may be guessing passwords.", fix: "See Sign-ins & security for which addresses are trying which accounts." });
  if (dev >= 3) out.push({ key: "guessing-dev", tone: "look", title: `${dev} wrong-password tries on your own account`, detail: "After 10 wrong tries for one account it locks for 15 minutes.", fix: "If it was not you, change your developer password." });
  return out;
};

export type CheckResult = { id: string; name: string; status: "ok" | "fix" | "look" | "unknown"; note?: string; fine?: string; finding?: Finding };

const REGISTRY: { id: string; name: string; fine: string; run: Check; unknownIf?: () => Promise<string | null> }[] = [
  { id: "database", fine: "Answers quickly.", name: "The database answers quickly", run: database },
  { id: "errors", fine: "No server errors in 24 hours.", name: "No server errors in the last 24 hours", run: errors },
  { id: "photos", fine: "Recent photos load.", name: "Photos can be loaded", run: photos },
  { id: "env", fine: "All required settings are set.", name: "Every required setting is present", run: missingSettings },
  {
    id: "jobs",
    fine: "Every job ran when it should.",
    name: "Automatic jobs run on time",
    run: jobsOnTime,
    unknownIf: async () => ((await prisma.jobRun.count()) === 0 ? "No run of any job has been recorded yet." : null),
  },
  { id: "storage", fine: "Storage is added when free days end.", name: "Storage is added to bills past the free days", run: storageNotCharging },
  { id: "status", fine: "No bill disagrees with its payments.", name: "Bill status agrees with its payments", run: invoiceStatus },
  { id: "totals", fine: "No bill disagrees with its lines.", name: "Bill totals agree with their lines", run: invoiceTotals },
  { id: "china", fine: "Every count matches its lines.", name: "Package counts agree with their lines", run: chinaCount },
  { id: "rate", fine: "Every dollar bill has its rate.", name: "Issued dollar bills keep their exchange rate", run: rateOnBills },
  { id: "containers", fine: "No container contradicts its cargo.", name: "Containers and their cargo agree", run: contradiction },
  { id: "audit", fine: "The protecting rule is in place.", name: "The developer's audit lines cannot be changed", run: auditProtected },
  { id: "guessing", fine: "Nothing unusual in 24 hours.", name: "Nobody is guessing passwords", run: guessing },
];

export async function runChecks(): Promise<{ results: CheckResult[]; findings: Finding[] }> {
  const results: CheckResult[] = await Promise.all(
    REGISTRY.map(async (c): Promise<CheckResult> => {
      try {
        const unknown = await c.unknownIf?.();
        const found = await c.run();
        if (found.length > 0) {
          const worst = found.find((f) => f.tone === "fix") ?? found[0];
          return { id: c.id, name: c.name, status: worst.tone === "fix" ? "fix" : "look", finding: worst };
        }
        return unknown ? { id: c.id, name: c.name, status: "unknown", note: unknown } : { id: c.id, name: c.name, status: "ok", fine: c.fine };
      } catch {
        return { id: c.id, name: c.name, status: "unknown", note: "This check could not run just now." };
      }
    })
  );
  /* A check with several findings still counts once, but every finding is shown. */
  const findings = (
    await Promise.all(
      REGISTRY.map(async (c) => {
        try {
          return await c.run();
        } catch {
          return [] as Finding[];
        }
      })
    )
  ).flat();
  return { results, findings };
}

export async function systemChecks(): Promise<Finding[]> {
  return (await runChecks()).findings;
}
