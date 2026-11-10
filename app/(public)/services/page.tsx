import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, CheckCircle2, Container, Package, Search, Truck, Warehouse } from "lucide-react";

import { CtaBand, PageHero, PhotoFrame, heroButton } from "@/components/site/kit";
import { Reveal } from "@/components/site/motion";
import type { PhotoName } from "@/components/site/photos";
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
    photo: "containerStack" as PhotoName,
    href: "/book?service=SHARED_CARGO",
    cta: "Book loose cargo",
    body: "Share a container. Pay by the cubic metre.",
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
    photo: "craneLift" as PhotoName,
    href: "/book?service=FULL_CONTAINER",
    cta: "Book a container",
    body: "A 20ft, 40ft or high-cube container to yourself, sealed at the factory or our warehouse.",
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
    photo: "cnWholesaleHall" as PhotoName,
    href: "/china",
    cta: "Explore China",
    body: "We buy, inspect and consolidate for you in Guangzhou.",
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
    photo: "warehouseRacks" as PhotoName,
    href: "/china",
    cta: "Our warehouse address",
    body: "A warehouse at each end. Your goods wait safely in Dar until you collect.",
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
    photo: "parcels" as PhotoName,
    href: "/contact",
    cta: "Ask about delivery",
    body: "Ask us to deliver. We quote it and bring it to your address.",
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
        photo="portCranes"
        lead={t(locale, "Everything between your supplier")}
        trail={t(locale, "and your shop.")}
        body={
          <p>
            {t(
              locale,
              "The whole journey: receiving, loading, sailing, clearing, storage and delivery."
            )}
          </p>
        }
        actions={
          <>
            <Link href="/quote" className={heroButton.primary}>
              {t(locale, "Get a quote")}
              <ArrowRight className="size-4" />
            </Link>
            <Link href="/book" className={heroButton.ghost}>
              {t(locale, "Book space on a sailing")}
            </Link>
          </>
        }
      />

      <section className="container py-14 sm:py-24">
        <ol className="divide-y">
          {SERVICES.map((service, i) => (
            <li key={service.title} className="py-10 first:pt-0 sm:py-16">
              <div className="grid items-center gap-8 lg:grid-cols-2 lg:gap-16">
                <Reveal className={i % 2 ? "lg:order-2" : undefined}>
                  <PhotoFrame name={service.photo} className="aspect-[4/3] rounded-2xl" />
                </Reveal>
                <Reveal delay={100}>
                  <p className="font-mono text-xs text-signal">{String(i + 1).padStart(2, "0")}</p>
                  <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight sm:text-4xl">
                    {t(locale, service.title)}
                  </h2>
                  <p className="mt-3 max-w-md text-lg text-muted-foreground">{t(locale, service.body)}</p>
                  <ul className="mt-6 divide-y border-y text-sm">
                    {service.points.map((text) => (
                      <li key={text} className="py-2.5">
                        {point(text)}
                      </li>
                    ))}
                  </ul>
                  <Link href={service.href} className="group mt-6 inline-flex items-center gap-2 border-b border-signal pb-1 font-medium">
                    {t(locale, service.cta)}
                    <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-1" />
                  </Link>
                </Reveal>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <CtaBand
        photo="shipSea"
        lead={t(locale, "Not sure which one you need?")}
        trail={t(locale, "Ask us.")}
        body={t(locale, "Tell us what you are shipping and roughly how much, and we will tell you the cheapest way to move it.")}
        actions={
          <>
            <Link href="/quote" className={heroButton.primary}>
              {t(locale, "Get a quote")}
              <ArrowRight className="size-4" />
            </Link>
            <Link href="/calculator" className={heroButton.ghost}>
              {t(locale, "Price calculator")}
            </Link>
          </>
        }
      />
    </>
  );
}
