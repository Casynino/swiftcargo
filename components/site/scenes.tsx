/**
 * THE DRAWN PICTURES BEHIND THE DARK HERO BANDS.
 *
 * The public site's hero panels were flat ink with a gradient on them. These
 * put something behind the words that says what the company does — a crane
 * lifting a box at night, a terminal at dusk, the shed in Guangzhou — until the
 * company has photographs of its own. See components/site/hero-artwork.tsx,
 * which is the only thing that should ever render one of these, and which is
 * where a real photograph replaces one.
 *
 * They are drawings and not grey boxes on purpose. A placeholder rectangle
 * tells a visitor the site is unfinished; a crane lifting a box tells them what
 * the company does.
 *
 * RULES THEY ALL KEEP:
 *
 *   No files, no libraries, no script. Every scene is one inline SVG of paths
 *   and gradients. The whole set costs less than a single JPEG would, which
 *   matters because most of these customers are on Tanzanian mobile data.
 *
 *   Fixed colours, not theme tokens. A picture is the same picture whichever
 *   theme the reader chose, exactly as the sea on the tracking page is — and
 *   fixing them is what guarantees the white type laid over them keeps its
 *   contrast in both. They are sampled off the logo: navy hull, cyan boxes,
 *   the orange sun used once so it reads as an accent rather than as livery.
 *
 *   Nothing moves except light. What little animation there is — a lamp
 *   flickering — is opacity only, runs on the compositor, and stops dead under
 *   prefers-reduced-motion (see app/globals.css).
 *
 *   Drawn to a 3:2 field with the subject inside the middle two thirds, so the
 *   same scene crops honestly into a shallow hero band and a tall one.
 */

const VB = { w: 1200, h: 800 } as const;

/** Every scene fills its slot and is cropped by it, never letterboxed. */
const FILL = "absolute inset-0 h-full w-full";

function Frame({
  children,
  id,
}: {
  children: React.ReactNode;
  /** Prefixes this scene's gradient ids: two scenes on one page must not collide. */
  id: string;
}) {
  return (
    <svg
      aria-hidden
      viewBox={`0 0 ${VB.w} ${VB.h}`}
      preserveAspectRatio="xMidYMid slice"
      className={FILL}
      data-scene={id}
    >
      {children}
    </svg>
  );
}

/* ── shared parts ─────────────────────────────────────────────────────────── */

/** Container colours, off the logo. Orange once in nine. */
const BOX = [
  "#0e3251",
  "#1b6a95",
  "#2aa3cf",
  "#0a2740",
  "#f4611f",
  "#14547d",
  "#123f63",
  "#9a4a22",
  "#1b6a95",
];

/** A box, with the corrugation and the two castings that make it read as steel. */
function Container({
  x,
  y,
  w,
  h,
  fill,
  shade = 0.22,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  fill: string;
  shade?: number;
}) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} fill={fill} />
      {/*
        The corrugation, as one rectangle filled with a pattern rather than one
        rectangle per rib.

        A terminal in this set holds about seventy boxes. Drawn rib by rib that
        was thirteen hundred elements and 125 KB of markup in the page — for a
        backdrop, on a connection where that is somebody's airtime. The pattern
        is in userSpaceOnUse, so the pitch stays the same across every box
        whatever its width, which is also what real corrugation does.
      */}
      <rect
        x={x}
        y={y + h * 0.1}
        width={w}
        height={h * 0.8}
        fill="url(#sc-ribs)"
      />
      {/* Top rail catching the light, bottom rail in its own shadow. */}
      <rect x={x} y={y} width={w} height={h * 0.13} fill="#fff" fillOpacity="0.1" />
      <rect
        x={x}
        y={y + h * 0.87}
        width={w}
        height={h * 0.13}
        fill="#000"
        fillOpacity={shade}
      />
      <rect x={x} y={y} width={w} height={h} fill="none" stroke="#020c16" strokeOpacity="0.4" strokeWidth="0.9" />
    </g>
  );
}

