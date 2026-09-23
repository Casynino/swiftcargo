import { redirect } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import type { CargoStatus } from "@prisma/client";
import {
  AlertTriangle,
  CheckCircle2,
  PackageCheck,
  Plus,
  Ship,
  Warehouse,
} from "lucide-react";

import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { SectionTabs } from "@/components/app/section-tabs";
import { CargoStatusBadge } from "@/components/app/status-badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CARGO_STATUS_META } from "@/lib/constants";
import { formatCbm, formatDate } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { requirePermission } from "@/lib/session";

import { primeLocale, T } from "@/lib/server-t";
import { Tx } from "@/components/app/tx";
export const metadata: Metadata = { title: "Cargo" };

const STATUSES = Object.keys(CARGO_STATUS_META) as CargoStatus[];

/**
 * THE JOURNEY IN FIVE PLACES.
 *
 * Thirteen statuses is the record's vocabulary, not the desk's. Somebody
 * looking at this list wants to know where the cargo physically is — still in
 * Guangzhou, on the water, on the Dar floor, waiting at the counter, gone — so
 * the cards count by place and each one filters the list to exactly the rows
 * it counted. A card whose number disagrees with the table under it is worse
 * than no card.
 */
const STAGES = {
  china: {
    label: "In China",
    hint: "Received, not yet sailed",
    statuses: ["REGISTERED", "RECEIVED_CHINA", "ASSIGNED_TO_CONTAINER", "CONTAINER_LOADED"],
    icon: Warehouse,
    tone: "marine",
  },
  sea: {
    label: "At sea",
    hint: "Sailed, not yet counted in Dar",
    statuses: ["DEPARTED_CHINA", "IN_TRANSIT", "ARRIVED_TANZANIA"],
    icon: Ship,
    tone: "brand",
  },
  dar: {
    label: "On the Dar floor",
    hint: "Counted at Dar, not yet paid",
    statuses: ["RECEIVED_DAR"],
    icon: PackageCheck,
    tone: "signal",
  },
  ready: {
    label: "Ready to collect",
    hint: "Paid, pickup note out",
    statuses: ["READY_FOR_RELEASE"],
    icon: CheckCircle2,
    tone: "success",
  },
  gone: {
    label: "Collected",
    hint: "Handed over",
    statuses: ["COLLECTED", "DELIVERED"],
    icon: CheckCircle2,
    tone: "success",
  },
  missing: {
    label: "Missing at Dar",
    hint: "On the manifest, not on the floor",
    statuses: ["MISSING_AT_DAR"],
    icon: AlertTriangle,
    tone: "danger",
  },
} as const satisfies Record<
  string,
  {
    label: string;
    hint: string;
    statuses: CargoStatus[];
    icon: typeof Ship;
    tone: "brand" | "marine" | "signal" | "success" | "warning" | "danger";
  }
>;
type Stage = keyof typeof STAGES;

