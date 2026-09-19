import type { Metadata } from "next";

import { DeleteScheduleButton, ScheduleForm } from "@/components/app/admin-forms";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { SectionTabs } from "@/components/app/section-tabs";
import { Badge } from "@/components/ui/badge";
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
import { prisma } from "@/lib/prisma";
import {
  DEFAULT_TRANSIT_DAYS,
  generateSailings,
  publicSailings,
} from "@/lib/sailing-schedule";
import { requirePermission } from "@/lib/session";

import { primeLocale, T } from "@/lib/server-t";
export const metadata: Metadata = { title: "Website content" };

/* A quarter of weeks to override, which is as far ahead as the public page
   looks. */
const WEEKS_OFFERED = 12;

const iso = (date: Date) => date.toISOString().slice(0, 10);

export default async function ContentPage() {
  await primeLocale();
  await requirePermission("content.manage");

  const [sailings, published, preview] = await Promise.all([
    prisma.shipmentSchedule.findMany({ orderBy: { departureDate: "asc" } }),
    Promise.resolve(generateSailings({ count: WEEKS_OFFERED })),
    publicSailings({ count: WEEKS_OFFERED }),
  ]);

  const taken = new Set(
    sailings
      .filter((row) => row.weekOf)
      .map((row) => iso(new Date(row.weekOf!)))
  );

  const weeks = published.map((week) => ({
    weekOf: iso(week.weekOf),
    label: `Sails ${formatDate(week.departureDate)} — cargo in by ${formatDate(week.cargoDeadline)}`,
    cargoDeadline: iso(week.cargoDeadline),
    loadingDate: iso(week.loadingDate),
    departureDate: iso(week.departureDate),
    taken: taken.has(iso(week.weekOf)),
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title={T("Website content")}
        description={T("The public schedule runs itself: cargo in by Friday, packed that Friday, sails Monday, thirty days at sea. Publish a row here only for the week that is different.")}
      />
      <SectionTabs />

      <ScheduleForm weeks={weeks} defaultTransitDays={DEFAULT_TRANSIT_DAYS} />

      <Card className="p-5">
        <p className="text-sm font-medium">{T("What the website is showing")}</p>
        <ul className="tnum mt-3 space-y-1 text-sm text-muted-foreground">
          {preview.slice(0, 6).map((sailing) => (
            <li key={sailing.key}>
              {formatDate(sailing.departureDate)} · cargo in by{" "}
              {formatDate(sailing.cargoDeadline)} · arrives about{" "}
              {formatDate(sailing.estimatedArrival)} ·{" "}
              {SAILING_STATUS_LABEL[sailing.status]}
              {sailing.source === "published" ? " · published row" : ""}
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        {sailings.length === 0 ? (
          <EmptyState
            icon="Ship"
            title={T("No sailings overridden")}
            description={T("The public schedule is running on the weekly rule, which is usually what you want.")}
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{T("Week")}</TableHead>
                <TableHead>{T("Vessel")}</TableHead>
                <TableHead>{T("Cargo deadline")}</TableHead>
                <TableHead>{T("Departs")}</TableHead>
                <TableHead>{T("Arrives")}</TableHead>
                <TableHead>{T("Status")}</TableHead>
                <TableHead>{T("Public")}</TableHead>
                <TableHead className="text-right" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {sailings.map((sailing) => (
                <TableRow key={sailing.id}>
                  <TableCell className="tnum text-sm">
                    {sailing.weekOf ? formatDate(sailing.weekOf) : "extra sailing"}
                  </TableCell>
                  <TableCell className="text-sm font-medium">
                    {sailing.vessel ?? "To be confirmed"}
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
                    <span className="block text-xs">{sailing.transitDays} days</span>
                  </TableCell>
                  <TableCell className="text-sm">
                    {SAILING_STATUS_LABEL[sailing.status]}
                  </TableCell>
                  <TableCell>
                    <Badge tone={sailing.published ? "good" : "neutral"}>
                      {sailing.published ? "live" : "hidden"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <DeleteScheduleButton id={sailing.id} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
