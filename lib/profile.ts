import "server-only";

import { BUSINESS_TZ, formatDateTime, toNumber } from "@/lib/format";
import { t, type Locale } from "@/lib/i18n";
import { prisma } from "@/lib/prisma";

/**
 * Everything an employee's profile shows.
 *
 * All of it is derived — nothing here is a counter that some action has to
 * remember to increment. A tally kept by hand drifts the first time a receiving
 * is corrected or a consignment reassigned, and a profile that overstates
 * somebody's work is worse than no profile at all.
 *
 * Scoped to one person by `userId` in every query. There is no path here that
 * widens to another employee without the caller passing their id, and only a
 * `user.manage` route does that.
 */

export type ProfileStats = {
  chinaReceived: number;
  cbmReceived: number;
  darCheckedIn: number;
  containersTouched: number;
};

export async function profileStats(userId: string): Promise<ProfileStats> {
  const [china, dar, containers] = await Promise.all([
    prisma.chinaReceiving.aggregate({
      where: { receivedById: userId },
      _count: true,
      _sum: { cbm: true },
    }),
    prisma.darReceiving.count({ where: { receivedById: userId } }),
    prisma.containerEvent.findMany({
      where: { actorId: userId },
      select: { containerId: true },
      distinct: ["containerId"],
    }),
  ]);

  return {
    chinaReceived: china._count,
    cbmReceived: toNumber(china._sum.cbm) ?? 0,
    darCheckedIn: dar,
    containersTouched: containers.length,
  };
}

export type ActivityEntry = {
  id: string;
  action: string;
  summary: string;
  dateLabel: string;
  timeLabel: string;
};

const dayFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: BUSINESS_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const clockFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: BUSINESS_TZ,
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});
const barFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: BUSINESS_TZ,
  day: "numeric",
  month: "short",
});
const longDayFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: BUSINESS_TZ,
  day: "numeric",
  month: "short",
  year: "numeric",
});

/** The Dar calendar day, as YYYY-MM-DD — a Dar shift ends at midnight in Dar. */
function dayKey(date: Date) {
  return dayFmt.format(date);
}

/**
 * What this person did, most recent first.
 *
 * Read straight off the audit log rather than reconstructed from the records,
 * so an edit that was later undone still shows — the timeline is a record of
 * actions, not of the current state.
 */
export async function profileActivity(userId: string, take = 20): Promise<ActivityEntry[]> {
  const rows = await prisma.auditLog.findMany({
    where: { actorId: userId },
    orderBy: { createdAt: "desc" },
    take,
    select: { id: true, action: true, summary: true, createdAt: true },
  });

  return rows.map((row) => ({
    id: row.id,
    action: row.action,
    summary: row.summary,
    dateLabel: longDayFmt.format(row.createdAt),
    timeLabel: clockFmt.format(row.createdAt),
  }));
}

export type DailyPoint = { label: string; actions: number };

/**
 * The last fourteen days, one bar each — including the empty ones.
 *
 * Counted off the audit log, so every desk has a chart: a Finance clerk
 * receives no cargo but verifies payments, and both are lines in the log.
 * Signing in is not work and is left out. Days with nothing on them are the
 * point: a run of blanks is what a trend looks like before anyone calls it one.
 */
export async function dailyActivity(userId: string, days = 14): Promise<DailyPoint[]> {
  const now = new Date();
  const keys: string[] = [];
  const labels = new Map<string, string>();
  for (let i = days - 1; i >= 0; i -= 1) {
    const day = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    const key = dayKey(day);
    keys.push(key);
    labels.set(key, barFmt.format(day));
  }

  // A day of slack on the lower bound, so the first Dar day is whole
  // whatever the server's own clock zone; the bucket key does the exact cut.
  const from = new Date(now.getTime() - (days + 1) * 24 * 60 * 60 * 1000);
  const rows = await prisma.auditLog.findMany({
    where: { actorId: userId, createdAt: { gte: from }, action: { not: "auth.login" } },
    select: { createdAt: true },
  });

  const counts = new Map(keys.map((key) => [key, 0]));
  for (const row of rows) {
    const key = dayKey(row.createdAt);
    const current = counts.get(key);
    if (current !== undefined) counts.set(key, current + 1);
  }

  return keys.map((key) => ({ label: labels.get(key) ?? key, actions: counts.get(key) ?? 0 }));
}

/** Sign-in history, for the manager's view of an account. */
export async function loginHistory(userId: string, take = 12, locale: Locale = "en") {
  const rows = await prisma.loginEvent.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take,
    select: { id: true, ok: true, ipAddress: true, userAgent: true, createdAt: true },
  });
  return rows.map((row) => ({
    id: row.id,
    ok: row.ok,
    ipAddress: row.ipAddress,
    device: shortDevice(row.userAgent, locale),
    atLabel: formatDateTime(row.createdAt),
  }));
}

/** A user agent string is unreadable; the browser and platform are enough. */
function shortDevice(agent: string | null, locale: Locale) {
  if (!agent) return t(locale, "Unknown device");
  const platform = /android/i.test(agent)
    ? "Android"
    : /iphone|ipad/i.test(agent)
      ? "iOS"
      : /windows/i.test(agent)
        ? "Windows"
        : /mac os/i.test(agent)
          ? "Mac"
          : t(locale, "Unknown");
  const browser = /edg\//i.test(agent)
    ? "Edge"
    : /chrome/i.test(agent)
      ? "Chrome"
      : /safari/i.test(agent)
        ? "Safari"
        : /firefox/i.test(agent)
          ? "Firefox"
          : t(locale, "Browser");
  return t(locale, "{browser} on {platform}")
    .replace("{browser}", browser)
    .replace("{platform}", platform);
}

/**
 * Someone is "online" if the app has heard from them in the last five minutes.
 *
 * There is no socket and no heartbeat — `lastActiveAt` is touched on activity.
 * Five minutes is long enough that reading one long page does not turn someone
 * grey, and short enough that it means something.
 */
export function isOnline(lastActiveAt: Date | null) {
  if (!lastActiveAt) return false;
  return Date.now() - lastActiveAt.getTime() < 5 * 60 * 1000;
}
