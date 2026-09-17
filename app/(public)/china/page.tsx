import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, MapPin } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CopyField } from "@/components/app/copy-field";
import { DEFAULT_LOCALE, t } from "@/lib/i18n";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = {
  title: "China sourcing",
  description:
    "Our Guangzhou warehouse address, the markets we buy from, and how sourcing with Swift Cargo works.",
  alternates: { canonical: "/china" },
};

export const revalidate = 300;

export default async function ChinaPage() {
  const locale = DEFAULT_LOCALE;
  /* The markets are Support's own list, edited in the app. A list typed into
     this file used to stand in when that table was empty — which put markets on
     the website that nobody here had chosen to recommend. */
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
      <section className="border-b bg-ink py-16 text-white sm:py-20">
        <div className="container">
          <p className="eyebrow text-marine">{t(locale, "Guangzhou")}</p>
          <h1 className="mt-3 max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">
            {t(locale, "Our warehouse in China")}
          </h1>
          <p className="mt-5 max-w-2xl text-lg text-white/70">
            {t(
              locale,
              "Give this address to your supplier along with your shipping mark, and your goods reach us directly."
            )}
          </p>
        </div>
      </section>

      <section className="container py-16">
        <Card className="p-5 sm:p-7">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <MapPin className="size-4 text-signal" />
            {t(locale, "Swift Cargo Guangzhou warehouse")}
          </p>
          <p className="mt-4 text-lg leading-relaxed sm:text-xl">
            {company?.chinaAddress ?? t(locale, "Available on request")}
          </p>
          {company?.chinaAddress ? (
            <div className="mt-5 max-w-xl">
              <CopyField value={company.chinaAddress} label="warehouse address" />
            </div>
          ) : null}
          <p className="mt-5 text-sm text-muted-foreground">
            {t(
              locale,
              "Your supplier must write your shipping mark on every box. Without it we cannot tell whose goods have arrived — register for an account and we will generate your mark straight away."
            )}
          </p>
          <Button asChild className="mt-6">
            <Link href="/register">
              {t(locale, "Get my shipping mark")}
              <ArrowRight />
            </Link>
          </Button>
        </Card>

        {markets.length > 0 ? (
          <>
            <h2 className="mt-16 text-2xl font-semibold tracking-tight">
              {t(locale, "Markets we buy from")}
            </h2>
            <p className="mt-2 max-w-2xl text-muted-foreground">
              {t(locale, "If you know what you want but not where to get it, we probably do.")}
            </p>

            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {markets.map((market) => (
                <Card key={market.id} className="p-5">
                  <p className="font-medium">{market.name}</p>
                  {market.category ? (
                    <p className="mt-0.5 text-xs uppercase tracking-wide text-marine">
                      {market.category}
                    </p>
                  ) : null}
                  {market.summary ? (
                    <p className="mt-1.5 text-sm text-muted-foreground">{market.summary}</p>
                  ) : null}
                </Card>
              ))}
            </div>
          </>
        ) : null}

        <div className="mt-12 rounded-xl border bg-surface-2 p-5 sm:p-7">
          <h2 className="font-semibold">{t(locale, "Want us to source for you?")}</h2>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            {t(
              locale,
              "Tell us what you are looking for, your budget and the quantity. We will find suppliers, compare prices, check the goods before they load and consolidate everything into one shipment."
            )}
          </p>
          <Button asChild className="mt-5">
            <Link href="/contact">{t(locale, "Talk to us about sourcing")}</Link>
          </Button>
        </div>
      </section>
    </>
  );
}
