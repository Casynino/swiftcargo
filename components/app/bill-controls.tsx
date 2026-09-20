"use client";

import { useActionState, useState } from "react";
import { ArrowLeftRight, BadgePercent, Ban, CheckCircle2, Scale } from "lucide-react";

import { FormMessage } from "@/components/app/form-message";
import { SubmitButton } from "@/components/app/submit-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  chargeStorage,
  discountInvoice,
  repriceInvoice,
  type ActionState,
} from "@/lib/actions/invoices";

import { useT } from "@/components/app/locale-provider";
/**
 * THE FOUR THINGS A CLERK DOES TO A LIVE BILL.
 *
 * Take something off, re-price it, put the floor rent on it, or settle it at a
 * rate other than the one on the board. Each is folded away until it is needed —
 * the common case is a customer paying what the invoice says, and four open
 * forms above that is four ways to change a figure by accident.
 *
 * Every one of them asks why. A figure the customer has already been shown does
 * not move without a reason attached to the person who moved it.
 */
export function BillControls({
  invoiceId,
  currency,
  appliedRate,
  storage,
}: {
  invoiceId: string;
  currency: string;
  /** The rate per CBM this bill was raised at, when every line shares one. */
  appliedRate: string | null;
  storage: {
    configured: boolean;
    daysHeld: number;
    freeDays: number;
    chargeableDays: number;
    amount: string;
    onTheBill: boolean;
  };
}) {
  const tx = useT();
  const [open, setOpen] = useState<"discount" | "rate" | null>(null);

  return (
    <div className="space-y-2">
      {open === "discount" ? (
        <DiscountForm
          invoiceId={invoiceId}
          currency={currency}
          onClose={() => setOpen(null)}
        />
      ) : (
        <button
          type="button"
          onClick={() => setOpen("discount")}
          className="flex items-center gap-2 text-sm font-medium text-primary hover:underline"
        >
          <BadgePercent className="size-4" />
          {tx("Give a discount")}
        </button>
      )}

      {open === "rate" ? (
        <RepriceForm
          invoiceId={invoiceId}
          currency={currency}
          appliedRate={appliedRate}
          onClose={() => setOpen(null)}
        />
      ) : (
        <button
          type="button"
          onClick={() => setOpen("rate")}
          className="flex items-center gap-2 text-sm font-medium text-primary hover:underline"
        >
          <Scale className="size-4" />
          {tx("Edit the rate per CBM")}
        </button>
      )}

      <StorageControl invoiceId={invoiceId} currency={currency} storage={storage} />
    </div>
  );
}

function DiscountForm({
  invoiceId,
  currency,
  onClose,
}: {
  invoiceId: string;
  currency: string;
  onClose: () => void;
}) {
  const tx = useT();
  const [state, action] = useActionState<ActionState, FormData>(
    discountInvoice,
    {}
  );
  return (
    <form action={action} className="space-y-2 rounded-lg border p-3">
      <input type="hidden" name="invoiceId" value={invoiceId} />
      <div className="space-y-1.5">
        <Label htmlFor="discount-amount" className="text-xs">
          Take off ({currency})
        </Label>
        <Input
          id="discount-amount"
          name="amount"
          type="number"
          step="0.01"
          min={0}
          required
          className="tnum h-9"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="discount-reason" className="text-xs">
          {tx("Why")}
        </Label>
        <Input
          id="discount-reason"
          name="reason"
          placeholder={tx("Agreed with the customer…")}
          className="h-9"
        />
      </div>
      {/* It never edits the total in place: a negative line is appended, so the
          printed invoice shows what was charged and what came off. */}
      <p className="text-xs text-muted-foreground">
        {tx("Appended as its own line with your name on it. The original charge stays on the bill.")}
      </p>
      <FormMessage error={state.error} ok={state.ok} />
      <div className="flex gap-2">
        <SubmitButton size="sm">{tx("Apply")}</SubmitButton>
        <Button type="button" size="sm" variant="ghost" onClick={onClose}>
          {tx("Cancel")}
        </Button>
      </div>
    </form>
  );
}

