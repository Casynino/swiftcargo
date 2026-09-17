import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, Camera, MapPin, Scale, ShieldCheck, Ship } from "lucide-react";

import { Button } from "@/components/ui/button";
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
      <section className="border-b bg-ink py-16 text-white sm:py-20">
        <div className="container">
          <p className="eyebrow text-marine">{t(locale, "About us")}</p>
          <h1 className="mt-3 max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">
            {name}
          </h1>
          {company?.tagline ? (
            <p className="mt-2 text-lg text-marine">{company.tagline}</p>
          ) : null}
          <p className="mt-5 max-w-2xl text-lg text-white/70">
            {t(
              locale,
              "We ship goods by sea from China to Tanzania for traders and businesses — shared containers for loose cargo, whole containers for those who fill them, and sourcing help in Guangzhou for those still looking for a supplier."
            )}
          </p>
        </div>
      </section>

      <section className="container py-16">
        <h2 className="text-2xl font-semibold tracking-tight">
          {t(locale, "How we work")}
        </h2>
        <div className="mt-8 grid gap-6 sm:grid-cols-2">
          {principles.map((item) => (
            <Card key={item.title} className="p-6">
              <span className="grid size-10 place-items-center rounded-xl bg-brand/8 text-brand">
                <item.icon className="size-5" />
              </span>
              <h3 className="mt-4 font-semibold">{t(locale, item.title)}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {t(locale, item.body)}
              </p>
            </Card>
          ))}
        </div>

        {company?.chinaAddress || company?.darAddress ? (
          <>
            <h2 className="mt-16 text-2xl font-semibold tracking-tight">
              {t(locale, "Where we are")}
            </h2>
            <div className="mt-8 grid gap-6 md:grid-cols-2">
              {[
                ["Guangzhou, China", company?.chinaEntity, company?.chinaAddress],
                ["Dar es Salaam, Tanzania", company?.darEntity, company?.darAddress],
              ]
                .filter(([, , address]) => address)
                .map(([place, entity, address]) => (
                  <Card key={place} className="p-6">
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
          <Button asChild size="lg">
            <Link href="/quote">
              {t(locale, "Get a quote")}
              <ArrowRight />
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="/contact">{t(locale, "Contact us")}</Link>
          </Button>
        </div>
      </section>
    </>
  );
}
