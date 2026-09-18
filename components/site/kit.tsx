import Image from "next/image";

import { PHOTOS, type PhotoName } from "@/components/site/photos";
import { Reveal } from "@/components/site/motion";
import { NetworkMap } from "@/components/site/network-map";
import { cn } from "@/lib/utils";

/**
 * THE PUBLIC SITE'S PARTS.
 *
 * Every public page is built from the same half-dozen pieces: a photograph hero
 * under the header, a pill over each heading, a two-tone headline, a picture
 * frame, a running strip and a closing band. A page that reaches for its own
 * version of any of these is a page that stops looking like the rest.
 */

/**
 * A headline in two tones: the words that carry it, then the rest set hollow
 * on a photograph or in the brand blue on paper.
 */
export function Headline({
  as: Tag = "h2",
  lead,
  trail,
  dark,
  className,
}: {
  as?: "h1" | "h2" | "h3";
  lead: React.ReactNode;
  trail?: React.ReactNode;
  dark?: boolean;
  className?: string;
}) {
  return (
    <Tag
      className={cn(
        "font-display font-bold tracking-[-0.03em]",
        dark ? "text-white" : "text-foreground",
        className
      )}
    >
      {lead}
      {trail ? (
        <>
          {" "}
          <span className={dark ? "site-outline" : "text-brand"}>{trail}</span>
        </>
      ) : null}
    </Tag>
  );
}

/** Headline and a line of text, the way every section opens. */
export function SectionHead({
  lead,
  trail,
  body,
  dark,
  center,
  className,
  children,
}: {
  lead: React.ReactNode;
  trail?: React.ReactNode;
  body?: React.ReactNode;
  dark?: boolean;
  center?: boolean;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <Reveal className={cn(center && "mx-auto text-center", "max-w-3xl", className)}>
      <Headline
        lead={lead}
        trail={trail}
        dark={dark}
        className="text-3xl leading-[1.08] sm:text-4xl lg:text-5xl"
      />
      {body ? (
        <p
          className={cn(
            "mt-5 text-base leading-relaxed sm:text-lg",
            center && "mx-auto",
            "max-w-2xl",
            dark ? "text-white/70" : "text-muted-foreground"
          )}
        >
          {body}
        </p>
      ) : null}
      {children}
    </Reveal>
  );
}

/** A photograph that fills its box, with the slow zoom on hover. */
export function PhotoFrame({
  name,
  className,
  sizes = "(max-width: 768px) 100vw, 50vw",
  priority,
  children,
  imageClassName,
}: {
  name: PhotoName;
  className?: string;
  sizes?: string;
  priority?: boolean;
  children?: React.ReactNode;
  imageClassName?: string;
}) {
  const photo = PHOTOS[name];
  return (
    <div className={cn("group relative isolate overflow-hidden bg-ink", className)}>
      <Image
        src={photo.src}
        alt={photo.alt}
        fill
        sizes={sizes}
        placeholder="blur"
        priority={priority}
        className={cn("site-zoom object-cover", imageClassName)}
      />
      {children}
    </div>
  );
}

/**
 * THE TOP OF EVERY PUBLIC PAGE.
 *
 * A photograph drifting under a dark wash, the header floating over it, and the
 * page's words set on the left where the wash is deepest. The top padding is
 * the header's height: the header is fixed and transparent here, so the hero
 * runs underneath it rather than starting below it.
 */
export function PageHero({
  photo,
  lead,
  trail,
  body,
  actions,
  aside,
  size = "page",
  overlap,
  children,
}: {
  /** Leave room at the foot for a panel that rides up over the hero. */
  overlap?: boolean;
  photo: PhotoName;
  lead: React.ReactNode;
  trail?: React.ReactNode;
  body?: React.ReactNode;
  actions?: React.ReactNode;
  /** A card set to the right on a wide screen, under the words on a phone. */
  aside?: React.ReactNode;
  size?: "home" | "page";
  /** Anything that runs along the foot of the hero. */
  children?: React.ReactNode;
}) {
  const picture = PHOTOS[photo];
  return (
    <section className="relative isolate overflow-hidden bg-ink text-white">
      <div aria-hidden className="absolute inset-0 -z-10">
        <Image
          src={picture.src}
          alt=""
          fill
          priority
          placeholder="blur"
          sizes="100vw"
          className="site-drift object-cover"
        />
        <div className="absolute inset-0 bg-[linear-gradient(100deg,rgba(4,14,26,0.92)_0%,rgba(4,14,26,0.72)_42%,rgba(4,14,26,0.6)_100%)]" />
        <div className="absolute inset-0 bg-[#062a4a]/45 mix-blend-multiply" />
        <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-ink to-transparent" />
        {/* The live network, laid on the water: tilted back like a chart on a
            table, and faded out under the words so they keep a clean ground. */}
        <div
          className="absolute inset-0 [mask-image:linear-gradient(to_right,rgba(0,0,0,0.35)_0%,#000_55%)] lg:[mask-image:linear-gradient(to_right,transparent_0%,rgba(0,0,0,0.5)_35%,#000_60%)]"
          style={{ perspective: "1400px" }}
        >
          <div className="absolute inset-0 origin-bottom opacity-60 [transform:rotateX(18deg)_scale(1.06)] lg:opacity-100">
            <NetworkMap focus={0.64} intensity={size === "home" ? 1 : 0.85} />
          </div>
        </div>
      </div>

      <div
        className={cn(
          "container relative grid items-center gap-12 pt-32 sm:pt-36",
          overlap ? "pb-36" : "pb-16",
          size === "home"
            ? "min-h-[100svh] lg:grid-cols-[1.15fr_0.85fr] lg:pb-28"
            : "min-h-[34rem] lg:min-h-[38rem]",
          aside && size !== "home" && "lg:grid-cols-[1.2fr_0.8fr]"
        )}
      >
        <div className="animate-in-up max-w-3xl">
          <Headline
            as="h1"
            dark
            lead={lead}
            trail={trail}
            className={cn(
              "leading-[1.02]",
              size === "home"
                ? "text-[2.75rem] sm:text-6xl lg:text-7xl xl:text-[5.4rem]"
                : "text-4xl sm:text-5xl lg:text-6xl"
            )}
          />
          {body ? (
            <div className="mt-6 max-w-xl text-base leading-relaxed text-white/75 sm:text-lg">
              {body}
            </div>
          ) : null}
          {actions ? <div className="mt-9 flex flex-wrap gap-3">{actions}</div> : null}
        </div>
        {aside ? (
          <div className="animate-in-up [animation-delay:160ms] lg:self-start lg:pt-6">{aside}</div>
        ) : null}
      </div>
      {children}
    </section>
  );
}

