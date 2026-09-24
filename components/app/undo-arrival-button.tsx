"use client";

import { useActionState, useCallback, useEffect, useState } from "react";
import { Undo2 } from "lucide-react";

import { undoContainerArrival, type ActionState } from "@/lib/actions/containers";
import { FormMessage } from "@/components/app/form-message";
import { Modal } from "@/components/app/modal";
import { SubmitButton } from "@/components/app/submit-button";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

import { useT } from "@/components/app/locale-provider";
/** "The ship had not arrived" — a correction, asked once in a dialog. */
export function UndoArrivalButton({
  containerId,
  reference,
  iconOnly = false,
  checkedIn = 0,
}: {
  containerId: string;
  reference: string;
  /** A small square in a row of actions: a correction, not the next step. */
  iconOnly?: boolean;
  /** Consignments Dar has already checked in off this container. */
  checkedIn?: number;
}) {
  const tx = useT();
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState<ActionState, FormData>(undoContainerArrival, {});
  const close = useCallback(() => setOpen(false), []);
  useEffect(() => {
    if (state.ok) setOpen(false);
  }, [state]);

  return (
    <>
      {iconOnly ? (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => setOpen(true)}
          title={tx("Undo arrived")}
          aria-label={`${tx("Undo arrived")} ${reference}`}
          className="w-9 px-0 text-muted-foreground hover:text-foreground"
        >
          <Undo2 />
        </Button>
      ) : (
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(true)}>
          <Undo2 />
          {tx("Undo arrived")}
        </Button>
      )}
      {state.ok ? <FormMessage ok={state.ok} /> : null}
      {open ? (
        <Modal title={`Undo the arrival of ${reference}`} onClose={close}>
          <p className="text-sm text-muted-foreground">
            {tx("The container and its cargo go back to in transit, and customers who were told it reached the port are told that was too soon.")}
          </p>
          {checkedIn > 0 ? (
            <p className="rounded-lg border border-warning/40 bg-warning/[0.08] px-3 py-2 text-sm">
              {checkedIn}{" "}
              {tx(
                checkedIn === 1
                  ? "consignment has been checked in. Its Dar count will be removed — what was counted stays in the history — and its draft bill goes back to China's figures."
                  : "consignments have been checked in. Their Dar counts will be removed — what was counted stays in the history — and their draft bills go back to China's figures."
              )}
            </p>
          ) : null}
          <form action={action} className="space-y-4">
            <input type="hidden" name="containerId" value={containerId} />
            <label className="block space-y-1.5">
              <span className="text-sm font-medium">
                {tx("Why")}{" "}
                {checkedIn > 0 ? null : (
                  <span className="font-normal text-muted-foreground">{tx("optional")}</span>
                )}
              </span>
              <Textarea
                name="reason"
                rows={2}
                maxLength={300}
                required={checkedIn > 0}
                placeholder={tx("Pressed on the wrong container")}
                className="resize-none"
              />
            </label>
            <FormMessage error={state.error} />
            <div className="flex flex-wrap gap-2">
              <SubmitButton size="sm" variant="destructive">{tx("Undo arrived")}</SubmitButton>
              <Button type="button" size="sm" variant="ghost" onClick={close}>
                {tx("Leave it")}
              </Button>
            </div>
          </form>
        </Modal>
      ) : null}
    </>
  );
}
