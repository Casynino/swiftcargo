import { CHART_LAND_PATH, CHART_W } from "@/lib/sea-chart";
import {
  BRIDGE_PATH,
  DAR,
  DECK_PATH,
  HULL_PATH,
  LANE_PATH,
  LANE_PORTS,
  WAKE_PATH,
  lanePoint,
} from "@/lib/sea-lane";
import { chartPoint } from "@/lib/sea-chart";
import { cn } from "@/lib/utils";

/**
 * THE LANE, AS A PICTURE.
 *
 * This page used to open on an icon in a rounded square. A customer arriving
 * from a WhatsApp message with a reference in their hand is asking one
 * question — where is my cargo — and a box icon answers a different one. So
 * the backdrop is the water their cargo is somewhere on: the real coastlines
 * either side of it, the lane through the Singapore Strait, two ships working
 * their way west, and Dar es Salaam pinging at the end of it.
 *
 * NO JAVASCRIPT. SMIL moves the ships, CSS keyframes do everything else, and
 * both run on the compositor. This is the first screen most of this business's
 * customers will ever load, on Tanzanian mobile data, and it must not cost them
 * a frame or a kilobyte of script. The only image on it is the one drawn from
 * 693 pre-computed points in lib/sea-chart.ts.
 *
 * The motion is deliberately slow. A container takes 28 to 30 days to make
 * this crossing; a sprite that scoots across in four seconds tells a customer
 * something untrue about their goods before they have read a word.
 */

/**
 * The slice of the projection actually drawn.
 *
 * The full window has sky above Guangzhou and ocean below Dar that neither the
 * lane nor a label ever reaches, and carrying it makes the chart small inside
 * its box for no picture. These bounds are the drawing's own: the top of the
 * GUANGZHOU label down to the bottom of the DAR ES SALAAM one.
 */
const VIEW_TOP = 40;
const VIEW_HEIGHT = 340;
const CHART_VIEW = `0 ${VIEW_TOP} ${CHART_W} ${VIEW_HEIGHT}`;

/** Defs are shared by both drawings, so an id has to be unique per instance. */
function Defs({ prefix }: { prefix: string }) {
  return (
    <defs>
      <linearGradient id={`${prefix}-lane`} x1="1" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="hsl(var(--marine))" stopOpacity="0.95" />
        <stop offset="55%" stopColor="hsl(var(--marine))" stopOpacity="0.6" />
        <stop offset="100%" stopColor="hsl(var(--signal))" stopOpacity="0.95" />
      </linearGradient>
      <radialGradient id={`${prefix}-dar`}>
        <stop offset="0%" stopColor="hsl(var(--signal))" stopOpacity="0.4" />
        <stop offset="100%" stopColor="hsl(var(--signal))" stopOpacity="0" />
      </radialGradient>
      {/* The wake fades astern rather than ending in a hard edge, which is the
          whole difference between a wake and a grey triangle. */}
      <linearGradient id={`${prefix}-wake`} x1="1" y1="0" x2="0" y2="0">
        <stop offset="0%" stopColor="white" stopOpacity="0.3" />
        <stop offset="100%" stopColor="white" stopOpacity="0" />
      </linearGradient>
      <filter id={`${prefix}-soft`} x="-60%" y="-60%" width="220%" height="220%">
        <feGaussianBlur stdDeviation="1.6" result="b" />
        <feMerge>
          <feMergeNode in="b" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
    </defs>
  );
}

function Ship({ prefix }: { prefix: string }) {
  return (
    <>
      <path d={WAKE_PATH} fill={`url(#${prefix}-wake)`} />
      <path d={HULL_PATH} fill="white" fillOpacity="0.92" />
      <path d={DECK_PATH} fill="hsl(var(--marine))" fillOpacity="0.95" />
      <path d={BRIDGE_PATH} fill="hsl(var(--signal))" fillOpacity="0.9" />
    </>
  );
}

/**
 * A ship standing still at a given point on the lane.
 *
 * A plain transform rather than a frozen `animateMotion`: nothing here is
 * moving, and an animation that has to run in order to place something is an
 * animation that can place it at the origin instead.
 */
function StillShip({ prefix, fraction }: { prefix: string; fraction: number }) {
  const { x, y, angle } = lanePoint(fraction);
  return (
    <g transform={`translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${angle.toFixed(1)})`}>
      <Ship prefix={prefix} />
    </g>
  );
}

/**
 * A ship on the lane, twice.
 *
 * The moving pair and the still pair are both drawn, and CSS shows one or the
 * other: SMIL cannot read `prefers-reduced-motion`, and a reader who has asked
 * their phone to hold still should get a chart, not an argument. Hiding the
 * animated group is the only way to honour that without a line of script.
 */
function Ships({ prefix }: { prefix: string }) {
  const sailings = [
    { dur: "68s", begin: "0s", still: 0.34 },
    { dur: "82s", begin: "-31s", still: 0.72 },
  ];

  return (
    <>
      <g className="sea-ships-moving">
        {sailings.map((sailing) => (
          <g key={sailing.dur}>
            <Ship prefix={prefix} />
            <animateMotion
              dur={sailing.dur}
              begin={sailing.begin}
              repeatCount="indefinite"
              path={LANE_PATH}
              rotate="auto"
            />
          </g>
        ))}
      </g>
      <g className="sea-ships-still">
        {sailings.map((sailing) => (
          <StillShip key={sailing.still} prefix={prefix} fraction={sailing.still} />
        ))}
      </g>
    </>
  );
}

