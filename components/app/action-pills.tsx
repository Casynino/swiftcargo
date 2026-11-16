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

/* The same kinds of work, as the colour of a bare icon on a phone. */
const CHIP: Record<NonNullable<ActionPill["tone"]>, string> = {
  brand: "text-brand",
  marine: "text-marine",
  signal: "text-signal",
  success: "text-success",
  warning: "text-warning",
  danger: "text-destructive",
  plain: "text-foreground/70",
};

export async function ActionPills({ pills }: { pills: ActionPill[] }) {
  const locale = await viewerLocale();
  const t = (text: string) => tr(locale, text);
  if (pills.length === 0) return null;

  const iconFor = (name: string) =>
    (Icons as unknown as Record<string, React.ComponentType<{ className?: string; strokeWidth?: number }>>)[name];

  return (
    <>
      {/* A phone has the bottom bar and the menu for these; the home screen keeps
          to the banner, what needs attention and the figures (as ZELab's does). */}
    <div className="-mx-1 hidden flex-wrap gap-2 px-1 md:flex">
      {pills.map((pill) => {
        const Icon = iconFor(pill.icon);
        return (
          <Link
            key={pill.href + pill.label}
            href={pill.href}
            className="focus-ring inline-flex items-center gap-2 rounded-full border bg-card/70 px-3.5 py-1.5 text-xs font-medium text-foreground/90 shadow-soft transition-colors hover:bg-foreground/5 sm:text-sm"
          >
            {Icon ? <Icon className={cn("size-4", CHIP[pill.tone ?? "plain"])} strokeWidth={1.75} /> : null}
            {t(pill.label)}
          </Link>
        );
      })}
    </div>
    </>
  );
}