function RepriceForm({
  invoiceId,
  currency,
  appliedRate,
  onClose,
}: {
  invoiceId: string;
  currency: string;
  appliedRate: string | null;
  onClose: () => void;
}) {
  const tx = useT();
  const [state, action] = useActionState<ActionState, FormData>(
    repriceInvoice,
    {}
  );
  return (
    <form action={action} className="space-y-2 rounded-lg border p-3">
      <input type="hidden" name="invoiceId" value={invoiceId} />
      <div className="space-y-1.5">
        <Label htmlFor="reprice-rate" className="text-xs">
          Rate per CBM ({currency})
        </Label>
        <Input
          id="reprice-rate"
          name="rate"
          type="number"
          step="0.01"
          min={0}
          required
          defaultValue={appliedRate ?? ""}
          className="tnum h-9"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="reprice-reason" className="text-xs">
          {tx("Why")}
        </Label>
        <Input
          id="reprice-reason"
          name="reason"
          placeholder={tx("Rate agreed for this customer…")}
          className="h-9"
        />
      </div>
      <p className="text-xs text-muted-foreground">
        {tx("Every line priced per cubic metre is re-multiplied. Flat and per-kilo lines are left alone.")}
      </p>
      <FormMessage error={state.error} ok={state.ok} />
      <div className="flex gap-2">
        <SubmitButton size="sm">{tx("Re-price")}</SubmitButton>
        <Button type="button" size="sm" variant="ghost" onClick={onClose}>
          {tx("Cancel")}
        </Button>
      </div>
    </form>
  );
}

function StorageControl({
  invoiceId,
  currency,
  storage,
}: {
  invoiceId: string;
  currency: string;
  storage: {
    configured: boolean;
    daysHeld: number;
    freeDays: number;
    chargeableDays: number;
    amount: string;
    onTheBill: boolean;
  };
}) {
  const tx = useT();
  const [state, action] = useActionState<ActionState, FormData>(
    chargeStorage,
    {}
  );

  if (!storage.configured) {
    return (
      <p className="text-xs text-muted-foreground">
        {tx("Storage is not charged. An administrator sets a daily rate in Settings.")}
      </p>
    );
  }

  return (
    <div className="space-y-1.5">
      <p className="tnum text-xs text-muted-foreground">
        Day {storage.daysHeld} of {storage.freeDays} free
        {storage.chargeableDays > 0
          ? ` · ${storage.chargeableDays} day(s) late`
          : ""}
      </p>
      <form action={action} className="flex flex-wrap gap-2">
        <input type="hidden" name="invoiceId" value={invoiceId} />
        {storage.onTheBill ? (
          <>
            <input type="hidden" name="remove" value="1" />
            <SubmitButton size="sm" variant="outline">
              <Ban />
              {tx("Remove the storage fee")}
            </SubmitButton>
          </>
        ) : (
          <SubmitButton
            size="sm"
            variant="outline"
            disabled={storage.chargeableDays <= 0}
          >
            <CheckCircle2 />
            Add storage · {currency} {storage.amount}
          </SubmitButton>
        )}
      </form>
      <FormMessage error={state.error} ok={state.ok} />
    </div>
  );
}

/**
 * SETTLE AT A RATE OTHER THAN THE ONE ON THE BOARD.
 *
 * A customer walks in having agreed 2,700 with somebody yesterday, and the
 * board says 2,650. The rate they agreed is the rate this payment clears at, and
 * it is pinned to the payment — the invoice keeps the rate it was raised at, and
 * neither is ever re-read from today's board.
 */
export function ChangeTheRate({
  rate,
  onChange,
}: {
  rate: number | null;
  onChange: (next: number | null) => void;
}) {
  const tx = useT();
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 text-sm font-medium text-primary hover:underline"
      >
        <ArrowLeftRight className="size-4" />
        {tx("Change the rate")}
      </button>
    );
  }

  return (
    <div className="space-y-1.5 rounded-lg border p-3">
      <Label htmlFor="fxRate" className="text-xs">
        {tx("Rate for this payment")}
      </Label>
      <Input
        id="fxRate"
        name="fxRate"
        type="number"
        step="0.0001"
        min={0}
        defaultValue={rate ?? ""}
        onChange={(e) =>
          onChange(e.target.value ? Number(e.target.value) : null)
        }
        className="tnum h-9"
      />
      <p className="text-xs text-muted-foreground">
        {tx("Pinned to this payment only. The bill keeps the rate it was raised at.")}
      </p>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        onClick={() => {
          setOpen(false);
          onChange(null);
        }}
      >
        {tx("Use the board rate")}
      </Button>
    </div>
  );
}
