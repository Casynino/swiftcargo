import type { Metadata } from "next";

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
    <div className="container max-w-3xl py-12 sm:py-16">
      <p className="eyebrow text-marine">Swift Cargo</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">{t(locale, "Get a quote")}</h1>
      <p className="mt-3 max-w-2xl text-muted-foreground">
        {t(locale, "Tell us what you are shipping and we will come back with a price.")}
      </p>
      <div className="mt-10">
        <QuoteForm />
      </div>
    </div>
  );
}
