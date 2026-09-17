import type { Metadata } from "next";

import { BookingForm } from "@/components/site/request-forms";
import { DEFAULT_LOCALE, t } from "@/lib/i18n";

export const metadata: Metadata = {
  title: "Book space",
  description: "Reserve space on a sailing — a shared container or a box of your own.",
  alternates: { canonical: "/book" },
};

export default function Page() {
  const locale = DEFAULT_LOCALE;
  return (
    <div className="container max-w-3xl py-12 sm:py-16">
      <p className="eyebrow text-marine">Swift Cargo</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">{t(locale, "Book space")}</h1>
      <p className="mt-3 max-w-2xl text-muted-foreground">
        {t(locale, "Reserve space on a sailing — a shared container or a box of your own.")}
      </p>
      <div className="mt-10">
        <BookingForm />
      </div>
    </div>
  );
}
