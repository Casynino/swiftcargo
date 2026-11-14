import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, Check, CheckCircle2, Container, Package, Search, Truck, Warehouse } from "lucide-react";

import { Btn, CtaBand, PageHero, PhotoFrame, Ticker, heroButton } from "@/components/site/kit";
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
        lead={t(locale, "Supplier to shop.")}
        trail={t(locale, "We do it all.")}
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

      <Ticker words={SERVICES.map((service) => t(locale, service.title))} />

      <section className="container pb-20 sm:pb-32">
        <ol>
          {SERVICES.map((service, i) => (
            <li key={service.title} className="border-t border-white/10 py-12 sm:py-20">
              <div className="grid items-start gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16">
                <div className={i % 2 ? "lg:order-2" : undefined}>
                  <PhotoFrame name={service.photo} className="aspect-[4/3] rounded-3xl lg:aspect-[5/4]" />
                </div>
                <Reveal delay={100} className="lg:pt-4">
                  <div className="flex items-baseline justify-between gap-4">
                    <span className="sc-title sc-stroke tnum text-6xl sm:text-8xl">{String(i + 1).padStart(2, "0")}</span>
                    <span className="sc-label text-white/40">
                      {String(i + 1).padStart(2, "0")} / {String(SERVICES.length).padStart(2, "0")}
                    </span>
                  </div>
                  <h2 className="sc-title mt-6 text-[1.9rem] text-white sm:text-5xl">{t(locale, service.title)}</h2>
                  <p className="mt-4 max-w-md text-[15px] leading-relaxed text-white/65 sm:text-lg">{t(locale, service.body)}</p>
                  <ul className="mt-7 divide-y divide-white/10 border-y border-white/10 text-[15px] text-white/85">
                    {service.points.map((text) => (
                      <li key={text} className="flex items-start gap-3 py-3">
                        <Check className="mt-1 size-4 shrink-0 text-signal" />
                        {point(text)}
                      </li>
                    ))}
                  </ul>
                  <Btn href={service.href} tone="line" className="mt-8">
                    {t(locale, service.cta)}
                  </Btn>
                </Reveal>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <CtaBand
        photo="shipSea"
        lead={t(locale, "Not sure which?")}
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
