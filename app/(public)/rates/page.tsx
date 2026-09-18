import Link from "next/link";
import type { Metadata } from "next";

import { Container, Package } from "lucide-react";

import { PageHero, PhotoFrame, heroButton } from "@/components/site/kit";
import { Reveal } from "@/components/site/motion";
import { convert, formatCurrency, isCurrency } from "@/lib/currency";
import { formatDate } from "@/lib/format";
import { DEFAULT_LOCALE, t } from "@/lib/i18n";
import { currentExchangeRate } from "@/lib/pricing";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = {
  title: "Shipping rates",
  description:
    "Current sea freight rates from China to Tanzania — per cubic metre for loose cargo, flat for full containers.",
  alternates: { canonical: "/rates" },
};

export const revalidate = 60;

const BASIS = { PER_CBM: "per CBM", PER_KG: "per kg", FLAT: "per container" } as const;

/**
 * The published rate card.
 *
 * Read live from the rate book — the same rows Finance edits — so the number a
 * customer sees here is the number the invoice will use. A price list typed
 * into a React component is a price list that goes stale the first time
 * somebody changes a rate and forgets this page exists.
 *
 * Only named cargo types are listed. Every line is billed at the rate for its
 * own type, and a type with no rate is reported to Finance rather than billed
 * at a fallback — so a row with no type is not a price anybody is charged, and
 * publishing it would be advertising one.
 */
export default async function RatesPage() {
  const locale = DEFAULT_LOCALE;
  const [rates, fx] = await Promise.all([
    prisma.shippingRate.findMany({
      where: { active: true, published: true, cargoType: { not: null } },
      orderBy: [{ service: "asc" }, { cargoType: "asc" }],
    }),
    currentExchangeRate(),
  ]);

  const lcl = rates.filter((r) => r.service === "LCL");
  const fcl = rates.filter((r) => r.service === "FCL");

  /* The board rate, for orientation only. An invoice pins its own. */
  const inShillings = (amount: (typeof rates)[number]) => {
    if (!isCurrency(amount.currency)) return "—";
    if (amount.currency === "TZS") return formatCurrency(amount.rate, "TZS");
    return fx ? formatCurrency(convert(amount.rate, amount.currency, "TZS", fx.rate), "TZS") : "—";
  };

  return (
    <>
      <PageHero
        overlap
        photo="containerStack"
        eyebrow={t(locale, "Guangzhou to Dar es Salaam")}
        lead={t(locale, "Shipping rates,")}
        trail={t(locale, "published in the open.")}
        body={
          <p>
            {t(
              locale,
              "Each kind of goods is charged at its own rate, on the measurements taken at our warehouse. Duty, VAT and clearing are not included."
            )}
          </p>
        }
      />

      <section className="container pb-20 sm:pb-28">
        <div className="relative z-10 -mt-24 space-y-8">
          {[
            { title: "Loose cargo (LCL)", rows: lcl, note: "Shared container, charged by volume or weight.", icon: Package },
            { title: "Full container (FCL)", rows: fcl, note: "The whole box to yourself.", icon: Container },
          ]
            .filter((group) => group.rows.length > 0)
            .map((group) => (
              <div key={group.title} className="overflow-hidden rounded-[2rem] border bg-card shadow-[0_40px_80px_-40px_rgba(4,14,26,0.55)]">
                <div className="flex items-center gap-4 border-b p-6 sm:p-7">
                  <span className="grid size-12 place-items-center rounded-2xl bg-brand text-brand-foreground">
                    <group.icon className="size-6" />
                  </span>
                  <div>
                    <h2 className="font-display text-2xl font-bold tracking-tight">{t(locale, group.title)}</h2>
                    <p className="text-sm text-muted-foreground">{t(locale, group.note)}</p>
                  </div>
                </div>
                <ul className="grid gap-px bg-border sm:grid-cols-2 lg:grid-cols-3">
                  {group.rows.map((rate) => (
                    <li key={rate.id} className="bg-card p-6 transition-colors hover:bg-surface-2">
                      <p className="font-semibold">{rate.cargoType}</p>
                      <p className="tnum mt-3 font-display text-3xl font-extrabold tracking-tight text-brand">
                        {formatCurrency(rate.rate, rate.currency)}
                      </p>
                      <p className="text-sm text-muted-foreground">{t(locale, BASIS[rate.basis])}</p>
                      <dl className="tnum mt-4 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
                        <div>
                          <dt className="inline">{t(locale, "Minimum")}: </dt>
                          <dd className="inline font-medium text-foreground">
                            {rate.minimumCbm
                              ? `${Number(rate.minimumCbm).toFixed(2)} CBM`
                              : rate.minimumKg
                                ? `${Number(rate.minimumKg)} kg`
                                : "—"}
                          </dd>
                        </div>
                        <div>
                          <dt className="inline">{t(locale, "In shillings")}: </dt>
                          <dd className="inline font-medium text-foreground">{inShillings(rate)}</dd>
                        </div>
                      </dl>
                    </li>
                  ))}
                </ul>
              </div>
            ))}

          {rates.length === 0 ? (
            <div className="rounded-[2rem] border bg-card p-12 text-center text-muted-foreground shadow-raised">
              {t(locale, "Our rate card is being updated. Please ask us for a quote.")}
            </div>
          ) : null}
        </div>

        <div className="mt-10 grid gap-6 lg:grid-cols-2">
          <Reveal className="rounded-[2rem] bg-surface-2 p-7 sm:p-9">
            <h2 className="font-display text-2xl font-bold tracking-tight">{t(locale, "What is not included")}</h2>
            <ul className="mt-5 space-y-3 text-sm">
              {[
                "Tanzanian import duty and VAT",
                "Customs clearing and port charges",
                "Delivery from our Dar warehouse to your address",
                "Storage beyond the free period after arrival",
              ].map((item) => (
                <li key={item} className="flex gap-2.5">
                  <span className="mt-1.5 size-2 shrink-0 rounded-full bg-signal" />
                  {t(locale, item)}
                </li>
              ))}
            </ul>
            {fx ? (
              <p className="tnum mt-6 text-xs text-muted-foreground">
                {t(locale, "Shilling figures at")} {Number(fx.rate).toLocaleString("en-US")} TZS / USD,{" "}
                {t(locale, "set")} {formatDate(fx.effectiveFrom)}.{" "}
                {t(locale, "Your invoice pins the rate on the day it is issued.")}
              </p>
            ) : null}
          </Reveal>
          <Reveal delay={100}>
            <PhotoFrame name="parcels" className="h-full min-h-[18rem] rounded-[2rem]">
              <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/50 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 p-7 text-white sm:p-9">
                <p className="font-display text-2xl font-bold tracking-tight">{t(locale, "Not sure of your volume?")}</p>
                <div className="mt-5 flex flex-wrap gap-3">
                  <Link href="/calculator" className={heroButton.primary}>
                    {t(locale, "Work out my CBM")}
                  </Link>
                  <Link href="/quote" className={heroButton.ghost}>
                    {t(locale, "Get a quote")}
                  </Link>
                </div>
              </div>
            </PhotoFrame>
          </Reveal>
        </div>
      </section>
    </>
  );
}
