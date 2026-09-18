import type { Metadata } from "next";
import { Container, Package, Search, Ship, Truck, Warehouse } from "lucide-react";

import { DisplayHeading, PillLink, SectionHead } from "@/components/site/display";
import { PageHero } from "@/components/site/page-hero";
import { PhotoCaption, PhotoSlot } from "@/components/site/photo-slot";
import { Card } from "@/components/ui/card";
import { ROUTE } from "@/lib/constants";
import { DEFAULT_LOCALE, t } from "@/lib/i18n";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = {
  title: "Services",
  description:
    "Loose cargo, full containers, China sourcing, warehousing and delivery — sea freight from Guangzhou to Dar es Salaam.",
  alternates: { canonical: "/services" },
};

export const revalidate = 300;

const SERVICES = [
  {
    icon: Package,
    title: "Loose cargo (LCL)",
    body: "Your goods share a container with other customers. You pay for the space you use, by the cubic metre, with no minimum order size beyond our small charging floor.",
    points: [
      "Charged per cubic metre",
      "Consolidated at our Guangzhou warehouse",
      "Every package counted, weighed, measured and photographed",
      "Delivery note issued on receipt",
    ],
  },
  {
    icon: Container,
    title: "Full container (FCL)",
    body: "A 20ft, 40ft or 40ft high-cube container to yourself, sealed at your supplier's factory or at our warehouse. Best when you are filling most of a box.",
    points: [
      "Flat price per container",
      "Sealed and seal number recorded",
      "Door pickup from your supplier",
      "Faster — no waiting for a container to fill",
    ],
  },
  {
    icon: Search,
    title: "China sourcing",
    body: "Cannot find a supplier, or want somebody on the ground to check the goods before they ship? We buy, inspect and consolidate on your behalf in Guangzhou.",
    points: [
      "Supplier search and price comparison",
      "Quality check before loading",
      "Consolidation from several suppliers",
      "Payment handled locally",
    ],
  },
  {
    icon: Warehouse,
    title: "Warehousing",
    body: "Warehouses at both ends. Your supplier delivers to Guangzhou; your goods wait safely in Dar until you are ready to collect them.",
    points: [
      "Guangzhou receiving warehouse",
      "Dar es Salaam storage",
      "FREE_STORAGE",
      "Photographed on arrival at both ends",
    ],
  },
  {
    icon: Truck,
    title: "Delivery in Tanzania",
    body: "Do not want to come to the warehouse? Ask us to deliver, and we will quote for it and bring it to your address.",
    points: [
      "Delivery anywhere in Dar es Salaam",
      "Upcountry by arrangement",
      "Tracked through to your door",
    ],
  },
];

export default async function ServicesPage() {
  const locale = DEFAULT_LOCALE;
  /* The free period is a commercial setting, not copy. */
  const company = await prisma.companySetting.findUnique({
    where: { id: "singleton" },
    select: { freeStorageDays: true },
  });
  const point = (text: string) =>
    text === "FREE_STORAGE"
      ? company?.freeStorageDays
        ? `${t(locale, "Free storage for")} ${company.freeStorageDays} ${t(locale, "days after arrival")}`
        : t(locale, "Storage after arrival")
      : t(locale, text);

  return (
    <>
      <PageHero
        eyebrow={`${ROUTE.originCity} → ${ROUTE.destinationCity}`}
        eyebrowIcon={Ship}
        lead={t(locale, "Everything between your supplier")}
        trail={t(locale, "and your shop")}
        body={t(
          locale,
          "We handle the whole journey — receiving in China, loading, the sailing, clearing, storage in Dar and delivery."
        )}
        scene="port"
      >
        <div className="flex flex-wrap gap-3">
          <PillLink href="/quote" tone="accent">
            {t(locale, "Get a quote")}
          </PillLink>
          <PillLink href="/book" tone="glass">
            {t(locale, "Book space on a sailing")}
          </PillLink>
        </div>
      </PageHero>

      <section className="border-b bg-field py-16 sm:py-20">
        <div className="container">
          <div className="grid gap-4 md:grid-cols-2">
            {SERVICES.map((service, i) => (
              <Card
                key={service.title}
                className="animate-in-up rounded-3xl border-field-edge p-6 sm:p-7"
                style={{ animationDelay: `${i * 70}ms` }}
              >
                <span className="grid size-11 place-items-center rounded-2xl bg-brand text-brand-foreground">
                  <service.icon className="size-5" />
                </span>
                <DisplayHeading
                  as="h2"
                  size="sub"
                  className="mt-5"
                  lead={t(locale, service.title)}
                />
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                  {t(locale, service.body)}
                </p>
                <ul className="mt-5 space-y-2">
                  {service.points.map((text) => (
                    <li key={text} className="flex gap-2 text-sm text-muted-foreground">
                      <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-marine" />
                      {point(text)}
                    </li>
                  ))}
                </ul>
              </Card>
            ))}
          </div>

          {/* Five cards leave a gap in a two-column grid. The picture goes
              under the row at full width rather than into the gap, where it
              would stretch a card to a photograph's height and leave it half
              empty. */}
          <PhotoSlot
            name="guangzhou-warehouse"
            scrim
            className="mt-4 aspect-[3/2] sm:aspect-[21/9]"
          >
            <PhotoCaption label={ROUTE.originCity}>
              {t(locale, "Where your supplier delivers, and where the measuring starts.")}
            </PhotoCaption>
          </PhotoSlot>
        </div>
      </section>

      <section className="bg-field pb-16 sm:pb-20 lg:pb-24">
        <div className="container">
          <SectionHead
            eyebrow={t(locale, "Start here")}
            lead={t(locale, "Tell us what you are shipping,")}
            trail={t(locale, "and we will price it")}
            body={t(
              locale,
              "A quote needs the goods, roughly how much of them, and where they are in China. Everything else we work out from what the warehouse measures."
            )}
            action={{ href: "/quote", label: t(locale, "Get a quote") }}
          />
        </div>
      </section>
    </>
  );
}
