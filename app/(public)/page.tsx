import Link from "next/link";
import type { Metadata } from "next";
import {
  ArrowRight,
  ArrowUpRight,
  Calculator,
  Camera,
  CheckCircle2,
  Container,
  MapPin,
  Package,
  Scale,
  Search,
  ShieldCheck,
  Ship,
} from "lucide-react";

import {
  CtaBand,
  Headline,
  Marquee,
  PageHero,
  PhotoFrame,
  SectionHead,
  heroButton,
} from "@/components/site/kit";
import { CountUp, Reveal } from "@/components/site/motion";
import { RouteMap } from "@/components/site/route-map";
import { SailingCard, bookHref } from "@/components/site/sailing-card";
import { PriceCalculator } from "@/components/site/price-calculator";
import { TrackForm } from "@/components/site/track-form";
import { CITIES } from "@/lib/china-guide";
import { ROUTE } from "@/lib/constants";
import { prisma } from "@/lib/prisma";
import { publicRateBook } from "@/lib/public-estimate";
import { ARRIVAL_CAVEAT, publicSailings } from "@/lib/sailing-schedule";
import { DEFAULT_LOCALE, t } from "@/lib/i18n";
import { telHref } from "@/lib/site-contact";

export const metadata: Metadata = {
  title: "Sea freight from China to Tanzania",
  description:
    "Swift Cargo ships loose cargo and full containers from Guangzhou to Dar es Salaam in 28–30 days. Track your cargo, calculate CBM and check your price.",
};

/* The public site is read far more often than it changes, and the rate card is
   the only part that moves. A minute is short enough that a rate published in
   the morning is live by the time a customer rings about it. */
export const revalidate = 60;

