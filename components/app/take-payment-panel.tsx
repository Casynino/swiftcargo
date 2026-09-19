"use client";

import type { ReactNode } from "react";
import { useActionState, useEffect, useMemo, useState } from "react";
import { ArrowLeftRight, Banknote, Layers, Paperclip, Truck } from "lucide-react";

import {
  recordMergedPayment,
  recordPayment,
  type ActionState,
} from "@/lib/actions/payments";
import { FormMessage } from "@/components/app/form-message";
import { SubmitButton } from "@/components/app/submit-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";

import { useT } from "@/components/app/locale-provider";
import { Tx } from "@/components/app/tx";
const METHODS = [
  ["CASH", "Cash"],
  ["BANK_TRANSFER", "Bank transfer"],
  ["MOBILE_MONEY", "Mobile money"],
  ["CHEQUE", "Cheque"],
  ["OTHER", "Other"],
] as const;

export type OpenBill = {
  id: string;
  number: string;
  cargoReference: string;
  currency: string;
  /** In the bill's own currency. */
  outstanding: string;
  /** Whole shillings, exact. Null only on a dollar bill that never had a rate. */
  outstandingTzs: string | null;
  /** The rate pinned on the bill. */
  rate: string | null;
};

/* Shillings have no cents at a counter. Showing TZS 3,916,567.5 invites a clerk
   to type a figure nobody can hand over. */
const money = (value: number, currency: string) =>
  `${currency} ${value.toLocaleString(undefined, {
    minimumFractionDigits: currency === "TZS" ? 0 : 2,
    maximumFractionDigits: currency === "TZS" ? 0 : 2,
  })}`;

/**
 * THE COUNTER, WHERE MONEY ACTUALLY CHANGES HANDS.
 *
 * A customer arrives to collect and pays for what is in front of them. This
 * panel is the whole act: how much, in what money, at what rate, what proof
 * there is, and nothing else — the bill is already raised, the volume is
 * already measured, and nobody at this window should be doing arithmetic.
 *
 * The shillings line is the reason it exists. Bills are in dollars and people
 * pay in shillings, so the desk needs to see what the notes on the counter
 * settle BEFORE taking them, not afterwards on a receipt somebody disputes.
 *
 * Finance's recording counts at once, with a receipt; anybody else's lands as
 * a claim for Finance to confirm (lib/actions/payments.ts).
 */
