import { chartPoint } from "@/lib/sea-chart";

/**
 * THE LANE, DRAWN ONCE.
 *
 * Guangzhou to Dar es Salaam is not a straight line and drawing it as one puts
 * a container ship across Vietnam, Malaysia and Sri Lanka. These are the real
 * waters a box on this service crosses: down the Pearl River, the length of the
 * South China Sea, through the Singapore Strait and up the Malacca Strait, out
 * past the Andamans, across the Indian Ocean south of Sri Lanka and the
 * Maldives, and in to the Tanzanian coast.
 *
 * Checked against the same land polygons the chart dots come from: apart from
 * the run down the estuary out of Guangzhou, which is the river, the curve
 * never touches land.
 *
 * Geography only. Nothing here knows where any particular container is — see
 * `laneFraction` for what the result page is allowed to say about that.
 */
const WAYPOINTS: ReadonlyArray<readonly [number, number]> = [
  [113.26, 23.13], // Guangzhou
  [114.6, 21.6], // out of the Pearl River estuary, past Hong Kong
  [113.4, 18.6],
  [111.6, 15.0], // the South China Sea
  [110.4, 11.4],
  [108.4, 7.4],
  [106.0, 3.6],
  [104.6, 1.15], // the eastern approach to the Singapore Strait
  [103.3, 1.0], // the strait itself
  [102.7, 1.7],
  [101.9, 2.3], // the Malacca Strait, Sumatra to port
  [100.8, 3.1],
  [99.9, 4.0],
  [99.0, 5.0],
  [97.6, 6.0],
  [95.0, 6.6], // out past the north of Sumatra
  [91.0, 6.0],
  [85.0, 4.6], // the Indian Ocean
  [78.0, 3.0], // south of Sri Lanka
  [70.0, 1.2], // south of the Maldives
  [61.0, -1.4],
  [52.0, -4.2],
  [44.5, -6.2],
  [39.45, -6.82], // Dar es Salaam
];

/**
 * Catmull-Rom through the waypoints, converted to cubic Béziers.
 *
 * A polyline would kink at every one of the twenty-four points and read as a
 * flight plan. The spline passes through all of them and arrives smooth, which
 * is what a sea lane looks like on a chart.
 */
