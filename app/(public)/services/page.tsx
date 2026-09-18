import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, Container, Package, Search, Truck, Warehouse } from "lucide-react";

import { DisplayHeadingDark } from "@/components/site/display";
import { HeroArtwork } from "@/components/site/hero-artwork";
import { Button } from "@/components/ui/button";
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
      <section className="relative isolate overflow-hidden border-b bg-ink py-16 text-white sm:py-20">
        <HeroArtwork name="hero-services" />
        <div className="container relative">
          <p className="eyebrow text-marine">
            {ROUTE.originCity} → {ROUTE.destinationCity}
          </p>
          <DisplayHeadingDark
            as="h1"
            className="mt-3 max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl"
            lead={t(locale, "Everything between your supplier")}
            trail={t(locale, "and your shop")}
          />
          <p className="mt-5 max-w-2xl text-lg text-white/70">
            {t(
              locale,
              "We handle the whole journey — receiving in China, loading, the sailing, clearing, storage in Dar and delivery."
            )}
          </p>
        </div>
      </section>

      <section className="container py-16">
        <div className="grid gap-6 md:grid-cols-2">
          {SERVICES.map((service, i) => (
            <Card
              key={service.title}
              className="animate-in-up p-7"
              style={{ animationDelay: `${i * 70}ms` }}
            >
              <span className="grid size-11 place-items-center rounded-xl bg-brand/10 text-brand">
                <service.icon className="size-5" />
              </span>
              <h2 className="mt-5 text-lg font-semibold">{t(locale, service.title)}</h2>
              <p className="mt-2.5 text-sm leading-relaxed text-muted-foreground">
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

        <div className="mt-12 flex flex-wrap gap-3">
          <Button asChild size="lg">
            <Link href="/quote">
              {t(locale, "Get a quote")}
              <ArrowRight />
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="/book">{t(locale, "Book space on a sailing")}</Link>
          </Button>
        </div>
      </section>
    </>
  );
}
