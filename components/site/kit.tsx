import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { PHOTOS, type PhotoName } from "@/components/site/photos";
import { Reveal, RevealFrame, ScrollVar, SplitHeading } from "@/components/site/motion";
import { cn } from "@/lib/utils";

/**
 * THE PUBLIC SITE'S PARTS.
 *
 * Every public page is built from the same few pieces: a full-bleed photograph
 * hero, a mono label over each heading, a big expanded headline in capitals, a
 * picture frame that opens as it arrives, a ticker of giant words and a closing
 * band. A page that reaches for its own version of any of these is a page that
 * stops looking like the rest.
 */

/**
 * The label over a headline: a small orange square, an optional number and the
 * words in mono capitals.
 */
export function Eyebrow({
  children,
  index,
  className,
}: {
  children: React.ReactNode;
  index?: string;
  dark?: boolean;
  className?: string;
}) {
  return (
    <p className={cn("sc-label flex items-center gap-3 text-white/60", className)}>
      {index ? <span className="tnum text-signal">{index}</span> : null}
      <span>{children}</span>
    </p>
  );
}

/**
 * A headline in two tones, in expanded capitals: the words that carry it in
 * white, the rest dimmed. Words rise into place one after another.
 */
export function Headline({
  as: Tag = "h2",
  lead,
  trail,
  className,
}: {
  as?: "h1" | "h2" | "h3";
  lead: React.ReactNode;
  trail?: React.ReactNode;
  dark?: boolean;
  className?: string;
}) {
  const cls = cn("sc-title text-white", className);
  if (typeof lead === "string" && (trail === undefined || typeof trail === "string")) {
    return (
      <SplitHeading
        as={Tag}
        lead={lead}
        trail={trail}
        className={cls}
        trailClassName="text-white/35"
        immediate={Tag === "h1"}
      />
    );
  }
  return (
    <Tag className={cls}>
      {lead}
      {trail ? (
        <>
          {" "}
          <span className="text-white/35">{trail}</span>
        </>
      ) : null}
    </Tag>
  );
}

/** The size every section headline is set at. Leading after size: a size class cancels a leading written before it. */
export const sectionTitle = "text-[1.65rem] sm:text-[2.6rem] lg:text-[3.4rem] leading-[1.02]";

/** Label, headline and a line of text, the way every section opens. */
export function SectionHead({
  eyebrow,
  index,
  lead,
  trail,
  body,
  center,
  className,
  children,
}: {
  eyebrow?: React.ReactNode;
  index?: string;
  lead: React.ReactNode;
  trail?: React.ReactNode;
  body?: React.ReactNode;
  dark?: boolean;
  center?: boolean;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className={cn(center && "mx-auto text-center", "max-w-4xl", className)}>
      {eyebrow ? (
        <Eyebrow index={index} className={cn("mb-6", center && "justify-center")}>
          {eyebrow}
        </Eyebrow>
      ) : null}
      <Headline lead={lead} trail={trail} className={sectionTitle} />
      {body ? (
        <Reveal>
          <p className={cn("mt-6 max-w-xl text-[15px] leading-relaxed text-white/60 sm:text-lg", center && "mx-auto")}>
            {body}
          </p>
        </Reveal>
      ) : null}
      {children}
    </div>
  );
}

/** A photograph that fills its box, opening from the bottom as it arrives, with a slow zoom on hover. */
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
    <RevealFrame className={cn("group relative isolate overflow-hidden bg-ink", className)}>
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
    </RevealFrame>
  );
}

/**
 * THE TOP OF EVERY PUBLIC PAGE.
 *
 * A photograph under the header, sliding away slower than the page as it is
 * scrolled; the page's title huge at the foot, rising word by word; a mono
 * label above it. The header is fixed and transparent here, so the hero runs
 * underneath it rather than starting below it.
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
    <ScrollVar as="section" mode="leave" className="relative isolate overflow-hidden text-white">
      <div aria-hidden className="sc-fade-b absolute inset-0 -z-10 overflow-hidden">
        <div className="sc-hero-photo absolute inset-0">
          <Image src={picture.src} alt="" fill priority placeholder="blur" sizes="100vw" className="object-cover" />
        </div>
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(3,10,19,0.75)_0%,rgba(3,10,19,0.25)_22%,rgba(3,10,19,0.35)_45%,rgba(3,10,19,0.92)_80%,hsl(var(--background))_100%)]" />
      </div>

      <div
        className={cn(
          "container relative grid items-end gap-10",
          "pt-28 sm:pt-36",
          overlap ? "pb-36" : "pb-12 sm:pb-20",
          size === "home" ? "min-h-[100svh]" : "min-h-[30rem] sm:min-h-[36rem] lg:min-h-[42rem]",
          aside && "lg:grid-cols-[1.25fr_0.75fr]"
        )}
      >
        <div className="sc-hero-fade min-w-0">
          {eyebrow ? <Eyebrow className="mb-6 text-white [text-shadow:0_1px_12px_rgba(0,0,0,0.6)]">{eyebrow}</Eyebrow> : null}
          <Headline
            as="h1"
            lead={lead}
            trail={trail}
            className={
              size === "home"
                ? "text-[2.6rem] leading-[0.92] sm:text-7xl lg:text-8xl"
                : "text-[2.2rem] leading-[0.94] sm:text-6xl lg:text-[5.2rem]"
            }
          />
          {body ? (
            <div className="animate-in-up mt-6 max-w-xl text-[15px] leading-relaxed text-white/70 [animation-delay:250ms] sm:text-lg">
              {body}
            </div>
          ) : null}
          {actions ? (
            <div className="animate-in-up mt-8 flex flex-wrap items-center gap-3 [animation-delay:350ms]">{actions}</div>
          ) : null}
        </div>
        {aside ? <div className="animate-in-up [animation-delay:200ms] lg:self-end">{aside}</div> : null}
      </div>
      {children}
    </ScrollVar>
  );
}

/** A link styled as the site's button: a plain rectangle (or, for "line", words and an arrow). */
export function Btn({
  href,
  children,
  tone = "orange",
  icon: Icon = ArrowRight,
  className,
}: {
  href: string;
  children: React.ReactNode;
  tone?: "orange" | "white" | "line";
  icon?: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  className?: string;
}) {
  return (
    <Link href={href} className={cn("sc-btn focus-ring", `sc-btn--${tone}`, className)}>
      {children}
      <Icon aria-hidden />
    </Link>
  );
}

