/**
 * THE SEA, BEHIND THE TRACKING FORM.
 *
 * This page used to open on an icon in a rounded square, and then on a dotted
 * world map with a lane drawn across it. A customer arriving from a WhatsApp
 * message with a reference in their hand is asking one question — where is my
 * cargo — and both of those answered it with a diagram. What their cargo is
 * actually doing is this: a loaded container ship, low in the water, somewhere
 * between Guangzhou and Dar es Salaam at dusk.
 *
 * NO JAVASCRIPT AND NO IMAGE FILE. Every pixel here is a gradient, a path or a
 * keyframe, and every animation is a transform or an opacity, which the
 * compositor runs without waking the main thread. This is the first screen most
 * of this business's customers will ever load, on Tanzanian mobile data, and it
 * must not cost them a frame or a kilobyte of script.
 *
 * The colours are literals rather than theme tokens. The hero is the same
 * picture whichever theme the reader has chosen — a printed cover does not
 * change colour because the room does — and fixing them is also what guarantees
 * white type keeps its contrast in both.
 *
 * Nothing here claims to know where any particular box is. There is no AIS feed
 * on this service and a scene that looked like one would be a lie told in
 * pixels. This is the trade the company sails, drawn; the facts are the ones
 * underneath it.
 */

/* ── the ship's own coordinates ───────────────────────────────────────────── */

/** Her box. The hull takes the left two thirds; the rest is wake. */
const SHIP_W = 900;
const SHIP_H = 300;

/** Where the water cuts her. Below it is reflection, foam and wake. */
const WATERLINE = 200;

const BOW = 44;
const STERN = 600;

/** The sheer: the deck sits a few units higher forward than aft. */
const deckY = (x: number) => 170 + ((x - BOW) / (STERN - BOW)) * 9;

/**
 * The deck cargo, bay by bay from the bow.
 *
 * Tallest amidships and stepped down fore and aft, the way a stowage plan comes
 * out once the heavy boxes are placed low and in the middle. The pattern is
 * fixed rather than drawn at random: this renders on the server, and a shuffled
 * deck would be a different ship in the markup than in the browser.
 */
const BAY_X = [92, 144, 196, 248, 300, 352, 404];
const BAY_TIERS = [3, 4, 5, 5, 5, 4, 3];
const BAY_W = 46;
const TIER = 9;

/**
 * Container colours, off the logo: navy, the cyan of the boxes on deck in the
 * mark, and the orange sun used once in nine so it reads as an accent rather
 * than as livery.
 */
const BOX_COLOURS = [
  "#0e3251",
  "#1b6a95",
  "#2aa3cf",
  "#0a2740",
  "#f4611f",
  "#14547d",
  "#0e3251",
  "#9a4a22",
  "#1b6a95",
];

/** Five decks of windows on the accommodation block. */
const WINDOWS = Array.from({ length: 5 }, (_, deck) =>
  Array.from({ length: 7 }, (_, bay) => ({
    key: `${deck}-${bay}`,
    x: 466 + bay * 13,
    y: 135 + deck * 8.5,
  }))
).flat();

/* ── the water ────────────────────────────────────────────────────────────── */

/** The sea's own box: 0 is the horizon, 400 the bottom of the frame. */
const SEA_W = 2400;
const SEA_H = 400;

/**
 * One band of swell, drawn twice end to end.
 *
 * The band is 2400 wide and repeats every 1200, so sliding it 1200 units puts
 * it back exactly where it started: the water passes the ship forever without a
 * seam and without a line of script. `length` has to divide 1200.
 */
function swell(top: number, amplitude: number, length: number) {
  let line = `M 0 ${top}`;
  for (let x = 0; x < SEA_W; x += length) {
    line +=
      ` q ${length / 4} ${-amplitude} ${length / 2} 0` +
      ` q ${length / 4} ${amplitude} ${length / 2} 0`;
  }
  /* The body of the band and its crest are the same curve drawn twice: filled
     downwards it is water, stroked it is the light along the top of a swell.
     Without the second one the sea is a stack of flat shapes. */
  return { area: `${line} L ${SEA_W} ${SEA_H} L 0 ${SEA_H} Z`, line };
}

