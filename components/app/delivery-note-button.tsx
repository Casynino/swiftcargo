"use client";

import { useActionState } from "react";
import Link from "next/link";
import { FileText } from "lucide-react";

import { issueDeliveryNote, type ActionState } from "@/lib/actions/cargo";
import { FormMessage } from "@/components/app/form-message";
import { SubmitButton } from "@/components/app/submit-button";
import { Button } from "@/components/ui/button";

import { useT } from "@/components/app/locale-provider";
export function DeliveryNoteButton({
  cargoId,
  existing,
  canIssue,
}: {
  cargoId: string;
  existing: { number: string } | null;
  canIssue: boolean;
}) {
  const tx = useT();
  const [state, action] = useActionState<ActionState, FormData>(
    issueDeliveryNote,
    {}
  );

  if (existing) {
    return (
      <Button asChild variant="outline" size="sm">
        <Link href={`/app/cargo/${cargoId}/delivery-note`}>
          <FileText />
          {existing.number}
        </Link>
      </Button>
    );
  }

  if (!canIssue) return null;

  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="cargoId" value={cargoId} />
      <SubmitButton variant="outline" size="sm">
        <FileText />
        {tx("Issue delivery note")}
      </SubmitButton>
      <FormMessage error={state.error} ok={state.ok} />
    </form>
  );
}
