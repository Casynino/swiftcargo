"use client";

import { useActionState } from "react";

import { replyToConversation, type ActionState } from "@/lib/actions/messages";
import { FormMessage } from "@/components/app/form-message";
import { SubmitButton } from "@/components/app/submit-button";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";

export function ConversationReply({
  conversationId,
  status,
}: {
  conversationId: string;
  status: string;
}) {
  const [state, action] = useActionState<ActionState, FormData>(
    replyToConversation,
    {}
  );

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="conversationId" value={conversationId} />
      <div className="space-y-2">
        <Label htmlFor="body" className="sr-only">
          Reply
        </Label>
        <Textarea
          id="body"
          name="body"
          rows={4}
          required
          placeholder="Write a reply…"
        />
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="internal" />
          Internal note — the customer never sees this
        </label>
        <NativeSelect name="status" defaultValue={status} className="h-9 w-48">
          <option value="OPEN">Open</option>
          <option value="WAITING_CUSTOMER">Waiting on customer</option>
          <option value="WAITING_STAFF">Waiting on us</option>
          <option value="RESOLVED">Resolved</option>
          <option value="CLOSED">Closed</option>
        </NativeSelect>
        <SubmitButton>Send</SubmitButton>
      </div>
      <FormMessage error={state.error} ok={state.ok} />
    </form>
  );
}
