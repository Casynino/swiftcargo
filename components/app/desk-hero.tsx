import Link from "next/link";
import { Search, type LucideIcon } from "lucide-react";

import { CleanBanner } from "@/components/app/clean-banner";
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
  title,
  kicker,
  search = true,
  action,
  actions,
}: {
  greeting: string;
  name: string;
  department: string;
  subtitle: string;
  searchAction?: string;
  searchPlaceholder?: string;
  /** The banner's heading, when it is not the desk's own name (management reads "Management"). */
  title?: string;
  /** The small line under the title; the company by default. Management reads "CEO" or "Director". */
  kicker?: string;
  /** Management watches rather than looks things up: no search box under the banner. */
  search?: boolean;
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

  /* `action` (the one thing a desk does most) is already the first coloured
     shortcut under the banner, so it is not offered a second time here. */
  void action;
  const buttons = actions ?? [];

  /* What Target's banner does: the page's own name, set wide, with only the
     company and the day under it — and the search box on its own line below,
     where the eye goes next. No greeting, no sentence, no row of buttons. */
  return (
    <div className="space-y-4">
      <CleanBanner
        title={title ?? tr(department)}
        kicker={kicker ? tr(kicker) : "Swift Cargo"}
        image="/photos/port-cranes.jpg"
        line={
          <>
            {today}
            {clocks.map((clock) => (
              <span key={clock.place}>
                {"  ·  "}
                {tr(clock.place)} <span className="font-semibold text-white">{clock.time}</span>
              </span>
            ))}
          </>
        }
      />
      {search ? (
      <form action={searchAction} className="flex max-w-2xl gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            name="q"
            placeholder={tr(searchPlaceholder)}
            aria-label={tr("Search")}
            className="h-11 rounded-full pl-11 text-sm"
          />
        </div>
        <Button type="submit" className="h-11 rounded-full px-5">
          {tr("Search")}
        </Button>
      </form>
      ) : null}
      {buttons.length ? (
        <div className="flex flex-wrap gap-2">
          {buttons.map((item, index) => {
            const Icon = item.icon;
            return (
              <Button key={item.href} asChild size="sm" variant={index === 0 ? "default" : "outline"} className="h-8 rounded-full px-3.5 text-xs">
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
  );
}
