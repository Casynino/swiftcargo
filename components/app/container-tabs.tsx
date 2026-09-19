"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { useT } from "@/components/app/locale-provider";
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
export function ContainerTabs({ finance = true }: { finance?: boolean }) {
  const pathname = usePathname();
  const t = useT();
  /* A tab this desk cannot open is a door that answers "not yours". */
  const tabs = TABS.filter(([href]) => finance || !href.startsWith("/app/finance"));
  return (
    <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 [&::-webkit-scrollbar]:hidden">
      {tabs.map(([href, label]) => {
        const active = pathname === href;
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "shrink-0 whitespace-nowrap rounded-full border px-4 py-2 text-sm font-medium transition-colors",
              active
                ? "border-brand bg-brand text-brand-foreground"
                : "bg-card text-foreground hover:bg-secondary"
            )}
          >
            {t(label)}
          </Link>
        );
      })}
    </div>
  );
}
