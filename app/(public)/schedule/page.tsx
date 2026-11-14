import Link from "next/link";
import type { Metadata } from "next";
import { Ship } from "lucide-react";

import { PageHero, heroButton } from "@/components/site/kit";
import { Reveal } from "@/components/site/motion";
import { NextSailingStrip, SailingCard } from "@/components/site/sailing-card";
import { DEFAULT_LOCALE, t } from "@/lib/i18n";
import { ARRIVAL_CAVEAT_SW, publicSailings } from "@/lib/sailing-schedule";

export const metadata: Metadata = {
  title: "Sailing schedule",
  description:
    "Upcoming Swift Cargo sailings from Guangzhou to Dar es Salaam, with cargo receiving deadlines.",
  alternates: { canonical: "/schedule" },
};

export const revalidate = 60;

/* A quarter ahead. Far enough that somebody ordering from a factory today can
   see the week their goods will be ready for, and no further — the rule holds
   for ever, but a date twelve months out is a promise nobody has made. */
const WEEKS_SHOWN = 12;

export default async function SchedulePage() {
  const locale = DEFAULT_LOCALE;
  const sailings = await publicSailings({ count: WEEKS_SHOWN });
  const next = sailings.find((s) => s.bookingOpen) ?? null;

  return (
    <>
      <PageHero
        photo="shipSea"
        video="port-night"
        eyebrow={t(locale, "Ratiba ya meli")}
        lead={t(locale, "Meli kila Jumatatu.")}
        trail={t(locale, "Mzigo mwisho Ijumaa.")}
        body={
          <p>
            {t(
              locale,
              "Tunapokea mzigo kila siku, ila tunapakia kontena kila wiki. Tunapakia kila Ijumaa, na Jumatatu meli inaanza safari kuja Tanzania. Safari huchukua siku 28 hadi 35."
            )}
          </p>
        }
      />

      {next ? <NextSailingStrip sailing={next} /> : null}

      <section className="container py-14 sm:py-24">
        {sailings.length === 0 ? (
          <div className="rounded-3xl border bg-card p-12 text-center shadow-raised">
            <Ship className="mx-auto size-8 text-muted-foreground" />
            <p className="mt-4 font-medium">{t(locale, "Hakuna ratiba ya meli kwa sasa")}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {t(locale, "Wasiliana nasi tutakuambia kontena linalofuata litafungwa lini.")}
            </p>
            <Link href="/contact" className={`${heroButton.outline} mt-6`}>
              {t(locale, "Wasiliana nasi")}
            </Link>
          </div>
        ) : (
          <ul className="grid gap-4 sm:gap-6 md:grid-cols-2 lg:grid-cols-3">
            {sailings.map((sailing, i) => (
              <Reveal as="li" key={sailing.key} delay={Math.min(i, 5) * 70}>
                <SailingCard sailing={sailing} featured={sailing.key === next?.key} />
              </Reveal>
            ))}
          </ul>
        )}

        <p className="mt-8 text-xs text-white/45">{t(locale, ARRIVAL_CAVEAT_SW)}</p>
        <p className="mt-2 text-xs text-muted-foreground">
          {t(
            locale,
            "Meli huchelewa kwa sababu ya hali ya hewa, msongamano bandarini na forodha, na tutakujulisha inapotokea."
          )}
        </p>
      </section>
    </>
  );
}