/** A stack of boxes, tallest where the plan puts the weight. */
function Stack({
  x,
  baseY,
  w,
  boxH,
  tiers,
  seed,
  gap = 1.5,
}: {
  x: number;
  baseY: number;
  w: number;
  boxH: number;
  tiers: number;
  /** Fixed, not random: this renders on the server and must match the browser. */
  seed: number;
  gap?: number;
}) {
  return (
    <g>
      {Array.from({ length: tiers }, (_, i) => (
        <Container
          key={i}
          x={x}
          y={baseY - (i + 1) * (boxH + gap)}
          w={w}
          h={boxH}
          fill={BOX[(seed + i * 5) % BOX.length]}
          /* Boxes low in a stack sit in the shade of the ones above them. */
          shade={0.22 + (tiers - i) * 0.02}
        />
      ))}
    </g>
  );
}

/** A lamp on a mast: the glow, the head, and the pool it throws. */
function Floodlight({
  x,
  y,
  height,
  spread = 90,
  reach = 420,
  flicker,
}: {
  x: number;
  y: number;
  height: number;
  spread?: number;
  reach?: number;
  flicker?: boolean;
}) {
  return (
    <g>
      <rect x={x - 2} y={y} width="4" height={height} fill="#0a2036" />
      <polygon
        points={`${x - 14},${y} ${x + 14},${y} ${x + spread},${y + reach} ${x - spread},${y + reach}`}
        fill="url(#sc-beam)"
        opacity="0.5"
      />
      <circle cx={x} cy={y} r="16" fill="#ffd9a8" fillOpacity="0.18" filter="url(#sc-soft)" />
      <rect
        x={x - 9}
        y={y - 4}
        width="18"
        height="7"
        rx="2"
        fill="#ffe9c8"
        className={flicker ? "sc-lamp" : undefined}
      />
    </g>
  );
}

