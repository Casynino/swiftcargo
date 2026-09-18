import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, CheckCircle2, Container, Package, Search, Truck, Warehouse } from "lucide-react";

import { CtaBand, PageHero, PhotoFrame, heroButton } from "@/components/site/kit";
import { Reveal } from "@/components/site/motion";
import type { PhotoName } from "@/components/site/photos";
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
    photo: "containerStack" as PhotoName,
    href: "/book?service=SHARED_CARGO",
    cta: "Book loose cargo",
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
    photo: "craneLift" as PhotoName,
    href: "/book?service=FULL_CONTAINER",
    cta: "Book a container",
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
    photo: "cnWholesaleHall" as PhotoName,
    href: "/china",
    cta: "Explore China",
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
    photo: "warehouseRacks" as PhotoName,
    href: "/china",
    cta: "Our warehouse address",
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
    photo: "parcels" as PhotoName,
    href: "/contact",
    cta: "Ask about delivery",
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
        photo="portCranes"
        eyebrow={`${ROUTE.originCity} → ${ROUTE.destinationCity}`}
        lead={t(locale, "Everything between your supplier")}
        trail={t(locale, "and your shop.")}
        body={
          <p>
            {t(
              locale,
              "We handle the whole journey — receiving in China, loading, the sailing, clearing, storage in Dar and delivery."
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

      <section className="container space-y-20 py-20 sm:space-y-28 sm:py-28">
        {SERVICES.map((service, i) => (
          <div
            key={service.title}
            className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16"
          >
            <Reveal className={i % 2 ? "lg:order-2" : undefined}>
              <PhotoFrame name={service.photo} className="aspect-[4/3] rounded-[2rem]">
                <span className="absolute left-5 top-5 rounded-full bg-white/90 px-3 py-1 font-display text-sm font-bold text-slate-900">
                  0{i + 1}
                </span>
              </PhotoFrame>
            </Reveal>
            <Reveal delay={100}>
              <span className="grid size-12 place-items-center rounded-2xl bg-brand text-brand-foreground">
                <service.icon className="size-6" />
              </span>
              <h2 className="mt-6 font-display text-3xl font-bold tracking-tight sm:text-4xl">
                {t(locale, service.title)}
              </h2>
              <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
                {t(locale, service.body)}
              </p>
              <ul className="mt-6 grid gap-3 sm:grid-cols-2">
                {service.points.map((text) => (
                  <li key={text} className="flex items-start gap-2.5 text-sm">
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-signal" />
                    {point(text)}
                  </li>
                ))}
              </ul>
              <Link href={service.href} className={`${heroButton.solid} mt-8`}>
                {t(locale, service.cta)}
                <ArrowRight className="size-4" />
              </Link>
            </Reveal>
          </div>
        ))}
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
              {t(locale, "Work out my CBM")}
            </Link>
          </>
        }
      />
    </>
  );
}
