import Link from "next/link";
import type { Metadata } from "next";
import { Ship } from "lucide-react";

import { PageHero, heroButton } from "@/components/site/kit";
import { Reveal } from "@/components/site/motion";
import { SailingCard } from "@/components/site/sailing-card";
import { DEFAULT_LOCALE, t } from "@/lib/i18n";
import { ARRIVAL_CAVEAT, publicSailings } from "@/lib/sailing-schedule";

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

  return (
    <>
      <PageHero
        overlap
        photo="shipSea"
        lead={t(locale, "A ship every Monday.")}
        trail={t(locale, "Cargo in by Friday.")}
        body={
          <p>
            {t(
              locale,
              "We take cargo in Guangzhou until Friday, pack the container that Friday, and the ship leaves on Monday. Get your goods to the warehouse before the deadline and they are on that sailing."
            )}
          </p>
        }
      />

      <section className="container pb-20 sm:pb-28">
        {sailings.length === 0 ? (
          <div className="relative z-10 -mt-24 rounded-[2rem] border bg-card p-12 text-center shadow-raised">
            <Ship className="mx-auto size-8 text-muted-foreground" />
            <p className="mt-4 font-medium">{t(locale, "No sailings published at the moment")}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {t(locale, "Contact us and we will tell you when the next container closes.")}
            </p>
            <Link href="/contact" className={`${heroButton.outline} mt-6`}>
              {t(locale, "Contact us")}
            </Link>
          </div>
        ) : (
          <ul className="relative z-10 -mt-24 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {sailings.map((sailing, i) => (
              <Reveal as="li" key={sailing.key} delay={Math.min(i, 5) * 70}>
                <SailingCard sailing={sailing} />
              </Reveal>
            ))}
          </ul>
        )}

        <p className="mt-8 text-xs text-muted-foreground">{t(locale, ARRIVAL_CAVEAT)}</p>
        <p className="mt-2 text-xs text-muted-foreground">
          {t(
            locale,
            "Sailings slip for weather, port congestion and customs, and we will tell you when one does."
          )}
        </p>
      </section>
    </>
  );
}
