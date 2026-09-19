"use client";

import { useActionState } from "react";
import { Ban, CheckCircle2, TriangleAlert } from "lucide-react";

import { FormMessage } from "@/components/app/form-message";
import { SubmitButton } from "@/components/app/submit-button";
import { chargeStorage, type ActionState } from "@/lib/actions/invoices";
import { cn } from "@/lib/utils";

import { useT } from "@/components/app/locale-provider";
/**
 * WHAT THE FLOOR SPACE HAS COST, AND WHAT WE HAVE DONE ABOUT IT.
 *
 * Its own card, above everything else on this column, because it is the only
 * thing here that gets worse while nobody looks at it. The clerk sees the day
 * count before they see the payment form, which is the order the conversation
 * actually happens in: "you are four days late, that is eight dollars, do you
 * want me to waive it?"
 *
 * Two figures side by side and they are deliberately different: what the rule
 * works out to, and what is actually on the bill. A clerk who waived half of it
 * last week needs to see both, or they will waive it again.
 *
 * Nothing here charges by itself. Whether to bill a customer who was three days
 * late is a commercial judgement, and a charge that appears on its own is one
 * nobody can explain when the customer rings.
 */
export function StorageCard({
  invoiceId,
  currency,
  daysHeld,
  freeDays,
  chargeableDays,
  calculated,
  onTheBill,
  since,
}: {
  invoiceId: string;
  currency: string;
  daysHeld: number;
  freeDays: number;
  chargeableDays: number;
  /** What the rule says it comes to, formatted. */
  calculated: string;
  /** What is actually on the invoice, formatted. Null when nothing is. */
  onTheBill: string | null;
  /** The day the boxes landed on the Dar floor, formatted. */
  since: string;
}) {
  const tx = useT();
  const [state, action] = useActionState<ActionState, FormData>(
    chargeStorage,
    {}
  );

  const running = chargeableDays > 0;

  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border border-l-4 bg-card shadow-soft",
        running ? "border-l-destructive" : "border-l-success"
      )}
    >
      <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
        <p className="flex items-center gap-2 font-medium">
          <TriangleAlert
            className={cn(
              "size-4",
              running ? "text-destructive" : "text-muted-foreground"
            )}
          />
          {tx("Storage")}
        </p>
        <span
          className={cn(
            "text-sm font-semibold",
            running ? "text-destructive" : "text-success"
          )}
        >
          {running ? "Fee running" : "Within the free days"}
        </span>
      </div>

      <div className="border-b px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <p className="tnum text-sm">
            {tx("Day")} <span className="text-lg font-semibold">{daysHeld}</span>{" "}
            <span className="text-muted-foreground">of {freeDays} free</span>
          </p>
          {running ? (
            <p className="tnum text-sm font-bold text-destructive">
              {chargeableDays} {chargeableDays === 1 ? "day" : "days"} late
            </p>
          ) : null}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          uncollected since {since} · charged at pickup
        </p>
      </div>

      <div className="space-y-3 px-4 py-3">
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 text-sm">
          <span className="text-muted-foreground">
            Calculated{" "}
            <span className="tnum font-semibold text-foreground">
              {calculated}
            </span>
          </span>
          <span className="text-muted-foreground">
            On the bill{" "}
            <span className="tnum font-semibold text-foreground">
              {onTheBill ?? "—"}
            </span>
          </span>
        </div>

        <div className="flex flex-wrap gap-2">
          <form action={action}>
            <input type="hidden" name="invoiceId" value={invoiceId} />
            <SubmitButton size="sm" variant="outline" disabled={!running}>
              <CheckCircle2 />
              Add storage fee · {calculated}
            </SubmitButton>
          </form>
          {onTheBill ? (
            <form action={action}>
              <input type="hidden" name="invoiceId" value={invoiceId} />
              <input type="hidden" name="remove" value="1" />
              <SubmitButton
                size="sm"
                variant="outline"
                className="border-warning/40 text-warning hover:bg-warning/10"
              >
                <Ban />
                {tx("Waive storage fee")}
              </SubmitButton>
            </form>
          ) : null}
        </div>

        <FormMessage error={state.error} ok={state.ok} />
      </div>
    </div>
  );
}