export function TakePaymentPanel({
  bill,
  others,
  customerId,
  liveRate,
  accounts,
  canReleaseOnCredit,
  notify,
}: {
  bill: OpenBill;
  /** The customer's other open bills, for taking one payment across them. */
  others: OpenBill[];
  customerId: string;
  /** Today's published rate, TZS per USD. */
  liveRate: string | null;
  /** Where the money can have landed. Empty until Finance sets accounts up. */
  accounts: { id: string; label: string }[];
  canReleaseOnCredit: boolean;
  /** The WhatsApp button, composed on the server where the wording lives. */
  notify?: ReactNode;
}) {
  const tx = useT();
  const [single, singleAction] = useActionState<ActionState, FormData>(
    recordPayment,
    {}
  );
  const [merged, mergedAction] = useActionState<ActionState, FormData>(
    recordMergedPayment,
    {}
  );

  const [mode, setMode] = useState<"one" | "many">("one");
  const [currency, setCurrency] = useState(bill.outstandingTzs !== null ? "TZS" : bill.currency);
  /* The bill's own rate. Today's is only for a bill that somehow has none. */
  const billRate = bill.rate ?? liveRate ?? "";
  const [rate, setRate] = useState(billRate);
  const [submitKey, setSubmitKey] = useState(() => crypto.randomUUID());
  const [acceptOver, setAcceptOver] = useState(false);
  const [editingRate, setEditingRate] = useState(false);
  const [picked, setPicked] = useState<string[]>([bill.id, ...others.map((o) => o.id)]);

  const owingTzs = bill.outstandingTzs !== null ? Number(bill.outstandingTzs) : null;
  const rateNum = Number(rate) || 0;

  /* What the bills selected in this mode come to, in the money being paid. */
  const target = useMemo(() => {
    const bills = mode === "one" ? [bill] : [bill, ...others].filter((b) => picked.includes(b.id));
    return bills.reduce((sum, b) => {
      /* Kept in shillings, each bill at its own rate — the figures the server
         will check the payment against. */
      const own = b.id === bill.id ? rateNum : Number(b.rate) || rateNum;
      if (b.outstandingTzs === null) return b.currency === currency ? sum + Number(b.outstanding) : sum;
      const tzs = Number(b.outstandingTzs);
      if (currency === "TZS") return sum + tzs;
      return own ? sum + Math.ceil((tzs / own) * 100) / 100 : sum;
    }, 0);
  }, [mode, bill, others, picked, currency, rateNum]);

  const [amount, setAmount] = useState("");
  const [delivery, setDelivery] = useState(false);
  const entered = Number(amount) || 0;

  /* The sentence the clerk reads back to the customer. */
  const settles = !rateNum
    ? "There is no exchange rate on this bill. Finance has to publish one before money can be taken."
    : !entered
      ? `This bill's rate is 1 USD = ${rateNum.toLocaleString()} TZS. Type an amount to see what it settles.`
      : currency === "TZS"
        ? `${money(entered, "TZS")} ≈ ${money(entered / rateNum, "USD")} at 1 USD = ${rateNum.toLocaleString()} TZS.`
        : `${money(entered, "USD")} = ${money(Math.round((Math.round(entered * 100) * rateNum) / 100), "TZS")} at 1 USD = ${rateNum.toLocaleString()} TZS.`;

  const state = mode === "one" ? single : merged;
  const over = entered > 0 && target > 0 && entered > target + (currency === "TZS" ? 0 : 0.001);

  useEffect(() => {
    if (state.ok) {
      setSubmitKey(crypto.randomUUID());
      setAcceptOver(false);
    }
  }, [state]);

  return (
    <>
      {/*
        SAID BEFORE THE FORM, NOT INSIDE IT.

        A customer paying for three consignments at once is the commonest thing
        that goes wrong here: the clerk records the whole transfer against the
        first bill and the other two sit unpaid with the money already spent.
        Its own card, above the form, so it is read before an amount is typed.
      */}
      {others.length > 0 ? (
        <button
          type="button"
          onClick={() => setMode(mode === "one" ? "many" : "one")}
          className="flex w-full items-start gap-3 rounded-xl border border-marine/40 bg-marine/[0.06] p-4 text-left shadow-soft transition-colors hover:bg-marine/[0.1]"
        >
          <Layers className="mt-0.5 size-4 shrink-0 text-marine" />
          <span>
            <span className="block font-medium">
              {mode === "one"
                ? `This customer has ${others.length} other unpaid consignment${others.length === 1 ? "" : "s"}.`
                : `Taking one payment across ${picked.length} bill${picked.length === 1 ? "" : "s"}.`}
            </span>
            <span className="mt-0.5 block text-sm text-muted-foreground">
              {mode === "one"
                ? "Paying for several at once? Take it as one payment."
                : "Oldest bill first. Press again to go back to this bill only."}
            </span>
          </span>
        </button>
      ) : null}

    <Card className="border-brand/30">
      {/*
        TELLING THEM AND TAKING IT ARE ONE CARD.

        The clerk's two moves on this screen are ringing the customer and taking
        their money, and they happen in that order minutes apart. Separating
        them into two cards put a scroll between a phone call and the till.
      */}
      <CardHeader className="space-y-3 pb-4">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-base">{tx("Actions")}</CardTitle>
          {notify}
        </div>
        <div className="flex items-center justify-between gap-3 rounded-lg border border-brand/30 bg-brand/[0.04] px-3 py-2">
          <span className="flex items-center gap-2 text-sm font-medium">
            <Banknote className="size-4 text-brand" />
            {tx("Take a payment")}
          </span>
          <span className="text-right">
            <span className="tnum block text-sm font-semibold">
              {owingTzs !== null ? money(owingTzs, "TZS") : money(Number(bill.outstanding), bill.currency)}
            </span>
            {owingTzs !== null && bill.rate ? (
              <span className="tnum block text-[11px] text-muted-foreground">
                {money(Number(bill.outstanding), "USD")} · 1 USD = {Number(bill.rate).toLocaleString()} TZS
              </span>
            ) : null}
          </span>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">

        <form
          key={mode}
          action={mode === "one" ? singleAction : mergedAction}
          className="space-y-4"
        >
          {mode === "one" ? (
            <input type="hidden" name="invoiceId" value={bill.id} />
          ) : (
            <>
              <input type="hidden" name="customerId" value={customerId} />
              {picked.map((id) => (
                <input key={id} type="hidden" name="invoiceIds" value={id} />
              ))}
            </>
          )}
          {/* Sent only when the counter agreed a different rate; otherwise the
              server uses the bill's own. */}
          {rate && rate !== billRate ? <input type="hidden" name="fxRate" value={rate} /> : null}
          <input type="hidden" name="idempotencyKey" value={submitKey} />

          {mode === "many" ? (
            <ul className="space-y-1.5 rounded-md border p-3">
              {[bill, ...others].map((b) => (
                <li key={b.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="size-4"
                    checked={picked.includes(b.id)}
                    onChange={(e) =>
                      setPicked((list) =>
                        e.target.checked
                          ? [...list, b.id]
                          : list.filter((x) => x !== b.id)
                      )
                    }
                    aria-label={`Include ${b.number}`}
                  />
                  <span className="tnum flex-1 truncate">
                    {b.number}
                    <span className="ml-2 text-xs text-muted-foreground">
                      {b.cargoReference}
                    </span>
                  </span>
                  <span className="tnum text-sm">
                    {b.outstandingTzs !== null ? money(Number(b.outstandingTzs), "TZS") : money(Number(b.outstanding), b.currency)}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="amount">{tx("Amount received")}</Label>
              <Input
                id="amount"
                name="amount"
                type="number"
                step={currency === "TZS" ? 1 : 0.01}
                min={0}
                inputMode="decimal"
                required
                className="tnum text-lg font-semibold"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder={target ? target.toFixed(currency === "TZS" ? 0 : 2) : "0.00"}
              />
              {target > 0 ? (
                <button
                  type="button"
                  className="text-xs text-primary hover:underline"
                  onClick={() =>
                    setAmount(target.toFixed(currency === "TZS" ? 0 : 2))
                  }
                >
                  Fill in the full {money(target, currency)}
                </button>
              ) : null}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="currency">{tx("Paid in")}</Label>
              <NativeSelect
                id="currency"
                name="currency"
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
              >
                <option value="TZS">TZS</option>
                <option value="USD">USD</option>
              </NativeSelect>
            </div>
          </div>

          {over ? (
            <div className="space-y-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
              <p>
                That is {money(entered - target, currency)} more than{" "}
                {mode === "one" ? bill.number : "the ticked bills"} still owe.
              </p>
              {mode === "one" ? (
                <>
                  <label className="flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      name="allowOverpayment"
                      checked={acceptOver}
                      onChange={(e) => setAcceptOver(e.target.checked)}
                      className="size-4"
                    />
                    {tx("Accept overpayment — the extra stays on the bill as a credit")}
                  </label>
                  {acceptOver ? (
                    <Input name="overpaymentReason" required minLength={3} placeholder={tx("Why the extra is being accepted")} />
                  ) : null}
                </>
              ) : (
                <p className="text-xs text-muted-foreground">{tx("Tick another bill or correct the figure.")}</p>
              )}
            </div>
          ) : null}

          {rateNum || currency !== bill.currency ? (
            <div className="space-y-2 rounded-md border bg-surface-2/50 p-3">
              <p className="tnum text-sm">{settles}</p>
              {editingRate ? (
                <div className="flex items-end gap-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="rate" className="text-xs">
                      USD 1 =
                    </Label>
                    <Input
                      id="rate"
                      type="number"
                      step="0.01"
                      min={0}
                      inputMode="decimal"
                      className="tnum h-9 w-32"
                      value={rate}
                      onChange={(e) => setRate(e.target.value)}
                    />
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setEditingRate(false)}
                  >
                    {tx("Use this rate")}
                  </Button>
                  {billRate && rate !== billRate ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setRate(billRate);
                        setEditingRate(false);
                      }}
                    >
                      Back to {Number(billRate).toLocaleString()}
                    </Button>
                  ) : null}
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setEditingRate(true)}
                  className="flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
                >
                  <ArrowLeftRight className="size-3.5" />
                  {tx("Change the rate for this payment")}
                </button>
              )}
              <p className="text-xs text-muted-foreground">
                {tx("This payment only. The bill does not move — only what these shillings are worth against it.")}
              </p>
            </div>
          ) : null}

          {/*
            WHAT ELSE WAS INSIDE THE TRANSFER.

            Customers routinely send one figure covering the freight and the
            driver who will bring it to them. Only the freight half settles the
            bill — counting the whole transfer against the invoice overstates
            what they have paid by exactly the delivery fare, and that is how a
            bill reads settled while it is not.
          */}
          {delivery ? (
            <div className="grid grid-cols-1 gap-3 rounded-lg border p-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="deliveryAdded">{tx("Delivery they added")}</Label>
                <Input
                  id="deliveryAdded"
                  name="deliveryAdded"
                  type="number"
                  step="0.01"
                  min={0}
                  placeholder="0"
                  className="tnum"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="deliverySettledFrom">{tx("Settled from")}</Label>
                <NativeSelect
                  id="deliverySettledFrom"
                  name="deliverySettledFrom"
                  defaultValue=""
                >
                  <option value="">{tx("Cash or the till")}</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.label}>
                      <Tx>{a.label}</Tx>
                    </option>
                  ))}
                </NativeSelect>
              </div>
              <p className="text-xs text-muted-foreground sm:col-span-2">
                {tx("Recorded beside the payment, never added to it. It does not settle any part of the freight.")}
              </p>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setDelivery(true)}
              className="flex items-center gap-2 text-sm font-medium text-primary hover:underline"
            >
              <Truck className="size-4" />
              {tx("They added delivery to this transfer")}
            </button>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="method">{tx("How it was paid")}</Label>
              <NativeSelect id="method" name="method" defaultValue="CASH">
                {METHODS.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="transactionRef">{tx("Their reference")}</Label>
              <Input
                id="transactionRef"
                name="transactionRef"
                placeholder={tx("M-Pesa code, slip number…")}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="paidAt">{tx("When")}</Label>
              <Input id="paidAt" name="paidAt" type="date" min="2000-01-01" max="2099-12-31" />
              <p className="text-xs text-muted-foreground">
                {tx("Leave blank for today.")}
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="proof" className="flex items-center gap-1.5">
                <Paperclip className="size-3.5" />
                {tx("Proof")}
              </Label>
              <Input
                id="proof"
                name="proof"
                type="file"
                accept="image/*,application/pdf"
                multiple
              />
            </div>
          </div>

          {/* Money nobody can point at is money nobody can reconcile. */}
          <div className="space-y-1.5">
            <Label htmlFor="accountId">{tx("Landed in")}</Label>
            <NativeSelect id="accountId" name="accountId" defaultValue="">
              <option value="">{tx("Choose the account")}</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  <Tx>{a.label}</Tx>
                </option>
              ))}
            </NativeSelect>
            {accounts.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                {tx("No accounts are set up yet. An administrator adds the banks and tills in Settings.")}
              </p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="notes">{tx("Note")}</Label>
            <Input id="notes" name="notes" placeholder={tx("Optional")} />
          </div>

          <FormMessage error={state.error} ok={state.ok} />

          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              {canReleaseOnCredit
                ? "Counted straight away, with a receipt."
                : "Recorded now, counted once Finance verifies it."}
            </p>
            <SubmitButton pendingLabel="Recording…" disabled={over && (mode === "many" || !acceptOver)}>
              {mode === "one" ? "Record payment" : "Record one payment"}
            </SubmitButton>
          </div>
        </form>
      </CardContent>
    </Card>
    </>
  );
}