export default async function CargoPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; stage?: string }>;
}) {
  await primeLocale();
  const user = await requirePermission("cargo.viewAll");
  /* Finance works money by container and by who owes, not down a list of every
     consignment — the list is off its sidebar, and a stray link lands on the
     call list instead of a screen that desk has no use for. */
  if (user.role === "FINANCE") redirect("/app/finance/collections");
  const { q, status, stage } = await searchParams;
  const stageFilter = stage && stage in STAGES ? (stage as Stage) : null;
  const query = q?.trim() ?? "";
  const statusFilter = STATUSES.includes(status as CargoStatus)
    ? (status as CargoStatus)
    : null;

  const cargo = await prisma.cargo.findMany({
    where: {
      deletedAt: null,
      ...(statusFilter
        ? { status: statusFilter }
        : stageFilter
          ? { status: { in: [...STAGES[stageFilter].statuses] } }
          : {}),
      ...(query
        ? {
            OR: [
              { reference: { contains: query, mode: "insensitive" as const } },
              { shippingMark: { contains: query, mode: "insensitive" as const } },
              { description: { contains: query, mode: "insensitive" as const } },
              { supplierRef: { contains: query, mode: "insensitive" as const } },
              {
                sender: {
                  OR: [
                    { fullName: { contains: query, mode: "insensitive" as const } },
                    { phone: { contains: query } },
                    { code: { contains: query, mode: "insensitive" as const } },
                  ],
                },
              },
            ],
          }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      sender: { select: { fullName: true, code: true } },
      chinaReceiving: { select: { packagesCount: true, cbm: true } },
      containerLines: {
        include: { container: { select: { reference: true, containerNumber: true } } },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title={T("Cargo")}
        description={T("Every consignment, wherever it is on the journey.")}
        actions={
          /* THERE IS ONE WAY A CONSIGNMENT COMES INTO EXISTENCE, and it is the
             receiving counter. A second form that booked cargo in advance meant
             two records for the same boxes as often as not — the thing the
             warehouse was most explicit about not wanting. */
          can(user.role, "receiving.china") ? (
            <Button asChild>
              <Link href="/app/receive/new">
                <Plus />
                {T("Receive cargo")}
              </Link>
            </Button>
          ) : null
        }
      />
      <SectionTabs />

      <form className="flex flex-wrap gap-3">
        {stageFilter ? (
          <input type="hidden" name="stage" value={stageFilter} />
        ) : null}
        <Input
          name="q"
          defaultValue={query}
          placeholder={T("Reference, mark, customer, supplier ref…")}
          className="max-w-sm"
          aria-label={T("Search cargo")}
        />
        <NativeSelect
          name="status"
          defaultValue={statusFilter ?? ""}
          className="w-56"
          aria-label={T("Filter by status")}
        >
          <option value="">{T("Any status")}</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {CARGO_STATUS_META[s].label}
            </option>
          ))}
        </NativeSelect>
        <Button type="submit" variant="outline">
          {T("Filter")}
        </Button>
      </form>

      <Card>
        {cargo.length === 0 ? (
          <EmptyState
            icon="Package"
            title={
              query || statusFilter || stageFilter
                ? T("Nothing matches")
                : T("No cargo yet")
            }
            description={
              query || statusFilter || stageFilter
                ? T("Try a different reference or clear the filter.")
                : T("Register the first consignment to get started.")
            }
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{T("Reference")}</TableHead>
                <TableHead>{T("Customer")}</TableHead>
                <TableHead className="hidden lg:table-cell">{T("Description")}</TableHead>
                <TableHead className="hidden md:table-cell">{T("Container")}</TableHead>
                <TableHead className="text-right">{T("Pkgs")}</TableHead>
                <TableHead className="text-right">CBM</TableHead>
                <TableHead>{T("Status")}</TableHead>
                <TableHead className="hidden xl:table-cell">{T("Booked")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {cargo.map((item) => {
                const container = item.containerLines.at(-1)?.container;
                return (
                  <TableRow key={item.id}>
                    <TableCell>
                      <Link
                        href={`/app/cargo/${item.id}`}
                        className="tnum font-medium hover:underline"
                      >
                        {item.reference}
                      </Link>
                      {item.shippingMark ? (
                        <span className="tnum block text-xs text-muted-foreground">
                          {item.shippingMark}
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-sm">
                      {item.sender.fullName}
                    </TableCell>
                    <TableCell className="hidden max-w-xs truncate text-sm text-muted-foreground lg:table-cell">
                      <Tx>{item.description}</Tx>
                    </TableCell>
                    <TableCell className="tnum hidden text-sm text-muted-foreground md:table-cell">
                      {container?.reference ?? "—"}
                    </TableCell>
                    <TableCell className="tnum text-right text-sm">
                      {item.chinaReceiving?.packagesCount ??
                        item.declaredPackages ??
                        "—"}
                    </TableCell>
                    <TableCell className="tnum text-right text-sm">
                      {item.chinaReceiving
                        ? formatCbm(item.chinaReceiving.cbm)
                        : item.declaredCbm
                          ? formatCbm(item.declaredCbm)
                          : "—"}
                    </TableCell>
                    <TableCell>
                      <CargoStatusBadge status={item.status} />
                    </TableCell>
                    <TableCell className="hidden text-sm text-muted-foreground xl:table-cell">
                      {formatDate(item.createdAt)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
