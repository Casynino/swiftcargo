import type { Currency, ReportTable } from "@/lib/report-tables";
import { cn } from "@/lib/utils";

import { primeLocale, T } from "@/lib/server-t";
import { Tx } from "@/components/app/tx";
/** One report table, the same on the page and on paper. */
export function ReportTableView({
  table,
  cur,
  printable = false,
}: {
  table: ReportTable;
  cur: Currency;
  printable?: boolean;
}) {
  const fmt = (v: string | number, money?: boolean) =>
    typeof v === "number"
      ? v.toLocaleString("en-US", {
          minimumFractionDigits: money && cur === "USD" ? 2 : 0,
          maximumFractionDigits: money && cur === "USD" ? 2 : money ? 0 : 3,
        })
      : v;

  return (
    <div className="relative overflow-x-auto">
      <table className={cn("w-full text-sm", printable && "text-black")}>
        <thead>
          <tr className={cn("border-b text-left text-[11px] uppercase tracking-wider", printable ? "border-black" : "text-muted-foreground")}>
            {table.columns.map((c, i) => (
              <th key={i} className={cn("px-4 py-2 font-medium", (c.money || c.numeric) && "text-right")}>
                <Tx>{c.label}</Tx>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y">
          {table.rows.length === 0 ? (
            <tr>
              <td colSpan={table.columns.length} className="px-4 py-6 text-center text-muted-foreground">
                {T("Nothing in this period.")}
              </td>
            </tr>
          ) : (
            table.rows.map((row, r) => (
              <tr key={r}>
                {row.map((cell, i) => (
                  <td
                    key={i}
                    className={cn(
                      "tnum px-4 py-2",
                      (table.columns[i]?.money || table.columns[i]?.numeric) && "text-right",
                      typeof cell === "number" && cell < 0 && !printable && "text-destructive"
                    )}
                  >
                    {fmt(cell, table.columns[i]?.money)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
        {table.total ? (
          <tfoot>
            <tr className={cn("border-t-2 font-semibold", printable && "border-black")}>
              {table.total.map((cell, i) => (
                <td key={i} className={cn("tnum px-4 py-2", (table.columns[i]?.money || table.columns[i]?.numeric) && "text-right")}>
                  {fmt(cell, table.columns[i]?.money)}
                </td>
              ))}
            </tr>
          </tfoot>
        ) : null}
      </table>
    </div>
  );
}
