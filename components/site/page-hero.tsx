import { SCENES, type SceneName } from "@/components/site/scenes";
import { DisplayHeading, Eyebrow } from "@/components/site/display";
import { cn } from "@/lib/utils";

/**
 * THE TOP OF EVERY PUBLIC PAGE THAT IS NOT THE HOME PAGE OR /track.
 *
 * Those two open on the sea, which is the company's own picture and costs a
 * whole screen. Everything else gets this: a band of ink, the heading in the
 * site's two tones, the sentence that says what the page is for, and — where
 * the page has a subject worth showing — one of the drawings bleeding in from
 * the right and dissolving into the ink before it reaches the words.
 *
 * The artwork is masked rather than merely dimmed. A picture at 20% opacity
 * behind a paragraph is a picture you cannot see and type you cannot read; a
 * picture that stops is neither.
 */
export function PageHero({
  eyebrow,
  eyebrowIcon,
  lead,
  trail,
  body,
  scene,
  children,
}: {
  eyebrow?: React.ReactNode;
  eyebrowIcon?: React.ComponentType<{ className?: string }>;
  lead: React.ReactNode;
  trail?: React.ReactNode;
  body?: React.ReactNode;
  /** Omit on a page whose subject is a form or a table: those have no picture. */
  scene?: SceneName;
  /** Actions, a search box — whatever the page opens with. */
  children?: React.ReactNode;
}) {
  const Scene = scene ? SCENES[scene] : null;

  return (
    <section className="relative isolate overflow-hidden border-b bg-ink text-white">
      {Scene ? (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-0 hidden w-[58%] lg:block"
          style={{
            /* Two masks, one per axis: the picture fades out towards the words
               and softens at the top and bottom edges of the band, so it never
               ends on a hard line. */
            maskImage:
              "linear-gradient(to left, #000 0%, #000 26%, rgba(0,0,0,0.35) 66%, transparent 100%), linear-gradient(to bottom, transparent 0%, #000 20%, #000 76%, transparent 100%)",
            WebkitMaskImage:
              "linear-gradient(to left, #000 0%, #000 26%, rgba(0,0,0,0.35) 66%, transparent 100%), linear-gradient(to bottom, transparent 0%, #000 20%, #000 76%, transparent 100%)",
            maskComposite: "intersect",
            WebkitMaskComposite: "source-in",
          }}
        >
          <div className="relative h-full w-full">
            <Scene />
          </div>
        </div>
      ) : (
        /* No picture: the band still needs a light source, or a page of ink
           behind white type reads as a missing image. */
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(70% 120% at 88% 8%, rgba(42,163,207,0.16), transparent 62%)," +
              "radial-gradient(60% 110% at 6% 100%, rgba(14,76,135,0.24), transparent 64%)",
          }}
        />
      )}

      <div
        aria-hidden
        className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-cyan-400/40 to-transparent"
      />

      {/* The top padding carries the fixed header — see site-header. */}
      <div className="container relative pb-14 pt-24 sm:pb-20 sm:pt-28 lg:pb-24 lg:pt-32">
        <div className={cn("max-w-2xl", Scene && "lg:max-w-xl")}>
          {eyebrow ? (
            <Eyebrow tone="dark" icon={eyebrowIcon} className="mb-6">
              {eyebrow}
            </Eyebrow>
          ) : null}

          <DisplayHeading as="h1" size="page" tone="dark" lead={lead} trail={trail} />

          {body ? (
            <p className="mt-6 max-w-xl text-base leading-relaxed text-white/70 sm:text-lg">
              {body}
            </p>
          ) : null}

          {children ? <div className="mt-8">{children}</div> : null}
        </div>
      </div>
    </section>
  );
}
