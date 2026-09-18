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
 * The words over a headline — plain text, no shape around it: a short rule and
 * the label in bold capitals, in the orange on paper and a lighter orange on
 * a photograph, so it reads first without looking like a button.
 */
export function Eyebrow({
  children,
  dark,
  className,
}: {
  children: React.ReactNode;
  dark?: boolean;
  className?: string;
}) {
  return (
    <p
      className={cn(
        "flex items-center gap-3 text-base font-bold uppercase tracking-[0.14em]",
        dark ? "text-orange-300" : "text-signal",
        className
      )}
    >
      <span aria-hidden className={cn("h-0.5 w-8 rounded-full", dark ? "bg-orange-300" : "bg-signal")} />
      {children}
    </p>
  );
}

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

/** Label, headline and a line of text, the way every section opens. */
export function SectionHead({
  eyebrow,
  lead,
  trail,
  body,
  dark,
  center,
  className,
  children,
}: {
  eyebrow?: React.ReactNode;
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
      {eyebrow ? <Eyebrow dark={dark} className={cn("mb-4", center && "justify-center")}>{eyebrow}</Eyebrow> : null}
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
  eyebrow,
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
  eyebrow?: React.ReactNode;
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
          {eyebrow ? <Eyebrow dark className="mb-5">{eyebrow}</Eyebrow> : null}
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

const RIBBON_ICONS = {
  Ship: "M2 21c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1 .6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1M19.38 20A11.6 11.6 0 0 0 21 14l-9-4-9 4c0 2.9.94 5.34 2.81 7.76M19 13V7a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v6M12 10v4M12 2v3",
  Package: "M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73zM12 22V12M3.3 7 12 12l8.7-5M7.5 4.27l9 5.15",
  Container: "M22 7.7c0-.6-.4-1.2-.8-1.5l-6.3-3.9a1.72 1.72 0 0 0-1.7 0l-10.3 6c-.5.2-.9.8-.9 1.4v6.6c0 .5.4 1.2.8 1.5l6.3 3.9a1.72 1.72 0 0 0 1.7 0l10.3-6c.5-.3.9-1 .9-1.5ZM10 21.9V14L2.1 9.1M10 14l11.9-6.9M14 19.8v-8.1M18 17.5V9.4",
  Search: "m21 21-4.34-4.34M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16",
  Truck: "M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2M15 18H9M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14M7 20a2 2 0 1 0 0-4 2 2 0 0 0 0 4M17 20a2 2 0 1 0 0-4 2 2 0 0 0 0 4",
  MapPin: "M20 10c0 4.99-5.54 10.19-7.4 11.8a1 1 0 0 1-1.2 0C9.54 20.19 4 14.99 4 10a8 8 0 0 1 16 0M12 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6",
  ScanLine: "M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M7 12h10",
} as const;

/**
 * THE RIBBON UNDER THE HERO.
 *
 * Two bands crossed at a slight angle, the front one in the brand gradient with
 * what the company does running along it, each with its own mark; the back one
 * faint and running the other way. It reads as movement without shouting, and
 * it sits comfortably at phone width, where the old strip of capitals did not.
 */
export function Ribbon({ items }: { items: [keyof typeof RIBBON_ICONS, string][] }) {
  const row = (hidden?: boolean) => (
    <ul aria-hidden={hidden} className="flex shrink-0 items-center gap-8 pr-8 sm:gap-12 sm:pr-12">
      {items.map(([icon, text], i) => (
        <li key={i} className="flex items-center gap-2.5 whitespace-nowrap text-sm font-semibold text-white sm:text-base">
          <span className="grid size-8 place-items-center rounded-full bg-white/15 ring-1 ring-white/25">
            <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d={RIBBON_ICONS[icon]} />
            </svg>
          </span>
          {text}
          <span aria-hidden className="ml-6 size-1.5 rounded-full bg-white/50 sm:ml-10" />
        </li>
      ))}
    </ul>
  );
  return (
    <div className="relative -mt-6 overflow-hidden py-6 sm:-mt-8">
      {/* The faint band behind, crossing the other way. */}
      <div aria-hidden className="absolute inset-x-[-5%] top-1/2 h-12 -translate-y-1/2 rotate-[2deg] bg-brand/25 blur-[1px]" />
      <div className="relative -mx-[5%] rotate-[-1.5deg] bg-gradient-to-r from-[#f4611f] via-[#e2562b] to-[#1b6fb3] py-3.5 shadow-[0_20px_40px_-20px_rgba(244,97,31,0.6)]">
        <div className="site-marquee flex w-max" style={{ animationDuration: "45s" }}>
          {row()}
          {row(true)}
        </div>
      </div>
    </div>
  );
}
