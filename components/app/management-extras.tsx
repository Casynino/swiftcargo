import Link from "next/link";
import { Anchor, BadgePercent, Boxes, CalendarClock, UserCog, Users, Warehouse } from "lucide-react";

import { ActivityFeed } from "@/components/app/activity-feed";
import { DeskPulsePanel } from "@/components/app/desk-pulse";
import { KpiCard } from "@/components/app/kpi-card";
import { SectionLabel } from "@/components/app/section-label";
import { BarChart } from "@/components/charts/bar-chart";
import { Donut, DonutLegend, SWATCHES, type DonutSlice } from "@/components/charts/donut";
import { formatCurrency } from "@/lib/currency";
import { darFields, darMidnight, darStartOfWeek } from "@/lib/dar-time";
import { figures, loadBooks, monthRange, periodRange } from "@/lib/finance-report";
import { t, type Locale } from "@/lib/i18n";
import type { InsightTone, ManagerOverview } from "@/lib/manager-overview";
import { prisma } from "@/lib/prisma";
import { cn } from "@/lib/utils";

const DAY = 86_400_000;
const Card = ({ className, children }: { className?: string; children: React.ReactNode }) => (
  <section className={cn("min-w-0 rounded-xl border bg-card p-5 shadow-soft", className)}>{children}</section>
);

/**
 * THE MONTH READ CLOSER, WHERE THE MONEY CAME IN, AND THE BOXES AT SEA.
 *
 * Read off the same books as Profit and loss (`loadBooks` / `figures`), so a
 * figure here is the figure there. Nothing is stored; a month with nothing in
 * it prints a dash, never a zero that looks like a result.
 */
