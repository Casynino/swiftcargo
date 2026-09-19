/*
  The owner's and the manager's home, in a module of its own.

  A page file in the App Router may export nothing but the page, so two routes
  sharing one screen means giving the screen a home of its own rather than a
  second copy. The manager's route and the owner's dashboard both render this.
  Two copies would be two places deciding what "collected today" means, and the
  weekly meeting would become an argument about whose page is right.

  What differs between the two chairs is what they can PRESS, never what they
  READ: every link below lands on a page that checks its own permission, and
  the quick actions come from pillsFor(role).
*/
import Link from "next/link";
import {
  AlertTriangle,
  Anchor,
  ArrowRight,
  ClipboardCheck,
  Container,
  CreditCard,
  Info,
  Package,
  PackageCheck,
  PackagePlus,
  Ruler,
  Scale,
  ScanLine,
  Ship,
  Signature,
  TrendingDown,
  TrendingUp,
  Users,
  Wallet,
  Warehouse,
  type LucideIcon,
} from "lucide-react";

import { ActionPills } from "@/components/app/action-pills";
import { ActivityBars } from "@/components/app/activity-bars";
import { ActivityFeed } from "@/components/app/activity-feed";
import { AttentionCenter } from "@/components/app/attention-center";
import { CargoMix } from "@/components/app/cargo-mix";
import { ContainerProfitTable } from "@/components/app/container-profit-table";
import { DeskHero } from "@/components/app/desk-hero";
import { DeskPulsePanel } from "@/components/app/desk-pulse";
import {
  AccountRail,
  BandHeading,
  BentoCard,
  CorridorBar,
  Figure,
  MarginRing,
  MoneyFlowChart,
  PipelineStrip,
  QueueList,
  RailStat,
  StatRows,
} from "@/components/app/manager-bento";
import { MoneyTile } from "@/components/app/money-tile";
import { SectionLabel } from "@/components/app/section-label";
import { Sparkline } from "@/components/charts/sparkline";
import { ROLE_LABELS } from "@/lib/constants";
import { formatCurrency } from "@/lib/currency";
import { pillsFor } from "@/lib/desk";
import { formatRelative } from "@/lib/format";
import { t, type Locale } from "@/lib/i18n";
import { managerOverview, type Insight, type InsightTone } from "@/lib/manager-overview";
import { can } from "@/lib/rbac";
import type { SessionUser } from "@/lib/session";
import { cn } from "@/lib/utils";
import { localeOf } from "@/lib/viewer-locale";

import { Tx } from "@/components/app/tx";
/** Where the latest salary run has got to, in the manager's words. */
const PAYROLL_STATUS: Record<string, string> = {
  DRAFT: "being prepared by Finance",
  PENDING_APPROVAL: "waiting on you",
  APPROVED: "agreed, not yet paid",
  REJECTED: "sent back to Finance",
  PAID: "paid",
};

/**
 * The command centre — the manager's home, and the owner's.
 *
 * A BENTO GRID, NOT A GRID OF TILES. Every band has one cell that owns it — the
 * ink panel carrying the month's money, the corridor bar carrying every
 * consignment in the business — with smaller cells around it, which is what lets
 * somebody answer "how are we doing" from the top of the screen.
 *
 * WHAT NEEDS YOU, THEN THE MONEY, THEN WHAT IS MOVING, THEN WHO IS DOING IT.
 * The first question at this desk is "does anything need me", and every number
 * under the attention panel is context for answering it.
 *
 * THE SAME ENGINES FINANCE READS. Every money figure comes off
 * lib/finance-report, lib/invoice-balance and lib/credit through
 * lib/manager-overview — a manager and a finance desk comparing notes across two
 * pages that compute revenue two ways is how a business ends up with two sets of
 * books. Shillings lead everywhere; a dollar figure is only ever its own line.
 */
