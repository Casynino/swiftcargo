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
}: {
  containerId: string;
  reference: string;
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
      <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(true)}>
        <Undo2 />
        {tx("Undo arrived")}
      </Button>
      {state.ok ? <FormMessage ok={state.ok} /> : null}
      {open ? (
        <Modal title={`Undo the arrival of ${reference}`} onClose={close}>
          <p className="text-sm text-muted-foreground">
            {tx("The container and its cargo go back to in transit, and customers who were told it reached the port are told that was too soon.")}
          </p>
          <form action={action} className="space-y-4">
            <input type="hidden" name="containerId" value={containerId} />
            <label className="block space-y-1.5">
              <span className="text-sm font-medium">
                {tx("Why")} <span className="font-normal text-muted-foreground">optional</span>
              </span>
              <Textarea name="reason" rows={2} maxLength={300} placeholder={tx("Pressed on the wrong container")} className="resize-none" />
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
