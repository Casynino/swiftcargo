import Link from "next/link";
import type { Metadata } from "next";
import { History, Package, Users } from "lucide-react";

import { EmptyState } from "@/components/app/empty-state";
import { KpiCard } from "@/components/app/kpi-card";
import { PageHeader } from "@/components/app/page-header";
import { SectionTabs } from "@/components/app/section-tabs";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDateTime } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";

import { primeLocale, T } from "@/lib/server-t";
export const metadata: Metadata = { title: "Collected cargo" };

const METHOD_LABELS: Record<string, string> = {
  COLLECTION: "Collected at the counter",
  DELIVERY: "Delivered",
};

/**
 * WHAT HAS ALREADY GONE.
 *
 * The floor answers "is it still here"; this answers "who took it, when, and
 * who signed". Read when a customer rings to say they never received goods that
 * left the building a fortnight ago — which is the only reason anybody opens a
 * release record, and the reason the person who collected is stored by name,
 * phone and ID rather than assumed to be the customer.
 */
export default async function CollectedCargoPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  await primeLocale();
  await requirePermission("release.execute");
  const { q } = await searchParams;
  const query = q?.trim() ?? "";

  const [releases, total, thisMonth] = await Promise.all([
    prisma.release.findMany({
      where: query
        ? {
            OR: [
              { number: { contains: query, mode: "insensitive" } },
              { collectedByName: { contains: query, mode: "insensitive" } },
              { collectedByPhone: { contains: query } },
              { cargo: { reference: { contains: query, mode: "insensitive" } } },
              {
                cargo: {
                  receiver: {
                    fullName: { contains: query, mode: "insensitive" },
                  },
                },
              },
            ],
          }
        : {},
      orderBy: { releasedAt: "desc" },
      take: 200,
      include: {
        cargo: {
          select: {
            id: true,
            reference: true,
            description: true,
            receiver: { select: { fullName: true, phone: true } },
          },
        },
        releasedBy: { select: { name: true } },
      },
    }),
    prisma.release.count(),
    prisma.release.count({
      where: {
        releasedAt: {
          gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
        },
      },
    }),
  ]);

  const packages = releases.reduce((sum, r) => sum + r.packagesReleased, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title={T("Collected cargo")}
        description={T("Everything that has left the Dar warehouse, newest first — who took it and who handed it over.")}
      />
      <SectionTabs />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <KpiCard
          index={0}
          label={T("Released, all time")}
          numeric={total}
          icon={History}
          tone="brand"
        />
        <KpiCard
          index={1}
          label={T("Released this month")}
          numeric={thisMonth}
          icon={Users}
          tone="success"
        />
        <KpiCard
          index={2}
          label={T("Packages on this page")}
          numeric={packages}
          icon={Package}
          tone="marine"
        />
      </div>

      <form>
        <Input
          name="q"
          defaultValue={query}
          placeholder={T("Tracking number, customer, or who collected…")}
          className="max-w-lg"
          aria-label={T("Search collected cargo")}
        />
      </form>

      <Card>
        {releases.length === 0 ? (
          <EmptyState
            icon="DoorOpen"
            title={query ? T("Nothing matches") : T("Nothing has been released yet")}
            description={
              query
                ? T("Try the tracking number, or the name of the person who collected.")
                : T("Cargo shows up here the moment it is handed over.")
            }
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{T("Customer")}</TableHead>
                <TableHead>{T("Tracking no.")}</TableHead>
                <TableHead className="hidden lg:table-cell">{T("Goods")}</TableHead>
                <TableHead>{T("Collected by")}</TableHead>
                <TableHead className="text-right">{T("Pkgs")}</TableHead>
                <TableHead>{T("How")}</TableHead>
                <TableHead>{T("Released")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {releases.map((release) => (
                <TableRow key={release.id}>
                  <TableCell className="text-sm font-semibold">
                    {release.cargo.receiver.fullName}
                    <span className="tnum block text-xs font-normal text-muted-foreground">
                      {release.cargo.receiver.phone}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Link
                      href={`/app/cargo/${release.cargo.id}`}
                      className="tnum text-sm font-medium hover:underline"
                    >
                      {release.cargo.reference}
                    </Link>
                    <span className="tnum block text-xs text-muted-foreground">
                      {release.number}
                    </span>
                  </TableCell>
                  <TableCell className="hidden max-w-[16rem] truncate text-sm text-muted-foreground lg:table-cell">
                    {release.cargo.description}
                  </TableCell>
                  <TableCell className="text-sm">
                    {/* Blank means the customer themselves — the form only asks
                        for a name when somebody else is at the counter. */}
                    {release.collectedByName ?? release.cargo.receiver.fullName}
                    {release.collectedByPhone ? (
                      <span className="tnum block text-xs text-muted-foreground">
                        {release.collectedByPhone}
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell className="tnum text-right text-sm">
                    {release.packagesReleased}
                  </TableCell>
                  <TableCell>
                    <Badge tone="neutral">
                      {METHOD_LABELS[release.method] ?? release.method}
                    </Badge>
                  </TableCell>
                  <TableCell className="tnum text-sm text-muted-foreground">
                    {formatDateTime(release.releasedAt)}
                    {release.releasedBy ? (
                      <span className="block text-xs">
                        by {release.releasedBy.name}
                      </span>
                    ) : null}
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
