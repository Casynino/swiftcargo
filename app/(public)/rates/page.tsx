import Link from "next/link";
import type { Metadata } from "next";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { convert, formatCurrency, isCurrency } from "@/lib/currency";
import { formatDate } from "@/lib/format";
import { DEFAULT_LOCALE, t } from "@/lib/i18n";
import { currentExchangeRate } from "@/lib/pricing";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = {
  title: "Shipping rates",
  description:
    "Current sea freight rates from China to Tanzania — per cubic metre for loose cargo, flat for full containers.",
  alternates: { canonical: "/rates" },
};

export const revalidate = 60;

const BASIS = { PER_CBM: "per m³", PER_KG: "per kg", FLAT: "per container" } as const;

/**
 * The published rate card.
 *
 * Read live from the rate book — the same rows Finance edits — so the number a
 * customer sees here is the number the invoice will use. A price list typed
 * into a React component is a price list that goes stale the first time
 * somebody changes a rate and forgets this page exists.
 *
 * Only named cargo types are listed. Every line is billed at the rate for its
 * own type, and a type with no rate is reported to Finance rather than billed
 * at a fallback — so a row with no type is not a price anybody is charged, and
 * publishing it would be advertising one.
 */
export default async function RatesPage() {
  const locale = DEFAULT_LOCALE;
  const [rates, fx] = await Promise.all([
    prisma.shippingRate.findMany({
      where: { active: true, published: true, cargoType: { not: null } },
      orderBy: [{ service: "asc" }, { cargoType: "asc" }],
    }),
    currentExchangeRate(),
  ]);

  const lcl = rates.filter((r) => r.service === "LCL");
  const fcl = rates.filter((r) => r.service === "FCL");

  /* The board rate, for orientation only. An invoice pins its own. */
  const inShillings = (amount: (typeof rates)[number]) => {
    if (!isCurrency(amount.currency)) return "—";
    if (amount.currency === "TZS") return formatCurrency(amount.rate, "TZS");
    return fx ? formatCurrency(convert(amount.rate, amount.currency, "TZS", fx.rate), "TZS") : "—";
  };

  return (
    <div className="container max-w-4xl py-12 sm:py-16">
      <p className="eyebrow text-marine">{t(locale, "Guangzhou to Dar es Salaam")}</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">
        {t(locale, "Shipping rates")}
      </h1>
      <p className="mt-3 max-w-2xl text-muted-foreground">
        {t(
          locale,
          "These are our current published rates. Each kind of goods is charged at its own rate, on the measurements taken at our warehouse. Duty, VAT and clearing are not included."
        )}
      </p>

      {[
        { title: "Loose cargo (LCL)", rows: lcl, note: "Shared container, charged by volume or weight." },
        { title: "Full container (FCL)", rows: fcl, note: "The whole box to yourself." },
      ]
        .filter((group) => group.rows.length > 0)
        .map((group) => (
          <Card key={group.title} className="mt-10">
            <div className="border-b p-5 sm:p-6">
              <h2 className="font-semibold">{t(locale, group.title)}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{t(locale, group.note)}</p>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t(locale, "Cargo type")}</TableHead>
                  <TableHead className="text-right">{t(locale, "Rate")}</TableHead>
                  <TableHead className="hidden text-right sm:table-cell">{t(locale, "Minimum")}</TableHead>
                  <TableHead className="hidden text-right sm:table-cell">
                    {t(locale, "In shillings")}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {group.rows.map((rate) => (
                  <TableRow key={rate.id}>
                    <TableCell className="font-medium">{rate.cargoType}</TableCell>
                    <TableCell className="tnum whitespace-nowrap text-right">
                      {formatCurrency(rate.rate, rate.currency)}{" "}
                      <span className="block text-xs text-muted-foreground sm:inline">
                        {t(locale, BASIS[rate.basis])}
                      </span>
                    </TableCell>
                    <TableCell className="tnum hidden text-right text-muted-foreground sm:table-cell">
                      {rate.minimumCbm
                        ? `${Number(rate.minimumCbm).toFixed(2)} m³`
                        : rate.minimumKg
                          ? `${Number(rate.minimumKg)} kg`
                          : "—"}
                    </TableCell>
                    <TableCell className="tnum hidden text-right text-muted-foreground sm:table-cell">
                      {inShillings(rate)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        ))}

      {rates.length === 0 ? (
        <Card className="mt-10 p-10 text-center text-muted-foreground">
          {t(locale, "Our rate card is being updated. Please ask us for a quote.")}
        </Card>
      ) : null}

      <div className="mt-10 rounded-xl border bg-surface-2 p-5 sm:p-7">
        <h2 className="font-semibold">{t(locale, "What is not included")}</h2>
        <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
          {[
            "Tanzanian import duty and VAT",
            "Customs clearing and port charges",
            "Delivery from our Dar warehouse to your address",
            "Storage beyond the free period after arrival",
          ].map((item) => (
            <li key={item} className="flex gap-2">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-marine" />
              {t(locale, item)}
            </li>
          ))}
        </ul>
        {fx ? (
          <p className="tnum mt-5 text-xs text-muted-foreground">
            {t(locale, "Shilling figures at")} {Number(fx.rate).toLocaleString("en-US")} TZS / USD,{" "}
            {t(locale, "set")} {formatDate(fx.effectiveFrom)}.{" "}
            {t(locale, "Your invoice pins the rate on the day it is issued.")}
          </p>
        ) : null}
        <div className="mt-6 flex flex-wrap gap-3">
          <Button asChild>
            <Link href="/quote">{t(locale, "Get a quote")}</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/calculator">{t(locale, "Work out my CBM")}</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
