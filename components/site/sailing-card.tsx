import Link from "next/link";
import { ArrowRight, Ship } from "lucide-react";

import { SAILING_STATUS_LABEL } from "@/lib/constants";
import { formatDate } from "@/lib/format";
import { DEFAULT_LOCALE, t } from "@/lib/i18n";
import type { Sailing } from "@/lib/sailing-schedule";
import { cn } from "@/lib/utils";

const TONE: Record<Sailing["status"], string> = {
  OPEN_FOR_BOOKING: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300",
  CUTOFF_APPROACHING: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  CLOSED: "bg-secondary text-muted-foreground",
  DEPARTED: "bg-brand/10 text-brand",
  IN_TRANSIT: "bg-brand/10 text-brand",
  ARRIVED: "bg-secondary text-muted-foreground",
  DELAYED: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  CANCELLED: "bg-red-500/12 text-red-700 dark:text-red-300",
};

export function bookHref(sailing: Sailing) {
  return `/book?sailing=${sailing.departureDate.toISOString().slice(0, 10)}`;
}

/**
 * ONE SAILING, AS A BOARDING CARD.
 *
 * Leaves and arrives across the top with the ship on the line between them —
 * the two dates a customer plans around — and the Friday deadline underneath,
 * which is the one they actually have to act on.
 */
export function SailingCard({ sailing, className }: { sailing: Sailing; className?: string }) {
  const locale = DEFAULT_LOCALE;
  const short = (d: Date) =>
    new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }).format(d);
  const weekday = (d: Date) =>
    new Intl.DateTimeFormat("en-GB", { weekday: "long", timeZone: "UTC" }).format(d);

  return (
    <article
      className={cn(
        "group relative flex h-full flex-col overflow-hidden rounded-3xl border bg-card p-6 shadow-soft transition-all duration-500 hover:-translate-y-1 hover:shadow-raised sm:p-7",
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            {t(locale, "Sailing")}
          </p>
          <p className="mt-1 truncate font-display text-lg font-bold tracking-tight">
            {/* Named once the line has named it; until then the ship is known
                by the day it leaves, which is what the customer plans around. */}
            {sailing.vessel ?? `${t(locale, "Ship leaving")} ${short(sailing.departureDate)}`}
          </p>
          {sailing.reference ? (
            <p className="tnum text-xs text-muted-foreground">{sailing.reference}</p>
          ) : null}
        </div>
        <span
          className={cn(
            "shrink-0 rounded-full px-2.5 py-1 text-[0.7rem] font-semibold",
            TONE[sailing.status]
          )}
        >
          {t(locale, SAILING_STATUS_LABEL[sailing.status])}
        </span>
      </div>

      <div className="mt-7 grid grid-cols-[auto_1fr_auto] items-center gap-3">
        <div>
          <p className="font-display text-2xl font-extrabold tracking-tight">GZ</p>
          <p className="text-xs text-muted-foreground">{sailing.origin}</p>
        </div>
        <div aria-hidden className="relative h-6">
          <span className="absolute inset-x-0 top-1/2 border-t-2 border-dashed border-border" />
          <span className="absolute left-0 top-1/2 size-2 -translate-y-1/2 rounded-full bg-signal" />
          <span className="absolute right-0 top-1/2 size-2 -translate-y-1/2 rounded-full bg-marine" />
          <span className="absolute left-1/2 top-1/2 grid size-8 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-brand text-brand-foreground shadow-raised transition-transform duration-700 group-hover:translate-x-[40%]">
            <Ship className="size-4" />
          </span>
        </div>
        <div className="text-right">
          <p className="font-display text-2xl font-extrabold tracking-tight">DAR</p>
          <p className="text-xs text-muted-foreground">{sailing.destination}</p>
        </div>
      </div>

      <dl className="tnum mt-6 grid grid-cols-2 gap-4 rounded-2xl bg-surface-2 p-4 text-sm">
        <div>
          <dt className="text-xs text-muted-foreground">{t(locale, "Departs China")}</dt>
          <dd className="mt-0.5 font-semibold">{short(sailing.departureDate)}</dd>
          <dd className="text-xs text-muted-foreground">{weekday(sailing.departureDate)}</dd>
        </div>
        <div className="text-right">
          <dt className="text-xs text-muted-foreground">{t(locale, "Estimated arrival")}</dt>
          <dd className="mt-0.5 font-semibold">{short(sailing.estimatedArrival)}</dd>
          <dd className="text-xs text-muted-foreground">
            {sailing.transitDays} {t(locale, "days at sea")}
          </dd>
        </div>
      </dl>

      <div className="mt-4 flex items-center justify-between gap-3 text-sm">
        <span className="text-muted-foreground">{t(locale, "Last day to receive cargo")}</span>
        <span className="tnum font-semibold text-signal">{formatDate(sailing.cargoDeadline)}</span>
      </div>
      <div className="mt-1.5 flex items-center justify-between gap-3 text-sm">
        <span className="text-muted-foreground">{t(locale, "Container packed")}</span>
        <span className="tnum font-medium">{formatDate(sailing.loadingDate)}</span>
      </div>

      {sailing.notes ? (
        <p className="mt-4 rounded-xl bg-secondary px-3 py-2 text-xs">{sailing.notes}</p>
      ) : null}

      <div className="mt-auto pt-6">
        {sailing.bookingOpen ? (
          <Link
            href={bookHref(sailing)}
            className="focus-ring inline-flex w-full items-center justify-center gap-2 rounded-full bg-brand px-5 py-3 text-sm font-semibold text-brand-foreground transition-colors hover:bg-brand/90"
          >
            {t(locale, "Book this sailing")}
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
          </Link>
        ) : (
          <p className="rounded-full border px-5 py-3 text-center text-sm text-muted-foreground">
            {t(locale, "Closed for cargo")}
          </p>
        )}
      </div>
    </article>
  );
}