/** Defs every scene draws from. Ids are scoped by the scene that mounts them. */
function Defs({ id, sky }: { id: string; sky: [string, string, string] }) {
  return (
    <defs>
      <linearGradient id={`${id}-sky`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor={sky[0]} />
        <stop offset="58%" stopColor={sky[1]} />
        <stop offset="100%" stopColor={sky[2]} />
      </linearGradient>
      <linearGradient id="sc-beam" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#ffe3bb" stopOpacity="0.5" />
        <stop offset="100%" stopColor="#ffe3bb" stopOpacity="0" />
      </linearGradient>
      <pattern id="sc-ribs" width="9" height="9" patternUnits="userSpaceOnUse">
        <rect x="0" y="0" width="1.6" height="9" fill="#000" fillOpacity="0.14" />
      </pattern>
      <filter id="sc-soft" x="-60%" y="-60%" width="220%" height="220%">
        <feGaussianBlur stdDeviation="14" />
      </filter>
      <filter id="sc-haze" x="-40%" y="-40%" width="180%" height="180%">
        <feGaussianBlur stdDeviation="26" />
      </filter>
    </defs>
  );
}

/* ── the crane ────────────────────────────────────────────────────────────── */

/**
 * A ship-to-shore gantry taking a box off the quay at night.
 *
 * This is the moment the cargo stops being the customer's problem and becomes
 * ours: one container, in the air, under a crane, with a trailer waiting under
 * it. The tall slot on the editorial grid is drawn for this.
 */
export function CraneScene() {
  const id = "crane";
  /* The trolley, and the box hanging under it. Everything else hangs off these
     two numbers, so the rig can be slid across the frame in one edit. */
  const trolley = 545;
  const hookY = 470;

  return (
    <Frame id={id}>
      <Defs id={id} sky={["#02070e", "#061d33", "#0b3b56"]} />

      <rect width={VB.w} height={VB.h} fill={`url(#${id}-sky)`} />

      {/* Weather on the horizon, so the sky is not one gradient. */}
      <ellipse cx="880" cy="430" rx="420" ry="90" fill="#1d6b83" fillOpacity="0.22" filter="url(#sc-haze)" />
      <ellipse cx="240" cy="410" rx="330" ry="70" fill="#0d4763" fillOpacity="0.3" filter="url(#sc-haze)" />

      {/* The yard behind: other cranes, small and flat, standing in the haze. */}
      <g fill="#071f33" fillOpacity="0.85">
        {[80, 300, 1010].map((x) => (
          <g key={x}>
            <rect x={x} y="300" width="5" height="190" />
            <rect x={x + 72} y="300" width="5" height="190" />
            <rect x={x - 26} y="292" width="150" height="9" />
            <rect x={x - 26} y="268" width="9" height="26" />
          </g>
        ))}
      </g>

      {/* The quay itself. */}
      <rect x="0" y="600" width={VB.w} height={VB.h - 600} fill="#04101d" />
      <rect x="0" y="596" width={VB.w} height="7" fill="#0b2b45" />

      {/* Stacks either side, framing the lift. */}
      <Stack x={40} baseY={600} w={150} boxH={46} tiers={4} seed={1} />
      <Stack x={196} baseY={600} w={150} boxH={46} tiers={3} seed={6} />
      <Stack x={960} baseY={600} w={150} boxH={46} tiers={5} seed={3} />
      <Stack x={1116} baseY={600} w={150} boxH={46} tiers={3} seed={8} />

      {/* The gantry. Legs, sills, the portal beam and the boom out over the
          water on the right — the shape that says container terminal and not
          building site. */}
      <g fill="#123a55">
        <rect x="430" y="150" width="17" height="452" />
        <rect x="700" y="150" width="17" height="452" />
        <rect x="404" y="176" width="14" height="426" fill="#0d2d44" />
        <rect x="726" y="176" width="14" height="426" fill="#0d2d44" />
        {/* Cross-bracing: what stops the legs reading as two posts. */}
        <path d="M 447 210 L 700 300 L 700 312 L 447 222 Z" fillOpacity="0.85" />
        <path d="M 447 300 L 700 210 L 700 222 L 447 312 Z" fillOpacity="0.85" />
        <path d="M 447 380 L 700 470 L 700 482 L 447 392 Z" fillOpacity="0.85" />
        <path d="M 447 470 L 700 380 L 700 392 L 447 482 Z" fillOpacity="0.85" />
        {/* The boom, and the machinery house behind the legs. */}
        <rect x="300" y="146" width="900" height="22" />
        <rect x="300" y="168" width="900" height="6" fill="#0a2437" />
        <rect x="718" y="96" width="120" height="52" fill="#0f3550" />
        <rect x="736" y="110" width="26" height="18" fill="#2aa3cf" fillOpacity="0.5" />
        <rect x="774" y="110" width="26" height="18" fill="#2aa3cf" fillOpacity="0.5" />
        {/* The stays that hold the boom up. */}
        <path d="M 438 150 L 300 120 L 300 128 L 438 160 Z" />
        <path d="M 708 150 L 1196 118 L 1196 126 L 708 160 Z" />
        <rect x="428" y="60" width="12" height="92" />
      </g>

      {/* Trolley, falls and spreader. The two cables are apart rather than one
          line down the middle: a box hangs from four corners, and one cable
          reads as a fishing rod. */}
      <rect x={trolley - 46} y="166" width="92" height="26" rx="3" fill="#17475f" />
      <rect x={trolley - 44} y={192} width="4" height={hookY - 200} fill="#8fb9cf" fillOpacity="0.55" />
      <rect x={trolley + 40} y={192} width="4" height={hookY - 200} fill="#8fb9cf" fillOpacity="0.55" />
      <rect x={trolley - 62} y={hookY - 10} width="124" height="14" rx="3" fill="#f4611f" />
      <rect x={trolley - 62} y={hookY - 10} width="124" height="4" rx="2" fill="#ff9c63" />

      {/* The box in the air, with its own shadow thrown down onto the quay. */}
      <ellipse cx={trolley + 6} cy="602" rx="112" ry="13" fill="#000" fillOpacity="0.45" />
      <g>
        <Container x={trolley - 60} y={hookY + 4} w={120} h={52} fill="#1b6a95" shade={0.3} />
        {/* Light from the floodlamp falls on the top of it, not the side. */}
        <rect x={trolley - 60} y={hookY + 4} width="120" height="5" fill="#cfe9fb" fillOpacity="0.35" />
      </g>

      {/* The trailer waiting under the hook. */}
      <g>
        <rect x={trolley - 140} y="566" width="264" height="14" rx="3" fill="#0d2f46" />
        <rect x={trolley - 240} y="530" width="96" height="50" rx="6" fill="#123a55" />
        <rect x={trolley - 232} y="540" width="44" height="22" rx="3" fill="#2aa3cf" fillOpacity="0.45" />
        {[-224, -168, 48, 86].map((dx) => (
          <circle key={dx} cx={trolley + dx} cy="588" r="13" fill="#061724" />
        ))}
        <circle cx={trolley - 250} cy="556" r="6" fill="#ffe0b0" fillOpacity="0.9" />
      </g>

      <Floodlight x={250} y={250} height={350} reach={360} flicker />
      <Floodlight x={980} y={238} height={362} reach={380} />

      {/* Wet concrete. The reflections are what make it night and not dusk. */}
      <rect x="0" y="600" width={VB.w} height={VB.h - 600} fill="url(#sc-beam)" opacity="0.1" />
      <g fillOpacity="0.16" fill="#7fc4e6">
        <rect x="222" y="612" width="56" height="176" />
        <rect x="952" y="612" width="56" height="176" />
        <rect x={trolley - 20} y="612" width="40" height="176" fillOpacity="0.1" />
      </g>
      <rect x="0" y="690" width={VB.w} height={VB.h - 690} fill="#02080f" fillOpacity="0.55" />
    </Frame>
  );
}

/* ── the port ─────────────────────────────────────────────────────────────── */

/**
 * A container terminal at dusk — the Dar end, where the box comes off.
 *
 * Wide and low: rows of stacks running away from the eye with the gantries
 * behind them, a warm sky going off over the water. Drawn for the wide slots.
 */
export function PortScene() {
  const id = "port";
  return (
    <Frame id={id}>
      <Defs id={id} sky={["#071a2c", "#1a4f68", "#e08a4a"]} />
      <rect width={VB.w} height={VB.h} fill={`url(#${id}-sky)`} />

      {/* The sun on the horizon and the band of cloud lying on it. */}
      <circle cx="905" cy="452" r="46" fill="#ffd2a0" fillOpacity="0.85" />
      <circle cx="905" cy="452" r="150" fill="#ff9d5c" fillOpacity="0.22" filter="url(#sc-haze)" />
      <ellipse cx="500" cy="380" rx="460" ry="34" fill="#0d3b55" fillOpacity="0.5" filter="url(#sc-haze)" />
      <ellipse cx="1000" cy="330" rx="330" ry="26" fill="#123f58" fillOpacity="0.4" filter="url(#sc-haze)" />

      {/* The water beyond the quay, and a ship standing off it. */}
      <rect x="0" y="452" width={VB.w} height="60" fill="#0b3550" />
      <rect x="0" y="452" width={VB.w} height="2" fill="#ffc894" fillOpacity="0.5" />
      <g fill="#041521">
        <path d="M 60 452 L 340 452 L 326 474 L 78 474 Z" />
        {[92, 128, 164, 200, 236, 272].map((x, i) => (
          <rect key={x} x={x} y={452 - [12, 18, 22, 22, 16, 10][i]} width="30" height={[12, 18, 22, 22, 16, 10][i]} />
        ))}
        <rect x="300" y="424" width="26" height="28" />
      </g>

      {/* Gantries along the quay, in silhouette against the sky. */}
      <g fill="#06202f">
        {[120, 420, 700].map((x, i) => (
          <g key={x} opacity={0.9 - i * 0.08}>
            <rect x={x} y="250" width="9" height="204" />
            <rect x={x + 128} y="250" width="9" height="204" />
            <rect x={x - 52} y="240" width="290" height="14" />
            <rect x={x - 52} y="196" width="13" height="48" />
            <path d={`M ${x + 137} 240 L ${x + 250} 226 L ${x + 250} 236 L ${x + 137} 250 Z`} />
          </g>
        ))}
      </g>

      {/* The quay apron. */}
      <rect x="0" y="500" width={VB.w} height={VB.h - 500} fill="#06182a" />
      <rect x="0" y="498" width={VB.w} height="5" fill="#0f3a54" />

      {/* Three rows of stacks, each nearer row bigger and darker: the only
          perspective this drawing needs. */}
      <g opacity="0.92">
        {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
          <Stack key={i} x={20 + i * 152} baseY={540} w={132} boxH={26} tiers={[3, 4, 5, 4, 5, 3, 4, 5][i]} seed={i * 3} />
        ))}
      </g>
      <rect x="0" y="540" width={VB.w} height="16" fill="#041220" />
      <g>
        {[0, 1, 2, 3, 4, 5, 6].map((i) => (
          <Stack key={i} x={-40 + i * 190} baseY={646} w={166} boxH={34} tiers={[4, 3, 5, 3, 4, 5, 3][i]} seed={i * 4 + 2} />
        ))}
      </g>
      <rect x="0" y="646" width={VB.w} height="18" fill="#030d18" />

      {/* The lane in front, with two trucks running down it. */}
      <rect x="0" y="664" width={VB.w} height={VB.h - 664} fill="#081a2b" />
      {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
        <rect key={i} x={20 + i * 140} y="740" width="70" height="5" rx="2.5" fill="#cfe1ee" fillOpacity="0.2" />
      ))}
      <g>
        <rect x="150" y="668" width="168" height="48" rx="5" fill="#0e3251" />
        <rect x="318" y="676" width="66" height="40" rx="6" fill="#1b6a95" />
        <rect x="330" y="684" width="30" height="16" rx="2" fill="#ffd9a8" fillOpacity="0.55" />
        <circle cx="200" cy="718" r="11" fill="#04101c" />
        <circle cx="290" cy="718" r="11" fill="#04101c" />
        <circle cx="360" cy="718" r="11" fill="#04101c" />
        <circle cx="388" cy="700" r="5" fill="#ffe0b0" />
      </g>
      <g opacity="0.85">
        <rect x="700" y="672" width="150" height="42" rx="5" fill="#14547d" />
        <rect x="850" y="680" width="58" height="34" rx="6" fill="#0e3251" />
        <circle cx="742" cy="716" r="10" fill="#04101c" />
        <circle cx="826" cy="716" r="10" fill="#04101c" />
        <circle cx="888" cy="716" r="10" fill="#04101c" />
      </g>

      {/* Mast lamps, and the wash they leave over the yard. */}
      <Floodlight x={560} y={300} height={360} reach={300} spread={70} flicker />
      <Floodlight x={1080} y={290} height={374} reach={320} spread={70} />
      <rect x="0" y="700" width={VB.w} height={VB.h - 700} fill="#020a14" fillOpacity="0.45" />
    </Frame>
  );
}

