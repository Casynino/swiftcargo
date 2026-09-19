import { cn } from "@/lib/utils";

import { Tx } from "@/components/app/tx";
export type BarPoint = { label: string; value: number };

/**
 * A bar per item, and it has to read at three bars as well as at fourteen.
 *
 * The width of a bar is capped rather than divided: with flex-1 alone three
 * containers render as three flat slabs the width of a hand. Few bars get their
 * names and their figures printed; past eight the labels collide, so only the
 * ends are named and the figures go into the tooltip.
 */
export function ActivityBars({
  points,
  unit,
  className,
  format,
}: {
  points: BarPoint[];
  /** Appended to the tooltip figure: "12.40 m³". */
  unit: string;
  className?: string;
  format?: (value: number) => string;
}) {
  const max = Math.max(1, ...points.map((p) => p.value));
  const sparse = points.length <= 8;
  const show = format ?? ((v: number) => v.toLocaleString("en-US"));

  return (
    <div className={cn("w-full", className)}>
      <div className={cn("flex h-36 items-end gap-2", sparse ? "justify-start" : "justify-between")}>
        {points.map((point, index) => {
          const height = (point.value / max) * 100;
          return (
            <div
              key={`$<Tx>{point.label}</Tx>-${index}`}
              className={cn("group relative flex h-full flex-1 flex-col justify-end", sparse && "max-w-[5.5rem]")}
              title={`$<Tx>{point.label}</Tx>: ${show(point.value)} ${unit}`}
            >
              {sparse && point.value > 0 ? (
                <span className="tnum mb-1 text-center text-[11px] font-semibold">{show(point.value)}</span>
              ) : null}
              <div
                className={cn(
                  "w-full rounded-t-md transition-colors",
                  point.value > 0 ? "bg-brand/70 group-hover:bg-brand" : "bg-muted"
                )}
                /* An empty container still gets a sliver, so the row reads as a
                   row of containers rather than a row of gaps. */
                style={{ height: point.value > 0 ? `${Math.max(height, 6)}%` : "3px" }}
              />
            </div>
          );
        })}
      </div>

      <div className="mt-px h-px w-full bg-border" />

      <div className={cn("mt-2 flex text-[11px] text-muted-foreground", sparse ? "gap-2" : "justify-between")}>
        {sparse ? (
          points.map((point, index) => (
            <span key={`$<Tx>{point.label}</Tx>-l-${index}`} className="tnum max-w-[5.5rem] flex-1 truncate text-center">
              <Tx>{point.label}</Tx>
            </span>
          ))
        ) : (
          <>
            <span className="tnum">{points[0]?.label}</span>
            <span className="tnum">{points[points.length - 1]?.label}</span>
          </>
        )}
      </div>
    </div>
  );
}
