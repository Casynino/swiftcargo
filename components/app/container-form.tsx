"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { createContainer, type ActionState } from "@/lib/actions/containers";
import { FormMessage } from "@/components/app/form-message";
import { SubmitButton } from "@/components/app/submit-button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";

import { useT } from "@/components/app/locale-provider";
const TYPES = [
  ["HQ_40", "40' High cube", 67],
  ["GP_40", "40' General purpose", 65],
  ["GP_20", "20' General purpose", 32],
  ["HQ_45", "45' High cube", 76],
  ["LCL_CONSOLIDATED", "LCL consolidation", 0],
] as const;

export function ContainerForm({ nextReference }: { nextReference: string }) {
  const tx = useT();
  const router = useRouter();
  const [state, action] = useActionState<ActionState, FormData>(
    createContainer,
    {}
  );
  /* The capacity follows the box chosen until somebody types their own — a
     20-foot box offered 67 CBM reads full at half its real load, and "over
     capacity" on the loading screen is only as good as this number. */
  const [capacity, setCapacity] = useState("67");
  const [capacityByHand, setCapacityByHand] = useState(false);

  useEffect(() => {
    if (state.id) router.push(`/app/containers/${state.id}`);
  }, [state.id, router]);

  return (
    <Card className="p-6">
      <form action={action} className="space-y-5">
        {/*
          THE NUMBER IS NOT TYPED.

          Ours runs from one and counts up on its own, so two boxes opened in
          the same minute cannot be given the same name. The shipping line's own
          box number — MSCU1234567 and the like — is not known when a container
          is opened; it arrives with the allocation, and is recorded at sealing
          along with the seal.
        */}
        <div className="rounded-lg border bg-surface-2/50 px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {tx("It will be called")}
          </p>
          <p className="tnum mt-0.5 text-lg font-semibold">{nextReference}</p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="type">{tx("Container type")}</Label>
            <NativeSelect
              id="type"
              name="type"
              defaultValue="HQ_40"
              onChange={(e) => {
                const size = TYPES.find(([value]) => value === e.target.value)?.[2];
                if (!capacityByHand && size !== undefined) {
                  setCapacity(size > 0 ? String(size) : "");
                }
              }}
            >
              {TYPES.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="space-y-2">
            <Label htmlFor="capacityCbm">{tx("Usable capacity (CBM)")}</Label>
            <Input
              id="capacityCbm"
              name="capacityCbm"
              type="number"
              step="0.01"
              min={0}
              value={capacity}
              onChange={(e) => {
                setCapacity(e.target.value);
                setCapacityByHand(e.target.value.trim() !== "");
              }}
              inputMode="decimal"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="originPort">{tx("Origin port")}</Label>
            <Input id="originPort" name="originPort" defaultValue="Guangzhou" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="destinationPort">{tx("Destination port")}</Label>
            <Input
              id="destinationPort"
              name="destinationPort"
              defaultValue="Dar es Salaam"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="notes">{tx("Notes")}</Label>
          <Textarea id="notes" name="notes" />
        </div>

        <FormMessage error={state.error} ok={state.ok} />
        <SubmitButton>{tx("Open container")}</SubmitButton>
      </form>
    </Card>
  );
}
