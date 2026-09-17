import { cn } from "@/lib/utils";

/**
 * Volume by period, server-rendered.
 *
 * Bars grow in with a staggered CSS transform so a dashboard feels alive on
 * first paint without shipping a byte of JavaScript for it. The value is hidden
 * until hover — a chart with a number over every bar is a table drawn badly.
 */
export function BarChart({
  data,
  height = 200,
  tone = 2,
  highlightIndex,
  formatValue = (n: number) => n.toLocaleString(),
  className,
}: {
  data: { label: string; value: number }[];
  height?: number;
  tone?: 1 | 2 | 3 | 4 | 5 | 6;
  /** Draws attention to one bar — usually the current month. */
  highlightIndex?: number;
  formatValue?: (n: number) => string;
  className?: string;
}) {
  const max = Math.max(...data.map((d) => d.value), 1);

  return (
    <div className={cn("w-full", className)}>
      <div
        className="flex items-end justify-between gap-1.5"
        style={{ height }}
        role="img"
        aria-label={data
          .map((d) => `${d.label}: ${formatValue(d.value)}`)
          .join(", ")}
      >
        {data.map((d, i) => {
          const pct = (d.value / max) * 100;
          const highlighted = highlightIndex === i;
          return (
            <div
              key={`${d.label}-${i}`}
              className="group relative flex h-full flex-1 flex-col justify-end"
            >
              <span className="tnum pointer-events-none absolute -top-1 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-md border bg-popover px-1.5 py-0.5 text-xs opacity-0 shadow-soft transition-opacity group-hover:opacity-100">
                {formatValue(d.value)}
              </span>
              <div
                className={cn(
                  "w-full origin-bottom rounded-t-[3px] transition-all duration-500 ease-out-expo",
                  highlighted
                    ? "opacity-100"
                    : "opacity-75 group-hover:opacity-100"
                )}
                style={{
                  /* A floor of 2% so a genuine zero still shows a hairline —
                     an empty column and a missing column look identical
                     otherwise, and they mean different things. */
                  height: `${Math.max(2, pct)}%`,
                  background: highlighted
                    ? `hsl(var(--chart-${tone}))`
                    : `linear-gradient(to top, hsl(var(--chart-${tone}) / 0.9), hsl(var(--chart-${tone}) / 0.4))`,
                }}
              />
            </div>
          );
        })}
      </div>

      <div className="mt-2 flex justify-between gap-1.5 text-[11px] text-muted-foreground">
        {data.map((d, i) => (
          <span key={`${d.label}-l-${i}`} className="flex-1 truncate text-center">
            {d.label}
          </span>
        ))}
      </div>
    </div>
  );
}
