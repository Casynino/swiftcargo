import type { Metadata } from "next";

import { BookingForm } from "@/components/site/request-forms";
import { formatDate } from "@/lib/format";
import { DEFAULT_LOCALE, t } from "@/lib/i18n";
import { publicRateBook } from "@/lib/public-estimate";
import { ARRIVAL_CAVEAT, publicSailings } from "@/lib/sailing-schedule";

export const metadata: Metadata = {
  title: "Book a service",
  description:
    "Ask us for a full container, space in a shared container, special cargo or customs clearance at Dar es Salaam.",
  alternates: { canonical: "/book" },
};

export const revalidate = 300;

/* How many weeks a customer may pick from. Beyond a couple of months the
   readiness date is a guess and Support would rather be told the month. */
const WEEKS_OFFERED = 8;

/**
 * One form for the four services.
 *
 * A link from the schedule or the calculator arrives with a service, a sailing
 * or a volume already in the address. They are only defaults on a form a person
 * then reads and sends — nothing in a query string reaches the database
 * unchecked, and nothing in it can set a status or a price.
 */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const locale = DEFAULT_LOCALE;
  const params = await searchParams;
  const first = (key: string) => {
    const value = params[key];
    return (Array.isArray(value) ? value[0] : value)?.slice(0, 120);
  };

  const [sailings, rates] = await Promise.all([
    publicSailings({ count: WEEKS_OFFERED }),
    publicRateBook("LCL"),
  ]);

  /*
    ONE OPTION PER WEEK.

    An extra sailing published mid-week belongs to the same week as the
    generated Monday beside it, and two rows offering the same week is a choice
    with no difference in it. The published one wins, because somebody typed it
    and the other is only the rule imagining a boat.
  */
  const byWeek = new Map<string, { weekOf: string; label: string }>();
  for (const sailing of sailings) {
    if (!sailing.bookingOpen) continue;
    const weekOf = sailing.weekOf.toISOString().slice(0, 10);
    if (byWeek.has(weekOf) && sailing.source !== "published") continue;
    byWeek.set(weekOf, {
      weekOf,
      label: `${t(locale, "Sails")} ${formatDate(sailing.departureDate)} — ${t(
        locale,
        "cargo in by"
      )} ${formatDate(sailing.cargoDeadline)}`,
    });
  }
  const options = [...byWeek.values()];

  return (
    <div className="container max-w-3xl py-12 sm:py-16">
      <p className="eyebrow text-marine">Swift Cargo</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">
        {t(locale, "Book a service")}
      </h1>
      <p className="mt-3 max-w-2xl text-muted-foreground">
        {t(
          locale,
          "Tell us what you are moving and we will come back with space, a price and the sailing it goes on."
        )}
      </p>
      <div className="mt-10">
        <BookingForm
          sailings={options}
          cargoTypes={rates.map((rate) => rate.cargoType)}
          defaults={{
            service: first("service"),
            sailing: first("sailing"),
            commodity: first("commodity"),
            cbm: first("cbm"),
          }}
        />
      </div>
      <p className="mt-6 text-xs text-muted-foreground">{t(locale, ARRIVAL_CAVEAT)}</p>
    </div>
  );
}
