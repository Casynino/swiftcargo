import { ringGeometry } from "@/lib/chart";
import { cn } from "@/lib/utils";

export type DonutSlice = {
  label: string;
  value: number;
  tone: 1 | 2 | 3 | 4 | 5 | 6;
};

/**
 * Swatches, matching the strokes one for one.
 *
 * They live beside the strokes on purpose: a legend whose colours drift from
 * the ring it explains is worse than no legend, and the only way that cannot
 * happen is for both maps to be edited in the same place. Written out in full —
 * `bg-chart-${n}` is a class Tailwind never generates, and the swatch would
 * render with no colour at all.
 */
export const SWATCHES: Record<DonutSlice["tone"], string> = {
  1: "bg-chart-1",
  2: "bg-chart-2",
  3: "bg-chart-3",
  4: "bg-chart-4",
  5: "bg-chart-5",
  6: "bg-chart-6",
};

const STROKES: Record<DonutSlice["tone"], string> = {
  1: "stroke-chart-1",
  2: "stroke-chart-2",
  3: "stroke-chart-3",
  4: "stroke-chart-4",
  5: "stroke-chart-5",
  6: "stroke-chart-6",
};

/**
 * What a pile is made of.
 *
 * A ring answers "how far through one thing are we"; this answers "what is this
 * made of", which is the question a queue asks — ninety consignments is a
 * number, and ninety of which eighty are stuck behind one desk is an
 * instruction.
 *
 * Drawn from twelve o'clock clockwise, in the order given: the caller sorts,
 * because the order is editorial and only the caller knows which slice is the
 * problem. Zero-length slices are skipped rather than drawn at nought, which
 * would stack invisible segments and shift every colour after them.
 */
export function Donut({
  slices,
  size = 168,
  stroke = 26,
  label,
  caption,
  className,
}: {
  slices: DonutSlice[];
  size?: number;
  stroke?: number;
  label?: string;
  caption?: string;
  className?: string;
}) {
  const { radius, circumference, centre } = ringGeometry(size, stroke);
  const drawn = slices.filter((s) => s.value > 0);
  const total = drawn.reduce((sum, s) => sum + s.value, 0);

  let offset = 0;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className={cn("shrink-0", className)}
      role="img"
      aria-label={drawn.map((s) => `${s.label}: ${s.value}`).join(", ")}
    >
      <circle
        cx={centre}
        cy={centre}
        r={radius}
        fill="none"
        stroke="hsl(var(--border))"
        strokeWidth={stroke}
      />
      {total > 0
        ? drawn.map((slice) => {
            const length = (slice.value / total) * circumference;
            const dash = `${length} ${circumference - length}`;
            const element = (
              <circle
                key={slice.label}
                cx={centre}
                cy={centre}
                r={radius}
                fill="none"
                className={STROKES[slice.tone]}
                strokeWidth={stroke}
                strokeDasharray={dash}
                strokeDashoffset={-offset}
                transform={`rotate(-90 ${centre} ${centre})`}
              />
            );
            offset += length;
            return element;
          })
        : null}

      {label ? (
        <>
          <text
            x={centre}
            y={centre - (caption ? 6 : 0)}
            textAnchor="middle"
            dominantBaseline="central"
            className="fill-foreground text-lg font-semibold"
            style={{ fontVariantNumeric: "tabular-nums" }}
          >
            {label}
          </text>
          {caption ? (
            <text
              x={centre}
              y={centre + 13}
              textAnchor="middle"
              dominantBaseline="central"
              className="fill-muted-foreground text-[10px]"
            >
              {caption}
            </text>
          ) : null}
        </>
      ) : null}
    </svg>
  );
}

/**
 * The key beside the ring.
 *
 * `format` exists because not every donut counts whole things. A slice holding
 * 3.78 cubic metres arrived on screen as "3.7800000000000002" — the sum of a
 * column of decimals, printed raw. Counts pass through untouched; measurements
 * say how many places they mean.
 */
export function DonutLegend({
  slices,
  format = (n: number) => n.toLocaleString(),
}: {
  slices: DonutSlice[];
  format?: (n: number) => string;
}) {
  const total = slices.reduce((sum, s) => sum + s.value, 0);
  return (
    <ul className="space-y-2">
      {slices.map((slice) => (
        <li key={slice.label} className="flex items-center gap-2.5 text-sm">
          <span
            className={cn("size-2.5 shrink-0 rounded-full", SWATCHES[slice.tone])}
          />
          <span className="flex-1 truncate text-muted-foreground">
            {slice.label}
          </span>
          <span className="tnum font-medium">{format(slice.value)}</span>
          <span className="tnum w-10 text-right text-xs text-muted-foreground">
            {total > 0 ? Math.round((slice.value / total) * 100) : 0}%
          </span>
        </li>
      ))}
    </ul>
  );
}
