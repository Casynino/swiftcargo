import Image from "next/image";

import { SCENES, type SceneName } from "@/components/site/scenes";
import { cn } from "@/lib/utils";

/**
 * WHERE THE PHOTOGRAPHS GO.
 *
 * The public site is laid out for real photography — a crane at the port, the
 * receiving counter in Guangzhou, a container being stripped in Dar. There is
 * none yet, so every one of those places is a slot: it reserves its aspect
 * ratio, renders a drawing of roughly the right subject (components/site/
 * scenes.tsx), and swaps to the photograph the moment one is filed.
 *
 * TO FIT A REAL PHOTOGRAPH, two steps and no layout work:
 *
 *   1. Put the file in `public/photos/` under the slot's own id, e.g.
 *      `public/photos/crane-lift.jpg`.
 *   2. Give the slot a `photo` in the table below.
 *
 * The slot keeps its ratio either way, so nothing on the page moves when the
 * picture arrives and nothing has to be re-cut when it is replaced.
 *
 * WHAT EACH SLOT WANTS is in the table: the ratio it is cropped to and the
 * width it is served at on the largest screen. Send the longest edge at about
 * twice that and let next/image do the rest — it serves AVIF and WebP at the
 * size the device asks for, so an oversized original costs the visitor nothing.
 *
 * `alt` is written here rather than passed in, because alt text describing a
 * photograph nobody has taken yet would have to be rewritten with the picture,
 * and this is the one file that has to be opened anyway.
 */

type Slot = {
  /** The drawing shown until a photograph is filed. */
  scene: SceneName;
  /** `/photos/<file>` once one exists. Undefined means the drawing stands. */
  photo?: string;
  /** What the picture shows, for a reader who cannot see it. */
  alt: string;
  /** The shape it is cropped to. */
  ratio: "4/5" | "3/2" | "16/9" | "1/1" | "5/4";
  /** Roughly the widest it is ever painted, in CSS pixels. */
  servedWidth: number;
  /** What the sizes attribute should say, once it is a real file. */
  sizes: string;
};

export const PHOTO_SLOTS = {
  /* Home — the editorial grid. One tall picture beside two stacked. */
  "crane-lift": {
    scene: "crane",
    alt: "A gantry crane lifting a container onto a waiting trailer at the quayside.",
    ratio: "4/5",
    servedWidth: 620,
    sizes: "(max-width: 1023px) 100vw, 40vw",
  },
  "dar-port": {
    scene: "port",
    alt: "Stacked containers and gantry cranes at the container terminal in Dar es Salaam at dusk.",
    ratio: "16/9",
    servedWidth: 780,
    sizes: "(max-width: 1023px) 100vw, 52vw",
  },
  "dar-delivery": {
    scene: "road",
    alt: "A loaded container truck on the road out of the port in Dar es Salaam at first light.",
    ratio: "16/9",
    servedWidth: 780,
    sizes: "(max-width: 1023px) 100vw, 52vw",
  },

  /* Services and About — the receiving floor. */
  "guangzhou-warehouse": {
    scene: "warehouse",
    alt: "Racked cartons and a forklift in the Swift Cargo receiving warehouse in Guangzhou.",
    ratio: "3/2",
    servedWidth: 720,
    sizes: "(max-width: 767px) 100vw, 50vw",
  },

  /* The three service tiles, read as one row of pictures. */
  "service-lcl": {
    scene: "warehouse",
    alt: "Loose cartons on a pallet waiting to be consolidated into a shared container.",
    ratio: "4/5",
    servedWidth: 420,
    sizes: "(max-width: 639px) 100vw, (max-width: 1023px) 50vw, 33vw",
  },
  "service-fcl": {
    scene: "crane",
    alt: "A full container under a crane, about to be loaded.",
    ratio: "4/5",
    servedWidth: 420,
    sizes: "(max-width: 639px) 100vw, (max-width: 1023px) 50vw, 33vw",
  },
  "service-sourcing": {
    scene: "port",
    alt: "The container terminal in Guangzhou, where sourced goods are consolidated and shipped.",
    ratio: "4/5",
    servedWidth: 420,
    sizes: "(max-width: 639px) 100vw, (max-width: 1023px) 50vw, 33vw",
  },

  /* The small badges floated over the hero. */
  "badge-counting": {
    scene: "warehouse",
    alt: "A clerk counting and measuring cartons at the receiving counter.",
    ratio: "1/1",
    servedWidth: 160,
    sizes: "160px",
  },
  "badge-quay": {
    scene: "port",
    alt: "Containers stacked on the quay.",
    ratio: "1/1",
    servedWidth: 160,
    sizes: "160px",
  },
} as const satisfies Record<string, Slot>;

