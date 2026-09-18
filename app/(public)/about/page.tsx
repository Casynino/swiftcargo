import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, Camera, MapPin, Scale, ShieldCheck, Ship } from "lucide-react";

import { CtaBand, PageHero, PhotoFrame, SectionHead, heroButton } from "@/components/site/kit";
import { Reveal } from "@/components/site/motion";
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
      body: "Our Guangzhou warehouse counts, weighs and measures every consignment when it arrives, and our Dar es Salaam warehouse does it again when it comes off the container. Both figures are kept.",
    },
    {
      icon: Camera,
      title: "Photographed on arrival",
      body: "The boxes are photographed when they are received, so you can see your goods are in our hands long before they reach you.",
    },
    {
      icon: Ship,
      title: "One sea route",
      body: `${ROUTE.originCity} to ${ROUTE.destinationCity}, loose cargo or a full container, around ${ROUTE.transitDaysMin}–${ROUTE.transitDaysMax} days at sea.`,
    },
    {
      icon: ShieldCheck,
      title: "Released to the right person",
      body: "Cargo leaves our Dar warehouse only once it has been checked in, the invoice is paid and confirmed, and it is handed to the person it is addressed to.",
    },
  ];

  return (
    <>
      <PageHero
        photo="craneLift"
        lead={name}
        trail={company?.tagline ?? undefined}
        body={
          <p>
            {t(
              locale,
              "We ship goods by sea from China to Tanzania for traders and businesses — shared containers for loose cargo, whole containers for those who fill them, and sourcing help in Guangzhou for those still looking for a supplier."
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

      <section className="container grid items-center gap-14 py-20 sm:py-28 lg:grid-cols-2">
        <Reveal className="grid grid-cols-2 gap-4">
          <PhotoFrame name="warehouseTeam" className="col-span-2 aspect-[16/10] rounded-[2rem]" />
          <PhotoFrame name="portYard" sizes="25vw" className="aspect-square rounded-[1.6rem]" />
          <PhotoFrame name="shipAerial" sizes="25vw" className="aspect-square rounded-[1.6rem]" />
        </Reveal>
        <div>
          <SectionHead
            eyebrow={t(locale, "How we work")}
            lead={t(locale, "Nothing on this page")}
            trail={t(locale, "is a promise we cannot keep.")}
            body={t(
              locale,
              "What we tell you is how the operation actually runs — which is what a trader choosing a forwarder is really trying to find out."
            )}
          />
          <ul className="mt-9 grid gap-4 sm:grid-cols-2">
            {principles.map((item, i) => (
              <Reveal as="li" key={item.title} delay={i * 80} className="rounded-2xl border bg-card p-5 shadow-soft">
                <span className="grid size-10 place-items-center rounded-xl bg-brand text-brand-foreground">
                  <item.icon className="size-5" />
                </span>
                <h3 className="mt-4 font-semibold">{t(locale, item.title)}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{t(locale, item.body)}</p>
              </Reveal>
            ))}
          </ul>
        </div>
      </section>

      <section className="relative isolate overflow-hidden bg-ink py-20 text-white sm:py-28">
        <div
          aria-hidden
          className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_80%_20%,hsl(var(--marine)/0.25),transparent_55%),radial-gradient(ellipse_at_0%_100%,hsl(var(--signal)/0.18),transparent_50%)]"
        />
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
        <section className="container py-20 sm:py-28">
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
                        <p className="mt-3 text-xs font-medium uppercase tracking-wide text-white/60">{entity}</p>
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