/** Behind the ship: distant water, small and slow. */
const FAR_BANDS = [
  { ...swell(12, 2, 150), fill: "#2a8199", opacity: 0.2, crest: 0.26, seconds: 58 },
  { ...swell(36, 3.5, 200), fill: "#10506f", opacity: 0.28, crest: 0.2, seconds: 43 },
  { ...swell(80, 6, 300), fill: "#0a3350", opacity: 0.36, crest: 0.16, seconds: 31 },
];

/** In front of her: nearer water, bigger and faster. The parallax is the depth. */
const NEAR_BANDS = [
  { ...swell(214, 9, 400), fill: "#0a2c4a", opacity: 0.4, crest: 0.22, seconds: 25 },
  { ...swell(276, 14, 600), fill: "#07203a", opacity: 0.44, crest: 0.17, seconds: 18 },
  { ...swell(330, 20, 800), fill: "#05182c", opacity: 0.5, crest: 0.13, seconds: 13 },
];

/**
 * Sun on water, as flecks rather than a beam.
 *
 * A single bright column reads as a searchlight. What a low sun actually leaves
 * is a broken path of glitter that widens and lengthens as it comes towards
 * you, and every fleck blinks on its own clock.
 */
const SUN_X = 1776;
const GLINTS = Array.from({ length: 38 }, (_, i) => {
  const t = (i % 13) / 12;
  const row = Math.floor(i / 13);
  const offset = (((i * 137) % 101) - 50) * (1.1 + t * 5) + row * 31;
  return {
    key: i,
    x: SUN_X + offset,
    y: 204 + t * t * 172 + row * 15 + ((i * 29) % 11),
    w: 8 + t * 40,
    h: 1 + t * 1.5,
    /* Brightest under the sun and dying away either side of it: a path of
       light has edges, and one of even brightness reads as confetti. */
    opacity: Math.max(0.12, 0.62 - Math.abs(offset) / 620),
    delay: `${((i * 0.41) % 7).toFixed(2)}s`,
    seconds: 5 + ((i * 3) % 6),
  };
});

/**
 * Volumetric light: what is left of the sun coming up through the haze.
 *
 * Six wedges from one point, blurred to nothing and faded out before they reach
 * the top of the sky. At this opacity they are not a sunburst, they are the
 * reason the sky above the horizon is not one flat colour.
 */
const RAYS = [-52, -31, -14, 6, 24, 47].map((tilt, i) => ({
  key: i,
  points: `200,300 ${200 + tilt * 2.4 - (5 + (i % 3) * 6)},0 ${200 + tilt * 2.4 + (5 + (i % 3) * 6)},0`,
  opacity: 0.16 + ((i * 3) % 5) / 40,
}));

/** Wind-blown foam on the near water, drifting with it. */
const FLECKS = Array.from({ length: 16 }, (_, i) => ({
  key: i,
  x: (i * 139) % 1200,
  y: 216 + ((i * 53) % 164),
  w: 14 + ((i * 7) % 30),
  opacity: 0.04 + ((i * 11) % 7) / 180,
}));

/* ── the drawing ──────────────────────────────────────────────────────────── */

