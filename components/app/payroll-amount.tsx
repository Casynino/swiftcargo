import type { PayrollFigure } from "@/lib/payroll";
import { cn } from "@/lib/utils";

import { Tx } from "@/components/app/tx";
/**
 * One payroll figure, shillings leading and the dollars underneath.
 *
 * It only prints. The conversion was done on the server by lib/payroll.ts
 * through lib/currency.ts, so the line editor in the browser and the two pages
 * on the server show the same shillings for the same salary.
 */
export function PayrollAmount({
  figure,
  strong = false,
  className,
}: {
  figure: PayrollFigure;
  /** For the figure that actually leaves the account. */
  strong?: boolean;
  className?: string;
}) {
  return (
    <span className={cn("block leading-tight", className)}>
      <span className={cn("tnum block whitespace-nowrap", strong ? "text-sm font-semibold" : "text-xs font-medium")}>
        {figure.lead}
      </span>
      {figure.sub === null ? null : (
        <span className="tnum block whitespace-nowrap text-[11px] font-normal text-muted-foreground"><Tx>{figure.sub}</Tx></span>
      )}
    </span>
  );
}
