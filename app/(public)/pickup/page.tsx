import type { Metadata } from "next";

import { PickupForm } from "@/components/site/request-forms";
import { DEFAULT_LOCALE, t } from "@/lib/i18n";

export const metadata: Metadata = {
  title: "Request a pickup",
  description: "We can collect from your supplier in China and bring it to our Guangzhou warehouse.",
  alternates: { canonical: "/pickup" },
};

export default function Page() {
  const locale = DEFAULT_LOCALE;
  return (
    <div className="container max-w-3xl py-12 sm:py-16">
      <p className="eyebrow text-marine">Swift Cargo</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">{t(locale, "Request a pickup")}</h1>
      <p className="mt-3 max-w-2xl text-muted-foreground">
        {t(locale, "We can collect from your supplier in China and bring it to our Guangzhou warehouse.")}
      </p>
      <div className="mt-10">
        <PickupForm />
      </div>
    </div>
  );
}
