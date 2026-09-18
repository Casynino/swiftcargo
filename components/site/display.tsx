import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * THE PUBLIC SITE'S HEADLINE VOICE.
 *
 * One treatment, used on every page: large capitals, tight, set in two tones on
 * the same line — the first phrase in the reading colour, the rest dropped back
 * to a muted grey. The eye takes the dark words first and then reads the whole
 * thing, which is how a heading can be both a slogan and a sentence.
 *
 * The phrases are passed in sentence case and capitalised by CSS. English is
 * the dictionary key (see lib/i18n), and "BEYOND BORDERS" is not a key anybody
 * would write again in Swahili — so the key stays "Beyond borders" and the
 * shouting is done by the stylesheet.
 */

const SIZES = {
  /* The top of a page. Deliberately larger than anything under it: on a phone
     it is still the biggest thing on the screen, which is what makes a hero a
     hero rather than a paragraph with a picture. */
  hero: "text-[2.35rem] leading-[0.94] sm:text-6xl lg:text-7xl xl:text-[5rem]",
  /* The top of an inner page — a heading, not a poster. */
  page: "text-[2rem] leading-[0.96] sm:text-5xl lg:text-6xl",
  /* A section inside a page. */
  section: "text-[1.75rem] leading-[0.98] sm:text-4xl lg:text-[2.75rem]",
  /* A block inside a section. */
  sub: "text-xl leading-[1.05] sm:text-2xl lg:text-[1.75rem]",
} as const;

export function DisplayHeading({
  as: Tag = "h2",
  lead,
  trail,
  size = "section",
  tone = "light",
  className,
  id,
}: {
  as?: "h1" | "h2" | "h3" | "p";
  /** The phrase that carries the colour. */
  lead: React.ReactNode;
  /** The phrase that falls back. Optional — some headings are one tone. */
  trail?: React.ReactNode;
  size?: keyof typeof SIZES;
  /** Which field it is set on: a pale page, or one of the dark panels. */
  tone?: "light" | "dark";
  className?: string;
  id?: string;
}) {
  return (
    <Tag
      id={id}
      className={cn(
        "font-semibold uppercase tracking-[-0.022em]",
        SIZES[size],
        tone === "dark" ? "text-white" : "text-foreground",
        className
      )}
    >
      {lead}
      {trail ? (
        <>
          {" "}
          {/* The second tone. On the dark panels it is the reading colour at
              45%; on the pale field it is the muted token rather than the
              foreground at an opacity, because the theme colours are declared
              without <alpha-value> and an opacity modifier on one of them is
              silently dropped. */}
          <span className={tone === "dark" ? "text-white/45" : "text-muted-foreground"}>
            {trail}
          </span>
        </>
      ) : null}
    </Tag>
  );
}

/**
 * The small capitalised label above a heading, set as a pill.
 *
 * On the dark panels it is a glass chip; on the pale field it is a hairline
 * outline. Either way it is the same object, so a reader moving down the page
 * keeps recognising where a section starts.
 */
export function Eyebrow({
  children,
  tone = "light",
  icon: Icon,
  className,
}: {
  children: React.ReactNode;
  tone?: "light" | "dark";
  icon?: React.ComponentType<{ className?: string }>;
  className?: string;
}) {
  return (
    <p
      className={cn(
        "eyebrow inline-flex items-center gap-2 rounded-full px-3 py-1.5",
        tone === "dark"
          ? "border border-white/20 bg-white/10 text-cyan-300 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.14)] backdrop-blur-md"
          : "border border-field-edge bg-card text-brand",
        className
      )}
    >
      {Icon ? <Icon className="size-3.5" /> : null}
      {children}
    </p>
  );
}

/**
 * The pill with the circle on the end.
 *
 * The reference's primary action: a bar carrying the words, and a round button
 * riding in it. It is one link, not two — the circle is decoration that happens
 * to look pressable, and a tap anywhere on the pill goes to the same place.
 * Height is 44 at the smallest so a thumb can hit it.
 */
export function PillLink({
  href,
  children,
  tone = "dark",
  external,
  className,
}: {
  href: string;
  children: React.ReactNode;
  /** dark: an ink pill. accent: the orange one. light: outlined on a pale field. */
  tone?: "dark" | "accent" | "light" | "glass";
  external?: boolean;
  className?: string;
}) {
  /* The hovers name a second colour rather than dimming the first. The theme
     colours are declared without <alpha-value>, so `hover:bg-ink/90` compiles
     to plain ink and the pill does not react to a cursor at all. */
  const shells = {
    dark: "bg-ink text-white hover:bg-navy-900",
    accent: "bg-signal text-signal-foreground hover:bg-sun-600",
    light: "border border-field-edge bg-card text-foreground hover:bg-secondary",
    glass:
      "border border-white/20 bg-white/10 text-white backdrop-blur-md hover:bg-white/20",
  } as const;

  const discs = {
    dark: "bg-white text-ink",
    accent: "bg-white text-signal",
    light: "bg-ink text-white",
    glass: "bg-white text-ink",
  } as const;

  const body = (
    <>
      <span className="pl-1">{children}</span>
      <span
        aria-hidden
        className={cn(
          "grid size-8 shrink-0 place-items-center rounded-full transition-transform group-hover:rotate-45 motion-reduce:group-hover:rotate-0",
          discs[tone]
        )}
      >
        <ArrowUpRight className="size-4" />
      </span>
    </>
  );

  const shell = cn(
    "focus-ring group inline-flex min-h-11 items-center gap-3 rounded-full py-1.5 pl-4 pr-1.5 text-sm font-medium transition-colors",
    shells[tone],
    className
  );

  if (external) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={shell}>
        {body}
      </a>
    );
  }
  return (
    <Link href={href} className={shell}>
      {body}
    </Link>
  );
}

/**
 * The header of a light section: the heading on the left, and on the right the
 * sentence that explains it with the link out of it underneath.
 *
 * The right column is deliberately narrow and bottom-aligned. A paragraph set
 * the full width of a page is a page of prose; set against a heading it is a
 * caption, which is all any of these are.
 */
export function SectionHead({
  eyebrow,
  lead,
  trail,
  body,
  action,
  size = "section",
  tone = "light",
  className,
}: {
  eyebrow?: React.ReactNode;
  lead: React.ReactNode;
  trail?: React.ReactNode;
  body?: React.ReactNode;
  action?: { href: string; label: React.ReactNode };
  size?: keyof typeof SIZES;
  tone?: "light" | "dark";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between lg:gap-12",
        className
      )}
    >
      <div className="max-w-2xl">
        {eyebrow ? (
          <Eyebrow tone={tone} className="mb-5">
            {eyebrow}
          </Eyebrow>
        ) : null}
        <DisplayHeading lead={lead} trail={trail} size={size} tone={tone} />
      </div>

      {body || action ? (
        <div className="max-w-sm shrink-0 lg:pb-1.5">
          {body ? (
            <p
              className={cn(
                "text-sm leading-relaxed",
                tone === "dark" ? "text-white/65" : "text-muted-foreground"
              )}
            >
              {body}
            </p>
          ) : null}
          {action ? (
            <PillLink
              href={action.href}
              tone={tone === "dark" ? "glass" : "light"}
              className={body ? "mt-5" : undefined}
            >
              {action.label}
            </PillLink>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
