"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Plus } from "lucide-react";

import {
  customerReply,
  startConversation,
  type ActionState,
} from "@/lib/actions/messages";
import { FormMessage } from "@/components/app/form-message";
import { SubmitButton } from "@/components/app/submit-button";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";

export function NewMessageForm({
  cargo,
}: {
  cargo: { id: string; reference: string; description: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState<ActionState, FormData>(
    startConversation,
    {}
  );

  useEffect(() => {
    if (state.id) router.push(`/portal/messages/${state.id}`);
  }, [state.id, router]);

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)}>
        <Plus />
        Ask us something
      </Button>
    );
  }

  return (
    <Card className="p-6">
      <form action={action} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="subject">What is it about?</Label>
          <Input
            id="subject"
            name="subject"
            required
            placeholder="When will my cargo arrive?"
          />
        </div>

        {cargo.length > 0 ? (
          <div className="space-y-2">
            <Label htmlFor="cargoId">Which consignment?</Label>
            <NativeSelect id="cargoId" name="cargoId" defaultValue="">
              <option value="">Not about a specific one</option>
              {cargo.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.reference} — {c.description}
                </option>
              ))}
            </NativeSelect>
          </div>
        ) : null}

        <div className="space-y-2">
          <Label htmlFor="body">Your message</Label>
          <Textarea id="body" name="body" rows={4} required />
        </div>

        <FormMessage error={state.error} ok={state.ok} />
        <div className="flex gap-2">
          <SubmitButton>Send</SubmitButton>
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
        </div>
      </form>
    </Card>
  );
}

export function CustomerReplyForm({
  conversationId,
}: {
  conversationId: string;
}) {
  const [state, action] = useActionState<ActionState, FormData>(
    customerReply,
    {}
  );

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="conversationId" value={conversationId} />
      <Textarea
        name="body"
        rows={3}
        required
        placeholder="Write a reply…"
        aria-label="Reply"
      />
      <FormMessage error={state.error} ok={state.ok} />
      <SubmitButton>Send</SubmitButton>
    </form>
  );
}
