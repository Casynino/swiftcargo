import type { Metadata } from "next";

import { FormShell, FormSide } from "@/components/site/form-shell";
import { PageHero } from "@/components/site/kit";
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

  /* One option per sailing, named by the day it leaves — which is what a
     customer means when they say "put me on the boat on the third". */
  const options = sailings
    .filter((sailing) => sailing.bookingOpen)
    .map((sailing) => ({
      departure: sailing.departureDate.toISOString().slice(0, 10),
      label: `${t(locale, "Sails")} ${formatDate(sailing.departureDate)} — ${t(
        locale,
        "cargo in by"
      )} ${formatDate(sailing.cargoDeadline)}`,
    }));

  return (
    <>
      <PageHero
        overlap
        photo="shipAerial"
        lead={t(locale, "Book your space")}
        trail={t(locale, "on the next ship.")}
        body={
          <p>
            {t(
              locale,
              "Tell us what you are moving and we will come back with space, a price and the sailing it goes on."
            )}
          </p>
        }
      />
      <FormShell side={<FormSide photo="craneLift" />}>
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
        <p className="mt-6 text-xs text-muted-foreground">{t(locale, ARRIVAL_CAVEAT)}</p>
      </FormShell>
    </>
  );
}
