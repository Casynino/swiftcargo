import Link from "next/link";
import type { Metadata } from "next";
import {
  ArrowRight,
  Calculator,
  Container,
  Anchor,
  MapPin,
  Package,
  Search,
  ShieldCheck,
  Ship,
  Warehouse,
} from "lucide-react";

import { DisplayHeading } from "@/components/site/display";
import { TrackForm } from "@/components/site/track-form";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ROUTE } from "@/lib/constants";
import { prisma } from "@/lib/prisma";
import { ARRIVAL_CAVEAT, publicSailings } from "@/lib/sailing-schedule";
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
    /* The weekly rule, not a table somebody has to remember to extend. See
       lib/sailing-schedule.ts. */
    publicSailings({ count: 3 }),
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

  return (
    <>
      {/* ---------------------------------------------------------------- Hero */}
      <section className="relative overflow-hidden bg-ink text-white">
        <div
          aria-hidden
          className="absolute inset-0 bg-[radial-gradient(ellipse_at_75%_10%,hsl(var(--signal)/0.30),transparent_55%),radial-gradient(ellipse_at_10%_90%,hsl(var(--marine)/0.28),transparent_55%)]"
        />
        <div
          aria-hidden
          className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-marine/50 to-transparent"
        />

        <div className="container relative grid gap-12 py-20 lg:grid-cols-2 lg:py-28">
          <div className="animate-in-up">
            <p className="eyebrow inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-marine">
              <Anchor className="size-3.5" />
              {ROUTE.originCity} → {ROUTE.destinationCity}
            </p>

            <h1 className="mt-6 text-4xl font-semibold leading-[1.08] tracking-tight sm:text-5xl lg:text-6xl">
              {t(locale, "Your cargo from China,")}
              <span className="block text-marine">{t(locale, "handled properly.")}</span>
            </h1>

            <p className="mt-6 max-w-xl text-lg leading-relaxed text-white/70">
              {t(locale, "Loose cargo and full containers by sea,")}{" "}
              {ROUTE.transitDaysMin}–{ROUTE.transitDaysMax}{" "}
              {t(
                locale,
                "days from our Guangzhou warehouse to your hands in Dar es Salaam. Every consignment counted, weighed, measured and photographed when it arrives — so you always know where your goods are."
              )}
            </p>

            <div className="mt-9 flex flex-wrap gap-3">
              <Button asChild size="lg" variant="accent">
                <Link href="/quote">
                  {t(locale, "Get a quote")}
                  <ArrowRight />
                </Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="border-white/25 bg-transparent text-white hover:bg-white/10 hover:text-white"
              >
                <Link href="/calculator">
                  <Calculator />
                  {t(locale, "Work out my CBM")}
                </Link>
              </Button>
            </div>

            {/* Real counts from the operational record, shown only once there
                is something to count — "0 consignments delivered" on launch day
                is true and tells a visitor the wrong thing. */}
            {stats.some((value) => value > 0) ? (
              <dl className="mt-12 grid max-w-lg grid-cols-3 gap-6 border-t border-white/10 pt-8">
                {/* Singular where the count is one. "1 Containers shipped" is
                    the sentence of a database, not of a shipping line. */}
                {(
                  [
                    [customers === 1 ? "Customer" : "Customers", customers],
                    [
                      containers === 1 ? "Container shipped" : "Containers shipped",
                      containers,
                    ],
                    [
                      delivered === 1
                        ? "Consignment delivered"
                        : "Consignments delivered",
                      delivered,
                    ],
                  ] as const
                )
                  .filter(([, value]) => value > 0)
                  .map(([label, value]) => (
                    <div key={label}>
                      <dt className="text-xs text-white/50">{t(locale, label)}</dt>
                      <dd className="tnum mt-1 text-2xl font-semibold">
                        {value.toLocaleString("en-US")}
                      </dd>
                    </div>
                  ))}
              </dl>
            ) : null}
          </div>

          {/* Tracking, front and centre — it is what most visitors came for. */}
          <div className="animate-in-up lg:pl-8" style={{ animationDelay: "120ms" }}>
            <Card className="border-white/10 bg-white/[0.06] p-7 backdrop-blur">
              <p className="eyebrow text-marine">{t(locale, "Track your cargo")}</p>
              <h2 className="mt-2 text-xl font-semibold text-white">
                {t(locale, "Where is my shipment?")}
              </h2>
              <p className="mt-2 text-sm text-white/60">
                {t(locale, "Enter the reference on your delivery note or box label.")}
              </p>
              <div className="mt-5">
                <TrackForm dark />
              </div>

              <div className="mt-7 space-y-3 border-t border-white/10 pt-6">
                {[
                  [Warehouse, "Received and photographed in Guangzhou"],
                  [Ship, `${ROUTE.transitDaysMin}–${ROUTE.transitDaysMax} ${t(locale, "days at sea")}`],
                  [ShieldCheck, "Released only when everything is settled"],
                ].map(([Icon, text], i) => {
                  const I = Icon as typeof Ship;
                  return (
                    <p
                      key={i}
                      className="flex items-center gap-3 text-sm text-white/70"
                    >
                      <I className="size-4 shrink-0 text-marine" />
                      {t(locale, text as string)}
                    </p>
                  );
                })}
              </div>
            </Card>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------ Services */}
      <section className="container py-20">
        <p className="eyebrow text-marine">{t(locale, "What we do")}</p>
        <DisplayHeading
          className="mt-2 max-w-2xl text-3xl font-semibold tracking-tight"
          lead={t(locale, "Two ways to ship,")}
          trail={t(locale, "one way of working")}
        />

        <div className="mt-10 grid gap-6 md:grid-cols-3">
          {[
            {
              icon: Package,
              title: "Loose cargo (LCL)",
              body:
                "Your goods share a container with other customers and you pay for the space you use, by the cubic metre. Best for anything under a few cubic metres.",
              points: ["Priced per CBM", "Charged on what our warehouse measures", "Consolidated in Guangzhou"],
            },
            {
              icon: Container,
              title: "Full container (FCL)",
              body:
                "A whole 20ft or 40ft container to yourself, sealed at the factory or at our warehouse. Best when you are filling most of a box.",
              points: ["20ft, 40ft and 40ft HQ", "Flat price per container", "Door pickup available"],
            },
            {
              icon: Search,
              title: "China sourcing",
              body:
                "Cannot find a supplier, or want somebody to check the goods before they ship? We buy, inspect and consolidate on your behalf in Guangzhou.",
              points: ["Supplier search", "Quality check before loading", "Consolidation"],
            },
          ].map((service, i) => (
            <Card
              key={service.title}
              className="animate-in-up group p-7 transition-all hover:-translate-y-1 hover:shadow-raised"
              style={{ animationDelay: `${i * 90}ms` }}
            >
              <span className="grid size-11 place-items-center rounded-xl bg-brand/10 text-brand transition-colors group-hover:bg-brand group-hover:text-brand-foreground">
                <service.icon className="size-5" />
              </span>
              <h3 className="mt-5 text-lg font-semibold">{t(locale, service.title)}</h3>
              <p className="mt-2.5 text-sm leading-relaxed text-muted-foreground">
                {t(locale, service.body)}
              </p>
              <ul className="mt-5 space-y-2">
                {service.points.map((point) => (
                  <li
                    key={point}
                    className="flex items-center gap-2 text-sm text-muted-foreground"
                  >
                    <span className="size-1.5 rounded-full bg-marine" />
                    {t(locale, point)}
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      </section>

      {/* ----------------------------------------------------------- How it works */}
      <section className="border-y bg-surface-2 py-20">
        <div className="container">
          <p className="eyebrow text-marine">{t(locale, "How it works")}</p>
          <DisplayHeading
            className="mt-2 text-3xl font-semibold tracking-tight"
            lead={t(locale, "Five steps,")}
            trail={t(locale, "start to finish")}
          />

          <ol className="mt-12 grid gap-8 md:grid-cols-5">
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
              <li key={step.title} className="relative">
                <span className="tnum flex size-9 items-center justify-center rounded-full bg-brand text-sm font-semibold text-brand-foreground">
                  {i + 1}
                </span>
                {i < 4 ? (
                  <span
                    aria-hidden
                    className="absolute left-9 top-4 hidden h-px w-[calc(100%-2.25rem)] bg-border md:block"
                  />
                ) : null}
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
        <section className="container py-20">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="eyebrow text-marine">{t(locale, "What it costs")}</p>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight">
                {t(locale, "Current shipping rates")}
              </h2>
            </div>
            <Button asChild variant="outline">
              <Link href="/rates">
                {t(locale, "All rates")}
                <ArrowRight />
              </Link>
            </Button>
          </div>

          <div className="mt-10 grid gap-6 md:grid-cols-3">
            {rates.map((rate) => (
              <Card key={rate.id} className="p-7">
                <p className="eyebrow text-muted-foreground">
                  {rate.service === "LCL" ? t(locale, "Loose cargo") : t(locale, "Full container")}
                </p>
                <p className="mt-2 text-base font-semibold">
                  {rate.cargoType}
                </p>
                <p className="tnum mt-5 text-3xl font-semibold text-brand">
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
        </section>
      ) : null}

      {/* ------------------------------------------------------------- Sailings */}
      {sailings.length > 0 ? (
        <section className="border-t bg-surface-2 py-20">
          <div className="container">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="eyebrow text-marine">{t(locale, "Next out")}</p>
                <h2 className="mt-2 text-3xl font-semibold tracking-tight">
                  {t(locale, "Upcoming sailings")}
                </h2>
              </div>
              <Button asChild variant="outline">
                <Link href="/schedule">
                  {t(locale, "Full schedule")}
                  <ArrowRight />
                </Link>
              </Button>
            </div>

            <div className="mt-10 grid gap-4 md:grid-cols-3">
              {sailings.map((sailing) => (
                <Card key={sailing.weekOf.toISOString()} className="p-6">
                  <p className="flex items-center gap-2 text-sm font-medium">
                    <Ship className="size-4 text-marine" />
                    {sailing.vessel ?? t(locale, "Vessel to be confirmed")}
                  </p>
                  <dl className="mt-5 space-y-3 text-sm">
                    {[
                      ["Last day for cargo", formatDate(sailing.cargoDeadline)],
                      ["Container packed", formatDate(sailing.loadingDate)],
                      ["Departs China", formatDate(sailing.departureDate)],
                      ["Estimated arrival", formatDate(sailing.estimatedArrival)],
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
            <p className="mt-6 text-xs text-muted-foreground">
              {t(locale, ARRIVAL_CAVEAT)}
            </p>
          </div>
        </section>
      ) : null}

      {/* ------------------------------------------------------------ Warehouses */}
      <section className="container py-20">
        <p className="eyebrow text-marine">{t(locale, "Where to send your goods")}</p>
        <h2 className="mt-2 text-3xl font-semibold tracking-tight">
          {t(locale, "Our warehouses")}
        </h2>

        <div className="mt-10 grid gap-6 md:grid-cols-2">
          <Card className="p-7">
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
                "Give this address to your supplier along with your shipping mark. Register for an account and we will generate your mark automatically."
              )}
            </p>
            <Button asChild variant="outline" className="mt-6">
              <Link href="/register">
                {t(locale, "Get my shipping mark")}
                <ArrowRight />
              </Link>
            </Button>
          </Card>

          <Card className="p-7">
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
      </section>

      {/* --------------------------------------------------------------- CTA */}
      <section className="border-t bg-ink py-20 text-white">
        <div className="container text-center">
          <h2 className="mx-auto max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">
            {t(locale, "Ready to ship from China?")}
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-white/70">
            {t(locale, "Create an account, get your shipping mark, and send it to your supplier today.")}
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button asChild size="lg" variant="accent">
              <Link href="/register">
                {t(locale, "Create an account")}
                <ArrowRight />
              </Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="border-white/25 bg-transparent text-white hover:bg-white/10 hover:text-white"
            >
              <Link href="/contact">{t(locale, "Talk to us")}</Link>
            </Button>
          </div>
        </div>
      </section>
    </>
  );
}
