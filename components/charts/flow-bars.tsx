import { cn } from "@/lib/utils";

/**
 * What came in against what went out, per day.
 *
 * Two bars per column sharing a baseline, because the question a warehouse asks
 * is not "how much arrived" but "is the floor filling up or emptying". Stacking
 * them would hide exactly that.
 */
export function FlowBars({
  data,
  height = 150,
  inLabel = "In",
  outLabel = "Out",
  className,
}: {
  data: { label: string; in: number; out: number }[];
  height?: number;
  inLabel?: string;
  outLabel?: string;
  className?: string;
}) {
  const max = Math.max(...data.flatMap((d) => [d.in, d.out]), 1);

  return (
    <div className={cn("w-full", className)}>
      <div className="mb-3 flex items-center gap-4 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="size-1.5 rounded-full bg-chart-2" />
          {inLabel}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-1.5 rounded-full bg-chart-3" />
          {outLabel}
        </span>
      </div>

      <div className="flex items-end gap-2" style={{ height }}>
        {data.map((d, i) => (
          <div key={`${d.label}-${i}`} className="group flex h-full flex-1 flex-col justify-end">
            <div className="flex h-full items-end justify-center gap-[3px]">
              <div
                className="w-1/2 rounded-t-[2px] bg-chart-2 opacity-80 transition-opacity group-hover:opacity-100"
                style={{ height: `${Math.max(2, (d.in / max) * 100)}%` }}
                title={`${inLabel} ${d.in}`}
              />
              <div
                className="w-1/2 rounded-t-[2px] bg-chart-3 opacity-80 transition-opacity group-hover:opacity-100"
                style={{ height: `${Math.max(2, (d.out / max) * 100)}%` }}
                title={`${outLabel} ${d.out}`}
              />
            </div>
          </div>
        ))}
      </div>

      <div className="mt-2 flex gap-2 text-[11px] text-muted-foreground">
        {data.map((d, i) => (
          <span key={`${d.label}-l-${i}`} className="flex-1 truncate text-center">
            {d.label}
          </span>
        ))}
      </div>
    </div>
  );
}
