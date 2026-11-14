import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, Camera, MapPin, Scale, ShieldCheck, Ship } from "lucide-react";

import { CtaBand, Eyebrow, PageHero, PhotoFrame, SectionHead, heroButton } from "@/components/site/kit";
import { Reveal, ScrollVar, ScrollWords } from "@/components/site/motion";
import { PHOTOS } from "@/components/site/photos";
import { ROUTE } from "@/lib/constants";
import { DEFAULT_LOCALE, t } from "@/lib/i18n";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = {
  title: "About us",
  description:
    "Swift Cargo ships loose cargo and full containers by sea from our Guangzhou warehouse to our warehouse in Dar es Salaam.",
  alternates: { canonical: "/about" },
};

export const revalidate = 300;

/**
 * Who we are, in facts the business can stand behind.
 *
 * No founding story, no customer counts, no quotes from customers: nothing on
 * this page is a claim somebody would have to invent. What it says is how the
 * operation works — which is what a trader choosing a forwarder is actually
 * trying to find out — and who signs for the goods at each end, read from the
 * company settings so it changes when the companies do.
 */
export default async function AboutPage() {
  const locale = DEFAULT_LOCALE;
  const company = await prisma.companySetting.findUnique({
    where: { id: "singleton" },
    select: {
      name: true,
      tagline: true,
      chinaEntity: true,
      darEntity: true,
      chinaAddress: true,
      darAddress: true,
      tin: true,
    },
  });
  const name = company?.name ?? "Swift Cargo";

  const principles = [
    {
      icon: Scale,
      title: "Measured at both ends",
      body: "Guangzhou and Dar each count, weigh and measure every consignment. Both figures are kept.",
    },
    {
      icon: Camera,
      title: "Photographed on arrival",
      body: "Boxes are photographed when received, so you see them in our hands early.",
    },
    {
      icon: Ship,
      title: "One sea route",
      body: `${ROUTE.originCity} to ${ROUTE.destinationCity}, loose cargo or a full container, around ${ROUTE.transitDaysMin}–${ROUTE.transitDaysMax} days at sea.`,
    },
    {
      icon: ShieldCheck,
      title: "Released to the right person",
      body: "Cargo leaves Dar only when checked in, paid, and handed to the person it is addressed to.",
    },
  ];

  return (
    <>
      <PageHero
        photo="craneLift"
        video="port-drone"
        eyebrow={t(locale, "About us")}
        lead={name}
        trail={company?.tagline ?? undefined}
        body={
          <p>
            {t(
              locale,
              "Sea freight from China to Tanzania: shared containers, whole containers, and sourcing help in Guangzhou."
            )}
          </p>
        }
        actions={
          <>
            <Link href="/quote" className={heroButton.primary}>
              {t(locale, "Get a quote")}
              <ArrowRight className="size-4" />
            </Link>
            <Link href="/contact" className={heroButton.ghost}>
              {t(locale, "Contact us")}
            </Link>
          </>
        }
      />

      <section className="container py-20 sm:py-32">
        <Eyebrow index="01" className="mb-8">{t(locale, "How we work")}</Eyebrow>
        <ScrollWords
          text="We count every box twice, photograph it when it arrives, and release it only to the person it is addressed to."
          accent={["twice", "photograph", "addressed"]}
          className="max-w-6xl font-display text-[1.7rem] font-semibold leading-[1.12] tracking-[-0.02em] text-white sm:text-5xl lg:text-[4rem]"
        />
      </section>

      <section className="container grid items-center gap-12 pb-20 sm:pb-32 lg:grid-cols-2 lg:gap-20">
        <Reveal className="grid grid-cols-2 gap-4">
          <PhotoFrame name="warehouseTeam" className="col-span-2 aspect-[16/10] rounded-3xl" />
          <PhotoFrame name="portYard" sizes="25vw" className="aspect-square rounded-2xl" />
          <PhotoFrame name="shipAerial" sizes="25vw" className="aspect-square rounded-2xl" />
        </Reveal>
        <ol className="divide-y divide-white/10 border-y border-white/10">
          {principles.map((item, i) => (
            <Reveal as="li" key={item.title} delay={i * 80} className="flex gap-5 py-6 sm:gap-8 sm:py-8">
              <span className="sc-title sc-stroke tnum w-12 shrink-0 text-3xl sm:w-16 sm:text-4xl">{String(i + 1).padStart(2, "0")}</span>
              <span>
                <span className="sc-title block text-lg text-white sm:text-2xl">{t(locale, item.title)}</span>
                <span className="mt-2 block text-[15px] leading-relaxed text-white/60">{t(locale, item.body)}</span>
              </span>
            </Reveal>
          ))}
        </ol>
      </section>

      {/* The route, over the sea it crosses: three figures instead of a map. */}
      <ScrollVar as="section" mode="through" className="relative isolate overflow-hidden text-white">
        <div aria-hidden className="sc-fade-y absolute inset-0 -z-10 overflow-hidden">
          <div className="sc-band-photo absolute inset-x-0 -inset-y-[12%]">
            <Image src={PHOTOS.shipAerial.src} alt="" fill placeholder="blur" sizes="100vw" className="object-cover" />
          </div>
          <div className="absolute inset-0 bg-[linear-gradient(180deg,hsl(var(--background))_0%,rgba(3,10,19,0.6)_30%,rgba(3,10,19,0.75)_70%,hsl(var(--background))_100%)]" />
        </div>
        <div className="container py-24 sm:py-36">
          <SectionHead
            eyebrow={t(locale, "One route")}
            lead={`${ROUTE.originCity} →`}
            trail={ROUTE.destinationCity}
            body={t(locale, "A ship every week. Cargo in Guangzhou by Friday sails on Monday.")}
          />
          <dl className="mt-14 grid grid-cols-3 border-t border-white/15">
            {(
              [
                [`${ROUTE.transitDaysMin}–${ROUTE.transitDaysMax}`, "Days at sea"],
                [t(locale, "Mon"), "Sails every week"],
                [t(locale, "Fri"), "Last day for cargo"],
              ] as const
            ).map(([value, label], i) => (
              <Reveal key={label} delay={i * 90} className="border-r border-white/15 py-6 pr-3 last:border-r-0 sm:py-9 [&:not(:first-child)]:pl-4 sm:[&:not(:first-child)]:pl-8">
                <dt className="sr-only">{t(locale, label)}</dt>
                <dd>
                  <span className="sc-title tnum block text-[1.7rem] sm:text-6xl">{value}</span>
                  <span className="mt-2 block text-xs text-white/60 sm:text-sm">{t(locale, label)}</span>
                </dd>
              </Reveal>
            ))}
          </dl>
        </div>
      </ScrollVar>

      {company?.chinaAddress || company?.darAddress ? (
        <section className="container py-20 sm:py-32">
          <SectionHead
            eyebrow={t(locale, "Where we are")}
            lead={t(locale, "Two warehouses,")}
            trail={t(locale, "one company.")}
          />
          <div className="mt-12 grid gap-6 md:grid-cols-2">
            {(
              [
                ["Guangzhou, China", company?.chinaEntity, company?.chinaAddress, "guangzhouDusk"],
                ["Dar es Salaam, Tanzania", company?.darEntity, company?.darAddress, "portCranes"],
              ] as const
            )
              .filter(([, , address]) => address)
              .map(([place, entity, address, photo], i) => (
                <Reveal key={place} delay={i * 100}>
                  <PhotoFrame name={photo} className="min-h-[28rem] rounded-3xl">
                    <div className="absolute inset-0 bg-gradient-to-t from-[#030a13] via-[#030a13]/50 to-transparent" />
                    <div className="absolute inset-x-0 bottom-0 p-6 text-white sm:p-9">
                      <p className="sc-label flex items-center gap-2 text-white/70">
                        <MapPin className="size-3.5 text-signal" />
                        {t(locale, place)}
                      </p>
                      {entity ? (
                        <p className="mt-3 text-xs font-medium text-white/60">{entity}</p>
                      ) : null}
                      <p className="mt-2 max-w-md text-lg leading-relaxed">{address}</p>
                    </div>
                  </PhotoFrame>
                </Reveal>
              ))}
          </div>
          {company?.tin ? (
            <p className="tnum mt-4 text-xs text-muted-foreground">TIN {company.tin}</p>
          ) : null}
        </section>
      ) : null}

      <CtaBand
        lead={t(locale, "We count your boxes.")}
        trail={t(locale, "Twice.")}
        actions={
          <>
            <Link href="/register" className={heroButton.primary}>
              {t(locale, "Create an account")}
              <ArrowRight className="size-4" />
            </Link>
            <Link href="/contact" className={heroButton.ghost}>
              {t(locale, "Contact us")}
            </Link>
          </>
        }
      />
    </>
  );
}
