import Link from "next/link";
import { ArrowRight, type LucideIcon } from "lucide-react";

import { Ring } from "@/components/charts/ring";
import { areaPath, ringGeometry, scalePoints, smoothPath } from "@/lib/chart";
import { cn } from "@/lib/utils";

import { Tx } from "@/components/app/tx";
/**
 * The manager's home, as furniture.
 *
 * A screen of forty numbers set at the same size in the same box is a data
 * dump: the eye has to read all of it to find the part that matters, so it
 * reads none of it. A route through a screen is made of things that are
 * different sizes — one panel that owns the band, a chart beside it, smaller
 * cells around them. These are those pieces.
 *
 * SERVER-ONLY, all of it. Plain functions returning markup, no state, no
 * effects, so the whole page ships as HTML and the charts are painted before
 * the browser has parsed a line of JavaScript.
 *
 * IT SPEAKS NO ENGLISH. Every string arrives already through `t(locale, …)` at
 * the call site, because a component cannot know which dictionary the reader
 * wants without becoming async.
 *
 * THE PALETTE IS THE APP'S: brand, marine, signal, success, warning and the six
 * chart tokens. The ink panel's accent is the signal orange — the sun on the
 * logo — rather than a colour this page invents.
 */

// ---------------------------------------------------------------------------
// The grid furniture
// ---------------------------------------------------------------------------

/**
 * The rule above a band.
 *
 * A short orange hairline rather than a heavier heading: this screen is many
 * bands deep, and that many full-weight titles would out-shout the figures they
 * introduce.
 */
export function BandHeading({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: { href: string; label: string };
}) {
  return (
    <div className="mb-3 flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
      <div className="min-w-0">
        <span
          aria-hidden
          className="mb-2 block h-[2px] w-10 rounded-full bg-gradient-to-r from-signal to-transparent"
        />
        <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          {title}
        </h2>
        {hint ? <p className="mt-1 text-xs leading-snug text-muted-foreground">{hint}</p> : null}
      </div>
      {action ? (
        <Link
          href={action.href}
          className="focus-ring inline-flex shrink-0 items-center gap-1 rounded text-xs font-semibold text-brand hover:underline"
        >
          <Tx>{action.label}</Tx>
          <ArrowRight className="size-3.5" />
        </Link>
      ) : null}
    </div>
  );
}

/**
 * Three surfaces, and no fourth. `ink` is the hero's deep navy — the same in
 * both themes, like a printed cover — and it is used ONCE per screen. Use it
 * twice and there is no headline again.
 */
const CARD_TONES = {
  card: "border bg-card",
  quiet: "border bg-muted/30",
  ink: "border-white/10 bg-ink text-white",
} as const;

/**
 * A card that wears the colour of what it says. Written out in full because
 * Tailwind scans source text: `from-${tone}/10` is a class that never exists.
 */
const CARD_ACCENTS = {
  brand:
    "before:absolute before:inset-x-6 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-brand/60 before:to-transparent before:content-[''] border border-brand/25 bg-gradient-to-br from-brand/[0.13] via-card to-card hover:border-brand/45",
  good:
    "before:absolute before:inset-x-6 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-success/60 before:to-transparent before:content-[''] border border-success/25 bg-gradient-to-br from-success/[0.13] via-card to-card hover:border-success/45",
  warn:
    "before:absolute before:inset-x-6 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-warning/60 before:to-transparent before:content-[''] border border-warning/25 bg-gradient-to-br from-warning/[0.13] via-card to-card hover:border-warning/45",
  bad:
    "before:absolute before:inset-x-6 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-destructive/60 before:to-transparent before:content-[''] border border-destructive/25 bg-gradient-to-br from-destructive/[0.13] via-card to-card hover:border-destructive/45",
  info:
    "before:absolute before:inset-x-6 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-marine/60 before:to-transparent before:content-[''] border border-marine/25 bg-gradient-to-br from-marine/[0.13] via-card to-card hover:border-marine/45",
} as const;

export type CardAccent = keyof typeof CARD_ACCENTS;

/**
 * One cell of the bento. A link cell lifts slightly under the cursor; a cell
 * that goes nowhere does not move, because a thing that animates under the
 * pointer and then does nothing when pressed is a lie about what it is.
 */
