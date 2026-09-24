"use client";

import { useActionState, useCallback, useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";

import {
  markCargoCleared,
  markContainerCleared,
  type ClearanceState,
} from "@/lib/actions/clearance";
import { FormMessage } from "@/components/app/form-message";
import { Modal } from "@/components/app/modal";
import { SubmitButton } from "@/components/app/submit-button";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

import { useT } from "@/components/app/locale-provider";
/**
 * "Customs is done" — for one consignment, or every one on a container. Asked
 * once in a dialog because it sends customers a message. It does not book the
 * goods in: that is the Dar warehouse's press, and it is what starts storage.
 */
export function ClearanceButton({
  cargoId,
  containerId,
  waiting,
  label,
}: {
  cargoId?: string;
  containerId?: string;
  /** How many consignments this would clear. */
  waiting: number;
  label?: string;
}) {
  const tx = useT();
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState<ClearanceState, FormData>(
    containerId ? markContainerCleared : markCargoCleared,
    {}
  );
  const close = useCallback(() => setOpen(false), []);
  useEffect(() => {
    if (state.ok) setOpen(false);
  }, [state]);

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)} disabled={waiting === 0}>
        <ShieldCheck />
        {label ?? (containerId ? `Mark cleared (${waiting})` : "Mark cleared")}
      </Button>
      {state.ok ? <FormMessage ok={state.ok} /> : null}
      {open ? (
        <Modal title={tx("Clearance complete")} onClose={close}>
          <p className="text-sm text-muted-foreground">
            {containerId
              ? `${waiting} ${tx(waiting === 1 ? "consignment will be marked cleared." : "consignments will be marked cleared.")} ${tx("Anything reported missing is left out.")}`
              : tx("This consignment will be marked cleared.")}{" "}
            {tx(
              "Clearing does not check the goods in. The Dar warehouse still has to check them in, and storage starts counting only from check-in. Customers are told their goods have cleared."
            )}
          </p>
          <form action={action} className="space-y-4">
            {cargoId ? <input type="hidden" name="cargoId" value={cargoId} /> : null}
            {containerId ? <input type="hidden" name="containerId" value={containerId} /> : null}
            <label className="block space-y-1.5">
              <span className="text-sm font-medium">
                {tx("Note")} <span className="font-normal text-muted-foreground">optional</span>
              </span>
              <Textarea name="note" rows={2} maxLength={300} placeholder={tx("Release order number, agent…")} className="resize-none" />
            </label>
            <FormMessage error={state.error} />
            <div className="flex flex-wrap gap-2">
              <SubmitButton size="sm">{tx("Mark cleared")}</SubmitButton>
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
