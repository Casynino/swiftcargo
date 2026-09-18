import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, Boxes, MapPin, PackageCheck, Ship, Truck } from "lucide-react";

import { ChinaExplorer } from "@/components/site/china-explorer";
import {
  CtaBand,
  PageHero,
  PhotoFrame,
  PhotoMarquee,
  SectionHead,
  heroButton,
} from "@/components/site/kit";
import { Reveal } from "@/components/site/motion";
import { CopyField } from "@/components/app/copy-field";
import { CITIES, HOW_WE_HELP, MARKETS } from "@/lib/china-guide";
import { DEFAULT_LOCALE, t } from "@/lib/i18n";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = {
  title: "Explore China",
  description:
    "China's trading cities, markets and factory towns — Guangzhou, Yiwu, Shenzhen, Foshan and more — and how Swift Cargo brings what you buy there home to Tanzania.",
  alternates: { canonical: "/china" },
};

export const revalidate = 300;

const HELP_ICONS = [MapPin, Truck, Boxes, Ship];

export default async function ChinaPage() {
  const locale = DEFAULT_LOCALE;
  /* The markets Support recommends by name are their own list, edited in the
     app. They are shown as that — our recommendations — under the general
     guide, and never mixed into it. */
  const [company, markets] = await Promise.all([
    prisma.companySetting.findUnique({ where: { id: "singleton" } }),
    prisma.marketInformation.findMany({
      where: { published: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true, summary: true, category: true },
    }),
  ]);

  return (
    <>
      <PageHero
        overlap
        photo="guangzhouNight"
        eyebrow={t(locale, "Explore China")}
        lead={t(locale, "Explore China's markets,")}
        trail={t(locale, "we ship it home.")}
        body={
          <p>
            {t(
              locale,
              "Cities that make the world's goods, markets that sell them by the carton, and a warehouse in Guangzhou to bring it all together. Find where to buy what you sell — then send it to us."
            )}
          </p>
        }
        actions={
          <>
            <Link href="/register" className={heroButton.primary}>
              {t(locale, "Get my shipping mark")}
              <ArrowRight className="size-4" />
            </Link>
            <Link href="/pickup" className={heroButton.ghost}>
              <Truck className="size-4" />
              {t(locale, "Request a pickup")}
            </Link>
          </>
        }
      />

      <section className="container pb-20">
        <ChinaExplorer cities={CITIES} markets={MARKETS} />
      </section>

      {/* ------------------------------------------------ Factories, running */}
      <section className="overflow-hidden bg-ink py-20 text-white sm:py-24">
        <div className="container">
          <SectionHead
            dark
            eyebrow={t(locale, "Factories and showrooms")}
            lead={t(locale, "Where it is made,")}
            trail={t(locale, "where it is sold.")}
            body={t(
              locale,
              "Buy from a factory in Dongguan, a showroom in Foshan and a stall in Guangzhou in the same week. Everything with your mark waits for you in our warehouse."
            )}
          />
        </div>
        <PhotoMarquee
          className="mt-12"
          items={[
            { photo: "cnFactoryLine", caption: t(locale, "Factory floors") },
            { photo: "cnFurniture", caption: t(locale, "Furniture showrooms") },
            { photo: "cnLighting", caption: t(locale, "Lighting") },
            { photo: "cnTextileFactory", caption: t(locale, "Garment makers") },
            { photo: "cnTiles", caption: t(locale, "Tiles and ceramics") },
            { photo: "cnElectronics", caption: t(locale, "Electronics") },
          ]}
        />
        <PhotoMarquee
          reverse
          className="mt-5"
          items={[
            { photo: "cnWholesaleHall", caption: t(locale, "Wholesale halls") },
            { photo: "cnClothing", caption: t(locale, "Clothing") },
            { photo: "cnBags", caption: t(locale, "Leather goods") },
            { photo: "cnToys", caption: t(locale, "Toys") },
            { photo: "cnCosmetics", caption: t(locale, "Beauty") },
            { photo: "cnAutoParts", caption: t(locale, "Auto parts") },
          ]}
        />
      </section>

      {/* ---------------------------------------------- How it gets to you */}
      <section className="container grid items-center gap-14 py-20 sm:py-28 lg:grid-cols-2">
        <div>
          <SectionHead
            eyebrow={t(locale, "Bought it? Here is what happens")}
            lead={t(locale, "From the market")}
            trail={t(locale, "to your shop in Tanzania.")}
          />
          <ol className="mt-10 grid gap-4 sm:grid-cols-2">
            {HOW_WE_HELP.map((step, i) => {
              const Icon = HELP_ICONS[i] ?? PackageCheck;
              return (
                <Reveal as="li" key={step.title} delay={i * 80} className="rounded-2xl border bg-card p-5 shadow-soft">
                  <span className="grid size-11 place-items-center rounded-xl bg-gradient-to-br from-signal to-orange-600 text-white">
                    <Icon className="size-5" />
                  </span>
                  <p className="mt-4 font-semibold">{t(locale, step.title)}</p>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{t(locale, step.body)}</p>
                </Reveal>
              );
            })}
          </ol>
        </div>

        <Reveal>
          <PhotoFrame name="guangzhouDusk" className="min-h-[30rem] rounded-[2rem]">
            <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/50 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 p-6 text-white sm:p-8">
              <p className="flex items-center gap-2 text-sm font-semibold text-cyan-200">
                <MapPin className="size-4" />
                {t(locale, "Swift Cargo Guangzhou warehouse")}
              </p>
              <p className="mt-3 text-lg leading-relaxed sm:text-xl">
                {company?.chinaAddress ?? t(locale, "Available on request")}
              </p>
              {company?.chinaAddress ? (
                <div className="mt-4 max-w-md rounded-xl bg-white p-1 text-foreground">
                  <CopyField value={company.chinaAddress} label="warehouse address" />
                </div>
              ) : null}
              <p className="mt-4 text-sm text-white/70">
                {t(
                  locale,
                  "Your supplier must write your shipping mark on every box. Without it we cannot tell whose goods have arrived."
                )}
              </p>
            </div>
          </PhotoFrame>
        </Reveal>
      </section>

      {markets.length > 0 ? (
        <section className="bg-surface-2 py-20 sm:py-24">
          <div className="container">
            <SectionHead
              eyebrow={t(locale, "Our recommendations")}
              lead={t(locale, "Markets we recommend")}
              trail={t(locale, "by name.")}
              body={t(locale, "If you know what you want but not where to get it, we probably do.")}
            />
            <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {markets.map((market, i) => (
                <Reveal as="li" key={market.id} delay={Math.min(i, 6) * 60} className="rounded-2xl border bg-card p-5 shadow-soft">
                  <p className="font-semibold">{market.name}</p>
                  {market.category ? (
                    <p className="mt-0.5 text-xs uppercase tracking-wide text-signal">{market.category}</p>
                  ) : null}
                  {market.summary ? (
                    <p className="mt-2 text-sm text-muted-foreground">{market.summary}</p>
                  ) : null}
                </Reveal>
              ))}
            </ul>
          </div>
        </section>
      ) : null}

      <CtaBand
        photo="cnTradeFair"
        lead={t(locale, "Want us to source for you?")}
        trail={t(locale, "Tell us what you need.")}
        body={t(
          locale,
          "What you are looking for, your budget and the quantity. We find suppliers, compare prices, check the goods before they load and consolidate everything into one shipment."
        )}
        actions={
          <>
            <Link href="/contact" className={heroButton.primary}>
              {t(locale, "Talk to us about sourcing")}
              <ArrowRight className="size-4" />
            </Link>
            <Link href="/register" className={heroButton.ghost}>
              {t(locale, "Get my shipping mark")}
            </Link>
          </>
        }
      />
    </>
  );
}