export default async function HomePage() {
  const locale = DEFAULT_LOCALE;
  const [company, cargoTypes, sailings, stats] = await Promise.all([
    prisma.companySetting.findUnique({ where: { id: "singleton" } }),
    /* The names of the cargo types only. The rate book is not printed on the
       public site; a price is the answer to "this much of this". */
    publicRateBook("LCL"),
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
  const next = sailings.find((s) => s.bookingOpen) ?? sailings[0];
  const short = (d: Date) =>
    new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(d);

  /* Real counts from the operational record, shown only once there is
     something to count — "0 consignments delivered" on launch day is true and
     tells a visitor the wrong thing. Singular where the count is one. */
  const counts = (
    [
      [customers === 1 ? "Customer" : "Customers", customers],
      [containers === 1 ? "Container shipped" : "Containers shipped", containers],
      [delivered === 1 ? "Consignment delivered" : "Consignments delivered", delivered],
    ] as const
  ).filter(([, value]) => value > 0);

  const facts: [string, string][] = [
    [`${ROUTE.transitDaysMin}–${ROUTE.transitDaysMax}`, "Days at sea"],
    ["1", "Sailing every week"],
    ["2", "Warehouses, one at each end"],
    ...counts.map(([label, value]) => [String(value), label] as [string, string]),
  ];

  return (
    <>
      {/* ---------------------------------------------------------------- Hero */}
      <PageHero
        size="home"
        photo="shipWake"
        lead={t(locale, "Shipping from China to Tanzania,")}
        trail={t(locale, "on time, every time.")}
        body={
          <p>
            {t(locale, "Loose cargo and full containers by sea,")} {ROUTE.transitDaysMin}–
            {ROUTE.transitDaysMax}{" "}
            {t(
              locale,
              "days from our Guangzhou warehouse to Dar es Salaam. Every box counted, weighed, measured and photographed the day it reaches us."
            )}
          </p>
        }
        actions={
          <>
            <Link href="/quote" className={heroButton.primary}>
              {t(locale, "Get a quote")}
              <ArrowRight className="size-4" />
            </Link>
            <Link href="/calculator" className={heroButton.ghost}>
              <Calculator className="size-4" />
              {t(locale, "Price calculator")}
            </Link>
            {/* Tracking, in the hero — it is what most visitors came for. */}
            <div className="mt-4 w-full max-w-xl">
              <p className="mb-2.5 text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-cyan-200">
                {t(locale, "Track your cargo")}
              </p>
              <TrackForm dark pill />
            </div>
          </>
        }
        aside={
          <div className="relative mx-auto w-full max-w-sm lg:ml-auto lg:max-w-[20rem]">
            {next ? (
              <Link
                href={next.bookingOpen ? bookHref(next) : "/schedule"}
                className="site-float group block rounded-3xl bg-white/95 p-5 text-slate-900 shadow-[0_30px_60px_-30px_rgba(0,8,20,0.9)] backdrop-blur"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-slate-500">
                    {t(locale, "Next sailing")}
                  </p>
                  <span className="grid size-7 place-items-center rounded-full bg-slate-900 text-white transition-transform group-hover:rotate-45">
                    <ArrowUpRight className="size-3.5" />
                  </span>
                </div>
                <div className="mt-3 grid grid-cols-[auto_1fr_auto] items-center gap-3">
                  <div>
                    <p className="text-[0.65rem] font-semibold uppercase text-slate-500">
                      {t(locale, "Departs")}
                    </p>
                    <p className="tnum font-display text-lg font-bold">{short(next.departureDate)}</p>
                  </div>
                  <div aria-hidden className="relative h-5">
                    <span className="absolute inset-x-0 top-1/2 border-t-2 border-dashed border-slate-300" />
                    <Ship className="absolute left-1/2 top-1/2 size-5 -translate-x-1/2 -translate-y-1/2 bg-white px-0.5 text-sky-700" />
                  </div>
                  <div className="text-right">
                    <p className="text-[0.65rem] font-semibold uppercase text-slate-500">
                      {t(locale, "Arrives about")}
                    </p>
                    <p className="tnum font-display text-lg font-bold">{short(next.estimatedArrival)}</p>
                  </div>
                </div>
                <p className="mt-3 rounded-xl bg-orange-50 px-3 py-2 text-xs text-orange-800">
                  {t(locale, "Cargo in Guangzhou by")}{" "}
                  <span className="tnum font-semibold">{short(next.cargoDeadline)}</span>
                </p>
              </Link>
            ) : null}
          </div>
        }
      >
        <div className="container relative pb-10">
          <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-3xl border border-white/10 bg-white/10 backdrop-blur-md sm:grid-cols-3 lg:grid-cols-6">
            {facts.slice(0, 6).map(([value, label]) => (
              <div key={label} className="flex flex-col-reverse bg-ink/50 px-5 py-5">
                <dt className="mt-1 text-xs text-white/60">{t(locale, label)}</dt>
                <dd className="tnum font-display text-3xl font-extrabold tracking-tight">
                  {/^\d+$/.test(value) ? <CountUp value={Number(value)} /> : value}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </PageHero>

      <Marquee
        className="bg-background text-foreground/85"
        items={[
          "Guangzhou",
          "Dar es Salaam",
          t(locale, "Loose cargo"),
          t(locale, "Full containers"),
          t(locale, "China sourcing"),
          t(locale, "Weekly sailings"),
          t(locale, "Factory pickup"),
        ]}
      />

      {/* ---------------------------------------------------------- Who we are */}
      <section className="container grid items-center gap-14 py-20 sm:py-28 lg:grid-cols-2">
        <Reveal className="relative pb-16 sm:pb-20">
          <PhotoFrame name="portYard" className="aspect-[4/5] rounded-[2rem] sm:aspect-square" />
          <PhotoFrame
            name="warehouseForklift"
            sizes="(max-width: 768px) 60vw, 25vw"
            className="absolute -bottom-2 right-0 aspect-square w-[52%] rounded-[1.6rem] border-[6px] border-background shadow-raised"
          />
          <div className="site-float absolute left-4 top-6 rounded-2xl bg-card/95 p-4 shadow-raised backdrop-blur sm:left-6">
            <p className="tnum font-display text-3xl font-extrabold text-brand">
              {ROUTE.transitDaysMin}–{ROUTE.transitDaysMax}
            </p>
            <p className="text-xs font-medium text-muted-foreground">{t(locale, "days at sea")}</p>
          </div>
        </Reveal>

        <div>
          <SectionHead
            lead={t(locale, "One sea route,")}
            trail={t(locale, "run properly from end to end.")}
            body={t(
              locale,
              "Swift Cargo ships goods by sea from China to Tanzania for traders and businesses. We receive in Guangzhou, load, sail, clear and hand over in Dar es Salaam — one company holding your goods the whole way."
            )}
          />
          <ul className="mt-9 grid gap-4 sm:grid-cols-2">
            {(
              [
                [Scale, "Measured at both ends", "Guangzhou and Dar each weigh and measure, and both figures are kept."],
                [Camera, "Photographed on arrival", "See your boxes are in our hands long before they reach you."],
                [ShieldCheck, "Released to the right person", "Only once the bill is settled, and only to the receiver."],
                [MapPin, "Tracked the whole way", "One reference from the warehouse floor to your hands."],
              ] as const
            ).map(([Icon, title, body], i) => (
              <Reveal as="li" key={title} delay={i * 80} className="rounded-2xl border bg-card p-5">
                <span className="grid size-10 place-items-center rounded-xl bg-brand text-brand-foreground">
                  <Icon className="size-5" />
                </span>
                <p className="mt-4 font-semibold">{t(locale, title)}</p>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{t(locale, body)}</p>
              </Reveal>
            ))}
          </ul>
          <Link href="/about" className={`${heroButton.outline} mt-9`}>
            {t(locale, "More about us")}
            <ArrowRight className="size-4" />
          </Link>
        </div>
      </section>

      {/* ------------------------------------------------------------ Services */}
      <section className="bg-surface-2 py-20 sm:py-28">
        <div className="container">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <SectionHead
              lead={t(locale, "Two ways to ship,")}
              trail={t(locale, "and help finding what to ship.")}
            />
            <Link href="/services" className={heroButton.outline}>
              {t(locale, "All services")}
              <ArrowRight className="size-4" />
            </Link>
          </div>

          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {(
              [
                {
                  photo: "containerStack",
                  icon: Package,
                  tag: "LCL",
                  title: "Loose cargo",
                  body: "Share a container and pay only for the space you use, by the cubic metre.",
                  href: "/book?service=SHARED_CARGO",
                },
                {
                  photo: "craneLift",
                  icon: Container,
                  tag: "FCL",
                  title: "Full container",
                  body: "A whole 20ft, 40ft or high cube to yourself, sealed at the factory or at our warehouse.",
                  href: "/book?service=FULL_CONTAINER",
                },
                {
                  photo: "guangzhouNight",
                  icon: Search,
                  tag: "Sourcing",
                  title: "China sourcing",
                  body: "We find suppliers, check the goods before they load and consolidate them into one shipment.",
                  href: "/china",
                },
              ] as const
            ).map((service, i) => (
              <Reveal key={service.title} delay={i * 100}>
                <Link href={service.href} className="focus-ring block rounded-[2rem]">
                  <PhotoFrame
                    name={service.photo}
                    sizes="(max-width: 768px) 100vw, 33vw"
                    className="h-[30rem] rounded-[2rem]"
                  >
                    <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/40 to-transparent" />
                    <span className="absolute left-5 top-5 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold text-white backdrop-blur-md">
                      {service.tag}
                    </span>
                    <span className="absolute right-5 top-5 grid size-11 place-items-center rounded-full bg-white text-slate-900 transition-transform duration-500 group-hover:rotate-45">
                      <ArrowUpRight className="size-5" />
                    </span>
                    <div className="absolute inset-x-0 bottom-0 p-7 text-white">
                      <service.icon className="size-7 text-cyan-300" />
                      <p className="mt-4 font-display text-3xl font-bold tracking-tight">
                        {t(locale, service.title)}
                      </p>
                      <p className="mt-2 text-sm leading-relaxed text-white/75">{t(locale, service.body)}</p>
                    </div>
                  </PhotoFrame>
                </Link>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------ Explore China */}
      <section className="container py-20 sm:py-28">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <SectionHead
            lead={t(locale, "Where the world's goods")}
            trail={t(locale, "are made and sold.")}
            body={t(
              locale,
              "Guangzhou's markets, Yiwu's small goods, Shenzhen's electronics, Foshan's furniture. Find where to buy what you sell — we bring it home."
            )}
          />
          <Link href="/china" className={heroButton.outline}>
            {t(locale, "Explore all")}
            <ArrowRight className="size-4" />
          </Link>
        </div>
        <ul className="mt-12 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
          {CITIES.slice(0, 5).map((city, i) => (
            <Reveal as="li" key={city.slug} delay={i * 80} className={i === 0 ? "col-span-2 md:col-span-1" : undefined}>
              <Link href="/china" className="focus-ring block rounded-[1.75rem]">
                <PhotoFrame
                  name={city.photo}
                  sizes="(max-width: 768px) 50vw, 20vw"
                  className="aspect-[3/4] rounded-[1.75rem]"
                >
                  <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/20 to-transparent" />
                  <div className="absolute inset-x-0 bottom-0 p-4 text-white sm:p-5">
                    <p className="font-display text-xl font-bold tracking-tight sm:text-2xl">{city.name}</p>
                    <p className="mt-0.5 text-xs text-white/75 sm:text-sm">{t(locale, city.tagline)}</p>
                  </div>
                  <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-1 text-[0.7rem] font-semibold text-white backdrop-blur-md">
                    <MapPin className="size-3" />
                    {city.where}
                  </span>
                </PhotoFrame>
              </Link>
            </Reveal>
          ))}
        </ul>
      </section>

      {/* ---------------------------------------------------------- The route */}
      <section className="relative isolate overflow-hidden bg-ink py-20 text-white sm:py-28">
        <div
          aria-hidden
          className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_80%_20%,hsl(var(--marine)/0.25),transparent_55%),radial-gradient(ellipse_at_0%_100%,hsl(var(--signal)/0.18),transparent_50%)]"
        />
        <div className="container grid items-center gap-14 lg:grid-cols-[0.9fr_1.1fr]">
          <div>
            <SectionHead
              dark
              lead={t(locale, "Five steps,")}
              trail={t(locale, "factory to your shop.")}
            />
            <ol className="mt-10 space-y-3">
              {[
                ["Get your address", "Register and we give you our Guangzhou address and your own shipping mark."],
                ["Your supplier delivers", "They deliver straight to our warehouse with your mark on every box."],
                ["We receive and measure", "Counted, weighed, measured and photographed, and you get a delivery note."],
                ["It sails", "Packed into a container on Friday, sails on Monday, about a month at sea."],
                ["Collect or we deliver", "Settle the invoice and collect in Dar, or ask us to bring it to you."],
              ].map(([title, body], i) => (
                <Reveal
                  as="li"
                  key={title}
                  delay={i * 90}
                  className="flex gap-5 rounded-2xl border border-white/10 bg-white/[0.04] p-5 transition-colors hover:bg-white/[0.08]"
                >
                  <span className="tnum grid size-11 shrink-0 place-items-center rounded-full bg-gradient-to-br from-signal to-orange-600 font-display text-lg font-bold">
                    {i + 1}
                  </span>
                  <span>
                    <span className="block font-semibold">{t(locale, title)}</span>
                    <span className="mt-1 block text-sm leading-relaxed text-white/65">{t(locale, body)}</span>
                  </span>
                </Reveal>
              ))}
            </ol>
          </div>
          <Reveal>
            <div className="rounded-[2rem] border border-white/10 bg-white/[0.03] p-4 sm:p-8">
              <RouteMap />
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-5 text-sm">
                <span className="flex items-center gap-2 text-white/70">
                  <Ship className="size-4 text-cyan-300" />
                  {t(locale, "South China Sea · Malacca · Indian Ocean")}
                </span>
                <span className="tnum font-display text-lg font-bold">
                  {ROUTE.transitDaysMin}–{ROUTE.transitDaysMax} {t(locale, "days")}
                </span>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ------------------------------------------------------------- Sailings */}
      {sailings.length > 0 ? (
        <section className="container py-20 sm:py-28">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <SectionHead
              lead={t(locale, "A ship every Monday.")}
              trail={t(locale, "Cargo in by Friday.")}
            />
            <Link href="/schedule" className={heroButton.outline}>
              {t(locale, "Full schedule")}
              <ArrowRight className="size-4" />
            </Link>
          </div>
          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {sailings.map((sailing, i) => (
              <Reveal key={sailing.key} delay={i * 100}>
                <SailingCard sailing={sailing} />
              </Reveal>
            ))}
          </div>
          <p className="mt-6 text-xs text-muted-foreground">{t(locale, ARRIVAL_CAVEAT)}</p>
        </section>
      ) : null}

      {/* ------------------------------------------------------- Price check */}
      <section className="bg-surface-2 py-20 sm:py-28">
        <div className="container">
          <SectionHead
            lead={t(locale, "What will my shipping cost?")}
            trail={t(locale, "Find out in seconds.")}
            body={t(locale, "Choose your goods, enter your CBM or your box sizes, and your price appears.")}
          />
          <Reveal className="mt-12">
            <PriceCalculator cargoTypes={cargoTypes.map((r) => r.cargoType)} />
          </Reveal>
        </div>
      </section>

      {/* ---------------------------------------------------- Who we ship for */}
      <section className="container grid items-center gap-14 py-20 sm:py-28 lg:grid-cols-2">
        <div className="lg:order-2">
          <SectionHead
            lead={t(locale, "Shops, wholesalers and importers")}
            trail={t(locale, "across Tanzania.")}
            body={t(
              locale,
              "Register once and you get your own shipping mark. Every box your suppliers send us is recorded under your name, and you can follow it from your phone."
            )}
          />
          <ul className="mt-8 space-y-3">
            {[
              "Your own shipping mark and account",
              "Delivery note and photographs when your goods arrive",
              "Invoices in shillings, with the rate fixed on the day",
              "Collect in Dar es Salaam or ask us to deliver",
            ].map((line, i) => (
              <Reveal as="li" key={line} delay={i * 70} className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-signal" />
                <span>{t(locale, line)}</span>
              </Reveal>
            ))}
          </ul>
          <div className="mt-9 flex flex-wrap gap-3">
            <Link href="/register" className={heroButton.solid}>
              {t(locale, "Get my shipping mark")}
              <ArrowRight className="size-4" />
            </Link>
            <Link href="/pickup" className={heroButton.outline}>
              {t(locale, "Request a pickup in China")}
            </Link>
          </div>
        </div>
        <Reveal className="grid grid-cols-5 gap-4 lg:order-1">
          <PhotoFrame name="traderShop" className="col-span-3 aspect-[3/4] rounded-[2rem]" />
          <div className="col-span-2 grid gap-4">
            <PhotoFrame name="traderPhone" sizes="25vw" className="aspect-square rounded-[1.6rem]" />
            <PhotoFrame name="traderDoor" sizes="25vw" className="aspect-[4/5] rounded-[1.6rem]" />
          </div>
        </Reveal>
      </section>

      {/* ------------------------------------------------------------ Warehouses */}
      <section className="bg-surface-2 py-20 sm:py-28">
        <div className="container">
          <SectionHead
            lead={t(locale, "A warehouse at each end")}
            trail={t(locale, "of the voyage.")}
          />
          <div className="mt-12 grid gap-6 md:grid-cols-2">
            {(
              [
                {
                  photo: "guangzhouDusk",
                  place: "Guangzhou, China",
                  address: company?.chinaAddress,
                  note: "Give this address to your supplier along with your shipping mark.",
                  href: "/china",
                  cta: "Warehouse address",
                },
                {
                  photo: "portCranes",
                  place: "Dar es Salaam, Tanzania",
                  address: company?.darAddress,
                  note: "Collect here once your cargo has arrived and the invoice is settled.",
                  href: "/contact",
                  cta: "Visit or call us",
                },
              ] as const
            ).map((site, i) => (
              <Reveal key={site.place} delay={i * 100}>
                <PhotoFrame name={site.photo} className="min-h-[26rem] rounded-[2rem]">
                  <div className="absolute inset-0 bg-gradient-to-t from-ink/95 via-ink/40 to-transparent" />
                  <div className="absolute inset-x-0 bottom-0 p-7 text-white sm:p-9">
                    <p className="flex items-center gap-2 text-sm font-semibold text-cyan-200">
                      <MapPin className="size-4" />
                      {t(locale, site.place)}
                    </p>
                    <p className="mt-3 max-w-md text-lg leading-relaxed">
                      {site.address ?? t(locale, "Address available on request")}
                    </p>
                    <p className="mt-2 max-w-md text-sm text-white/65">{t(locale, site.note)}</p>
                    <Link href={site.href} className={`${heroButton.ghost} mt-6 h-10 px-5`}>
                      {t(locale, site.cta)}
                      <ArrowRight className="size-4" />
                    </Link>
                  </div>
                </PhotoFrame>
              </Reveal>
            ))}
          </div>
          {company?.phone ? (
            <p className="tnum mt-6 text-sm text-muted-foreground">
              {t(locale, "Call us")}:{" "}
              <a href={telHref(company.phone)} className="font-semibold text-foreground hover:text-brand">
                {company.phone}
              </a>
              {company.altPhone ? (
                <>
                  {" · "}
                  <a href={telHref(company.altPhone)} className="font-semibold text-foreground hover:text-brand">
                    {company.altPhone}
                  </a>
                </>
              ) : null}
            </p>
          ) : null}
        </div>
      </section>

      <CtaBand
        lead={t(locale, "Ready to ship from China?")}
        trail={t(locale, "Start today.")}
        body={t(locale, "Create an account, get your shipping mark, and send it to your supplier.")}
        actions={
          <>
            <Link href="/register" className={heroButton.primary}>
              {t(locale, "Create an account")}
              <ArrowRight className="size-4" />
            </Link>
            <Link href="/contact" className={heroButton.ghost}>
              {t(locale, "Talk to us")}
            </Link>
          </>
        }
      />
    </>
  );
}
