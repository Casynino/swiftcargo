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

/**
 * ONE SAILING, SMALL AND CLEAR.
 *
 * The day the ship leaves, large; under it only the two dates a customer acts on — the last day to receive cargo
 * (orange, it is the one to act on) and the estimated arrival — the status, and Book space. The next open sailing
 * carries the live count down to its cargo deadline (Nino, 14 Nov 2026: fewer words, well arranged).
 */
export function SailingCard({ sailing, featured, className }: { sailing: Sailing; featured?: boolean; className?: string }) {
  const locale = DEFAULT_LOCALE;
  const closed = !sailing.bookingOpen;
  return (
    <article
      className={cn(
        "flex h-full flex-col rounded-xl border p-4 sm:p-5",
        featured ? "border-signal/40 bg-card" : "bg-card",
        closed && "opacity-60",
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {featured ? (
            <p className="mb-2 text-sm font-semibold text-signal">{t(locale, "Meli inayofuata")}</p>
          ) : null}
          <p className="text-xs text-white/55">{t(locale, "Meli inaondoka")} · {t(locale, swWeekday(sailing.departureDate))}</p>
          <p className="sc-title tnum mt-1 text-2xl text-white">{swDay(sailing.departureDate)}</p>
          {sailing.vessel ? <p className="mt-1 truncate text-xs text-white/50">{sailing.vessel}</p> : null}
        </div>
        <span
          className={cn(
            "shrink-0 pt-0.5 text-xs font-medium",
            sailing.status === "OPEN_FOR_BOOKING"
              ? "text-emerald-300"
              : sailing.status === "CANCELLED"
                ? "text-red-300"
                : sailing.status === "CUTOFF_APPROACHING" || sailing.status === "DELAYED"
                  ? "text-amber-300"
                  : "text-white/50"
          )}
        >
          {t(locale, STATUS_SW[sailing.status])}
        </span>
      </div>

      <dl className="mt-4 space-y-2 border-t border-white/10 pt-4 text-sm">
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-white/55">{t(locale, "Mwisho kupokea mzigo")}</dt>
          <dd className="tnum font-semibold text-signal">
            {swWeekday(sailing.cargoDeadline)} {swDay(sailing.cargoDeadline)}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-white/55">{t(locale, "Meli kufika (makadirio)")}</dt>
          <dd className="tnum font-medium text-white">
            {swWeekday(sailing.estimatedArrival)} {swDay(sailing.estimatedArrival)}
          </dd>
        </div>
        {featured && sailing.bookingOpen ? (
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-white/55">{t(locale, "Muda uliobaki")}</dt>
            <dd>
              <Countdown
                to={cargoClosesAt(sailing).toISOString()}
                labels={["siku", "saa", "dak", "sek"]}
                className="gap-1.5 font-mono text-sm text-white"
              />
            </dd>
          </div>
        ) : null}
      </dl>

      {sailing.notes ? <p className="mt-3 text-xs text-white/60">{sailing.notes}</p> : null}

      <div className="mt-auto pt-4">
        {sailing.bookingOpen ? (
          <Link href={bookHref(sailing)} className="sc-link text-sm text-white">
            {t(locale, "Book space")}
            <ArrowRight className="size-3.5" aria-hidden="true" />
          </Link>
        ) : (
          <p className="text-xs text-white/50">{t(locale, "Muda wa kupokea mzigo umeisha")}</p>
        )}
      </div>
    </article>
  );
}

/**
 * THE NEXT SHIP, COUNTING DOWN.
 *
 * One small card under the hero (Nino, 14 Nov 2026: small and clean): the route, the day the ship leaves and the
 * estimated arrival, the last day to receive cargo in orange, and a live count of the time left until the
 * warehouse stops taking cargo for this sailing (the end of the deadline day in Guangzhou — cargoClosesAt). Three
 * short rows on a phone, one row on a computer. In Kiswahili, as the schedule is.
 */
export function NextSailingStrip({ sailing }: { sailing: Sailing }) {
  const locale = DEFAULT_LOCALE;
  const book = (
    <Link
      href={sailing.bookingOpen ? bookHref(sailing) : "/schedule"}
      className="sc-link shrink-0 text-[13px] text-white"
    >
      {t(locale, sailing.bookingOpen ? "Book space" : "Ratiba kamili")}
      <ArrowUpRight className="size-3.5" />
    </Link>
  );
  return (
    <section className="container py-6 sm:py-10">
      <div className="rounded-xl border border-white/10 bg-[linear-gradient(150deg,rgba(22,40,62,0.6),rgba(9,19,33,0.55))] px-4 py-4 backdrop-blur-md sm:px-6 lg:flex lg:items-center lg:gap-10 lg:py-5">
        <div className="flex items-center justify-between gap-4 lg:block lg:shrink-0">
          <p className="text-sm font-semibold text-signal">{t(locale, "Meli inayofuata")}</p>
          <div className="lg:hidden">{book}</div>
        </div>

        {/* CAN — 30 siku — DAR, the dates under each end. */}
        <div className="mt-3 grid flex-1 grid-cols-[auto_1fr_auto] items-center gap-3 lg:mt-0">
          <div>
            <p className="sc-title text-base text-white">CAN</p>
            <p className="tnum mt-0.5 text-[11px] text-white/55">{swDay(sailing.departureDate)}</p>
          </div>
          <div aria-hidden className="relative h-px bg-white/20">
            <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap bg-[#0e1f31] px-1.5 font-mono text-[10px] tracking-[0.12em] text-white/50">
              {`${sailing.transitDays} ${t(locale, "siku")}`}
            </span>
          </div>
          <div className="text-right">
            <p className="sc-title text-base text-white">DAR</p>
            <p className="tnum mt-0.5 text-[11px] text-white/55">{swDay(sailing.estimatedArrival)}</p>
          </div>
        </div>

        {/* The deadline and the time left. */}
        <div className="mt-3 flex items-end justify-between gap-4 border-t border-white/10 pt-3 lg:mt-0 lg:shrink-0 lg:border-l lg:border-t-0 lg:pl-10 lg:pt-0">
          <div>
            <p className="text-[11px] text-white/50">{t(locale, "Mwisho kupokea mzigo")}</p>
            <p className="tnum mt-0.5 text-sm font-semibold text-signal">
              {swWeekday(sailing.cargoDeadline)} {swDay(sailing.cargoDeadline)}
            </p>
          </div>
          {sailing.bookingOpen ? (
            <div className="text-right">
              <p className="text-[11px] text-white/50">{t(locale, "Muda uliobaki")}</p>
              <Countdown
                to={cargoClosesAt(sailing).toISOString()}
                labels={["siku", "saa", "dak", "sek"]}
                className="mt-0.5 gap-1.5 font-mono text-sm text-white"
              />
            </div>
          ) : null}
        </div>

        <div className="hidden lg:block">{book}</div>
      </div>
    </section>
  );
}
