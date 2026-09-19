"use client";

import { useActionState } from "react";
import { Ticket } from "lucide-react";

import { FormMessage } from "@/components/app/form-message";
import { SubmitButton } from "@/components/app/submit-button";
import { issuePickupNote, type ActionState } from "@/lib/actions/pickup-notes";

import { useT } from "@/components/app/locale-provider";
/** Write the customer's permission to collect. Refused unless it is settled. */
export function PickupNoteButton({ cargoId }: { cargoId: string }) {
  const tx = useT();
  const [state, action] = useActionState<ActionState, FormData>(
    issuePickupNote,
    {}
  );
  return (
    <form action={action}>
      <input type="hidden" name="cargoId" value={cargoId} />
      <SubmitButton size="sm">
        <Ticket />
        {tx("Pickup note")}
      </SubmitButton>
      <FormMessage error={state.error} ok={state.ok} />
    </form>
  );
}
