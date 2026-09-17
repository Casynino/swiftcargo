"use client";

import { useActionState } from "react";

import { requestDelivery, type ActionState } from "@/lib/actions/release";
import { FormMessage } from "@/components/app/form-message";
import { SubmitButton } from "@/components/app/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function DeliveryRequestForm({ cargoId }: { cargoId: string }) {
  const [state, action] = useActionState<ActionState, FormData>(
    requestDelivery,
    {}
  );

  if (state.ok) {
    return (
      <p className="rounded-md bg-success/10 px-3 py-2.5 text-sm text-success">
        {state.ok}
      </p>
    );
  }

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="cargoId" value={cargoId} />

      <div className="space-y-2">
        <Label htmlFor="address">Deliver to</Label>
        <Textarea id="address" name="address" required rows={2} />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="contactName">Who receives it?</Label>
          <Input id="contactName" name="contactName" required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="contactPhone">Their phone</Label>
          <Input id="contactPhone" name="contactPhone" required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="preferredDate">Preferred date</Label>
          <Input id="preferredDate" name="preferredDate" type="date" />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="notes">Notes</Label>
        <Textarea id="notes" name="notes" rows={2} />
      </div>

      <p className="rounded-md bg-secondary px-3 py-2 text-xs text-muted-foreground">
        Delivery is charged separately. We will call you with the price before
        anything moves.
      </p>

      <FormMessage error={state.error} />
      <SubmitButton>Request delivery</SubmitButton>
    </form>
  );
}