export type PhotoSlotName = keyof typeof PHOTO_SLOTS;

const RATIO: Record<Slot["ratio"], string> = {
  "4/5": "aspect-[4/5]",
  "3/2": "aspect-[3/2]",
  "16/9": "aspect-[16/9]",
  "1/1": "aspect-square",
  "5/4": "aspect-[5/4]",
};

export function PhotoSlot({
  name,
  className,
  /** Above the fold: the hero's own picture, and nothing else. */
  priority,
  /** Laid over: a scrim so white type keeps its contrast on any photograph. */
  scrim,
  /**
   * Fill the height of the row instead of keeping the ratio, from this width up.
   *
   * It has to drop the ratio to do it. A box with a definite height AND an
   * aspect-ratio takes its WIDTH from that height, which is how this slot once
   * grew to 1332 pixels inside a 1024 pixel page — so the two are set together,
   * here, rather than left to a caller to remember.
   */
  fillRow,
  children,
}: {
  name: PhotoSlotName;
  className?: string;
  priority?: boolean;
  scrim?: boolean;
  fillRow?: "md" | "lg";
  children?: React.ReactNode;
}) {
  const slot: Slot = PHOTO_SLOTS[name];
  const Scene = SCENES[slot.scene];

  return (
    <div
      className={cn(
        "relative isolate overflow-hidden rounded-3xl bg-ink",
        RATIO[slot.ratio],
        fillRow === "md" && "md:aspect-auto md:h-full",
        fillRow === "lg" && "lg:aspect-auto lg:h-full",
        className
      )}
    >
      {slot.photo ? (
        <Image
          src={slot.photo}
          alt={slot.alt}
          fill
          sizes={slot.sizes}
          priority={priority}
          loading={priority ? undefined : "lazy"}
          className="object-cover"
        />
      ) : (
        /* The drawing is decoration, not information: the slot's alt text
           belongs to the photograph that will replace it, and a scene announced
           to a screen reader would be describing a picture that is not there. */
        <Scene />
      )}

      {scrim ? (
        <div
          aria-hidden
          className="absolute inset-0"
          /* Literal, not the ink token at an opacity: the theme colours carry
             no <alpha-value>, so `from-ink/85` would paint solid ink and bury
             the picture. The scene under it is fixed-colour anyway. */
          style={{
            background:
              "linear-gradient(to top, rgba(2,10,20,0.88) 0%, rgba(2,10,20,0.62) 26%, rgba(2,10,20,0.12) 58%, rgba(2,10,20,0.45) 100%)",
          }}
        />
      ) : null}

      {children}
    </div>
  );
}

/**
 * A caption sitting on the picture, bottom left.
 *
 * Used where a picture would otherwise be decoration: a line of type on it
 * makes it a statement about the operation instead.
 */
export function PhotoCaption({
  label,
  children,
}: {
  label?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="absolute inset-x-0 bottom-0 z-10 p-5 sm:p-7">
      {label ? (
        <p className="eyebrow text-cyan-300">{label}</p>
      ) : null}
      <p className="mt-1.5 max-w-sm text-lg font-semibold leading-tight text-white sm:text-xl">
        {children}
      </p>
    </div>
  );
}
