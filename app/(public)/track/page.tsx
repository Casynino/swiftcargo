import type { Metadata } from "next";
import { ArrowUpRight, Boxes, CircleHelp, Lock, MessageCircle, Waves } from "lucide-react";

import { TrackHero } from "@/components/site/track-hero";
import { Card } from "@/components/ui/card";
import { ROUTE } from "@/lib/constants";
import { DEFAULT_LOCALE, t } from "@/lib/i18n";
import { prisma } from "@/lib/prisma";
import { SHARE_CARD_TEXT } from "@/lib/share-card-text";
import { whatsappLink, WHATSAPP_OPENER } from "@/lib/site-contact";

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

export default async function TrackPage() {
  const locale = DEFAULT_LOCALE;
  /* Opens with the greeting already in the box, so the customer presses send
     once and says the rest in their own words. See lib/site-contact.ts. */
  const company = await prisma.companySetting.findUnique({
    where: { id: "singleton" },
    select: { whatsapp: true },
  });
  const wa = whatsappLink(company?.whatsapp, WHATSAPP_OPENER);

  return (
    <>
      <TrackHero />

      <section className="container max-w-3xl py-14 sm:py-16">
        {/* What a customer sees before they have searched — which, on the page
            most people arrive at from a WhatsApp link, is most of the time.
            It used to be four lines saying there was nothing here, which is a
            card that tells somebody they have wasted the tap. The three facts
            under it are the ones a customer without a reference in their hand
            actually wants, and every one of them is checkable: the route and
            the crossing come from ROUTE, the WhatsApp number from the
            company's own settings. Every colour inside is an explicit white
            value: muted-foreground on this panel would be unreadable. */}
        <div className="relative isolate overflow-hidden rounded-2xl bg-ink p-7 text-white ring-1 ring-white/10 sm:p-9">
          <div
            aria-hidden
            className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_50%_0%,hsl(var(--marine)/0.25),transparent_62%),radial-gradient(ellipse_at_50%_120%,hsl(var(--signal)/0.18),transparent_60%)]"
          />
          <div className="text-center">
            <CircleHelp aria-hidden className="mx-auto size-8 text-cyan-300" />
            <p className="mt-3 font-medium">{t(locale, "Nothing to show yet")}</p>
            <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-white/70">
              {t(
                locale,
                "Your reference is printed on the delivery note we sent when your goods reached our Guangzhou warehouse, and on the label on every box."
              )}
            </p>
          </div>

          <div className="mt-8 grid gap-3 border-t border-white/10 pt-7 sm:grid-cols-3">
            <Assurance
              icon={Waves}
              title={`${ROUTE.originCity} → ${ROUTE.destinationCity}`}
              body={`${ROUTE.transitDaysMin}–${ROUTE.transitDaysMax} ${t(locale, "days at sea, loose cargo and full containers.")}`}
            />
            <Assurance
              icon={Boxes}
              title={t(locale, "Priced per cubic metre")}
              body={t(
                locale,
                "Counted, weighed, measured and photographed at our own counter."
              )}
            />
            <Assurance
              icon={MessageCircle}
              title={t(locale, "Ask us on WhatsApp")}
              body={t(locale, "If the reference is lost, the desk can find your cargo.")}
              href={wa ?? "/contact"}
            />
          </div>
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

/**
 * One of the three things worth knowing when there is no reference to look up.
 *
 * A link when there is somewhere to go and a plain panel when there is not:
 * the WhatsApp number comes from the company's settings and is allowed to be
 * empty, and a dead button is worse than no button.
 */
function Assurance({
  icon: Icon,
  title,
  body,
  href,
}: {
  icon: typeof Boxes;
  title: string;
  body: string;
  href?: string;
}) {
  const inside = (
    <>
      <span className="flex items-center justify-between">
        <Icon aria-hidden className="size-4 shrink-0 text-cyan-300" />
        {href ? (
          <ArrowUpRight aria-hidden className="size-3.5 shrink-0 text-white/35" />
        ) : null}
      </span>
      <span className="mt-2.5 block text-sm font-medium leading-snug">{title}</span>
      <span className="mt-1 block text-xs leading-relaxed text-white/60">{body}</span>
    </>
  );

  const shell =
    "block rounded-xl border border-white/10 bg-white/[0.04] p-4 text-left shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)]";

  return href ? (
    <a
      href={href}
      target={href.startsWith("http") ? "_blank" : undefined}
      rel={href.startsWith("http") ? "noopener noreferrer" : undefined}
      className={`${shell} transition-colors hover:border-white/20 hover:bg-white/[0.08]`}
    >
      {inside}
    </a>
  ) : (
    <div className={shell}>{inside}</div>
  );
}
