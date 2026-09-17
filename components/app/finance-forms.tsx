"use client";

import { useActionState, useEffect, useState } from "react";
import { Ban, Banknote, Check, Plus, RotateCcw, ShieldCheck, X } from "lucide-react";

import {
  createCustomerRate,
  createRate,
  setExchangeRate,
  type ActionState as ConfigState,
} from "@/lib/actions/finance-config";
import {
  adjustInvoice,
  cancelInvoice,
  generateContainerInvoices,
  generateInvoice,
  issueInvoice,
  type ActionState as InvoiceState,
} from "@/lib/actions/invoices";
import {
  recordPayment,
  rejectPayment,
  reversePayment,
  verifyPayment,
  type ActionState as PaymentState,
} from "@/lib/actions/payments";
import { FormMessage } from "@/components/app/form-message";
import { SubmitButton } from "@/components/app/submit-button";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";

// --- Rates -----------------------------------------------------------------

export function RateForm({
  inline = false,
  cargoTypes = [],
}: {
  /** Sits open in a panel rather than behind a button. */
  inline?: boolean;
  /** Names already in use, offered so a rate lands on the name cargo uses. */
  cargoTypes?: string[];
} = {}) {
  const [state, action] = useActionState<ConfigState, FormData>(createRate, {});
  const [open, setOpen] = useState(inline);

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)}>
        <Plus />
        Publish a rate
      </Button>
    );
  }

  const Wrapper = inline ? "div" : Card;
  return (
    <Wrapper className={inline ? "" : "p-6"}>
      <form action={action} className="space-y-4">
        <div className={inline ? "grid gap-4 sm:grid-cols-2" : "grid gap-4 sm:grid-cols-3"}>
          <div className="space-y-2">
            <Label htmlFor="service">Service</Label>
            <NativeSelect id="service" name="service" defaultValue="LCL">
              <option value="LCL">Loose cargo (LCL)</option>
              <option value="FCL">Full container (FCL)</option>
            </NativeSelect>
          </div>
          <div className="space-y-2">
            <Label htmlFor="cargoType">Commodity band</Label>
            <Input
              id="cargoType"
              name="cargoType"
              list="rate-cargo-types"
              placeholder="Blank = the general rate"
            />
            <datalist id="rate-cargo-types">
              {cargoTypes.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
          </div>
          <div className="space-y-2">
            <Label htmlFor="basis">Charged by</Label>
            <NativeSelect id="basis" name="basis" defaultValue="PER_CBM">
              <option value="PER_CBM">Cubic metre</option>
              <option value="PER_KG">Kilogram</option>
              <option value="FLAT">Flat</option>
            </NativeSelect>
          </div>
          <div className="space-y-2">
            <Label htmlFor="rate">Rate (USD)</Label>
            <Input id="rate" name="rate" type="number" step="0.01" min={0} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="minimumCbm">Minimum CBM</Label>
            <Input id="minimumCbm" name="minimumCbm" type="number" step="0.001" min={0} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="minimumKg">Minimum kg</Label>
            <Input id="minimumKg" name="minimumKg" type="number" step="0.01" min={0} />
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="published" defaultChecked />
          Show this on the public rates page
        </label>

        <p className="rounded-md bg-secondary px-3 py-2 text-xs text-muted-foreground">
          Publishing supersedes the current rate rather than editing it. Invoices
          already raised keep the rate they were raised at.
        </p>

        <FormMessage error={state.error} ok={state.ok} />
        <div className="flex gap-2">
          <SubmitButton>Publish</SubmitButton>
          {inline ? null : (
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          )}
        </div>
      </form>
    </Wrapper>
  );
}

