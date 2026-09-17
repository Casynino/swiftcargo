"use client";

import { useActionState, useState } from "react";
import { PackageCheck, TriangleAlert } from "lucide-react";

import { receiveInDar, type ActionState } from "@/lib/actions/dar";
import { FormMessage } from "@/components/app/form-message";
import { SubmitButton } from "@/components/app/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";

const CONDITIONS = [
  ["GOOD", "Good"],
  ["MINOR_DAMAGE", "Minor damage"],
  ["DAMAGED", "Damaged"],
  ["WET", "Wet"],
  ["REPACKED", "Repacked"],
] as const;

/**
 * The Dar bench.
 *
 * China's figures are printed above each field rather than pre-filled into it.
 * A pre-filled count is a count nobody made — the clerk tabs past it and the
 * system records agreement that never happened.
 */
export function DarReceiveForm({
  cargoId,
  warehouses,
  defaultWarehouseId,
  china,
  existing,
}: {
  cargoId: string;
  warehouses: { id: string; name: string }[];
  defaultWarehouseId?: string | null;
  china: {
    packagesCount: number;
    piecesCount: number | null;
    weightKg: string | null;
    cbm: string;
  } | null;
  existing: {
    packagesCount: number;
    piecesCount: number | null;
    weightKg: string | null;
    cbm: string | null;
    condition: string;
    location: string | null;
    notes: string | null;
    discrepancyNotes: string | null;
    warehouseId: string;
  } | null;
}) {
  const [state, action] = useActionState<ActionState, FormData>(
    receiveInDar,
    {}
  );
  const [count, setCount] = useState(
    existing?.packagesCount?.toString() ?? ""
  );
  const [condition, setCondition] = useState(existing?.condition ?? "GOOD");

  const mismatch =
    china !== null && count !== "" && Number(count) !== china.packagesCount;
  const flagged = mismatch || condition !== "GOOD";

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="cargoId" value={cargoId} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="warehouseId">Warehouse</Label>
          <NativeSelect
            id="warehouseId"
            name="warehouseId"
            required
            defaultValue={existing?.warehouseId ?? defaultWarehouseId ?? ""}
          >
            <option value="" disabled>
              Choose…
            </option>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </NativeSelect>
        </div>

        <div className="space-y-2">
          <Label htmlFor="condition">Condition</Label>
          <NativeSelect
            id="condition"
            name="condition"
            value={condition}
            onChange={(e) => setCondition(e.target.value)}
          >
            {CONDITIONS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </NativeSelect>
        </div>

        <div className="space-y-2">
          <Label htmlFor="packagesCount">
            Packages counted
            {china ? (
              <span className="ml-2 font-normal text-muted-foreground">
                China said {china.packagesCount}
              </span>
            ) : null}
          </Label>
          <Input
            id="packagesCount"
            name="packagesCount"
            type="number"
            min={0}
            required
            inputMode="numeric"
            value={count}
            onChange={(e) => setCount(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="piecesCount">
            Pieces
            {china?.piecesCount ? (
              <span className="ml-2 font-normal text-muted-foreground">
                China said {china.piecesCount}
              </span>
            ) : null}
          </Label>
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
          <Label htmlFor="weightKg">
            Weight (kg)
            {china?.weightKg ? (
              <span className="ml-2 font-normal text-muted-foreground">
                China said {Number(china.weightKg).toFixed(2)}
              </span>
            ) : null}
          </Label>
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
          <Label htmlFor="cbm">
            Volume (CBM)
            {china ? (
              <span className="ml-2 font-normal text-muted-foreground">
                China said {Number(china.cbm).toFixed(3)}
              </span>
            ) : null}
          </Label>
          <Input
            id="cbm"
            name="cbm"
            type="number"
            step="0.0001"
            min={0}
            inputMode="decimal"
            defaultValue={existing?.cbm ?? ""}
          />
        </div>

        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="location">Shelf / location</Label>
          <Input
            id="location"
            name="location"
            defaultValue={existing?.location ?? ""}
          />
        </div>
      </div>

      {flagged ? (
        <div className="space-y-3 rounded-lg border border-amber-300 bg-amber-50 p-4">
          <p className="flex items-center gap-2 text-sm font-medium text-amber-900">
            <TriangleAlert className="size-4" />
            {mismatch
              ? `China counted ${china?.packagesCount}, you counted ${count}`
              : "This cargo is not in good condition"}
          </p>
          <p className="text-xs text-amber-900/80">
            Saving this opens a case automatically and holds the cargo from
            release until somebody resolves it.
          </p>
          <div className="space-y-2">
            <Label htmlFor="discrepancyNotes">What did you find?</Label>
            <Textarea
              id="discrepancyNotes"
              name="discrepancyNotes"
              defaultValue={existing?.discrepancyNotes ?? ""}
              placeholder="Two cartons missing from the pallet, seal intact…"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`dar-photos-${cargoId}`}>Photos</Label>
            <Input
              id={`dar-photos-${cargoId}`}
              name="photos"
              type="file"
              accept="image/*"
              multiple
            />
            <p className="text-xs text-amber-900/80">
              Kept on the consignment beside Guangzhou&rsquo;s photos, and on
              the case.
            </p>
          </div>
        </div>
      ) : null}

      <div className="space-y-2">
        <Label htmlFor="notes">Notes</Label>
        <Textarea id="notes" name="notes" defaultValue={existing?.notes ?? ""} />
      </div>

      <FormMessage error={state.error} ok={state.ok} />
      <SubmitButton>
        <PackageCheck />
        {existing ? "Save receiving record" : "Confirm received at Dar"}
      </SubmitButton>
    </form>
  );
}
