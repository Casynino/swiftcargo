import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "lucide-react";

import { Countdown } from "@/components/site/motion";

import { DEFAULT_LOCALE, t } from "@/lib/i18n";
import { cargoClosesAt, type Sailing } from "@/lib/sailing-schedule";
import { swDay, swWeekday } from "@/lib/sw-date";
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
 * ONE SAILING, AS THREE DATES IN ORDER.
 *
 * The notice customers already see on WhatsApp ("Ratiba ya meli") says three things: the last day to receive cargo,
 * the day the ship leaves, the estimated arrival. The card draws them in that order down a thin line, each date large
 * and the weekday beside it, so the days read before the words do. The Friday deadline is in the accent because it is
 * the one customers have to act on.
 */
export function SailingCard({ sailing, featured, className }: { sailing: Sailing; featured?: boolean; className?: string }) {
  const locale = DEFAULT_LOCALE;
  const steps = [
    { label: "Mwisho kupokea mzigo", date: sailing.cargoDeadline, accent: true, note: null as string | null },
    /* The container is packed the same Friday, so it is only a step of its own when somebody has moved it. */
    ...(sameDay(sailing.loadingDate, sailing.cargoDeadline)
      ? []
      : [{ label: "Kontena linapakiwa", date: sailing.loadingDate, accent: false, note: null }]),
    { label: "Meli inaondoka", date: sailing.departureDate, accent: false, note: null },
    {
      label: "Meli kufika (makadirio)",
      date: sailing.estimatedArrival,
      accent: false,
      note: `${t(locale, "Siku")} ${sailing.transitDays} ${t(locale, "baharini")}`,
    },
  ];

  return (
    <article
      className={cn(
        "group relative flex h-full flex-col overflow-hidden rounded-2xl border p-5 sm:p-6",
        featured ? "border-signal/40 bg-card" : "bg-card",
        className
      )}
    >
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

      <ol className="mt-6 space-y-5 border-l pl-5">
        {steps.map((step) => (
          <li key={step.label} className="relative">
            <span
              aria-hidden
              className={cn("absolute -left-[1.6rem] top-2 size-2.5 rounded-full", step.accent ? "bg-signal" : "bg-border")}
            />
            <p className="text-xs text-muted-foreground">{t(locale, step.label)}</p>
            <p className="tnum mt-0.5 flex flex-wrap items-baseline gap-x-2">
              <span className={cn("font-display text-2xl font-semibold tracking-tight", step.accent && "text-signal")}>
                {swDay(step.date)}
              </span>
              <span className="text-sm text-muted-foreground">
                {swWeekday(step.date)} · {step.date.getUTCFullYear()}
              </span>
            </p>
            {step.note ? <p className="mt-0.5 text-xs text-muted-foreground">{step.note}</p> : null}
          </li>
        ))}
      </ol>

      {sailing.notes ? <p className="mt-4 rounded-lg bg-secondary px-3 py-2 text-xs">{sailing.notes}</p> : null}

      <div className="mt-auto pt-6">
        {sailing.bookingOpen ? (
          <Link
            href={bookHref(sailing)}
            className={cn(
              "focus-ring inline-flex w-full items-center justify-center gap-2 rounded-md px-5 py-3 text-sm font-semibold transition-colors",
              featured
                ? "bg-brand text-brand-foreground hover:bg-brand/90"
                : "bg-white/[0.06] text-white hover:bg-white/10"
            )}
          >
            {t(locale, "Book space")}
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

/**
 * THE NEXT SHIP, COUNTING DOWN.
 *
 * One line across the page under a hero: the last day to receive cargo, the departure and the estimated arrival, and a
 * live count of the time left until the warehouse stops taking cargo for this sailing (the end of the deadline day in
 * Guangzhou — cargoClosesAt). In Kiswahili, as the schedule is.
 */
export function NextSailingStrip({ sailing }: { sailing: Sailing }) {
  const locale = DEFAULT_LOCALE;
  return (
    <section className="border-y border-white/10 bg-white/[0.025]">
      <div className="container grid gap-6 py-6 sm:grid-cols-2 sm:py-7 lg:grid-cols-[auto_1fr_1fr_1fr_auto] lg:items-center lg:gap-10">
        <p className="sc-label flex items-center gap-2.5 text-white sm:col-span-2 lg:col-span-1">
          {t(locale, "Meli inayofuata")}
        </p>
        <div>
          <p className="text-xs text-white/45">{t(locale, "Mwisho kupokea mzigo")}</p>
          <p className="tnum mt-1 font-display text-lg font-semibold text-signal">
            {swWeekday(sailing.cargoDeadline)} {swDay(sailing.cargoDeadline)}
          </p>
        </div>
        <div>
          <p className="text-xs text-white/45">
            {t(locale, "Inaondoka")} · {t(locale, "Inafika (makadirio)")}
          </p>
          <p className="tnum mt-1 font-display text-lg font-semibold">
            {swDay(sailing.departureDate)} <span className="text-white/35">→</span> {swDay(sailing.estimatedArrival)}
          </p>
        </div>
        {sailing.bookingOpen ? (
          <div>
            <p className="text-xs text-white/45">{t(locale, "Muda uliobaki")}</p>
            <Countdown
              to={cargoClosesAt(sailing).toISOString()}
              labels={["siku", "saa", "dak", "sek"]}
              className="mt-1 font-mono text-lg text-white"
            />
          </div>
        ) : (
          <div />
        )}
        <Link
          href={sailing.bookingOpen ? bookHref(sailing) : "/schedule"}
          className="sc-link text-sm text-white sm:col-span-2 lg:col-span-1"
        >
          {t(locale, sailing.bookingOpen ? "Book space" : "Ratiba kamili")}
          <ArrowUpRight className="size-4" />
        </Link>
      </div>
    </section>
  );
}
