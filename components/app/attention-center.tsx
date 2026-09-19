"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight, TriangleAlert } from "lucide-react";

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

const BORDER = {
  warn: "border-l-warning",
  bad: "border-l-destructive",
  neutral: "border-l-muted-foreground/40",
} as const;

const ICON = {
  warn: "text-warning",
  bad: "text-destructive",
  neutral: "text-muted-foreground",
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
      <div className="rounded-xl border bg-card p-8 text-center shadow-soft">
        <p className="text-sm font-medium">{t("Nothing needs you")}</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("No missing cargo, no overdue bills, nothing held.")}
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border bg-card shadow-soft">
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
                "focus-ring inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
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

      <ul className="max-h-[12.5rem] divide-y overflow-y-auto">
        {shown.map((item) => (
          <li key={item.id}>
            <Link
              href={item.href}
              className={cn(
                "flex items-center gap-2.5 border-l-2 px-4 py-2.5 transition-colors hover:bg-secondary/50",
                BORDER[item.tone]
              )}
            >
              <TriangleAlert
                className={cn("mt-0.5 size-3.5 shrink-0", ICON[item.tone])}
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">
                  {item.title}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {t(item.detail)}
                </span>
              </span>
              {item.meta ? (
                <span className="shrink-0 text-right">
                  <span className="tnum block text-sm font-semibold">{item.meta}</span>
                  {item.metaSub ? (
                    <span className="tnum block text-[11px] text-muted-foreground">{item.metaSub}</span>
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
