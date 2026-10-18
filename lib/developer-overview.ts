import "server-only";

import { darDay } from "@/lib/income";
import { prisma } from "@/lib/prisma";

/**
 * THE CONTROL ROOM, READ OFF WHAT HAS ACTUALLY HAPPENED.
 *
 * Health, people and what was done, in one place for the developer. Every
 * figure is counted from the audit log, the sign-in log and the accounts — none
 * is kept, so none can drift from what the screens it summarises say.
 */

const DAY = 86_400_000;

export type Finding = {
  key: string;
  tone: "fix" | "look" | "info";
  title: string;
  detail: string;
  /** Where to go and deal with it — the developer's permissions open any screen. */
  href?: string;
  /** What to do about it, in plain words. */
  fix?: string;
  /** Plain examples behind a count — the first few of what is wrong. */
  lines?: string[];
  /** The individual things behind a count, so the card says what they are. */
  items?: { title: string; body: string | null; who: string; whoId: string; role: string; age: string; href: string | null }[];
};

/** Which group a role belongs to on the sign-in chart. */
export const ROLE_GROUP = {
  ADMIN: "Owner",
  MANAGER: "Manager",
  FINANCE: "Finance",
  CHINA_WAREHOUSE: "Guangzhou",
  DAR_WAREHOUSE: "Dar",
  CUSTOMER_SUPPORT: "Support",
  DEVELOPER: "Developer",
  CUSTOMER: "Customers",
} as const;
export const GROUPS = ["Owner", "Manager", "Finance", "Guangzhou", "Dar", "Support", "Customers", "Developer"] as const;
export type Group = (typeof GROUPS)[number];

