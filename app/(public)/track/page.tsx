import Link from "next/link";
import type { Metadata } from "next";
import { CircleHelp, Lock, Ship } from "lucide-react";

import { SeaLaneBackdrop } from "@/components/site/sea-lane";
import { TrackForm } from "@/components/site/track-form";
import { Card } from "@/components/ui/card";
import { ROUTE } from "@/lib/constants";
import { DEFAULT_LOCALE, t } from "@/lib/i18n";
import { SHARE_CARD_TEXT } from "@/lib/share-card-text";

/* The browser tab keeps the customer's own words. The share card sells the
   service instead: most of the people who ever see it are not tracking
   anything — they are everybody else in the group the link was pasted into.
   lib/share-card-text.ts owns both those words and the picture's, so the two
   cannot drift apart. */
export const metadata: Metadata = {
  title: "Fuatilia mzigo wako — Track your cargo",
  description: SHARE_CARD_TEXT.description,
  alternates: { canonical: "/track" },
  openGraph: {
    type: "website",
    title: SHARE_CARD_TEXT.title,
    description: SHARE_CARD_TEXT.description,
  },
  twitter: {
    card: "summary_large_image",
    title: SHARE_CARD_TEXT.title,
    description: SHARE_CARD_TEXT.description,
  },
};

/* The same nine steps the result page draws, named once here for somebody who
   has not got a reference to hand yet. */
const JOURNEY = [
  ["Received at our Guangzhou warehouse", "Counted, weighed, measured and photographed"],
  ["Loaded into a container", "Guangzhou"],
  ["Departed China", "The container sails"],
  ["At sea", "Around 28–30 days, with an expected arrival date"],
  ["Arrived in Dar es Salaam", "At the port"],
  ["Received at our Dar warehouse", "Counted again against what left China"],
  ["Invoice issued", "The amount, the lines and where to pay it"],
  ["Ready for collection", "Once the invoice is settled and checks are complete"],
  ["Collected", "Or delivered to your address"],
] as const;

export default function TrackPage() {
  const locale = DEFAULT_LOCALE;

  return (
    <>
      {/* The search sits inside the hero rather than under it. This is the page
          customers arrive on from a WhatsApp message with a reference already
          in their hand — the field they came to use should be the first thing
          on the screen, not below a banner. */}
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
              <TrackForm dark pill />
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

      <section className="container max-w-3xl py-14 sm:py-16">
        {/* What a customer sees before they have searched — which, on the page
            most people arrive at from a WhatsApp link, is most of the time.
            Every colour inside is an explicit white value: muted-foreground on
            this panel would be unreadable. */}
        <div className="relative isolate overflow-hidden rounded-2xl bg-ink p-8 text-center text-white ring-1 ring-white/10 sm:p-10">
          <div
            aria-hidden
            className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_50%_0%,hsl(var(--marine)/0.25),transparent_62%),radial-gradient(ellipse_at_50%_120%,hsl(var(--signal)/0.18),transparent_60%)]"
          />
          <CircleHelp aria-hidden className="mx-auto size-8 text-marine" />
          <p className="mt-3 font-medium">{t(locale, "Nothing to show yet")}</p>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-white/70">
            {t(
              locale,
              "Your reference is printed on the delivery note we sent when your goods reached our Guangzhou warehouse, and on the label on every box."
            )}
          </p>
        </div>

        <Card className="mt-10 p-6 sm:p-7">
          <p className="eyebrow text-marine">{t(locale, "The journey")}</p>
          <h2 className="mt-2 text-xl font-semibold tracking-tight">
            {ROUTE.originCity} {t(locale, "to")} {ROUTE.destinationCity},{" "}
            {ROUTE.transitDaysMin}–{ROUTE.transitDaysMax} {t(locale, "days")}
          </h2>
          <ol className="mt-6 space-y-4">
            {JOURNEY.map(([label, where], i) => (
              <li key={label} className="flex gap-3.5">
                <span className="tnum mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-secondary text-[11px] font-semibold text-muted-foreground">
                  {i + 1}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium">{t(locale, label)}</p>
                  <p className="text-xs text-muted-foreground">{t(locale, where)}</p>
                </div>
              </li>
            ))}
          </ol>
        </Card>

        {/* Said out loud rather than left to be discovered — in both
            directions. A customer who expects to see their invoice here would
            otherwise read a working page as a broken one; a customer who does
            not expect their reference to show it should hear that from us
            first. See lib/tracking.ts for the decision and its limits. */}
        <Card className="mt-6 p-6 sm:p-7">
          <p className="flex items-center gap-2 text-sm font-medium">
            <Lock aria-hidden className="size-4 shrink-0 text-marine" />
            {t(locale, "What a reference shows, and what it does not")}
          </p>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {t(
              locale,
              "Your reference opens that one consignment: what we received, the photographs taken at our counter, your invoice and what is still to pay. It never shows a telephone number, a full name, or any other cargo — sign in to see everything under your account."
            )}
          </p>
        </Card>
      </section>
    </>
  );
}
