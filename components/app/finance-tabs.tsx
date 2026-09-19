"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

import { useT } from "@/components/app/locale-provider";
/**
 * THE DEPARTMENT'S OWN TABS.
 *
 * These are not the sidebar again — the sidebar is every screen a desk can
 * reach, and this is the nine faces of one thing: the company's money. A person
 * working the books moves between them dozens of times an hour, and reaching up
 * to a menu for each move is a menu press per thought.
 *
 * The earlier version listed the rate book and container costs beside them,
 * which is what made it read as a duplicate — those are settings and spending,
 * not the ledger.
 */
const TABS = [
  ["/app/finance", "Overview"],
  ["/app/finance/accounts", "Accounts"],
  ["/app/finance/collections", "Collections"],
  ["/app/finance/credit", "Credit"],
  ["/app/finance/ledger", "General ledger"],
  ["/app/finance/expenses", "Expenses"],
  ["/app/finance/payroll", "Payroll"],
  ["/app/finance/reports", "Profit & loss"],
  ["/app/finance/audit", "Money audit"],
] as const;

export function FinanceTabs() {
  const t = useT();
  const pathname = usePathname();

  return (
    <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:-mx-1 sm:flex-wrap sm:overflow-visible sm:px-1 [&::-webkit-scrollbar]:hidden">
      {TABS.map(([href, label]) => {
        /* Exact match for the hub, prefix for the rest — otherwise every tab
           lights up on every finance screen. */
        const active =
          href === "/app/finance"
            ? pathname === "/app/finance"
            : pathname === href || pathname.startsWith(`${href}/`);
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