/* ── the warehouse ────────────────────────────────────────────────────────── */

/**
 * Inside Guangzhou: racking, cartons, and the counter where the measuring is
 * done. The one interior in the set, and the one that shows what the company
 * actually sells — that somebody counted the boxes.
 */
export function WarehouseScene() {
  const id = "shed";
  return (
    <Frame id={id}>
      <Defs id={id} sky={["#0a1e30", "#0c2b42", "#07182a"]} />
      <rect width={VB.w} height={VB.h} fill={`url(#${id}-sky)`} />

      {/* Roof: trusses running back, and the skylights between them. */}
      <g>
        {[0, 1, 2, 3, 4].map((i) => (
          <g key={i}>
            <rect x={40 + i * 244} y="0" width="150" height="16" fill="#1d5f80" fillOpacity={0.3 - i * 0.02} />
            <rect x={40 + i * 244} y="0" width="150" height="120" fill="#bfe4f6" fillOpacity="0.05" />
          </g>
        ))}
        <path d="M 0 90 L 600 30 L 1200 90 L 1200 112 L 600 52 L 0 112 Z" fill="#0d3049" />
        <path d="M 0 150 L 600 96 L 1200 150 L 1200 166 L 600 112 L 0 166 Z" fill="#0b2840" />
        {[220, 600, 980].map((x) => (
          <g key={x}>
            <circle cx={x} cy="152" r="40" fill="#ffe3b5" fillOpacity="0.14" filter="url(#sc-soft)" />
            <ellipse cx={x} cy="150" rx="26" ry="8" fill="#ffeecd" fillOpacity="0.8" />
            <polygon
              points={`${x - 26},152 ${x + 26},152 ${x + 190},700 ${x - 190},700`}
              fill="url(#sc-beam)"
              opacity="0.22"
            />
          </g>
        ))}
      </g>

      {/* The floor, and the aisle lines painted on it. */}
      <rect x="0" y="560" width={VB.w} height={VB.h - 560} fill="#0a2236" />
      <polygon points="430,560 770,560 1010,800 190,800" fill="#0c2a42" />
      <polygon points="438,560 456,560 214,800 176,800" fill="#f4c04f" fillOpacity="0.22" />
      <polygon points="762,560 780,560 1022,800 984,800" fill="#f4c04f" fillOpacity="0.22" />

      {/* Racking either side of the aisle, receding. Uprights, beams and the
          cartons on them — the cartons are the point, so they carry the colour
          and the steel stays dark. */}
      {([
        { x: 20, w: 400, dir: 1 },
        { x: 780, w: 400, dir: -1 },
      ] as const).map((bay) => (
        <g key={bay.x}>
          {[0, 1, 2].map((level) => {
            const y = 250 + level * 108;
            return (
              <g key={level}>
                <rect x={bay.x} y={y + 74} width={bay.w} height="12" fill="#f4611f" fillOpacity="0.55" />
                <rect x={bay.x} y={y + 74} width={bay.w} height="3" fill="#ff9c63" fillOpacity="0.6" />
                {[0, 1, 2, 3, 4, 5].map((c) => (
                  <g key={c}>
                    <rect
                      x={bay.x + 14 + c * 64}
                      y={y + 22}
                      width="54"
                      height="52"
                      fill={["#b98a57", "#a87c4c", "#c2966a", "#9c7043"][(c + level) % 4]}
                    />
                    <rect x={bay.x + 14 + c * 64} y={y + 44} width="54" height="4" fill="#e8cfa8" fillOpacity="0.5" />
                    <rect x={bay.x + 38 + c * 64} y={y + 22} width="6" height="52" fill="#000" fillOpacity="0.12" />
                    {/* The mark, written on the box — why any of this works. */}
                    <rect x={bay.x + 20 + c * 64} y={y + 54} width="26" height="6" fill="#2b3f52" fillOpacity="0.45" />
                  </g>
                ))}
              </g>
            );
          })}
          {[0, 1, 2, 3, 4].map((u) => (
            <rect key={u} x={bay.x - 6 + u * (bay.w / 4)} y="240" width="11" height="330" fill="#123a55" />
          ))}
        </g>
      ))}

      {/* A pallet of boxes shrink-wrapped, standing in the aisle, and the
          forklift that put it there. */}
      <g>
        <rect x="520" y="470" width="150" height="120" fill="#a87c4c" />
        <rect x="520" y="470" width="150" height="120" fill="#cfe9fb" fillOpacity="0.14" />
        {[0, 1, 2].map((r) => (
          <rect key={r} x="520" y={470 + r * 40} width="150" height="3" fill="#000" fillOpacity="0.2" />
        ))}
        <rect x="514" y="590" width="162" height="16" fill="#7a5a34" />
        <rect x="514" y="590" width="162" height="4" fill="#9c7043" />
      </g>
      <g>
        <rect x="770" y="470" width="14" height="140" fill="#123a55" />
        <rect x="784" y="592" width="90" height="16" fill="#f4611f" />
        <rect x="866" y="500" width="104" height="94" rx="8" fill="#f4611f" />
        <rect x="878" y="512" width="56" height="38" rx="4" fill="#0b2840" fillOpacity="0.7" />
        <rect x="866" y="452" width="104" height="10" fill="#123a55" />
        <rect x="872" y="462" width="8" height="40" fill="#123a55" />
        <rect x="956" y="462" width="8" height="40" fill="#123a55" />
        <circle cx="892" cy="606" r="18" fill="#08192a" />
        <circle cx="956" cy="606" r="14" fill="#08192a" />
      </g>

      {/* Depth: the far end of the shed going dark, and the near corners too. */}
      <rect x="0" y="0" width={VB.w} height={VB.h} fill="url(#sc-beam)" opacity="0.06" />
      <ellipse cx="600" cy="520" rx="300" ry="160" fill="#ffd9a8" fillOpacity="0.05" filter="url(#sc-haze)" />
      <rect x="0" y="720" width={VB.w} height="80" fill="#04101d" fillOpacity="0.6" />
    </Frame>
  );
}

/* ── the register ─────────────────────────────────────────────────────────── */

export const SCENES = {
  crane: CraneScene,
  port: PortScene,
  warehouse: WarehouseScene,
} as const;

export type SceneName = keyof typeof SCENES;
