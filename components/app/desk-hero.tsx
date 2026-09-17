import Link from "next/link";
import { Search, type LucideIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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
export function DeskHero({
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

  return (
    <section className="relative overflow-hidden rounded-2xl bg-ink px-6 py-8 text-white shadow-raised sm:px-9 sm:py-10">
      <div
        aria-hidden
        className="absolute inset-0 bg-[radial-gradient(ellipse_at_10%_-10%,hsl(var(--signal)/0.55),transparent_50%),radial-gradient(ellipse_at_85%_120%,hsl(var(--marine)/0.55),transparent_55%),radial-gradient(ellipse_at_60%_-30%,hsl(var(--brand)/0.6),transparent_60%)]"
      />
      {/* A faint grid, so the gradient reads as a printed surface rather than
          as a blur somebody forgot to finish. */}
      <div
        aria-hidden
        className="absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            "linear-gradient(to right, #fff 1px, transparent 1px), linear-gradient(to bottom, #fff 1px, transparent 1px)",
          backgroundSize: "44px 44px",
        }}
      />

      <div className="relative flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-2 rounded-full bg-white/12 px-3 py-1 text-xs font-medium backdrop-blur">
            <span className="size-1.5 rounded-full bg-signal" />
            {today}
          </span>
          <span className="rounded-full bg-white/12 px-3 py-1 text-xs font-semibold uppercase tracking-wider backdrop-blur">
            {department}
          </span>
        </div>

        <h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">
          {greeting}, {name}
        </h1>
        <p className="mt-2 max-w-xl text-white/70">{subtitle}</p>

        <form action={searchAction} className="mt-6 flex max-w-2xl gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-white/45" />
            <Input
              name="q"
              placeholder={searchPlaceholder}
              aria-label="Search everything"
              className="h-12 border-white/15 bg-black/25 pl-10 text-white placeholder:text-white/45 focus-visible:ring-white/40"
            />
          </div>
          <Button type="submit" size="lg" className="h-12 bg-white text-ink hover:bg-white/90">
            Search
          </Button>
        </form>
        </div>

        <div className="flex shrink-0 flex-col gap-5 lg:items-end">
        <div className="flex items-start gap-6">
          {clocks.map((clock) => (
            <div key={clock.place}>
              <p className="text-xs font-medium text-white/60">{clock.place}</p>
              <p className="tnum text-2xl font-semibold tracking-tight">
                {clock.time}
              </p>
              <p className="tnum text-[11px] text-white/45">{clock.offset}</p>
            </div>
          ))}
          {action ? (
            <Button
              asChild
              size="lg"
              className="h-11 bg-white text-ink hover:bg-white/90"
            >
              <Link href={action.href}>{action.label}</Link>
            </Button>
          ) : null}
        </div>

        {actions?.length ? (
          <div className="flex flex-wrap gap-2 lg:justify-end">
            {actions.map((item, index) => {
              const Icon = item.icon;
              return (
                <Button
                  key={item.href}
                  asChild
                  size="lg"
                  className={
                    index === 0
                      ? "h-11 bg-white px-5 text-ink hover:bg-white/90"
                      : "h-11 border border-white/25 bg-white/10 px-5 text-white backdrop-blur hover:bg-white/20"
                  }
                >
                  <Link href={item.href}>
                    {Icon ? <Icon /> : null}
                    {item.label}
                  </Link>
                </Button>
              );
            })}
          </div>
        ) : null}
        </div>
      </div>
    </section>
  );
}
