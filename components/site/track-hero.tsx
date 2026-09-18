import Link from "next/link";

import { SeaScene } from "@/components/site/sea-scene";
import { TrackForm } from "@/components/site/track-form";
import { ROUTE } from "@/lib/constants";
import { DEFAULT_LOCALE, t } from "@/lib/i18n";

/**
 * THE TOP OF TRACKING, ON BOTH PAGES.
 *
 * The search sits inside the hero rather than under it. This is the screen
 * customers arrive on from a WhatsApp message with a reference already in their
 * hand — the field they came to use should be the first thing on it, not below
 * a banner.
 *
 * And it stays there after they press Track. A result page that opens straight
 * into a wall of figures loses both the business the customer came to and the
 * box they need to look up the next consignment; this way the two pages are one
 * page, with the answer added underneath.
 */

/**
 * The reference examples, set as objects rather than as bold words.
 *
 * A customer comparing what is printed on their box against what is on the
 * screen is matching a shape, character by character. A chip in a monospaced
 * face is that shape; the same characters bolded inside a sentence are only an
 * emphasis.
 */
function Ref({ children }: { children: React.ReactNode }) {
  return (
    <code className="tnum mx-0.5 whitespace-nowrap rounded-md border border-white/20 bg-white/10 px-1.5 py-0.5 font-mono text-[0.88em] font-medium text-white">
      {children}
    </code>
  );
}

export function TrackHero({
  /** Already searched: the box shows it back rather than emptying itself. */
  reference,
}: {
  reference?: string;
}) {
  const locale = DEFAULT_LOCALE;

  return (
    <section className="relative isolate overflow-hidden bg-ink text-white">
      <SeaScene />

      {/* The bottom padding is the water's band — see SeaScene, which measures
          the horizon from the same numbers. It is padding rather than a sibling
          element so the scene can still bleed to the edges of the hero, and it
          is reserved before paint so nothing on the page ever moves. */}
      <div className="container relative flex min-h-[calc(72vw+26rem)] flex-col justify-start pb-[calc(72vw+1rem)] pt-28 sm:min-h-[calc(42vw+26rem)] sm:pb-[calc(42vw+1.5rem)] sm:pt-32 lg:min-h-[40rem] lg:justify-center lg:py-32 xl:min-h-[44rem] 2xl:min-h-[48rem]">
        <div className="animate-in-up max-w-xl lg:max-w-[30rem]">

          <p className="mb-5 flex items-center gap-3 text-base font-bold uppercase tracking-[0.14em] text-orange-300">
            <span aria-hidden className="h-0.5 w-8 rounded-full bg-orange-300" />
            {t(locale, "Fuatilia mzigo")}
          </p>
          <h1 className="hero-display text-[2.6rem] font-semibold leading-[1.04] tracking-[-0.03em] sm:text-6xl">
            {t(locale, "Track your cargo")}
          </h1>

          <p className="mt-5 text-base leading-relaxed text-white/75 sm:text-lg">
            {t(
              locale,
              "Enter the reference on your delivery note or box label — it looks like"
            )}{" "}
            <Ref>SC0125</Ref>. {t(locale, "A package label such as")}{" "}
            <Ref>SC0125-P3</Ref>{" "}
            {t(locale, "works too, and finds the whole consignment.")}
          </p>

          <div className="mt-8">
            <TrackForm dark pill value={reference} />
          </div>

          {/* The readout under the search. What the company actually does, in
              the register a bridge display is written in — and the only two
              figures on this screen that are not the customer's own. */}
          <div className="mt-7 flex flex-col items-start gap-1 text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-white/50 sm:flex-row sm:items-center sm:gap-3">
            <span aria-hidden className="hero-rule hidden h-px w-8 sm:block" />
            <span className="text-white/65">
              {ROUTE.originCity} → {ROUTE.destinationCity}
            </span>
            <span aria-hidden className="hidden size-1 rounded-full bg-cyan-400/70 sm:block" />
            <span className="tnum">
              {ROUTE.transitDaysMin}–{ROUTE.transitDaysMax} {t(locale, "days at sea")}
            </span>
          </div>

          <p className="mt-4 text-sm text-white/60">
            {t(locale, "Have an account?")}{" "}
            <Link
              href="/login?callbackUrl=%2Fportal"
              className="font-medium text-cyan-300 underline-offset-4 hover:underline"
            >
              {t(locale, "Sign in to see all of your cargo, invoices and photos.")}
            </Link>
          </p>
        </div>
      </div>
    </section>
  );
}
