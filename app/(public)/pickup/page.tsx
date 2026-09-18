import type { Metadata } from "next";

import { FormShell, FormSide } from "@/components/site/form-shell";
import { PageHero } from "@/components/site/kit";
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
    <>
      <PageHero
        overlap
        photo="cnFactoryLine"
        eyebrow={t(locale, "China pickup")}
        lead={t(locale, "We collect it")}
        trail={t(locale, "from your supplier.")}
        body={<p>{t(locale, "We can collect from your supplier in China and bring it to our Guangzhou warehouse.")}</p>}
      />
      <FormShell side={<FormSide photo="cnWholesaleHall" />}>
        <PickupForm cargoTypes={cargoTypes} />
      </FormShell>
    </>
  );
}
