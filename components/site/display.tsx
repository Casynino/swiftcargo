import { cn } from "@/lib/utils";

/**
 * THE TWO-TONE HEADING, FOR THE PUBLIC SITE'S SECTION TITLES.
 *
 * One phrase in the reading colour and the rest dropped back to the muted one,
 * on the same line. The eye takes the first words and then reads the whole
 * thing, which is how a section title can be both a label and a sentence — and
 * it gives a long page of headings a rhythm without making any of them bigger.
 *
 * It is a treatment, not a layout. It goes where a heading already stands, at
 * the size and weight that heading already had; the pages keep their own
 * structure, their own sections and their own type scale.
 *
 * English is the dictionary key (see lib/i18n), so both halves are passed as
 * ordinary sentence-case phrases and the split is a matter of where the caller
 * puts the comma.
 */
export function DisplayHeading({
  as: Tag = "h2",
  lead,
  trail,
  className,
  id,
}: {
  as?: "h1" | "h2" | "h3" | "p";
  /** The phrase that keeps the reading colour. */
  lead: React.ReactNode;
  /** The phrase that falls back. */
  trail?: React.ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <Tag id={id} className={className}>
      {lead}
      {trail ? (
        <>
          {" "}
          {/*
            The second tone: the theme's own muted colour, which is already
            tuned against the reading colour in both themes.

            Not the foreground at an opacity. Tailwind only emits the steps in
            its opacity scale, and a value outside it — `text-foreground/38` —
            produces no rule at all, so the two phrases come out identical and
            the treatment silently does nothing. The same slip is why the icon
            tiles on this site were written `bg-brand/8` and drawn with no tile.
          */}
          <span className="text-muted-foreground">{trail}</span>
        </>
      ) : null}
    </Tag>
  );
}

/**
 * The same treatment on the dark hero panels, where the muted token is far too
 * dark to read. White at 45% is the second tone there.
 */
export function DisplayHeadingDark({
  as: Tag = "h2",
  lead,
  trail,
  className,
}: {
  as?: "h1" | "h2" | "h3" | "p";
  lead: React.ReactNode;
  trail?: React.ReactNode;
  className?: string;
}) {
  return (
    <Tag className={cn("text-white", className)}>
      {lead}
      {trail ? (
        <>
          {" "}
          <span className="text-white/45">{trail}</span>
        </>
      ) : null}
    </Tag>
  );
}