function ShipBody() {
  return (
    <g>
      {/* The hull, drawn whole. The caller clips her at the waterline rather
          than here, so that when she rolls the water takes the right amount of
          her instead of a fixed strip. */}
      <path
        d={`M ${BOW} 170 C 170 175 380 177 ${STERN} 179 L ${STERN} 218 C 430 226 180 223 100 210 L 54 201 Z`}
        fill="url(#ss-hull)"
      />
      {/* The boot top: the band a loaded ship carries just above her marks. */}
      <path d={`M 56 191 L ${STERN} 190 L ${STERN} 202 L 78 202 Z`} fill="#1a97c6" fillOpacity="0.4" />
      {/* The shadow the deck cargo throws down her side. */}
      <path
        d={`M 92 ${deckY(92)} L 450 ${deckY(450)} L 450 ${deckY(450) + 7} L 92 ${deckY(92) + 7} Z`}
        fill="#020c16"
        fillOpacity="0.3"
      />
      {/* The sheer line, catching what is left of the sun. */}
      <path
        d={`M ${BOW} 170 C 170 175 380 177 ${STERN} 179`}
        fill="none"
        stroke="#9ed8f2"
        strokeOpacity="0.42"
        strokeWidth="1.4"
      />
      <text
        x="140"
        y="187"
        fontSize="10"
        letterSpacing="2.4"
        fontWeight="600"
        fill="#dcefff"
        fillOpacity="0.28"
        fontFamily="ui-sans-serif, system-ui, sans-serif"
      >
        SWIFT CARGO
      </text>

      {/* Deck cargo. */}
      {BAY_X.map((x, bay) => {
        const base = deckY(x + BAY_W / 2);
        return (
          <g key={x}>
            {Array.from({ length: BAY_TIERS[bay] }, (_, tier) => {
              const y = base - (tier + 1) * TIER;
              return (
                <g key={tier}>
                  <rect
                    x={x}
                    y={y}
                    width={BAY_W}
                    height={TIER - 1}
                    fill={BOX_COLOURS[(bay * 4 + tier * 5) % BOX_COLOURS.length]}
                  />
                  {/* The lid of every box takes the sky and the door end takes
                      the shadow. Two hairlines are the whole difference between
                      a stack of containers and a bar chart. */}
                  <rect x={x} y={y} width={BAY_W} height="1" fill="#ffffff" fillOpacity="0.15" />
                  <rect
                    x={x + BAY_W - 1.2}
                    y={y}
                    width="1.2"
                    height={TIER - 1}
                    fill="#00131f"
                    fillOpacity="0.32"
                  />
                </g>
              );
            })}
          </g>
        );
      })}

      {/* Light comes from astern, so every stack is lit on its after face and in
          shadow forward. Two overlays are the whole of the modelling. */}
      {BAY_X.map((x, bay) => (
        <rect
          key={`s-${x}`}
          x={x}
          y={deckY(x + BAY_W / 2) - BAY_TIERS[bay] * TIER}
          width={BAY_W}
          height={BAY_TIERS[bay] * TIER}
          fill="url(#ss-stackshade)"
        />
      ))}

      {/* Lashing bridges, standing between the bays. */}
      {BAY_X.slice(0, -1).map((x) => (
        <rect key={`l-${x}`} x={x + BAY_W} y={deckY(x) - 19} width="6" height="19" fill="#0b3152" />
      ))}

      {/* The forecastle and her bow mast. */}
      <path d={`M ${BOW} 170 L 88 172 L 88 164 L ${BOW} 162 Z`} fill="#15446c" />
      <rect x="83" y="134" width="2" height="30" fill="#0e3556" />
      <rect x="74" y="142" width="20" height="1.6" fill="#0e3556" />

      {/* The accommodation block, aft, where the crew live and she is steered
          from. Without it this is a barge with boxes on. */}
      <path d={`M 460 ${deckY(460)} L 556 ${deckY(556)} L 556 129 L 460 129 Z`} fill="#16456b" />
      {WINDOWS.map((w) => (
        <rect key={w.key} x={w.x} y={w.y} width="7" height="4" fill="#bfe4f7" fillOpacity="0.26" />
      ))}
      {/* The bridge: wider than the block under it, and the one lit line on her. */}
      <rect x="452" y="120" width="112" height="9" rx="1.5" fill="#1d5a86" />
      <rect x="478" y="107" width="60" height="14" fill="#16456b" />
      <rect x="482" y="110" width="52" height="5" fill="#ffd9a8" fillOpacity="0.5" />
      {/* The funnel, with the company's band on it. */}
      <path d="M 494 107 L 528 107 L 524 84 L 498 84 Z" fill="#0f3a5c" />
      <path d="M 500 96 L 524 96 L 522 89 L 502 89 Z" fill="#f4611f" fillOpacity="0.85" />
      <rect x="510" y="68" width="1.6" height="17" fill="#0e3556" />
      <circle cx="510.8" cy="67" r="2.1" fill="#ffdcb0" className="ss-mastlight" />

      {/* The poop deck and her aft mast. */}
      <path d={`M 556 ${deckY(556)} L ${STERN} 179 L ${STERN} 171 L 556 169 Z`} fill="#15446c" />
      <rect x="574" y="150" width="1.6" height="20" fill="#0e3556" />
    </g>
  );
}

