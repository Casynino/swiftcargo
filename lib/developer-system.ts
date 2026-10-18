import "server-only";

import { darDay, incomeRows, toCollect } from "@/lib/income";
import { prisma } from "@/lib/prisma";

/**
 * WHAT IS REALLY GOING ON, BEYOND WHO SIGNED IN.
 *
 * The business flow (cargo, containers, money), the security picture and the
 * size of the data, counted from the records themselves. Nothing is stored for
 * it, so it cannot disagree with the screens it summarises.
 */

const DAY = 86_400_000;

export const PIPELINE: { key: string; label: string; statuses: string[] }[] = [
  { key: "china", label: "In China", statuses: ["REGISTERED", "RECEIVED_CHINA", "ASSIGNED_TO_CONTAINER", "CONTAINER_LOADED"] },
  { key: "sea", label: "At sea", statuses: ["DEPARTED_CHINA", "IN_TRANSIT"] },
  { key: "dar", label: "In Dar", statuses: ["ARRIVED_TANZANIA", "RECEIVED_DAR", "READY_FOR_RELEASE"] },
  { key: "done", label: "Collected", statuses: ["COLLECTED", "DELIVERED"] },
  { key: "issue", label: "Missing or cancelled", statuses: ["MISSING_AT_DAR", "CANCELLED"] },
];

