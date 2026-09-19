"use client";

import { useActionState, useState } from "react";
import { PackageCheck } from "lucide-react";

import { receiveInChina, type ActionState } from "@/lib/actions/cargo";
import { FormMessage } from "@/components/app/form-message";
import { SubmitButton } from "@/components/app/submit-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";

import { useT } from "@/components/app/locale-provider";
const CONDITIONS = [
  ["GOOD", "Good"],
  ["MINOR_DAMAGE", "Minor damage"],
  ["DAMAGED", "Damaged"],
  ["WET", "Wet"],
  ["REPACKED", "Repacked"],
] as const;

export function ChinaReceivePanel({
  cargoId,
  warehouses,
  existing,
  defaultWarehouseId,
}: {
  cargoId: string;
  warehouses: { id: string; name: string }[];
  existing: {
    packagesCount: number;
    piecesCount: number | null;
    weightKg: string | null;
    condition: string;
    location: string | null;
    notes: string | null;
    warehouseId: string;
  } | null;
  defaultWarehouseId?: string | null;
}) {
  const tx = useT();
  const [state, action] = useActionState<ActionState, FormData>(
    receiveInChina,
    {}
  );
  const [open, setOpen] = useState(!existing);

  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        {tx("Correct the receiving record")}
      </Button>
    );
  }

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="cargoId" value={cargoId} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="warehouseId">{tx("Warehouse")}</Label>
          <NativeSelect
            id="warehouseId"
            name="warehouseId"
            required
            defaultValue={existing?.warehouseId ?? defaultWarehouseId ?? ""}
          >
            <option value="" disabled>
              {tx("Choose…")}
            </option>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-2">
          <Label htmlFor="condition">{tx("Condition")}</Label>
          <NativeSelect
            id="condition"
            name="condition"
            defaultValue={existing?.condition ?? "GOOD"}
          >
            {CONDITIONS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-2">
          <Label htmlFor="packagesCount">{tx("Packages counted")}</Label>
          <Input
            id="packagesCount"
            name="packagesCount"
            type="number"
            min={1}
            required
            inputMode="numeric"
            defaultValue={existing?.packagesCount ?? ""}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="piecesCount">{tx("Pieces inside")}</Label>
          <Input
            id="piecesCount"
            name="piecesCount"
            type="number"
            min={0}
            inputMode="numeric"
            defaultValue={existing?.piecesCount ?? ""}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="weightKg">{tx("Weight (kg)")}</Label>
          <Input
            id="weightKg"
            name="weightKg"
            type="number"
            step="0.001"
            min={0}
            inputMode="decimal"
            defaultValue={existing?.weightKg ?? ""}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="location">{tx("Shelf / location")}</Label>
          <Input
            id="location"
            name="location"
            defaultValue={existing?.location ?? ""}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="notes">{tx("Notes")}</Label>
        <Textarea id="notes" name="notes" defaultValue={existing?.notes ?? ""} />
      </div>

      <FormMessage error={state.error} ok={state.ok} />

      <div className="flex gap-2">
        <SubmitButton>
          <PackageCheck />
          {existing ? "Save receiving record" : "Confirm received"}
        </SubmitButton>
        {existing ? (
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
            {tx("Cancel")}
          </Button>
        ) : null}
      </div>
    </form>
  );
}
