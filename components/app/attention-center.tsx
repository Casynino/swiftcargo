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
      <div className="flex items-center gap-2.5 rounded-xl border bg-card px-4 py-3 shadow-soft">
        <span aria-hidden className="h-7 w-0.5 shrink-0 rounded-full bg-success" />
        <CheckCircle2 className="size-3.5 shrink-0 text-success" />
        <p className="min-w-0 text-[13px] leading-tight">
          <span className="font-semibold">{t("Nothing needs you")}</span>
          <span className="mt-0.5 block text-xs text-muted-foreground">
            {t("No missing cargo, no overdue bills, nothing held.")}
          </span>
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border bg-card shadow-soft">
      {groups.length > 1 ? (
      <div className="flex gap-2 overflow-x-auto border-b px-3 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
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
                "focus-ring inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors",
                active === group
                  ? "border-brand bg-brand text-brand-foreground"
                  : "bg-card text-muted-foreground hover:bg-secondary hover:text-foreground"
              )}
            >
              {t(group)}
              <span className="tnum opacity-70">{count}</span>
            </button>
          );
        })}
      </div>
      ) : null}

      {/* Three rows show; the rest scroll inside the panel, which is the same
          height whether the desk has three things or thirty. */}
      <ul className="max-h-[10.5rem] divide-y overflow-y-auto">
        {shown.map((item) => (
          <li key={item.id}>
            <Link
              href={item.href}
              className="flex items-center gap-2.5 px-4 py-2 transition-colors hover:bg-secondary/50"
            >
              <span aria-hidden className={cn("h-7 w-0.5 shrink-0 rounded-full", BAR[item.tone])} />
              {item.tone === "neutral" ? (
                <Info className={cn("size-3.5 shrink-0", ICON[item.tone])} />
              ) : (
                <TriangleAlert className={cn("size-3.5 shrink-0", ICON[item.tone])} />
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-semibold leading-tight">
                  {titleIn(item.title, t)}
                </span>
                <span className="mt-0.5 block truncate text-xs leading-tight text-muted-foreground">
                  {t(item.detail)}
                </span>
              </span>
              {item.meta ? (
                <span className="shrink-0 text-right">
                  <span className="block font-mono text-xs font-semibold tabular-nums">{t(item.meta)}</span>
                  {item.metaSub ? (
                    <span className="block font-mono text-xs tabular-nums text-muted-foreground">{t(item.metaSub)}</span>
                  ) : null}
                </span>
              ) : null}
              <ChevronRight className="mt-1 size-4 shrink-0 text-muted-foreground" />
            </Link>
          </li>
        ))}
      </ul>

      {shown.length > 3 ? (
        <p className="flex items-center justify-center gap-1.5 border-t py-1.5 text-center text-xs text-muted-foreground">
          <ChevronDown className="size-3.5" />
          {t("scroll for")} {shown.length - 3} {t("more")}
        </p>
      ) : null}
    </div>
  );
}