const days14 = () => Array.from({ length: 14 }, (_, i) => darDay(new Date(Date.now() - (13 - i) * DAY)));
const label = (d: string) =>
  new Date(`${d}T12:00:00+03:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Africa/Dar_es_Salaam" });

export async function businessPulse() {
  const now = Date.now();
  const since14 = new Date(now - 14 * DAY);
  const [byStatus, containers, cargoNew, invoicesNew, owing, pendingPay, income] = await Promise.all([
    prisma.cargo.groupBy({ by: ["status"], where: { deletedAt: null }, _count: true }),
    prisma.container.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        reference: true,
        status: true,
        containerNumber: true,
        shipment: { select: { vessel: true, eta: true, actualArrival: true } },
        _count: { select: { cargoLines: true } },
      },
    }),
    prisma.cargo.findMany({ where: { deletedAt: null, createdAt: { gte: since14 } }, select: { createdAt: true } }),
    prisma.invoice.findMany({ where: { issuedAt: { gte: since14 } }, select: { issuedAt: true } }),
    toCollect(),
    prisma.payment.findMany({ where: { status: "PENDING" }, select: { createdAt: true } }),
    incomeRows(since14, new Date(now + DAY)),
  ]);

  const count = (statuses: string[]) => byStatus.filter((s) => statuses.includes(s.status)).reduce((n, s) => n + s._count, 0);
  const pipeline = PIPELINE.map((p) => ({ name: p.label, count: count(p.statuses) }));

  const days = days14();
  const perDay = (rows: { at: Date | null }[]) => days.map((d) => ({ label: label(d), value: rows.filter((r) => r.at && darDay(r.at) === d).length }));
  const cargoPerDay = perDay(cargoNew.map((c) => ({ at: c.createdAt })));
  const invoicesPerDay = perDay(invoicesNew.map((i) => ({ at: i.issuedAt })));
  const receivedPerDay = days.map((d) => ({
    label: label(d),
    value: Math.round(income.filter((r) => r.counted && r.day === d).reduce((s, r) => s + r.amount, 0) / 1000),
  }));

  const owed = owing.reduce((s, r) => s + r.owedTzs, 0);
  const storageRunning = owing.filter((r) => r.stage === "storage");
  return {
    pipeline,
    containers: containers.map((c) => ({
      reference: c.reference,
      number: c.containerNumber,
      status: c.status,
      cargo: c._count.cargoLines,
      vessel: c.shipment?.vessel ?? null,
      date: c.shipment?.actualArrival ?? c.shipment?.eta ?? null,
    })),
    cargoPerDay,
    invoicesPerDay,
    receivedPerDay,
    owed,
    owingCount: owing.length,
    storageRunning: storageRunning.length,
    storageOwed: storageRunning.reduce((s, r) => s + r.owedTzs, 0),
    pendingPayments: pendingPay.length,
    oldestPending: pendingPay.length ? Math.floor((now - Math.min(...pendingPay.map((p) => p.createdAt.getTime()))) / DAY) : 0,
    received14: income.filter((r) => r.counted).reduce((s, r) => s + r.amount, 0),
  };
}

/** Things in the business that have waited too long — added to "Needs your attention". */
export async function businessFindings() {
  const now = Date.now();
  const [pay, uncheckedCleared, noBill, overdue] = await Promise.all([
    prisma.payment.count({ where: { status: "PENDING", createdAt: { lt: new Date(now - DAY) } } }),
    prisma.cargo.count({
      where: { deletedAt: null, clearedAt: { lt: new Date(now - 2 * DAY) }, darReceiving: null, status: { notIn: ["COLLECTED", "DELIVERED", "CANCELLED", "MISSING_AT_DAR"] } },
    }),
    prisma.cargo.count({
      where: {
        deletedAt: null,
        status: { in: ["RECEIVED_DAR", "ARRIVED_TANZANIA"] },
        createdAt: { lt: new Date(now - 3 * DAY) },
        invoices: { none: {} },
      },
    }),
    prisma.invoice.count({ where: { status: "OVERDUE" } }),
  ]);
  const out: { key: string; tone: "look" | "info"; title: string; detail: string }[] = [];
  if (pay) out.push({ key: "pay", tone: "look", title: `${pay} payment${pay === 1 ? "" : "s"} waiting to be verified for over a day`, detail: "Money has been reported and nobody in Finance has checked it. The customer's bill still shows it as owing." });
  if (uncheckedCleared) out.push({ key: "unchecked", tone: "look", title: `${uncheckedCleared} cleared consignment${uncheckedCleared === 1 ? "" : "s"} not checked in for 2+ days`, detail: "Storage is already running on them, but the Dar warehouse has not verified the goods." });
  if (noBill) out.push({ key: "nobill", tone: "look", title: `${noBill} consignment${noBill === 1 ? "" : "s"} in Dar with no bill`, detail: "Landed for three days or more and nobody has priced them. The customer cannot be asked to pay." });
  if (overdue) out.push({ key: "overdue", tone: "info", title: `${overdue} overdue bill${overdue === 1 ? "" : "s"}`, detail: "Past their due date and still owing." });
  return out;
}

export async function securityPulse() {
  const now = Date.now();
  const since14 = new Date(now - 14 * DAY);
  const since7 = new Date(now - 7 * DAY);
  const [failed, okLogins, denied, locked] = await Promise.all([
    prisma.loginEvent.findMany({ where: { ok: false, createdAt: { gte: since14 } }, select: { createdAt: true, ipAddress: true, email: true } }),
    prisma.loginEvent.count({ where: { ok: true, createdAt: { gte: since14 } } }),
    prisma.auditLog.findMany({ where: { outcome: "DENIED", createdAt: { gte: since14 } }, orderBy: { createdAt: "desc" }, take: 8, select: { createdAt: true, actorName: true, summary: true } }),
    prisma.loginEvent.groupBy({ by: ["email"], where: { ok: false, createdAt: { gte: new Date(now - 15 * 60_000) } }, _count: true }),
  ]);
  const days = days14();
  const failedPerDay = days.map((d) => ({ label: label(d), value: failed.filter((f) => darDay(f.createdAt) === d).length }));
  const byIp = new Map<string, { count: number; emails: Set<string>; last: Date }>();
  for (const f of failed.filter((f) => f.createdAt >= since7)) {
    const k = f.ipAddress ?? "unknown";
    const cur = byIp.get(k) ?? { count: 0, emails: new Set<string>(), last: f.createdAt };
    cur.count++;
    cur.emails.add(f.email);
    if (f.createdAt > cur.last) cur.last = f.createdAt;
    byIp.set(k, cur);
  }
  return {
    failedPerDay,
    failedTotal: failed.length,
    okLogins,
    byIp: [...byIp].map(([ip, v]) => ({ ip, count: v.count, accounts: v.emails.size, last: v.last })).sort((a, b) => b.count - a.count).slice(0, 8),
    denied,
    lockedNow: locked.filter((l) => l._count >= 10).length,
  };
}

export async function dataPulse() {
  const [customers, cargo, packages, boxes, containers, invoices, payments, receipts, audit, fieldChanges, logins, users, photos] = await Promise.all([
    prisma.customer.count(),
    prisma.cargo.count(),
    prisma.cargoPackage.count(),
    prisma.cargoBox.count(),
    prisma.container.count(),
    prisma.invoice.count(),
    prisma.payment.count(),
    prisma.receipt.count(),
    prisma.auditLog.count(),
    prisma.fieldChange.count(),
    prisma.loginEvent.count(),
    prisma.user.count(),
    prisma.cargoPhoto.count(),
  ]);
  const oldest = await prisma.auditLog.findFirst({ orderBy: { createdAt: "asc" }, select: { createdAt: true } });
  return {
    rows: [
      { name: "Customers", count: customers },
      { name: "Cargo consignments", count: cargo },
      { name: "Package lines", count: packages },
      { name: "Boxes with a label", count: boxes },
      { name: "Cargo photos", count: photos },
      { name: "Containers", count: containers },
      { name: "Invoices", count: invoices },
      { name: "Payments", count: payments },
      { name: "Receipts", count: receipts },
      { name: "Accounts (staff and customers)", count: users },
      { name: "Audit lines", count: audit },
      { name: "Field changes (before and after)", count: fieldChanges },
      { name: "Sign-in attempts", count: logins },
    ],
    since: oldest?.createdAt ?? null,
  };
}
