import { ringGeometry } from "@/lib/chart";
import { cn } from "@/lib/utils";

/**
 * How far through one thing we are.
 *
 * A container's fill, a flight's progress, a month against its target. Use it
 * only where a denominator genuinely exists — a ring with nothing to be a
 * fraction of is decoration pretending to be information.
 */
export function Ring({
  value,
  total,
  size = 56,
  stroke = 6,
  tone = 1,
  label,
  className,
}: {
  value: number;
  total: number;
  size?: number;
  stroke?: number;
  tone?: 1 | 2 | 3 | 4 | 5 | 6;
  label?: string;
  className?: string;
}) {
  const { radius, circumference, centre } = ringGeometry(size, stroke);
  const fraction = total > 0 ? Math.min(1, Math.max(0, value / total)) : 0;
  const colour = `hsl(var(--chart-${tone}))`;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className={cn("shrink-0", className)}
      role="img"
      aria-label={label ?? `${Math.round(fraction * 100)} percent`}
    >
      <circle
        cx={centre}
        cy={centre}
        r={radius}
        fill="none"
        stroke="hsl(var(--border))"
        strokeWidth={stroke}
      />
      <circle
        cx={centre}
        cy={centre}
        r={radius}
        fill="none"
        stroke={colour}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - fraction)}
        /* Drawn from twelve o'clock rather than three, which is where a reader
           expects a progress ring to start. */
        transform={`rotate(-90 ${centre} ${centre})`}
      />
      <text
        x={centre}
        y={centre}
        textAnchor="middle"
        dominantBaseline="central"
        className="fill-foreground text-[10px] font-semibold"
        style={{ fontVariantNumeric: "tabular-nums" }}
      >
        {Math.round(fraction * 100)}%
      </text>
    </svg>
  );
}
