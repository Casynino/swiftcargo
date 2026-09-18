import { cn } from "@/lib/utils";

/**
 * THE ROUTE, DRAWN.
 *
 * A dotted map of the Indian Ocean rim with our one lane across it: Guangzhou
 * down the South China Sea, through Malacca, past Sri Lanka and across to Dar
 * es Salaam. Coordinates are longitude and minus latitude, so the lane sits
 * where the ships actually go — close enough for a picture, and never presented
 * as a position.
 *
 * The coastlines are coarse on purpose: dots are forgiving, and a detailed
 * outline would cost tens of kilobytes on every page for detail nobody reads.
 */

const LAND: string[] = [
  // Africa
  "-17,-21 -10,-30 -5,-36 10,-37 20,-32 32,-31 35,-28 43,-12 51,-12 51,-10 48,-5 42,1 39.7,4 39.3,7 40,11 40.5,15 35,24 31,30 26,34 20,35 18,34 15,28 12,18 13,5 9,-4 -8,-5 -17,-14",
  // Madagascar
  "44,25 47,25 50,15 49,12 44,17",
  // Arabia
  "35,-28 39,-22 43,-13 52,-16 59,-22 56,-26 50,-30 48,-30 38,-32",
  // Europe and Asia, from Iberia round the south coast to Korea
  "-10,-36 -9,-43 -2,-48 -10,-55 -10,-60 60,-60 145,-60 141,-50 129,-42 129,-35 125,-40 122,-41 118,-39 121,-38 122,-31 121,-29 117,-23 113,-22 109,-20 109,-12 104,-10 104,-1 101,-3 98,-8 98,-16 94,-17 92,-22 87,-22 80,-16 80,-13 77,-8 73,-17 72,-21 67,-24 62,-25 56,-27 48,-30 36,-36 26,-40 23,-37 20,-40 16,-38 12,-44 3,-43 0,-39 -9,-37",
  // Sri Lanka
  "80,-10 82,-8 81.5,-6 80,-6.5",
  // Sumatra, Borneo, Java
  "95,-5 98,-4 106,6 102,4",
  "109,-1 117,-7 119,-1 116,4 110,3",
  "105,6 114,7 114,8 106,7.5",
  // Philippines, Taiwan, Japan
  "120,-18 122,-18 126,-7 122,-7",
  "120.5,-25 121.8,-25 121,-22",
  "130,-31 135,-34 140,-36 142,-40 140,-41 135,-35 131,-34",
  // Australia's north and west
  "113,22 114,34 130,32 140,38 150,37 153,28 145,15 142,11 136,12 130,12 122,17",
];

/* Guangzhou → Pearl River mouth → South China Sea → Singapore → Malacca →
   south of Sri Lanka → across the Indian Ocean → Dar es Salaam. */
const LANE =
  "M113.3,-23.1 C113.6,-21 112.5,-18 110,-13 S105.5,-3 104,-1.3 C102,0.2 99,-3 96.5,-5.5 C92,-7 86,-6 81,-4.5 C72,-1.5 60,2 50,4.5 C45,5.8 42,6.4 39.3,6.8";

export function RouteMap({ className, dark = true }: { className?: string; dark?: boolean }) {
  const land = dark ? "rgba(255,255,255,0.22)" : "hsl(var(--brand) / 0.22)";
  const label = dark ? "#ffffff" : "hsl(var(--foreground))";
  return (
    <svg
      viewBox="20 -42 120 62"
      role="img"
      aria-label="The sea route from Guangzhou to Dar es Salaam"
      className={cn("h-auto w-full", className)}
    >
      <defs>
        <pattern id="rm-dots" width="1.35" height="1.35" patternUnits="userSpaceOnUse">
          <circle cx="0.675" cy="0.675" r="0.36" fill={land} />
        </pattern>
        <linearGradient id="rm-lane" x1="0" x2="1">
          <stop offset="0" stopColor="#ff8a4c" />
          <stop offset="1" stopColor="#4fc9f0" />
        </linearGradient>
        <filter id="rm-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="0.9" />
        </filter>
      </defs>

      {LAND.map((points, i) => (
        <polygon key={i} points={points} fill="url(#rm-dots)" />
      ))}

      {/* The lane: a soft glow, a faint rail, and the dashes running along it. */}
      <path d={LANE} fill="none" stroke="url(#rm-lane)" strokeWidth="1.4" opacity="0.35" filter="url(#rm-glow)" />
      <path d={LANE} fill="none" stroke="url(#rm-lane)" strokeWidth="0.35" opacity="0.55" />
      <path
        d={LANE}
        fill="none"
        stroke="url(#rm-lane)"
        strokeWidth="0.55"
        strokeLinecap="round"
        className="site-dash"
        style={{ strokeDasharray: "1.4 1.6" }}
      />

      {/* The ship, sailing the lane end to end. */}
      <g className="site-mover">
        <circle r="1.5" fill="#ffffff" opacity="0.18" />
        <circle r="0.75" fill="#ffffff" />
        <animateMotion dur="14s" repeatCount="indefinite" path={LANE} rotate="auto" />
      </g>

      {(
        [
          [113.3, -23.1, "Guangzhou", "start", 2.2, -1.6],
          [39.3, 6.8, "Dar es Salaam", "start", 2.2, 1.2],
        ] as const
      ).map(([x, y, name, anchor, dx, dy]) => (
        <g key={name}>
          <circle cx={x} cy={y} r="1.1" fill="#ff8a4c" className="site-ping" />
          <circle cx={x} cy={y} r="1.1" fill="#ff8a4c" stroke="#fff" strokeWidth="0.35" />
          <text
            x={x + dx}
            y={y + dy}
            textAnchor={anchor}
            fill={label}
            fontSize="2.6"
            fontWeight="700"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {name}
          </text>
        </g>
      ))}
    </svg>
  );
}