export function CustomerRateForm({
  customers,
  inline = false,
  cargoTypes = [],
}: {
  customers: { id: string; label: string }[];
  inline?: boolean;
  cargoTypes?: string[];
}) {
  const [state, action] = useActionState<ConfigState, FormData>(
    createCustomerRate,
    {}
  );
  const [open, setOpen] = useState(inline);

  if (!open) {
    return (
      <Button variant="outline" onClick={() => setOpen(true)}>
        Agree a customer rate
      </Button>
    );
  }

  const Wrapper = inline ? "div" : Card;
  return (
    <Wrapper className={inline ? "" : "p-6"}>
      <form action={action} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="customerId">Customer</Label>
            <NativeSelect id="customerId" name="customerId" required defaultValue="">
              <option value="" disabled>
                Choose…
              </option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="space-y-2">
            <Label htmlFor="cr-service">Service</Label>
            <NativeSelect id="cr-service" name="service" defaultValue="LCL">
              <option value="LCL">Loose cargo (LCL)</option>
              <option value="FCL">Full container (FCL)</option>
            </NativeSelect>
          </div>
          <div className="space-y-2">
            <Label htmlFor="cr-cargoType">Cargo type</Label>
            {/* An agreement is for one kind of goods: a customer who ships
                shoes cheaply is not thereby shipping machinery cheaply. */}
            <NativeSelect id="cr-cargoType" name="cargoType" defaultValue="">
              <option value="">Every cargo type</option>
              {cargoTypes.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="space-y-2">
            <Label htmlFor="cr-basis">Charged by</Label>
            <NativeSelect id="cr-basis" name="basis" defaultValue="PER_CBM">
              <option value="PER_CBM">Cubic metre</option>
              <option value="PER_KG">Kilogram</option>
              <option value="FLAT">Flat</option>
            </NativeSelect>
          </div>
          <div className="space-y-2">
            <Label htmlFor="cr-rate">Agreed rate (USD)</Label>
            <Input id="cr-rate" name="rate" type="number" step="0.01" min={0} required />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="cr-reason">Why?</Label>
          <Input id="cr-reason" name="reason" required placeholder="Volume customer since 2024" />
        </div>
        <p className="text-xs text-muted-foreground">
          The standard rate stays where it is — it is what this discount is
          measured against, and every invoice will show both.
        </p>
        <FormMessage error={state.error} ok={state.ok} />
        <div className="flex gap-2">
          <SubmitButton>Record</SubmitButton>
          {inline ? null : (
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          )}
        </div>
      </form>
    </Wrapper>
  );
}

export function ExchangeRateForm({ current }: { current: string | null }) {
  const [state, action] = useActionState<ConfigState, FormData>(
    setExchangeRate,
    {}
  );
  return (
    <form action={action} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="rate">TZS per 1 USD</Label>
          <Input
            id="rate"
            name="rate"
            type="number"
            inputMode="decimal"
            step="0.000001"
            min={100}
            required
            defaultValue={current ?? ""}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="notes">Reason</Label>
          <Input id="notes" name="notes" required minLength={3} placeholder="CRDB bank rate, 17 Sept" />
        </div>
      </div>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="confirm" required className="mt-0.5 size-4 accent-[hsl(var(--brand))]" />
        <span>
          I confirm this rate. New bills and payments use it from now on; bills
          already issued keep the rate they were issued at.
        </span>
      </label>
      <FormMessage error={state.error} ok={state.ok} />
      <SubmitButton>Publish rate</SubmitButton>
    </form>
  );
}

// --- Invoices ---------------------------------------------------------------

export function GenerateInvoiceButton({ cargoId }: { cargoId: string }) {
  const [state, action] = useActionState<InvoiceState, FormData>(
    generateInvoice,
    {}
  );
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="cargoId" value={cargoId} />
      <SubmitButton size="sm">Raise invoice</SubmitButton>
      <FormMessage error={state.error} ok={state.ok} />
    </form>
  );
}

export function GenerateContainerInvoicesButton({
  containerId,
}: {
  containerId: string;
}) {
  const [state, action] = useActionState<InvoiceState, FormData>(
    generateContainerInvoices,
    {}
  );
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="containerId" value={containerId} />
      <SubmitButton variant="outline">Raise invoices for this container</SubmitButton>
      <FormMessage error={state.error} ok={state.ok} />
    </form>
  );
}

export function IssueInvoiceForm({ invoiceId }: { invoiceId: string }) {
  const [state, action] = useActionState<InvoiceState, FormData>(
    issueInvoice,
    {}
  );
  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="invoiceId" value={invoiceId} />
      <div className="space-y-2">
        <Label htmlFor="dueDays">Payable within</Label>
        <NativeSelect id="dueDays" name="dueDays" defaultValue="7" className="w-40">
          <option value="0">On receipt</option>
          <option value="3">3 days</option>
          <option value="7">7 days</option>
          <option value="14">14 days</option>
          <option value="30">30 days</option>
        </NativeSelect>
      </div>
      <SubmitButton>Issue to customer</SubmitButton>
      <FormMessage error={state.error} ok={state.ok} />
    </form>
  );
}

