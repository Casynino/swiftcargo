"use client";

import { useActionState, useState } from "react";
import { createPortal } from "react-dom";
import { Lock, X } from "lucide-react";

import { FormMessage } from "@/components/app/form-message";
import { SubmitButton } from "@/components/app/submit-button";
import { useEscape } from "@/components/app/use-escape";
import { useT } from "@/components/app/locale-provider";
import { distinctMark } from "@/lib/customer-name";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { closeSailing, type ActionState } from "@/lib/actions/containers";

export type RemainingLine = {
  cargoId: string;
  reference: string;
  customer: string;
  shippingMark: string | null;
  /** What the packing list says should have come off. */
  packages: number;
  cbm: string;
};

/**
 * CLOSING A CONTAINER: ONE SMALL BUTTON, AND ONE QUESTION BEHIND IT.
 *
 * The button sits with the container's other actions and says nothing until it
 * is pressed — a sailing is closed once, and a panel explaining that took the
 * top off a page people open twenty times a day for everything else.
 *
 * Behind it is the only question closing asks: what became of the cargo nobody
 * counted? Tick them, say where they go, say why the sailing is ending, press
 * once. The moves and the close happen together, because a consignment left on
 * a closed box is one nobody can find again.
 *
 * MOVING CARRIES A CONSIGNMENT ACROSS UNCHANGED. Its measurements are the
 * warehouse's, its bill is its own and its storage clock runs from the day Dar
 * booked it in — none of which this touches. What moves is which box it is
 * listed against, written down with the old value, a reason and a case.
 */
export function CloseContainerButton({
  containerId,
  reference,
  remaining,
  targets,
  canClose,
  canReportMissing,
  summary,
}: {
  containerId: string;
  reference: string;
  remaining: RemainingLine[];
  /** Where a consignment could go instead: boxes still loading, then the other sailings. */
  targets: { id: string; label: string }[];
  canClose: boolean;
  canReportMissing: boolean;
  summary: { expected: number; received: number; missing: number };
}) {
  const tx = useT();
  const [open, setOpen] = useState(false);
  useEscape(open, () => setOpen(false));

  if (!canClose) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-sm font-medium hover:bg-secondary"
      >
        <Lock className="size-4" />
        {tx("Close the container")}
        {remaining.length > 0 ? (
          <span className="tnum rounded-full bg-warning/20 px-1.5 text-xs font-semibold text-warning">
            {remaining.length}
          </span>
        ) : null}
      </button>

      {open
        ? createPortal(
            /* Portalled to the body: the page's panels scroll and clip, and a
               dialog confined to one of them is a dialog nobody can read. */
            <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center">
              <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl border bg-card p-5 shadow-raised">
                <CloseDialog
                  containerId={containerId}
                  reference={reference}
                  remaining={remaining}
                  targets={targets}
                  canReportMissing={canReportMissing}
                  summary={summary}
                  onDone={() => setOpen(false)}
                />
              </div>
            </div>,
            document.body
          )
        : null}
    </>
  );
}

function CloseDialog({
  containerId,
  reference,
  remaining,
  targets,
  canReportMissing,
  summary,
  onDone,
}: {
  containerId: string;
  reference: string;
  remaining: RemainingLine[];
  targets: { id: string; label: string }[];
  canReportMissing: boolean;
  summary: { expected: number; received: number; missing: number };
  onDone: () => void;
}) {
  const tx = useT();
  const [state, action] = useActionState<ActionState, FormData>(
    closeSailing,
    {}
  );
  /* Everything starts ticked: the common case is one answer for the whole
     remainder, and unticking two is less work than ticking eight. */
  const [picked, setPicked] = useState<Set<string>>(
    () => new Set(remaining.map((r) => r.cargoId))
  );

  const outstanding = remaining.length > 0;
  const none = picked.size === 0;

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="containerId" value={containerId} />

      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-base font-semibold">
            {tx("Close")} {reference}
          </p>
          <p className="tnum mt-0.5 text-xs text-muted-foreground">
            {tx("Expected")} {summary.expected} · {tx("Received")}{" "}
            {summary.received} · {tx("Missing")} {summary.missing}
          </p>
        </div>
        <button
          type="button"
          onClick={onDone}
          aria-label={tx("Close this window")}
          className="rounded-md p-1 text-muted-foreground hover:bg-secondary"
        >
          <X className="size-4" />
        </button>
      </div>

      {outstanding ? (
        <>
          <p className="text-sm text-muted-foreground">
            {tx("Still open on this container. Tick the ones to deal with and say where they go — a consignment left on a closed box is one nobody can find again.")}
          </p>

          <div className="overflow-hidden rounded-xl border">
            <ul className="max-h-60 divide-y overflow-y-auto">
              {remaining.map((line) => (
                <li key={line.cargoId}>
                  <label className="flex cursor-pointer items-center gap-3 px-3 py-2.5 text-sm hover:bg-muted/40">
                    <input
                      type="checkbox"
                      className="size-4 shrink-0"
                      checked={picked.has(line.cargoId)}
                      onChange={() =>
                        setPicked((current) => {
                          const next = new Set(current);
                          if (next.has(line.cargoId)) next.delete(line.cargoId);
                          else next.add(line.cargoId);
                          return next;
                        })
                      }
                    />
                    {/* Only the ticked ones are submitted: one value per
                        consignment is what lets one press move six. */}
                    {picked.has(line.cargoId) ? (
                      <input type="hidden" name="cargoId" value={line.cargoId} />
                    ) : null}
                    <span className="min-w-0 flex-1">
                      <span className="tnum block font-medium">
                        {line.reference}
                      </span>
                      {/* The mark only when it is not the name again. */}
                      <span className="block truncate text-xs text-muted-foreground">
                        {line.customer}
                        {distinctMark(line.customer, line.shippingMark)
                          ? ` · ${distinctMark(line.customer, line.shippingMark)}`
                          : ""}
                      </span>
                    </span>
                    <span className="tnum shrink-0 text-xs text-muted-foreground">
                      {line.packages} {tx("pkg")} · {line.cbm}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </div>

          <div className="flex items-center gap-3 text-xs">
            <button
              type="button"
              className="font-medium text-brand hover:underline"
              onClick={() =>
                setPicked(
                  none ? new Set(remaining.map((r) => r.cargoId)) : new Set()
                )
              }
            >
              {none ? tx("Tick all") : tx("Tick none")}
            </button>
            <span className="tnum text-muted-foreground">
              {picked.size} {tx("of")} {remaining.length}
            </span>
          </div>

          <NativeSelect
            name="destination"
            aria-label={tx("Where do they go?")}
            required={picked.size > 0}
            className="w-full"
          >
            <option value="">{tx("Where do they go?")}</option>
            {targets.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
            {/* The other honest answer, for the desk that looked in the box. */}
            {canReportMissing ? (
              <option value="MISSING">
                {tx("They never came off — report missing")}
              </option>
            ) : null}
          </NativeSelect>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          {tx("Everything on the manifest is accounted for. Closing is the last word on this sailing — nothing more can happen to a closed container.")}
        </p>
      )}

      <Input
        name="reason"
        placeholder={tx("Why the sailing is being closed now")}
        maxLength={300}
      />

      <FormMessage error={state.error} ok={state.ok} />

      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton pendingLabel={tx("Closing the container…")}>
          <Lock />
          {tx("Close the container")}
        </SubmitButton>
        <button
          type="button"
          onClick={onDone}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          {tx("Cancel")}
        </button>
      </div>
    </form>
  );
}