export async function ManagementMoneyExtras({ o, locale }: { o: ManagerOverview; locale: Locale }) {
  const tr = (text: string) => t(locale, text);
  const money = (n: number) => formatCurrency(Math.round(n), "TZS");
  const [books, onWater] = await Promise.all([
    loadBooks(),
    prisma.container.findMany({
      where: { status: { in: ["DEPARTED", "IN_TRANSIT"] }, deletedAt: null },
      select: { id: true, reference: true, containerNumber: true, shipment: { select: { vessel: true, departureDate: true, eta: true } } },
      orderBy: { shipment: { eta: "asc" } },
      take: 8,
    }),
  ]);

  const { current, previous } = periodRange("month");
  const now = figures(books, current);
  const before = figures(books, previous);
  const change = (a: { tzs: number }, b: { tzs: number }) => (Math.abs(b.tzs) > 0.5 ? ((a.tzs - b.tzs) / Math.abs(b.tzs)) * 100 : undefined);
  const lastMonth = (m: { tzs: number }) => `${tr("last month")} ${money(m.tzs)}`;

  const here = darFields(new Date());
  const year = Array.from({ length: 12 }, (_, i) => {
    const civil = darFields(darMidnight(here.year, here.month - 11 + i, 1));
    const f = figures(books, monthRange(civil.year, civil.month));
    return {
      perCbm: f.cbmBilled > 0.0005 ? f.billed.tzs / f.cbmBilled : 0,
      discounts: f.writtenOff.tzs,
      storage: f.storage.tzs,
      creditShare: f.revenue.tzs > 0.5 ? (f.creditRevenue.tzs / f.revenue.tzs) * 100 : 0,
    };
  });

  const perCbm = (f: { billed: { tzs: number }; cbmBilled: number }) => (f.cbmBilled > 0.0005 ? f.billed.tzs / f.cbmBilled : null);
  const perCbmNow = perCbm(now);
  const perCbmBefore = perCbm(before);
  const creditShare = now.revenue.tzs > 0.5 ? (now.creditRevenue.tzs / now.revenue.tzs) * 100 : null;

  const billSlices: DonutSlice[] = [
    { label: tr("Paid"), value: now.counts.paid, tone: 5 },
    { label: tr("Part paid"), value: now.counts.partPaid, tone: 4 },
    { label: tr("Not paid"), value: now.counts.unpaid, tone: 3 },
  ];
  const billsTotal = billSlices.reduce((s, b) => s + b.value, 0);

  const byAccount = new Map<string, number>();
  for (const m of now.money) byAccount.set(m.account, (byAccount.get(m.account) ?? 0) + m.amount.tzs);
  const accountRows = [...byAccount.entries()].sort((a, b) => b[1] - a[1]);
  const inSlices: DonutSlice[] = [
    ...accountRows.slice(0, 4).map(([label, value], i) => ({ label, value, tone: ([1, 2, 5, 4] as const)[i] })),
    ...(accountRows.length > 4 ? [{ label: tr("Other accounts"), value: accountRows.slice(4).reduce((s, [, v]) => s + v, 0), tone: 6 as const }] : []),
  ];
  const inTotal = inSlices.reduce((s, x) => s + x.value, 0);

  const weeks = Array.from({ length: 8 }, (_, i) => {
    const from = darStartOfWeek(new Date(), i - 7);
    const to = new Date(from.getTime() + 7 * DAY);
    const value = books.money.filter((m) => m.at >= from && m.at < to).reduce((s, m) => s + m.amount.tzs, 0);
    return { label: from.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Africa/Dar_es_Salaam" }), value };
  });

  const today = Date.now();
  const sea = onWater.map((c) => {
    const dep = c.shipment?.departureDate ?? null;
    const eta = c.shipment?.eta ?? null;
    const span = dep && eta ? eta.getTime() - dep.getTime() : 0;
    const pct = span > 0 ? Math.max(0, Math.min(100, ((today - dep!.getTime()) / span) * 100)) : null;
    const daysLeft = eta ? Math.ceil((eta.getTime() - today) / DAY) : null;
    return { id: c.id, name: c.containerNumber ?? c.reference, vessel: c.shipment?.vessel ?? null, eta, pct, daysLeft };
  });

  return (
    <>
      <div>
        <SectionLabel action={{ href: "/app/finance/reports", label: tr("Profit & loss") }}>{tr("The month, read closer")}</SectionLabel>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-4">
          <KpiCard index={0} label={tr("Billed per CBM")} value={perCbmNow === null ? "—" : money(perCbmNow)}
            delta={perCbmNow !== null && perCbmBefore ? ((perCbmNow - perCbmBefore) / perCbmBefore) * 100 : undefined}
            hint={perCbmBefore === null ? tr("nothing billed last month") : `${tr("last month")} ${money(perCbmBefore)}`}
            trend={year.map((m) => m.perCbm)} icon={Boxes} tone="brand" />
          <KpiCard index={1} label={tr("Released on credit")} value={creditShare === null ? "—" : `${Math.round(creditShare)}%`}
            hint={`${money(now.creditRevenue.tzs)} ${tr("of this month's billing")}`}
            trend={year.map((m) => m.creditShare)} icon={CalendarClock} tone={(creditShare ?? 0) > 40 ? "warning" : "marine"} href="/app/finance/credit" />
          <KpiCard index={2} label={tr("Discounts given")} value={money(now.writtenOff.tzs)}
            delta={change(now.writtenOff, before.writtenOff)} deltaGood={false} hint={lastMonth(before.writtenOff)}
            trend={year.map((m) => m.discounts)} icon={BadgePercent} tone="warning" />
          <KpiCard index={3} label={tr("Storage charged")} value={money(now.storage.tzs)}
            delta={change(now.storage, before.storage)} hint={lastMonth(before.storage)}
            trend={year.map((m) => m.storage)} icon={Warehouse} tone="marine" />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card>
          <h2 className="font-semibold">{tr("This month's bills")}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">{tr("Every bill raised this month, by where it stands")}</p>
          {billsTotal === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">{tr("Nothing billed this month yet")}</p>
          ) : (
            <>
              <div className="mt-3 flex justify-center">
                <Donut size={118} stroke={18} label={String(billsTotal)} caption={tr("bills")} slices={billSlices} />
              </div>
              <div className="mt-3"><DonutLegend slices={billSlices} /></div>
            </>
          )}
          {now.counts.toVerify > 0 ? (
            <p className="mt-3 border-t pt-2 text-xs text-muted-foreground">
              <span className="font-semibold text-warning">{now.counts.toVerify}</span> {tr("with a payment waiting for Finance to verify")}
            </p>
          ) : null}
        </Card>

        <Card>
          <h2 className="font-semibold">{tr("Where the money came in")}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">{tr("Verified payments this month, by account")}</p>
          {inTotal <= 0.5 ? (
            <p className="mt-3 text-sm text-muted-foreground">{tr("No payment verified this month yet")}</p>
          ) : (
            <>
              <div className="mt-3 flex justify-center">
                <Donut size={118} stroke={18} slices={inSlices} />
              </div>
              <ul className="mt-3 space-y-2">
                {inSlices.map((slice) => (
                  <li key={slice.label} className="flex items-center gap-2 text-sm">
                    <span className={cn("size-2 shrink-0 rounded-full", SWATCHES[slice.tone])} />
                    <span className="min-w-0 flex-1 truncate">{slice.label}</span>
                    <span className="tnum shrink-0 font-semibold">{money(slice.value)}</span>
                    <span className="tnum w-10 shrink-0 text-right text-xs text-muted-foreground">{Math.round((slice.value / inTotal) * 100)}%</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>

        <Card>
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h2 className="font-semibold">{tr("Collected, week by week")}</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">{tr("Verified money in, the last eight weeks")}</p>
            </div>
            <p className="tnum shrink-0 text-right text-sm font-semibold text-success">{money(weeks[weeks.length - 1]?.value ?? 0)}</p>
          </div>
          <BarChart className="mt-4" data={weeks} tone={5} highlightIndex={weeks.length - 1} formatValue={money} height={180} />
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card>
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h2 className="font-semibold">{tr("On the water")}</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">{tr("Containers at sea, the soonest due first")}</p>
            </div>
            <Link href="/app/containers" className="shrink-0 text-xs font-semibold text-brand hover:underline">{tr("Every container")}</Link>
          </div>
          {sea.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">{tr("No container is at sea right now.")}</p>
          ) : (
            <ul className="mt-3 divide-y">
              {sea.map((box) => (
                <li key={box.id}>
                  <Link href={`/app/containers/${box.id}`} className="block py-2.5 hover:opacity-80">
                    <div className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="flex min-w-0 items-center gap-2">
                        <Anchor className="size-3.5 shrink-0 text-brand" />
                        <span className="truncate font-medium">{box.name}</span>
                        {box.vessel ? <span className="truncate text-xs text-muted-foreground">· {box.vessel}</span> : null}
                      </span>
                      <span className={cn("tnum shrink-0 text-xs font-semibold", box.daysLeft === null ? "text-muted-foreground" : box.daysLeft < 0 ? "text-destructive" : box.daysLeft <= 3 ? "text-warning" : "text-foreground")}>
                        {box.daysLeft === null
                          ? tr("no arrival date")
                          : box.daysLeft < 0
                            ? `${Math.abs(box.daysLeft)}${tr("d")} ${tr("late")}`
                            : box.daysLeft === 0
                              ? tr("due today")
                              : `${box.daysLeft}${tr("d")} ${tr("to go")}`}
                      </span>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                      <div className={cn("h-full rounded-full", box.daysLeft !== null && box.daysLeft < 0 ? "bg-destructive" : "bg-brand")} style={{ width: `${box.pct ?? 0}%` }} />
                    </div>
                    {box.eta ? (
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        {tr("Due")} {box.eta.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Africa/Dar_es_Salaam" })}
                      </p>
                    ) : null}
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 border-t pt-2 text-xs text-muted-foreground">
            {tr("Loading in Guangzhou")} <span className="tnum font-semibold text-foreground">{o.operations.containersLoading}</span>
            {" · "}
            {tr("Arrived, not finished")} <span className="tnum font-semibold text-foreground">{o.operations.containersArrived}</span>
          </p>
        </Card>

        <Card>
          <h2 className="font-semibold">{tr("What each sailing carried")}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">{tr("CBM on each container that has sailed, oldest first")}</p>
          {o.carried.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">{tr("Nothing has sailed yet.")}</p>
          ) : (
            <BarChart className="mt-4" data={o.carried} tone={1} highlightIndex={o.carried.length - 1} formatValue={(n) => `${n.toFixed(2)} CBM`} height={200} />
          )}
        </Card>
      </div>
    </>
  );
}

const BRIEF_DOT: Record<InsightTone, string> = {
  good: "bg-success",
  warn: "bg-warning",
  bad: "bg-destructive",
  neutral: "bg-muted-foreground",
};

/** EVERY DESK RIGHT NOW, THE PEOPLE, THE BRIEFING AND WHAT THE COMPANY DID. */
export function ManagementCompanyExtras({ o, locale }: { o: ManagerOverview; locale: Locale }) {
  const tr = (text: string) => t(locale, text);
  const customers = o.company.customers;
  const staff = o.company.staff;
  return (
    <>
      <section>
        <SectionLabel action={{ href: "/app/manager/control", label: tr("Control room") }}>{tr("Every desk, right now")}</SectionLabel>
        <DeskPulsePanel desks={o.desks} locale={locale} />
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card>
          <div className="flex items-center gap-2">
            <Users className="size-4 text-brand" />
            <h2 className="font-semibold">{tr("Customers")}</h2>
          </div>
          <p className="tnum mt-3 text-3xl font-bold">{customers.total.toLocaleString()}</p>
          <p className="text-xs text-muted-foreground">{tr("on the books")}</p>
          <dl className="mt-3 divide-y">
            {[
              { k: tr("New this month"), v: customers.newThisMonth, cls: "text-success" },
              { k: tr("Waiting for a reply"), v: customers.awaitingReply, cls: customers.awaitingReply > 0 ? "text-warning" : "text-foreground" },
              { k: tr("Past due on credit"), v: customers.overdueOnCredit, cls: customers.overdueOnCredit > 0 ? "text-destructive" : "text-foreground" },
            ].map((row) => (
              <div key={row.k} className="flex items-baseline justify-between gap-3 py-2">
                <dt className="text-sm text-muted-foreground">{row.k}</dt>
                <dd className={cn("tnum text-base font-bold", row.cls)}>{row.v}</dd>
              </div>
            ))}
          </dl>
        </Card>

        <Card>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <UserCog className="size-4 text-brand" />
              <h2 className="font-semibold">{tr("Staff")}</h2>
            </div>
            <Link href="/app/admin/users" className="text-xs font-semibold text-brand hover:underline">{tr("Staff")}</Link>
          </div>
          <div className="mt-3 flex items-end gap-6">
            <div>
              <p className="tnum text-3xl font-bold">{staff.total}</p>
              <p className="text-xs text-muted-foreground">{tr("accounts")}</p>
            </div>
            <div>
              <p className="tnum text-xl font-bold text-success">{staff.seenToday}</p>
              <p className="text-xs text-muted-foreground">{tr("in today")}</p>
            </div>
            {staff.suspended > 0 ? (
              <div>
                <p className="tnum text-xl font-bold text-warning">{staff.suspended}</p>
                <p className="text-xs text-muted-foreground">{tr("suspended")}</p>
              </div>
            ) : null}
          </div>
          <ul className="mt-4 space-y-2">
            {staff.byDepartment.slice(0, 6).map((d) => (
              <li key={d.department}>
                <div className="flex items-baseline justify-between gap-3 text-xs">
                  <span className="truncate text-muted-foreground">{tr(d.label)}</span>
                  <span className="tnum font-semibold">{d.count}</span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-brand/70" style={{ width: `${staff.total ? (d.count / staff.total) * 100 : 0}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <h2 className="font-semibold">{tr("The briefing")}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">{tr("What moved, in a sentence each")}</p>
          {o.insights.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">{tr("Nothing worth a line today.")}</p>
          ) : (
            <ul className="mt-3 divide-y">
              {o.insights.map((item) => (
                <li key={item.id}>
                  <Link href={item.href} className="flex items-start gap-2.5 py-2.5 text-sm hover:opacity-80">
                    <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", BRIEF_DOT[item.tone])} />
                    <span className="min-w-0 flex-1 leading-snug">{item.text}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <ActivityFeed
        locale={locale}
        entries={o.activity.map((entry) => ({
          id: entry.id,
          action: entry.action,
          summary: entry.summary,
          createdAt: entry.createdAt,
          actorName: entry.actor?.name ?? entry.actorEmail ?? null,
        }))}
        title={tr("Company activity")}
        description={tr("Every privileged action, newest first")}
        href="/app/admin/audit"
      />
    </>
  );
}