/**
 * What the water gives back.
 *
 * Coarse on purpose: three masses, mirrored, blurred and faded downwards, with
 * the near swell breaking across them. A reflection with the containers legible
 * in it is a reflection nobody has ever seen.
 */
function Reflection() {
  return (
    <g transform={`matrix(1 0 0 -1 0 ${WATERLINE * 2})`}>
      <path
        d={`M 54 201 L ${STERN} 201 L ${STERN} 228 C 430 236 180 233 100 219 Z`}
        fill="#17587f"
        fillOpacity="0.75"
      />
      <path d="M 92 201 L 450 201 L 450 250 L 92 250 Z" fill="#1d6d99" fillOpacity="0.4" />
      <path d="M 460 201 L 556 201 L 556 268 L 460 268 Z" fill="#1a5f8a" fillOpacity="0.46" />
      {/* The one warm thing under her: the sun's path passing her stern. */}
      <path d="M 556 201 L 620 201 L 620 240 L 556 240 Z" fill="#ffb877" fillOpacity="0.18" />
    </g>
  );
}

function Ship() {
  return (
    <svg
      viewBox={`0 0 ${SHIP_W} ${SHIP_H}`}
      preserveAspectRatio="xMidYMid meet"
      className="h-auto w-full overflow-visible"
    >
      <defs>
        <linearGradient id="ss-stackshade" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#020c16" stopOpacity="0.42" />
          <stop offset="62%" stopColor="#020c16" stopOpacity="0.06" />
          <stop offset="100%" stopColor="#ffe0bc" stopOpacity="0.12" />
        </linearGradient>
        <linearGradient id="ss-hull" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#17486f" />
          <stop offset="58%" stopColor="#0c3150" />
          <stop offset="100%" stopColor="#051829" />
        </linearGradient>
        {/* The wake dies out astern rather than ending in an edge, which is the
            whole difference between a wake and a grey triangle. */}
        <linearGradient id="ss-wake" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#dff2ff" stopOpacity="0.42" />
          <stop offset="34%" stopColor="#cfe9fb" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#cfe9fb" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="ss-foamfade" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
        <linearGradient
          id="ss-reflect"
          gradientUnits="userSpaceOnUse"
          x1="0"
          y1={WATERLINE}
          x2="0"
          y2={SHIP_H}
        >
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="58%" stopColor="#6a6a6a" />
          <stop offset="100%" stopColor="#000000" />
        </linearGradient>
        <mask id="ss-reflect-mask">
          <rect x="0" y={WATERLINE} width={SHIP_W} height={SHIP_H - WATERLINE} fill="url(#ss-reflect)" />
        </mask>
        <clipPath id="ss-above">
          <rect x="0" y="0" width={SHIP_W} height={WATERLINE} />
        </clipPath>
        <clipPath id="ss-below">
          <rect x="0" y={WATERLINE} width={SHIP_W} height={SHIP_H - WATERLINE} />
        </clipPath>
        <filter id="ss-soft" x="-20%" y="-40%" width="140%" height="180%">
          <feGaussianBlur stdDeviation="2.6" />
        </filter>
        <filter id="ss-bloom" x="-60%" y="-120%" width="220%" height="340%">
          <feGaussianBlur stdDeviation="3.4" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Her reflection, under the water and moving with her. */}
      <g clipPath="url(#ss-below)" mask="url(#ss-reflect-mask)" filter="url(#ss-soft)" opacity="0.9">
        <g className="ss-heave">
          <g className="ss-pitch">
            <Reflection />
          </g>
        </g>
      </g>

      {/* The wake: a long dissipating scar astern, and the two waves that run
          away from it. Drawn on the water rather than on the ship, so it does
          not roll with her. */}
      <g className="ss-heave">
        <path
          d={`M ${STERN} 195 C 690 199 790 205 886 212 L 886 226 C 790 219 690 210 ${STERN} 205 Z`}
          fill="url(#ss-wake)"
        />
        <path
          d={`M 594 199 C 690 206 790 218 886 234`}
          fill="none"
          stroke="url(#ss-foamfade)"
          strokeOpacity="0.5"
          strokeWidth="1.6"
        />
        <path
          d={`M 594 198 C 690 194 790 188 886 182`}
          fill="none"
          stroke="url(#ss-foamfade)"
          strokeOpacity="0.32"
          strokeWidth="1.2"
        />
        {/* The turbulence right under her counter, where the screw is. */}
        <ellipse
          cx="606"
          cy="201"
          rx="26"
          ry="6"
          fill="#e8f6ff"
          fillOpacity="0.4"
          filter="url(#ss-soft)"
          className="ss-foam"
        />
      </g>

      {/* Her, clipped at the water. */}
      <g clipPath="url(#ss-above)">
        <g className="ss-surge">
          <g className="ss-heave">
            <g className="ss-pitch">
              <ShipBody />
            </g>
          </g>
        </g>
      </g>

      {/* The bow wave, and the wash running aft along the hull. Two shapes: the
          crest breaking off the stem, hard and bright, and the spray thrown
          ahead of it, which is neither. One smear does both badly. */}
      <g className="ss-heave">
        <path
          d="M 42 200 C 28 202 14 205 0 208 C 14 212 30 210 46 205 Z"
          fill="#dcf1ff"
          fillOpacity="0.22"
          filter="url(#ss-soft)"
        />
        <path
          d="M 56 194 C 47 195 38 199 31 204 C 41 207 51 203 58 197 Z"
          fill="#f6fcff"
          fillOpacity="0.62"
          filter="url(#ss-bloom)"
          className="ss-foam"
        />
        {/* The collar of foam the hull drags aft of the stem. */}
        <path
          d="M 58 199 C 90 202 130 204 168 204 C 130 208 90 206 58 203 Z"
          fill="#dcf1ff"
          fillOpacity="0.22"
          filter="url(#ss-soft)"
        />
        <path
          d={`M 60 200 C 200 205 400 206 ${STERN} 203`}
          fill="none"
          stroke="#dff2ff"
          strokeOpacity="0.22"
          strokeWidth="1.4"
          strokeDasharray="14 22"
          className="ss-wash"
        />
      </g>
    </svg>
  );
}

