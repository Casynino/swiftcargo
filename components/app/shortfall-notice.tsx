"use client";

import { Check, Scale, TriangleAlert, Undo2 } from "lucide-react";

import { cn } from "@/lib/utils";

import { useT } from "@/components/app/locale-provider";
/* A rounding is not worth a second look; this much might be a typed digit. */
const LARGE_TZS = 50_000;

/**
 * WHAT ARRIVED IS LESS THAN THE BILL.
 *
 * Ordinary — the customer rounded, the bank took a fee, they sent what they
 * had. The figures lead and one press answers it: the payment stays the money
 * that arrived, and the rest is written off when Finance verifies it, against
 * the last bill it reached, never more than the figure shown here. A large gap
 * is flagged, never blocked.
 *
 * Every desk that records a payment may press it. Where Finance verifies the
 * payment itself it is done on verification; from Support it travels with the
 * claim as a request, shown on the verify screen, and Finance decides.
 */
export function ShortfallNotice({
  gapTzs,
  gapUsd,
  canClear,
  decides = true,
  armed,
  onArmedChange,
  billNumber,
}: {
  gapTzs: number;
  gapUsd: number | null;
  canClear: boolean;
  /** False for a desk whose payment goes to Finance: clearing is then asked for, not done. */
  decides?: boolean;
  armed: boolean;
  onArmedChange: (armed: boolean) => void;
  billNumber?: string;
}) {
  const tx = useT();
  if (!(gapTzs > 0)) return null;
  const large = gapTzs >= LARGE_TZS;
  const figures = `TZS ${Math.round(gapTzs).toLocaleString("en-US")}${gapUsd !== null ? ` · USD ${gapUsd.toFixed(2)}` : ""}`;

  return (
    <div
      className={cn(
        "rounded-lg border px-3 py-2.5 text-sm",
        armed && !large
          ? "border-success/40 bg-success/10 text-success"
          : "border-warning/40 bg-warning/10 text-warning"
      )}
    >
      {armed ? (
        <>
          <input type="hidden" name="clearShortfall" value="1" />
          <input type="hidden" name="clearShortfallUpTo" value={Math.round(gapTzs)} />
        </>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 font-medium">
          {armed ? <Check className="size-4" /> : <TriangleAlert className="size-4" />}
          {armed
            ? decides
              ? `Clearing ${figures} — written off when verified`
              : `Asking Finance to clear ${figures}`
            : `Short ${figures}`}
        </p>
        {canClear ? (
          armed ? (
            <button
              type="button"
              onClick={() => onArmedChange(false)}
              className="inline-flex items-center gap-1 text-xs font-semibold underline underline-offset-2"
            >
              <Undo2 className="size-3.5" />
              {tx("Undo")}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onArmedChange(true)}
              className="inline-flex items-center gap-1.5 rounded-md bg-warning px-2.5 py-1 text-xs font-semibold text-white hover:bg-warning/90"
            >
              <Scale className="size-3.5" />
              {tx("Clear it")}
            </button>
          )
        ) : null}
      </div>
      {!armed ? (
        <p className="mt-1 text-xs opacity-80">
          {canClear ? "Or leave it" : "It stays"} owing{billNumber ? ` on ${billNumber}` : " on the last ticked bill"}.
        </p>
      ) : null}
      {large ? (
        <p className="mt-1 text-xs font-medium">
          {tx("That is a large difference — check the figure before clearing it.")}
        </p>
      ) : null}
    </div>
  );
}
