import Link from "next/link";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

import { Tx } from "@/components/app/tx";
export type StatChip = {
  label: string;
  value: string;
  icon?: LucideIcon;
  tone?: "neutral" | "brand" | "marine" | "success" | "warning" | "danger";
  href?: string;
};

const TONES = {
  neutral: "text-muted-foreground",
  brand: "text-brand",
  marine: "text-marine",
  success: "text-success",
  warning: "text-warning",
  danger: "text-destructive",
} as const;

/**
 * The thin rail of live counters above a dashboard.
 *
 * These are glanceable facts, not KPIs — "how many containers are on the water
 * right now" rather than "revenue this month". Keeping them on one horizontal
 * rail lets the heavy cards below be fewer and larger.
 */
export function StatStrip({
  chips,
  className,
}: {
  chips: StatChip[];
  className?: string;
}) {
  return (
    <div
      className={cn(
        "-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        className
      )}
    >
      {chips.map((chip) => {
        const Icon = chip.icon;
        const body = (
          <span
            className={cn(
              "inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full border bg-card px-3 py-1.5 text-xs shadow-soft transition-colors",
              chip.href && "hover:border-brand/40 hover:bg-muted/60"
            )}
          >
            {Icon ? (
              <Icon className={cn("size-3.5", TONES[chip.tone ?? "neutral"])} />
            ) : null}
            <span className="text-muted-foreground"><Tx>{chip.label}</Tx></span>
            <span className="tnum font-semibold">{chip.value}</span>
          </span>
        );

        return chip.href ? (
          <Link key={chip.label} href={chip.href} className="focus-ring rounded-full">
            {body}
          </Link>
        ) : (
          <span key={chip.label}>{body}</span>
        );
      })}
    </div>
  );
}
