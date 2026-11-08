import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, Boxes, Container, Package, Receipt, Scale, TrendingUp, Wallet } from "lucide-react";

import { ActionPills } from "@/components/app/action-pills";
import { AttentionCenter } from "@/components/app/attention-center";
import { CargoMix } from "@/components/app/cargo-mix";
import { ContainerProfitTable } from "@/components/app/container-profit-table";
import { DeskHero } from "@/components/app/desk-hero";
import { MoneyFlowChart } from "@/components/app/manager-bento";
import { SectionLabel } from "@/components/app/section-label";
import { AreaChart } from "@/components/charts/area-chart";
import { Donut, DonutLegend, type DonutSlice } from "@/components/charts/donut";
import { Ring } from "@/components/charts/ring";
import { ROLE_LABELS } from "@/lib/constants";
import { formatCurrency } from "@/lib/currency";
import { pillsFor } from "@/lib/desk";
import { chinaVolumeByMonth } from "@/lib/dashboard";
import { t } from "@/lib/i18n";
import { managerOverview } from "@/lib/manager-overview";
import type { SessionUser } from "@/lib/session";
import { cn } from "@/lib/utils";
import { localeOf } from "@/lib/viewer-locale";

/**
 * THE MANAGEMENT HOME — the owner's and the manager's.
 *
 * The order Target Express reads it in: who and what needs you; the money and
 * what moved today; the month against last month; the year's shape; each
 * container's profit; who owes and who is owed; where the cargo is. Nothing here
 * is a button that does a desk's work — a number is a way into the page that
 * explains it. Every money figure comes off the same books as Finance's Profit
 * and loss (`lib/manager-overview` → `lib/finance-report`), so this page and that
 * one cannot disagree. Shillings lead; a dollar figure is only ever its own line.
 */