export function AdjustInvoiceForm({
  invoiceId,
  appliedRate,
}: {
  invoiceId: string;
  appliedRate: string | null;
}) {
  const [state, action] = useActionState<InvoiceState, FormData>(
    adjustInvoice,
    {}
  );
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        Adjust
      </Button>
    );
  }

  return (
    <form action={action} className="space-y-4 rounded-lg border p-4">
      <input type="hidden" name="invoiceId" value={invoiceId} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="appliedRate">Rate</Label>
          <Input
            id="appliedRate"
            name="appliedRate"
            type="number"
            step="0.0001"
            min={0}
            defaultValue={appliedRate ?? ""}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="additionalCharge">Extra charge</Label>
          <Input
            id="additionalCharge"
            name="additionalCharge"
            type="number"
            step="0.01"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="chargeDescription">What for?</Label>
          <Input
            id="chargeDescription"
            name="chargeDescription"
            placeholder="Transport, storage…"
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="adj-reason">Reason</Label>
        <Input id="adj-reason" name="reason" required />
      </div>
      <FormMessage error={state.error} ok={state.ok} />
      <div className="flex gap-2">
        <SubmitButton>Save adjustment</SubmitButton>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

export function CancelInvoiceForm({ invoiceId }: { invoiceId: string }) {
  const [state, action] = useActionState<InvoiceState, FormData>(
    cancelInvoice,
    {}
  );
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Ban />
        Cancel this bill
      </Button>
    );
  }

  return (
    <form action={action} className="space-y-3 rounded-lg border border-destructive/30 p-4">
      <input type="hidden" name="invoiceId" value={invoiceId} />
      <div className="space-y-2">
        <Label htmlFor="cancel-reason">Why?</Label>
        <Input id="cancel-reason" name="reason" required />
      </div>
      <FormMessage error={state.error} ok={state.ok} />
      <div className="flex gap-2">
        <SubmitButton variant="destructive" size="sm">
          Cancel it
        </SubmitButton>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Keep it
        </Button>
      </div>
    </form>
  );
}

// --- Payments ---------------------------------------------------------------

export function RecordPaymentForm({
  invoiceId,
  currency: invoiceCurrency,
  outstanding,
  outstandingTzs,
  canVerify,
  fxRate,
}: {
  invoiceId: string;
  currency: string;
  outstanding: string;
  /** Whole shillings still owed. Null only on a dollar bill with no rate. */
  outstandingTzs?: string | null;
  canVerify: boolean;
  /** The rate pinned on this bill, so the panel can show what the money settles. */
  fxRate?: number | null;
}) {
  const [state, action] = useActionState<PaymentState, FormData>(
    recordPayment,
    {}
  );
  const shillings = outstandingTzs !== null && outstandingTzs !== undefined;
  const [currency, setCurrency] = useState(shillings ? "TZS" : invoiceCurrency);
  const [amount, setAmount] = useState(shillings ? outstandingTzs! : outstanding);
  const [dated, setDated] = useState(false);
  const [acceptOver, setAcceptOver] = useState(false);
  /* One key per payment, so a double press or a retry records it once. */
  const [submitKey, setSubmitKey] = useState(() => crypto.randomUUID());
  useEffect(() => {
    if (state.ok) {
      setSubmitKey(crypto.randomUUID());
      setAcceptOver(false);
    }
  }, [state]);

  /*
    THE PANEL IS ALWAYS OPEN.

    Taking money is the commonest thing this screen is used for, and a button
    that reveals the form is one press between a customer standing at a counter
    and the clerk being able to type. Target's desk has it open; so does ours.
  */
  const typed = Number(amount || 0);
  const owedHere =
    currency === "TZS"
      ? Number(outstandingTzs ?? 0)
      : shillings && fxRate
        ? Math.ceil((Number(outstandingTzs) / fxRate) * 100) / 100
        : Number(outstanding);
  const over = typed > owedHere && owedHere >= 0 && (shillings || currency === invoiceCurrency);
  const settles = fxRate
    ? currency === "TZS"
      ? `TZS ${typed.toLocaleString()} ≈ USD ${(typed / fxRate).toFixed(2)} at 1 USD = ${fxRate.toLocaleString()} TZS.`
      : `USD ${typed.toFixed(2)} = TZS ${Math.round((Math.round(typed * 100) * fxRate) / 100).toLocaleString()} at 1 USD = ${fxRate.toLocaleString()} TZS.`
    : null;

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="invoiceId" value={invoiceId} />
      <input type="hidden" name="idempotencyKey" value={submitKey} />

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="amount" className="text-xs">
            Cargo charge ({currency})
          </Label>
          <Input
            id="amount"
            name="amount"
            type="number"
            step={currency === "TZS" ? 1 : 0.01}
            min={0}
            required
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="tnum h-9"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="currency" className="text-xs">
            Paid in
          </Label>
          <NativeSelect
            id="currency"
            name="currency"
            value={currency}
            onChange={(e) => {
              const next = e.target.value;
              setCurrency(next);
              setAmount(
                next === "TZS"
                  ? (outstandingTzs ?? "")
                  : shillings && fxRate
                    ? (Math.ceil((Number(outstandingTzs) / fxRate) * 100) / 100).toFixed(2)
                    : outstanding
              );
            }}
            className="h-9"
          >
            <option value="TZS">TZS</option>
            <option value="USD">USD</option>
          </NativeSelect>
        </div>
      </div>

      {over ? (
        <div className="space-y-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs">
          <p>
            That is more than the bill still owes ({currency} {owedHere.toLocaleString()}).
          </p>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              name="allowOverpayment"
              checked={acceptOver}
              onChange={(e) => setAcceptOver(e.target.checked)}
              className="size-4"
            />
            Accept overpayment — the extra stays on the bill as a credit
          </label>
          {acceptOver ? (
            <Input name="overpaymentReason" required minLength={3} placeholder="Why the extra is being accepted" className="h-9" />
          ) : null}
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="method" className="text-xs">
            Paid by
          </Label>
          <NativeSelect id="method" name="method" defaultValue="MOBILE_MONEY" className="h-9">
            <option value="MOBILE_MONEY">Mobile money</option>
            <option value="BANK_TRANSFER">Bank transfer</option>
            <option value="CASH">Cash</option>
            <option value="CHEQUE">Cheque</option>
            <option value="OTHER">Other</option>
          </NativeSelect>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="transactionRef" className="text-xs">
            Their reference
          </Label>
          <Input
            id="transactionRef"
            name="transactionRef"
            placeholder="M-Pesa code…"
            className="tnum h-9"
          />
        </div>
      </div>

      {/* WHAT THE SHILLINGS ACTUALLY SETTLE. A customer hands over shillings
          against a dollar bill; the figure that clears the debt is the dollars
          that reached the account at the rate pinned on THIS payment, never
          today's rate and never the shillings themselves. */}
      {settles ? (
        <p className="tnum rounded-md border bg-secondary/40 px-3 py-2 text-xs text-muted-foreground">
          {settles}
        </p>
      ) : null}

      <div className="space-y-1.5">
        <Label htmlFor="proof" className="text-xs">
          Proof
        </Label>
        <Input
          id="proof"
          name="proof"
          type="file"
          accept="image/*,application/pdf"
          multiple
          className="h-9 text-xs"
        />
      </div>

      {dated ? (
        <div className="space-y-1.5">
          <Label htmlFor="paidAt" className="text-xs">
            Date paid
          </Label>
          <Input
            id="paidAt"
            name="paidAt"
            type="date"
            min="2000-01-01"
            max="2099-12-31"
            className="tnum h-9"
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setDated(true)}
          className="text-xs font-medium text-primary hover:underline"
        >
          Click here if you wish to change the date
        </button>
      )}

      <p className="rounded-md bg-secondary px-3 py-2 text-xs text-muted-foreground">
        {canVerify
          ? "This lands as pending. Verify it separately once the bank shows it — recording and confirming are two acts, and that separation is what stops cargo leaving on a screenshot."
          : "This is a claim, not a confirmation. Finance checks it against the bank before it counts against the bill."}
      </p>

      <FormMessage error={state.error} ok={state.ok} />
      <SubmitButton className="w-full" disabled={over && !acceptOver}>
        <Banknote />
        {canVerify ? "Record payment" : "Submit to Finance"}
      </SubmitButton>
    </form>
  );
}

