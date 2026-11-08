import Link from "next/link";
import { Search, type LucideIcon } from "lucide-react";

import { CleanBanner } from "@/components/app/clean-banner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
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

  const pill = "h-8 rounded-full px-3.5 text-xs";
  const buttons = [
    ...(action && !actions?.some((a) => a.href === action.href) ? [{ href: action.href, label: action.label, icon: undefined }] : []),
    ...(actions ?? []),
  ];

  return (
    <CleanBanner
      title={`${tr(greeting)}, ${name}`}
      kicker={`Swift Cargo · ${tr(department)}`}
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
    >
      {buttons.map((item, index) => {
        const Icon = item.icon;
        return (
          <Button
            key={item.href}
            asChild
            size="sm"
            className={cn(pill, index === 0 ? "bg-white text-ink hover:bg-white/90" : "border border-white/25 bg-white/10 text-white backdrop-blur hover:bg-white/20")}
          >
            <Link href={item.href}>
              {Icon ? <Icon className="size-3.5" /> : null}
              {tr(item.label)}
            </Link>
          </Button>
        );
      })}
      {/* The search box that used to sit in the banner is one press away here,
          and in the menu: it opens the same search page. */}
      <Button asChild size="sm" className={cn(pill, "border border-white/25 bg-transparent text-white hover:bg-white/10")}>
        <Link href={searchAction}>
          <Search className="size-3.5" />
          {tr("Search")}
        </Link>
      </Button>
    </CleanBanner>
  );
}
