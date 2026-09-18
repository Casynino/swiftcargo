import type { Metadata } from "next";

import { PageHero } from "@/components/site/kit";
import { PriceCalculator } from "@/components/site/price-calculator";
import { DEFAULT_LOCALE, t } from "@/lib/i18n";
import { publicRateBook } from "@/lib/public-estimate";

export const metadata: Metadata = {
  title: "Shipping price calculator",
  description:
    "Enter your box sizes or CBM, choose what you are shipping, and see what sea freight from China to Tanzania costs.",
  alternates: { canonical: "/calculator" },
};

export const revalidate = 60;

export default async function CalculatorPage() {
  const locale = DEFAULT_LOCALE;
  /* The names of the cargo types only — prices come back from the server as
     the answer for the goods chosen. See lib/public-estimate.ts. */
  const rates = await publicRateBook("LCL");

  return (
    <>
      <PageHero
        overlap
        photo="parcels"
        eyebrow={t(locale, "Price calculator")}
        lead={t(locale, "Shipping price calculator.")}
        trail={t(locale, "Measure, choose, done.")}
        body={
          <p>
            {t(
              locale,
              "Put in the size of your boxes — or your CBM if you already know it — choose your goods, and your price appears."
            )}
          </p>
        }
      />
      <section className="container pb-20 sm:pb-28">
        <div className="relative z-10 -mt-24">
          <PriceCalculator cargoTypes={rates.map((r) => r.cargoType)} start="boxes" />
        </div>
      </section>
    </>
  );
}
