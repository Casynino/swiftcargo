"use client";

import { useActionState, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeftRight, Banknote, CircleCheck, Download, FileText, Paperclip, SlidersHorizontal, Tag } from "lucide-react";

import {
  recordCombinedPayment,
  type MergeState,
} from "@/lib/actions/merge";
import { chargeStorage } from "@/lib/actions/invoices";
import { AskCreditButton } from "@/components/app/ask-for-credit";
import { CreditButton, DiscountDialog, ExchangeRateDialog, RateDialog } from "@/components/app/bill-dialogs";
import { FormMessage } from "@/components/app/form-message";
import { ShortfallNotice } from "@/components/app/shortfall-notice";
import { SubmitButton } from "@/components/app/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { cn } from "@/lib/utils";

import { Tx } from "@/components/app/tx";
export type MergeBill = {
  invoiceId: string;
  number: string;
  cargoId: string;
  /** The bill in dollars, as written. */
  total: number;
  cargo: string;
  description: string;
  container: string | null;
  currency: string;
  /** What is still owed, in the bill's own currency. */
  outstanding: number;
  /** Still owed in whole shillings, exact. Null only on a dollar bill with no rate. */
  outstandingTzs: number | null;
  /** The rate frozen onto this bill. Null only on bills raised without one. */
  rate: number | null;
  /** Storage accrued and NOT yet on the bill, in the bill's currency. */
  storageUncharged: number;
  /** For the Edit price dialog. */
  standardRate: number | null;
  appliedRate: number | null;
  cbm: number | null;
  category: string | null;
  /** Has a freight line charged per CBM — the only kind the dialog edits. */
  priced: boolean;
};

export type WaitingBill = {
  invoiceId: string;
  cargo: string;
  description: string;
  claim: string;
};

export type MergeAccount = {
  id: string;
  name: string;
  currency: string;
  kind: "BANK" | "MOBILE_MONEY" | "CASH";
};

/**
 * TWO COLUMNS: WHICH CARGO ON THE LEFT, WHAT ARRIVED ON THE RIGHT.
 *
 * Side by side because the figure being typed and the figure it should match
 * have to be in view at once. Stacked, the clerk ticked bills at the top,
 * scrolled, and typed the amount out of sight of what they had ticked.
 */
