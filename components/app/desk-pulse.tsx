import Link from "next/link";
import { ArrowRight, CheckCircle2 } from "lucide-react";

import { t, type Locale } from "@/lib/i18n";
import type { DeskPulse } from "@/lib/manager-overview";
import { cn } from "@/lib/utils";

import { Tx } from "@/components/app/tx";
/* Written out in full — Tailwind scans source text, so `text-${tone}` is a class
   that never exists and the figure would render with no colour at all. */
const VALUE: Record<DeskPulse["tone"], string> = {
  brand: "text-brand",
  signal: "text-signal",
  success: "text-success",
  warning: "text-warning",
  marine: "text-marine",
};

const RULE: Record<DeskPulse["tone"], string> = {
  brand: "bg-brand",
  signal: "bg-signal",
  success: "bg-success",
  warning: "bg-warning",
  marine: "bg-marine",
};

/**
 * Every desk in the business, side by side.
 *
 * Each department has a page answering "how am I doing", and none answers
 * "which of my four desks needs me this morning" — four dashboards cannot be
 * compared by opening them one at a time.
 *
 * Each card carries a headline figure, a fact for context, and the problem on
 * that desk. A desk with nothing wrong says so in words, because "no news" and
 * "nobody looked" must not render the same.
 */
export function DeskPulsePanel({ desks, locale }: { desks: DeskPulse[]; locale: Locale }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {desks.map((desk) => (
        <Link
          key={desk.key}
          href={desk.href}
          className="focus-ring group relative overflow-hidden rounded-xl border bg-card p-4 transition-colors hover:border-foreground/20"
        >
          <span aria-hidden className={cn("absolute inset-y-0 left-0 w-0.5", RULE[desk.tone])} />

          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              {desk.desk}
            </p>
            <ArrowRight className="size-3.5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
          </div>

          <p className="mt-2 flex items-baseline gap-1.5">
            <span className={cn("tnum text-[26px] font-bold leading-none", VALUE[desk.tone])}>
              <Tx>{desk.headline}</Tx>
            </span>
            <span className="text-xs text-muted-foreground">{desk.headlineLabel}</span>
          </p>

          <p className="mt-1 text-xs leading-snug text-muted-foreground"><Tx>{desk.detail}</Tx></p>

          <p
            className={cn(
              "mt-2.5 flex items-center gap-1.5 border-t pt-2.5 text-xs font-medium",
              desk.problem ? VALUE[desk.tone] : "text-muted-foreground"
            )}
          >
            {desk.problem ? (
              desk.problem
            ) : (
              <>
                <CheckCircle2 className="size-3 text-success" />
                {t(locale, "nothing wrong here")}
              </>
            )}
          </p>
        </Link>
      ))}
    </div>
  );
}