function spline(points: ReadonlyArray<readonly [number, number]>): string {
  const p = points.map(([lon, lat]) => chartPoint(lon, lat));
  let d = `M ${p[0][0].toFixed(1)} ${p[0][1].toFixed(1)}`;
  for (let i = 0; i < p.length - 1; i++) {
    const p0 = p[Math.max(0, i - 1)];
    const p1 = p[i];
    const p2 = p[i + 1];
    const p3 = p[Math.min(p.length - 1, i + 2)];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d +=
      ` C ${c1[0].toFixed(1)} ${c1[1].toFixed(1)}` +
      ` ${c2[0].toFixed(1)} ${c2[1].toFixed(1)}` +
      ` ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  return d;
}

export const LANE_PATH = spline(WAYPOINTS);

/**
 * The same curve as a table of points, so anything that is not an SVG
 * `animateMotion` can still sit a ship on it.
 *
 * Sampled evenly in curve parameter, then indexed by accumulated length:
 * parameter and distance are not the same thing on a Catmull-Rom, and without
 * the length table a ship at "half way" lands wherever the waypoints happen to
 * bunch up — which on this lane is the Malacca Strait, where eight of the
 * twenty-four points are.
 */
const SAMPLES = (() => {
  const p = WAYPOINTS.map(([lon, lat]) => chartPoint(lon, lat));
  const points: Array<{ x: number; y: number; length: number }> = [];
  const STEPS = 48;

  let length = 0;
  let previous: [number, number] | null = null;

  for (let i = 0; i < p.length - 1; i++) {
    const p0 = p[Math.max(0, i - 1)];
    const p1 = p[i];
    const p2 = p[i + 1];
    const p3 = p[Math.min(p.length - 1, i + 2)];

    for (let step = 0; step < STEPS; step++) {
      const t = step / STEPS;
      const axis = (a: number, b: number, c: number, d: number) =>
        0.5 *
        (2 * b +
          (-a + c) * t +
          (2 * a - 5 * b + 4 * c - d) * t * t +
          (-a + 3 * b - 3 * c + d) * t * t * t);
      const x = axis(p0[0], p1[0], p2[0], p3[0]);
      const y = axis(p0[1], p1[1], p2[1], p3[1]);
      if (previous) length += Math.hypot(x - previous[0], y - previous[1]);
      points.push({ x, y, length });
      previous = [x, y];
    }
  }

  const last = p[p.length - 1];
  if (previous) length += Math.hypot(last[0] - previous[0], last[1] - previous[1]);
  points.push({ x: last[0], y: last[1], length });

  return { points, total: length };
})();

/**
 * A point on the lane, and the heading there.
 *
 * `fraction` is 0 at Guangzhou and 1 at Dar. The angle is in degrees, measured
 * the way an SVG `rotate` wants it, so a ship drawn bow-first along +x points
 * where it is going.
 */
export function lanePoint(fraction: number): { x: number; y: number; angle: number } {
  const { points, total } = SAMPLES;
  const target = Math.min(1, Math.max(0, fraction)) * total;

  let i = points.findIndex((point) => point.length >= target);
  if (i < 0) i = points.length - 1;
  const here = points[i];
  const before = points[Math.max(0, i - 1)];
  const after = points[Math.min(points.length - 1, i + 1)];

  return {
    x: here.x,
    y: here.y,
    angle: (Math.atan2(after.y - before.y, after.x - before.x) * 180) / Math.PI,
  };
}

/**
 * The three names on the chart.
 *
 * Only places a box on this service actually passes. Singapore is not a call —
 * it is the strait every ship on this lane goes through, and naming it is what
 * turns a curve into a route somebody recognises.
 */
export const LANE_PORTS = [
  { id: "gz", label: "GUANGZHOU", lon: 113.26, lat: 23.13, anchor: "middle", dy: -13 },
  { id: "sg", label: "SINGAPORE", lon: 103.6, lat: 1.1, anchor: "middle", dy: 20 },
  { id: "dar", label: "DAR ES SALAAM", lon: 39.45, lat: -6.82, anchor: "middle", dy: 22 },
] as const;

export const DAR = chartPoint(39.45, -6.82);
export const GUANGZHOU = chartPoint(113.26, 23.13);

/**
 * A container ship from above, bow first along +x — the direction both
 * `animateMotion rotate="auto"` and a static rotation align travel with.
 *
 * Twenty-two units nose to tail, which at the size this chart is drawn is
 * about twenty pixels: enough for a hull, a stack of boxes and a bridge, and
 * not enough for anything more. A silhouette any bigger stops being a ship on
 * an ocean and becomes a diagram of a ship.
 */
export const HULL_PATH =
  "M 13 0 L 7.6 -3 L -7 -3.2 L -9 -2.4 L -9 2.4 L -7 3.2 L 7.6 3 Z";
export const DECK_PATH = "M -2.6 -2.3 L 6.4 -2.3 L 6.4 2.3 L -2.6 2.3 Z";
export const BRIDGE_PATH = "M -7 -2.2 L -3.8 -2.2 L -3.8 2.2 L -7 2.2 Z";
/** The water the hull has just left, trailing astern. */
export const WAKE_PATH = "M -9 -2.7 L -46 -7 L -46 7 L -9 2.7 Z";

export type LaneStage = {
  loaded: boolean;
  departed: boolean;
  arrived: boolean;
};

/**
 * How far along the lane the drawing puts the marker.
 *
 * THIS IS NOT A POSITION. Nobody on this service has an AIS feed, and a chart
 * that looks like one would be a lie told in pixels. What it is, is the two
 * dates already printed on the page — the day the container sailed and the day
 * it is expected — read as a fraction of the crossing. The page says so under
 * the picture, because a customer who thinks this dot is their ship will ring
 * the office the day it stops moving.
 *
 * Clamped away from both ends while the box is at sea: a ship drawn in port is
 * a ship that has arrived, and it has not.
 */
export function laneFraction(input: {
  stage: LaneStage;
  departedAt: Date | null;
  eta: Date | null;
  now: Date;
}): number {
  const { stage, departedAt, eta, now } = input;
  if (stage.arrived) return 1;
  if (!stage.departed) return stage.loaded ? 0.06 : 0.02;

  if (departedAt && eta) {
    const total = eta.getTime() - departedAt.getTime();
    if (total > 0) {
      const gone = (now.getTime() - departedAt.getTime()) / total;
      return Math.min(0.9, Math.max(0.14, 0.12 + gone * 0.8));
    }
  }
  /* Sailed, with no promised date to measure against. Half way is the only
     honest answer, and the caption says where the figure comes from. */
  return 0.5;
}