export async function CommandCentre({ user }: { user: SessionUser }) {
  const locale = await localeOf(user.id);
  const overview = await managerOverview(locale);

  const { money: purse, month, company, operations, position } = overview;
  const tzs = (n: number) => formatCurrency(n, "TZS");
  const usd = (n: number) => formatCurrency(n, "USD");
  const count = (n: number) => n.toLocaleString("en-US");

  /*
    THE ACCOUNTS, AS THE RAIL DRAWS THEM.

    Balances stay in the currency the account is kept in. The dollar account is
    compared against a dollar statement, and putting it through today's rate
    would print a number that statement will never show. Only the total above
    the list is converted, and it says so.
  */
  const ACCOUNT_COLOURS: Record<string, string> = {
    BANK: "hsl(var(--chart-1))",
    MOBILE_MONEY: "hsl(var(--chart-2))",
    CASH: "hsl(var(--chart-4))",
  };
  const seesAccounts = can(user.role, "finance.view");
  const accountRows = overview.accounts.map((account) => ({
    key: account.id,
    name: account.name,
    kind: t(
      locale,
      account.kind === "BANK" ? "Bank" : account.kind === "MOBILE_MONEY" ? "Mobile money" : "Cash"
    ),
    colour: ACCOUNT_COLOURS[account.kind] ?? "hsl(var(--chart-1))",
    display: formatCurrency(account.balance, account.currency),
    value: account.balance,
    meta:
      account.lastCountedAt === null
        ? t(locale, "never checked")
        : account.movedSinceCount
          ? t(locale, "moved since the check")
          : `${t(locale, "checked")} ${formatRelative(account.lastCountedAt)}`,
    flag: account.balance < 0 ? t(locale, "overdrawn") : undefined,
    href: seesAccounts ? `/app/finance/accounts/${account.id}` : undefined,
  }));

  const inThisYear = overview.flow.reduce((s, m) => s + m.in, 0);
  const outThisYear = overview.flow.reduce((s, m) => s + m.out, 0);

  /*
    A zero meaning "we have not started" and a zero meaning "we came out level"
    are different facts, and "in profit by TZS 0" states the second when it is
    usually the first — on the 1st of every month. A month with nothing billed
    and nothing spent says so and prints no figure.
  */
  const nothingYet = month.billedTzs === 0 && month.costTzs === 0;
  const verdict: { icon: LucideIcon; lead: string; figure: string; colour: string } = nothingYet
    ? { icon: Info, lead: "Nothing has been billed or spent this month yet", figure: "—", colour: "text-white" }
    : month.profitTzs > 0
      ? { icon: TrendingUp, lead: "The month is in profit by", figure: tzs(month.profitTzs), colour: "text-signal" }
      : month.profitTzs < 0
        ? {
            icon: TrendingDown,
            lead: "The month is running at a loss of",
            figure: tzs(Math.abs(month.profitTzs)),
            colour: "text-destructive",
          }
        : { icon: Info, lead: "Billed and spent have come out exactly level", figure: tzs(0), colour: "text-white" };
  const MonthIcon = verdict.icon;

  const collection = month.collectionRatePct;
  const unconvertedHeld =
    overview.heldUnconvertedUsd !== 0 ? ` + ${usd(overview.heldUnconvertedUsd)}` : "";

  return (
    <div className="space-y-6">
      <DeskHero
        greeting="Habari"
        name={user.name.split(" ")[0]}
        department={ROLE_LABELS[user.role]}
        subtitle={t(
          locale,
          user.role === "ADMIN"
            ? "Here is what is happening at Swift Cargo today."
            : "Here is the whole business, and what is waiting on you."
        )}
        actions={[
          { href: "/app/receive/new", label: t(locale, "Receive cargo"), icon: PackagePlus },
          { href: "/app/scan", label: t(locale, "Scan & release"), icon: ScanLine },
        ]}
      />

      <ActionPills pills={pillsFor(user.role)} />

      <section>
        <SectionLabel
          count={overview.attention.filter((a) => a.tone === "bad").length}
          action={{ href: "/app/manager/control", label: t(locale, "Control room") }}
        >
          {t(locale, "Needs your attention")}
        </SectionLabel>
        <AttentionCenter items={overview.attention} />
      </section>

      {/* ----------------------------------------------------------- the money */}
      <section>
        <BandHeading
          title={t(locale, "The money")}
          hint={t(locale, "What was billed, what arrived, and what is left of it.")}
          action={{ href: "/app/finance", label: t(locale, "Full position") }}
        />

        {/* The small figures get their own row, so a tile holding one label and
            one figure is never stretched to the height of a chart beside it. */}
        <div className="mb-3 grid grid-cols-1 items-start gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <MoneyTile
            index={0}
            label={t(locale, "Collected today")}
            value={tzs(purse.collectedTodayTzs)}
            secondaryLabel={t(locale, "on the invoice")}
            secondary={usd(purse.collectedTodayUsd)}
            explanation={t(locale, "What customers actually handed over, verified by Finance.")}
            icon="HandCoins"
            tone="success"
            href="/app/finance/payments"
          />
          <MoneyTile
            index={1}
            label={t(locale, "Billed today")}
            value={tzs(purse.billedToday.tzs)}
            secondaryLabel={t(locale, "on the invoice")}
            secondary={usd(purse.billedToday.usd)}
            explanation={t(locale, "Invoiced today, not yet money.")}
            icon="Receipt"
            tone="brand"
            href="/app/finance/invoices"
          />
          <MoneyTile
            index={2}
            label={t(locale, "Spent today")}
            value={tzs(purse.spentToday.tzs)}
            secondaryLabel={t(locale, "on the invoice")}
            secondary={usd(purse.spentToday.usd)}
            explanation={t(locale, "Every cost dated today, at the rate it was recorded at.")}
            icon="Banknote"
            tone="danger"
            href="/app/finance/expenses"
          />
          <MoneyTile
            index={3}
            label={t(locale, "Credit outstanding")}
            value={tzs(purse.creditOwedTzs)}
            secondaryLabel={purse.creditUnconvertedUsd > 0 ? t(locale, "no rate, kept apart") : undefined}
            secondary={purse.creditUnconvertedUsd > 0 ? usd(purse.creditUnconvertedUsd) : undefined}
            explanation={t(locale, "Cargo released on a promise, never cash.")}
            icon="CreditCard"
            tone="warning"
            href="/app/finance/credit"
          />
          <MoneyTile
            index={4}
            label={t(locale, "Owed to us")}
            value={purse.owedLabel}
            secondaryLabel={t(locale, "on the invoice")}
            secondary={usd(purse.owedUsd)}
            caption={`${count(purse.unpaidBills)} ${t(locale, purse.unpaidBills === 1 ? "bill still open" : "bills still open")}`}
            explanation={t(locale, "Billed, confirmed, and still not paid. Verified payments only.")}
            icon="Wallet"
            tone={purse.owedTzs > 0 || purse.owedUnconvertedUsd > 0 ? "danger" : "success"}
            href="/app/finance/collections"
          />
        </div>

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 lg:items-stretch">
          {/* THE ONE CELL THAT OWNS THIS SCREEN. Ink, because the month's profit
              is the single figure that says whether any of the rest was worth
              doing. */}
          <BentoCard tone="ink" href="/app/finance/reports">
            <span
              aria-hidden
              className="pointer-events-none absolute inset-0 opacity-[0.07]"
              style={{
                backgroundImage:
                  "linear-gradient(to right, #fff 1px, transparent 1px), linear-gradient(to bottom, #fff 1px, transparent 1px)",
                backgroundSize: "44px 44px",
              }}
            />
            <span
              aria-hidden
              className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_110%_at_100%_0%,hsl(var(--signal)/0.22),transparent_58%)]"
            />

            <div className="relative flex flex-1 flex-col">
              <div className="flex items-start justify-between gap-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-signal"><Tx>{month.label}</Tx></p>
                <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-white/10 text-white">
                  <MonthIcon className="size-4" />
                </span>
              </div>

              {/* The words carry the direction; the colour only agrees with them. */}
              <p className="mt-4 text-sm text-white/70">{t(locale, verdict.lead)}</p>
              <p className={cn("tnum mt-1.5 text-[40px] font-bold leading-none tracking-tight sm:text-[46px]", verdict.colour)}>
                {verdict.figure}
              </p>

              <div className="mt-6">
                {month.marginPct === null ? (
                  <p className="rounded-lg bg-white/10 px-3 py-2.5 text-xs leading-snug text-white/80">
                    {t(locale, "Nothing has been billed this month yet, so there is no margin to show.")}
                  </p>
                ) : month.marginPct < 0 ? (
                  /* A loss gets a picture too: the cost bar runs past the billed
                     bar, and the overspend is the difference. */
                  <div className="space-y-2.5">
                    <p className="text-xs font-medium leading-snug text-white/90">
                      {t(locale, "Costs came in above everything billed.")}
                    </p>
                    {(() => {
                      const scale = Math.max(month.billedTzs, month.costTzs, 1);
                      const bar = (value: number, className: string) => (
                        <span className="block h-2 rounded-full bg-white/10">
                          <span
                            className={cn("block h-2 rounded-full", className)}
                            style={{ width: `${Math.max(2, (value / scale) * 100)}%` }}
                          />
                        </span>
                      );
                      return (
                        <div className="space-y-2">
                          <div>
                            <div className="mb-1 flex items-baseline justify-between gap-2">
                              <span className="text-[11px] text-white/60">{t(locale, "Billed")}</span>
                              <span className="tnum text-[11px] font-semibold text-white">{tzs(month.billedTzs)}</span>
                            </div>
                            {bar(month.billedTzs, "bg-white/70")}
                          </div>
                          <div>
                            <div className="mb-1 flex items-baseline justify-between gap-2">
                              <span className="text-[11px] text-white/60">{t(locale, "Cost")}</span>
                              <span className="tnum text-[11px] font-semibold text-signal">{tzs(month.costTzs)}</span>
                            </div>
                            {bar(month.costTzs, "bg-signal")}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                ) : (
                  <MarginRing
                    pct={month.marginPct}
                    label={t(locale, "Margin")}
                    caption={t(locale, "of everything billed this month survives its costs")}
                  />
                )}
              </div>

              <div className="mt-auto grid grid-cols-2 gap-3 border-t border-white/10 pt-4">
                <div className="min-w-0">
                  <p className="text-xs text-white/60">{t(locale, "Billed this month")}</p>
                  <p className="tnum mt-1 truncate text-sm font-semibold text-white">{tzs(month.billedTzs)}</p>
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-white/60">{t(locale, "What it cost")}</p>
                  <p className="tnum mt-1 truncate text-sm font-semibold text-white">{tzs(month.costTzs)}</p>
                </div>
              </div>
            </div>
          </BentoCard>

          <BentoCard href="/app/finance/ledger">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-sm font-semibold">{t(locale, "Money in and out")}</h3>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {t(locale, "Payments received against costs paid, this year")}
                </p>
              </div>
              <ArrowRight className="mt-1 size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
            </div>

            {overview.flow.length < 2 || (inThisYear === 0 && outThisYear === 0) ? (
              /* A flat pair of lines at zero looks like a chart that failed to
                 load, and one month draws a single point with no line through
                 it. Said in words instead. */
              <p className="mt-4 text-sm leading-snug text-muted-foreground">
                {t(
                  locale,
                  overview.flow.length < 2
                    ? "One month in. A shape needs two, so the chart starts next month."
                    : "No money has come in or gone out yet this year. The chart starts with the first payment."
                )}
              </p>
            ) : (
              <>
                <MoneyFlowChart
                  labels={overview.flow.map((m) => m.label)}
                  moneyIn={overview.flow.map((m) => m.in)}
                  moneyOut={overview.flow.map((m) => m.out)}
                  currentIndex={overview.flow.length - 1}
                  title={t(locale, "Payments received against costs paid, this year")}
                />
                <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 border-t pt-3">
                  <span className="inline-flex items-baseline gap-2 text-xs">
                    <span aria-hidden className="size-2 translate-y-[1px] rounded-full bg-chart-4" />
                    <span className="text-muted-foreground">{t(locale, "In, this year")}</span>
                    <span className="tnum font-semibold">{tzs(inThisYear)}</span>
                  </span>
                  <span className="inline-flex items-baseline gap-2 text-xs">
                    <span aria-hidden className="size-2 translate-y-[1px] rounded-full bg-chart-3" />
                    <span className="text-muted-foreground">{t(locale, "Out, this year")}</span>
                    <span className="tnum font-semibold">{tzs(outThisYear)}</span>
                  </span>
                </div>
              </>
            )}
          </BentoCard>
        </div>

        {/* ONE PANEL, AND IT NAMES THE ACCOUNTS. Two panels side by side can
            disagree about their height; two columns inside one card cannot. */}
        <div className="mt-3 rounded-xl border bg-card p-4 shadow-soft">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="text-sm font-semibold">{t(locale, "Where the money sits")}</h3>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {t(locale, "Every company account, in its own currency, and when it was last checked")}
              </p>
            </div>
            <div className="flex items-start gap-4">
              <div className="text-right">
                <p className="tnum text-[22px] font-bold leading-none">
                  {tzs(overview.heldTzs)}
                  {unconvertedHeld}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">{t(locale, "held in total, at today's rate")}</p>
              </div>
              <Link
                href="/app/finance/accounts"
                className="focus-ring mt-1 inline-flex shrink-0 items-center gap-1 rounded-md text-xs font-semibold text-brand hover:underline"
              >
                {t(locale, "Check accounts")}
                <ArrowRight className="size-3.5" />
              </Link>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.75fr)_minmax(0,1fr)] lg:gap-6">
            <AccountRail rows={accountRows} empty={t(locale, "No account has been set up yet.")} />

            <div className="flex flex-col justify-between gap-4 border-t pt-4 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
              <RailStat
                label={t(locale, "Collected against billed")}
                headline={
                  collection === null
                    ? t(locale, "Nothing billed")
                    : collection >= 80
                      ? t(locale, "Collecting well")
                      : collection >= 40
                        ? t(locale, "Half the month is out")
                        : t(locale, "Barely collecting")
                }
                ringPct={collection ?? undefined}
                ringLabel={t(locale, "Share of this month's billing already paid")}
                hint={
                  collection === null
                    ? t(locale, "nothing billed this month yet")
                    : t(locale, "of this month's billing has come back")
                }
                icon={Wallet}
                tone={collection === null ? "info" : collection >= 60 ? "success" : "warning"}
              />
              <RailStat
                label={t(locale, "Customers using credit")}
                headline={count(overview.customersOnCredit)}
                hint={t(locale, "carrying a live credit balance right now")}
                icon={CreditCard}
                tone="info"
                href="/app/finance/credit"
              />
              <RailStat
                label={t(locale, "Accounts to check")}
                headline={count(overview.accountsToCheck)}
                hint={
                  overview.accountsToCheck === 0
                    ? t(locale, "every account has been checked since it last moved")
                    : t(locale, "never checked, or moved since the last check")
                }
                icon={Scale}
                tone={overview.accountsToCheck === 0 ? "success" : "warning"}
                href="/app/finance/accounts"
              />
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------ container profitability */}
      <section>
        <BandHeading
          title={t(locale, "What each container is making")}
          hint={t(locale, "The company earns per sailing. A month-level profit cannot tell you which box paid for itself.")}
          action={{ href: "/app/finance/containers", label: t(locale, "Every container") }}
        />
        <ContainerProfitTable containers={overview.containerProfit} locale={locale} />
      </section>

      {/* -------------------------------------------------------- the briefing */}
      <section>
        <BandHeading
          title={t(locale, "The briefing")}
          hint={t(
            locale,
            "Short readings, hardest-hitting first. A figure says how much; only a comparison says whether that is good."
          )}
        />
        <Briefing items={overview.insights} locale={locale} />
      </section>

      {/* ---------------------------------------------------- cargo in motion */}
      <section>
        <BandHeading
          title={t(locale, "Cargo in motion")}
          hint={t(locale, "Everything the business is carrying, Guangzhou to the counter.")}
          action={{ href: "/app/cargo", label: t(locale, "Every consignment") }}
        />

        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4 xl:items-stretch">
          <BentoCard accent="brand" href="/app/inventory">
            <Figure
              className="flex-1"
              label={t(locale, "Volume on the floor")}
              value={`${operations.cbmOnFloor.toFixed(2)} CBM`}
              hint={t(locale, "measured at Dar and not yet handed over")}
              icon={Ruler}
              tone="brand"
            />
          </BentoCard>
          <BentoCard accent="warn" href="/app/inventory">
            <Figure
              className="flex-1"
              label={t(locale, "Held, no pickup note")}
              value={count(operations.heldNoNote)}
              hint={t(locale, "at Dar with nothing yet allowing it to go")}
              icon={Warehouse}
              tone={operations.heldNoNote > 0 ? "warn" : "plain"}
            />
          </BentoCard>
          <BentoCard accent="good" href="/app/release/collected">
            <Figure
              className="flex-1"
              label={t(locale, "Handed over this month")}
              value={count(operations.releasedThisMonth)}
              hint={t(locale, "released to the receiver since the 1st")}
              icon={PackageCheck}
              tone="good"
            />
          </BentoCard>
          <BentoCard accent="info" href="/app/cargo">
            <Figure
              label={t(locale, "Registered this year")}
              value={count(operations.registeredThisYear)}
              icon={ClipboardCheck}
              tone="info"
            />
            {operations.registeredByMonth.length > 1 ? (
              <div className="mt-auto pt-4">
                <Sparkline
                  values={operations.registeredByMonth}
                  tone={2}
                  width={240}
                  height={36}
                  label={t(locale, "Consignments registered, month by month")}
                  className="h-9 w-full"
                />
                <p className="mt-1.5 text-xs leading-snug text-muted-foreground">
                  {t(locale, "month by month")} · {new Date().getFullYear()}
                </p>
              </div>
            ) : (
              <p className="mt-auto pt-4 text-xs leading-snug text-muted-foreground">
                {t(locale, "one month in — there is no shape to draw yet")}
              </p>
            )}
          </BentoCard>
        </div>

        <div className="mt-3">
          <BentoCard>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-sm font-semibold">{t(locale, "The containers themselves")}</h3>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {t(locale, "Containers, not consignments — the boxes, not what is in them")}
                </p>
              </div>
              <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-marine/10 text-marine">
                <Ship className="size-4" />
              </span>
            </div>

            <PipelineStrip
              stages={[
                {
                  key: "loading",
                  label: t(locale, "Loading in Guangzhou"),
                  value: count(operations.containersLoading),
                  hint: t(locale, "open, loading or sealed"),
                  icon: Container,
                  href: "/app/containers/loading",
                  tone: "info",
                },
                {
                  key: "sea",
                  label: t(locale, "At sea"),
                  value: count(operations.containersAtSea),
                  hint: t(locale, "departed, not yet arrived"),
                  icon: Ship,
                  href: "/app/containers?status=IN_TRANSIT",
                  tone: "brand",
                },
                {
                  key: "arrived",
                  label: t(locale, "Arrived, not finished"),
                  value: count(operations.containersArrived),
                  hint: t(locale, "landed and not yet closed"),
                  icon: Anchor,
                  href: "/app/containers/arrived",
                  tone: operations.containersArrived > 0 ? "warn" : "good",
                },
              ]}
            />
          </BentoCard>
        </div>

        <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2 lg:items-stretch">
          <BentoCard href="/app/cargo">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-sm font-semibold">{t(locale, "Where the cargo is")}</h3>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {t(locale, "Mutually exclusive, and they add up to everything")}
                </p>
              </div>
              <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand/10 text-brand">
                <Package className="size-4" />
              </span>
            </div>

            <CorridorBar
              total={position.total}
              totalLabel={t(locale, "consignments in the business")}
              empty={t(locale, "The business is carrying nothing right now — everything received has been handed over.")}
              caption={t(locale, "Shares, not counts: each desk states its own count on the cards at the foot of this page.")}
              segments={[
                { key: "china", label: t(locale, "In Guangzhou, waiting to ship"), count: position.inChina, tone: 2 },
                { key: "sea", label: t(locale, "At sea"), count: position.atSea, tone: 1 },
                { key: "floor", label: t(locale, "On the Dar floor"), count: position.onFloor, tone: 4 },
                { key: "ready", label: t(locale, "Cleared, not collected"), count: position.ready, tone: 5 },
                { key: "flagged", label: t(locale, "Under investigation"), count: position.flagged, tone: 3 },
              ]}
            />
          </BentoCard>
          <div className="flex flex-col [&>section]:flex-1">
            <CargoMix
              slices={overview.mix.slices}
              totalLines={overview.mix.totalLines}
              totalCbm={overview.mix.totalCbm}
              periodLabel={`${t(locale, "Received in the last")} ${overview.mix.days} ${t(locale, "days")}`}
              unclassifiedName={t(locale, "Not classified")}
              locale={locale}
            />
          </div>
        </div>

        <div className="mt-3">
          <BentoCard href="/app/containers">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-sm font-semibold">{t(locale, "What each container carried")}</h3>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {t(locale, "Volume loaded, the last eight containers, oldest first")}
                </p>
              </div>
              <ArrowRight className="mt-1 size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
            </div>
            {overview.carried.length === 0 ? (
              <p className="mt-4 text-sm leading-snug text-muted-foreground">
                {t(locale, "No container has sailed yet, so there is nothing to compare.")}
              </p>
            ) : (
              <ActivityBars className="mt-4" points={overview.carried} unit="CBM" />
            )}
          </BentoCard>
        </div>
      </section>

      {/* --------------------------------------------------------- the company */}
      <section>
        <BandHeading
          title={t(locale, "The company")}
          hint={t(locale, "What is standing still until you decide, and who it is standing on.")}
          action={{ href: "/app/manager/approvals", label: t(locale, "Every queue") }}
        />

        {/* items-start: a short card is not stretched to the tallest one and
            left as a panel of empty ground. */}
        <div className="grid grid-cols-1 items-start gap-3 lg:grid-cols-3">
          <BentoCard>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-sm font-semibold">{t(locale, "Waiting on you")}</h3>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {t(locale, "Nothing below moves until somebody decides")}
                </p>
              </div>
              <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-warning/10 text-warning">
                <ClipboardCheck className="size-4" />
              </span>
            </div>

            <QueueList
              lines={[
                {
                  key: "decisions",
                  label: t(locale, "Decisions queued"),
                  value: count(company.decisions),
                  note:
                    company.oldestDecisionDays === null
                      ? t(locale, "nothing is sitting")
                      : `${t(locale, "oldest")} ${company.oldestDecisionDays}${t(locale, "d")}`,
                  href: "/app/manager/approvals",
                  icon: ClipboardCheck,
                  tone:
                    (company.oldestDecisionDays ?? 0) >= 3 ? "bad" : company.decisions > 0 ? "warn" : "plain",
                },
                {
                  key: "sign-off",
                  label: t(locale, "Containers to sign off"),
                  value: count(company.toSignOff),
                  note:
                    company.oldestSignOffDays === null
                      ? t(locale, "every landed container is closed")
                      : `${t(locale, "oldest")} ${company.oldestSignOffDays}${t(locale, "d")}`,
                  href: "/app/manager/reconciliation",
                  icon: Signature,
                  tone: company.toSignOff > 0 ? "warn" : "plain",
                },
                {
                  key: "payroll",
                  label: t(locale, "Payroll to agree"),
                  value: count(company.payrollWaiting),
                  note: company.payroll
                    ? `${t(locale, company.payroll.label)} · ${t(locale, PAYROLL_STATUS[company.payroll.status])}`
                    : t(locale, "no run has been built yet"),
                  href: "/app/manager/payroll",
                  icon: Wallet,
                  tone: company.payrollWaiting > 0 ? "bad" : "plain",
                },
              ]}
            />
          </BentoCard>

          <BentoCard>
            <Figure
              label={t(locale, "Customers on the books")}
              value={count(company.customers.total)}
              icon={Users}
              tone="brand"
            />
            <StatRows
              rows={[
                {
                  key: "new",
                  label: t(locale, "New this month"),
                  value: count(company.customers.newThisMonth),
                  href: "/app/customers",
                },
                {
                  key: "reply",
                  label: t(locale, "Waiting on our reply"),
                  value: count(company.customers.awaitingReply),
                  tone: company.customers.awaitingReply > 0 ? "warn" : "plain",
                  href: "/app/support/tickets",
                },
                {
                  key: "overdue",
                  label: t(locale, "Overdue on credit"),
                  value: count(company.customers.overdueOnCredit),
                  tone: company.customers.overdueOnCredit > 0 ? "bad" : "plain",
                  href: "/app/finance/credit",
                },
              ]}
            />
          </BentoCard>

          <BentoCard>
            <Figure
              label={t(locale, "Signing in and working")}
              value={count(company.staff.total)}
              icon={Users}
              tone="info"
            />
            <StatRows
              rows={[
                {
                  key: "seen",
                  label: t(locale, "Opened the app today"),
                  value: count(company.staff.seenToday),
                  href: "/app/admin/users",
                },
                {
                  key: "suspended",
                  label: t(locale, "Suspended"),
                  value: count(company.staff.suspended),
                  tone: company.staff.suspended > 0 ? "warn" : "plain",
                  href: "/app/admin/users",
                },
              ]}
            />
          </BentoCard>
        </div>

        <div className="mt-3 flex flex-col gap-2 rounded-xl border bg-card px-4 py-3 sm:flex-row sm:items-center">
          <div className="flex flex-wrap items-center gap-1.5">
            {company.staff.byDepartment.map((row) => (
              <span
                key={row.department}
                className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px]"
              >
                <span className="text-muted-foreground">{t(locale, row.label)}</span>
                <span className="tnum font-semibold">{row.count}</span>
              </span>
            ))}
          </div>
          {/* Said out loud, because the figure above invites the wrong reading.
              There is no clock-in here: somebody on the floor all day who never
              opened the app is missing from it, and a manager who read it as
              attendance would be disciplining the wrong person. */}
          <p className="text-xs leading-snug text-muted-foreground sm:ml-auto sm:max-w-sm sm:text-right">
            {t(locale, "Attendance is not tracked. Opened the app today means exactly that, and nothing more.")}
          </p>
        </div>
      </section>

      {/* ----------------------------------------------------------- the desks */}
      <section>
        <BandHeading
          title={t(locale, "Every desk, right now")}
          hint={t(locale, "Each desk's own standing count, and the one thing wrong on it.")}
          action={{ href: "/app/manager/control", label: t(locale, "Every desk in full") }}
        />
        <DeskPulsePanel desks={overview.desks} locale={locale} />
      </section>

      <ActivityFeed
        locale={locale}
        entries={overview.activity.map((entry) => ({
          id: entry.id,
          action: entry.action,
          summary: entry.summary,
          createdAt: entry.createdAt,
          actorName: entry.actor?.name ?? entry.actorEmail ?? null,
        }))}
        title={t(locale, "Company activity")}
        description={t(locale, "Every privileged action, newest first")}
        href="/app/admin/audit"
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// The briefing
// ---------------------------------------------------------------------------