export async function developerOverview(): Promise<{
  score: number;
  counts: { fix: number; look: number; info: number };
  findings: Finding[];
  db: { ok: boolean; ms: number };
  signedInToday: number;
  actionsToday: number;
  errors24: number;
  signinsPerDay: { day: string; label: string; by: Partial<Record<Group, number>>; total: number }[];
  actionsPerDay: { day: string; label: string; team: number; developer: number }[];
  hours: number[];
  areas: { name: string; count: number }[];
  recent: { name: string; role: string; ip: string | null; device: string; at: Date }[];
  active: { name: string; count: number }[];
  idle: { name: string; role: string; last: Date | null }[];
}> {
  const now = Date.now();
  const since14 = new Date(now - 14 * DAY);
  const since7 = new Date(now - 7 * DAY);
  const since24 = new Date(now - DAY);

  const t0 = Date.now();
  let dbOk = true;
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    dbOk = false;
  }
  const ms = Date.now() - t0;

  const [logins, actions, recent, unread, failedDev, pending, idleUsers, statusSplit, errors24] = await Promise.all([
    prisma.loginEvent.findMany({
      where: { ok: true, createdAt: { gte: since14 } },
      select: { createdAt: true, userId: true, user: { select: { role: true } } },
    }),
    prisma.auditLog.findMany({
      where: { createdAt: { gte: since14 }, action: { not: { startsWith: "developer.activity" } } },
      select: { createdAt: true, actorType: true, actorName: true, entity: true },
    }),
    prisma.loginEvent.findMany({
      where: { ok: true },
      orderBy: { createdAt: "desc" },
      take: 12,
      select: { createdAt: true, ipAddress: true, userAgent: true, user: { select: { name: true, role: true } } },
    }),
    prisma.notification.findMany({
      where: { readAt: null, user: { role: { notIn: ["CUSTOMER", "DEVELOPER"] } } },
      orderBy: { createdAt: "asc" },
      select: { createdAt: true, title: true, body: true, href: true, user: { select: { id: true, name: true, role: true } } },
    }),
    prisma.loginEvent.count({
      where: { ok: false, createdAt: { gte: since24 }, user: { role: "DEVELOPER" } },
    }),
    prisma.user.count({ where: { status: "SUSPENDED", role: { notIn: ["CUSTOMER"] } } }),
    prisma.user.findMany({
      where: { active: true, status: "ACTIVE", role: { notIn: ["CUSTOMER", "DEVELOPER"] } },
      select: { name: true, role: true, lastLoginAt: true },
    }),
    prisma.user.count({ where: { role: { notIn: ["CUSTOMER", "DEVELOPER"] }, active: true, status: "ACTIVE" } }),
    prisma.systemEvent.count({ where: { kind: "ERROR", createdAt: { gte: since24 } } }),
  ]);
  void statusSplit;
  void pending;
  void unread;

  /* The last fourteen Dar days, oldest first, so a chart reads left to right. */
  const days = Array.from({ length: 14 }, (_, i) => darDay(new Date(now - (13 - i) * DAY)));
  const label = (d: string) =>
    new Date(`${d}T12:00:00+03:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Africa/Dar_es_Salaam" });

  const signinsPerDay = days.map((day) => {
    const by: Partial<Record<Group, number>> = {};
    let total = 0;
    for (const l of logins) {
      if (darDay(l.createdAt) !== day) continue;
      const g = ROLE_GROUP[l.user?.role ?? "CUSTOMER"] as Group;
      by[g] = (by[g] ?? 0) + 1;
      total++;
    }
    return { day, label: label(day), by, total };
  });
  const actionsPerDay = days.map((day) => {
    const list = actions.filter((a) => darDay(a.createdAt) === day);
    const developer = list.filter((a) => a.actorType === "DEVELOPER").length;
    return { day, label: label(day), team: list.length - developer, developer };
  });

  const hours = Array.from({ length: 24 }, () => 0);
  for (const a of actions) {
    const h = Number(a.createdAt.toLocaleString("en-GB", { hour: "2-digit", hour12: false, timeZone: "Africa/Dar_es_Salaam" })) % 24;
    hours[h]++;
  }

  const areaCount = new Map<string, number>();
  for (const a of actions.filter((a) => a.createdAt >= since7)) areaCount.set(a.entity, (areaCount.get(a.entity) ?? 0) + 1);
  const areas = [...areaCount].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 8);

  const people = new Map<string, number>();
  for (const a of actions.filter((a) => a.createdAt >= since7 && a.actorType === "STAFF" && a.actorName)) {
    people.set(a.actorName!, (people.get(a.actorName!) ?? 0) + 1);
  }
  const active = [...people].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 6);

  const device = (ua: string | null) => {
    const u = ua ?? "";
    const browser = /Edg\//.test(u) ? "Edge" : /Firefox\//.test(u) ? "Firefox" : /Chrome\//.test(u) ? "Chrome" : /Safari\//.test(u) ? "Safari" : "Browser";
    const os = /Android/.test(u) ? "Android" : /iPhone|iPad/.test(u) ? "iPhone" : /Mac OS/.test(u) ? "Mac" : /Windows/.test(u) ? "Windows" : "—";
    return `${browser} · ${os}`;
  };

  const alertsOverDay = unread.filter((n) => now - n.createdAt.getTime() > DAY).length;
  const idle = idleUsers
    .filter((u) => !u.lastLoginAt || now - u.lastLoginAt.getTime() > 30 * DAY)
    .map((u) => ({ name: u.name, role: u.role, last: u.lastLoginAt }))
    .sort((a, b) => (a.last?.getTime() ?? 0) - (b.last?.getTime() ?? 0))
    .slice(0, 6);

  const findings: Finding[] = [];
  if (!dbOk) findings.push({ key: "db", tone: "fix", title: "The database is not answering", detail: "Nothing can be saved until it is back. Check the database provider." });
  else if (ms > 800) findings.push({ key: "slow", tone: "look", title: `The database is slow (${ms} ms)`, detail: "Pages may feel sluggish. If it stays this way, check the provider's status." });
  if (failedDev > 0)
    findings.push({
      key: "devfail",
      tone: failedDev >= 4 ? "look" : "info",
      title: `${failedDev} failed developer sign-in${failedDev === 1 ? "" : "s"} in 24 hours`,
      detail: "Wrong-password tries on your own account. After 10 wrong tries for one address it locks for 15 minutes.",
    });
  const counts = {
    fix: findings.filter((f) => f.tone === "fix").length,
    look: findings.filter((f) => f.tone === "look").length,
    info: findings.filter((f) => f.tone === "info").length,
  };
  const score = Math.max(0, Math.min(100, 100 - counts.fix * 35 - counts.look * 15 - Math.min(counts.info, 3) * 2));

  const todayKey = darDay(new Date());
  const signedInToday = new Set(logins.filter((l) => darDay(l.createdAt) === todayKey && l.userId).map((l) => l.userId)).size;
  const actionsToday = actions.filter((a) => darDay(a.createdAt) === todayKey).length;

  return {
    score,
    counts,
    findings,
    db: { ok: dbOk, ms },
    signedInToday,
    actionsToday,
    errors24,
    signinsPerDay,
    actionsPerDay,
    hours,
    areas,
    recent: recent.map((r) => ({
      name: r.user?.name ?? "—",
      role: r.user?.role ?? "",
      ip: r.ipAddress,
      device: device(r.userAgent),
      at: r.createdAt,
    })),
    active,
    idle,
  };
}