/** The closing band: a full-bleed photograph, one huge sentence and the two things to do next. */
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
    <ScrollVar as="section" mode="through" className="relative isolate overflow-hidden text-white">
      <div aria-hidden className="sc-fade-y absolute inset-0 -z-10 overflow-hidden">
        <div className="sc-band-photo absolute inset-x-0 -inset-y-[12%]">
          <Image src={picture.src} alt="" fill placeholder="blur" sizes="100vw" className="object-cover" />
        </div>
        <div className="absolute inset-0 bg-[linear-gradient(180deg,hsl(var(--background))_0%,rgba(3,10,19,0.55)_30%,rgba(3,10,19,0.6)_70%,hsl(var(--background))_100%)]" />
      </div>
      <div className="container py-28 sm:py-40">
        <Headline lead={lead} trail={trail} className="max-w-5xl text-[2.3rem] leading-[0.94] sm:text-7xl lg:text-[6rem]" />
        <Reveal>
          {body ? <p className="mt-7 max-w-xl text-[15px] text-white/70 sm:text-lg">{body}</p> : null}
          <div className="mt-9 flex flex-wrap gap-3">{actions}</div>
        </Reveal>
      </div>
    </ScrollVar>
  );
}

/** A dark panel for a hero's right-hand side. */
export function GlassCard({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-2xl border border-white/10 bg-[rgba(4,12,22,0.72)] p-6 backdrop-blur-md sm:p-7", className)}>
      {children}
    </div>
  );
}

/**
 * The buttons as class names, for a link whose children are its own (text and an
 * icon side by side). New sections use <Btn>.
 */
export const heroButton = {
  primary: "sc-btn sc-btn--orange sc-btn--plain focus-ring [&>svg]:size-4",
  ghost: "sc-btn sc-btn--line sc-btn--plain focus-ring [&>svg]:size-4",
  solid: "sc-btn sc-btn--white sc-btn--plain focus-ring [&>svg]:size-4",
  outline: "sc-btn sc-btn--line sc-btn--plain focus-ring [&>svg]:size-4",
};

/**
 * A ticker of giant words running sideways, solid and hollow in turn, with an
 * orange mark between them. Doubled so the loop has no seam; the second copy is
 * hidden from screen readers.
 */
export function Ticker({ words, reverse, className }: { words: string[]; reverse?: boolean; className?: string }) {
  const row = (hidden?: boolean) => (
    <ul aria-hidden={hidden} className="flex shrink-0 items-center">
      {words.map((w, i) => (
        <li key={i} className="flex shrink-0 items-center">
          <span className={cn("sc-title px-6 text-[2.6rem] sm:px-10 sm:text-7xl lg:text-8xl", i % 2 ? "sc-stroke" : "text-white")}>
            {w}
          </span>
          <span aria-hidden className="sc-title text-[2.6rem] text-signal sm:text-7xl lg:text-8xl">/</span>
        </li>
      ))}
    </ul>
  );
  return (
    <div className={cn("overflow-hidden py-8 sm:py-12", className)}>
      <div className={cn("sc-ticker", reverse && "sc-ticker--rev")}>
        {row()}
        {row(true)}
      </div>
    </div>
  );
}

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
    <ul aria-hidden={hidden} className="flex shrink-0 gap-4 pr-4">
      {items.map((item, i) => (
        <li key={i} className="group relative h-64 w-60 shrink-0 overflow-hidden rounded-2xl bg-ink sm:h-96 sm:w-80">
          <Image
            src={PHOTOS[item.photo].src}
            alt={hidden ? "" : PHOTOS[item.photo].alt}
            fill
            placeholder="blur"
            sizes="20rem"
            className="site-zoom object-cover"
          />
          <span className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
          <span className="sc-title absolute bottom-4 left-4 text-lg text-white">{item.caption}</span>
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
