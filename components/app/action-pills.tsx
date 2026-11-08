import { t as tr } from "@/lib/i18n";
import { viewerLocale } from "@/lib/viewer-locale";
import Link from "next/link";
import * as Icons from "lucide-react";

import { cn } from "@/lib/utils";

export type ActionPill = {
  label: string;
  /** A shorter name for the phone tile, where a long word does not fit. */
  short?: string;
  href: string;
  icon: string;
  tone?: "brand" | "marine" | "signal" | "success" | "warning" | "danger" | "plain";
};

/**
 * The row of things this desk does most.
 *
 * Colour is used to separate kinds of work, not to rank them: taking money is
 * green wherever it appears, a cost is red, an investigation is amber. A clerk
 * who does the same job forty times a day finds the button by its colour long
 * before they read it.
 */
const TONES: Record<NonNullable<ActionPill["tone"]>, string> = {
  brand: "bg-brand text-brand-foreground hover:bg-brand/90",
  marine: "bg-marine text-marine-foreground hover:bg-marine/90",
  signal: "bg-signal text-signal-foreground hover:bg-signal/90",
  success: "bg-success text-success-foreground hover:bg-success/90",
  warning: "bg-warning text-warning-foreground hover:bg-warning/90",
  danger: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
  plain: "border bg-card text-foreground hover:bg-secondary",
};

/* The same kinds of work, as the soft gradient square on a phone's tile. */
const CHIP: Record<NonNullable<ActionPill["tone"]>, string> = {
  brand: "bg-gradient-to-br from-brand/30 to-brand/10 text-brand ring-brand/25",
  marine: "bg-gradient-to-br from-marine/30 to-marine/10 text-marine ring-marine/25",
  signal: "bg-gradient-to-br from-signal/30 to-signal/10 text-signal ring-signal/25",
  success: "bg-gradient-to-br from-success/30 to-success/10 text-success ring-success/25",
  warning: "bg-gradient-to-br from-warning/30 to-warning/10 text-warning ring-warning/25",
  danger: "bg-gradient-to-br from-destructive/30 to-destructive/10 text-destructive ring-destructive/25",
  plain: "bg-gradient-to-br from-foreground/10 to-foreground/[0.03] text-foreground/75 ring-foreground/10",
};

export async function ActionPills({ pills }: { pills: ActionPill[] }) {
  const locale = await viewerLocale();
  const t = (text: string) => tr(locale, text);
  if (pills.length === 0) return null;

  const iconFor = (name: string) =>
    (Icons as unknown as Record<string, React.ComponentType<{ className?: string; strokeWidth?: number }>>)[name];

  return (
    <>
      {/* PHONE: five tiles across, each a square icon over a short name, and a
          sixth or seventh a swipe away — thumbs hit tiles, not pills. */}
      <div className="-mx-4 grid snap-x snap-mandatory scroll-px-4 auto-cols-[calc((100%-2rem)/5)] grid-flow-col gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] lg:hidden [&::-webkit-scrollbar]:hidden">
        {pills.map((pill) => {
          const Icon = iconFor(pill.icon);
          return (
            <Link
              key={`m-${pill.href}${pill.label}`}
              href={pill.href}
              className="focus-ring flex snap-start flex-col items-center gap-1.5 rounded-2xl border bg-gradient-to-b from-card to-card/70 px-1 py-2.5 text-center shadow-soft transition-transform active:scale-95"
            >
              <span className={cn("grid size-10 place-items-center rounded-[14px] shadow-sm ring-1 ring-inset", CHIP[pill.tone ?? "plain"])}>
                {Icon ? <Icon className="size-5" strokeWidth={1.75} /> : null}
              </span>
              <span className="line-clamp-2 min-h-[2.1em] [overflow-wrap:anywhere] text-[10.5px] font-medium leading-tight">{t(pill.short ?? pill.label)}</span>
            </Link>
          );
        })}
      </div>
    <div className="-mx-1 hidden flex-wrap gap-2 px-1 lg:flex">
      {pills.map((pill) => {
        const Icon = (
          Icons as unknown as Record<
            string,
            React.ComponentType<{ className?: string }>
          >
        )[pill.icon];
        return (
          <Link
            key={pill.href + pill.label}
            href={pill.href}
            className={cn(
              "focus-ring inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold shadow-soft transition-all hover:-translate-y-0.5 sm:text-sm",
              TONES[pill.tone ?? "plain"]
            )}
          >
            {Icon ? <Icon className="size-3.5" /> : null}
            {t(pill.label)}
          </Link>
        );
      })}
    </div>
    </>
  );
}
