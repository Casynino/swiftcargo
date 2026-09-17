import { areaPath, scalePoints, smoothPath } from "@/lib/chart";
import { cn } from "@/lib/utils";

/**
 * Inline trend line for a KPI card.
 *
 * No axes and no labels: its job is to say "rising", "falling" or "flat" beside
 * the number that matters, and anything more competes with that number for the
 * same glance.
 */
export function Sparkline({
  values,
  tone = 1,
  width = 96,
  height = 28,
  className,
  label,
}: {
  values: number[];
  tone?: 1 | 2 | 3 | 4 | 5 | 6;
  width?: number;
  height?: number;
  className?: string;
  label?: string;
}) {
  if (values.length < 2) return null;

  const points = scalePoints(values, width, height, { padding: 3 });
  const stroke = `hsl(var(--chart-${tone}))`;
  const last = points[points.length - 1];

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={cn("overflow-visible", className)}
      role="img"
      aria-label={label ?? "Trend"}
    >
      <path d={areaPath(points, height)} fill={stroke} fillOpacity="0.12" />
      <path
        d={smoothPath(points)}
        fill="none"
        stroke={stroke}
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={last.x} cy={last.y} r="2.5" fill={stroke} />
    </svg>
  );
}
