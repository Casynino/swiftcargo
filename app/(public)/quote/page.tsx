import type { Metadata } from "next";

import { FormShell, FormSide } from "@/components/site/form-shell";
import { PageHero } from "@/components/site/kit";
import { QuoteForm } from "@/components/site/request-forms";
import { DEFAULT_LOCALE, t } from "@/lib/i18n";

export const metadata: Metadata = {
  title: "Get a quote",
  description: "Tell us what you are shipping and we will come back with a price.",
  alternates: { canonical: "/quote" },
};

export default function Page() {
  const locale = DEFAULT_LOCALE;
  return (
    <>
      <PageHero
        overlap
        photo="portSunset"
        lead={t(locale, "Get a quote.")}
        trail={t(locale, "Tell us what you ship.")}
        body={<p>{t(locale, "Tell us what you are shipping and we will come back with a price.")}</p>}
      />
      <FormShell side={<FormSide />}>
        <QuoteForm />
      </FormShell>
    </>
  );
}
