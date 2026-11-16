"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCircle2, ChevronDown, ChevronRight, Info, TriangleAlert } from "lucide-react";

import { useT } from "@/components/app/locale-provider";
import { cn } from "@/lib/utils";

export type AttentionItem = {
  id: string;
  group: string;
  count: number;
  title: string;
  detail: string;
  href: string;
  tone: "warn" | "bad" | "neutral";
  /** A figure or state on the right — what it is worth, how long it has sat. */
  meta?: string;
  metaSub?: string;
};

/* A title is a count and a phrase — "23 waiting more than 3 days". The
   phrase is what the dictionary knows; the number stays a number. */
function titleIn(title: string, t: (text: string) => string) {
  const m = title.match(/^(\d[\d,]*)\s+(.+)$/);
  return m ? `${m[1]} ${t(m[2])}` : t(title);
}

/* As on the air side: red for what is wrong, amber for what is slipping,
   blue for the desk's everyday queue. */
const BAR = {
  warn: "bg-warning",
  bad: "bg-destructive",
  neutral: "bg-info",
} as const;

const ICON = {
  warn: "text-warning",
  bad: "text-destructive",
  neutral: "text-info",
} as const;

/**
 * Everything that is going wrong, one line per kind.
 *
 * Grouped by the desk that can fix it rather than by the screen it lives on,
 * because the question at the start of a shift is "what needs me", not "which
 * module has an alert". The tabs let somebody who only handles money ignore the
 * warehouse's problems without losing the count of them.
 *
 * Each row says how many and why it matters, and opens the filtered list of the
 * actual records. The sentence is not truncated — a warning nobody can finish
 * reading is a warning nobody acts on.
 *
 * Three rows, then it scrolls. Deep enough to see there is more than one
 * problem, short enough that the list does not push the rest of the morning off
 * the screen. Scrolling rather than paginating, because a pager on a worry list
 * is a way of hiding the fourth worry.
 */
export function AttentionCenter({ items }: { items: AttentionItem[] }) {
  const t = useT();
  const groups = [...new Set(items.map((i) => i.group))];
  const [active, setActive] = useState<string>("All");

  const shown = active === "All" ? items : items.filter((i) => i.group === active);

  if (items.length === 0) {
    return (
      <div className="flex items-center gap-2.5 rounded-xl border bg-card px-3.5 py-2.5 text-[13px] shadow-soft">
        <CheckCircle2 className="size-4 shrink-0 text-success" />
        <p className="min-w-0 truncate leading-tight">
          <span className="font-semibold">{t("Nothing needs you")}</span>
          <span className="text-muted-foreground"> · {t("No missing cargo, no overdue bills, nothing held.")}</span>
        </p>
      </div>
    );
  }

  return (
    <div>
      {groups.length > 1 ? (
      <div className="mb-2 hidden flex-wrap gap-1.5 md:flex">
        {["All", ...groups].map((group) => {
          const count =
            group === "All"
              ? items.length
              : items.filter((i) => i.group === group).length;
          return (
            <button
              key={group}
              type="button"
              onClick={() => setActive(group)}
              className={cn(
                "focus-ring inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors",
                active === group
                  ? "bg-brand text-brand-foreground"
                  : "bg-secondary text-muted-foreground hover:text-foreground"
              )}
            >
              {t(group)}
              <span className="tnum opacity-70">{count}</span>
            </button>
          );
        })}
      </div>
      ) : null}
    <div className="overflow-hidden rounded-xl border bg-card shadow-soft">

      {/* Three rows show; the rest scroll inside the panel, which is the same
          height whether the desk has three things or thirty. */}
      <ul className="max-h-[12.5rem] divide-y overflow-y-auto md:max-h-[8.6rem]">
        {shown.map((item) => (
          <li key={item.id}>
            <Link
              href={item.href}
              className="flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-secondary/50 active:bg-secondary/60 md:gap-2.5 md:px-3.5 md:py-1.5"
            >
              {/* A phone gets one coloured dot and the line, as ZELab's home does; the
                  bar, the icon, the reason and the figure are for a computer. */}
              <span aria-hidden className={cn("size-2 shrink-0 rounded-full md:hidden", BAR[item.tone])} />
              <span aria-hidden className={cn("hidden h-6 w-0.5 shrink-0 rounded-full md:block", BAR[item.tone])} />
              {item.tone === "neutral" ? (
                <Info className={cn("hidden size-3.5 shrink-0 md:block", ICON[item.tone])} />
              ) : (
                <TriangleAlert className={cn("hidden size-3.5 shrink-0 md:block", ICON[item.tone])} />
              )}
              <span className="min-w-0 flex-1">
                <span className="line-clamp-2 text-[15px] font-medium leading-snug md:block md:truncate md:text-[13px] md:font-semibold md:leading-tight">
                  {titleIn(item.title, t)}
                </span>
                <span className="mt-px hidden truncate text-[11px] leading-tight text-muted-foreground md:block">
                  {t(item.detail)}
                </span>
              </span>
              {item.meta ? (
                <span className="hidden shrink-0 text-right md:block">
                  <span className="block font-mono text-[11px] font-semibold tabular-nums">{t(item.meta)}</span>
                  {item.metaSub ? (
                    <span className="block font-mono text-[10px] tabular-nums text-muted-foreground">{t(item.metaSub)}</span>
                  ) : null}
                </span>
              ) : null}
              <ChevronRight className="size-4 shrink-0 text-muted-foreground md:size-3.5" />
            </Link>
          </li>
        ))}
      </ul>

      {shown.length > 3 ? (
        <p className="flex items-center justify-center gap-1.5 border-t py-1 text-center text-[11px] text-muted-foreground">
          <ChevronDown className="size-3.5" />
          {t("scroll for")} {shown.length - 3} {t("more")}
        </p>
      ) : null}
    </div>
    </div>
  );
}
