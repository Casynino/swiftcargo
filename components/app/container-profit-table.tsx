import Link from "next/link";
import { ChevronDown, TriangleAlert } from "lucide-react";

import { formatCurrency } from "@/lib/currency";
import { t, type Locale } from "@/lib/i18n";
import type { ContainerProfit } from "@/lib/manager-overview";
import { cn } from "@/lib/utils";

import { Tx } from "@/components/app/tx";
/**
 * Every recent container, and whether it is expected to make money.
 *
 * Revenue here is BILLED, not banked, so it and everything derived from it are
 * expectations — the labels say so. Collected is the only column describing
 * money the business actually holds.
 *
 * The company earns per sailing, so this is the row the business is run on. A
 * month-level profit cannot say that one box paid for itself and the next did
 * not.
 *
 * Two honesty markers. A container with no costs recorded is flagged rather
 * than shown as pure profit — ocean freight and clearing are always paid, so a
 * zero means nobody has written them down. A container still carrying draft
 * bills is flagged too, because its revenue will move.
 *
 * Shillings throughout, each bill and cost at the rate pinned on it.
 */

/* Five rows, then it scrolls: a summary on the home screen must not become the
   tallest thing on it as the sailings pile up. The header is sticky, because
   scrolling a money table whose column names have gone is how a reader mistakes
   Collected for Outstanding. */
const VISIBLE_ROWS = 5;

export function ContainerProfitTable({
  containers,
  locale,
}: {
  containers: ContainerProfit[];
  locale: Locale;
}) {
  const money = (n: number) => formatCurrency(n, "TZS");
  const signed = (n: number) => (n < 0 ? `(${money(Math.abs(n))})` : money(n));
  const hidden = Math.max(0, containers.length - VISIBLE_ROWS);

  if (containers.length === 0) {
    return (
      <section className="rounded-xl border bg-card p-5 shadow-soft">
        <h2 className="font-semibold">{t(locale, "Containers")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {t(locale, "No container has sailed yet.")}
        </p>
      </section>
    );
  }

  const flags = (c: ContainerProfit) => (
    <>
      {!c.hasCosts ? (
        <span className="inline-flex items-center gap-1 rounded bg-signal/10 px-1.5 py-0.5 text-[11px] text-signal">
          <TriangleAlert className="size-3" />
          {t(locale, "no costs recorded")}
        </span>
      ) : null}
      {c.unconfirmed > 0 ? (
        <span className="rounded bg-warning/10 px-1.5 py-0.5 text-[11px] text-warning">
          {c.unconfirmed} {t(locale, "still a draft")}
        </span>
      ) : null}
    </>
  );

  return (
    <section className="overflow-hidden rounded-xl border bg-card shadow-soft">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b px-5 py-4">
        <h2 className="font-semibold">{t(locale, "What each container is making")}</h2>
        <p className="text-xs text-muted-foreground">
          {t(locale, "Billed against what it cost. Only Collected is money in the bank.")}
        </p>
      </div>

      {/* Below md each container is a card with its figures labelled, rather
          than seven money columns dragged sideways on a phone. */}
      <ul className="max-h-[440px] divide-y overflow-y-auto md:hidden">
        {containers.map((c) => (
          <li key={c.id} className="px-4 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <Link href={`/app/finance/containers/${c.id}`} className="tnum focus-ring rounded font-medium hover:underline">
                {c.reference}
              </Link>
              {flags(c)}
            </div>
            <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
              {[
                { label: "Expected revenue", value: money(c.revenueTzs), cls: "" },
                { label: "Collected", value: money(c.collectedTzs), cls: "text-success" },
                {
                  label: "Outstanding",
                  value: money(c.outstandingTzs),
                  cls: c.outstandingTzs > 0 ? "text-destructive" : "text-muted-foreground",
                },
                { label: "Expenses", value: money(c.costsTzs), cls: "text-destructive" },
                {
                  label: "Expected profit",
                  value: signed(c.profitTzs),
                  cls: cn("font-medium", c.profitTzs < 0 && "text-destructive"),
                },
                {
                  label: "Expected margin",
                  value: c.margin === null ? "—" : `${Math.round(c.margin)}%`,
                  cls: "",
                },
              ].map((cell) => (
                <div key={cell.label} className="min-w-0">
                  <dt className="text-xs text-muted-foreground">{t(locale, cell.label)}</dt>
                  <dd className={cn("tnum truncate", cell.cls)}>{cell.value}</dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ul>

      <div className="hidden max-h-[270px] overflow-auto md:block">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-card">
            <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-5 py-2 font-medium">{t(locale, "Container")}</th>
              <th className="px-3 py-2 text-right font-medium">{t(locale, "Expected revenue")}</th>
              <th className="px-3 py-2 text-right font-medium">{t(locale, "Collected")}</th>
              <th className="px-3 py-2 text-right font-medium">{t(locale, "Outstanding")}</th>
              <th className="px-3 py-2 text-right font-medium">{t(locale, "Expenses")}</th>
              <th className="px-3 py-2 text-right font-medium">{t(locale, "Expected profit")}</th>
              <th className="px-3 py-2 text-right font-medium">{t(locale, "Expected margin")}</th>
            </tr>
          </thead>
          <tbody>
            {containers.map((c) => (
              <tr key={c.id} className="border-b last:border-0">
                <td className="px-5 py-2.5">
                  <span className="flex flex-wrap items-center gap-2">
                    <Link href={`/app/finance/containers/${c.id}`} className="tnum font-medium hover:underline">
                      {c.reference}
                    </Link>
                    {flags(c)}
                  </span>
                </td>
                <td className="tnum px-3 py-2.5 text-right">{money(c.revenueTzs)}</td>
                <td className="tnum px-3 py-2.5 text-right text-success">{money(c.collectedTzs)}</td>
                <td
                  className={cn(
                    "tnum px-3 py-2.5 text-right",
                    c.outstandingTzs > 0 ? "text-destructive" : "text-muted-foreground"
                  )}
                >
                  {money(c.outstandingTzs)}
                </td>
                {/* Money out, in the same red as everywhere else it is shown. */}
                <td className="tnum px-3 py-2.5 text-right text-destructive">{money(c.costsTzs)}</td>
                {/* Green is reserved for money in the bank. An expected profit is
                    set plain, and turns red only when it has gone the other way. */}
                <td className={cn("tnum px-3 py-2.5 text-right font-medium", c.profitTzs < 0 && "text-destructive")}>
                  {signed(c.profitTzs)}
                </td>
                <td className="tnum px-3 py-2.5 text-right">
                  {/* Nothing billed means no margin yet, not a margin of zero. */}
                  {c.margin === null ? "—" : `${Math.round(c.margin)}%`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {hidden > 0 ? (
        <p className="flex items-center justify-center gap-1.5 border-t px-4 py-1.5 text-xs text-muted-foreground">
          <ChevronDown className="size-3" />
          <span className="hidden md:inline">
            {t(locale, "scroll for")} {hidden} {t(locale, "more")}
          </span>
          <span className="md:hidden">{t(locale, "scroll for more")}</span>
        </p>
      ) : null}
    </section>
  );
}
