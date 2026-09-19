"use client";

import { useActionState, useState } from "react";
import { PackageX } from "lucide-react";

import { reportMissingAtDar, type ActionState } from "@/lib/actions/dar";
import { FormMessage } from "@/components/app/form-message";
import { SubmitButton } from "@/components/app/submit-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { useT } from "@/components/app/locale-provider";
/**
 * "It is not on the container."
 *
 * Deliberately two steps. Marking a consignment missing opens an urgent case
 * against somebody's goods and stops the cargo dead, so it is not a button you
 * can catch with a sleeve while reaching for Receive.
 */
export function MissingCargoButton({
  cargoId,
  reference,
}: {
  cargoId: string;
  reference: string;
}) {
  const tx = useT();
  const [state, action] = useActionState<ActionState, FormData>(
    reportMissingAtDar,
    {}
  );
  const [open, setOpen] = useState(false);

  if (state.ok) {
    return (
      <span className="text-xs font-medium text-signal">{state.ok}</span>
    );
  }

  if (!open) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => setOpen(true)}
      >
        <PackageX />
        {tx("Not here")}
      </Button>
    );
  }

  return (
    <form action={action} className="flex flex-col items-end gap-2">
      <input type="hidden" name="cargoId" value={cargoId} />
      <Input
        name="note"
        placeholder={`Why is ${reference} not here?`}
        className="h-9 w-64"
        aria-label={tx("What happened")}
      />
      <div className="flex gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setOpen(false)}
        >
          {tx("Cancel")}
        </Button>
        <SubmitButton size="sm" variant="destructive" pendingLabel="Reporting…">
          {tx("Report missing")}
        </SubmitButton>
      </div>
      <FormMessage error={state.error} />
    </form>
  );
}
