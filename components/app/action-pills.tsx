import { t as tr } from "@/lib/i18n";
import { viewerLocale } from "@/lib/viewer-locale";
import Link from "next/link";
import * as Icons from "lucide-react";

import { cn } from "@/lib/utils";

export type ActionPill = {
  label: string;
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

export async function ActionPills({ pills }: { pills: ActionPill[] }) {
  const locale = await viewerLocale();
  const t = (text: string) => tr(locale, text);
  if (pills.length === 0) return null;

  return (
    <div className="-mx-1 flex flex-wrap gap-2 px-1">
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
  );
}
