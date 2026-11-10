import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, Camera, MapPin, Scale, ShieldCheck, Ship } from "lucide-react";

import { CtaBand, Eyebrow, PageHero, PhotoFrame, SectionHead, heroButton } from "@/components/site/kit";
import { Reveal, ScrollWords } from "@/components/site/motion";
import { RouteMap } from "@/components/site/route-map";
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

      <section className="container py-14 sm:py-24">
        <Eyebrow className="mb-8">{t(locale, "How we work")}</Eyebrow>
        <ScrollWords
          text="We count every box twice, photograph it when it arrives, and release it only to the person it is addressed to."
          accent={["twice", "photograph", "addressed"]}
          className="max-w-5xl font-display text-[clamp(1.75rem,4.4vw,3.6rem)] font-medium leading-[1.12] tracking-[-0.02em]"
        />
      </section>

      <section className="container grid items-center gap-12 pb-14 sm:pb-24 lg:grid-cols-2 lg:gap-16">
        <Reveal className="grid grid-cols-2 gap-4">
          <PhotoFrame name="warehouseTeam" className="col-span-2 aspect-[16/10] rounded-2xl" />
          <PhotoFrame name="portYard" sizes="25vw" className="aspect-square rounded-2xl" />
          <PhotoFrame name="shipAerial" sizes="25vw" className="aspect-square rounded-2xl" />
        </Reveal>
        <ol className="divide-y border-y">
          {principles.map((item, i) => (
            <Reveal as="li" key={item.title} delay={i * 80} className="flex gap-5 py-5">
              <span className="tnum w-6 shrink-0 pt-0.5 font-mono text-sm text-signal">{String(i + 1).padStart(2, "0")}</span>
              <span>
                <span className="block font-medium">{t(locale, item.title)}</span>
                <span className="mt-0.5 block text-sm leading-relaxed text-muted-foreground">{t(locale, item.body)}</span>
              </span>
            </Reveal>
          ))}
        </ol>
      </section>

      <section className="relative isolate overflow-hidden bg-ink py-14 text-white sm:py-24">
        <div className="container grid items-center gap-12 lg:grid-cols-[0.8fr_1.2fr]">
          <SectionHead
            dark
            eyebrow={t(locale, "One route")}
            lead={`${ROUTE.originCity} → ${ROUTE.destinationCity},`}
            trail={`${ROUTE.transitDaysMin}–${ROUTE.transitDaysMax} ${t(locale, "days at sea.")}`}
            body={t(locale, "A ship every week. Cargo in Guangzhou by Friday sails on Monday.")}
          />
          <Reveal className="rounded-[2rem] border border-white/10 bg-white/[0.03] p-4 sm:p-8">
            <RouteMap />
          </Reveal>
        </div>
      </section>

      {company?.chinaAddress || company?.darAddress ? (
        <section className="container py-14 sm:py-24">
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
                  <PhotoFrame name={photo} className="min-h-[22rem] rounded-[2rem]">
                    <div className="absolute inset-0 bg-gradient-to-t from-ink/95 via-ink/40 to-transparent" />
                    <div className="absolute inset-x-0 bottom-0 p-7 text-white">
                      <p className="flex items-center gap-2 text-sm font-semibold text-cyan-200">
                        <MapPin className="size-4" />
                        {t(locale, place)}
                      </p>
                      {entity ? (
                        <p className="mt-3 text-xs font-medium text-white/60">{entity}</p>
                      ) : null}
                      <p className="mt-1.5 max-w-md leading-relaxed">{address}</p>
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
        lead={t(locale, "Ship with people who count your boxes.")}
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
