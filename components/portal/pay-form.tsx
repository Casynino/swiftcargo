"use client";

import { useActionState } from "react";
import { useState } from "react";
import { Banknote } from "lucide-react";

import {
  submitCustomerPayment,
  type ActionState,
} from "@/lib/actions/payments";
import { FormMessage } from "@/components/app/form-message";
import { SubmitButton } from "@/components/app/submit-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";

/**
 * "I have paid."
 *
 * Submits a CLAIM. It says so on the form, because a customer who believes
 * pressing this settles the bill will turn up at the warehouse expecting to
 * collect — and the warehouse will have to turn them away, which is the exact
 * conversation this system exists to prevent.
 */
export function PayForm({
  invoiceId,
  outstanding,
  currency,
}: {
  invoiceId: string;
  outstanding: string;
  currency: string;
}) {
  const [state, action] = useActionState<ActionState, FormData>(
    submitCustomerPayment,
    {}
  );
  const [open, setOpen] = useState(false);
  /* Made once when the form opens: pressing Send twice is still one claim. */
  const [submitKey] = useState(() => crypto.randomUUID());

  if (state.ok) {
    return (
      <p className="rounded-md bg-success/10 px-3 py-2.5 text-sm text-success">
        {state.ok}
      </p>
    );
  }

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)}>
        <Banknote />
        I have paid this
      </Button>
    );
  }

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="invoiceId" value={invoiceId} />
      <input type="hidden" name="idempotencyKey" value={submitKey} />

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="amount">Amount paid</Label>
          <Input
            id="amount"
            name="amount"
            type="number"
            step="any"
            min={0}
            required
            defaultValue={outstanding}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="currency">Currency</Label>
          <NativeSelect id="currency" name="currency" defaultValue={currency}>
            <option value="TZS">TZS</option>
            <option value="USD">USD</option>
          </NativeSelect>
        </div>
        <div className="space-y-2">
          <Label htmlFor="method">How did you pay?</Label>
          <NativeSelect id="method" name="method" defaultValue="MOBILE_MONEY">
            <option value="MOBILE_MONEY">Mobile money</option>
            <option value="BANK_TRANSFER">Bank transfer</option>
            <option value="CASH">Cash</option>
            <option value="OTHER">Other</option>
          </NativeSelect>
        </div>
        <div className="space-y-2">
          <Label htmlFor="transactionRef">Transaction reference</Label>
          <Input
            id="transactionRef"
            name="transactionRef"
            placeholder="From your SMS or receipt"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="paidAt">Date paid</Label>
          <Input id="paidAt" name="paidAt" type="date" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="payerName">Paid by</Label>
          <Input id="payerName" name="payerName" />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="proof">Proof of payment</Label>
        <Input
          id="proof"
          name="proof"
          type="file"
          accept="image/*,application/pdf"
          multiple
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="notes">Anything we should know?</Label>
        <Textarea id="notes" name="notes" rows={2} />
      </div>

      <p className="rounded-md bg-secondary px-3 py-2 text-xs text-muted-foreground">
        We will check this against our bank before it counts against your bill.
        Your cargo is released once our finance team has confirmed it.
      </p>

      <FormMessage error={state.error} />
      <div className="flex gap-2">
        <SubmitButton>Tell us about this payment</SubmitButton>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
