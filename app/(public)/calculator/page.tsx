import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Calculator } from "lucide-react";

import { CbmCalculator } from "@/components/site/cbm-calculator";
import { PageHero, heroButton } from "@/components/site/kit";
import { Reveal } from "@/components/site/motion";
import { DEFAULT_LOCALE, t } from "@/lib/i18n";
import { publicRateBook } from "@/lib/public-estimate";

export const metadata: Metadata = {
  title: "CBM calculator",
  description:
    "Work out the volume of your cargo in cubic metres and get an estimated sea freight cost from China to Tanzania.",
  alternates: { canonical: "/calculator" },
};

export const revalidate = 60;

export default async function CalculatorPage() {
  const locale = DEFAULT_LOCALE;
  /* One row per named cargo type, straight from the rate book — the same rows
     the invoice will be priced from. See lib/public-estimate.ts. */
  const rates = await publicRateBook("LCL");

  return (
    <>
      <PageHero
        overlap
        photo="parcels"
        eyebrow={t(locale, "CBM calculator")}
        lead={t(locale, "How much space")}
        trail={t(locale, "do my boxes take?")}
        body={
          <p>
            {t(
              locale,
              "Sea freight is sold by the cubic metre. Measure your boxes, put the numbers in, choose what you are shipping, and we will work out the volume and roughly what it costs."
            )}
          </p>
        }
      />
      <section className="container pb-20 sm:pb-28">
        <div className="relative z-10 -mt-24 rounded-[2rem] border bg-card p-4 shadow-[0_40px_80px_-40px_rgba(4,14,26,0.55)] sm:p-8">
          <CbmCalculator rates={rates} />
        </div>

        <div className="mt-12 grid gap-6 lg:grid-cols-3">
          <Reveal className="rounded-[2rem] bg-ink p-7 text-white lg:col-span-2 sm:p-9">
            <span className="grid size-12 place-items-center rounded-2xl bg-white/10">
              <Calculator className="size-6 text-cyan-300" />
            </span>
            <h2 className="mt-6 font-display text-2xl font-bold tracking-tight">{t(locale, "How the maths works")}</h2>
            <p className="mt-3 text-white/70">
              {t(
                locale,
                "Volume is length × width × height × number of boxes. In centimetres, divide by 1,000,000 to get cubic metres; in metres, the answer is already in cubic metres."
              )}
            </p>
            <p className="tnum mt-5 inline-block rounded-xl bg-white/10 px-4 py-2.5 font-mono text-sm">
              60 × 40 × 40 cm × 12 = 1.152 CBM
            </p>
          </Reveal>
          <Reveal delay={100} className="flex flex-col justify-between gap-6 rounded-[2rem] border bg-card p-7 shadow-soft sm:p-9">
            <p className="font-display text-2xl font-bold tracking-tight">
              {t(locale, "Want the exact price?")}
            </p>
            <div className="grid gap-3">
              <Link href="/quote" className={heroButton.solid}>
                {t(locale, "Get a proper quote")}
                <ArrowRight className="size-4" />
              </Link>
              <Link href="/rates" className={heroButton.outline}>
                {t(locale, "See all rates")}
              </Link>
            </div>
          </Reveal>
        </div>
      </section>
    </>
  );
}
