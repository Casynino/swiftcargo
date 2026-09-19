import Link from "next/link";
import type { Metadata } from "next";
import { ChevronRight } from "lucide-react";

import { EmptyState } from "@/components/app/empty-state";
import { ContainerTabs } from "@/components/app/container-tabs";
import { PageHeader } from "@/components/app/page-header";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCbm, formatDate, formatMoney } from "@/lib/format";
import { outstandingOf } from "@/lib/invoice-balance";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { cn } from "@/lib/utils";

import { primeLocale, T } from "@/lib/server-t";
import { Tx } from "@/components/app/tx";
export const metadata: Metadata = { title: "Closed containers" };

/**
 * WHAT EACH FINISHED SAILING MADE.
 *
 * A container is closed when everything on it has been handed over. Only then
 * is the margin real: an open sailing can still take a demurrage charge, and a
 * customer can still fail to pay, so a profit figure quoted before the box is
 * empty is a forecast wearing the clothes of a result.
 *
 * Money still owed on a closed container is named rather than netted away. It
 * is the number that decides whether this sailing actually made what it says.
 */
export default async function ClosedContainersPage() {
  await primeLocale();
  await requirePermission("accounting.view");

  const containers = await prisma.container.findMany({
    where: { deletedAt: null, status: "CLOSED" },
    orderBy: { updatedAt: "desc" },
    take: 60,
    include: {
      shipment: { select: { vessel: true, actualArrival: true } },
      expenses: {
        where: { deletedAt: null, cancelledAt: null },
        select: { amount: true, currency: true, fxRate: true },
      },
      cargoLines: {
        include: {
          cargo: {
            select: {
              receiverId: true,
              darReceiving: { select: { cbm: true } },
              invoices: {
                where: { status: { not: "CANCELLED" } },
                include: { payments: true },
              },
            },
          },
        },
      },
    },
  });

  const rows = containers.map((container) => {
    const cargo = container.cargoLines.map((l) => l.cargo);
    const live = cargo.flatMap((c) =>
      c.invoices.filter((i) => i.status !== "DRAFT")
    );
    const billed = live.reduce((sum, i) => sum + Number(i.total), 0);
    const owing = live.reduce((sum, i) => sum + Number(outstandingOf(i)), 0);
    /* At the rate pinned on each cost. Adding shillings to dollars is how a
       sailing reads a thousand times what it spent. */
    const spent = container.expenses.reduce(
      (sum, e) =>
        sum +
        (e.currency === "USD"
          ? Number(e.amount)
          : Number(e.fxRate) > 1
            ? Number(e.amount) / Number(e.fxRate)
            : 0),
      0
    );
    return {
      container,
      cargo: cargo.length,
      customers: new Set(cargo.map((c) => c.receiverId)).size,
      cbm: cargo.reduce((sum, c) => sum + Number(c.darReceiving?.cbm ?? 0), 0),
      billed,
      owing,
      collected: billed - owing,
      spent,
      /* Collected, not billed. A bill nobody paid is not margin. */
      profit: billed - owing - spent,
    };
  });

  const total = (pick: (r: (typeof rows)[number]) => number) =>
    rows.reduce((sum, r) => sum + pick(r), 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title={T("Closed containers")}
        description={T("Sailings where everything has been handed over. Collected against what it cost — the only point at which a margin is a result rather than a forecast.")}
      />
      <ContainerTabs />

      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-3 xl:grid-cols-5">
        {[
          { label: "Containers", value: String(rows.length), tone: "" },
          {
            label: "Billed",
            value: formatMoney(total((r) => r.billed), "USD"),
            tone: "",
          },
          {
            label: "Collected",
            value: formatMoney(total((r) => r.collected), "USD"),
            tone: "text-success",
          },
          {
            label: "Spent",
            value: formatMoney(total((r) => r.spent), "USD"),
            tone: "text-destructive",
          },
          {
            label: "Made",
            value: formatMoney(total((r) => r.profit), "USD"),
            tone: total((r) => r.profit) < 0 ? "text-destructive" : "text-success",
          },
        ].map((stat) => (
          <div key={stat.label} className="bg-card px-4 py-4">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
              <Tx>{stat.label}</Tx>
            </p>
            <p className={cn("tnum mt-1 text-xl font-semibold", stat.tone)}>
              {stat.value}
            </p>
          </div>
        ))}
      </div>

      <Card>
        {rows.length === 0 ? (
          <EmptyState
            icon="ClipboardCheck"
            title={T("Nothing is closed yet")}
            description={T("A container closes once every consignment on it has been handed over at the Dar counter.")}
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{T("Container")}</TableHead>
                <TableHead>{T("Vessel")}</TableHead>
                <TableHead className="hidden lg:table-cell">{T("Arrived")}</TableHead>
                <TableHead className="text-right">{T("Cargo")}</TableHead>
                <TableHead className="text-right">{T("Volume")}</TableHead>
                <TableHead className="text-right">{T("Billed")}</TableHead>
                <TableHead className="text-right">{T("Collected")}</TableHead>
                <TableHead className="text-right">{T("Still owed")}</TableHead>
                <TableHead className="text-right">{T("Spent")}</TableHead>
                <TableHead className="text-right">{T("Made")}</TableHead>
                <TableHead className="w-8" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.container.id}>
                  <TableCell className="tnum text-sm font-medium">
                    {row.container.reference}
                  </TableCell>
                  <TableCell className="text-sm">
                    {row.container.shipment?.vessel ?? "—"}
                  </TableCell>
                  <TableCell className="tnum hidden whitespace-nowrap text-sm text-muted-foreground lg:table-cell">
                    {row.container.shipment?.actualArrival
                      ? formatDate(row.container.shipment.actualArrival)
                      : "—"}
                  </TableCell>
                  <TableCell className="tnum text-right text-sm">
                    {row.cargo}
                    <span className="block text-xs text-muted-foreground">
                      {row.customers} customer{row.customers === 1 ? "" : "s"}
                    </span>
                  </TableCell>
                  <TableCell className="tnum text-right text-sm">
                    {row.cbm > 0 ? formatCbm(row.cbm) : "—"}
                  </TableCell>
                  <TableCell className="tnum text-right text-sm">
                    {formatMoney(row.billed, "USD")}
                  </TableCell>
                  <TableCell className="tnum text-right text-sm text-success">
                    {formatMoney(row.collected, "USD")}
                  </TableCell>
                  <TableCell
                    className={cn(
                      "tnum text-right text-sm",
                      row.owing > 0
                        ? "text-destructive"
                        : "text-muted-foreground"
                    )}
                  >
                    {row.owing > 0 ? formatMoney(row.owing, "USD") : "—"}
                  </TableCell>
                  <TableCell className="tnum text-right text-sm text-destructive">
                    {row.spent > 0 ? formatMoney(row.spent, "USD") : "—"}
                  </TableCell>
                  <TableCell
                    className={cn(
                      "tnum text-right text-sm font-semibold",
                      row.profit < 0 ? "text-destructive" : "text-success"
                    )}
                  >
                    {formatMoney(row.profit, "USD")}
                  </TableCell>
                  <TableCell className="p-0">
                    <Link
                      href={`/app/containers/${row.container.id}`}
                      className="flex items-center justify-center px-3 py-3 text-muted-foreground"
                      aria-label={`Open ${row.container.reference}`}
                    >
                      <ChevronRight className="size-4" />
                    </Link>
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
