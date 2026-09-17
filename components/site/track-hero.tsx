import Link from "next/link";
import { Ship } from "lucide-react";

import { SeaLaneBackdrop } from "@/components/site/sea-lane";
import { TrackForm } from "@/components/site/track-form";
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
export function TrackHero({
  /** Already searched: the box shows it back rather than emptying itself. */
  reference,
}: {
  reference?: string;
}) {
  const locale = DEFAULT_LOCALE;

  return (
    <section className="relative isolate overflow-hidden bg-ink text-white">
      <SeaLaneBackdrop />

      {/* The bottom padding on the narrow layout is the chart's band — see
          SeaLaneBackdrop. It is padding rather than a sibling element so the
          drawing can still bleed to the edges of the hero. */}
      <div className="container relative pb-[calc(100vw*0.472+2rem)] pt-16 sm:pt-20 lg:py-32 lg:pb-32">
        <div className="animate-in-up max-w-xl lg:max-w-[30rem]">
          <p className="eyebrow inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-marine">
            <Ship aria-hidden className="size-3.5" />
            {t(locale, "Fuatilia mzigo")}
          </p>

          <h1 className="mt-6 text-4xl font-semibold leading-[1.08] tracking-tight sm:text-5xl">
            {t(locale, "Track your cargo")}
          </h1>

          <p className="mt-5 text-base leading-relaxed text-white/70 sm:text-lg">
            {t(
              locale,
              "Enter the reference on your delivery note or box label — it looks like"
            )}{" "}
            <span className="tnum whitespace-nowrap font-medium text-white">SC0125</span>.{" "}
            {t(locale, "A package label such as")}{" "}
            <span className="tnum whitespace-nowrap font-medium text-white">SC0125-P3</span>{" "}
            {t(locale, "works too, and finds the whole consignment.")}
          </p>

          <div className="mt-8">
            <TrackForm dark pill value={reference} />
          </div>

          <p className="mt-4 text-sm text-white/55">
            {t(locale, "Have an account?")}{" "}
            <Link
              href="/login?callbackUrl=%2Fportal"
              className="font-medium text-marine underline-offset-4 hover:underline"
            >
              {t(locale, "Sign in to see all of your cargo, invoices and photos.")}
            </Link>
          </p>
        </div>
      </div>
    </section>
  );
}