export function BentoCard({
  href,
  tone = "card",
  accent,
  className,
  children,
}: {
  href?: string;
  tone?: keyof typeof CARD_TONES;
  accent?: CardAccent;
  className?: string;
  children: React.ReactNode;
}) {
  const shell = cn(
    "group relative flex flex-col overflow-hidden rounded-xl p-4 shadow-soft transition-[transform,box-shadow,border-color] duration-200 ease-out-expo",
    accent ? CARD_ACCENTS[accent] : CARD_TONES[tone],
    href && "hover:scale-[1.015] hover:shadow-raised motion-reduce:hover:scale-100",
    className
  );

  return href ? (
    <Link href={href} className={cn("focus-ring", shell)}>
      {children}
    </Link>
  ) : (
    <div className={shell}>{children}</div>
  );
}

/** Colour carries meaning on a figure, so it is spent carefully. */
const FIGURE_TONES = {
  plain: "text-foreground",
  brand: "text-brand",
  good: "text-success",
  warn: "text-warning",
  bad: "text-destructive",
  info: "text-marine",
} as const;

const CHIP_TONES = {
  plain: "bg-muted text-muted-foreground ring-1 ring-inset ring-border",
  brand: "bg-brand/15 text-brand ring-1 ring-inset ring-brand/30",
  good: "bg-success/15 text-success ring-1 ring-inset ring-success/30",
  warn: "bg-warning/15 text-warning ring-1 ring-inset ring-warning/30",
  bad: "bg-destructive/15 text-destructive ring-1 ring-inset ring-destructive/30",
  info: "bg-marine/15 text-marine ring-1 ring-inset ring-marine/30",
} as const;

const STAGE_TINTS = {
  plain: "border-border bg-muted/25",
  brand: "border-brand/25 bg-brand/[0.07]",
  good: "border-success/25 bg-success/[0.07]",
  warn: "border-warning/25 bg-warning/[0.07]",
  bad: "border-destructive/25 bg-destructive/[0.07]",
  info: "border-marine/25 bg-marine/[0.07]",
} as const;

export type FigureTone = keyof typeof FIGURE_TONES;

