"use client";

import { useActionState, useState } from "react";
import { PackageMinus } from "lucide-react";

import { removeFromDarFloor, type ActionState } from "@/lib/actions/dar";
import { FormMessage } from "@/components/app/form-message";
import { SubmitButton } from "@/components/app/submit-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { t, type Locale } from "@/lib/i18n";

/**
 * Take a consignment off the Dar warehouse floor, with a reason.
 *
 * It stays on the record as "missing at Dar" with a case, and booking it in
 * again puts it back. Nothing is deleted.
 */
export function DarTakeOut({ cargoId, locale, billed }: { cargoId: string; locale: Locale; billed: boolean }) {
  const [state, action] = useActionState<ActionState, FormData>(removeFromDarFloor, {});
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        <PackageMinus />
        {t(locale, "Take out of the warehouse")}
      </Button>
    );
  }
  return (
    <form action={action} className="space-y-3 rounded-lg border border-warning/40 bg-warning/5 p-4">
      <input type="hidden" name="cargoId" value={cargoId} />
      <p className="text-sm font-medium">{t(locale, "Take this consignment out of the Dar warehouse?")}</p>
      <p className="text-xs text-muted-foreground">
        {t(locale, "It stays on the record as missing at Dar with a case, and booking it in again puts it back. A draft bill is cancelled.")}
        {billed ? ` ${t(locale, "Its bill is already issued: Finance is told and corrects it.")}` : ""}
      </p>
      <div className="space-y-2">
        <Label htmlFor="takeOutReason">{t(locale, "Why")}</Label>
        <Input id="takeOutReason" name="reason" required minLength={3} maxLength={300} placeholder={t(locale, "e.g. booked in by mistake")} />
      </div>
      <FormMessage error={state.error} ok={state.ok} />
      <div className="flex gap-2">
        <SubmitButton variant="accent">
          <PackageMinus />
          {t(locale, "Take it out")}
        </SubmitButton>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
          {t(locale, "Cancel")}
        </Button>
      </div>
    </form>
  );
}
