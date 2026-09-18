import type { Metadata } from "next";
import { ClipboardList } from "lucide-react";

import { QuoteForm } from "@/components/site/request-forms";
import { PageHero } from "@/components/site/page-hero";
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
        eyebrow={t(locale, "Swift Cargo")}
        eyebrowIcon={ClipboardList}
        lead={t(locale, "Get")}
        trail={t(locale, "a quote")}
        body={t(locale, "Tell us what you are shipping and we will come back with a price.")}
      />

      <div className="bg-field py-14 sm:py-20">
        <div className="container grid max-w-5xl gap-10 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <QuoteForm />

          {/* What the desk on the other end of this form is going to ask for
              anyway. Said here, the first reply is a price rather than a
              question. */}
          <aside className="rounded-3xl border border-field-edge bg-card p-6 lg:self-start">
            <p className="eyebrow text-brand">{t(locale, "What we need")}</p>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              {t(locale, "The goods, roughly how much of them, and where they are in China. Everything else follows from what our warehouse measures.")}
            </p>
          </aside>
        </div>
      </div>
    </>
  );
}
