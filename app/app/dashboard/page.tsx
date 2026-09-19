import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import * as Icons from "lucide-react";
import { ArrowRight } from "lucide-react";

import { ActionPills } from "@/components/app/action-pills";
import { AttentionCenter } from "@/components/app/attention-center";
import { CommandCentre } from "@/components/app/command-centre";
import { DeskHero } from "@/components/app/desk-hero";
import { KpiCard } from "@/components/app/kpi-card";
import { MoneyTile } from "@/components/app/money-tile";
import { FinanceHome } from "@/components/app/finance-home";
import { SectionLabel } from "@/components/app/section-label";
import { AgeingBar } from "@/components/charts/ageing-bar";
import { AreaChart } from "@/components/charts/area-chart";
import { BarChart } from "@/components/charts/bar-chart";
import { Donut, DonutLegend, type DonutSlice } from "@/components/charts/donut";
import { FlowBars } from "@/components/charts/flow-bars";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  PackagePlus,
  Ship,
  Warehouse,
} from "lucide-react";
import {
  attentionItems,
  cargoPosition,
  chinaAgeing,
  chinaContainers,
  chinaFloor,
  chinaFlow,
  chinaMix,
  chinaVolumeByMonth,
  myActivity,
  companyOverview,
  dashboardFor,
  monthlyVolume,
  moneyPosition,
  receivablesAgeing,
  recentActivity,
  revenueTrend,
  warehouseFlow,
  type ActionCard,
} from "@/lib/dashboard";
import { CONTAINER_STATUS_LABELS, ROLE_LABELS, ROUTE } from "@/lib/constants";
import { pillsFor, subtitleFor } from "@/lib/desk";
import { formatDate, formatMoney, formatRelative } from "@/lib/format";
import { can } from "@/lib/rbac";
import { requireStaff } from "@/lib/session";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Dashboard" };

function Glyph({ name, className }: { name: string; className?: string }) {
  const Icon = (
    Icons as unknown as Record<string, React.ComponentType<{ className?: string }>>
  )[name];
  return Icon ? <Icon className={className} /> : null;
}

/**
 * A queue, with a way into it.
 *
 * Zero is rendered as plainly as forty — an empty queue is good news and should
 * read as calm, not as a broken tile. Only a non-empty urgent queue takes the
 * signal colour, so that when something IS orange it means something.
 */
function QueueCard({ card, index }: { card: ActionCard; index: number }) {
  const loud = card.urgent && card.count > 0;

  return (
    <Link href={card.href} className="focus-ring group block rounded-xl">
      <div
        className={cn(
          "animate-in-up relative h-full overflow-hidden rounded-xl border bg-card p-5 shadow-soft transition-all hover:-translate-y-0.5 hover:shadow-raised",
          loud && "border-signal/35"
        )}
        style={{ animationDelay: `${index * 45}ms` }}
      >
        {loud ? (
          <span aria-hidden className="absolute inset-x-0 top-0 h-0.5 bg-signal" />
        ) : null}

        <div className="flex items-start justify-between gap-3">
          <span
            className={cn(
              "grid size-9 place-items-center rounded-lg",
              loud ? "bg-signal/12 text-signal" : "bg-brand/10 text-brand"
            )}
          >
            <Glyph name={card.icon} className="size-4" />
          </span>
          <ArrowRight className="size-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
        </div>

        <p
          className={cn(
            "tnum mt-4 text-[30px] font-semibold leading-none tracking-tight",
            loud ? "text-signal" : "text-foreground"
          )}
        >
          {card.count}
        </p>
        <p className="mt-1.5 text-sm font-medium">{card.label}</p>
        {card.hint ? (
          <p className="mt-1 text-xs text-muted-foreground">{card.hint}</p>
        ) : null}
      </div>
    </Link>
  );
}

