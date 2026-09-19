import type { Metadata } from "next";
import { Package, Scale, Ship, Warehouse } from "lucide-react";

import { KpiCard } from "@/components/app/kpi-card";
import { PageHeader } from "@/components/app/page-header";
import { SectionTabs } from "@/components/app/section-tabs";
import { SectionLabel } from "@/components/app/section-label";
import { BarChart } from "@/components/charts/bar-chart";
import { FlowBars } from "@/components/charts/flow-bars";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { monthlyVolume, warehouseFlow } from "@/lib/dashboard";
import { formatCbm, formatDate, formatWeight } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";

import { primeLocale, T } from "@/lib/server-t";
export const metadata: Metadata = { title: "Warehouse reports" };

/**
 * The warehouse's own numbers — throughput, not revenue.
 *
 * Deliberately separate from Finance's reports: a floor supervisor asking "how
 * much did we move this month" is asking a different question from "what did we
 * bill", and answering both on one page means neither is easy to find.
 */
export default async function ReportsPage() {
  await primeLocale();
  await requirePermission("warehouse.reports");

  const since = new Date();
  since.setDate(since.getDate() - 30);

  const [volume, flow, chinaTotals, darTotals, containers, oldest] =
    await Promise.all([
      monthlyVolume(),
      warehouseFlow(),
      prisma.chinaReceiving.aggregate({
        where: { receivedAt: { gte: since } },
        _sum: { packagesCount: true, cbm: true, weightKg: true },
        _count: { _all: true },
      }),
      prisma.darReceiving.aggregate({
        where: { receivedAt: { gte: since } },
        _sum: { packagesCount: true, weightKg: true },
        _count: { _all: true },
      }),
      prisma.container.findMany({
        where: { deletedAt: null },
        orderBy: { createdAt: "desc" },
        take: 10,
        include: {
          shipment: { select: { vessel: true, eta: true, actualArrival: true } },
          cargoLines: { select: { cbm: true, packagesCount: true } },
        },
      }),
      prisma.darReceiving.findMany({
        where: { cargo: { status: { in: ["RECEIVED_DAR", "READY_FOR_RELEASE"] } } },
        orderBy: { receivedAt: "asc" },
        take: 8,
        include: {
          cargo: {
            select: {
              id: true,
              reference: true,
              sender: { select: { fullName: true } },
            },
          },
        },
      }),
    ]);

  const now = Date.now();

  return (
    <div className="space-y-8">
      <PageHeader
        title={T("Warehouse reports")}
        description={T("Throughput at both ends over the last thirty days.")}
      />
      <SectionTabs />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          index={0}
          label={T("Received in China")}
          numeric={chinaTotals._count._all}
          icon={Warehouse}
          tone="brand"
          hint={T("Consignments, last 30 days")}
        />
        <KpiCard
          index={1}
          label={T("Volume taken in")}
          numeric={Number(chinaTotals._sum.cbm ?? 0)}
          decimals={2}
          suffix="CBM"
          icon={Package}
          tone="marine"
        />
        <KpiCard
          index={2}
          label={T("Received in Dar")}
          numeric={darTotals._count._all}
          icon={Ship}
          tone="success"
          hint={T("Consignments, last 30 days")}
        />
        <KpiCard
          index={3}
          label={T("Weight handled")}
          numeric={Number(darTotals._sum.weightKg ?? 0)}
          decimals={1}
          suffix="kg"
          icon={Scale}
          tone="signal"
        />
      </div>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{T("Volume shipped, by month")}</CardTitle>
          </CardHeader>
          <CardContent>
            <BarChart
              data={volume}
              tone={2}
              highlightIndex={volume.length - 1}
              formatValue={(n) => `${n.toFixed(2)} CBM`}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{T("Dar floor, last fortnight")}</CardTitle>
          </CardHeader>
          <CardContent>
            <FlowBars data={flow} inLabel="Received" outLabel="Released" />
          </CardContent>
        </Card>
      </section>

      <section>
        <SectionLabel>{T("Containers")}</SectionLabel>
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{T("Container")}</TableHead>
                <TableHead>{T("Vessel")}</TableHead>
                <TableHead className="text-right">{T("Consignments")}</TableHead>
                <TableHead className="text-right">{T("Volume")}</TableHead>
                <TableHead className="text-right">{T("Fill")}</TableHead>
                <TableHead>{T("Status")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {containers.map((container) => {
                const cbm = container.cargoLines.reduce(
                  (sum, l) => sum + Number(l.cbm),
                  0
                );
                const fill = container.capacityCbm
                  ? Math.round((cbm / Number(container.capacityCbm)) * 100)
                  : null;
                return (
                  <TableRow key={container.id}>
                    <TableCell className="tnum text-sm font-medium">
                      {container.containerNumber ?? container.reference}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {container.shipment?.vessel ?? "—"}
                    </TableCell>
                    <TableCell className="tnum text-right text-sm">
                      {container.cargoLines.length}
                    </TableCell>
                    <TableCell className="tnum text-right text-sm">
                      {formatCbm(cbm)}
                    </TableCell>
                    <TableCell className="tnum text-right text-sm">
                      {fill !== null ? `${fill}%` : "—"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {container.status.toLowerCase()}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      </section>

      <section>
        <SectionLabel>{T("Longest on the floor")}</SectionLabel>
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{T("Cargo")}</TableHead>
                <TableHead>{T("Customer")}</TableHead>
                <TableHead>{T("Received")}</TableHead>
                <TableHead className="text-right">{T("Days")}</TableHead>
                <TableHead>{T("Location")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {oldest.map((row) => {
                const days = Math.floor(
                  (now - row.receivedAt.getTime()) / 86_400_000
                );
                return (
                  <TableRow key={row.id}>
                    <TableCell className="tnum text-sm font-medium">
                      {row.cargo.reference}
                    </TableCell>
                    <TableCell className="text-sm">
                      {row.cargo.sender.fullName}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDate(row.receivedAt)}
                    </TableCell>
                    <TableCell className="tnum text-right text-sm font-medium">
                      {days}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {row.location ?? "—"}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      </section>
    </div>
  );
}
