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
import { formatDate } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";

export const metadata: Metadata = { title: "Website content" };

export default async function ContentPage() {
  await requirePermission("content.manage");

  const sailings = await prisma.shipmentSchedule.findMany({
    orderBy: { departureDate: "asc" },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Website content"
        description="Sailings published on the public schedule. A deadline here is a commitment customers plan around."
      />
      <SectionTabs />

      <ScheduleForm />

      <Card>
        {sailings.length === 0 ? (
          <EmptyState
            icon="Ship"
            title="No sailings published"
            description="The public schedule page is empty until you add one."
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Vessel</TableHead>
                <TableHead>Cargo deadline</TableHead>
                <TableHead>Departs</TableHead>
                <TableHead>Arrives</TableHead>
                <TableHead>Public</TableHead>
                <TableHead className="text-right" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {sailings.map((sailing) => (
                <TableRow key={sailing.id}>
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