export default async function DashboardPage() {
  const user = await requireStaff();

  /* Support has a home of its own too: who is waiting on an answer and who owes
     a call, rather than the warehouse's floor charts. */
  if (user.role === "CUSTOMER_SUPPORT") redirect("/app/support");

  /* The manager's home is the whole business on one screen, and it lives at
     /app/manager so the sidebar and the landing page are the same place. */
  if (user.role === "MANAGER") redirect("/app/manager");

  /* The owner's home is the command centre itself, on this address, reading
     the same object the manager's does. The owner asked to see at least what
     the manager sees; a separate owner dashboard deriving the day's money its
     own way is how the two screens would start to disagree. */
  if (user.role === "ADMIN") return <CommandCentre user={user} />;

  /* Finance has a home of its own: the money, what needs chasing and what each
     container is making — not the warehouse's floor charts with money beside
     them. */
  if (user.role === "FINANCE") {
    const hour = Number(
      new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Dar_es_Salaam", hour: "2-digit", hour12: false }).format(new Date())
    );
    return (
      <div className="space-y-8">
        <DeskHero
          greeting={hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening"}
          name={user.name.split(" ")[0]}
          department={ROLE_LABELS[user.role]}
          subtitle="Here is the money, and what is waiting on you."
          searchPlaceholder="Tracking number, customer name, phone, container or invoice"
        />
        <ActionPills pills={pillsFor(user.role)} />
        <FinanceHome />
      </div>
    );
  }

  const oversight = can(user.role, "record.review");
  /* The Guangzhou desk gets its own page below the shared top. Manager and
     admin get it too, because "how is the China floor doing" is their question
     as much as anybody's. */
  const chinaDesk = can(user.role, "receiving.china");
  const money = can(user.role, "accounting.view");
  const seesBills = can(user.role, "finance.view");

  const [
    cards,
    attention,
    position,
    flow,
    overview,
    volume,
    revenue,
    ageing,
    activity,
    purse,
    floor,
    floorFlow,
    floorAgeing,
    floorMix,
    floorVolume,
    boxes,
    mine,
  ] = await Promise.all([
    dashboardFor(user.role),
    attentionItems(user.role),
    cargoPosition(),
    warehouseFlow(),
    oversight ? companyOverview() : null,
    oversight || money ? monthlyVolume() : null,
    money ? revenueTrend() : null,
    money ? receivablesAgeing() : null,
    oversight ? recentActivity() : null,
    seesBills ? moneyPosition() : null,
    chinaDesk ? chinaFloor() : null,
    chinaDesk ? chinaFlow() : null,
    chinaDesk ? chinaAgeing() : null,
    chinaDesk ? chinaMix() : null,
    chinaDesk ? chinaVolumeByMonth() : null,
    chinaDesk ? chinaContainers() : null,
    myActivity(user.id),
  ]);

  const hour = Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Africa/Dar_es_Salaam",
      hour: "2-digit",
      hour12: false,
    }).format(new Date())
  );
  const greeting =
    hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  const slices: DonutSlice[] = [
    { label: "Booked", value: position.booked, tone: 6 },
    { label: "In China", value: position.inChina, tone: 1 },
    { label: "At sea", value: position.atSea, tone: 2 },
    { label: "In Dar", value: position.inDar, tone: 4 },
    { label: "Ready to collect", value: position.ready, tone: 3 },
  ];
  const live = slices.reduce((sum, s) => sum + s.value, 0);

  const tzs = (usd: number) =>
    purse?.rate ? formatMoney(usd * purse.rate, "TZS") : undefined;

  return (
    <div className="space-y-8">
      <DeskHero
        greeting={greeting}
        name={user.name.split(" ")[0]}
        department={ROLE_LABELS[user.role]}
        subtitle={subtitleFor(user.role)}
        action={
          chinaDesk
            ? { href: "/app/receive/new", label: "Receive cargo" }
            : undefined
        }
      />

      <ActionPills pills={pillsFor(user.role)} />

      {/* The cargo counts used to run as a strip of chips here, above the
          worry list. They are the same five numbers the cards below already
          give with their context, and a row of figures nobody can act on is
          the first thing that teaches people to scroll past the top of a
          dashboard. */}

      {/* Always on the page, as on the air side: an empty panel is the good
          news, said where the desk looks first. */}
      <section>
        <SectionLabel
          count={attention.length}
          action={{ href: "/app/exceptions", label: "All issues" }}
        >
          Needs your attention
        </SectionLabel>
        <AttentionCenter items={attention} />
      </section>

      {cards.length > 0 ? (
        <section>
          <SectionLabel>What needs you today</SectionLabel>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {cards.map((card, i) => (
              <QueueCard key={card.href + card.label} card={card} index={i} />
            ))}
          </div>
        </section>
      ) : null}

      {purse ? (
        <section>
          <SectionLabel action={{ href: "/app/finance/collections", label: "Collections" }}>
            The money · right now
          </SectionLabel>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MoneyTile
              index={0}
              tone="success"
              icon="Banknote"
              label="Collected"
              value={formatMoney(purse.collected, "USD")}
              secondary={tzs(purse.collected)}
              secondaryLabel="in shillings"
              caption={`${Math.round(
                purse.billed > 0 ? (purse.collected / purse.billed) * 100 : 0
              )}% of what was billed`}
              explanation="Money actually in, against everything ever billed. A bill raised is not a bill paid — the gap is what chasing is for."
            />
            <MoneyTile
              index={1}
              tone="warning"
              icon="Clock"
              label="Owed by customers"
              value={formatMoney(purse.owed, "USD")}
              secondary={tzs(purse.owed)}
              secondaryLabel="in shillings"
              caption={`${purse.billCount} bill${purse.billCount === 1 ? "" : "s"}`}
              explanation="Issued, sent, and still unpaid. Counts verified payments only, so a screenshot never reduces it."
              href="/app/finance/collections?status=OVERDUE"
            />
            <MoneyTile
              index={2}
              tone="signal"
              icon="Hourglass"
              label="Waiting to be billed"
              value={String(purse.unbilled)}
              secondaryLabel="drafts raised"
              secondary={String(purse.drafts)}
              caption="consignments"
              explanation="Landed in Dar with nobody yet asked for the money. This is the biggest number on the page for a reason."
              href="/app/finance/containers"
            />
            <MoneyTile
              index={3}
              tone="danger"
              icon="Wallet"
              label="Container costs"
              value={formatMoney(purse.spent, "USD")}
              secondary={tzs(purse.spent)}
              secondaryLabel="in shillings"
              caption="freight, clearing, transport"
              explanation="What the sailings actually cost us. Without it, revenue is only pretending to be margin."
              href="/app/finance/expenses"
            />
          </div>
        </section>
      ) : null}

      {floor && floorFlow && floorAgeing && floorMix && floorVolume && boxes ? (
        <>
          <section>
            <SectionLabel action={{ href: "/app/inventory", label: "The floor" }}>
              The floor · right now
            </SectionLabel>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <KpiCard
                index={0}
                label="Waiting in Guangzhou"
                numeric={floor.waiting}
                icon={Warehouse}
                tone="warning"
                hint={`${floor.waitingCbm.toFixed(2)} CBM on the shelf`}
                href="/app/inventory"
              />
              <KpiCard
                index={1}
                label="Received this month"
                numeric={floor.thisMonth}
                icon={PackagePlus}
                tone="brand"
                delta={floor.delta ?? undefined}
                deltaLabel="vs last month"
                trend={floor.trend}
                hint={`${floor.receivedToday} today · ${floor.todayCbm.toFixed(2)} CBM`}
              />
              <KpiCard
                index={2}
                label="Cargo at sea"
                numeric={floor.atSea}
                icon={Ship}
                tone="marine"
                hint={`${floor.seaCbm.toFixed(2)} CBM on the water to ${ROUTE.destinationCity}`}
                href="/app/containers?status=IN_TRANSIT"
              />
            </div>
          </section>

          <section>
            <SectionLabel action={{ href: "/app/inventory", label: "The floor" }}>
              The floor, in shape
            </SectionLabel>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">What is in Guangzhou</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    By what is holding each consignment
                  </p>
                </CardHeader>
                <CardContent className="flex flex-col items-center gap-5">
                  <Donut
                    slices={[
                      { label: "Waiting for a container", value: floor.waiting, tone: 3 },
                      { label: "Loaded, not sailed", value: floor.inContainers, tone: 2 },
                    ]}
                    label={String(floor.waiting + floor.inContainers)}
                    caption="consignments"
                  />
                  <div className="w-full">
                    <DonutLegend
                      slices={[
                        { label: "Waiting for a container", value: floor.waiting, tone: 3 },
                        { label: "Loaded, not sailed", value: floor.inContainers, tone: 2 },
                      ]}
                    />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">In and out</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    Received against loaded, a fortnight
                  </p>
                </CardHeader>
                <CardContent>
                  <FlowBars
                    data={floorFlow}
                    inLabel="Received"
                    outLabel="Loaded"
                    height={180}
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">How long it has waited</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    From the day it was received in Guangzhou
                  </p>
                </CardHeader>
                <CardContent className="space-y-4">
                  <AgeingBar
                    bands={floorAgeing.map((b) => ({
                      label: b.label,
                      value: b.value,
                      tone: b.tone,
                    }))}
                    format={(n) => `${n} consignment${n === 1 ? "" : "s"}`}
                  />
                  <ul className="space-y-1.5">
                    {floorAgeing.map((b) => (
                      <li
                        key={b.label}
                        className="flex items-center gap-2 text-sm"
                      >
                        <span
                          className={cn(
                            "size-2 shrink-0 rounded-full",
                            b.tone === 4 && "bg-chart-4",
                            b.tone === 2 && "bg-chart-2",
                            b.tone === 3 && "bg-chart-3",
                            b.tone === 5 && "bg-chart-5"
                          )}
                        />
                        <span className="flex-1 truncate text-muted-foreground">
                          {b.label}
                        </span>
                        <span className="tnum">{b.value}</span>
                        <span className="tnum w-20 text-right text-muted-foreground">
                          {b.cbm.toFixed(2)} CBM
                        </span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            </div>
          </section>

          <section>
            <SectionLabel>Volume &amp; mix</SectionLabel>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
              <Card className="lg:col-span-3">
                <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
                  <div>
                    <CardTitle className="text-base">Volume received</CardTitle>
                    <p className="text-sm text-muted-foreground">
                      Cubic metres taken in at the Guangzhou desk,{" "}
                      {floorVolume.thisYear.year} against {floorVolume.lastYear.year}
                    </p>
                  </div>
                  <span className="tnum text-2xl font-semibold">
                    {floorVolume.thisYear.values
                      .reduce((n, v) => n + v, 0)
                      .toFixed(1)}
                    <span className="ml-1.5 text-sm font-normal text-muted-foreground">
                      CBM
                    </span>
                  </span>
                </CardHeader>
                <CardContent>
                  <AreaChart
                    labels={floorVolume.labels}
                    series={[
                      {
                        name: String(floorVolume.thisYear.year),
                        values: floorVolume.thisYear.values,
                        tone: 2,
                      },
                      {
                        name: String(floorVolume.lastYear.year),
                        values: floorVolume.lastYear.values,
                        tone: 6,
                      },
                    ]}
                    format="cbm"
                    height={230}
                  />
                </CardContent>
              </Card>

              <Card className="lg:col-span-2">
                <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
                  <div>
                    <CardTitle className="text-base">What you are sending</CardTitle>
                    <p className="text-sm text-muted-foreground">
                      Received in the last 30 days
                    </p>
                  </div>
                  <span className="tnum text-sm text-muted-foreground">
                    {floorMix.total.toFixed(2)} CBM
                  </span>
                </CardHeader>
                <CardContent className="flex flex-col items-center gap-5">
                  {floorMix.slices.length === 0 ? (
                    <p className="py-8 text-sm text-muted-foreground">
                      Nothing received in the last thirty days.
                    </p>
                  ) : (
                    <>
                      <Donut
                        slices={floorMix.slices}
                        label={floorMix.total.toFixed(1)}
                        caption="CBM"
                      />
                      <div className="w-full">
                        <DonutLegend
                          slices={floorMix.slices}
                          format={(n) => `${n.toFixed(2)} CBM`}
                        />
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            </div>
          </section>

          <section>
            <SectionLabel action={{ href: "/app/containers", label: "All shipments" }}>
              Containers on the floor
            </SectionLabel>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Open in Guangzhou</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    Fill these, then seal and record the sailing
                  </p>
                </CardHeader>
                <CardContent className="space-y-3">
                  {boxes.open.length === 0 ? (
                    <p className="py-6 text-sm text-muted-foreground">
                      No container is open. Open one to start loading.
                    </p>
                  ) : (
                    boxes.open.map((box) => {
                      const fill = box.capacity
                        ? Math.min(100, Math.round((box.cbm / box.capacity) * 100))
                        : null;
                      return (
                        <Link
                          key={box.id}
                          href={`/app/containers/${box.id}`}
                          className="block rounded-lg border p-4 transition-colors hover:bg-secondary/50"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <span className="tnum font-medium">{box.label}</span>
                            <span className="text-xs text-muted-foreground">
                              {CONTAINER_STATUS_LABELS[box.status]} ·{" "}
                              {formatDate(box.since)}
                            </span>
                          </div>
                          <p className="mt-1 text-sm text-muted-foreground">
                            {box.consignments} consignment
                            {box.consignments === 1 ? "" : "s"} · {box.packages}{" "}
                            package{box.packages === 1 ? "" : "s"} ·{" "}
                            {box.cbm.toFixed(3)} CBM
                          </p>
                          {fill !== null ? (
                            <div className="mt-3 h-2 overflow-hidden rounded-full bg-secondary">
                              <div
                                className="h-full rounded-full bg-marine"
                                style={{ width: `${Math.max(fill, 2)}%` }}
                              />
                            </div>
                          ) : null}
                        </Link>
                      );
                    })
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Volume shipped per container</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    Recent sailings, cubic metres in each box
                  </p>
                </CardHeader>
                <CardContent>
                  {boxes.sailed.length === 0 ? (
                    <p className="py-6 text-sm text-muted-foreground">
                      Nothing has sailed yet.
                    </p>
                  ) : (
                    <BarChart
                      data={boxes.sailed}
                      tone={2}
                      highlightIndex={boxes.sailed.length - 1}
                      formatValue={(n) => `${n.toFixed(2)} CBM`}
                      height={195}
                    />
                  )}
                </CardContent>
              </Card>
            </div>
          </section>
        </>
      ) : null}

      <section>
        <SectionLabel>The cargo, in shape</SectionLabel>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-1">
            <CardHeader>
              <CardTitle className="text-base">Where the cargo is</CardTitle>
              <p className="text-sm text-muted-foreground">
                Every live consignment, by where it currently sits
              </p>
            </CardHeader>
            <CardContent className="flex flex-col items-center gap-5">
              <Donut slices={slices} label={String(live)} caption="consignments" />
              <div className="w-full">
                <DonutLegend slices={slices} />
              </div>
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-base">The Dar floor, last fortnight</CardTitle>
              <p className="text-sm text-muted-foreground">
                What came in against what went out
              </p>
            </CardHeader>
            <CardContent>
              <FlowBars
                data={flow}
                inLabel="Received"
                outLabel="Released"
                height={180}
              />
            </CardContent>
          </Card>
        </div>
      </section>

      {volume || revenue ? (
        <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {volume ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Volume shipped, by month</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Cubic metres loaded onto containers
                </p>
              </CardHeader>
              <CardContent>
                <BarChart
                  data={volume}
                  tone={2}
                  highlightIndex={volume.length - 1}
                  formatValue={(n) => `${n.toFixed(2)} CBM`}
                  height={195}
                />
              </CardContent>
            </Card>
          ) : null}

          {revenue ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Billed against collected</CardTitle>
                <p className="text-sm text-muted-foreground">
                  What we asked for, and what actually arrived
                </p>
              </CardHeader>
              <CardContent>
                <AreaChart
                  labels={revenue.labels}
                  height={195}
                  format="money"
                  currency="USD"
                  series={[
                    { name: "Billed", values: revenue.billed, tone: 1 },
                    { name: "Collected", values: revenue.collected, tone: 2 },
                  ]}
                />
              </CardContent>
            </Card>
          ) : null}
        </section>
      ) : null}

      {ageing || activity ? (
        <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {ageing ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">What we are owed, by age</CardTitle>
                <p className="text-sm text-muted-foreground">
                  From the day the bill became real
                </p>
              </CardHeader>
              <CardContent>
                <AgeingBar
                  format={(n) => formatMoney(n, "USD")}
                  bands={[
                    { label: "Under 30 days", value: ageing.current, tone: 4 },
                    { label: "30 – 60 days", value: ageing.d30, tone: 2 },
                    { label: "60 – 90 days", value: ageing.d60, tone: 3 },
                    { label: "Over 90 days", value: ageing.d90, tone: 5 },
                  ]}
                />
              </CardContent>
            </Card>
          ) : null}

          {activity ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Latest activity</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Every privileged action, newest first
                </p>
              </CardHeader>
              <CardContent>
                <ol className="space-y-3">
                  {activity.map((entry) => (
                    <li key={entry.id} className="flex gap-3 text-sm">
                      <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-brand/50" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">{entry.summary}</span>
                        <span className="block text-xs text-muted-foreground">
                          {formatRelative(entry.createdAt)}
                          {entry.actorEmail
                            ? ` · ${entry.actorEmail.split("@")[0]}`
                            : ""}
                        </span>
                      </span>
                    </li>
                  ))}
                </ol>
              </CardContent>
            </Card>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
