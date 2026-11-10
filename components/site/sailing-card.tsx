import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { DEFAULT_LOCALE, t } from "@/lib/i18n";
import type { Sailing } from "@/lib/sailing-schedule";
import { swDate, swDay } from "@/lib/sw-date";
import { cn } from "@/lib/utils";

export function bookHref(sailing: Sailing) {
  return `/book?sailing=${sailing.departureDate.toISOString().slice(0, 10)}`;
}

/* The status, in Kiswahili. The staff pages keep the English words. */
const STATUS_SW: Record<Sailing["status"], string> = {
  OPEN_FOR_BOOKING: "Nafasi zipo",
  CUTOFF_APPROACHING: "Muda unakaribia kuisha",
  CLOSED: "Imefungwa",
  DEPARTED: "Imeondoka",
  IN_TRANSIT: "Iko njiani",
  ARRIVED: "Imefika",
  DELAYED: "Imechelewa",
  CANCELLED: "Imeghairiwa",
};

const sameDay = (a: Date, b: Date) => a.toISOString().slice(0, 10) === b.toISOString().slice(0, 10);

/**
 * ONE SAILING, IN THE WORDS OF THE SAILING NOTICE.
 *
 * The notice customers already see on WhatsApp ("Ratiba ya meli") has three lines — the ship, the last day to receive
 * cargo, the estimated arrival — each with its date written out and the weekday in brackets. The card says the same
 * three things in the same words, with the Friday deadline in the accent because it is the one they have to act on.
 */
export function SailingCard({ sailing, className }: { sailing: Sailing; className?: string }) {
  const locale = DEFAULT_LOCALE;
  const rows = [
    { label: "Meli inaondoka", value: swDate(sailing.departureDate), accent: false },
    { label: "Mwisho kupokea mzigo", value: swDate(sailing.cargoDeadline), accent: true },
    { label: "Meli kufika (makadirio)", value: swDate(sailing.estimatedArrival), accent: false },
    /* The container is packed the same Friday, so it is only a line of its own when somebody has moved it. */
    ...(sameDay(sailing.loadingDate, sailing.cargoDeadline)
      ? []
      : [{ label: "Kontena linapakiwa", value: swDate(sailing.loadingDate), accent: false }]),
  ];

  return (
    <article className={cn("group relative flex h-full flex-col overflow-hidden rounded-2xl border bg-card p-5 sm:p-6", className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-display text-lg font-semibold tracking-tight">
            {/* Named once the line has named it; until then the ship is known by the day it leaves. */}
            {sailing.vessel ?? `${t(locale, "Meli ya")} ${swDay(sailing.departureDate)}`}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {sailing.origin} → {sailing.destination}
            {sailing.reference ? <span className="tnum"> · {sailing.reference}</span> : null}
          </p>
        </div>
        <span
          className={cn(
            "shrink-0 pt-1 text-xs font-medium",
            sailing.status === "OPEN_FOR_BOOKING"
              ? "text-emerald-600 dark:text-emerald-300"
              : sailing.status === "CANCELLED"
                ? "text-red-600 dark:text-red-300"
                : sailing.status === "CUTOFF_APPROACHING" || sailing.status === "DELAYED"
                  ? "text-amber-600 dark:text-amber-300"
                  : "text-muted-foreground"
          )}
        >
          {t(locale, STATUS_SW[sailing.status])}
        </span>
      </div>

      <dl className="mt-5 divide-y border-y">
        {rows.map((row) => (
          <div key={row.label} className="py-3">
            <dt className="text-xs text-muted-foreground">{t(locale, row.label)}</dt>
            <dd className={cn("tnum mt-0.5 text-[15px] font-semibold", row.accent && "text-signal")}>{row.value}</dd>
            {row.label === "Meli kufika (makadirio)" ? (
              <dd className="mt-0.5 text-xs text-muted-foreground">
                {t(locale, "Siku")} {sailing.transitDays} {t(locale, "baharini")}
              </dd>
            ) : null}
          </div>
        ))}
      </dl>

      {sailing.notes ? <p className="mt-4 rounded-lg bg-secondary px-3 py-2 text-xs">{sailing.notes}</p> : null}

      <div className="mt-auto pt-5">
        {sailing.bookingOpen ? (
          <Link
            href={bookHref(sailing)}
            className="focus-ring inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand px-5 py-3 text-sm font-semibold text-brand-foreground transition-colors hover:bg-brand/90"
          >
            {t(locale, "Weka nafasi sasa")}
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        ) : (
          <p className="rounded-xl border px-5 py-3 text-center text-sm text-muted-foreground">
            {t(locale, "Muda wa kupokea mzigo umeisha")}
          </p>
        )}
      </div>
    </article>
  );
}
