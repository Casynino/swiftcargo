"use client";

import { useActionState, useEffect, useState } from "react";
import { Pencil } from "lucide-react";

import { correctDarMeasurement, type ActionState } from "@/lib/actions/cargo";
import { FormMessage } from "@/components/app/form-message";
import { SubmitButton } from "@/components/app/submit-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { t, type Locale } from "@/lib/i18n";

/**
 * Dar's own figures, corrected in place.
 *
 * Opens under the comparison rather than on the package lines, because what it
 * changes is the Dar column and nothing else. China's figures stay beside it as
 * they were recorded, so the clerk correcting a weight is looking at the gap
 * their correction makes.
 */
export function DarCountCorrection({
  cargoId,
  locale,
  current,
}: {
  cargoId: string;
  locale: Locale;
  current: {
    packagesCount: number;
    piecesCount: number | null;
    weightKg: string | null;
    cbm: string | null;
  };
}) {
  const [state, action] = useActionState<ActionState, FormData>(correctDarMeasurement, {});
  const [open, setOpen] = useState(false);

  /* Closed once the save lands: left open, React resets the form to the figures
     it was opened with, and saving again would write them back. */
  useEffect(() => {
    if (state.ok) setOpen(false);
  }, [state]);

  if (!open) {
    return (
      <div className="space-y-2">
        <FormMessage ok={state.ok} />
        <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
          <Pencil />
          {t(locale, "Correct Dar's count")}
        </Button>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4 rounded-lg border p-4">
      <input type="hidden" name="cargoId" value={cargoId} />
      <p className="text-xs text-muted-foreground">
        {t(
          locale,
          "Changes the Dar column only. China's measurement stays as Guangzhou recorded it, and the old Dar figure is kept with your name and reason."
        )}
      </p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <div className="space-y-2">
          <Label htmlFor="dar-packagesCount">{t(locale, "Packages")}</Label>
          <Input
            id="dar-packagesCount"
            name="packagesCount"
            type="number"
            min={0}
            inputMode="numeric"
            defaultValue={current.packagesCount}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="dar-piecesCount">{t(locale, "Pieces")}</Label>
          <Input
            id="dar-piecesCount"
            name="piecesCount"
            type="number"
            min={0}
            inputMode="numeric"
            defaultValue={current.piecesCount ?? ""}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="dar-weightKg">{t(locale, "Weight (kg)")}</Label>
          <Input
            id="dar-weightKg"
            name="weightKg"
            type="number"
            step="0.001"
            min={0}
            inputMode="decimal"
            defaultValue={current.weightKg ?? ""}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="dar-cbm">{t(locale, "Volume (CBM)")}</Label>
          <Input
            id="dar-cbm"
            name="cbm"
            type="number"
            step="0.0001"
            min={0}
            inputMode="decimal"
            className="tnum"
            defaultValue={current.cbm ?? ""}
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="dar-reason">{t(locale, "Why")}</Label>
        <Input
          id="dar-reason"
          name="reason"
          required
          minLength={3}
          maxLength={300}
          placeholder={t(locale, "e.g. Re-weighed on the Dar scale")}
        />
      </div>
      <FormMessage error={state.error} />
      <div className="flex gap-2">
        <SubmitButton>{t(locale, "Save Dar's count")}</SubmitButton>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
          {t(locale, "Cancel")}
        </Button>
      </div>
    </form>
  );
}
