"use client";

import { useActionState, useCallback, useEffect, useState } from "react";
import {
  CircleCheck,
  PackageCheck,
  ShieldCheck,
  Warehouse,
  type LucideIcon,
} from "lucide-react";

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
        <Modal title={tx("Clearance complete")} onClose={close} className="max-w-lg">
          <div>
            <p className="font-medium">
              {containerId
                ? `${waiting} ${tx(waiting === 1 ? "consignment will be marked cleared." : "consignments will be marked cleared.")}`
                : tx("This consignment will be marked cleared.")}
            </p>
            {containerId ? (
              <p className="mt-0.5 text-sm text-muted-foreground">
                {tx("Anything reported missing is left out.")}
              </p>
            ) : null}
          </div>

          {/* THE ONE THING TO CARRY AWAY. Clearing used to start storage on its
              own; now it does not, and a desk that presses this and walks off
              leaves the clock stopped until somebody in Dar checks the goods in. */}
          <div className="flex gap-3 rounded-xl border border-warning/40 bg-warning/[0.08] p-4">
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-warning/15">
              <Warehouse className="size-5 text-warning" />
            </span>
            <div>
              <p className="font-semibold">{tx("Dar must check these goods in")}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {tx(
                  "Storage does not start when you clear. It starts counting only from the day the Dar warehouse checks the goods in. We will notify the Dar warehouse for you."
                )}
              </p>
            </div>
          </div>

          <ol className="space-y-3 text-sm">
            <Step
              icon={CircleCheck}
              tone="text-success bg-success/12"
              title={tx("Cleared")}
              detail={tx("Now. Customers are told their goods have cleared.")}
            />
            <Step
              icon={Warehouse}
              tone="text-warning bg-warning/15"
              title={tx("Dar checks in")}
              detail={tx("Storage starts counting from this day.")}
            />
            <Step
              icon={PackageCheck}
              tone="text-muted-foreground bg-secondary"
              title={tx("Ready for pickup")}
              detail={tx("Once the customer has paid.")}
            />
          </ol>

          <form action={action} className="space-y-4">
            {cargoId ? <input type="hidden" name="cargoId" value={cargoId} /> : null}
            {containerId ? <input type="hidden" name="containerId" value={containerId} /> : null}
            <label className="block space-y-1.5">
              <span className="text-sm font-medium">
                {tx("Note")} <span className="font-normal text-muted-foreground">{tx("optional")}</span>
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
