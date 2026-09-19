import { Tag } from "lucide-react";

import { primeLocale, T } from "@/lib/server-t";
/**
 * WHAT WAS AGREED, BESIDE WHAT THE BOOK SAYS.
 *
 * An agreed rate printed on its own reads as if it had been the price all
 * along, and the discount somebody granted disappears from the record. So this
 * always says the standard rate, the agreed rate and the difference per CBM.
 *
 * Renders nothing when the bill is at the book rate — the ordinary case — so a
 * list of bills is not covered in "standard price" badges.
 */
export function AgreedRate({
  standard,
  agreed,
  currency = "USD",
  className = "",
}: {
  standard: number | null;
  agreed: number | null;
  currency?: string;
  className?: string;
}) {
  if (agreed === null) return null;
  if (standard !== null && Math.abs(standard - agreed) < 0.005) return null;

  const off = standard === null ? null : Math.round((standard - agreed) * 100) / 100;

  return (
    <div className={`rounded-md border border-brand/40 bg-brand/[0.07] px-2.5 py-2 text-[11px] leading-relaxed ${className}`}>
      <p className="flex items-center gap-1.5 font-semibold text-brand">
        <Tag className="size-3.5 shrink-0" />
        {T("Special rate for this cargo")}
      </p>
      <p className="tnum mt-1 text-muted-foreground">
        {standard !== null ? (
          <>
            Standard{" "}
            <span className="text-foreground">
              {currency} {standard.toFixed(2)} per CBM
            </span>{" "}
            ·{" "}
          </>
        ) : null}
        Agreed{" "}
        <span className="font-semibold text-foreground">
          {currency} {agreed.toFixed(2)} per CBM
        </span>
        {standard === null ? <span> · the rate book&apos;s own figure was not recorded</span> : null}
        {off !== null ? (
          <>
            {" · "}
            <span className={off > 0 ? "text-success" : "text-warning"}>
              {off > 0 ? "−" : "+"}
              {currency} {Math.abs(off).toFixed(2)} per CBM
            </span>
          </>
        ) : null}
      </p>
    </div>
  );
}
