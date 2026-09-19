"use client";

import { useActionState } from "react";
import Link from "next/link";
import { ClipboardList } from "lucide-react";

import { issuePackingList, type ActionState } from "@/lib/actions/containers";
import { FormMessage } from "@/components/app/form-message";
import { SubmitButton } from "@/components/app/submit-button";
import { Button } from "@/components/ui/button";

import { useT } from "@/components/app/locale-provider";
export function PackingListButton({
  containerId,
  existing,
  canIssue,
}: {
  containerId: string;
  existing: { number: string } | null;
  canIssue: boolean;
}) {
  const tx = useT();
  const [state, action] = useActionState<ActionState, FormData>(
    issuePackingList,
    {}
  );

  if (existing) {
    return (
      <Button asChild variant="outline">
        <Link href={`/app/containers/${containerId}/packing-list`}>
          <ClipboardList />
          {existing.number}
        </Link>
      </Button>
    );
  }

  if (!canIssue) return null;

  return (
    <form action={action}>
      <input type="hidden" name="containerId" value={containerId} />
      <SubmitButton variant="outline">
        <ClipboardList />
        {tx("Issue packing list")}
      </SubmitButton>
      <FormMessage error={state.error} ok={state.ok} />
    </form>
  );
}