export async function ManagementHome({ user }: { user: SessionUser }) {
  const locale = await localeOf(user.id);
  const [o, volume] = await Promise.all([managerOverview(locale), chinaVolumeByMonth()]);
  const tr = (text: string) => t(locale, text);
  const tzs = (n: number) => formatCurrency(n, "TZS");
  const count = (n: number) => n.toLocaleString("en-US");

  const { home, money, month, position } = o;
  const growth = (now: number, before: number) => (before !== 0 ? ((now - before) / Math.abs(before)) * 100 : null);

  /* ------------------------------------------------------------- the money */
  const ACCOUNT_TONE: Record<string, DonutSlice["tone"]> = { BANK: 1, MOBILE_MONEY: 2, CASH: 4 };
  const accountSlices: DonutSlice[] = o.accounts
    .filter((a) => a.balance > 0)
    .map((a) => ({ label: a.name, value: a.balance, tone: ACCOUNT_TONE[a.kind] ?? 1 }));
  const netToday = money.collectedTodayTzs - money.spentToday.tzs;

  const Delta = ({ now, before, costs = false }: { now: number; before: number; costs?: boolean }) => {
    const pct = growth(now, before);
    if (pct === null) return <span className="text-xs text-muted-foreground">{tr("nothing last month")}</span>;
    const up = pct >= 0;
    const good = costs ? !up : up;
    const Arrow = up ? ArrowUpRight : ArrowDownRight;
    return (
      <span className={cn("inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-xs font-semibold", good ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive")}>
        <Arrow className="size-3" />
        {Math.abs(pct).toFixed(1)}%
      </span>
    );
  };

  /* A faint wash of the figure's own colour, so a row of tiles reads as four
     different things before a word is read. */
  const TINT: Record<string, string> = {
    "text-marine": "from-marine/10",
    "text-success": "from-success/10",
    "text-signal": "from-signal/10",
    "text-destructive": "from-destructive/10",
  };

  const Tile = ({
    icon: Icon,
    label,
    value,
    tone,
    foot,
    ring,
  }: {
    icon: typeof Wallet;
    label: string;
    value: string;
    tone: string;
    foot: React.ReactNode;
    ring?: React.ReactNode;
  }) => (
    <div className={cn("relative min-w-0 rounded-xl border bg-card bg-gradient-to-br to-transparent p-4 shadow-soft", TINT[tone] ?? "from-secondary/40")}>
      <div className="flex items-center gap-2.5 text-sm text-muted-foreground">
        <span className="grid size-8 place-items-center rounded-lg bg-secondary">
          <Icon className="size-4" />
        </span>
        <span className="truncate">{label}</span>
        {ring ? <span className="ml-auto">{ring}</span> : null}
      </div>
      <p className={cn("tnum mt-3 truncate text-2xl font-bold tracking-tight", tone)}>{value}</p>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">{foot}</div>
    </div>
  );

  const th = home.thisMonth;
  const lm = home.lastMonth;
  const collectedOfBilled = th.billed > 0 ? home.health.collectionRate : null;

  /* ---------------------------------------------------------- the cargo */
  const cargoSlices: DonutSlice[] = [
    { label: tr("In Guangzhou"), value: position.inChina, tone: 2 },
    { label: tr("At sea"), value: position.atSea, tone: 1 },
    { label: tr("On the Dar floor"), value: position.onFloor, tone: 4 },
    { label: tr("Cleared, not collected"), value: position.ready, tone: 3 },
    { label: tr("Under investigation"), value: position.flagged, tone: 5 },
  ];
  const ageTotal = home.ageBands.reduce((s, b) => s + b.tzs, 0);
  const AGE_TONE = ["bg-success", "bg-marine", "bg-warning", "bg-destructive"];
  const volumeThis = volume.thisYear.values.reduce((s, n) => s + n, 0);
  const yearIn = o.flow.reduce((s, m) => s + m.in, 0);
  const yearOut = o.flow.reduce((s, m) => s + m.out, 0);

  const Panel = ({ title, hint, action, children, className }: { title: string; hint?: string; action?: { href: string; label: string }; children: React.ReactNode; className?: string }) => (
    <section className={cn("min-w-0 rounded-xl border bg-card p-5 shadow-soft", className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-semibold">{title}</h2>
          {hint ? <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p> : null}
        </div>
        {action ? (
          <Link href={action.href} className="shrink-0 text-xs font-medium text-brand hover:underline">
            {action.label} →
          </Link>
        ) : null}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );

  return (
    <div className="space-y-8">
      <DeskHero
        greeting="Habari"
        name={user.name.split(" ")[0]}
        department={ROLE_LABELS[user.role]}
        kicker={user.role === "ADMIN" ? "CEO" : "Director"}
        search={user.role !== "ADMIN"}
        subtitle=""
      />

      <ActionPills pills={pillsFor(user.role)} />

      <section>
        <SectionLabel
          count={o.attention.filter((a) => a.tone === "bad").length}
          action={{ href: "/app/manager/control", label: tr("Control room") }}
        >
          {tr("Needs your attention")}
        </SectionLabel>
        <AttentionCenter items={o.attention} />
      </section>

      {/* ----------------------------------------------------- the money */}
      <section className="overflow-hidden rounded-xl border bg-card shadow-soft">
        <div className="flex items-center justify-between gap-3 border-b px-5 py-4">
          <h2 className="font-semibold">{tr("The money")}</h2>
          <div className="flex items-center gap-3 text-xs">
            <span className="rounded-md bg-secondary px-2 py-1 text-muted-foreground">
              {netToday === 0 ? tr("No change today") : netToday > 0 ? tr("Up today") : tr("Down today")}
            </span>
            <Link href="/app/finance/accounts" className="font-medium text-brand hover:underline">
              {tr("Open accounts")}
            </Link>
          </div>
        </div>
        <div className="grid lg:grid-cols-[1.25fr_1fr]">
          <div className="p-5">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{tr("In the accounts")}</p>
            <p className="tnum mt-1 text-3xl font-bold tracking-tight">{tzs(o.heldTzs)}</p>
            <div className="mt-5 flex flex-col items-start gap-6 sm:flex-row sm:items-center">
              <Donut slices={accountSlices} size={132} stroke={20} />
              <div className="min-w-0 flex-1 self-stretch">
                {o.accounts.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{tr("No account has been set up yet.")}</p>
                ) : (
                  <ul className="space-y-2.5">
                    {o.accounts
                      .slice()
                      .sort((a, b) => b.balance - a.balance)
                      .slice(0, 4)
                      .map((a, i) => (
                        <li key={a.id} className="flex items-baseline justify-between gap-3 text-sm">
                          <span className="flex min-w-0 items-center gap-2">
                            <span className={cn("size-2 shrink-0 rounded-full", ["bg-chart-1", "bg-chart-2", "bg-chart-4", "bg-chart-3"][i])} />
                            <span className="truncate text-muted-foreground">{a.name}</span>
                          </span>
                          <span className="tnum shrink-0 font-semibold">{formatCurrency(a.balance, a.currency)}</span>
                        </li>
                      ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
          <dl className="divide-y border-t lg:border-l lg:border-t-0">
            <p className="px-5 pt-5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{tr("Today")}</p>
            {[
              { k: tr("Billed today"), v: tzs(money.billedToday.tzs), c: "" },
              { k: tr("Collected today"), v: tzs(money.collectedTodayTzs), c: "text-success" },
              { k: tr("Spent today"), v: tzs(money.spentToday.tzs), c: "text-destructive" },
              { k: tr("Net cash today"), v: tzs(netToday), c: netToday < 0 ? "text-destructive" : "text-success" },
            ].map((r) => (
              <div key={r.k} className="flex items-baseline justify-between gap-3 px-5 py-3.5 text-sm first:border-t-0">
                <dt className="text-muted-foreground">{r.k}</dt>
                <dd className={cn("tnum text-base font-bold", r.c)}>{r.v}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* ------------------------------------------- this month vs last */}
      <section>
        <SectionLabel action={{ href: "/app/finance/reports", label: tr("Profit & loss") }}>
          {`${tr("This month")} · ${tr("against last month")}`}
        </SectionLabel>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Tile
            icon={Receipt}
            label={tr("Billed")}
            value={tzs(th.billed)}
            tone="text-marine"
            foot={
              <>
                <Delta now={th.billed} before={lm.billed} />
                {lm.billed !== 0 ? <span>{`${tr("last month")} ${tzs(lm.billed)}`}</span> : null}
              </>
            }
          />
          <Tile
            icon={Wallet}
            label={tr("Collected")}
            value={tzs(th.collected)}
            tone="text-success"
            foot={
              <>
                <Delta now={th.collected} before={lm.collected} />
                {lm.collected !== 0 ? <span>{`${tr("last month")} ${tzs(lm.collected)}`}</span> : null}
              </>
            }
          />
          <Tile
            icon={Boxes}
            label={tr("Costs")}
            value={tzs(th.costs)}
            tone="text-signal"
            foot={
              <>
                <Delta now={th.costs} before={lm.costs} costs />
                {lm.costs !== 0 ? <span>{`${tr("last month")} ${tzs(lm.costs)}`}</span> : null}
              </>
            }
          />
          <Tile
            icon={TrendingUp}
            label={tr("Billed less costs")}
            value={tzs(th.profit)}
            tone={th.profit < 0 ? "text-destructive" : "text-success"}
            ring={th.margin !== null ? <Ring value={Math.max(0, Math.min(100, th.margin))} total={100} size={44} stroke={5} tone={1} label={`${Math.round(th.margin)}%`} /> : null}
            foot={
              <>
                <Delta now={th.profit} before={lm.profit} />
                <span>{th.margin === null ? tr("nothing billed yet") : `${th.margin.toFixed(0)}% ${tr("margin")}`}</span>
              </>
            }
          />
          <Tile icon={Wallet} label={tr("Owed to us")} value={tzs(money.owedTzs)} tone="text-signal" foot={<span>{tr("Owed on every unpaid bill, not just this month")}</span>} />
          <Tile
            icon={Scale}
            label={tr("Collected of what was billed")}
            value={collectedOfBilled === null ? "—" : `${collectedOfBilled.toFixed(0)}%`}
            tone="text-marine"
            foot={<span>{`${tzs(th.billed - (th.billed * (100 - (collectedOfBilled ?? 100))) / 100)} ${tr("of")} ${tzs(th.billed)}`}</span>}
          />
          <Tile
            icon={Package}
            label={tr("Cargo this month")}
            value={`${home.cargo.cbm.toFixed(2)} CBM`}
            tone="text-marine"
            foot={<span>{`${count(home.cargo.packages)} ${tr("packages")} · ${count(home.cargo.customers)} ${tr("customers")}`}</span>}
          />
          <Tile icon={Container} label={tr("Volume on the floor")} value={`${o.operations.cbmOnFloor.toFixed(2)} CBM`} tone="text-marine" foot={<span>{tr("Landed in Dar, not handed over")}</span>} />
        </div>
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
          {tr("Billed less costs is what was invoiced this month, not money received. What has not been paid is under Owed to us.")}
          {th.costs === 0 && th.billed > 0 ? (
            <span className="text-warning">{` ${tr("No costs are recorded this month, so this reads higher than the business earned — freight, customs and clearing have not been entered.")}`}</span>
          ) : null}
        </p>
      </section>

      {/* --------------------------------------------- the year's shape */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        <Panel title={tr("Billed, costs and what was left")} hint={`${tr("The last twelve months")} · TZS`}>
          <AreaChart
            series={[
              { name: tr("Billed"), values: home.series12.map((m) => m.billed), tone: 1 },
              { name: tr("Costs"), values: home.series12.map((m) => m.costs), tone: 5 },
              { name: tr("Billed less costs"), values: home.series12.map((m) => m.left), tone: 3 },
            ]}
            labels={home.series12.map((m) => m.label)}
            format="money"
            currency="TZS"
            height={240}
          />
        </Panel>
        <Panel title={tr("Financial health")} hint={tr("This month, read against the rules the business keeps")}>
          <dl className="divide-y text-sm">
            {[
              { k: tr("Collection rate"), v: home.health.collectionRate, good: (x: number) => x >= 80 },
              { k: tr("Profit margin"), v: home.health.margin, good: (x: number) => x >= 20 },
              { k: tr("Expense ratio"), v: home.health.expenseRatio, good: (x: number) => x <= 60 },
              { k: tr("Outstanding ratio"), v: home.health.outstandingRatio, good: (x: number) => x <= 30 },
              { k: tr("Revenue growth"), v: home.health.revenueGrowth, good: (x: number) => x >= 0 },
              { k: tr("Profit growth"), v: home.health.profitGrowth, good: (x: number) => x >= 0 },
            ].map((r) => (
              <div key={r.k} className="flex items-baseline justify-between gap-3 py-3">
                <dt className="text-muted-foreground">{r.k}</dt>
                <dd className={cn("tnum text-base font-bold", r.v === null ? "text-muted-foreground" : r.good(r.v) ? "text-success" : "text-destructive")}>
                  {r.v === null ? "—" : `${r.v.toFixed(1)}%`}
                </dd>
              </div>
            ))}
          </dl>
        </Panel>
      </div>

      {/* ------------------------------------------------- the containers */}
      <section>
        <SectionLabel action={{ href: "/app/finance/containers", label: tr("Every container") }}>
          {`${tr("Containers")} · ${tr("what each one made")}`}
        </SectionLabel>
        <ContainerProfitTable containers={o.containerProfit} locale={locale} />
      </section>

      {/* ------------------------------------- who, what for, and for how long */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Panel title={tr("Top customers")} hint={tr("Billed this month, and what they still owe")}>
          {home.topCustomers.length === 0 ? (
            <p className="text-sm text-muted-foreground">{tr("Nothing has been billed this month yet.")}</p>
          ) : (
            <ol className="divide-y">
              {home.topCustomers.map((c, i) => (
                <li key={c.name + i} className="flex items-center gap-3 py-3">
                  <span className="grid size-6 shrink-0 place-items-center rounded-full bg-secondary text-xs font-semibold">{i + 1}</span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{c.name}</span>
                  <span className="shrink-0 text-right">
                    <span className="tnum block text-sm font-bold">{tzs(c.billed)}</span>
                    {c.owed > 0 ? <span className="tnum block text-[11px] text-destructive">{`${tzs(c.owed)} ${tr("owed")}`}</span> : null}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </Panel>
        <Panel title={tr("Where money is spent")} hint={tr("This month's costs, largest first")}>
          {home.spend.length === 0 ? (
            <p className="text-sm text-muted-foreground">{tr("No costs recorded this month")}</p>
          ) : (
            <ul className="space-y-3.5">
              {home.spend.map((c) => (
                <li key={c.name}>
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="truncate font-medium">{c.name}</span>
                    <span className="tnum shrink-0 font-semibold">{tzs(c.amount)}</span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-secondary">
                    <div className="h-full rounded-full bg-signal" style={{ width: `${Math.max(3, (c.amount / home.spend[0].amount) * 100)}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel title={tr("What we are owed, by age")} hint={tr("From the day the bill became real")}>
          <div className="flex h-2 overflow-hidden rounded-full bg-secondary">
            {home.ageBands.map((b, i) => (
              <span key={b.key} className={AGE_TONE[i]} style={{ width: ageTotal > 0 ? `${(b.tzs / ageTotal) * 100}%` : 0 }} />
            ))}
          </div>
          <ul className="mt-4 space-y-2.5">
            {home.ageBands.map((b, i) => (
              <li key={b.key} className="flex items-center gap-2 text-sm">
                <span className={cn("size-2 shrink-0 rounded-full", AGE_TONE[i])} />
                <span className="min-w-0 flex-1 text-muted-foreground">{b.label}</span>
                <span className="tnum hidden text-xs text-muted-foreground 2xl:inline">{`${count(b.bills)} ${tr("bills")}`}</span>
                <span className="tnum shrink-0 whitespace-nowrap text-right font-semibold">{tzs(b.tzs)}</span>
                <span className="tnum w-9 text-right text-xs text-muted-foreground">{ageTotal > 0 ? Math.round((b.tzs / ageTotal) * 100) : 0}%</span>
              </li>
            ))}
          </ul>
          <p className="mt-4 border-t pt-3 text-sm text-muted-foreground">
            {tr("Credit outstanding")} <span className="tnum font-semibold text-foreground">{tzs(money.creditOwedTzs)}</span>
          </p>
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Panel title={tr("Money in and out")} hint={tr("What arrived against what it cost, this year")}>
          <MoneyFlowChart
            labels={o.flow.map((m) => m.label)}
            moneyIn={o.flow.map((m) => m.in)}
            moneyOut={o.flow.map((m) => m.out)}
            currentIndex={o.flow.length - 1}
            title={tr("Payments received against costs paid, this year")}
          />
          <p className="mt-3 flex flex-wrap gap-x-5 gap-y-1 border-t pt-3 text-xs">
            <span className="text-muted-foreground">{tr("In")} <span className="tnum font-semibold text-foreground">{tzs(yearIn)}</span></span>
            <span className="text-muted-foreground">{tr("Out")} <span className="tnum font-semibold text-foreground">{tzs(yearOut)}</span></span>
          </p>
        </Panel>
        <Panel title={tr("Where the cargo is")} hint={tr("Everything the business is carrying, Guangzhou to the counter")} action={{ href: "/app/cargo", label: tr("Every consignment") }}>
          <div className="flex justify-center">
            <Donut slices={cargoSlices} size={150} stroke={22} label={count(position.total)} caption={tr("consignments")} />
          </div>
          <div className="mt-5">
            <DonutLegend slices={cargoSlices} format={count} />
          </div>
        </Panel>
        <div className="flex flex-col [&>section]:flex-1">
          <CargoMix
            slices={o.mix.slices}
            totalLines={o.mix.totalLines}
            totalCbm={o.mix.totalCbm}
            periodLabel={`${tr("Received in the last")} ${o.mix.days} ${tr("days")}`}
            unclassifiedName={tr("Not classified")}
            locale={locale}
          />
        </div>
      </div>

      <Panel
        title={tr("Cargo volume")}
        hint={`${volume.thisYear.year} ${tr("against")} ${volume.lastYear.year} · CBM ${tr("received in Guangzhou")}`}
      >
        <div className="mb-2 flex items-baseline justify-end gap-2">
          <span className="tnum text-3xl font-bold">{volumeThis.toFixed(0)}</span>
          <span className="text-xs text-muted-foreground">{`CBM ${tr("this year")}`}</span>
        </div>
        <AreaChart
          series={[
            { name: String(volume.thisYear.year), values: volume.thisYear.values, tone: 1 },
            { name: String(volume.lastYear.year), values: volume.lastYear.values, tone: 2 },
          ]}
          labels={volume.labels}
          format="cbm"
          height={240}
        />
      </Panel>
    </div>
  );
}
