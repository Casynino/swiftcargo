"use client";

import { useActionState } from "react";
import { CheckCheck, ClipboardCheck } from "lucide-react";

import { verifyCargo, verifyContainer, type ActionState } from "@/lib/actions/dar";
import { FormMessage } from "@/components/app/form-message";
import { SubmitButton } from "@/components/app/submit-button";

import { useT } from "@/components/app/locale-provider";
export function VerifyCargoButton({ cargoId }: { cargoId: string }) {
  const tx = useT();
  const [state, action] = useActionState<ActionState, FormData>(verifyCargo, {});
  return (
    <form action={action}>
      <input type="hidden" name="cargoId" value={cargoId} />
      <SubmitButton size="sm" variant="outline">
        <ClipboardCheck />
        {tx("Verify")}
      </SubmitButton>
      {state.error ? (
        <span className="mt-1 block text-xs text-destructive">{state.error}</span>
      ) : null}
    </form>
  );
}

export function VerifyContainerButton({
  containerId,
  pending,
}: {
  containerId: string;
  pending: number;
}) {
  const [state, action] = useActionState<ActionState, FormData>(
    verifyContainer,
    {}
  );
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="containerId" value={containerId} />
      <SubmitButton size="sm">
        <CheckCheck />
        Verify all {pending} clear
      </SubmitButton>
      <FormMessage error={state.error} ok={state.ok} />
    </form>
  );
}
