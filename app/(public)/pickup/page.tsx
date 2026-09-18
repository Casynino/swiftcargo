import type { Metadata } from "next";
import { ClipboardList } from "lucide-react";

import { PickupForm } from "@/components/site/request-forms";
import { PageHero } from "@/components/site/page-hero";
import { DEFAULT_LOCALE, t } from "@/lib/i18n";

export const metadata: Metadata = {
  title: "Request a pickup",
  description: "We can collect from your supplier in China and bring it to our Guangzhou warehouse.",
  alternates: { canonical: "/pickup" },
};

export default function Page() {
  const locale = DEFAULT_LOCALE;
  return (
    <>
      <PageHero
        eyebrow={t(locale, "Swift Cargo")}
        eyebrowIcon={ClipboardList}
        lead={t(locale, "Request")}
        trail={t(locale, "a pickup")}
        body={t(locale, "We can collect from your supplier in China and bring it to our Guangzhou warehouse.")}
        scene="road"
      />

      <div className="bg-field py-14 sm:py-20">
        <div className="container grid max-w-5xl gap-10 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <PickupForm />

          {/* What the desk on the other end of this form is going to ask for
              anyway. Said here, the first reply is a price rather than a
              question. */}
          <aside className="rounded-3xl border border-field-edge bg-card p-6 lg:self-start">
            <p className="eyebrow text-brand">{t(locale, "What we need")}</p>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              {t(locale, "The supplier's address and contact in China, and what is waiting there. We quote the collection before we send anybody.")}
            </p>
          </aside>
        </div>
      </div>
    </>
  );
}