/* ── the scene ────────────────────────────────────────────────────────────── */

/**
 * Dusk over the Indian Ocean.
 *
 * The layers run back to front — sky, sun, haze, far water, ship, near water,
 * then the scrims that keep the type legible over all of it. That order is the
 * whole illusion: water drawn in front of the hull is what puts her *in* the sea
 * instead of on top of a picture of one.
 *
 * The horizon is one number repeated at three widths. On a phone the words sit
 * above the water and the sea takes a band along the bottom; on a wide screen
 * it drops to just under halfway and the ship stands beside the heading. The
 * caller reserves the band with padding, so nothing ever moves after paint.
 */
export function SeaScene() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute inset-0 bg-[#02070d]" />

      {/* Sky: indigo overhead, warming all the way down to the water. It stops
          at the horizon rather than at the bottom of the hero, or the warm end
          of it would be hidden behind the sea and the sky would read as the
          darker of the two — which is not what dusk looks like. */}
      <div
        className="absolute inset-x-0 top-0 bottom-[72vw] sm:bottom-[42vw] lg:bottom-[58%]"
        style={{
          background:
            "linear-gradient(to bottom, #02070d 0%, #051425 30%, #0b3349 62%, #1d6b83 86%, #3f9cae 100%)",
        }}
      />

      {/* Haze plates, drifting at two speeds. Depth before anything is drawn. */}
      <div className="absolute inset-x-0 bottom-[72vw] top-0 overflow-hidden sm:bottom-[42vw] lg:bottom-[58%]">
        <div
          className="ss-haze-a absolute inset-x-[-20%] bottom-[2%] h-[38%]"
          style={{
            background:
              "radial-gradient(60% 100% at 30% 100%, rgba(122,178,205,0.20), transparent 70%)," +
              "radial-gradient(45% 100% at 72% 100%, rgba(255,168,104,0.16), transparent 72%)",
          }}
        />
        {/* A bank of cloud lying on the horizon: what makes a sunset read as
            weather rather than as a gradient. */}
        <div
          className="ss-haze-c absolute inset-x-[-15%] bottom-0 h-[13%]"
          style={{
            background:
              "radial-gradient(42% 100% at 20% 100%, rgba(4,14,26,0.36), transparent 74%)," +
              "radial-gradient(28% 100% at 50% 100%, rgba(5,18,32,0.3), transparent 76%)," +
              "radial-gradient(34% 100% at 90% 100%, rgba(4,14,26,0.3), transparent 76%)",
          }}
        />
        <div
          className="ss-haze-b absolute inset-x-[-25%] bottom-[24%] h-[42%]"
          style={{
            background:
              "radial-gradient(50% 100% at 58% 100%, rgba(96,140,180,0.16), transparent 72%)," +
              "radial-gradient(38% 100% at 18% 100%, rgba(80,120,164,0.12), transparent 74%)",
          }}
        />
      </div>

      {/* The sun, sitting on the horizon behind her: the glow first, then the
          disc the water cuts in half. */}
      <div className="absolute inset-x-0 bottom-[72vw] h-0 sm:bottom-[42vw] lg:bottom-auto lg:top-[42%]">
        <div
          className="absolute left-[74%] top-0 aspect-square w-[92%] -translate-x-1/2 -translate-y-1/2 rounded-full sm:w-[64%] lg:w-[46%]"
          style={{
            background:
              "radial-gradient(circle, rgba(255,186,122,0.30) 0%, rgba(255,140,70,0.14) 34%, rgba(255,120,60,0.05) 56%, transparent 72%)",
          }}
        />
        <div
          className="absolute left-[74%] top-0 aspect-square w-[13%] -translate-x-1/2 -translate-y-1/2 rounded-full sm:w-[9%] lg:w-[6.5%]"
          style={{
            background:
              "radial-gradient(circle, rgba(255,232,200,0.85) 0%, rgba(255,178,110,0.55) 42%, rgba(255,140,70,0.12) 68%, transparent 76%)",
          }}
        />
      </div>

      {/* The light itself, fanning up from where the sun meets the water. */}
      <div className="absolute inset-x-0 bottom-[72vw] h-0 sm:bottom-[42vw] lg:bottom-auto lg:top-[42%]">
        <svg
          viewBox="0 0 400 300"
          preserveAspectRatio="xMidYMax meet"
          className="ss-rays absolute bottom-0 left-[74%] w-[150%] -translate-x-1/2 sm:w-[105%] lg:w-[78%]"
        >
          <defs>
            <linearGradient id="ss-rayfade" x1="0" y1="1" x2="0" y2="0">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0.9" />
              <stop offset="55%" stopColor="#ffffff" stopOpacity="0.25" />
              <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
            </linearGradient>
            <mask id="ss-raymask">
              <rect x="0" y="0" width="400" height="300" fill="url(#ss-rayfade)" />
            </mask>
            <filter id="ss-rayblur" x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="7" />
            </filter>
          </defs>
          <g mask="url(#ss-raymask)" filter="url(#ss-rayblur)">
            {RAYS.map((ray) => (
              <polygon key={ray.key} points={ray.points} fill="#ffd0a0" fillOpacity={ray.opacity} />
            ))}
          </g>
        </svg>
      </div>

      {/* The water. Its top edge is the horizon. */}
      <div className="absolute inset-x-0 bottom-0 h-[72vw] sm:h-[42vw] lg:h-auto lg:top-[42%]">
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(to bottom, #1d6b81 0%, #0c4160 13%, #072544 40%, #04162a 100%)",
          }}
        />

        {/* The horizon itself: one hairline, brightest where the sun is on it.
            Without it the sky and the water melt into each other and the scene
            loses the only edge it has. */}
        <div
          className="absolute inset-x-0 top-0 h-px"
          style={{
            background:
              "linear-gradient(to right, transparent 0%, rgba(126,196,222,0.22) 26%, rgba(255,206,158,0.75) 74%, rgba(126,196,222,0.2) 90%, transparent 100%)",
          }}
        />
        {/* The last of the light lying on the water under the sun. */}
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(38% 46% at 74% 0%, rgba(255,178,112,0.24), transparent 70%)",
          }}
        />

        {/* Far swell, behind her. */}
        <svg
          viewBox={`0 0 ${SEA_W} ${SEA_H}`}
          preserveAspectRatio="none"
          className="absolute inset-0 h-full w-full"
        >
          {FAR_BANDS.map((band) => (
            <g key={band.seconds} className="ss-band" style={{ animationDuration: `${band.seconds}s` }}>
              <path d={band.area} fill={band.fill} fillOpacity={band.opacity} />
              <path
                d={band.line}
                fill="none"
                stroke="#a9dcf2"
                strokeOpacity={band.crest}
                strokeWidth="1.2"
                vectorEffect="non-scaling-stroke"
              />
            </g>
          ))}
        </svg>

        {/* Her. Tied to the column the words are in rather than to the window,
            so on a 2560 screen she stays beside the heading instead of an ocean
            away from it. */}
        <div className="container absolute inset-0 h-full">
          <div className="ss-parallax absolute inset-0">
            <div className="absolute left-[-1%] top-0 mt-[2%] w-[142%] sm:left-[15.8%] sm:mt-[2.6%] sm:w-[101%] lg:left-[49.5%] lg:mt-[-2.1%] lg:w-[72%] xl:left-[37.3%] xl:mt-[-2.3%] xl:w-[76%] 2xl:left-[34.5%] 2xl:mt-[-1.5vw] 2xl:w-[50vw]">
              <Ship />
            </div>
          </div>
        </div>

        {/* Near swell, in front of her, and the foam the wind takes off it. */}
        <svg
          viewBox={`0 0 ${SEA_W} ${SEA_H}`}
          preserveAspectRatio="none"
          className="absolute inset-0 h-full w-full"
        >
          {NEAR_BANDS.map((band) => (
            <g key={band.seconds} className="ss-band" style={{ animationDuration: `${band.seconds}s` }}>
              <path d={band.area} fill={band.fill} fillOpacity={band.opacity} />
              <path
                d={band.line}
                fill="none"
                stroke="#bfe6f8"
                strokeOpacity={band.crest}
                strokeWidth="1.1"
                vectorEffect="non-scaling-stroke"
              />
            </g>
          ))}
          {/* The sun's own path, on the water this side of her. */}
          {GLINTS.map((g) => (
            <rect
              key={g.key}
              x={g.x}
              y={g.y}
              width={g.w}
              height={g.h}
              rx={g.h / 2}
              fill="#ffd9ab"
              className="ss-glint"
              style={{
                animationDuration: `${g.seconds}s`,
                animationDelay: g.delay,
                ["--glint" as string]: g.opacity,
              }}
            />
          ))}
          <g className="ss-band" style={{ animationDuration: "19s" }}>
            {FLECKS.map((f) => (
              <g key={f.key}>
                <rect x={f.x} y={f.y} width={f.w} height="1.1" rx="0.55" fill="#cfe9fb" fillOpacity={f.opacity} />
                <rect
                  x={f.x + 1200}
                  y={f.y}
                  width={f.w}
                  height="1.1"
                  rx="0.55"
                  fill="#cfe9fb"
                  fillOpacity={f.opacity}
                />
              </g>
            ))}
          </g>
        </svg>
      </div>

      {/* The reading side. Whatever the ocean is doing, the left of a wide
          screen stays dark enough for a heading and a search field; on a phone
          the words are above the water, so the wash comes down from the top
          instead of in from the side. */}
      <div
        className="absolute inset-0 lg:hidden"
        style={{
          background:
            "linear-gradient(to bottom, rgba(1,6,12,0.9) 0%, rgba(1,6,12,0.72) 26%, rgba(1,6,12,0.2) 48%, transparent 62%)",
        }}
      />
      <div
        className="absolute inset-0 hidden lg:block"
        style={{
          background:
            "linear-gradient(100deg, rgba(1,7,14,0.9) 0%, rgba(1,7,14,0.8) 26%, rgba(1,7,14,0.38) 46%, transparent 64%)",
        }}
      />

      {/* A vignette, so the corners fall away and the middle keeps the eye. */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(130% 105% at 52% 44%, transparent 44%, rgba(1,5,11,0.58) 100%)",
        }}
      />

      {/* Grain. At this strength nobody sees it; without it the gradients band
          on a cheap panel and the whole thing looks rendered. */}
      <div className="ss-grain absolute inset-0" />

      <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-cyan-400/45 to-transparent" />
    </div>
  );
}
