import type { Metadata } from "next";
import { ClipboardList } from "lucide-react";

import { BookingForm } from "@/components/site/request-forms";
import { PageHero } from "@/components/site/page-hero";
import { DEFAULT_LOCALE, t } from "@/lib/i18n";

export const metadata: Metadata = {
  title: "Book space",
  description: "Reserve space on a sailing — a shared container or a box of your own.",
  alternates: { canonical: "/book" },
};

export default function Page() {
  const locale = DEFAULT_LOCALE;
  return (
    <>
      <PageHero
        eyebrow={t(locale, "Swift Cargo")}
        eyebrowIcon={ClipboardList}
        lead={t(locale, "Book")}
        trail={t(locale, "space on a sailing")}
        body={t(locale, "Reserve space on a sailing — a shared container or a box of your own.")}
        scene="port"
      />

      <div className="bg-field py-14 sm:py-20">
        <div className="container grid max-w-5xl gap-10 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <BookingForm />

          {/* What the desk on the other end of this form is going to ask for
              anyway. Said here, the first reply is a price rather than a
              question. */}
          <aside className="rounded-3xl border border-field-edge bg-card p-6 lg:self-start">
            <p className="eyebrow text-brand">{t(locale, "What we need")}</p>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              {t(locale, "Which sailing you are aiming at, and roughly what you are sending. We will confirm the cargo deadline back to you.")}
            </p>
          </aside>
        </div>
      </div>
    </>
  );
}
