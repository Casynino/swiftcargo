"use client";

import { useId, useState } from "react";

import { areaPath, scalePoints, smoothPath } from "@/lib/chart";
import { cn } from "@/lib/utils";

export type Series = {
  name: string;
  values: number[];
  tone: 1 | 2 | 3 | 4 | 5 | 6;
};

/**
 * Two series over time, with a hover readout.
 *
 * Client-side only for the crosshair — the chart itself is plain SVG, so the
 * first paint is the finished picture and hovering only moves a line.
 */
/**
 * How the readout formats its numbers.
 *
 * A descriptor rather than a function: this is a client component, and a
 * formatter passed down from a server page cannot cross the boundary — it
 * arrives as an un-callable placeholder and the render throws. Naming the
 * format instead keeps the prop serialisable.
 */
export type ValueFormat = "number" | "money" | "cbm" | "kg";

function render(value: number, format: ValueFormat, currency: string) {
  switch (format) {
    case "money":
      return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency,
        maximumFractionDigits: currency === "TZS" ? 0 : 2,
      }).format(value);
    case "cbm":
      return `${value.toFixed(3)} CBM`;
    case "kg":
      return `${value.toFixed(2)} kg`;
    default:
      return value.toLocaleString();
  }
}

export function AreaChart({
  series,
  labels,
  height = 220,
  format = "number",
  currency = "USD",
  className,
}: {
  series: Series[];
  labels: string[];
  height?: number;
  format?: ValueFormat;
  currency?: string;
  className?: string;
}) {
  const uid = useId().replace(/:/g, "");
  const [hover, setHover] = useState<number | null>(null);

  const W = 800;
  const H = height;
  const all = series.flatMap((s) => s.values);
  const max = Math.max(...all, 1);
  /* Round the ceiling up so gridlines land on numbers a person would say out
     loud, rather than on 3,847. */
  const step = Math.pow(10, Math.floor(Math.log10(max || 1)));
  const ceiling = Math.ceil(max / step) * step || 1;
  const gridLines = 4;

  const scaled = series.map((s) => ({
    ...s,
    points: scalePoints(s.values, W, H, { min: 0, max: ceiling, padding: 8 }),
  }));

  return (
    <div className={cn("w-full", className)}>
      <div className="mb-3 flex flex-wrap items-center gap-4">
        {series.map((s) => (
          <span
            key={s.name}
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"
          >
            <span
              className="size-1.5 rounded-full"
              style={{ background: `hsl(var(--chart-${s.tone}))` }}
            />
            {s.name}
          </span>
        ))}
      </div>

      <div className="relative">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full"
          style={{ height }}
          preserveAspectRatio="none"
          onMouseLeave={() => setHover(null)}
          role="img"
          aria-label={series.map((s) => s.name).join(" and ")}
        >
          <defs>
            {scaled.map((s) => (
              <linearGradient
                key={s.name}
                id={`${uid}-${s.tone}`}
                x1="0"
                y1="0"
                x2="0"
                y2="1"
              >
                <stop
                  offset="0%"
                  stopColor={`hsl(var(--chart-${s.tone}))`}
                  stopOpacity="0.26"
                />
                <stop
                  offset="100%"
                  stopColor={`hsl(var(--chart-${s.tone}))`}
                  stopOpacity="0.01"
                />
              </linearGradient>
            ))}
          </defs>

          {Array.from({ length: gridLines + 1 }).map((_, i) => {
            const y = (i / gridLines) * H;
            return (
              <line
                key={i}
                x1="0"
                y1={y}
                x2={W}
                y2={y}
                stroke="hsl(var(--border))"
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
              />
            );
          })}

          {scaled.map((s) => (
            <g key={s.name}>
              <path d={areaPath(s.points, H)} fill={`url(#${uid}-${s.tone})`} />
              <path
                d={smoothPath(s.points)}
                fill="none"
                stroke={`hsl(var(--chart-${s.tone}))`}
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
            </g>
          ))}

          {hover !== null && scaled[0]?.points[hover] ? (
            <line
              x1={scaled[0].points[hover].x}
              y1="0"
              x2={scaled[0].points[hover].x}
              y2={H}
              stroke="hsl(var(--foreground))"
              strokeOpacity="0.25"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
          ) : null}

          {scaled[0]?.points.map((p, i) =>
            hover === i
              ? scaled.map((s) => (
                  <circle
                    key={`${s.name}-${i}`}
                    cx={s.points[i].x}
                    cy={s.points[i].y}
                    r="4"
                    fill={`hsl(var(--chart-${s.tone}))`}
                    stroke="hsl(var(--card))"
                    strokeWidth="2"
                  />
                ))
              : null
          )}

          {/* Invisible hit areas, one per column. */}
          {labels.map((_, i) => (
            <rect
              key={i}
              x={(i / labels.length) * W}
              y={0}
              width={W / labels.length}
              height={H}
              fill="transparent"
              onMouseEnter={() => setHover(i)}
            />
          ))}
        </svg>

        {hover !== null ? (
          <div className="pointer-events-none absolute left-0 top-0 rounded-md border bg-popover px-2.5 py-1.5 text-xs shadow-soft">
            <p className="font-medium">{labels[hover]}</p>
            {series.map((s) => (
              <p key={s.name} className="tnum text-muted-foreground">
                {s.name}: {render(s.values[hover] ?? 0, format, currency)}
              </p>
            ))}
          </div>
        ) : null}
      </div>

      <div className="mt-2 flex justify-between text-[11px] text-muted-foreground">
        {labels.map((l, i) => (
          <span key={`${l}-${i}`} className="flex-1 truncate text-center">
            {l}
          </span>
        ))}
      </div>
    </div>
  );
}
