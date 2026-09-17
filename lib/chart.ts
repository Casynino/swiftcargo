/**
 * Chart geometry.
 *
 * Everything the dashboards draw is plain SVG built from these three functions,
 * so a page of six charts ships no charting library and renders on the server —
 * the first paint is the finished picture rather than a spinner over an empty
 * box on a warehouse phone.
 */

export type Point = { x: number; y: number };

export function scalePoints(
  values: number[],
  width: number,
  height: number,
  options: { min?: number; max?: number; padding?: number } = {}
): Point[] {
  const padding = options.padding ?? 0;
  const min = options.min ?? Math.min(...values, 0);
  const max = options.max ?? Math.max(...values, 1);
  /* A flat series has no range to divide by, and every point would land on the
     same NaN. Treating it as a range of one draws a straight line instead. */
  const span = max - min || 1;
  const usable = height - padding * 2;

  return values.map((value, index) => ({
    x: values.length > 1 ? (index / (values.length - 1)) * width : width / 2,
    y: padding + usable - ((value - min) / span) * usable,
  }));
}

/** A Catmull-Rom-ish smoothing, tight enough not to overshoot a zero baseline. */
export function smoothPath(points: Point[]): string {
  if (points.length === 0) return "";
  if (points.length < 3) {
    return points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
  }

  let d = `M${points[0].x},${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];
    /* 1/6 rather than the usual 1/3: freight volumes jump, and a looser tension
       sends the curve below zero between two points, which draws a month that
       never happened. */
    const c1 = { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 };
    const c2 = { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 };
    d += ` C${c1.x},${c1.y} ${c2.x},${c2.y} ${p2.x},${p2.y}`;
  }
  return d;
}

export function areaPath(points: Point[], height: number): string {
  if (points.length === 0) return "";
  const first = points[0];
  const last = points[points.length - 1];
  return `${smoothPath(points)} L${last.x},${height} L${first.x},${height} Z`;
}

/**
 * A ring's stroke geometry.
 *
 * Returned rather than drawn so both the ring and the donut can share it: two
 * components computing circumference separately is two chances to be half a
 * pixel out from each other.
 */
export function ringGeometry(size: number, stroke: number) {
  const radius = (size - stroke) / 2;
  return { radius, circumference: 2 * Math.PI * radius, centre: size / 2 };
}
