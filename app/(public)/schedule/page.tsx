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
import { SAILING_STATUS_LABEL } from "@/lib/constants";
import { formatDate } from "@/lib/format";
import { DEFAULT_LOCALE, t } from "@/lib/i18n";
import { ARRIVAL_CAVEAT, publicSailings, type Sailing } from "@/lib/sailing-schedule";

export const metadata: Metadata = {
  title: "Sailing schedule",
  description:
    "Upcoming Swift Cargo sailings from Guangzhou to Dar es Salaam, with cargo receiving deadlines.",
  alternates: { canonical: "/schedule" },
};

export const revalidate = 60;

/* A quarter ahead. Far enough that somebody ordering from a factory today can
   see the week their goods will be ready for, and no further — the rule holds
   for ever, but a date twelve months out is a promise nobody has made. */
const WEEKS_SHOWN = 12;

const TONE: Record<Sailing["status"], "good" | "warn" | "neutral" | "progress" | "bad"> = {
  OPEN_FOR_BOOKING: "good",
  CUTOFF_APPROACHING: "warn",
  CLOSED: "neutral",
  DEPARTED: "progress",
  IN_TRANSIT: "progress",
  ARRIVED: "neutral",
  DELAYED: "warn",
  CANCELLED: "bad",
};

export default async function SchedulePage() {
  const locale = DEFAULT_LOCALE;
  const sailings = await publicSailings({ count: WEEKS_SHOWN });

  const badge = (sailing: Sailing) => (
    <Badge tone={TONE[sailing.status]}>
      {t(locale, SAILING_STATUS_LABEL[sailing.status])}
    </Badge>
  );

  const bookHref = (sailing: Sailing) =>
    `/book?sailing=${sailing.weekOf.toISOString().slice(0, 10)}`;

  return (
    <div className="container max-w-5xl py-12 sm:py-16">
      <p className="eyebrow text-marine">{t(locale, "Guangzhou to Dar es Salaam")}</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">
        {t(locale, "Sailing schedule")}
      </h1>
      <p className="mt-3 max-w-2xl text-muted-foreground">
        {t(
          locale,
          "We take cargo in Guangzhou until Friday, pack the container that Friday, and the ship leaves on Monday. Get your goods to the warehouse before the deadline and they are on that sailing."
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
          {/* Cards on a phone: six columns of dates do not fit 375 pixels. */}
          <ul className="mt-10 grid gap-3 sm:hidden">
            {sailings.map((sailing) => (
              <li key={sailing.weekOf.toISOString()}>
                <Card className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium">
                        {sailing.vessel ?? t(locale, "Vessel to be confirmed")}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {sailing.origin} → {sailing.destination}
                      </p>
                      {sailing.reference ? (
                        <p className="tnum text-xs text-muted-foreground">{sailing.reference}</p>
                      ) : null}
                    </div>
                    {badge(sailing)}
                  </div>
                  <dl className="tnum mt-4 grid grid-cols-2 gap-3 text-sm">
                    {(
                      [
                        ["Last day for cargo", sailing.cargoDeadline],
                        ["Container packed", sailing.loadingDate],
                        ["Departs China", sailing.departureDate],
                        ["Estimated arrival", sailing.estimatedArrival],
                      ] as const
                    ).map(([label, date]) => (
                      <div key={label}>
                        <dt className="text-xs text-muted-foreground">{t(locale, label)}</dt>
                        <dd className="font-medium">{formatDate(date)}</dd>
                      </div>
                    ))}
                  </dl>
                  {sailing.notes ? (
                    <p className="mt-3 rounded-md bg-secondary px-3 py-2 text-xs">
                      {sailing.notes}
                    </p>
                  ) : null}
                  {sailing.bookingOpen ? (
                    <Button asChild size="sm" variant="outline" className="mt-4 w-full">
                      <Link href={bookHref(sailing)}>{t(locale, "Book this sailing")}</Link>
                    </Button>
                  ) : null}
                </Card>
              </li>
            ))}
          </ul>

          <Card className="mt-10 hidden sm:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t(locale, "Sailing")}</TableHead>
                  <TableHead>{t(locale, "Last day for cargo")}</TableHead>
                  <TableHead>{t(locale, "Container packed")}</TableHead>
                  <TableHead>{t(locale, "Departs China")}</TableHead>
                  <TableHead>{t(locale, "Estimated arrival")}</TableHead>
                  <TableHead>{t(locale, "Status")}</TableHead>
                  <TableHead className="text-right">{t(locale, "Booking")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sailings.map((sailing) => (
                  <TableRow key={sailing.weekOf.toISOString()}>
                    <TableCell>
                      <span className="font-medium">
                        {sailing.vessel ?? t(locale, "To be confirmed")}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {sailing.origin} → {sailing.destination}
                      </span>
                      {sailing.reference ? (
                        <span className="tnum block text-xs text-muted-foreground">
                          {sailing.reference}
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell className="tnum text-sm font-medium">
                      {formatDate(sailing.cargoDeadline)}
                    </TableCell>
                    <TableCell className="tnum text-sm text-muted-foreground">
                      {formatDate(sailing.loadingDate)}
                    </TableCell>
                    <TableCell className="tnum text-sm text-muted-foreground">
                      {formatDate(sailing.departureDate)}
                    </TableCell>
                    <TableCell className="tnum text-sm text-muted-foreground">
                      {formatDate(sailing.estimatedArrival)}
                    </TableCell>
                    <TableCell>
                      {badge(sailing)}
                      {sailing.notes ? (
                        <span className="mt-1 block max-w-[16rem] text-xs text-muted-foreground">
                          {sailing.notes}
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-right">
                      {sailing.bookingOpen ? (
                        <Button asChild size="sm" variant="ghost">
                          <Link href={bookHref(sailing)}>{t(locale, "Book")}</Link>
                        </Button>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          {t(locale, "Closed")}
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </>
      )}

      <p className="mt-6 text-xs text-muted-foreground">{t(locale, ARRIVAL_CAVEAT)}</p>
      <p className="mt-2 text-xs text-muted-foreground">
        {t(
          locale,
          "Sailings slip for weather, port congestion and customs, and we will tell you when one does."
        )}
      </p>
    </div>
  );
}
