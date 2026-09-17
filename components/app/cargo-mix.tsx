import Link from "next/link";

import { t, type Locale } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export type MixSlice = {
  name: string;
  lines: number;
  cbm: number;
};

/**
 * What the business is actually carrying, by the company's own cargo types.
 *
 * Counted per goods line rather than per consignment, because the rate book
 * prices each line at its own type: a delivery of shoes and a machine is two
 * lines at two rates, and forcing it into one slice would say it was one kind of
 * goods. A donut rather than bars because the useful reading is a share —
 * "furniture is a third of what we send".
 */
const TONES = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
  "hsl(var(--chart-6))",
];

/* Goods nobody chose a type for take a grey wedge, never a colour from the
   rotation: they are not a kind of goods, and a large grey wedge is telling
   Finance that the rate book cannot price most of this month. */
const UNCLASSIFIED_TONE = "hsl(var(--muted-foreground) / 0.35)";

export function CargoMix({
  slices,
  totalLines,
  totalCbm,
  periodLabel,
  unclassifiedName,
  locale,
}: {
  /** Already sorted, biggest first, with the tail collapsed into "Other". */
  slices: MixSlice[];
  totalLines: number;
  totalCbm: number;
  periodLabel: string;
  /** The translated name the unclassified bucket was given. */
  unclassifiedName: string;
  locale: Locale;
}) {
  const toneFor = (name: string, index: number) =>
    name === unclassifiedName ? UNCLASSIFIED_TONE : TONES[index % TONES.length];

  if (totalLines === 0) {
    return (
      <section className="flex flex-col rounded-xl border bg-card p-5 shadow-soft">
        <h2 className="font-semibold">{t(locale, "What you are sending")}</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">{periodLabel}</p>
        <p className="mt-6 text-sm text-muted-foreground">{t(locale, "Nothing received yet in this period.")}</p>
      </section>
    );
  }

  const unclassified = slices.find((s) => s.name === unclassifiedName)?.lines ?? 0;
  const radius = 56;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  const arcs = slices.map((slice, index) => {
    const dash = (slice.lines / totalLines) * circumference;
    const arc = { key: slice.name, colour: toneFor(slice.name, index), dash, offset };
    offset += dash;
    return arc;
  });

  return (
    <section className="flex flex-col rounded-xl border bg-card p-5 shadow-soft">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">{t(locale, "What you are sending")}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">{periodLabel}</p>
        </div>
        <p className="tnum text-right text-xs text-muted-foreground">{totalCbm.toFixed(2)} CBM</p>
      </div>

      <div className="flex items-center justify-center py-2">
        <div className="relative">
          <svg viewBox="0 0 140 140" className="size-36 -rotate-90">
            <circle cx="70" cy="70" r={radius} fill="none" stroke="hsl(var(--muted))" strokeWidth="16" />
            {arcs.map((arc) => (
              <circle
                key={arc.key}
                cx="70"
                cy="70"
                r={radius}
                fill="none"
                stroke={arc.colour}
                strokeWidth="16"
                strokeDasharray={`${arc.dash} ${circumference - arc.dash}`}
                strokeDashoffset={-arc.offset}
              />
            ))}
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="tnum text-2xl font-bold leading-none">{totalLines.toLocaleString("en-US")}</span>
            <span className="mt-1 text-xs text-muted-foreground">{t(locale, "goods lines")}</span>
          </div>
        </div>
      </div>

      <ul className="mt-4 space-y-2">
        {slices.map((slice, index) => {
          const share = Math.round((slice.lines / totalLines) * 100);
          return (
            <li key={slice.name} className="flex items-center gap-2.5 text-sm">
              <span className="size-2.5 shrink-0 rounded-full" style={{ background: toneFor(slice.name, index) }} aria-hidden />
              <span className="min-w-0 flex-1 truncate">{slice.name}</span>
              <span className="tnum shrink-0 text-xs text-muted-foreground">{slice.lines}</span>
              <span
                className={cn(
                  "tnum w-9 shrink-0 text-right text-xs font-medium",
                  share >= 25 ? "text-foreground" : "text-muted-foreground"
                )}
              >
                {share}%
              </span>
            </li>
          );
        })}
      </ul>

      {unclassified > 0 ? (
        <Link
          href="/app/inventory"
          className="mt-4 block rounded-lg border border-warning/30 bg-warning/5 px-3 py-2.5 text-xs transition-colors hover:bg-warning/10"
        >
          <span className="font-medium text-warning">
            {unclassified} {t(locale, "line(s) without a cargo type")}
          </span>
          <span className="mt-0.5 block text-muted-foreground">
            {t(locale, "The rate book prices cargo by type, so these cannot be priced until one is chosen.")}
          </span>
        </Link>
      ) : null}
    </section>
  );
}
