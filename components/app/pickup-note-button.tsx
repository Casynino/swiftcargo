"use client";

import { useActionState } from "react";
import { Ticket } from "lucide-react";

import { FormMessage } from "@/components/app/form-message";
import { SubmitButton } from "@/components/app/submit-button";
import { issuePickupNote, type ActionState } from "@/lib/actions/pickup-notes";

/** Write the customer's permission to collect. Refused unless it is settled. */
export function PickupNoteButton({ cargoId }: { cargoId: string }) {
  const [state, action] = useActionState<ActionState, FormData>(
    issuePickupNote,
    {}
  );
  return (
    <form action={action}>
      <input type="hidden" name="cargoId" value={cargoId} />
      <SubmitButton size="sm">
        <Ticket />
        Pickup note
      </SubmitButton>
      <FormMessage error={state.error} ok={state.ok} />
    </form>
  );
}
