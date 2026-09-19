"use client";

import { useActionState, useState } from "react";
import { Check, DoorOpen, X } from "lucide-react";

import { releaseCargo, type ActionState } from "@/lib/actions/release";
import { FormMessage } from "@/components/app/form-message";
import { SubmitButton } from "@/components/app/submit-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import { useT } from "@/components/app/locale-provider";
import { Tx } from "@/components/app/tx";
/**
 * The seven conditions, spelled out.
 *
 * A blocked release shows exactly which one failed, so the person at the
 * counter can tell the customer what is missing instead of "the system won't
 * let me". That sentence is what makes people work around a system.
 */
export function ReleaseChecklist({
  conditions,
}: {
  conditions: { label: string; passed: boolean; detail?: string }[];
}) {
  return (
    <ul className="space-y-2">
      {conditions.map((c) => (
        <li key={c.label} className="flex items-start gap-2.5 text-sm">
          <span
            className={cn(
              "mt-0.5 grid size-4 shrink-0 place-items-center rounded-full",
              c.passed ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"
            )}
          >
            {c.passed ? <Check className="size-3" /> : <X className="size-3" />}
          </span>
          <span className={c.passed ? "" : "font-medium"}>
            <Tx>{c.label}</Tx>
            {c.detail ? (
              <span className="block text-xs font-normal text-muted-foreground">
                <Tx>{c.detail}</Tx>
              </span>
            ) : null}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function ReleaseForm({
  cargoId,
  packages,
  receiverName,
  receiverPhone,
}: {
  cargoId: string;
  packages: number;
  receiverName: string;
  receiverPhone: string;
}) {
  const tx = useT();
  const [state, action] = useActionState<ActionState, FormData>(
    releaseCargo,
    {}
  );
  const [open, setOpen] = useState(false);
  const [somebodyElse, setSomebodyElse] = useState(false);

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)}>
        <DoorOpen />
        {tx("Hand it over")}
      </Button>
    );
  }

  return (
    <form action={action} className="space-y-4 rounded-lg border p-4">
      <input type="hidden" name="cargoId" value={cargoId} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="method">{tx("How is it going?")}</Label>
          <NativeSelect id="method" name="method" defaultValue="COLLECTION">
            <option value="COLLECTION">{tx("Collected from the warehouse")}</option>
            <option value="DELIVERY">{tx("Delivered")}</option>
          </NativeSelect>
        </div>
        <div className="space-y-2">
          <Label htmlFor="packagesReleased">{tx("Packages handed over")}</Label>
          <Input
            id="packagesReleased"
            name="packagesReleased"
            type="number"
            min={1}
            required
            defaultValue={packages}
            inputMode="numeric"
          />
        </div>
      </div>

      <label className="flex items-start gap-2.5 rounded-md border p-3 text-sm">
        <input
          type="checkbox"
          className="mt-0.5"
          checked={somebodyElse}
          onChange={(e) => setSomebodyElse(e.target.checked)}
        />
        <span>
          Somebody other than {receiverName} is collecting
          <span className="mt-0.5 block text-xs text-muted-foreground">
            {tx("A driver, a relative, a clearing agent. Record who actually walked out with the boxes — not who was supposed to.")}
          </span>
        </span>
      </label>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="collectedByName">{tx("Collected by")}</Label>
          <Input
            id="collectedByName"
            name="collectedByName"
            required
            key={somebodyElse ? "other" : "receiver"}
            defaultValue={somebodyElse ? "" : receiverName}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="collectedByPhone">{tx("Phone")}</Label>
          <Input
            id="collectedByPhone"
            name="collectedByPhone"
            key={somebodyElse ? "other-p" : "receiver-p"}
            defaultValue={somebodyElse ? "" : receiverPhone}
          />
        </div>
        {somebodyElse ? (
          <>
            <div className="space-y-2">
              <Label htmlFor="collectedByIdNo">{tx("ID number")}</Label>
              <Input id="collectedByIdNo" name="collectedByIdNo" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="relationship">{tx("Relationship")}</Label>
              <Input
                id="relationship"
                name="relationship"
                placeholder={tx("Driver, brother, agent…")}
              />
            </div>
          </>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="signature">{tx("Signature or photo of the handover")}</Label>
        <Input
          id="signature"
          name="signature"
          type="file"
          accept="image/*"
          capture="environment"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="rel-notes">{tx("Notes")}</Label>
        <Textarea id="rel-notes" name="notes" />
      </div>

      <FormMessage error={state.error} ok={state.ok} />
      <div className="flex gap-2">
        <SubmitButton>
          <DoorOpen />
          {tx("Release")}
        </SubmitButton>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
          {tx("Cancel")}
        </Button>
      </div>
    </form>
  );
}
