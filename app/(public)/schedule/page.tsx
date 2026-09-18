import Link from "next/link";
import type { Metadata } from "next";
import { Ship } from "lucide-react";

import { Badge } from "@/components/ui/badge";
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
import { formatDate } from "@/lib/format";
import { DEFAULT_LOCALE, t } from "@/lib/i18n";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = {
  title: "Sailing schedule",
  description:
    "Upcoming Swift Cargo sailings from Guangzhou to Dar es Salaam, with cargo receiving deadlines.",
  alternates: { canonical: "/schedule" },
};

export const revalidate = 60;

/* Long enough to still show the sailing a customer just missed, short enough
   that last quarter's boats do not sit above next month's. */
const RECENTLY_SAILED_MS = 14 * 24 * 60 * 60 * 1000;

type Window = "open" | "closed" | "sailed";

export default async function SchedulePage() {
  const locale = DEFAULT_LOCALE;
  const now = Date.now();

  const sailings = await prisma.shipmentSchedule.findMany({
    where: {
      published: true,
      departureDate: { gte: new Date(now - RECENTLY_SAILED_MS) },
    },
    orderBy: { departureDate: "asc" },
    take: 30,
  });

  const windowOf = (s: (typeof sailings)[number]): Window =>
    s.departureDate.getTime() < now
      ? "sailed"
      : s.cargoDeadline.getTime() < now
        ? "closed"
        : "open";

  const badge = (w: Window) =>
    w === "open" ? (
      <Badge tone="good">{t(locale, "Accepting cargo")}</Badge>
    ) : w === "closed" ? (
      <Badge tone="neutral">{t(locale, "Closed for cargo")}</Badge>
    ) : (
      <Badge tone="progress">{t(locale, "Sailed")}</Badge>
    );

  return (
    <div className="container max-w-4xl py-12 sm:py-16">
      <p className="eyebrow text-marine">{t(locale, "Guangzhou to Dar es Salaam")}</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">
        {t(locale, "Sailing schedule")}
      </h1>
      <p className="mt-3 max-w-2xl text-muted-foreground">
        {t(
          locale,
          "Get your cargo to our Guangzhou warehouse before the deadline and it goes on that sailing."
        )}
      </p>

      {sailings.length === 0 ? (
        <Card className="mt-10 p-12 text-center">
          <Ship className="mx-auto size-8 text-muted-foreground" />
          <p className="mt-4 font-medium">{t(locale, "No sailings published at the moment")}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {t(locale, "Contact us and we will tell you when the next container closes.")}
          </p>
          <Button asChild variant="outline" className="mt-6">
            <Link href="/contact">{t(locale, "Contact us")}</Link>
          </Button>
        </Card>
      ) : (
        <>
          {/* Cards on a phone: five columns of dates do not fit 375 pixels. */}
          <ul className="mt-10 grid gap-3 sm:hidden">
            {sailings.map((sailing) => (
              <li key={sailing.id}>
                <Card className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium">
                        {sailing.vessel ?? t(locale, "Vessel to be confirmed")}
                      </p>
                      {sailing.voyage ? (
                        <p className="tnum text-xs text-muted-foreground">{sailing.voyage}</p>
                      ) : null}
                    </div>
                    {badge(windowOf(sailing))}
                  </div>
                  <dl className="tnum mt-4 grid grid-cols-3 gap-2 text-sm">
                    {(
                      [
                        ["Cargo deadline", sailing.cargoDeadline],
                        ["Departs", sailing.departureDate],
                        ["Arrives", sailing.estimatedArrival],
                      ] as const
                    ).map(([label, date]) => (
                      <div key={label}>
                        <dt className="text-xs text-muted-foreground">{t(locale, label)}</dt>
                        <dd className="font-medium">{formatDate(date)}</dd>
                      </div>
                    ))}
                  </dl>
                </Card>
              </li>
            ))}
          </ul>

          <Card className="mt-10 hidden sm:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t(locale, "Vessel")}</TableHead>
                  <TableHead>{t(locale, "Cargo deadline")}</TableHead>
                  <TableHead>{t(locale, "Departs")}</TableHead>
                  <TableHead>{t(locale, "Arrives")}</TableHead>
                  <TableHead>{t(locale, "Status")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sailings.map((sailing) => (
                  <TableRow key={sailing.id}>
                    <TableCell>
                      <span className="font-medium">
                        {sailing.vessel ?? t(locale, "To be confirmed")}
                      </span>
                      {sailing.voyage ? (
                        <span className="tnum block text-xs text-muted-foreground">
                          {sailing.voyage}
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell className="tnum text-sm">
                      {formatDate(sailing.cargoDeadline)}
                    </TableCell>
                    <TableCell className="tnum text-sm text-muted-foreground">
                      {formatDate(sailing.departureDate)}
                    </TableCell>
                    <TableCell className="tnum text-sm text-muted-foreground">
                      {formatDate(sailing.estimatedArrival)}
                    </TableCell>
                    <TableCell>{badge(windowOf(sailing))}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </>
      )}

      <p className="mt-6 text-xs text-muted-foreground">
        {t(
          locale,
          "Dates are indicative. Sailings slip for weather, port congestion and customs, and we will tell you when one does."
        )}
      </p>
    </div>
  );
}
