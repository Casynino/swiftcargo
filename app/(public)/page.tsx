import Link from "next/link";
import type { Metadata } from "next";
import {
  Anchor,
  ArrowRight,
  Camera,
  Container,
  MapPin,
  Package,
  Scale,
  Search,
  Ship,
} from "lucide-react";

import {
  DisplayHeading,
  Eyebrow,
  PillLink,
  SectionHead,
} from "@/components/site/display";
import { PhotoCaption, PhotoSlot } from "@/components/site/photo-slot";
import { RouteScene } from "@/components/site/scenes";
import { SeaScene } from "@/components/site/sea-scene";
import { TrackForm } from "@/components/site/track-form";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ROUTE } from "@/lib/constants";
import { prisma } from "@/lib/prisma";
import { formatDate, formatMoney } from "@/lib/format";
import { DEFAULT_LOCALE, t } from "@/lib/i18n";
import { telHref } from "@/lib/site-contact";

export const metadata: Metadata = {
  title: "Sea freight from China to Tanzania",
  description:
    "Swift Cargo ships loose cargo and full containers from Guangzhou to Dar es Salaam in 28–30 days. Track your cargo, calculate CBM and see live rates.",
};

/* The public site is read far more often than it changes, and the rate card is
   the only part that moves. A minute is short enough that a rate published in
   the morning is live by the time a customer rings about it. */
export const revalidate = 60;

const SERVICES = [
  {
    slot: "service-lcl",
    title: "Loose cargo",
    abbr: "LCL",
    body: "Your goods share a container and you pay for the space you use, by the cubic metre.",
    href: "/calculator",
    action: "Work out my CBM",
  },
  {
    slot: "service-fcl",
    title: "Full container",
    abbr: "FCL",
    body: "A whole 20ft or 40ft box to yourself, sealed at the factory or at our warehouse.",
    href: "/book",
    action: "Book a container",
  },
  {
    slot: "service-sourcing",
    title: "China sourcing",
    abbr: "GZ",
    body: "We find the supplier, check the goods before they load, and consolidate in Guangzhou.",
    href: "/china",
    action: "Sourcing in China",
  },
] as const;

