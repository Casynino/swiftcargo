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
 * A card like a boarding pass under the hero (Nino, 14 Nov 2026: the plain lines were not visible enough): the
 * route from Guangzhou to Dar es Salaam with the day the ship leaves and the estimated arrival under each end, the
 * last day to receive cargo in orange, and a live count of the time left until the warehouse stops taking cargo for
 * this sailing (the end of the deadline day in Guangzhou — cargoClosesAt). In Kiswahili, as the schedule is.
 */
export function NextSailingStrip({ sailing }: { sailing: Sailing }) {
  const locale = DEFAULT_LOCALE;
  return (
    <section className="container py-8 sm:py-12">
      <div className="overflow-hidden rounded-xl border border-white/10 bg-[linear-gradient(150deg,rgba(22,40,62,0.78),rgba(9,19,33,0.72))] shadow-[0_24px_60px_-30px_rgba(0,0,0,0.9)] backdrop-blur-md">
        <div className="grid lg:grid-cols-[1.25fr_1fr]">
          {/* The route, like the top of a ticket. */}
          <div className="p-5 sm:p-8">
            <p className="sc-label text-white/60">{t(locale, "Meli inayofuata")}</p>
            <div className="mt-6 grid grid-cols-[auto_1fr_auto] items-end gap-3 sm:gap-6">
              <div>
                <p className="sc-title text-[1.6rem] text-white sm:text-4xl">CAN</p>
                <p className="mt-1 text-xs text-white/50">{sailing.origin}</p>
              </div>
              <div aria-hidden className="relative mb-4 h-px bg-white/20 sm:mb-5">
                <span className="absolute -top-[3px] left-0 size-[7px] bg-signal" />
                <span className="absolute -top-[3px] right-0 size-[7px] border border-white/60 bg-transparent" />
                <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap bg-[#0d1d2f] px-2 font-mono text-[10px] tracking-[0.15em] text-white/60 sm:text-[11px]">
                  {`${sailing.transitDays} ${t(locale, "SIKU")}`}
                </span>
              </div>
              <div className="text-right">
                <p className="sc-title text-[1.6rem] text-white sm:text-4xl">DAR</p>
                <p className="mt-1 text-xs text-white/50">{sailing.destination}</p>
              </div>
            </div>
            <dl className="mt-6 grid grid-cols-2 gap-4 border-t border-dashed border-white/15 pt-5">
              <div>
                <dt className="text-xs text-white/50">{t(locale, "Inaondoka")}</dt>
                <dd className="tnum mt-1 font-display text-lg font-semibold text-white">
                  {swWeekday(sailing.departureDate)} {swDay(sailing.departureDate)}
                </dd>
              </div>
              <div className="text-right">
                <dt className="text-xs text-white/50">{t(locale, "Inafika (makadirio)")}</dt>
                <dd className="tnum mt-1 font-display text-lg font-semibold text-white">
                  {swWeekday(sailing.estimatedArrival)} {swDay(sailing.estimatedArrival)}
                </dd>
              </div>
            </dl>
          </div>

          {/* The deadline and the time left, like the stub. */}
          <div className="border-t border-dashed border-white/15 bg-white/[0.03] p-5 sm:p-8 lg:border-l lg:border-t-0">
            <p className="text-xs text-white/50">{t(locale, "Mwisho kupokea mzigo")}</p>
            <p className="tnum mt-1 font-display text-xl font-semibold text-signal">
              {swWeekday(sailing.cargoDeadline)} {swDay(sailing.cargoDeadline)}
            </p>
            {sailing.bookingOpen ? (
              <>
                <p className="mt-5 text-xs text-white/50">{t(locale, "Muda uliobaki")}</p>
                <Countdown
                  to={cargoClosesAt(sailing).toISOString()}
                  labels={["siku", "saa", "dak", "sek"]}
                  className="mt-2 grid w-full grid-cols-4 gap-2"
                  cellClassName="flex flex-col items-center rounded-md border border-white/10 bg-[rgba(3,10,19,0.5)] py-2.5 font-mono text-2xl text-white sm:text-3xl [&>span]:ml-0 [&>span]:mt-1 [&>span]:text-[10px] [&>span]:uppercase [&>span]:tracking-[0.15em]"
                />
              </>
            ) : null}
            <Link
              href={sailing.bookingOpen ? bookHref(sailing) : "/schedule"}
              className="sc-link mt-6 text-sm text-white"
            >
              {t(locale, sailing.bookingOpen ? "Book space" : "Ratiba kamili")}
              <ArrowUpRight className="size-4" />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
