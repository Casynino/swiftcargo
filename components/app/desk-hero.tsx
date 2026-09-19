import Link from "next/link";
import { Search, type LucideIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { t } from "@/lib/i18n";
import { viewerLocale } from "@/lib/viewer-locale";

/**
 * The banner at the top of a desk's home screen.
 *
 * It does three jobs at once: says whose desk this is, says what today is, and
 * puts the search box where the eye lands first — because the single most
 * common thing anybody does on arriving is look something up, and making them
 * find a search field in a sidebar first is a tax on every visit.
 *
 * The gradient is the brand's own three colours over a grid, dark in both
 * themes. It reads as a printed cover rather than as a piece of the interface,
 * which is what stops a bright panel from competing with the data below it.
 */
export async function DeskHero({
  greeting,
  name,
  department,
  subtitle,
  searchAction = "/app/search",
  searchPlaceholder = "Cargo reference, shipping mark, customer, phone, container or invoice",
  action,
  actions,
}: {
  greeting: string;
  name: string;
  department: string;
  subtitle: string;
  searchAction?: string;
  searchPlaceholder?: string;
  /** The one thing this desk does most, offered where they land. */
  action?: { href: string; label: string };
  /** A desk that starts more than one kind of job offers each, in order of use. */
  actions?: { href: string; label: string; icon?: LucideIcon }[];
}) {
  const now = new Date();

  const today = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Dar_es_Salaam",
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(now);

  /*
    TWO CLOCKS, BECAUSE THE COMPANY LIVES IN TWO OF THEM.

    Guangzhou is five hours ahead of Dar es Salaam. Half of what goes wrong
    between the two ends is somebody ringing a warehouse that closed three hours
    ago, or promising a customer a photograph from a floor where it is
    midnight. Rendered on the server, so it is the time when the page was
    built — near enough for a warehouse, and honest about being a page.
  */
  const clocks = [
    { place: "Guangzhou", zone: "Asia/Shanghai", offset: "GMT+8" },
    { place: "Dar es Salaam", zone: "Africa/Dar_es_Salaam", offset: "GMT+3" },
  ].map((c) => ({
    ...c,
    time: new Intl.DateTimeFormat("en-GB", {
      timeZone: c.zone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(now),
  }));

  const locale = await viewerLocale();
  const tr = (text: string) => t(locale, text);

  return (
    <section className="relative overflow-hidden rounded-2xl bg-ink px-4 py-4 text-white shadow-raised sm:px-6 sm:py-5">
      <div
        aria-hidden
        className="absolute inset-0 bg-[radial-gradient(ellipse_at_10%_-10%,hsl(var(--signal)/0.45),transparent_50%),radial-gradient(ellipse_at_85%_120%,hsl(var(--marine)/0.45),transparent_55%),radial-gradient(ellipse_at_60%_-30%,hsl(var(--brand)/0.5),transparent_60%)]"
      />

      <div className="relative">
        {/* One short line: the day, the desk, and both clocks. */}
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[11px] text-white/70">
          <p className="flex items-center gap-1.5">
            <span className="size-1.5 rounded-full bg-signal" />
            {today} · <span className="font-semibold uppercase tracking-wider text-white/85">{tr(department)}</span>
          </p>
          <p className="tnum">
            {clocks.map((clock, i) => (
              <span key={clock.place}>
                {i > 0 ? "  ·  " : ""}
                {tr(clock.place)} <span className="font-semibold text-white">{clock.time}</span>
              </span>
            ))}
          </p>
        </div>

        <h1 className="mt-2 text-xl font-semibold tracking-tight sm:text-2xl">
          {tr(greeting)}, {name}
        </h1>
        <p className="mt-0.5 hidden max-w-xl text-sm text-white/65 sm:block">{tr(subtitle)}</p>

        <form action={searchAction} className="mt-3 flex max-w-2xl gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-white/45" />
            <Input
              name="q"
              placeholder={tr(searchPlaceholder)}
              aria-label={tr("Search")}
              className="h-9 border-white/15 bg-black/25 pl-9 text-sm text-white placeholder:text-white/45 focus-visible:ring-white/40"
            />
          </div>
          <Button type="submit" size="sm" className="h-9 bg-white text-ink hover:bg-white/90">
            {tr("Search")}
          </Button>
        </form>

        {action || actions?.length ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {action && !actions?.some((a) => a.href === action.href) ? (
              <Button asChild size="sm" className="hidden h-8 rounded-full bg-white px-3 text-xs text-ink hover:bg-white/90 sm:inline-flex">
                <Link href={action.href}>{tr(action.label)}</Link>
              </Button>
            ) : null}
            {actions?.map((item, index) => {
              const Icon = item.icon;
              return (
                <Button
                  key={item.href}
                  asChild
                  size="sm"
                  className={
                    index === 0
                      ? "h-8 rounded-full bg-white px-3 text-xs text-ink hover:bg-white/90"
                      : "h-8 rounded-full border border-white/25 bg-white/10 px-3 text-xs text-white backdrop-blur hover:bg-white/20"
                  }
                >
                  <Link href={item.href}>
                    {Icon ? <Icon className="size-3.5" /> : null}
                    {tr(item.label)}
                  </Link>
                </Button>
              );
            })}
          </div>
        ) : null}
      </div>
    </section>
  );
}
