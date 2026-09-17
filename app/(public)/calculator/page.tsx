import type { Metadata } from "next";
import Link from "next/link";
import { Calculator } from "lucide-react";

import { CbmCalculator } from "@/components/site/cbm-calculator";
import { Button } from "@/components/ui/button";
import { DEFAULT_LOCALE, t } from "@/lib/i18n";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = {
  title: "CBM calculator",
  description:
    "Work out the volume of your cargo in cubic metres and get an estimated sea freight cost from China to Tanzania.",
  alternates: { canonical: "/calculator" },
};

export const revalidate = 60;

export default async function CalculatorPage() {
  const locale = DEFAULT_LOCALE;
  /* Loose cargo priced by volume, one row per named cargo type — the rows the
     invoice will be priced from. Weight-priced and container rates do not
     answer "how much for these boxes". */
  const rows = await prisma.shippingRate.findMany({
    where: {
      active: true,
      published: true,
      service: "LCL",
      basis: "PER_CBM",
      cargoType: { not: null },
    },
    orderBy: [{ cargoType: "asc" }, { effectiveFrom: "desc" }],
    select: { id: true, cargoType: true, rate: true, currency: true, minimumCbm: true },
  });

  /* One rate per type: the newest, if the rate book holds an old row beside it. */
  const seen = new Set<string>();
  const rates = rows
    .filter((row) => {
      const key = row.cargoType!.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((row) => ({
      id: row.id,
      cargoType: row.cargoType!,
      rate: Number(row.rate),
      currency: row.currency,
      minimumCbm: row.minimumCbm ? Number(row.minimumCbm) : null,
    }));

  return (
    <div className="container max-w-5xl py-12 sm:py-16">
      <span className="grid size-12 place-items-center rounded-xl bg-brand/8 text-brand">
        <Calculator className="size-6" />
      </span>
      <h1 className="mt-6 text-3xl font-semibold tracking-tight">
        {t(locale, "CBM calculator")}
      </h1>
      <p className="mt-3 max-w-2xl text-muted-foreground">
        {t(
          locale,
          "Sea freight is sold by the cubic metre. Measure your boxes, put the numbers in, choose what you are shipping, and we will work out the volume and roughly what it costs."
        )}
      </p>

      <div className="mt-10">
        <CbmCalculator rates={rates} />
      </div>

      <div className="mt-12 rounded-xl border bg-surface-2 p-5 sm:p-7">
        <h2 className="font-semibold">{t(locale, "How the maths works")}</h2>
        <p className="mt-3 text-sm text-muted-foreground">
          {t(
            locale,
            "Volume is length × width × height × number of boxes. In centimetres, divide by 1,000,000 to get cubic metres; in metres, the answer is already in cubic metres."
          )}
        </p>
        <p className="tnum mt-3 rounded-md bg-card px-3 py-2 text-sm">
          60 × 40 × 40 cm × 12 = 1.152 m³
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Button asChild>
            <Link href="/quote">{t(locale, "Get a proper quote")}</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/rates">{t(locale, "See all rates")}</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
