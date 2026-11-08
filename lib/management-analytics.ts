import "server-only";

import { prisma } from "@/lib/prisma";
import { darFields, darStartOfMonth, darStartOfWeek } from "@/lib/dar-time";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const OPEN_CASE = ["OPEN", "INVESTIGATING", "WAITING_CUSTOMER", "WAITING_FINANCE", "WAITING_WAREHOUSE", "ESCALATED"] as const;

/**
 * THE OWNER'S EXTRA READING OF THE BUSINESS.
 *
 * Counts only, read straight off the tables the desks write — nothing here is
 * stored, estimated or typed in, and none of it is money, so it cannot disagree
 * with the books. Each figure is a way of asking "is it growing, where is it
 * stuck, who is it for".
 */
export async function managementAnalytics() {
  const now = new Date();
  const weekStarts = Array.from({ length: 12 }, (_, i) => darStartOfWeek(now, i - 11));
  const monthStarts = Array.from({ length: 12 }, (_, i) => darStartOfMonth(now, i - 11));
  const yearStart = new Date(Date.UTC(darFields(now).year, 0, 1) - 3 * 3600 * 1000);

  const [recent, byService, containerStatus, receivers, newCustomers, openCases, totalCustomers] = await Promise.all([
    prisma.cargo.findMany({ where: { deletedAt: null, createdAt: { gte: weekStarts[0] } }, select: { createdAt: true } }),
    prisma.cargo.groupBy({ by: ["service"], where: { deletedAt: null }, _count: { _all: true } }),
    prisma.container.groupBy({ by: ["status"], where: { deletedAt: null }, _count: { _all: true } }),
    prisma.cargo.groupBy({
      by: ["receiverId"],
      where: { deletedAt: null, createdAt: { gte: yearStart } },
      _count: { _all: true },
      orderBy: { _count: { receiverId: "desc" } },
      take: 6,
    }),
    prisma.customer.findMany({ where: { deletedAt: null, createdAt: { gte: monthStarts[0] } }, select: { createdAt: true } }),
    prisma.exceptionCase.groupBy({ by: ["type"], where: { status: { in: [...OPEN_CASE] } }, _count: { _all: true } }),
    prisma.customer.count({ where: { deletedAt: null } }),
  ]);

  const names = receivers.length
    ? await prisma.customer.findMany({
        where: { id: { in: receivers.map((r) => r.receiverId) } },
        select: { id: true, fullName: true, businessName: true },
      })
    : [];
  const nameOf = new Map(names.map((c) => [c.id, c.businessName || c.fullName]));

  const bucket = (starts: Date[], dates: Date[]) =>
    starts.map((start, i) => {
      const end = starts[i + 1]?.getTime() ?? Infinity;
      return dates.filter((d) => d.getTime() >= start.getTime() && d.getTime() < end).length;
    });

  const weekly = bucket(weekStarts, recent.map((c) => c.createdAt));
  const monthly = bucket(monthStarts, newCustomers.map((c) => c.createdAt));

  return {
    intakeWeeks: weekStarts.map((start, i) => ({
      label: `${darFields(start).day} ${MONTHS[darFields(start).month]}`,
      value: weekly[i],
    })),
    service: {
      lcl: byService.find((s) => s.service === "LCL")?._count._all ?? 0,
      fcl: byService.find((s) => s.service === "FCL")?._count._all ?? 0,
    },
    containers: containerStatus.map((c) => ({ status: c.status as string, count: c._count._all })),
    topReceivers: receivers.map((r) => ({ name: nameOf.get(r.receiverId) ?? "—", count: r._count._all })),
    customerGrowth: monthStarts.map((start, i) => ({ label: MONTHS[darFields(start).month], value: monthly[i] })),
    totalCustomers,
    openCases: openCases.map((c) => ({ type: c.type as string, count: c._count._all })).sort((a, b) => b.count - a.count),
  };
}
