"use client";

import { useActionState } from "react";

import { updateRequestStatus, type ActionState } from "@/lib/actions/requests";
import { FormMessage } from "@/components/app/form-message";
import { SubmitButton } from "@/components/app/submit-button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";

import { useT } from "@/components/app/locale-provider";
const STATUSES = [
  ["SUBMITTED", "Submitted"],
  ["UNDER_REVIEW", "Under review"],
  ["APPROVED", "Approved"],
  ["SCHEDULED", "Scheduled"],
  ["COMPLETED", "Completed"],
  ["REJECTED", "Rejected"],
  ["CANCELLED", "Cancelled"],
] as const;

export function RequestControls({
  kind,
  id,
  status,
  notes,
}: {
  kind: "pickup" | "booking" | "quote";
  id: string;
  status: string;
  notes: string | null;
}) {
  const tx = useT();
  const [state, action] = useActionState<ActionState, FormData>(
    updateRequestStatus,
    {}
  );

  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="id" value={id} />
      <NativeSelect
        name="status"
        defaultValue={status}
        className="h-9 w-40"
        aria-label={tx("Request status")}
      >
        {STATUSES.map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </NativeSelect>
      <Input
        name="staffNotes"
        placeholder={tx("Note")}
        defaultValue={notes ?? ""}
        className="h-9 min-w-[12rem] flex-1"
        aria-label={tx("Staff note")}
      />
      <SubmitButton size="sm" variant="outline">
        {tx("Save")}
      </SubmitButton>
      <FormMessage error={state.error} ok={state.ok} />
    </form>
  );
}
