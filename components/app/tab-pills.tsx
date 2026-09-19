"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

import { Tx } from "@/components/app/tx";
/**
 * Sub-navigation inside one area.
 *
 * The sidebar says which department you are in; this says which of its screens
 * you are on. Keeping the two apart means the sidebar does not have to grow a
 * nested tree that is three levels deep by the time Finance has nine pages.
 */
export function TabPills({
  tabs,
}: {
  tabs: { href: string; label: string; count?: number }[];
}) {
  const pathname = usePathname();

  return (
    <nav className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {tabs.map((tab) => {
        /* Exact match, because these are siblings — a prefix match would light
           up "Overview" while you are standing on "Overview / accounts". */
        const active = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "focus-ring inline-flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-brand text-brand-foreground shadow-soft"
                : "border bg-card text-foreground/75 hover:bg-secondary hover:text-foreground"
            )}
          >
            <Tx>{tab.label}</Tx>
            {tab.count !== undefined && tab.count > 0 ? (
              <span
                className={cn(
                  "tnum rounded-full px-1.5 text-[11px] font-semibold",
                  active ? "bg-white/20" : "bg-warning/15 text-warning"
                )}
              >
                {tab.count}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
