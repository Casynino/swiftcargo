import type { Metadata } from "next";

import { PickupForm } from "@/components/site/request-forms";
import { DEFAULT_LOCALE, t } from "@/lib/i18n";
import { publicRateBook } from "@/lib/public-estimate";

export const metadata: Metadata = {
  title: "Request a pickup",
  description: "We can collect from your supplier in China and bring it to our Guangzhou warehouse.",
  alternates: { canonical: "/pickup" },
};

export const revalidate = 300;

export default async function Page() {
  const locale = DEFAULT_LOCALE;
  /* The rate book's own categories, offered as suggestions. A customer who
     picks one of ours is a customer Support does not have to reclassify. */
  const cargoTypes = (await publicRateBook("LCL")).map((rate) => rate.cargoType);

  return (
    <div className="container max-w-3xl py-12 sm:py-16">
      <p className="eyebrow text-marine">Swift Cargo</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">{t(locale, "Request a pickup")}</h1>
      <p className="mt-3 max-w-2xl text-muted-foreground">
        {t(locale, "We can collect from your supplier in China and bring it to our Guangzhou warehouse.")}
      </p>
      <div className="mt-10">
        <PickupForm cargoTypes={cargoTypes} />
      </div>
    </div>
  );
}
