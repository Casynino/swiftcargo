"use client";

import { useActionState, useCallback, useEffect, useState } from "react";
import {
  CalendarClock,
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
import { translateMessage } from "@/components/app/tx";

/** The company's own storage terms, from CompanySetting — never typed here. */
export type StorageTerms = {
  freeDays: number;
  /** Per day after the free days; null or zero when storage is not charged. */
  perDay: string | null;
  currency: string;
};
/**
 * "Customs is done" — for one consignment, or every one on a container. Asked
 * once in a dialog because it sends customers a message and starts their
 * storage. It does not book the goods in: that is the Dar warehouse's
 * verification, afterwards.
 */
export function ClearanceButton({
  cargoId,
  containerId,
  waiting,
  label,
  terms,
  size,
}: {
  cargoId?: string;
  containerId?: string;
  /** How many consignments this would clear. */
  waiting: number;
  label?: string;
  terms: StorageTerms;
  /** "sm" in a table row, beside the row's other small buttons. */
  size?: "sm";
}) {
  const tx = useT();
  const tm = (message: string) => translateMessage(message, tx);
  const perDay = terms.perDay !== null && Number(terms.perDay) > 0 ? Number(terms.perDay) : null;
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
      <Button
        type="button"
        size={size}
        onClick={() => setOpen(true)}
        disabled={waiting === 0}
        className={size === "sm" ? "h-8 gap-1.5 rounded-full px-3 text-xs [&_svg]:size-3.5" : undefined}
      >
        <ShieldCheck />
        {label ?? (containerId ? `${tx("Mark cleared")} (${waiting})` : tx("Mark cleared"))}
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

          {/* THE ONE THING TO CARRY AWAY. Pressing this starts the customer's
              free storage days — by the owner's decision clearing is when the
              goods enter the Dar warehouse's flow. The warehouse's check-in
              afterwards is verification and never moves that date. */}
          <div className="flex gap-3 rounded-xl border border-warning/40 bg-warning/[0.08] p-4">
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-warning/15">
              <CalendarClock className="size-5 text-warning" />
            </span>
            <div>
              <p className="font-semibold">{tx("Storage starts now")}</p>
              <p className="mt-1 text-sm">
                {tm(`The customer gets ${terms.freeDays} free storage days, starting the moment you mark it cleared.`)}
                {perDay !== null
                  ? ` ${tm(`From day ${terms.freeDays + 1}, storage is charged at ${terms.currency} ${perDay} a day until the goods are collected.`)}`
                  : null}
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                {tx(
                  "The Dar warehouse will be asked to verify and check in the goods. Check-in does not change these dates."
                )}
              </p>
            </div>
          </div>

          <ol className="space-y-3 text-sm">
            <Step
              icon={CircleCheck}
              tone="text-success bg-success/12"
              title={tx("Cleared")}
              detail={tm(`Now. The ${terms.freeDays} free storage days start, and customers are told their goods have cleared.`)}
            />
            <Step
              icon={Warehouse}
              tone="text-warning bg-warning/15"
              title={tx("Dar warehouse verifies and checks in")}
              detail={tx("Internal check of count, damage and missing cargo. Customers do not see it.")}
            />
            <Step
              icon={PackageCheck}
              tone="text-muted-foreground bg-secondary"
              title={tx("Ready for pickup")}
              detail={tx("Once the customer has paid and the goods are verified.")}
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
