"use client";

import { useActionState, useState } from "react";
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
 * The charge goes on the bill by itself each night past the free days
 * (lib/storage-charge.ts). What is left to a person is the exception: taking
 * it off, with a reason, or putting it back after that.
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
  waived,
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
  /** The day the goods were cleared — when the clock started — formatted. */
  since: string;
  /** Why storage was taken off this bill, when it was. */
  waived: string | null;
}) {
  const tx = useT();
  const [state, action] = useActionState<ActionState, FormData>(
    chargeStorage,
    {}
  );

  const running = chargeableDays > 0;
  const [removing, setRemoving] = useState(false);

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
          {waived
            ? `cleared ${since} · storage taken off: ${waived}`
            : `cleared ${since} · added to the bill by itself, a day at a time, until pickup`}
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

        {waived ? (
          <form action={action}>
            <input type="hidden" name="invoiceId" value={invoiceId} />
            <SubmitButton size="sm" variant="outline">
              <CheckCircle2 />
              {tx("Charge storage again")}
            </SubmitButton>
          </form>
        ) : removing ? (
          <form action={action} className="space-y-2">
            <input type="hidden" name="invoiceId" value={invoiceId} />
            <input type="hidden" name="remove" value="1" />
            <input
              name="reason"
              required
              maxLength={300}
              autoFocus
              placeholder={tx("Why — e.g. agreed with the manager")}
              className="h-8 w-full rounded-md border bg-background px-2.5 text-xs"
            />
            <div className="flex flex-wrap gap-2">
              <SubmitButton size="sm" variant="destructive">
                <Ban />
                {tx("Remove storage")}
              </SubmitButton>
              <button
                type="button"
                onClick={() => setRemoving(false)}
                className="h-9 rounded-md px-3 text-sm text-muted-foreground hover:text-foreground"
              >
                {tx("Keep it")}
              </button>
            </div>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setRemoving(true)}
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-warning/40 px-3 text-sm font-medium text-warning hover:bg-warning/10"
          >
            <Ban className="size-4" />
            {tx("Remove storage")}
            {onTheBill ? ` · ${onTheBill}` : ""}
          </button>
        )}

        <FormMessage error={state.error} ok={state.ok} />
      </div>
    </div>
  );
}