const INSIGHT_TONES: Record<InsightTone, { icon: LucideIcon; chip: string; rule: string; name: string }> = {
  good: { icon: TrendingUp, chip: "bg-success/10 text-success", rule: "bg-success", name: "Good news" },
  warn: { icon: AlertTriangle, chip: "bg-warning/10 text-warning", rule: "bg-warning", name: "Watch this" },
  bad: { icon: TrendingDown, chip: "bg-destructive/10 text-destructive", rule: "bg-destructive", name: "Bad news" },
  neutral: { icon: Info, chip: "bg-muted text-muted-foreground", rule: "bg-muted-foreground/40", name: "Worth knowing" },
};

/**
 * The sentences worth reading before any number, ordered by how much each ought
 * to change a decision this morning.
 *
 * The tone is NAMED as well as coloured. "Bad news" in red and "Good news" in
 * green are the same card to a reader who cannot separate the two, and this is
 * the one panel on the page whose entire content is a judgement.
 */
function Briefing({ items, locale }: { items: Insight[]; locale: Locale }) {
  if (items.length === 0) {
    /* A clear month still gets a sentence. An empty panel reads as a screen that
       failed to load, not as a business with nothing to report. */
    return (
      <p className="rounded-xl border bg-card px-4 py-3 text-sm text-muted-foreground shadow-soft">
        {t(locale, "Nothing has moved enough to be worth a sentence. The figures below are the whole story.")}
      </p>
    );
  }

  return (
    <div
      className={cn(
        "grid grid-cols-1 gap-3",
        items.length === 1 ? "" : items.length === 2 ? "sm:grid-cols-2" : "sm:grid-cols-2 xl:grid-cols-3"
      )}
    >
      {items.map((item) => {
        const tone = INSIGHT_TONES[item.tone];
        const Icon = tone.icon;
        return (
          <Link
            key={item.id}
            href={item.href}
            className="focus-ring group relative flex items-start gap-3 overflow-hidden rounded-xl border bg-card p-4 pl-5 shadow-soft transition-[transform,box-shadow] duration-200 ease-out-expo hover:scale-[1.015] hover:shadow-raised motion-reduce:hover:scale-100"
          >
            <span aria-hidden className={cn("absolute inset-y-0 left-0 w-1", tone.rule)} />
            <span className={cn("inline-flex size-7 shrink-0 items-center justify-center rounded-lg", tone.chip)}>
              <Icon className="size-3.5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                {t(locale, tone.name)}
              </span>
              <span className="mt-1 block text-[15px] font-medium leading-snug">{item.text}</span>
            </span>
            <ArrowRight className="mt-0.5 size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
          </Link>
        );
      })}
    </div>
  );
}
