import type { Metadata } from "next";
import { Camera, MapPin, Scale, ShieldCheck, Ship } from "lucide-react";

import { PageHero } from "@/components/site/page-hero";
import { PillLink, SectionHead } from "@/components/site/display";
import { PhotoCaption, PhotoSlot } from "@/components/site/photo-slot";
import { Card } from "@/components/ui/card";
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
        eyebrow={t(locale, "About us")}
        eyebrowIcon={Ship}
        lead={name}
        trail={company?.tagline ?? undefined}
        body={t(
          locale,
          "We ship goods by sea from China to Tanzania for traders and businesses — shared containers for loose cargo, whole containers for those who fill them, and sourcing help in Guangzhou for those still looking for a supplier."
        )}
        scene="crane"
      />

      <section className="bg-field py-14 sm:py-20">
        <div className="container">
        <SectionHead
          eyebrow={t(locale, "How we work")}
          lead={t(locale, "Facts we can stand behind,")}
          trail={t(locale, "and nothing we cannot")}
          body={t(
            locale,
            "No founding story and no testimonials. What follows is how the operation runs and who signs for the goods at each end."
          )}
        />
        <div className="mt-10 grid gap-4 sm:grid-cols-2">
          {principles.map((item) => (
            <Card key={item.title} className="rounded-3xl border-field-edge p-6">
              <span className="grid size-11 place-items-center rounded-2xl bg-brand text-brand-foreground">
                <item.icon className="size-5" />
              </span>
              <h3 className="mt-4 font-semibold">{t(locale, item.title)}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {t(locale, item.body)}
              </p>
            </Card>
          ))}
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <PhotoSlot name="guangzhou-warehouse" scrim>
            <PhotoCaption label={t(locale, "Guangzhou")}>
              {t(locale, "Received, counted, weighed, measured, photographed.")}
            </PhotoCaption>
          </PhotoSlot>
          <PhotoSlot name="dar-delivery" scrim>
            <PhotoCaption label={t(locale, "Dar es Salaam")}>
              {t(locale, "Checked in off the container, then released — to the right person.")}
            </PhotoCaption>
          </PhotoSlot>
        </div>

        {company?.chinaAddress || company?.darAddress ? (
          <>
            <SectionHead
              className="mt-16"
              eyebrow={t(locale, "Where we are")}
              lead={t(locale, "Two addresses,")}
              trail={t(locale, "both ours")}
            />
            <div className="mt-10 grid gap-4 md:grid-cols-2">
              {[
                ["Guangzhou, China", company?.chinaEntity, company?.chinaAddress],
                ["Dar es Salaam, Tanzania", company?.darEntity, company?.darAddress],
              ]
                .filter(([, , address]) => address)
                .map(([place, entity, address]) => (
                  <Card key={place} className="rounded-3xl border-field-edge p-6">
                    <p className="flex items-center gap-2 text-sm font-semibold">
                      <MapPin className="size-4 text-signal" />
                      {t(locale, place!)}
                    </p>
                    {entity ? (
                      <p className="mt-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        {entity}
                      </p>
                    ) : null}
                    <p className="mt-2 text-sm leading-relaxed">{address}</p>
                  </Card>
                ))}
            </div>
            {company?.tin ? (
              <p className="tnum mt-4 text-xs text-muted-foreground">TIN {company.tin}</p>
            ) : null}
          </>
        ) : null}

        <div className="mt-12 flex flex-wrap gap-3">
          <PillLink href="/quote" tone="accent">
            {t(locale, "Get a quote")}
          </PillLink>
          <PillLink href="/contact" tone="light">
            {t(locale, "Contact us")}
          </PillLink>
        </div>
        </div>
      </section>
    </>
  );
}