/** A labelled number inside a cell. */
export function Figure({
  label,
  value,
  hint,
  icon: Icon,
  tone = "plain",
  className,
}: {
  label: string;
  value: string;
  hint?: string;
  icon?: LucideIcon;
  tone?: FigureTone;
  className?: string;
}) {
  return (
    /* No height of its own. A cell that wants the hint pinned to its foot passes
       `flex-1`; one that stacks something under the figure does not. */
    <div className={cn("flex flex-col", className)}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-[13px] font-medium leading-snug text-muted-foreground">{label}</p>
        {Icon ? (
          <span
            className={cn(
              "inline-flex size-7 shrink-0 items-center justify-center rounded-lg",
              CHIP_TONES[tone]
            )}
          >
            <Icon className="size-3.5" />
          </span>
        ) : null}
      </div>
      <p
        className={cn(
          "tnum mt-3 text-[26px] font-bold leading-none tracking-tight",
          FIGURE_TONES[tone]
        )}
      >
        {value}
      </p>
      {hint ? (
        <p className="mt-auto pt-2.5 text-xs leading-snug text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// The ink panel
// ---------------------------------------------------------------------------

/**
 * The month's margin, drawn on the ink panel.
 *
 * Its own ring rather than the shared <Ring>: that one draws its track in the
 * border colour, which disappears against this panel. A ring only when there IS
 * a margin — a month that billed nothing, or lost money, is not an arc.
 */
export function MarginRing({
  pct,
  label,
  caption,
}: {
  pct: number;
  label: string;
  caption: string;
}) {
  const size = 74;
  const stroke = 7;
  const { radius, circumference, centre } = ringGeometry(size, stroke);
  const value = Math.min(100, Math.max(0, pct));
  const offset = circumference * (1 - value / 100);

  return (
    <div className="flex items-center gap-3">
      <div
        className="relative shrink-0"
        style={{ width: size, height: size }}
        role="img"
        aria-label={`${label}: ${Math.round(value)}%`}
      >
        <svg width={size} height={size} className="-rotate-90">
          <circle cx={centre} cy={centre} r={radius} fill="none" strokeWidth={stroke} stroke="hsl(0 0% 100% / 0.14)" />
          <circle
            cx={centre}
            cy={centre}
            r={radius}
            fill="none"
            strokeWidth={stroke}
            strokeLinecap="round"
            stroke="hsl(var(--signal))"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
          />
        </svg>
        <span className="tnum absolute inset-0 flex items-center justify-center text-base font-bold text-white">
          {Math.round(value)}%
        </span>
      </div>
      <div className="min-w-0">
        <p className="text-[13px] font-semibold text-white">{label}</p>
        <p className="mt-0.5 text-xs leading-snug text-white/65">{caption}</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Where the money sits
// ---------------------------------------------------------------------------

export type AccountRow = {
  key: string;
  name: string;
  /** Translated: "Bank", "Mobile money", "Cash". */
  kind: string;
  colour: string;
  /** Formatted in the account's OWN currency — never restated in shillings. */
  display: string;
  /** Signed, for the bar's length and for which way it points. */
  value: number;
  /** "checked 3d ago", "never checked". */
  meta: string;
  flag?: string;
  href?: string;
};

/**
 * Every company account by name, by size, and by whether anyone has looked.
 *
 * THE BARS ARE MAGNITUDE, NOT SHARE. A share bar divides a total, so an
 * overdrawn account would have to be clamped to zero to keep the sum honest.
 * Each bar is that account against the largest one on the list, in its own
 * currency's figure, and red means below zero.
 *
 * THE SECOND LINE IS THE MANAGER'S JOB. A balance nobody has counted against a
 * statement or a till is the system agreeing with itself.
 */
export function AccountRail({
  rows,
  empty,
  className,
}: {
  rows: AccountRow[];
  empty: string;
  className?: string;
}) {
  const widest = Math.max(1, ...rows.map((row) => Math.abs(row.value)));

  if (rows.length === 0) {
    return <p className={cn("text-xs leading-snug text-muted-foreground", className)}>{empty}</p>;
  }

  return (
    <ul className={cn("space-y-2.5", className)}>
      {rows.map((row) => {
        const negative = row.value < 0;
        /* An empty account draws nothing: a floor applied to zero reads as
           "a little". */
        const width = row.value === 0 ? "0%" : `${Math.max(2, (Math.abs(row.value) / widest) * 100)}%`;
        const colour = negative ? "hsl(var(--destructive))" : row.colour;
        const body = (
          <>
            <div className="flex items-baseline gap-2">
              <span aria-hidden className="size-2 shrink-0 translate-y-[1px] rounded-full" style={{ background: colour }} />
              <span className="min-w-0 flex-1 truncate text-xs font-medium">{row.name}</span>
              {row.flag ? (
                <span className="shrink-0 rounded bg-destructive/10 px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-destructive">
                  {row.flag}
                </span>
              ) : null}
              <span
                className={cn(
                  "tnum shrink-0 text-xs font-semibold",
                  negative ? "text-destructive" : "text-foreground"
                )}
              >
                {row.display}
              </span>
            </div>
            <div className="mt-1.5 flex items-center gap-2 pl-4">
              <span className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
                <span aria-hidden className="block h-full rounded-full" style={{ width, background: colour }} />
              </span>
              <span className="shrink-0 text-[11px] uppercase tracking-wide text-muted-foreground">
                {row.kind} · {row.meta}
              </span>
            </div>
          </>
        );

        return (
          <li key={row.key}>
            {row.href ? (
              <Link href={row.href} className="focus-ring -mx-1.5 block rounded-lg px-1.5 py-1 transition-colors hover:bg-muted/40">
                {body}
              </Link>
            ) : (
              <div className="-mx-1.5 px-1.5 py-1">{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

const RAIL_RING: Record<"brand" | "info" | "success" | "warning", 1 | 2 | 3 | 4> = {
  brand: 1,
  info: 2,
  warning: 3,
  success: 4,
};

/**
 * One figure in a rail beside something bigger. Flat, because it sits inside a
 * card and a bordered box within a bordered box is clutter. If a ring draws the
 * percentage, the headline says what the percentage MEANS and never repeats it.
 */
export function RailStat({
  label,
  headline,
  hint,
  ringPct,
  ringLabel,
  tone = "brand",
  icon: Icon,
  href,
}: {
  label: string;
  headline: string;
  hint?: string;
  ringPct?: number;
  ringLabel?: string;
  tone?: "brand" | "info" | "success" | "warning";
  icon?: LucideIcon;
  href?: string;
}) {
  const HEADLINE = {
    brand: "text-foreground",
    info: "text-marine",
    success: "text-success",
    warning: "text-warning",
  };
  const CHIP = {
    brand: "bg-brand/10 text-brand",
    info: "bg-marine/10 text-marine",
    success: "bg-success/10 text-success",
    warning: "bg-warning/10 text-warning",
  };

  const body = (
    <div className="flex items-center gap-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          {Icon ? (
            <span className={cn("inline-flex size-6 shrink-0 items-center justify-center rounded-md", CHIP[tone])}>
              <Icon className="size-3.5" />
            </span>
          ) : null}
          <p className="truncate text-xs text-muted-foreground">{label}</p>
        </div>
        <p className={cn("tnum mt-1.5 text-[20px] font-bold leading-none tracking-tight", HEADLINE[tone])}>
          {headline}
        </p>
        {hint ? <p className="mt-1 text-[11px] leading-snug text-muted-foreground">{hint}</p> : null}
      </div>
      {ringPct !== undefined ? (
        /* The shared ring draws at most a full circle and prints its own
           percentage, so a month whose collections settled older bills reads
           100% rather than a figure that overflows the arc. */
        <Ring value={ringPct} total={100} tone={RAIL_RING[tone]} label={ringLabel ?? label} size={48} stroke={5} />
      ) : null}
    </div>
  );

  return href ? (
    <Link href={href} className="focus-ring -m-1.5 block rounded-lg p-1.5 transition-colors hover:bg-muted/40">
      {body}
    </Link>
  ) : (
    body
  );
}

// ---------------------------------------------------------------------------
// Where the cargo is
// ---------------------------------------------------------------------------

export type CorridorSegment = {
  key: string;
  label: string;
  count: number;
  /** chart-N token index. */
  tone: 1 | 2 | 3 | 4 | 5 | 6;
};

/**
 * Everything the business is carrying, as one bar from Guangzhou to the counter.
 *
 * SHARES, NOT COUNTS. Several of these segments are the same queries the desk
 * cards further down print as headlines, and one number under two labels on
 * one screen reads as a bug in the number. So this answers the question the
 * desk cards cannot — what proportion is sitting where — and leaves them the
 * counts. The total is printed once, here.
 */
export function CorridorBar({
  segments,
  total,
  totalLabel,
  caption,
  empty,
}: {
  segments: CorridorSegment[];
  total: number;
  totalLabel: string;
  caption: string;
  empty: string;
}) {
  if (total <= 0) {
    return <p className="mt-4 text-sm leading-snug text-muted-foreground">{empty}</p>;
  }

  const shares = segments.map((segment) => (segment.count / total) * 100);

  return (
    <div className="mt-3 flex flex-1 flex-col">
      <div className="flex items-baseline gap-2">
        <span className="tnum text-[40px] font-bold leading-none tracking-tight">
          {total.toLocaleString("en-US")}
        </span>
        <span className="text-sm text-muted-foreground">{totalLabel}</span>
      </div>

      <div
        className="mt-4 flex h-3 w-full gap-0.5 overflow-hidden rounded-full bg-muted"
        role="img"
        aria-label={segments.map((s, i) => `${s.label} ${Math.round(shares[i])}%`).join(", ")}
      >
        {segments.map((segment, index) => (
          <span
            key={segment.key}
            className="h-full first:rounded-l-full last:rounded-r-full"
            style={{ width: `${shares[index]}%`, background: `hsl(var(--chart-${segment.tone}))` }}
          />
        ))}
      </div>

      <ul className="mt-4 space-y-2.5">
        {segments.map((segment, index) => (
          <li key={segment.key} className="flex items-center gap-2.5">
            <span
              aria-hidden
              className="size-2.5 shrink-0 rounded-full"
              style={{ background: `hsl(var(--chart-${segment.tone}))` }}
            />
            <span className="min-w-0 flex-1 truncate text-[13px]"><Tx>{segment.label}</Tx></span>
            <span aria-hidden className="hidden h-1.5 w-20 overflow-hidden rounded-full bg-muted sm:block">
              <span
                className="block h-full rounded-full"
                style={{
                  width: `${Math.max(shares[index], segment.count > 0 ? 3 : 0)}%`,
                  background: `hsl(var(--chart-${segment.tone}))`,
                }}
              />
            </span>
            <span className="tnum w-9 shrink-0 text-right text-xs font-semibold">
              {Math.round(shares[index])}%
            </span>
          </li>
        ))}
      </ul>

      <p className="mt-auto pt-4 text-xs leading-snug text-muted-foreground">{caption}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Money in and out
// ---------------------------------------------------------------------------

/**
 * What arrived against what left, month by month, drawn on the server.
 *
 * Hand-rolled from lib/chart rather than <AreaChart>: that one is a client
 * component whose readout formats through a named descriptor, and this panel
 * states its two year totals in words underneath, which is the reading anyway.
 *
 * Two series, never one. A month where everything that came in went straight
 * back out looks exactly like a quiet month on a single line.
 */
export function MoneyFlowChart({
  labels,
  moneyIn,
  moneyOut,
  currentIndex,
  title,
}: {
  labels: string[];
  moneyIn: number[];
  moneyOut: number[];
  /** The month in progress, marked so it is not read as a fall. */
  currentIndex: number;
  title: string;
}) {
  const W = 640;
  const H = 170;
  const ceiling = Math.max(...moneyIn, ...moneyOut, 1);

  const inPoints = scalePoints(moneyIn, W, H, { min: 0, max: ceiling, padding: 8 });
  const outPoints = scalePoints(moneyOut, W, H, { min: 0, max: ceiling, padding: 8 });
  const step = labels.length > 1 ? W / (labels.length - 1) : W;

  return (
    <div className="mt-3 w-full flex-1">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-[170px] w-full"
        preserveAspectRatio="none"
        role="img"
        aria-label={title}
      >
        <defs>
          <linearGradient id="mgr-flow-in" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="hsl(var(--chart-4))" stopOpacity="0.30" />
            <stop offset="100%" stopColor="hsl(var(--chart-4))" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="mgr-flow-out" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="hsl(var(--chart-3))" stopOpacity="0.22" />
            <stop offset="100%" stopColor="hsl(var(--chart-3))" stopOpacity="0" />
          </linearGradient>
        </defs>

        {[0, 1, 2, 3].map((line) => (
          <line
            key={line}
            x1="0"
            y1={(H / 3) * line}
            x2={W}
            y2={(H / 3) * line}
            className="stroke-border"
            strokeWidth="1"
            strokeDasharray="4 6"
            vectorEffect="non-scaling-stroke"
          />
        ))}

        <path d={areaPath(outPoints, H)} fill="url(#mgr-flow-out)" />
        <path d={areaPath(inPoints, H)} fill="url(#mgr-flow-in)" />
        <path d={smoothPath(outPoints)} fill="none" stroke="hsl(var(--chart-3))" strokeWidth="2" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        <path d={smoothPath(inPoints)} fill="none" stroke="hsl(var(--chart-4))" strokeWidth="2" strokeLinecap="round" vectorEffect="non-scaling-stroke" />

        {currentIndex >= 0 && currentIndex < labels.length ? (
          <line
            x1={currentIndex * step}
            y1="0"
            x2={currentIndex * step}
            y2={H}
            className="stroke-foreground/25"
            strokeWidth="1"
            strokeDasharray="3 4"
            vectorEffect="non-scaling-stroke"
          />
        ) : null}
      </svg>

      <div className="mt-1.5 flex justify-between text-[11px] text-muted-foreground">
        {labels.map((label, index) => (
          <span key={`${label}-${index}`} className="tnum">
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The containers themselves
// ---------------------------------------------------------------------------

export type Stage = {
  key: string;
  label: string;
  value: string;
  hint: string;
  icon: LucideIcon;
  href: string;
  tone: FigureTone;
};

/**
 * Guangzhou, the sea, Dar — the three places a container is, in order. Drawn
 * as a run rather than three cards, because the order is the information: a
 * pile-up at one stage is the thing worth noticing.
 */
export function PipelineStrip({ stages }: { stages: Stage[] }) {
  return (
    <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
      {stages.map((stage, index) => {
        const Icon = stage.icon;
        return (
          <Link
            key={stage.key}
            href={stage.href}
            className={cn(
              "focus-ring relative flex flex-col justify-center rounded-lg border p-3 transition-colors",
              STAGE_TINTS[stage.tone],
              index < stages.length - 1 &&
                "sm:after:absolute sm:after:-right-2 sm:after:top-1/2 sm:after:z-10 sm:after:size-2 sm:after:-translate-y-1/2 sm:after:rotate-45 sm:after:border-r sm:after:border-t sm:after:border-border sm:after:bg-card sm:after:content-['']"
            )}
          >
            <span className={cn("inline-flex size-6 items-center justify-center rounded-md", CHIP_TONES[stage.tone])}>
              <Icon className="size-3.5" />
            </span>
            <p className={cn("tnum mt-2 text-[22px] font-bold leading-none", FIGURE_TONES[stage.tone])}>
              {stage.value}
            </p>
            <p className="mt-1 text-[13px] font-medium leading-tight"><Tx>{stage.label}</Tx></p>
            <p className="mt-0.5 text-xs leading-snug text-muted-foreground"><Tx>{stage.hint}</Tx></p>
          </Link>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// The decision queues
// ---------------------------------------------------------------------------

export type QueueLine = {
  key: string;
  label: string;
  value: string;
  /** The age, or what the empty queue means. Never a bare zero. */
  note: string;
  href: string;
  tone: FigureTone;
  icon: LucideIcon;
};

/**
 * What is standing still until this desk decides something. The AGE beside the
 * count, always: "eleven payments" is a to-do list, "eleven payments, the
 * oldest nine days" is the finding.
 */
export function QueueList({ lines }: { lines: QueueLine[] }) {
  return (
    <ul className="mt-2.5 flex flex-1 flex-col gap-1.5">
      {lines.map((line) => {
        const Icon = line.icon;
        return (
          <li key={line.key}>
            <Link
              href={line.href}
              className="focus-ring flex items-center gap-3 rounded-lg border bg-background/60 px-3 py-2 transition-colors hover:bg-muted/60"
            >
              <span className={cn("inline-flex size-8 shrink-0 items-center justify-center rounded-lg", CHIP_TONES[line.tone])}>
                <Icon className="size-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium"><Tx>{line.label}</Tx></span>
                <span className="mt-0.5 block truncate text-xs text-muted-foreground"><Tx>{line.note}</Tx></span>
              </span>
              <span className={cn("tnum shrink-0 text-[22px] font-bold leading-none", FIGURE_TONES[line.tone])}>
                {line.value}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Small facts stacked inside a cell. A row, not a tile: these are the detail
 * under a cell's own headline, and giving each a card is how a screen becomes a
 * wall of equal numbers.
 */
export function StatRows({
  rows,
}: {
  rows: { key: string; label: string; value: string; tone?: FigureTone; href?: string }[];
}) {
  return (
    <ul className="mt-3 divide-y">
      {rows.map((row) => {
        const body = (
          <span className="flex items-baseline justify-between gap-3 py-1.5">
            <span className="min-w-0 truncate text-xs text-muted-foreground"><Tx>{row.label}</Tx></span>
            <span className={cn("tnum shrink-0 text-sm font-semibold", FIGURE_TONES[row.tone ?? "plain"])}>
              {row.value}
            </span>
          </span>
        );
        return (
          <li key={row.key}>
            {row.href ? (
              <Link href={row.href} className="focus-ring block rounded px-0.5 transition-colors hover:bg-muted/50">
                {body}
              </Link>
            ) : (
              body
            )}
          </li>
        );
      })}
    </ul>
  );
}
