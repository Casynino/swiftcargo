import Link from "next/link";
import type { Metadata } from "next";
import { ChevronRight, Ship } from "lucide-react";

import { ContainerTabs } from "@/components/app/container-tabs";
import { PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { CONTAINER_STATUS_LABELS } from "@/lib/constants";
import { loadBooks } from "@/lib/finance-report";
import { formatDate } from "@/lib/format";
import { requirePermission } from "@/lib/session";
import { cn } from "@/lib/utils";

import { primeLocale, T } from "@/lib/server-t";
export const metadata: Metadata = { title: "Container finances" };

const fmt = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "TZS", maximumFractionDigits: 0 }).format(n);

/**
 * WHAT EVERY SAILING EARNED AND WHAT IT COST.
 *
 * Worst margin first, because the box that lost money is the one somebody has
 * to explain. A container with nothing billed and nothing spent has no margin
 * at all and sorts after the ones that do — "zero percent" is not "worst".
 *
 * Shillings, each bill and each cost at the rate pinned on it. Open one to
 * read its whole book: every payment, every cost, everything still owed.
 */
export default async function ContainerFinancesPage() {
  await primeLocale();
  await requirePermission("finance.view");
  const books = await loadBooks();

  const rows = books.boxes
    .map((c) => ({
      ...c,
      margin: c.revenue.usd > 0 ? c.profit.usd / c.revenue.usd : null,
    }))
    .sort((a, b) => {
      if (a.margin === null && b.margin === null)
        return (b.departed ?? b.arrived ?? new Date(0)).getTime() - (a.departed ?? a.arrived ?? new Date(0)).getTime();
      if (a.margin === null) return 1;
      if (b.margin === null) return -1;
      return a.margin - b.margin;
    });

  return (
    <div className="space-y-6">
      <PageHeader
        title={T("Container finances")}
        description={T("What every sailing earned and what it cost. Open one to read its whole book — every payment, every cost, and everything still owed on it.")}
      />
      <ContainerTabs />

      <section className="space-y-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
          {T("Every container, worst margin first")}
        </h2>
        <div className="relative overflow-x-auto rounded-xl border bg-card">
          <table className="w-full min-w-[44rem] text-sm">
            <thead>
              <tr className="border-b text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-3 font-medium">{T("Container")}</th>
                <th className="px-4 py-3 text-right font-medium">{T("Revenue")}</th>
                <th className="px-4 py-3 text-right font-medium">{T("Collected")}</th>
                <th className="px-4 py-3 text-right font-medium">{T("Outstanding")}</th>
                <th className="px-4 py-3 text-right font-medium">{T("Costs")}</th>
                <th className="px-4 py-3 text-right font-medium">{T("Profit / loss")}</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((c) => {
                const href = `/app/finance/containers/${c.id}`;
                const when = c.arrived ?? c.departed;
                return (
                  <tr key={c.id} className="hover:bg-secondary/30">
                    <td className="px-4 py-3">
                      <Link href={href} className="tnum font-semibold hover:underline">
                        {c.reference}
                      </Link>
                      <span className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <Ship className="size-3" />
                        {c.from}
                        {when ? ` · ${formatDate(when)}` : ""} · {c.cargo} consignments
                        <Badge
                          tone={
                            c.status === "ARRIVED" || c.status === "CLOSED"
                              ? "good"
                              : c.status === "DEPARTED" || c.status === "IN_TRANSIT"
                                ? "progress"
                                : "warn"
                          }
                        >
                          {CONTAINER_STATUS_LABELS[c.status]}
                        </Badge>
                      </span>
                    </td>
                    <td className="tnum px-4 py-3 text-right font-semibold">{fmt(c.billed.tzs)}</td>
                    <td className="tnum px-4 py-3 text-right text-success">{fmt(c.collected.tzs)}</td>
                    <td className="tnum px-4 py-3 text-right text-warning">{fmt(c.owed.tzs)}</td>
                    <td className="tnum px-4 py-3 text-right text-destructive">{fmt(c.spent.tzs)}</td>
                    <td className={cn("tnum px-4 py-3 text-right font-semibold", c.profit.usd < 0 ? "text-destructive" : "text-success")}>
                      {fmt(c.profit.tzs)}
                    </td>
                    <td className="p-0">
                      <Link href={href} className="flex items-center justify-center px-3 py-3 text-muted-foreground hover:text-foreground" aria-label={`Open ${c.reference}`}>
                        <ChevronRight className="size-4" />
                      </Link>
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-sm text-muted-foreground">
                    {T("No container has a bill or a cost on it yet.")}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