export function MergePaymentForm({
  customerId,
  customerName,
  bills,
  waiting,
  accounts,
  combinedBillHref,
  canClear = false,
  canChangeBill = false,
  canChangeRate = false,
  categories = [],
}: {
  customerId: string;
  customerName: string;
  bills: MergeBill[];
  waiting: WaitingBill[];
  accounts: MergeAccount[];
  combinedBillHref: string | null;
  /** May write off a shortfall — the desk that verifies money. */
  canClear?: boolean;
  /** May give a discount or add storage on a bill. */
  canChangeBill?: boolean;
  /** May move the rate the bill was pinned at — the desk that owns the bill. */
  canChangeRate?: boolean;
  /** The rate book's categories, for the Edit price dialog. */
  categories?: { name: string; rate: number }[];
}) {
  /* The bill whose price is being edited, in place — never a trip to the
     invoice and back. */
  const [pricing, setPricing] = useState<MergeBill | null>(null);
  const [state, action] = useActionState<MergeState, FormData>(
    recordCombinedPayment,
    {}
  );

  const canShillings = bills.every(
    (b) => b.currency === "TZS" || (b.rate !== null && b.rate > 1)
  );
  const [pay, setPay] = useState<"TZS" | "USD">(canShillings ? "TZS" : "USD");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [typed, setTyped] = useState<string | null>(null);
  const [transport, setTransport] = useState("");
  const [transportFrom, setTransportFrom] = useState("");
  const [accountId, setAccountId] = useState("");
  const [part, setPart] = useState(false);
  /* One key per payment: a double press lands once. A fresh one after it
     records, for the next handover. */
  const [submitKey, setSubmitKey] = useState(() => crypto.randomUUID());
  useEffect(() => {
    if (state.ok) setSubmitKey(crypto.randomUUID());
  }, [state]);

  /** A bill's figure in the money being handed over, at its own frozen rate. */
  const inPay = (bill: MergeBill, amount = bill.outstanding) => {
    /* The whole balance is known exactly in shillings; converting the dollar
       figure back would be off by the shillings a cent cannot hold. */
    if (amount === bill.outstanding && bill.outstandingTzs !== null && bill.rate) {
      return pay === "TZS"
        ? bill.outstandingTzs
        : Math.ceil((bill.outstandingTzs / bill.rate) * 100) / 100;
    }
    if (bill.currency === pay || !bill.rate) return amount;
    return pay === "TZS"
      ? Math.ceil(amount * bill.rate)
      : Math.ceil((amount / bill.rate) * 100) / 100;
  };

  const money = (n: number, currency: string = pay) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: currency === "TZS" ? 0 : 2,
      maximumFractionDigits: currency === "TZS" ? 0 : 2,
    }).format(n);

  const ticked = bills.filter((b) => picked.has(b.invoiceId));
  const allocated = ticked.reduce((s, b) => s + inPay(b), 0);
  const inBills = ticked.reduce((s, b) => s + b.outstanding, 0);
  const uncharged = ticked.reduce((s, b) => s + inPay(b, b.storageUncharged), 0);

  const cargo = typed !== null ? Number(typed) || 0 : allocated;
  const fare = Number(transport) || 0;
  const received = cargo + fare;
  const gap = cargo - allocated;
  const lastRate = ticked[ticked.length - 1]?.rate ?? null;
  /* Agreeing to clear one figure is not agreeing to clear the next: any change
     to the amount or the ticks takes the agreement back. */
  const [clearArmed, setClearArmed] = useState(false);
  useEffect(() => {
    setClearArmed(false);
  }, [cargo, pay, picked]);

  /* One rate across every bill is worth saying as a figure; several are said
     as a rule, so nobody reads one number as the rate for all of them. */
  const rates = [...new Set(bills.map((b) => b.rate).filter((r) => r && r > 1))];
  const cross = bills.some((b) => b.currency !== pay);

  const toggle = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const accountsHere = useMemo(
    () => accounts.filter((a) => a.currency === pay),
    [accounts, pay]
  );
  const fareAccounts = accountsHere.filter(
    (a) => a.kind === "CASH" || a.kind === "MOBILE_MONEY"
  );

  /* Finance records money; Support hands a claim up. Same form, and the words
     say which of the two is happening. */
  const verb = canClear ? "Record" : "Send to Finance";
  const label = received > 0
    ? ticked.length === 0
      ? `${verb} · ${money(received)} · tick the cargo first`
      : `${verb} · ${money(received)} · ${ticked.length} cargo`
    : `${verb} · tick the cargo it covers`;

  /* One bill ticked: everything done to that bill sits beside the money, the
     way the cargo page has it. */
  const only = ticked.length === 1 ? ticked[0] : null;
  const router = useRouter();
  const [dialog, setDialog] = useState<"discount" | "fx" | null>(null);
  const [addingStorage, startStorage] = useTransition();
  /* Kept against the bill it was said about, so ticking another bill does not
     carry the answer across. Outside the button, because a charge that lands
     takes the button away with it. */
  const [storageSaid, setStorageSaid] = useState<{ invoiceId: string; error?: string; ok?: string } | null>(null);

  return (
    <form
      action={action}
      className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,440px)]"
    >
      {pricing ? (
        <RateDialog
          invoiceId={pricing.invoiceId}
          standardRate={pricing.standardRate}
          appliedRate={pricing.appliedRate}
          cbm={pricing.cbm}
          category={pricing.category}
          categories={categories}
          onClose={() => setPricing(null)}
          onSaved={() => {
            setTyped(null);
            router.refresh();
          }}
        />
      ) : null}
      <input type="hidden" name="customerId" value={customerId} />
      <input type="hidden" name="currency" value={pay} />
      <input type="hidden" name="cargoAmount" value={cargo || ""} />
      <input type="hidden" name="idempotencyKey" value={submitKey} />
      {[...picked].map((id) => (
        <input key={id} type="hidden" name="invoiceIds" value={id} />
      ))}

      {/* LEFT: the job. Which cargo is this customer paying for. */}
      <section className="overflow-hidden rounded-xl border bg-card shadow-soft">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-3">
          <div>
            <h2 className="font-semibold">Which cargo are they paying for?</h2>
            <p className="text-xs text-muted-foreground">
              Tick everything this payment covers.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setPicked(
                picked.size === bills.length
                  ? new Set()
                  : new Set(bills.map((b) => b.invoiceId))
              );
              setTyped(null);
            }}
            className="rounded-full border px-3 py-1.5 text-xs font-semibold hover:bg-secondary"
          >
            {picked.size === bills.length && bills.length > 0 ? "Clear" : "Select all"}
          </button>
        </header>

        {bills.length === 0 ? (
          <p className="px-5 py-6 text-sm text-muted-foreground">
            Nothing here can be paid for right now.
          </p>
        ) : (
          <ul className="divide-y">
            {bills.map((bill) => {
              const on = picked.has(bill.invoiceId);
              return (
                <li key={bill.invoiceId}>
                  {/* The whole row is the target — a 16px box is not a thing
                      to aim at on a counter tablet. */}
                  <label
                    className={cn(
                      "flex cursor-pointer items-center gap-3 px-5 py-3 hover:bg-secondary/40",
                      on && "bg-brand/[0.05]"
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => {
                        toggle(bill.invoiceId);
                        setTyped(null);
                      }}
                      className="size-5 shrink-0 rounded"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {bill.cargo}{" "}
                        <span className="font-normal text-muted-foreground">
                          <Tx>{bill.description}</Tx>
                        </span>
                      </span>
                      <span className="tnum block text-xs text-muted-foreground">
                        {bill.number}
                        {bill.container ? ` · ${bill.container}` : ""}
                      </span>
                      {/* Accrued and NOT in the figure to the right. Said apart,
                          because folding it in would promise a total the
                          payment would then be refused for. */}
                      {bill.storageUncharged > 0.005 ? (
                        <span className="mt-0.5 block text-[11px] font-medium text-warning">
                          + {money(inPay(bill, bill.storageUncharged))} storage,
                          not yet on the bill
                        </span>
                      ) : null}
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="tnum block text-sm font-bold">
                        {money(inPay(bill))}
                      </span>
                      {bill.currency !== pay ? (
                        <span className="tnum block text-[11px] text-muted-foreground">
                          {money(bill.outstanding, bill.currency)}
                        </span>
                      ) : null}
                    </span>
                  </label>
                  {canChangeBill && bill.priced ? (
                    <div className="px-5 pb-3 pl-[3.25rem]">
                      <button
                        type="button"
                        onClick={() => setPricing(bill)}
                        className="inline-flex items-center gap-1 text-xs text-brand hover:underline"
                      >
                        Edit price — category, CBM or rate
                      </button>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}

        {/* Shown, not tickable: a payment is already waiting on Finance for
            these, and taking a second is how a customer pays twice. */}
        {waiting.length > 0 ? (
          <ul className="divide-y border-t bg-secondary/20">
            {waiting.map((w) => (
              <li key={w.invoiceId} className="flex items-center gap-3 px-5 py-3 opacity-80">
                <span className="size-5 shrink-0" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {w.cargo}{" "}
                    <span className="font-normal text-muted-foreground">
                      <Tx>{w.description}</Tx>
                    </span>
                  </span>
                  <span className="block text-[11px] font-medium text-warning">
                    Payment submitted · {w.claim} — waiting for Finance to verify
                  </span>
                </span>
              </li>
            ))}
          </ul>
        ) : null}

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t bg-secondary/20 px-5 py-3">
          <div>
            <p className="text-xs text-muted-foreground">{picked.size} selected</p>
            <p className="tnum text-lg font-bold">{money(allocated)}</p>
            {uncharged > 0.005 ? (
              <p className="text-[11px] font-medium text-warning">
                + {money(uncharged)} storage, not yet on the bill
              </p>
            ) : null}
            {cross && ticked.length > 0 ? (
              <p className="tnum text-xs text-muted-foreground">
                {money(inBills, ticked[0].currency)}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => {
              setPart((v) => !v);
              setTyped(part ? null : typed);
            }}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium shadow-sm transition-colors",
              part
                ? "border-brand/40 bg-brand/10 text-brand"
                : "bg-card hover:bg-secondary"
            )}
          >
            <SlidersHorizontal className="size-3.5" />
            {part ? "Pay them in full" : "They are paying part of a bill"}
          </button>
        </footer>

        {part ? (
          <p className="border-t px-5 py-2 text-xs text-muted-foreground">
            Type what arrived in Cargo charge. The oldest ticked bill is settled
            first; whatever is short stays owing on the last one.
          </p>
        ) : null}

        {combinedBillHref ? (
          <div className="border-t px-5 py-3">
            <a
              href={combinedBillHref}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 text-xs font-medium text-brand hover:underline"
            >
              <FileText className="size-3.5" />
              Download the combined bill for all {bills.length + waiting.length}{" "}
              consignments
            </a>
          </div>
        ) : null}
      </section>

      {/* RIGHT: the money, pre-filled from what was ticked. Sticky so a long
          cargo list does not scroll the button away. */}
      <div className="space-y-4 xl:sticky xl:top-4">
        <section className="space-y-4 rounded-xl border bg-card p-5 shadow-soft">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-semibold">
              {canClear ? `What arrived from ${customerName}` : `What ${customerName.split(" ")[0]} says they sent`}
            </h2>
            {canShillings ? (
              <div className="inline-flex rounded-full border p-0.5">
                {(["TZS", "USD"] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => {
                      setPay(option);
                      /* Every figure just changed unit — a total or fare typed
                         in the old one would now mean something else. */
                      setTyped(null);
                      setTransport("");
                      setTransportFrom("");
                      setAccountId("");
                    }}
                    className={cn(
                      "rounded-full px-3 py-1 text-xs font-semibold transition-colors",
                      pay === option
                        ? "bg-brand text-brand-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    Paid in {option}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          {cross ? (
            <p className="rounded-lg border border-brand/30 bg-brand/5 px-3 py-2 text-xs text-muted-foreground">
              {rates.length === 1
                ? `At ${rates[0]!.toLocaleString()} — the rate on these bills, not today's.`
                : "Each bill converted at the rate frozen onto it when it was raised — not today's."}
            </p>
          ) : null}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="min-w-0 space-y-1.5">
              <Label htmlFor="cargoShown">Cargo charge ({pay})</Label>
              <Input
                id="cargoShown"
                type="number"
                min="0"
                step={pay === "TZS" ? "1" : "0.01"}
                className="h-11"
                value={typed ?? (allocated > 0 ? String(allocated) : "")}
                onChange={(e) =>
                  setTyped(e.target.value === "" ? null : e.target.value)
                }
              />
              {typed !== null ? (
                <p className="text-xs text-muted-foreground">Typed by you.</p>
              ) : null}
            </div>

            <div className="min-w-0 space-y-1.5">
              <Label htmlFor="transport">Transport they added</Label>
              <Input
                id="transport"
                name="transport"
                type="number"
                min="0"
                step={pay === "TZS" ? "1" : "0.01"}
                className="h-11"
                value={transport}
                onChange={(e) => setTransport(e.target.value)}
              />
            </div>

            <div className="min-w-0 space-y-1.5">
              <Label htmlFor="transportAccountId">Transport settled from</Label>
              {/* Greyed until there is a fare — a disabled field is not sent,
                  so nothing is asked for when there is nothing to pay. */}
              <NativeSelect
                id="transportAccountId"
                name="transportAccountId"
                className="h-11 disabled:opacity-50"
                disabled={!(fare > 0)}
                required={fare > 0}
                value={transportFrom}
                onChange={(e) => setTransportFrom(e.target.value)}
              >
                <option value="" disabled>
                  Cash or the Lipa number
                </option>
                {fareAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </NativeSelect>
            </div>

            <div className="min-w-0 space-y-1.5">
              <Label htmlFor="accountId">Where did it land?</Label>
              <NativeSelect
                id="accountId"
                name="accountId"
                className="h-11"
                required
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
              >
                <option value="" disabled>
                  Choose the account
                </option>
                {accountsHere.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </NativeSelect>
            </div>

            {only ? (
              <div className="space-y-2 sm:col-span-2">
                <div className="flex flex-wrap gap-2">
                  <a
                    href={`/app/finance/invoices/${only.invoiceId}`}
                    className="inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-sm font-medium hover:bg-secondary"
                  >
                    <FileText className="size-4" />
                    Open invoice
                  </a>
                  <a
                    href={`/app/finance/invoices/${only.invoiceId}/pdf`}
                    download
                    className="inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-sm font-medium hover:bg-secondary"
                  >
                    <Download className="size-4" />
                    Download
                  </a>
                  {canClear ? (
                    <CreditButton
                      cargoId={only.cargoId}
                      cargoReference={only.cargo}
                      customer={customerName}
                      invoiceNumber={only.number}
                      amountLabel={only.outstandingTzs !== null ? `TZS ${only.outstandingTzs.toLocaleString("en-US")}` : `USD ${only.outstanding.toFixed(2)}`}
                      onCredit={false}
                    />
                  ) : (
                    <AskCreditButton
                      invoiceId={only.invoiceId}
                      invoiceNumber={only.number}
                      cargoReference={only.cargo}
                      customer={customerName}
                      owedLabel={only.outstandingTzs !== null ? `TZS ${only.outstandingTzs.toLocaleString("en-US")}` : `USD ${only.outstanding.toFixed(2)}`}
                    />
                  )}
                </div>
                {canChangeBill ? (
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
                    {only.storageUncharged > 0.005 ? (
                      <button
                        type="button"
                        disabled={addingStorage}
                        onClick={() =>
                          startStorage(async () => {
                            const invoiceId = only.invoiceId;
                            setStorageSaid(null);
                            const f = new FormData();
                            f.set("invoiceId", invoiceId);
                            /* Refused for no rate set, or no permission — the
                               desk has to be told which, or the press looks like
                               it did nothing. A thrown refusal reaches the
                               browser without its words in production. */
                            const result = await chargeStorage({}, f).catch(
                              (): { error?: string; ok?: string } => ({ error: "That did not work." })
                            );
                            setStorageSaid({ invoiceId, error: result.error, ok: result.ok });
                            if (result.ok) {
                              setTyped(null);
                              router.refresh();
                            }
                          })
                        }
                        className="inline-flex items-center gap-1.5 rounded-md border border-warning/40 px-2.5 py-1 text-xs font-medium text-warning hover:bg-warning/10 disabled:opacity-50"
                      >
                        <CircleCheck className="size-3.5" />
                        {addingStorage ? "Adding…" : `Add storage · ${money(inPay(only, only.storageUncharged))}`}
                      </button>
                    ) : null}
                    {storageSaid?.invoiceId === only.invoiceId && (storageSaid.error || storageSaid.ok) ? (
                      <span
                        role={storageSaid.error ? "alert" : "status"}
                        className={cn("text-xs", storageSaid.error ? "text-destructive" : "text-success")}
                      >
                        {storageSaid.error ?? storageSaid.ok}
                      </span>
                    ) : null}
                    <button type="button" onClick={() => setDialog("discount")} className="inline-flex items-center gap-1.5 text-brand hover:underline">
                      <Tag className="size-3.5" />
                      Give a discount
                    </button>
                    {canChangeRate ? (
                      <button type="button" onClick={() => setDialog("fx")} className="inline-flex items-center gap-1.5 text-brand hover:underline">
                        <ArrowLeftRight className="size-3.5" />
                        Change the rate
                      </button>
                    ) : null}
                  </div>
                ) : null}
                {dialog === "discount" ? (
                  <DiscountDialog
                    invoiceId={only.invoiceId}
                    total={only.total}
                    rate={only.rate}
                    onClose={() => setDialog(null)}
                    onSaved={() => {
                      setTyped(null);
                      router.refresh();
                    }}
                  />
                ) : null}
                {dialog === "fx" ? (
                  <ExchangeRateDialog
                    invoiceId={only.invoiceId}
                    total={only.total}
                    current={only.rate}
                    onClose={() => setDialog(null)}
                    onSaved={() => {
                      setTyped(null);
                      router.refresh();
                    }}
                  />
                ) : null}
              </div>
            ) : null}

            <label className="flex min-w-0 cursor-pointer items-center gap-3 rounded-lg border border-warning/40 bg-warning/[0.06] px-3 py-2.5 text-sm sm:col-span-2">
              <Paperclip className="size-4 shrink-0 text-warning" />
              <span className="font-medium text-warning">Proof</span>
              <input
                type="file"
                name="proof"
                accept="image/*,application/pdf"
                className="min-w-0 flex-1 text-xs file:mr-3 file:rounded file:border-0 file:bg-warning/15 file:px-2.5 file:py-1 file:text-xs file:font-medium file:text-warning"
              />
            </label>
          </div>

          {fare > 0 ? (
            <dl className="tnum space-y-1 rounded-lg border px-3 py-2 text-xs">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Cargo charge</dt>
                <dd>{money(cargo)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Transport they added</dt>
                <dd>{money(fare)}</dd>
              </div>
              <div className="flex justify-between border-t pt-1 font-semibold">
                <dt>They sent</dt>
                <dd>{money(received)}</dd>
              </div>
            </dl>
          ) : null}

          {ticked.length > 0 && gap > (pay === "TZS" ? 0 : 0.001) ? (
            <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm">
              That is {money(gap)} more than the ticked bills owe. Tick the other bill, or correct the figure.
            </div>
          ) : null}
          {ticked.length > 0 && cargo > 0 && gap < -(pay === "TZS" ? 0 : 0.001) ? (
            <ShortfallNotice
              gapTzs={pay === "TZS" ? -gap : lastRate ? Math.round(-gap * lastRate) : 0}
              gapUsd={pay === "USD" ? -gap : lastRate ? Math.round((-gap / lastRate) * 100) / 100 : null}
              canClear
              decides={canClear}
              armed={clearArmed}
              onArmedChange={setClearArmed}
              billNumber={ticked[ticked.length - 1]?.number}
            />
          ) : null}

          <FormMessage error={state.error} ok={state.ok} />
        </section>

        <SubmitButton
          className="h-11 w-full"
          disabled={ticked.length === 0 || cargo <= 0 || gap > (pay === "TZS" ? 0 : 0.001)}
        >
          <Banknote className="mr-2 size-4" />
          {label}
        </SubmitButton>
      </div>
    </form>
  );
}
