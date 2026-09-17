"use client";

import { useActionState } from "react";
import { RotateCcw } from "lucide-react";

import { FormMessage } from "@/components/app/form-message";
import { SubmitButton } from "@/components/app/submit-button";
import { restoreCargo, type RestoreState } from "@/lib/actions/deleted-records";

/** Puts a deleted consignment back, from the deleted-records screen. */
export function RestoreCargoButton({
  cargoId,
  reference,
}: {
  cargoId: string;
  reference: string;
}) {
  const [state, action] = useActionState<RestoreState, FormData>(restoreCargo, {});

  return (
    <form action={action} className="flex flex-col items-end gap-2">
      <input type="hidden" name="cargoId" value={cargoId} />
      <SubmitButton variant="outline" size="sm" pendingLabel="Restoring…">
        <RotateCcw />
        Restore {reference}
      </SubmitButton>
      <FormMessage error={state.error} ok={state.ok} />
    </form>
  );
}
