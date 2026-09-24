import { Ban, Tag, Warehouse } from "lucide-react";

import { cn } from "@/lib/utils";

import { primeLocale, T } from "@/lib/server-t";
export type PriceChange = {
  category: { from: string | null; to: string | null } | null;
  cbm: { from: number; to: number } | null;
  rate: { from: number; to: number } | null;
  currency: string;
  /** Taken off the bill, and why. Not a from/to pair — the book's price did
      not move, the customer's charge did. */
  discount: { amount: number; reason: string } | null;
  /** Storage charged on the bill after the free days, by itself. */
  /** `bills` is set when a combined payment's line stands for several. */
  storage?: { amount: number; days: number; bills?: number } | null;
  /** Storage Finance took off the bill, why, and who. */
  storageRemoved?: { amount: number | null; reason: string; by: string | null; bills?: number } | null;
};

/**
 * WHAT MOVED THE PRICE, ON ONE LINE.
 *
 * Our prices move on three things: the category (each has its own rate), the
 * volume, and a rate agreed for this one cargo. Whichever of them changed is
 * said here, old value quiet and new value bold, so a bill that is not what
 * the book would say explains itself on the list it is chased from. Renders
 * nothing when nothing changed — the ordinary case.
 */
export function PriceChanged({ change, className }: { change: PriceChange; className?: string }) {
  const parts: { from: string; to: string }[] = [];
  if (change.category) {
    parts.push({ from: change.category.from ?? "none", to: change.category.to ?? "none" });
  }
  if (change.cbm) {
    parts.push({ from: `${change.cbm.from.toFixed(3)} CBM`, to: `${change.cbm.to.toFixed(3)} CBM` });
  }
  if (change.rate) {
    parts.push({
      from: `${change.currency} ${change.rate.from.toFixed(2)}/CBM`,
      to: `${change.currency} ${change.rate.to.toFixed(2)}/CBM`,
    });
  }
  if (parts.length === 0 && !change.discount && !change.storage && !change.storageRemoved) return null;

  return (
    <span className={cn("flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] leading-4 tabular-nums", className)}>
      {parts.length > 0 ? (
        <>
          <Tag className="size-3 shrink-0 text-brand" aria-hidden />
          <span className="font-medium text-brand">{T("Price changed:")}</span>
          {parts.map((p, i) => (
            <span key={`p-${i}`} className="inline-flex items-center gap-1 whitespace-nowrap">
              {i > 0 ? <span className="text-muted-foreground">·</span> : null}
              <span className="text-muted-foreground">{p.from}</span>
              <span className="text-muted-foreground" aria-hidden>→</span>
              <span className="font-semibold text-foreground">{p.to}</span>
            </span>
          ))}
        </>
      ) : null}
      {/* A discount is not the book's price moving — it is money the company
          chose to give away, and it is said here in the same breath as any
          other reason this bill is not what the rate card says. */}
      {change.discount ? (
        <span className="inline-flex items-center gap-1 whitespace-nowrap rounded bg-warning/15 px-1.5 py-0.5 font-medium text-warning">
          <Tag className="size-3 shrink-0" aria-hidden />
          {T("Discounted")} {change.currency} {change.discount.amount.toFixed(2)}
          {change.discount.reason ? (
            <span className="font-normal opacity-80">· {change.discount.reason}</span>
          ) : null}
        </span>
      ) : null}
      {/* Storage is income of its own, and the ledger says when a payment
          carried it — or when the desk let the customer off it. */}
      {change.storage ? (
        <span className="inline-flex items-center gap-1 whitespace-nowrap rounded bg-marine/15 px-1.5 py-0.5 font-medium text-marine">
          <Warehouse className="size-3 shrink-0" aria-hidden />
          {T("Includes storage")} {change.currency} {change.storage.amount.toFixed(2)}
          <span className="font-normal opacity-80">
            ·{" "}
            {change.storage.bills && change.storage.bills > 1
              ? `${change.storage.bills} ${T("bills")}`
              : `${change.storage.days} ${change.storage.days === 1 ? T("day") : T("days")}`}
          </span>
        </span>
      ) : null}
      {change.storageRemoved ? (
        <span className="inline-flex items-center gap-1 whitespace-nowrap rounded bg-warning/15 px-1.5 py-0.5 font-medium text-warning">
          <Ban className="size-3 shrink-0" aria-hidden />
          {T("Storage removed")}
          {change.storageRemoved.bills && change.storageRemoved.bills > 1
            ? ` (${change.storageRemoved.bills} ${T("bills")})`
            : ""}
          {change.storageRemoved.amount !== null
            ? ` ${change.currency} ${change.storageRemoved.amount.toFixed(2)}`
            : ""}
          <span className="font-normal opacity-80">
            · {[change.storageRemoved.reason, change.storageRemoved.by].filter(Boolean).join(" — ")}
          </span>
        </span>
      ) : null}
    </span>
  );
}
