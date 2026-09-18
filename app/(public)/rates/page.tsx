import Link from "next/link";
import type { Metadata } from "next";

import { PageHero, PhotoFrame, heroButton } from "@/components/site/kit";
import { Reveal } from "@/components/site/motion";
import { PriceCalculator } from "@/components/site/price-calculator";
import { formatCurrency, isCurrency } from "@/lib/currency";
import { formatDate } from "@/lib/format";
import { DEFAULT_LOCALE, t } from "@/lib/i18n";
import { currentExchangeRate } from "@/lib/pricing";
import { prisma } from "@/lib/prisma";
import { publicRateBook } from "@/lib/public-estimate";

export const metadata: Metadata = {
  title: "Shipping rates",
  description:
    "Choose what you are shipping, enter your CBM and see your sea freight price from China to Tanzania.",
  alternates: { canonical: "/rates" },
};

export const revalidate = 60;

/**
 * THE RATE CARD, BY REQUEST.
 *
 * By the owner's decision the rate book is not printed as a list. A customer
 * chooses their goods and types their volume, and the server prices it from
 * the same rows the invoice uses (lib/public-estimate.ts). Only the names of
 * the cargo types reach the page for loose cargo; a rate is only ever shown
 * as the answer to a question.
 */
export default async function RatesPage() {
  const locale = DEFAULT_LOCALE;
  const [lcl, fclRows, fx] = await Promise.all([
    publicRateBook("LCL"),
    prisma.shippingRate.findMany({
      where: { active: true, published: true, service: "FCL", cargoType: { not: null } },
      orderBy: { rate: "asc" },
      select: { cargoType: true, rate: true, currency: true },
    }),
    currentExchangeRate(),
  ]);

  const containers = fclRows
    .filter((row) => isCurrency(row.currency))
    .map((row) => ({ cargoType: row.cargoType!, price: formatCurrency(row.rate, row.currency) }));

  return (
    <>
      <PageHero
        overlap
        photo="containerStack"
        eyebrow={t(locale, "Shipping rates")}
        lead={t(locale, "What will my shipping cost?")}
        trail={t(locale, "Find out in seconds.")}
        body={
          <p>
            {t(
              locale,
              "Choose your goods, enter your CBM, and see your rate and your total straight away."
            )}
          </p>
        }
      />

      <section className="container pb-20 sm:pb-28">
        <div className="relative z-10 -mt-24">
          {lcl.length > 0 || containers.length > 0 ? (
            <PriceCalculator cargoTypes={lcl.map((r) => r.cargoType)} containers={containers} start="cbm" />
          ) : (
            <p className="rounded-[2rem] border bg-card p-12 text-center text-muted-foreground shadow-raised">
              {t(locale, "Our rate card is being updated. Please ask us for a quote.")}
            </p>
          )}
        </div>

        <div className="mt-10 grid gap-6 lg:grid-cols-2">
          <Reveal className="rounded-[2rem] bg-surface-2 p-7 sm:p-9">
            <h2 className="font-display text-2xl font-bold tracking-tight">{t(locale, "What is not included")}</h2>
            <ul className="mt-5 space-y-3 text-sm">
              {[
                "Tanzanian import duty and VAT",
                "Customs clearing and port charges",
                "Delivery from our Dar warehouse to your address",
                "Storage beyond the free period after arrival",
              ].map((item) => (
                <li key={item} className="flex gap-2.5">
                  <span className="mt-1.5 size-2 shrink-0 rounded-full bg-signal" />
                  {t(locale, item)}
                </li>
              ))}
            </ul>
            {fx ? (
              <p className="tnum mt-6 text-xs text-muted-foreground">
                {t(locale, "Shilling figures at")} {Number(fx.rate).toLocaleString("en-US")} TZS / USD,{" "}
                {t(locale, "set")} {formatDate(fx.effectiveFrom)}.{" "}
                {t(locale, "Your invoice pins the rate on the day it is issued.")}
              </p>
            ) : null}
          </Reveal>
          <Reveal delay={100}>
            <PhotoFrame name="parcels" className="h-full min-h-[18rem] rounded-[2rem]">
              <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/50 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 p-7 text-white sm:p-9">
                <p className="font-display text-2xl font-bold tracking-tight">{t(locale, "Not sure of your volume?")}</p>
                <div className="mt-5 flex flex-wrap gap-3">
                  <Link href="/calculator" className={heroButton.primary}>
                    {t(locale, "Price calculator")}
                  </Link>
                  <Link href="/quote" className={heroButton.ghost}>
                    {t(locale, "Get a quote")}
                  </Link>
                </div>
              </div>
            </PhotoFrame>
          </Reveal>
        </div>
      </section>
    </>
  );
}
