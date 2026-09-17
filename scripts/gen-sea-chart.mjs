/**
 * The land under the sea lane, as dots.
 *
 * Reads Natural Earth's 1:110m land polygons (public domain, from
 * naturalearthdata.com, as GeoJSON) and answers one question per grid point:
 * is this land or is it water. The answer never changes, so it is computed
 * once here and committed as `lib/sea-chart.ts` rather than derived on every
 * render — a point-in-polygon test over ~130 rings for every one of 1,700 grid
 * points is real work to hand a phone on Tanzanian mobile data.
 *
 *   node scripts/gen-sea-chart.mjs path/to/land-110m.geojson
 *
 * Ray casting rather than a geo library: the only thing being asked is whether
 * a point sits inside a ring, and pulling d3-geo into the build for that would
 * be the heavier answer.
 */
import { readFileSync, writeFileSync } from "node:fs";

/* The window is chosen by the route, not the other way round: Guangzhou at the
   top right, the Malacca Strait in the middle, Dar es Salaam at the left, and
   enough water around all three that the lane never runs off the edge. */
const LON = [28, 124];
const LAT = [-16, 32];
const W = 720;
const H = 420;
const STEP = 1.35;
/* The side of one land dot, in viewBox units, against a grid spacing of about
   ten. Smaller than this and the dots fall under a pixel wherever the chart is
   drawn small, the coastline washes out, and the backdrop goes back to being
   flat navy. */
const DOT = 3.4;

const source = process.argv[2];
if (!source) {
  console.error("usage: node scripts/gen-sea-chart.mjs path/to/land-110m.geojson");
  process.exit(1);
}

const land = JSON.parse(readFileSync(source, "utf8"));

/** Even-odd ray cast. `ring` is a closed list of [lon, lat]. */
function inRing(lon, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/** A polygon is its outer ring minus its holes. */
function inPolygon(lon, lat, rings) {
  if (!inRing(lon, lat, rings[0])) return false;
  for (let i = 1; i < rings.length; i++) {
    if (inRing(lon, lat, rings[i])) return false;
  }
  return true;
}

const polygons = [];
for (const feature of land.features ?? []) {
  const geometry = feature.geometry;
  if (!geometry) continue;
  if (geometry.type === "Polygon") polygons.push(geometry.coordinates);
  else if (geometry.type === "MultiPolygon") polygons.push(...geometry.coordinates);
}

const dots = [];
for (let lon = LON[0]; lon <= LON[1] + 1e-9; lon += STEP) {
  for (let lat = LAT[0]; lat <= LAT[1] + 1e-9; lat += STEP) {
    if (!polygons.some((rings) => inPolygon(lon, lat, rings))) continue;
    dots.push([
      Math.round(((lon - LON[0]) / (LON[1] - LON[0])) * W * 10) / 10,
      Math.round(((LAT[1] - lat) / (LAT[1] - LAT[0])) * H * 10) / 10,
    ]);
  }
}

console.log(`land dots: ${dots.length} of ${polygons.length} polygons`);

writeFileSync(
  "lib/sea-chart.ts",
  `/**
 * The land around the Guangzhou → Dar es Salaam lane, as dots.
 *
 * Generated — do not edit by hand. Run scripts/gen-sea-chart.mjs against
 * Natural Earth's 1:110m land GeoJSON (public domain) if the window or the
 * step below changes. Everything that draws this chart reads the same window
 * constants from here, so the coastline, the ports and the lane are in one
 * projection rather than three that merely resemble each other.
 *
 * Window: lon ${LON[0]}..${LON[1]}, lat ${LAT[0]}..${LAT[1]}, ${W}×${H}, step ${STEP}°, dot ${DOT}.
 */

/** The projection window, in degrees. */
export const CHART_LON: readonly [number, number] = [${LON[0]}, ${LON[1]}];
export const CHART_LAT: readonly [number, number] = [${LAT[0]}, ${LAT[1]}];

/** The viewBox the window is drawn into. */
export const CHART_W = ${W};
export const CHART_H = ${H};

/** Equirectangular, stretched to fill the box. Decoration, not navigation. */
export function chartPoint(lon: number, lat: number): [number, number] {
  return [
    ((lon - CHART_LON[0]) / (CHART_LON[1] - CHART_LON[0])) * CHART_W,
    ((CHART_LAT[1] - lat) / (CHART_LAT[1] - CHART_LAT[0])) * CHART_H,
  ];
}

/**
 * One path rather than ${dots.length} circles: the browser lays out a single node
 * for the same picture, which is the difference between a backdrop and a
 * scroll janking on a cheap phone.
 */
export const CHART_LAND: ReadonlyArray<readonly [number, number]> = ${JSON.stringify(dots)};

/** Each dot is centred on its grid point rather than hung below and right. */
export const CHART_LAND_PATH = CHART_LAND.map(
  ([x, y]) =>
    \`M\${(x - ${DOT / 2}).toFixed(1)} \${(y - ${DOT / 2}).toFixed(1)}h${DOT}v${DOT}h-${DOT}z\`
).join("");
`
);
console.log("wrote lib/sea-chart.ts");