export function VerifyPaymentButtons({ paymentId }: { paymentId: string }) {
  const [verifyState, verifyAction] = useActionState<PaymentState, FormData>(
    verifyPayment,
    {}
  );
  const [rejectState, rejectAction] = useActionState<PaymentState, FormData>(
    rejectPayment,
    {}
  );
  const [rejecting, setRejecting] = useState(false);

  if (rejecting) {
    return (
      <form action={rejectAction} className="space-y-2">
        <input type="hidden" name="paymentId" value={paymentId} />
        <Input name="reason" required placeholder="Not on the statement…" className="h-9" />
        <div className="flex gap-1">
          <SubmitButton variant="destructive" size="sm">
            Reject
          </SubmitButton>
          <Button type="button" variant="ghost" size="sm" onClick={() => setRejecting(false)}>
            Back
          </Button>
        </div>
        <FormMessage error={rejectState.error} />
      </form>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-1">
        <form action={verifyAction}>
          <input type="hidden" name="paymentId" value={paymentId} />
          <SubmitButton size="sm">
            <ShieldCheck />
            Verify
          </SubmitButton>
        </form>
        <Button variant="ghost" size="sm" onClick={() => setRejecting(true)}>
          <X />
        </Button>
      </div>
      <FormMessage error={verifyState.error} ok={verifyState.ok} />
    </div>
  );
}

export function ReversePaymentForm({ paymentId }: { paymentId: string }) {
  const [state, action] = useActionState<PaymentState, FormData>(
    reversePayment,
    {}
  );
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        <RotateCcw />
        Reverse
      </Button>
    );
  }

  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="paymentId" value={paymentId} />
      <Input name="reason" required placeholder="Why is it being reversed?" className="h-9" />
      <p className="text-xs text-muted-foreground">
        The payment stays on the record as reversed. The receipt already issued
        would otherwise point at nothing.
      </p>
      <div className="flex gap-1">
        <SubmitButton variant="destructive" size="sm">
          Reverse
        </SubmitButton>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
      <FormMessage error={state.error} ok={state.ok} />
    </form>
  );
}

