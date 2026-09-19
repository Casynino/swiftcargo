"use client";

import { useActionState } from "react";
import { PackageOpen } from "lucide-react";

import { FormMessage } from "@/components/app/form-message";
import { SubmitButton } from "@/components/app/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { reportDamageAtDar, type ActionState } from "@/lib/actions/dar";

import { useT } from "@/components/app/locale-provider";
const DAMAGE = [
  ["MINOR_DAMAGE", "Minor damage"],
  ["DAMAGED", "Damaged"],
  ["WET", "Wet"],
] as const;

/**
 * THE DAMAGED TAG, PUT ON AT THE BENCH.
 *
 * Said in the order the clerk finds it: how bad, what they found, and the
 * photograph. The picture is not optional and the form says why — a damage
 * claim is argued weeks later against a supplier or a shipping line, and a
 * claim recorded as a sentence is a claim the company pays itself.
 *
 * The consignment stays on the floor. That is the whole difference between this
 * and reporting it missing: the boxes are here, they are counted, they will be
 * billed, and what they gain is a tag that travels with them to whoever prices
 * and whoever releases.
 */
export function DamageTag({
  cargoId,
  reference,
  condition,
}: {
  cargoId: string;
  reference: string;
  /** What the receiving row says now, so re-opening starts where it stands. */
  condition?: string | null;
}) {
  const tx = useT();
  const [state, action] = useActionState<ActionState, FormData>(
    reportDamageAtDar,
    {}
  );
  const tagged = !!condition && condition !== "GOOD";

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="cargoId" value={cargoId} />

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={`condition-${cargoId}`}>{tx("How bad is it?")}</Label>
          <NativeSelect
            id={`condition-${cargoId}`}
            name="condition"
            defaultValue={tagged ? (condition as string) : "DAMAGED"}
          >
            {DAMAGE.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`damage-photos-${cargoId}`}>{tx("Photographs")}</Label>
          <Input
            id={`damage-photos-${cargoId}`}
            name="photos"
            type="file"
            accept="image/*"
            multiple
            required
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`damage-note-${cargoId}`}>{tx("What did you find?")}</Label>
        <Textarea
          id={`damage-note-${cargoId}`}
          name="note"
          rows={2}
          required
          minLength={3}
          placeholder={tx("Two bales soaked on the door side, seal intact…")}
        />
      </div>

      <FormMessage error={state.error} ok={state.ok} />

      <SubmitButton variant="destructive" size="sm" pendingLabel="Tagging…">
        <PackageOpen />
        {tagged ? `Update the damage on ${reference}` : `Tag ${reference} damaged`}
      </SubmitButton>
      <p className="text-xs text-muted-foreground">
        {tx("It stays on the floor and is still billed. The tag and its case follow it to whoever prices it and whoever releases it.")}
      </p>
    </form>
  );
}
