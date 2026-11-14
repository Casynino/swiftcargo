import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { ArrowUpRight, Calculator, Check, MapPin } from "lucide-react";

import { Btn, CtaBand, Eyebrow, PhotoFrame, SectionHead, Ticker } from "@/components/site/kit";
import { CountUp, Reveal, ScrollVar, ScrollWords } from "@/components/site/motion";
import { PHOTOS } from "@/components/site/photos";
import { NextSailingStrip, SailingCard } from "@/components/site/sailing-card";
import { PriceCalculator } from "@/components/site/price-calculator";
import { TrackForm } from "@/components/site/track-form";
import { CITIES } from "@/lib/china-guide";
import { ROUTE } from "@/lib/constants";
import { prisma } from "@/lib/prisma";
import { publicRateBook } from "@/lib/public-estimate";
import { ARRIVAL_CAVEAT_SW, publicSailings } from "@/lib/sailing-schedule";
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

const SERVICES = [
  {
    photo: "containerStack",
    tag: "LCL",
    title: "Loose cargo",
    body: "Share a container with other customers. Pay only for the cubic metres you use.",
    points: ["From one carton", "Priced per CBM", "Every Monday"],
    href: "/book?service=SHARED_CARGO",
  },
  {
    photo: "craneLift",
    tag: "FCL",
    title: "Full container",
    body: "A whole 20ft, 40ft or high cube, loaded for you alone and sealed in Guangzhou.",
    points: ["20ft · 40ft · 40HC", "Sealed at loading", "One owner"],
    href: "/book?service=FULL_CONTAINER",
  },
  {
    photo: "guangzhouNight",
    tag: "Sourcing",
    title: "China sourcing",
    body: "We find suppliers, check the goods and bring them to our warehouse before they load.",
    points: ["Supplier search", "Goods checked", "Paid safely"],
    href: "/china",
  },
] as const;

const STEPS = [
  ["Get your address", "Register. We give you our Guangzhou address and your own shipping mark."],
  ["Your supplier delivers", "They bring the goods to our warehouse with your mark on every box."],
  ["We receive and measure", "Counted, weighed, measured and photographed. You get a delivery note."],
  ["It sails", "Packed on Friday, sails on Monday, about a month at sea."],
  ["Collect or we deliver", "Pay the invoice and collect in Dar es Salaam, or we bring it to you."],
] as const;