export default async function HomePage() {
  const locale = DEFAULT_LOCALE;
  const [company, rates, sailings, stats] = await Promise.all([
    prisma.companySetting.findUnique({ where: { id: "singleton" } }),
    /* Named cargo types only. A rate with no type is the house fallback, and
       leading the home page with it advertises a price no named category is
       actually billed at. */
    prisma.shippingRate.findMany({
      where: { active: true, published: true, cargoType: { not: null } },
      orderBy: [{ service: "asc" }, { rate: "asc" }],
      take: 3,
    }),
    prisma.shipmentSchedule.findMany({
      where: { published: true, departureDate: { gte: new Date() } },
      orderBy: { departureDate: "asc" },
      take: 3,
    }),
    Promise.all([
      prisma.customer.count({ where: { deletedAt: null } }),
      prisma.container.count({
        where: { deletedAt: null, status: { in: ["DEPARTED", "IN_TRANSIT", "ARRIVED", "CLOSED"] } },
      }),
      prisma.cargo.count({
        where: { deletedAt: null, status: { in: ["COLLECTED", "DELIVERED"] } },
      }),
    ]),
  ]);

  const [customers, containers, delivered] = stats;

  /**
   * The figures under the headline come off the operational record or they do
   * not appear. There is no other kind of number on this site.
   *
   * A count also has to be worth printing. "0 consignments delivered" on launch
   * day is true and tells a visitor exactly the wrong thing, and "3 containers
   * sailed" under a headline is worse — it invites the reader to do a sum the
   * company would rather they did not. So a figure waits until it stands up on
   * its own, and the wait is also what keeps the labels grammatical: nothing
   * here ever has to say "1 consignments".
   */
  const WORTH_PRINTING = 10;
  const figures = (
    [
      [containers, "containers sailed"],
      [delivered, "consignments delivered"],
      [customers, "customers shipping with us"],
    ] as const
  ).filter(([value]) => value >= WORTH_PRINTING);

  return (
    <>
      {/* ---------------------------------------------------------------- Hero */}
      <section className="relative isolate overflow-hidden bg-ink text-white">
        {/* The same sea the tracking page opens on: one drawing, no image file,
            and the only picture on this site that is nobody's guess about what
            a freight company looks like. */}
        <SeaScene />

        {/* The bottom padding is the water's band — see SeaScene, which measures
            the horizon from the same numbers. Reserved before paint, so nothing
            on the page moves once the fonts land. */}
        <div className="container relative flex min-h-[calc(72vw+34rem)] flex-col justify-start pb-[calc(72vw+1rem)] pt-24 sm:min-h-[calc(42vw+34rem)] sm:pb-[calc(42vw+1.5rem)] sm:pt-28 lg:min-h-[43rem] lg:justify-center lg:pb-28 lg:pt-32 xl:min-h-[47rem] 2xl:min-h-[50rem]">
          <div className="animate-in-up max-w-xl lg:max-w-[34rem] xl:max-w-[38rem]">
            <Eyebrow tone="dark" icon={Anchor}>
              {ROUTE.originCity} → {ROUTE.destinationCity}
            </Eyebrow>

            <DisplayHeading
              as="h1"
              size="hero"
              tone="dark"
              className="hero-display mt-6"
              lead={t(locale, "Your cargo from China")}
              trail={t(locale, "handled properly")}
            />

            <p className="mt-6 max-w-lg text-base leading-relaxed text-white/75 sm:text-lg">
              {t(locale, "Loose cargo and full containers by sea,")}{" "}
              <span className="tnum">
                {ROUTE.transitDaysMin}–{ROUTE.transitDaysMax}
              </span>{" "}
              {t(
                locale,
                "days from our Guangzhou warehouse to your hands in Dar es Salaam. Counted, weighed, measured and photographed at both ends — and every figure kept."
              )}
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <PillLink href="/quote" tone="accent">
                {t(locale, "Get a quote")}
              </PillLink>
              <PillLink href="/calculator" tone="glass">
                {t(locale, "Work out my CBM")}
              </PillLink>
            </div>

            {figures.length > 0 ? (
              <dl className="mt-10 flex flex-wrap gap-x-10 gap-y-6 border-t border-white/15 pt-7">
                {figures.map(([value, label]) => (
                  <div key={label} className="flex items-baseline gap-3">
                    <dd className="tnum text-3xl font-semibold leading-none sm:text-4xl">
                      {value.toLocaleString("en-US")}
                    </dd>
                    <dt className="max-w-[7rem] text-xs leading-tight text-white/55">
                      {t(locale, label)}
                    </dt>
                  </div>
                ))}
              </dl>
            ) : null}
          </div>
        </div>
      </section>

      {/* --------------------------------------------------------- Track strip */}
      {/* What most visitors came for, given the width of the page rather than a
          corner of the hero. It straddles the seam between the sea and the
          field, so it reads as the first thing you can do rather than a banner. */}
      <section className="relative z-10 border-b bg-field">
        <div className="container -mt-9 pb-14 sm:-mt-11">
          <div className="rounded-3xl border border-white/10 bg-ink p-6 shadow-raised sm:p-8">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <Eyebrow tone="dark" icon={Ship}>
                  {t(locale, "Fuatilia mzigo")}
                </Eyebrow>
                <p className="mt-3 text-xl font-semibold text-white sm:text-2xl">
                  {t(locale, "Where is my shipment?")}
                </p>
                <p className="mt-1.5 text-sm text-white/60">
                  {t(locale, "Enter the reference on your delivery note or box label.")}
                </p>
              </div>
              <div className="w-full lg:max-w-md">
                <TrackForm dark pill />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------ Services */}
      <section className="border-b bg-field py-16 sm:py-20 lg:py-24">
        <div className="container">
          <div className="mx-auto max-w-3xl text-center">
            <DisplayHeading
              lead={t(locale, "Two ways to ship,")}
              trail={t(locale, "one way of working")}
              size="section"
            />
          </div>

          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {SERVICES.map((service, i) => (
              <Link
                key={service.title}
                href={service.href}
                className="focus-ring animate-in-up group block rounded-3xl"
                style={{ animationDelay: `${i * 80}ms` }}
              >
                <PhotoSlot
                  name={service.slot}
                  scrim
                  className="transition-shadow group-hover:shadow-raised"
                >
                  <div className="absolute inset-x-0 top-0 z-10 flex items-start justify-between gap-3 p-5 sm:p-6">
                    <h3 className="max-w-[9em] text-xl font-semibold uppercase leading-[1.05] tracking-[-0.02em] text-white sm:text-2xl">
                      {t(locale, service.title)}
                    </h3>
                    <span className="eyebrow rounded-full border border-white/25 bg-white/10 px-2.5 py-1 text-white/80 backdrop-blur-md">
                      {service.abbr}
                    </span>
                  </div>

                  <div className="absolute inset-x-0 bottom-0 z-10 p-5 sm:p-6">
                    <p className="max-w-xs text-sm leading-relaxed text-white/75">
                      {t(locale, service.body)}
                    </p>
                    <span className="mt-4 inline-flex min-h-11 items-center gap-2.5 rounded-full bg-white px-4 py-2 text-sm font-medium text-ink">
                      {t(locale, service.action)}
                      <ArrowRight className="size-4 transition-transform group-hover:translate-x-1 motion-reduce:group-hover:translate-x-0" />
                    </span>
                  </div>
                </PhotoSlot>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------- Editorial spread */}
      <section className="border-b bg-field py-16 sm:py-20 lg:py-24">
        <div className="container">
          <SectionHead
            eyebrow={t(locale, "What we actually do")}
            lead={t(locale, "Counted in Guangzhou,")}
            trail={t(locale, "counted again in Dar")}
            body={t(
              locale,
              "Both warehouses measure your cargo on their own paperwork and neither figure overwrites the other. You see both, and the difference — which is the only evidence there is of what happened at sea."
            )}
            action={{ href: "/services", label: t(locale, "All services") }}
          />

          {/* One tall picture beside two stacked: the editorial grid. At a phone
              width it unstacks into a single column, tall picture first. */}
          <div className="mt-12 grid gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
            <PhotoSlot name="crane-lift" scrim className="lg:h-full">
              <PhotoCaption label={t(locale, "Loaded")}>
                {t(locale, "Your box, on a ship, with a seal number we recorded.")}
              </PhotoCaption>
            </PhotoSlot>

            <div className="grid gap-4">
              <PhotoSlot name="dar-port" scrim>
                <PhotoCaption label={t(locale, "Arrived")}>
                  {t(locale, "Checked in against what Guangzhou said was on board.")}
                </PhotoCaption>
              </PhotoSlot>
              <PhotoSlot name="dar-delivery" scrim>
                <PhotoCaption label={t(locale, "Released")}>
                  {t(locale, "Handed to the person it is addressed to, once it is settled.")}
                </PhotoCaption>
              </PhotoSlot>
            </div>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            {[
              [Scale, "Measured at both ends", "China and Dar each keep their own weight, count and volume."],
              [Camera, "Photographed on receipt", "You can see the boxes are in our hands long before they reach you."],
              [Ship, "One lane, sailed every month", `${ROUTE.originCity} to ${ROUTE.destinationCity}, ${ROUTE.transitDaysMin}–${ROUTE.transitDaysMax} days at sea.`],
            ].map(([Icon, title, body]) => {
              const I = Icon as typeof Ship;
              return (
                <div
                  key={title as string}
                  className="rounded-2xl border border-field-edge bg-card p-5"
                >
                  <I className="size-5 text-marine" />
                  <p className="mt-3.5 font-semibold">{t(locale, title as string)}</p>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                    {t(locale, body as string)}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ----------------------------------------------------------- The lane */}
      <section className="border-b bg-ink py-16 text-white sm:py-20 lg:py-24">
        <div className="container grid items-center gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          <div>
            <Eyebrow tone="dark" icon={MapPin}>
              {t(locale, "One lane")}
            </Eyebrow>
            <DisplayHeading
              tone="dark"
              size="section"
              className="mt-5"
              lead={t(locale, "Guangzhou to Dar,")}
              trail={t(locale, "and nothing else")}
            />
            <p className="mt-5 max-w-md text-white/70">
              {t(
                locale,
                "We do not ship everywhere. We ship one route, over and over, which is why we know what it costs, when the box closes and where the delays come from."
              )}
            </p>

            <dl className="mt-8 grid max-w-md grid-cols-2 gap-6 border-t border-white/15 pt-7 sm:grid-cols-3">
              {(
                [
                  [`${ROUTE.transitDaysMin}–${ROUTE.transitDaysMax}`, "days at sea"],
                  ["LCL · FCL", "shared or whole"],
                  ["CBM", "how loose cargo is priced"],
                ] as const
              ).map(([value, label]) => (
                <div key={label}>
                  <dd className="tnum text-xl font-semibold">{value}</dd>
                  <dt className="mt-1 text-xs leading-tight text-white/55">
                    {t(locale, label)}
                  </dt>
                </div>
              ))}
            </dl>

            <div className="mt-8">
              <PillLink href="/schedule" tone="glass">
                {t(locale, "Sailing schedule")}
              </PillLink>
            </div>
          </div>

          {/* The lane itself, as a sketch. Named at both ends and nowhere else,
              so nobody is invited to read a position off it. */}
          <RouteScene
            className="h-auto w-full"
            originLabel={ROUTE.originCity}
            destinationLabel={ROUTE.destinationCity}
          />
        </div>
      </section>

      {/* ------------------------------------------------------- How it works */}
      <section className="border-b bg-field py-16 sm:py-20 lg:py-24">
        <div className="container">
          <SectionHead
            eyebrow={t(locale, "How it works")}
            lead={t(locale, "Five steps,")}
            trail={t(locale, "start to finish")}
            body={t(
              locale,
              "Register once and you get a Guangzhou address and a shipping mark of your own. Everything after that follows from what the warehouse measures."
            )}
            action={{ href: "/register", label: t(locale, "Get my shipping mark") }}
          />

          <ol className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {[
              {
                title: "Get your address",
                body: "Register and we give you our Guangzhou warehouse address and your own shipping mark.",
              },
              {
                title: "Your supplier delivers",
                body: "Send the address and mark to your supplier. They deliver straight to our warehouse.",
              },
              {
                title: "We receive and measure",
                body: "We count, weigh, measure and photograph everything, then send you a delivery note.",
              },
              {
                title: "It sails",
                body: "Your cargo is loaded into a container and sails for Dar es Salaam, around a month at sea.",
              },
              {
                title: "Collect or we deliver",
                body: "Settle the invoice and collect from our Dar warehouse, or ask us to deliver.",
              },
            ].map((step, i) => (
              <li
                key={step.title}
                className="rounded-2xl border border-field-edge bg-card p-5"
              >
                <span className="tnum flex size-9 items-center justify-center rounded-full bg-brand text-sm font-semibold text-brand-foreground">
                  {i + 1}
                </span>
                <h3 className="mt-4 font-semibold">{t(locale, step.title)}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                  {t(locale, step.body)}
                </p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ---------------------------------------------------------------- Rates */}
      {rates.length > 0 ? (
        <section className="border-b bg-field py-16 sm:py-20 lg:py-24">
          <div className="container">
            <SectionHead
              eyebrow={t(locale, "What it costs")}
              lead={t(locale, "Published rates,")}
              trail={t(locale, "read from the rate book")}
              body={t(
                locale,
                "The same rows Finance edits, so the figure here is the figure the invoice will use. Each kind of goods is charged at its own rate."
              )}
              action={{ href: "/rates", label: t(locale, "All rates") }}
            />

            <div className="mt-12 grid gap-4 md:grid-cols-3">
              {rates.map((rate) => (
                <Card key={rate.id} className="rounded-3xl border-field-edge p-7">
                  <p className="eyebrow text-muted-foreground">
                    {rate.service === "LCL"
                      ? t(locale, "Loose cargo")
                      : t(locale, "Full container")}
                  </p>
                  <p className="mt-2 text-base font-semibold">{rate.cargoType}</p>
                  <p className="tnum mt-6 text-3xl font-semibold text-brand">
                    {formatMoney(rate.rate, rate.currency)}
                    <span className="ml-1.5 text-base font-medium text-muted-foreground">
                      {rate.basis === "PER_CBM"
                        ? "/ CBM"
                        : rate.basis === "PER_KG"
                          ? "/ kg"
                          : t(locale, "flat")}
                    </span>
                  </p>
                  {rate.minimumCbm ? (
                    <p className="mt-2 text-xs text-muted-foreground">
                      {t(locale, "Minimum")} {Number(rate.minimumCbm).toFixed(2)} CBM
                    </p>
                  ) : null}
                </Card>
              ))}
            </div>

            <p className="mt-6 text-xs text-muted-foreground">
              {t(
                locale,
                "Rates exclude VAT, duty and clearing. Final charges are based on the measurements taken at our warehouse."
              )}
            </p>
          </div>
        </section>
      ) : null}

      {/* ------------------------------------------------------------- Sailings */}
      {sailings.length > 0 ? (
        <section className="border-b bg-field py-16 sm:py-20 lg:py-24">
          <div className="container">
            <SectionHead
              eyebrow={t(locale, "Next out")}
              lead={t(locale, "Upcoming")}
              trail={t(locale, "sailings")}
              body={t(
                locale,
                "Get your cargo to Guangzhou before the deadline and it goes on that boat."
              )}
              action={{ href: "/schedule", label: t(locale, "Full schedule") }}
            />

            <div className="mt-12 grid gap-4 md:grid-cols-3">
              {sailings.map((sailing) => (
                <Card key={sailing.id} className="rounded-3xl border-field-edge p-6">
                  <p className="flex items-center gap-2 text-sm font-medium">
                    <Ship className="size-4 text-marine" />
                    {sailing.vessel ?? t(locale, "Vessel to be confirmed")}
                  </p>
                  <dl className="mt-5 space-y-3 text-sm">
                    {[
                      ["Cargo deadline", formatDate(sailing.cargoDeadline)],
                      ["Departs", formatDate(sailing.departureDate)],
                      ["Arrives", formatDate(sailing.estimatedArrival)],
                    ].map(([label, value]) => (
                      <div key={label} className="flex justify-between gap-3">
                        <dt className="text-muted-foreground">{t(locale, label)}</dt>
                        <dd className="tnum font-medium">{value}</dd>
                      </div>
                    ))}
                  </dl>
                </Card>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {/* ------------------------------------------------------------ Warehouses */}
      <section className="border-b bg-field py-16 sm:py-20 lg:py-24">
        <div className="container">
          <SectionHead
            eyebrow={t(locale, "Where to send your goods")}
            lead={t(locale, "Two warehouses,")}
            trail={t(locale, "one route between them")}
          />

          <div className="mt-12 grid gap-4 lg:grid-cols-2">
            <PhotoSlot name="guangzhou-warehouse" scrim className="lg:order-2 lg:h-full">
              <PhotoCaption label={t(locale, "Guangzhou")}>
                {t(locale, "Where your supplier delivers, and where the measuring starts.")}
              </PhotoCaption>
            </PhotoSlot>

            <div className="grid gap-4 lg:order-1">
              <Card className="rounded-3xl border-field-edge p-6 sm:p-7">
                <p className="flex items-center gap-2 text-sm font-semibold">
                  <MapPin className="size-4 text-signal" />
                  {t(locale, "Guangzhou, China")}
                </p>
                <p className="mt-4 text-lg leading-relaxed">
                  {company?.chinaAddress ?? t(locale, "Address available on request")}
                </p>
                <p className="mt-4 text-sm text-muted-foreground">
                  {t(
                    locale,
                    "Give this address to your supplier along with your shipping mark, and your goods reach us directly."
                  )}
                </p>
                <Button asChild variant="outline" className="mt-6">
                  <Link href="/register">
                    {t(locale, "Get my shipping mark")}
                    <ArrowRight />
                  </Link>
                </Button>
              </Card>

              <Card className="rounded-3xl border-field-edge p-6 sm:p-7">
                <p className="flex items-center gap-2 text-sm font-semibold">
                  <MapPin className="size-4 text-signal" />
                  {t(locale, "Dar es Salaam, Tanzania")}
                </p>
                <p className="mt-4 text-lg leading-relaxed">
                  {company?.darAddress ?? t(locale, "Address available on request")}
                </p>
                <p className="mt-4 text-sm text-muted-foreground">
                  {t(
                    locale,
                    "Collect your cargo here once it has arrived and your invoice is settled — or ask us to deliver it to you."
                  )}
                </p>
                {company?.phone ? (
                  <p className="tnum mt-6 text-sm font-medium">
                    <a href={telHref(company.phone)} className="hover:text-brand">
                      {company.phone}
                    </a>
                    {company.altPhone ? (
                      <>
                        {" · "}
                        <a href={telHref(company.altPhone)} className="hover:text-brand">
                          {company.altPhone}
                        </a>
                      </>
                    ) : null}
                  </p>
                ) : null}
              </Card>
            </div>
          </div>
        </div>
      </section>

      {/* --------------------------------------------------------------- CTA */}
      <section className="bg-ink py-16 text-white sm:py-20 lg:py-24">
        <div className="container text-center">
          <DisplayHeading
            tone="dark"
            size="section"
            className="mx-auto max-w-3xl"
            lead={t(locale, "Ready to ship")}
            trail={t(locale, "from China?")}
          />
          <p className="mx-auto mt-5 max-w-xl text-white/70">
            {t(
              locale,
              "Create an account, get your shipping mark, and send it to your supplier today."
            )}
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <PillLink href="/register" tone="accent">
              {t(locale, "Create an account")}
            </PillLink>
            <PillLink href="/contact" tone="glass">
              {t(locale, "Talk to us")}
            </PillLink>
          </div>
        </div>
      </section>
    </>
  );
}
