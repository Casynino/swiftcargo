import { cn } from "@/lib/utils";

export type AgeingBand = {
  label: string;
  value: number;
  tone: 1 | 2 | 3 | 4 | 5 | 6;
};

const FILLS: Record<AgeingBand["tone"], string> = {
  1: "bg-chart-1",
  2: "bg-chart-2",
  3: "bg-chart-3",
  4: "bg-chart-4",
  5: "bg-chart-5",
  6: "bg-chart-6",
};

/**
 * One bar, split into bands.
 *
 * How old the debt is, or how long cargo has been sitting. A stacked bar rather
 * than a column chart because the bands are parts of one pile and the reader's
 * question is what share of it is in the worst band — which a row of separate
 * columns makes them do arithmetic to answer.
 */
export function AgeingBar({
  bands,
  format = (n: number) => n.toLocaleString(),
  className,
}: {
  bands: AgeingBand[];
  format?: (n: number) => string;
  className?: string;
}) {
  const total = bands.reduce((sum, b) => sum + b.value, 0);

  return (
    <div className={cn("w-full", className)}>
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-secondary">
        {total > 0
          ? bands
              .filter((b) => b.value > 0)
              .map((band) => (
                <div
                  key={band.label}
                  className={cn("h-full transition-all", FILLS[band.tone])}
                  style={{ width: `${(band.value / total) * 100}%` }}
                  title={`${band.label}: ${format(band.value)}`}
                />
              ))
          : null}
      </div>

      <ul className="mt-3 grid gap-2 sm:grid-cols-2">
        {bands.map((band) => (
          <li key={band.label} className="flex items-center gap-2 text-sm">
            <span className={cn("size-2 shrink-0 rounded-full", FILLS[band.tone])} />
            <span className="flex-1 truncate text-muted-foreground">
              {band.label}
            </span>
            <span className="tnum font-medium">{format(band.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