function Chart({ prefix, showShips }: { prefix: string; showShips: boolean }) {
  return (
    <>
      <Defs prefix={prefix} />

      {/* Land, faint enough to read as geography rather than as content. */}
      <path d={CHART_LAND_PATH} fill="hsl(var(--marine))" fillOpacity="0.34" />

      {/* The glow over the destination, under everything drawn on it. */}
      <circle cx={DAR[0]} cy={DAR[1]} r="86" fill={`url(#${prefix}-dar)`} />

      {/* The lane, twice: a still trace so the route is visible even when the
          dashes are stopped, and the crawling dashes over it. */}
      <path
        d={LANE_PATH}
        fill="none"
        stroke={`url(#${prefix}-lane)`}
        strokeWidth="1.2"
        strokeOpacity="0.28"
      />
      <path
        d={LANE_PATH}
        fill="none"
        stroke={`url(#${prefix}-lane)`}
        strokeWidth="1.8"
        strokeLinecap="round"
        className="sea-lane-dash"
      />

      {showShips ? <Ships prefix={prefix} /> : null}

      {LANE_PORTS.map((port) => {
        const [x, y] = chartPoint(port.lon, port.lat);
        const destination = port.id === "dar";
        return (
          <g key={port.id}>
            {destination ? (
              <circle
                cx={x}
                cy={y}
                r="8"
                fill="none"
                stroke="hsl(var(--signal))"
                strokeOpacity="0.8"
                className="sea-ping"
              />
            ) : null}
            <circle
              cx={x}
              cy={y}
              r={destination ? 4.2 : 3}
              fill={destination ? "hsl(var(--signal))" : "hsl(var(--marine))"}
              filter={`url(#${prefix}-soft)`}
            />
            <text
              x={x}
              y={y + port.dy}
              textAnchor={port.anchor}
              fontSize={destination ? 11 : 10}
              fill="white"
              fillOpacity={destination ? 0.85 : 0.5}
              letterSpacing="0.14em"
              fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
            >
              {port.label}
            </text>
          </g>
        );
      })}
    </>
  );
}

/**
 * The hero backdrop.
 *
 * Everything lives in the right two thirds on a wide screen; the copy and the
 * search field sit on the left over a scrim and nothing is drawn under them.
 * On a phone the chart takes the whole width at low opacity and becomes
 * atmosphere rather than a diagram nobody can read at that size — the
 * alternative, hiding it, leaves a phone looking at flat navy, which is the
 * problem the chart was drawn to solve.
 */
export function SeaLaneBackdrop() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      <div className="absolute inset-0 bg-ink" />

      {/* Depth, before anything is drawn on it — the same two washes the home
          page hero uses, so the two screens belong to one site. */}
      <div
        className="absolute inset-0 bg-[radial-gradient(ellipse_at_72%_28%,hsl(var(--marine)/0.28),transparent_58%),radial-gradient(ellipse_at_18%_96%,hsl(var(--signal)/0.22),transparent_55%)]"
      />

      {/*
        The svg is wrapped rather than positioned directly. An <svg> is a
        replaced element: give it top and bottom offsets and a height of auto
        and it derives its height from its width instead of stretching between
        them, overflows its box and gets clipped — which is how Dar es Salaam,
        the one place on this chart the page is about, ends up off screen. The
        wrapper owns the box; the svg fills it.
      */}
      {/*
        The box carries the drawing's own aspect ratio rather than a height.
        With `meet` an svg centres itself inside a box of a different shape, and
        a centred chart put Dar es Salaam — the one place on it this page is
        about — back underneath the heading. Sized to the drawing, the chart
        fills its box exactly, and the box can then be put somewhere the words
        are not.

        Which is two different places. On a wide screen the chart takes the
        right of the hero and the copy sits on the left over a scrim. On a
        phone there is no left and right, so it takes a band of its own along
        the bottom, under the search field: a chart behind a paragraph at
        thirty-percent opacity is not atmosphere, it is a paragraph with a
        shipping lane through it. The caller reserves the band with padding.
      */}
      {/*
        Measured against the container, not the window. On a 2560-wide screen
        the copy stops at the middle of the page and a chart sized to the
        viewport ends up an ocean away from it — and tall enough to be cropped
        top and bottom by the hero, which takes Guangzhou and Dar with it. Tied
        to the same column the words are in, the two stay a composition at
        every width.
      */}
      <div className="container absolute inset-0 h-full">
        <div className="absolute inset-x-0 bottom-2 aspect-[720/340] lg:inset-x-auto lg:bottom-auto lg:right-0 lg:top-1/2 lg:w-[62%] lg:-translate-y-1/2">
          <svg
            viewBox={CHART_VIEW}
            preserveAspectRatio="xMidYMid meet"
            className="h-full w-full"
          >
            <Chart prefix="sealane" showShips />
          </svg>
        </div>
      </div>

      {/* The reading scrim, on the wide layout only: whatever the ocean is
          doing, the left stays dark enough for a heading and a form field to
          sit on it. On a phone the chart is not behind the words, so a scrim
          over it would only dim the picture. */}
      <div className="absolute inset-0 hidden bg-[linear-gradient(100deg,hsl(var(--ink))_0%,hsl(var(--ink)/0.92)_22%,hsl(var(--ink)/0.5)_38%,transparent_56%)] lg:block" />
      {/* Light weight at the top and bottom edges. A scrim strong enough to
          blend the hero into the page was also strong enough to swallow Dar es
          Salaam, which is the one marker that has to stay legible. */}
      <div className="absolute inset-0 bg-[linear-gradient(to_top,hsl(var(--ink)/0.45)_0%,transparent_12%,transparent_82%,hsl(var(--ink)/0.5)_100%)]" />
      <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-marine/50 to-transparent" />
    </div>
  );
}