export default async function HomePage() {
  const locale = DEFAULT_LOCALE;
  const [company, cargoTypes, sailings] = await Promise.all([
    prisma.companySetting.findUnique({ where: { id: "singleton" } }),
    /* The names of the cargo types only. The rate book is not printed on the
       public site; a price is the answer to "this much of this". */
    publicRateBook("LCL"),
    /* The weekly rule, not a table somebody has to remember to extend. See
       lib/sailing-schedule.ts. */
    publicSailings({ count: 3 }),
  ]);

  const next = sailings.find((s) => s.bookingOpen) ?? sailings[0];

  return (
    <>
      {/* The first visit to the home page in a session opens on the mark and the route (globals.css .sc-intro). */}
      <script
        dangerouslySetInnerHTML={{
          __html:
            "try{if(sessionStorage.getItem('sc-intro'))document.documentElement.setAttribute('data-sc-intro','');sessionStorage.setItem('sc-intro','1')}catch(e){}",
        }}
      />
      <div aria-hidden className="sc-intro">
        <div className="text-center">
          <p className="sc-intro-word sc-title text-[2.4rem] text-white sm:text-7xl">Swift Cargo</p>
          <div className="mx-auto mt-5 h-px w-48 bg-white/15 sm:w-72">
            <div className="sc-intro-bar h-px bg-signal" />
          </div>
          <p className="sc-intro-word sc-label mt-4 text-white/50 [animation-delay:0.35s]">
            {ROUTE.originCity} → {ROUTE.destinationCity}
          </p>
        </div>
      </div>

      {/* ---------------------------------------------------------------- Hero */}
      <ScrollVar as="section" mode="leave" className="relative isolate overflow-hidden text-white">
        <div aria-hidden className="sc-fade-b absolute inset-0 -z-10 overflow-hidden">
          <div className="sc-hero-photo absolute inset-0">
            <Image src={PHOTOS.shipWake.src} alt="" fill priority placeholder="blur" sizes="100vw" className="object-cover" />
          </div>
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(3,10,19,0.7)_0%,rgba(3,10,19,0.15)_25%,rgba(3,10,19,0.3)_48%,rgba(3,10,19,0.9)_78%,hsl(var(--background))_100%)]" />
        </div>

        <div className="container flex min-h-[100svh] flex-col justify-end pb-10 pt-28 sm:pb-16">
          <div className="sc-hero-fade grid items-end gap-10 lg:grid-cols-[1fr_auto]">
            <div className="min-w-0">
              <Eyebrow className="mb-6 text-white [text-shadow:0_1px_12px_rgba(0,0,0,0.6)]">{t(locale, "Sea freight · Every Monday")}</Eyebrow>
              <h1 className="sc-title text-[2.75rem] leading-[0.9] sm:text-[5.5rem] lg:text-[7.4rem]">
                <span className="split-w">
                  <span className="split-i animate-in-up">{t(locale, "China to")}</span>
                </span>
                <br />
                <span className="split-w">
                  <span className="split-i animate-in-up [animation-delay:120ms]">{t(locale, "Tanzania.")}</span>
                </span>
              </h1>
              <p className="sc-title sc-stroke animate-in-up mt-3 text-[1.6rem] [animation-delay:240ms] sm:text-5xl lg:text-6xl">
                {t(locale, "On time, every time.")}
              </p>
              <p className="animate-in-up mt-6 max-w-md text-[15px] leading-relaxed text-white/70 [animation-delay:320ms] sm:text-lg">
                {t(locale, "Loose cargo or a full container, by sea, from Guangzhou to Dar es Salaam.")}
              </p>
              <div className="animate-in-up mt-7 flex flex-wrap gap-3 [animation-delay:400ms]">
                <Btn href="/quote">{t(locale, "Get a quote")}</Btn>
                <Btn href="/calculator" tone="line" icon={Calculator}>
                  {t(locale, "Price calculator")}
                </Btn>
              </div>
            </div>

            {/* Tracking, in the hero — it is what most visitors came for. */}
            <div className="animate-in-up w-full [animation-delay:480ms] lg:w-[25rem]">
              <p className="sc-label mb-3 text-white/55">{t(locale, "Track your cargo")}</p>
              <TrackForm dark pill />
            </div>
          </div>
        </div>
      </ScrollVar>

      {next ? <NextSailingStrip sailing={next} /> : null}

      <Ticker words={[ROUTE.originCity, t(locale, "Loose cargo"), ROUTE.destinationCity, t(locale, "Full container"), t(locale, "China sourcing"), t(locale, "Every Monday")]} />

      {/* ---------------------------------------------------------- Who we are */}
      <section className="container pb-20 pt-8 sm:pb-32 sm:pt-16">
        <Eyebrow index="01">{t(locale, "Who we are")}</Eyebrow>
        <ScrollWords
          text={t(
            locale,
            "One company holds your goods from Guangzhou to Dar es Salaam. Received, measured, photographed, shipped, cleared and handed over to you."
          )}
          accent={["measured", "photographed", "you"]}
          className="mt-8 max-w-6xl font-display text-[1.7rem] font-semibold leading-[1.12] tracking-[-0.02em] text-white sm:text-5xl lg:text-[4rem]"
        />

        <dl className="mt-16 grid grid-cols-2 border-t border-white/10 sm:mt-24 lg:grid-cols-4">
          {(
            [
              [<><span>{ROUTE.transitDaysMin}–</span><CountUp value={ROUTE.transitDaysMax} /></>, "Days at sea, Guangzhou to Dar"],
              [t(locale, "Mon"), "A ship leaves every week"],
              [t(locale, "Fri"), "Last day to receive cargo"],
              [<>2<span className="text-signal">×</span></>, "Measured, in China and in Dar"],
            ] as const
          ).map(([value, label], i) => (
            <Reveal
              key={label}
              delay={i * 90}
              className="border-b border-white/10 py-7 pr-4 odd:border-r sm:py-10 lg:border-b-0 lg:border-r lg:px-8 lg:first:pl-0 lg:last:border-r-0"
            >
              <dt className="sr-only">{t(locale, label)}</dt>
              <dd>
                <span className="sc-title tnum block text-[2.4rem] text-white sm:text-6xl">{value}</span>
                <span className="mt-3 block text-[13px] leading-snug text-white/55 sm:text-sm">{t(locale, label)}</span>
              </dd>
            </Reveal>
          ))}
        </dl>
      </section>

      {/* ------------------------------------------------------------ Services */}
      <section className="pb-20 sm:pb-32">
        <div className="container">
          <SectionHead
            eyebrow={t(locale, "What we do")}
            index="02"
            lead={t(locale, "Two ways to ship.")}
            trail={t(locale, "One to find what to ship.")}
          />
        </div>

        {/* Cards that stack: each one sticks and the next slides up over it. */}
        <div className="container mt-12 sm:mt-16">
          {SERVICES.map((service, i) => (
            <div
              key={service.title}
              className="sticky mb-6 sm:mb-10"
              style={{ top: `calc(5rem + ${i * 1.25}rem)` }}
            >
              <Link
                href={service.href}
                className="group relative isolate block h-[34rem] overflow-hidden rounded-3xl border border-white/10 bg-ink sm:h-[38rem] lg:h-[40rem]"
              >
                <Image
                  src={PHOTOS[service.photo].src}
                  alt={PHOTOS[service.photo].alt}
                  fill
                  placeholder="blur"
                  sizes="(max-width: 1400px) 100vw, 1400px"
                  className="site-zoom -z-10 object-cover"
                />
                <div className="absolute inset-0 -z-10 bg-[linear-gradient(180deg,rgba(3,10,19,0.55)_0%,rgba(3,10,19,0.1)_35%,rgba(3,10,19,0.92)_100%)] lg:bg-[linear-gradient(90deg,rgba(3,10,19,0.92)_0%,rgba(3,10,19,0.55)_50%,rgba(3,10,19,0.05)_100%)]" />

                <div className="flex h-full flex-col justify-between p-6 sm:p-10 lg:p-14">
                  <div className="flex items-start justify-between">
                    <span className="sc-title sc-stroke text-6xl sm:text-8xl">{String(i + 1).padStart(2, "0")}</span>
                    <ArrowUpRight className="size-7 text-white transition-transform duration-500 group-hover:-translate-y-1 group-hover:translate-x-1" />
                  </div>
                  <div className="max-w-xl">
                    <p className="sc-label text-signal">{service.tag}</p>
                    <h3 className="sc-title mt-3 text-[2.3rem] text-white sm:text-6xl lg:text-7xl">{t(locale, service.title)}</h3>
                    <p className="mt-4 max-w-md text-[15px] leading-relaxed text-white/70 sm:text-lg">{t(locale, service.body)}</p>
                    <p className="sc-label mt-6 text-white/60">
                      {service.points.map((point) => t(locale, point)).join("  ·  ")}
                    </p>
                  </div>
                </div>
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* ---------------------------------------------------------- How it works */}
      <section className="border-t border-white/10 py-20 sm:py-32">
        <div className="container grid gap-14 lg:grid-cols-[0.9fr_1.1fr] lg:gap-20">
          <div className="lg:sticky lg:top-28 lg:self-start">
            <SectionHead
              eyebrow={t(locale, "How it works")}
              index="03"
              lead={t(locale, "Five steps.")}
              trail={t(locale, "Factory to your shop.")}
            />
            <PhotoFrame
              name="warehouseTeam"
              sizes="(max-width: 1024px) 100vw, 40vw"
              className="mt-10 hidden aspect-[4/3] rounded-3xl lg:block"
            />
          </div>

          <ol className="border-t border-white/10">
            {STEPS.map(([title, body], i) => (
              <Reveal as="li" key={title} delay={i * 60} className="flex gap-6 border-b border-white/10 py-8 sm:gap-10 sm:py-10">
                <span className="tnum w-6 shrink-0 pt-1 font-mono text-xs text-signal sm:pt-2">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span>
                  <span className="sc-title block text-xl text-white sm:text-3xl">{t(locale, title)}</span>
                  <span className="mt-3 block max-w-md text-[15px] leading-relaxed text-white/60">{t(locale, body)}</span>
                </span>
              </Reveal>
            ))}
          </ol>
        </div>
      </section>

      {/* ------------------------------------------------------ Explore China */}
      {/* On a computer the section holds still while the cities run sideways past it; on a phone they swipe. */}
      <ScrollVar as="section" mode="pin" className="relative border-t border-white/10 lg:h-[260vh]">
        <div className="py-20 sm:py-32 lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col lg:justify-center lg:overflow-hidden lg:py-0">
          <div className="container flex flex-wrap items-end justify-between gap-6">
            <SectionHead
              eyebrow={t(locale, "Explore China")}
              index="04"
              lead={t(locale, "Where the world's goods")}
              trail={t(locale, "are made and sold.")}
            />
            <Link href="/china" className="sc-link text-sm text-white">
              {t(locale, "Explore all")}
              <ArrowUpRight className="size-4" />
            </Link>
          </div>
          <div className="mt-10 overflow-x-auto overscroll-x-contain [scrollbar-width:none] lg:mt-14 lg:overflow-visible [&::-webkit-scrollbar]:hidden">
            <ul className="sc-track flex w-max snap-x snap-mandatory gap-4 px-5 sm:gap-5 sm:px-8 lg:px-[max(2rem,calc((100vw-1400px)/2+1.25rem))]">
              {CITIES.map((city, i) => (
                <li key={city.slug} className="snap-start">
                  <Link
                    href="/china"
                    className="group relative block h-[26rem] w-[17rem] overflow-hidden rounded-3xl bg-ink sm:h-[30rem] sm:w-[21rem] lg:h-[34rem] lg:w-[24rem]"
                  >
                    <Image
                      src={PHOTOS[city.photo].src}
                      alt={PHOTOS[city.photo].alt}
                      fill
                      placeholder="blur"
                      sizes="24rem"
                      className="site-zoom object-cover"
                    />
                    <span className="absolute inset-0 bg-[linear-gradient(180deg,rgba(3,10,19,0.45)_0%,transparent_30%,rgba(3,10,19,0.92)_100%)]" />
                    <span className="absolute left-5 top-5 font-mono text-[11px] text-white/70">
                      {String(i + 1).padStart(2, "0")} / {String(CITIES.length).padStart(2, "0")}
                    </span>
                    <span className="absolute inset-x-0 bottom-0 p-6">
                      <span className="flex items-center gap-1.5 text-xs text-white/60">
                        <MapPin className="size-3.5" />
                        {city.where}
                      </span>
                      <span className="sc-title mt-2 block text-3xl text-white sm:text-4xl">{city.name}</span>
                      <span className="mt-2 block text-sm text-white/65">{t(locale, city.tagline)}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </ScrollVar>

      {/* ------------------------------------------------------------- Sailings */}
      {sailings.length > 0 ? (
        <section className="border-t border-white/10 py-20 sm:py-32">
          <div className="container">
            <div className="flex flex-wrap items-end justify-between gap-6">
              <SectionHead
                eyebrow={t(locale, "Meli zinazofuata")}
                index="05"
                lead={t(locale, "Meli kila Jumatatu.")}
                trail={t(locale, "Mzigo mwisho Ijumaa.")}
              />
              <Link href="/schedule" className="sc-link text-sm text-white">
                {t(locale, "Ratiba kamili")}
                <ArrowUpRight className="size-4" />
              </Link>
            </div>
            <div className="mt-12 grid gap-4 sm:gap-6 md:grid-cols-3">
              {sailings.map((sailing, i) => (
                <Reveal key={sailing.key} delay={i * 100} className="h-full">
                  <SailingCard sailing={sailing} featured={sailing.key === next?.key} />
                </Reveal>
              ))}
            </div>
            <p className="mt-6 text-xs text-white/45">{t(locale, ARRIVAL_CAVEAT_SW)}</p>
          </div>
        </section>
      ) : null}

      {/* ------------------------------------------------------- Price check */}
      <section className="relative border-t border-white/10 py-20 sm:py-32">
        <div className="container">
          <SectionHead
            eyebrow={t(locale, "What it costs")}
            index="06"
            lead={t(locale, "What will it cost?")}
            trail={t(locale, "Know in seconds.")}
            body={t(locale, "Pick your goods, enter the CBM or the box sizes, and see the price.")}
          />
          <Reveal className="mt-12">
            <PriceCalculator cargoTypes={cargoTypes.map((r) => r.cargoType)} />
          </Reveal>
        </div>
      </section>

      {/* ---------------------------------------------------- Who we ship for */}
      <section className="border-t border-white/10 py-20 sm:py-32">
        <div className="container grid items-center gap-14 lg:grid-cols-2 lg:gap-20">
          <div className="lg:order-2">
            <SectionHead
              eyebrow={t(locale, "Who we ship for")}
              index="07"
              lead={t(locale, "Shops and importers")}
              trail={t(locale, "across Tanzania.")}
              body={t(locale, "Register once for your own shipping mark, and follow every box from your phone.")}
            />
            <ul className="mt-9 divide-y divide-white/10 border-y border-white/10">
              {[
                "Your own shipping mark and account",
                "Delivery note and photographs when your goods arrive",
                "Invoices in shillings, with the rate fixed on the day",
                "Collect in Dar es Salaam or ask us to deliver",
              ].map((line, i) => (
                <Reveal as="li" key={line} delay={i * 70} className="flex items-start gap-4 py-4">
                  <Check className="mt-0.5 size-4 shrink-0 text-signal" />
                  <span className="text-[15px] text-white/85">{t(locale, line)}</span>
                </Reveal>
              ))}
            </ul>
            <div className="mt-9 flex flex-wrap gap-3">
              <Btn href="/register" tone="white">{t(locale, "Get my shipping mark")}</Btn>
              <Btn href="/pickup" tone="line">{t(locale, "Pickup in China")}</Btn>
            </div>
          </div>
          <div className="grid grid-cols-5 gap-3 sm:gap-4 lg:order-1">
            <PhotoFrame name="traderShop" className="col-span-3 aspect-[3/4] rounded-3xl" />
            <div className="col-span-2 grid gap-3 sm:gap-4">
              <PhotoFrame name="traderPhone" sizes="25vw" className="aspect-square rounded-2xl" />
              <PhotoFrame name="traderDoor" sizes="25vw" className="aspect-[4/5] rounded-2xl" />
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------ Warehouses */}
      <section className="border-t border-white/10 py-20 sm:py-32">
        <div className="container">
          <SectionHead
            eyebrow={t(locale, "Where to send your goods")}
            index="08"
            lead={t(locale, "A warehouse")}
            trail={t(locale, "at each end.")}
          />
          <div className="mt-12 grid gap-4 sm:gap-6 md:grid-cols-2">
            {(
              [
                {
                  photo: "guangzhouDusk",
                  code: "CAN",
                  place: "Guangzhou, China",
                  address: company?.chinaAddress,
                  note: "Give this address to your supplier with your shipping mark.",
                  href: "/china",
                  cta: "Warehouse address",
                },
                {
                  photo: "portCranes",
                  code: "DAR",
                  place: "Dar es Salaam, Tanzania",
                  address: company?.darAddress,
                  note: "Collect here once your cargo has arrived and the invoice is settled.",
                  href: "/contact",
                  cta: "Visit or call us",
                },
              ] as const
            ).map((site) => (
              <PhotoFrame key={site.place} name={site.photo} className="min-h-[30rem] rounded-3xl">
                <div className="absolute inset-0 bg-gradient-to-t from-[#030a13] via-[#030a13]/50 to-transparent" />
                <span className="sc-title sc-stroke absolute right-6 top-5 text-6xl sm:text-7xl">{site.code}</span>
                <div className="absolute inset-x-0 bottom-0 p-6 text-white sm:p-9">
                  <p className="sc-label flex items-center gap-2 text-white/70">
                    <MapPin className="size-3.5 text-signal" />
                    {t(locale, site.place)}
                  </p>
                  <p className="mt-4 max-w-md text-lg leading-relaxed sm:text-xl">
                    {site.address ?? t(locale, "Address available on request")}
                  </p>
                  <p className="mt-2 max-w-md text-sm text-white/60">{t(locale, site.note)}</p>
                  <Link href={site.href} className="sc-link mt-6 text-sm">
                    {t(locale, site.cta)}
                    <ArrowUpRight className="size-4" />
                  </Link>
                </div>
              </PhotoFrame>
            ))}
          </div>
          {company?.phone ? (
            <p className="tnum mt-6 text-sm text-white/50">
              {t(locale, "Call us")}:{" "}
              <a href={telHref(company.phone)} className="font-semibold text-white hover:text-signal">
                {company.phone}
              </a>
              {company.altPhone ? (
                <>
                  {" · "}
                  <a href={telHref(company.altPhone)} className="font-semibold text-white hover:text-signal">
                    {company.altPhone}
                  </a>
                </>
              ) : null}
            </p>
          ) : null}
        </div>
      </section>

      <CtaBand
        lead={t(locale, "Ready to ship")}
        trail={t(locale, "from China?")}
        body={t(locale, "Create an account, get your shipping mark, and send it to your supplier.")}
        actions={
          <>
            <Btn href="/register">{t(locale, "Create an account")}</Btn>
            <Btn href="/contact" tone="line">{t(locale, "Talk to us")}</Btn>
          </>
        }
      />
    </>
  );
}
