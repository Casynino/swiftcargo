"use client";

import { useActionState, useCallback, useEffect, useState } from "react";
import { MessageSquareWarning, Ship, TriangleAlert, Undo2, Warehouse, type LucideIcon } from "lucide-react";

import { undoContainerArrival, type ActionState } from "@/lib/actions/containers";
import { FormMessage } from "@/components/app/form-message";
import { Modal } from "@/components/app/modal";
import { SubmitButton } from "@/components/app/submit-button";
import { translateMessage } from "@/components/app/tx";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

import { useT } from "@/components/app/locale-provider";
/**
 * "The ship had not arrived" — a correction, asked once in a dialog laid out
 * the way the reference system lays it out: what goes back, the one warning,
 * then what happens, step by step. The words are this system's own — it tells
 * customers a correction, and nothing past clearance can be undone here.
 */
export function UndoArrivalButton({
  containerId,
  reference,
  consignments,
  checkedIn = 0,
}: {
  containerId: string;
  reference: string;
  /** Every consignment on the container, all of which go back to sea. */
  consignments: number;
  /** Consignments Dar has already checked in off this container. */
  checkedIn?: number;
}) {
  const tx = useT();
  const tm = (message: string) => translateMessage(message, tx);
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState<ActionState, FormData>(undoContainerArrival, {});
  const close = useCallback(() => setOpen(false), []);
  useEffect(() => {
    if (state.ok) setOpen(false);
  }, [state]);

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        onClick={() => setOpen(true)}
        className="text-muted-foreground hover:text-foreground"
      >
        <Undo2 />
        {tx("Undo arrived")}
      </Button>
      {state.ok ? <FormMessage ok={state.ok} /> : null}
      {open ? (
        <Modal title={`${tx("Undo the arrival of")} ${reference}`} onClose={close} className="max-w-lg">
          <div>
            <p className="font-medium">
              {consignments} {tx(consignments === 1 ? "consignment on" : "consignments on")} {reference}{" "}
              {tx("go back to sea.")}
            </p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {tx("Only a container with nothing cleared on it can be put back.")}
            </p>
          </div>

          <div className="flex gap-3 rounded-xl border border-destructive/40 bg-destructive/[0.08] p-4">
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-destructive/15">
              <TriangleAlert className="size-5 text-destructive" />
            </span>
            <div>
              <p className="font-semibold">{tx("The arrival is removed, not paused")}</p>
              <p className="mt-1 text-sm">
                {tx(
                  "The arrival date comes off every consignment on this container. When the box really lands, mark it arrived again."
                )}
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                {tx("Press this only when the box had not in fact arrived.")}
              </p>
            </div>
          </div>

          <ol className="space-y-3 text-sm">
            <Step
              icon={Ship}
              tone="text-warning bg-warning/15"
              title={tx("Back at sea")}
              detail={tx("Now. The container and everything on it stand in transit again.")}
            />
            {checkedIn > 0 ? (
              <Step
                icon={Warehouse}
                tone="text-destructive bg-destructive/12"
                title={tm(`${checkedIn} Dar check-${checkedIn === 1 ? "in" : "ins"} removed`)}
                detail={tx(
                  "What was counted stays in the history, and draft bills go back to China's figures."
                )}
              />
            ) : null}
            <Step
              icon={MessageSquareWarning}
              tone="text-muted-foreground bg-secondary"
              title={tx("Customers get a correction")}
              detail={tx("Anyone told the goods had reached the port is told they are still on the way.")}
            />
          </ol>

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
              <SubmitButton size="sm" variant="destructive">
                <Undo2 />
                {tx("Undo arrived")}
              </SubmitButton>
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

function Step({
  icon: Icon,
  tone,
  title,
  detail,
}: {
  icon: LucideIcon;
  tone: string;
  title: string;
  detail: string;
}) {
  return (
    <li className="flex items-start gap-3">
      <span className={`grid size-7 shrink-0 place-items-center rounded-full ${tone}`}>
        <Icon className="size-4" />
      </span>
      <span>
        <span className="block font-medium">{title}</span>
        <span className="block text-muted-foreground">{detail}</span>
      </span>
    </li>
  );
}
