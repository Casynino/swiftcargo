"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

const TABS = [
  ["/app/containers/loading", "Loading containers"],
  ["/app/containers/arrived", "Arrived containers"],
  ["/app/containers/closed", "Closed containers"],
  ["/app/finance/containers", "Container finances"],
] as const;

/**
 * THE SAILINGS' OWN TABS.
 *
 * Somebody in Containers is following boxes — still loading, landed, closed,
 * and what each one made. Showing them the Finance department's tabs here put
 * the general ledger and payroll one click from a loading table, which is a
 * different job.
 */
export function ContainerTabs() {
  const pathname = usePathname();
  return (
    <div className="flex flex-wrap gap-2">
      {TABS.map(([href, label]) => {
        const active = pathname === href;
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "rounded-full border px-4 py-2 text-sm font-medium transition-colors",
              active
                ? "border-brand bg-brand text-brand-foreground"
                : "bg-card text-foreground hover:bg-secondary"
            )}
          >
            {label}
          </Link>
        );
      })}
    </div>
  );
}
