import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { Tx } from "@/components/app/tx";
/**
 * The small uppercase rule above a block of a dashboard.
 *
 * A dashboard is several unrelated answers stacked vertically. Without a label
 * at the top of each, the reader infers where a section starts from the shape
 * of its contents — which works until two sections happen to be the same shape.
 *
 * The label carries the section's name and nothing else. A panel underneath it
 * must NOT repeat that name: "NEEDS YOU TODAY" over a card headed "What needs
 * you" is one heading printed twice, and reads as two things until you work out
 * it is one.
 */
export function SectionLabel({
  children,
  count,
  action,
}: {
  children: React.ReactNode;
  count?: number;
  /**
   * `keepScroll` is for an action that changes this section in place — an edit
   * toggle, a filter — rather than sending the reader somewhere else. Without
   * it the router lands them back at the top of the page and they have to find
   * their way down to the thing they just pressed.
   */
  action?: { href: string; label: string; keepScroll?: boolean };
}) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-3">
      <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {typeof children === "string" ? <Tx>{children}</Tx> : children}
        {count !== undefined && count > 0 ? (
          <span className="tnum rounded-full bg-warning/15 px-1.5 py-0.5 text-[11px] font-bold leading-none text-warning">
            {count}
          </span>
        ) : null}
      </h2>
      {action ? (
        <Link
          href={action.href}
          scroll={action.keepScroll ? false : undefined}
          className="focus-ring inline-flex shrink-0 items-center gap-1 rounded text-xs font-semibold text-brand hover:underline"
        >
          <Tx>{action.label}</Tx>
          <ArrowRight className="size-3.5" />
        </Link>
      ) : null}
    </div>
  );
}
