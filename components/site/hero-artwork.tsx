import Image from "next/image";

import { SCENES, type SceneName } from "@/components/site/scenes";

/**
 * WHERE THE PHOTOGRAPHS GO.
 *
 * Three pages open on a full-width band of ink — services, China sourcing and
 * about. The band was a flat colour with a gradient on it. This puts a picture
 * behind it: a drawing today (components/site/scenes.tsx), a photograph the
 * moment the company has one.
 *
 * It sits inside the hero section the page already had. It adds no section, no
 * heading and no link — it is a backdrop, and every word on top of it is the
 * word that was there before.
 *
 * TO FIT A REAL PHOTOGRAPH, two steps and no layout work:
 *
 *   1. Put the file in `public/photos/` under the slot's own name, e.g.
 *      `public/photos/hero-services.jpg`.
 *   2. Give the slot a `photo` in the table below.
 *
 * WHAT EACH SLOT WANTS is in the table. All three are the same shape, because
 * all three bands are the same shape: a wide, shallow strip. Send a landscape
 * frame with the subject on the RIGHT — the left of the band carries the
 * heading, and the artwork is faded out under it — and with room to crop top
 * and bottom, because a hero band is shorter than a photograph.
 *
 *   hero-services    2400 × 1000 or wider   the quay, containers, a crane
 *   hero-china       2400 × 1000 or wider   the Guangzhou receiving floor
 *   hero-about       2400 × 1000 or wider   a container being lifted or loaded
 *
 * Twice the width it is ever painted at, so it stays sharp on a dense screen;
 * next/image serves AVIF and WebP down to whatever the device asks for, so an
 * oversized original costs the visitor nothing.
 *
 * `alt` is empty on purpose and stays empty when the photograph lands. This is
 * decoration behind a heading that already says what the page is; announcing
 * "a crane lifting a container" to a screen reader in front of it is noise.
 */

type Slot = {
  /** The drawing shown until a photograph is filed. */
  scene: SceneName;
  /** `/photos/<file>` once one exists. Undefined means the drawing stands. */
  photo?: string;
};

export const HERO_SLOTS = {
  "hero-services": { scene: "port" },
  "hero-china": { scene: "warehouse" },
  "hero-about": { scene: "crane" },
} as const satisfies Record<string, Slot>;

export type HeroSlotName = keyof typeof HERO_SLOTS;

/**
 * The picture is masked rather than merely dimmed.
 *
 * A photograph at 20% opacity behind a paragraph is a picture you cannot see
 * and type you cannot read. One that stops before it reaches the words is
 * neither: the heading keeps a plain dark ground, and the right of the band
 * carries the picture at full strength.
 */
const FADE =
  "linear-gradient(to left, #000 0%, #000 26%, rgba(0,0,0,0.4) 62%, transparent 100%)";

export function HeroArtwork({ name }: { name: HeroSlotName }) {
  const slot: Slot = HERO_SLOTS[name];
  const Scene = SCENES[slot.scene];

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-y-0 right-0 hidden w-[62%] overflow-hidden md:block"
      style={{ maskImage: FADE, WebkitMaskImage: FADE }}
    >
      {slot.photo ? (
        <Image
          src={slot.photo}
          alt=""
          fill
          sizes="(max-width: 767px) 0px, 62vw"
          className="object-cover"
        />
      ) : (
        <Scene />
      )}
    </div>
  );
}
