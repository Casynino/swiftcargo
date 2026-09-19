import { cn } from "@/lib/utils";

import { primeLocale, T } from "@/lib/server-t";
import { Tx } from "@/components/app/tx";
type Row = {
  label: string;
  china: string;
  dar: string;
  delta: string | null;
  /** True when the two figures genuinely disagree, not merely when both exist. */
  differs: boolean;
};

/**
 * CHINA'S FIGURES, DAR'S FIGURES, AND THE GAP.
 *
 * Neither column corrects the other. They are two true statements about two
 * different moments, and the difference between them is the only evidence
 * anybody has about what happened on the water — which is why this table exists
 * instead of one column that gets overwritten on arrival.
 */
export function MeasurementCompare({ rows }: { rows: Row[] }) {
  return (
    <div className="relative overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-xs uppercase tracking-wide text-muted-foreground">
            <th className="py-2 text-left font-semibold">{T("Measure")}</th>
            <th className="py-2 text-right font-semibold">{T("China")}</th>
            <th className="py-2 text-right font-semibold">{T("Dar")}</th>
            <th className="py-2 text-right font-semibold">{T("Difference")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label} className="border-b last:border-0">
              <td className="py-2.5"><Tx>{row.label}</Tx></td>
              <td className="tnum py-2.5 text-right">{row.china}</td>
              <td className="tnum py-2.5 text-right">{row.dar}</td>
              <td
                className={cn(
                  "tnum py-2.5 text-right font-medium",
                  row.differs ? "text-amber-700" : "text-muted-foreground"
                )}
              >
                {row.delta ?? "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