/** The strip of words that runs under a hero. Doubled so the loop is seamless. */
export function Marquee({ items, className }: { items: string[]; className?: string }) {
  const row = (hidden?: boolean) => (
    <ul aria-hidden={hidden} className="flex shrink-0 items-center gap-10 pr-10">
      {items.map((item, i) => (
        <li key={i} className="flex items-center gap-10 whitespace-nowrap">
          <span className="font-display text-2xl font-bold uppercase tracking-tight sm:text-3xl">
            {item}
          </span>
          <span aria-hidden className="size-2.5 rotate-45 bg-signal" />
        </li>
      ))}
    </ul>
  );
  return (
    <div className={cn("overflow-hidden border-y py-5", className)}>
      <div className="site-marquee flex w-max">
        {row()}
        {row(true)}
      </div>
    </div>
  );
}

/** The closing band: a photograph, one sentence and the two things to do next. */
export function CtaBand({
  photo = "portSunset",
  lead,
  trail,
  body,
  actions,
}: {
  photo?: PhotoName;
  lead: React.ReactNode;
  trail?: React.ReactNode;
  body?: React.ReactNode;
  actions: React.ReactNode;
}) {
  const picture = PHOTOS[photo];
  return (
    <section className="container py-20 sm:py-24">
      <Reveal className="relative isolate overflow-hidden rounded-[2rem] bg-ink px-6 py-16 text-white sm:px-14 sm:py-20">
        <Image
          src={picture.src}
          alt=""
          fill
          placeholder="blur"
          sizes="(max-width: 1400px) 100vw, 1400px"
          className="site-drift -z-10 object-cover"
        />
        <div
          aria-hidden
          className="absolute inset-0 -z-10 bg-[linear-gradient(90deg,rgba(4,14,26,0.94)_0%,rgba(4,14,26,0.7)_55%,rgba(4,14,26,0.35)_100%)]"
        />
        <div className="max-w-2xl">
          <Headline
            dark
            lead={lead}
            trail={trail}
            className="text-3xl leading-[1.06] sm:text-5xl"
          />
          {body ? <p className="mt-5 text-lg text-white/75">{body}</p> : null}
          <div className="mt-9 flex flex-wrap gap-3">{actions}</div>
        </div>
      </Reveal>
    </section>
  );
}

/** A glass card for a hero's right-hand side. */
export function GlassCard({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={cn("site-glass rounded-3xl p-6 sm:p-7", className)}>{children}</div>;
}

/** The three hero buttons, so every page's calls to action are the same shape. */
export const heroButton = {
  primary:
    "track-go inline-flex h-12 items-center gap-2 rounded-full px-6 text-sm font-semibold text-white",
  ghost:
    "inline-flex h-12 items-center gap-2 rounded-full border border-white/30 bg-white/10 px-6 text-sm font-semibold text-white backdrop-blur-md transition-colors hover:bg-white/20",
  solid:
    "inline-flex h-12 items-center gap-2 rounded-full bg-brand px-6 text-sm font-semibold text-brand-foreground transition-colors hover:bg-brand/90",
  outline:
    "inline-flex h-12 items-center gap-2 rounded-full border px-6 text-sm font-semibold transition-colors hover:bg-secondary",
};

/**
 * A strip of photographs that runs sideways on its own, captioned. Doubled so
 * the loop has no seam; the second copy is hidden from screen readers.
 */
export function PhotoMarquee({
  items,
  className,
  reverse,
}: {
  items: { photo: PhotoName; caption: string }[];
  className?: string;
  reverse?: boolean;
}) {
  const row = (hidden?: boolean) => (
    <ul aria-hidden={hidden} className="flex shrink-0 gap-5 pr-5">
      {items.map((item, i) => (
        <li key={i} className="group relative h-64 w-72 shrink-0 overflow-hidden rounded-[1.6rem] bg-ink sm:h-80 sm:w-96">
          <Image
            src={PHOTOS[item.photo].src}
            alt={hidden ? "" : PHOTOS[item.photo].alt}
            fill
            placeholder="blur"
            sizes="24rem"
            className="site-zoom object-cover"
          />
          <span className="absolute inset-0 bg-gradient-to-t from-ink/85 via-transparent to-transparent" />
          <span className="absolute bottom-4 left-5 font-display text-lg font-bold text-white">
            {item.caption}
          </span>
        </li>
      ))}
    </ul>
  );
  return (
    <div className={cn("overflow-hidden", className)}>
      <div
        className="site-marquee flex w-max hover:[animation-play-state:paused]"
        style={{ animationDuration: "60s", animationDirection: reverse ? "reverse" : undefined }}
      >
        {row()}
        {row(true)}
      </div>
    </div>
  );
}
