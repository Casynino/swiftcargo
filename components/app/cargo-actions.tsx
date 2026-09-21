"use client";

import { useActionState, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  ArrowLeftRight,
  Ban,
  CalendarDays,
  FileText,
  Paperclip,
  Printer,
  QrCode,
  Scale,
  Tag,
  Wallet,
} from "lucide-react";

import { recordCombinedPayment, type MergeState } from "@/lib/actions/merge";
import { issuePickupNote } from "@/lib/actions/pickup-notes";
import { verifyPayment } from "@/lib/actions/payments";
import {
  CreditButton,
  DiscountDialog,
  ExchangeRateDialog,
  RateDialog,
} from "@/components/app/bill-dialogs";
import { AskCreditButton } from "@/components/app/ask-for-credit";
import { GenerateInvoiceButton } from "@/components/app/finance-forms";
import { FormMessage } from "@/components/app/form-message";
import { ShortfallNotice } from "@/components/app/shortfall-notice";
import { SubmitButton } from "@/components/app/submit-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { cn } from "@/lib/utils";

import { useT } from "@/components/app/locale-provider";
export type CargoBill = {
  id: string;
  number: string;
  status: string;
  /** Dollars, as the bill is written. */
  total: number;
  outstanding: number;
  /** Whole shillings. Null only on a dollar bill with no rate. */
  outstandingTzs: number | null;
  rate: number | null;
  standardRate: number | null;
  appliedRate: number | null;
  cbm: number | null;
  /** The cargo's category when the bill has one freight line; undefined when
      the bill has several and is changed line by line on the bill. */
  category?: string | null;
  /** A payment already waiting on Finance for this bill. */
  pending: boolean;
  /** Which one, so Finance can confirm it where it stands. */
  pendingPaymentId?: string | null;
  /** Asked for with the waiting payment: written off if it is confirmed. */
  pendingClearing?: string | null;
};

export type CargoAccount = {
  id: string;
  name: string;
  currency: string;
  kind: "BANK" | "MOBILE_MONEY" | "CASH";
};

type Props = {
  cargoId: string;
  cargoReference: string;
  customerId: string;
  customerName: string;
  /** Composed on the server; null when there is no number to message. */
  notify: ReactNode;
  bill: CargoBill | null;
  /** "No storage fee · 5 free days left" — the storage question, in a line. */
  storageLine: string | null;
  accounts: CargoAccount[];
  canPay: boolean;
  /** Finance: confirms the payment, releases on credit, issues the note. */
  canDecide: boolean;
  canChangeBill: boolean;
  /** The rate pinned on a bill belongs to the desk that owns the bill, not to
      every desk that quotes it: moving it moves what is owed in shillings. */
  canChangeRate: boolean;
  /** The rate book's categories, for the price dialog. */
  categories?: { name: string; rate: number }[];
  canOpenBill: boolean;
  atDar: boolean;
  /**
   * Counted at Dar with no container on record, unbilled, and the viewer may
   * raise a bill. Such cargo never appears in a container's pricing, so its
   * bill is raised from here or not at all.
   */
  raiseBill?: boolean;
  pickupNote: { id: string; number: string; status: string; onCredit: boolean } | null;
};

const fmt = (n: number, currency: string) =>
  `${currency} ${n.toLocaleString("en-US", {
    minimumFractionDigits: currency === "TZS" ? 0 : 2,
    maximumFractionDigits: currency === "TZS" ? 0 : 2,
  })}`;

/**
 * EVERYTHING DONE WITH THIS CONSIGNMENT, IN ONE PANEL.
 *
 * Tell the customer, take the money (or release it on credit), hand over the
 * bill, write the pickup note — in the order they happen, each block shown by
 * permission, so every desk reading the page is looking at the same column.
 */
export function CargoActions(props: Props) {
  const tx = useT();
  const { bill } = props;
  const settled = bill ? bill.outstanding <= 0 && (bill.outstandingTzs ?? 0) <= 0 : false;
  const payable = bill && bill.status !== "DRAFT" && bill.status !== "CANCELLED";

  return (
    <section className="overflow-hidden rounded-xl border bg-card shadow-soft">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
        <h2 className="text-sm font-semibold">{tx("Actions")}</h2>
        {props.notify}
      </div>
      <div className="divide-y">
        {payable && props.canPay ? <PaymentPanel {...props} bill={bill!} settled={settled} /> : null}
        {props.canOpenBill ? <BillPanel bill={bill} atDar={props.atDar} cargoId={props.cargoId} raiseBill={props.raiseBill ?? false} /> : null}
        <PickupPanel {...props} settled={settled} />
      </div>
    </section>
  );
}

function PaymentPanel(props: Props & { bill: CargoBill; settled: boolean }) {
  const tx = useT();
  const { bill } = props;
  const [state, action] = useActionState<MergeState, FormData>(recordCombinedPayment, {});
  const [key, setKey] = useState(() => crypto.randomUUID());
  const [open, setOpen] = useState(true);
  const [currency, setCurrency] = useState<"TZS" | "USD">(bill.outstandingTzs !== null ? "TZS" : "USD");
  const [typed, setTyped] = useState<string | null>(null);
  const [transport, setTransport] = useState("");
  const [transportFrom, setTransportFrom] = useState("");
  const [accountId, setAccountId] = useState("");
  const [dated, setDated] = useState(false);
  const [acceptOver, setAcceptOver] = useState(false);
  const [clearArmed, setClearArmed] = useState(false);
  const [dialog, setDialog] = useState<"discount" | "rate" | "fx" | null>(null);

  useEffect(() => {
    if (state.ok) {
      setKey(crypto.randomUUID());
      setTyped(null);
      setTransport("");
      setAcceptOver(false);
    }
  }, [state]);

  const rate = bill.rate;
  const owed =
    currency === "TZS"
      ? (bill.outstandingTzs ?? 0)
      : bill.outstandingTzs !== null && rate
        ? Math.ceil((bill.outstandingTzs / rate) * 100) / 100
        : bill.outstanding;
  const shown = typed ?? (owed > 0 ? String(owed) : "");
  const cargo = Number(shown.replace(/,/g, "")) || 0;
  const fare = Number(transport) || 0;
  const over = cargo > owed;
  useEffect(() => {
    setClearArmed(false);
  }, [cargo, currency]);
  const eligible = props.accounts.filter((a) => a.currency === currency);
  const fareAccounts = eligible.filter((a) => a.kind !== "BANK");

  const owedBoth =
    bill.outstandingTzs !== null
      ? `USD ${bill.outstanding.toFixed(2)} · TZS ${bill.outstandingTzs.toLocaleString("en-US")}`
      : fmt(bill.outstanding, "USD");

  const settles =
    rate && cargo > 0
      ? currency === "TZS"
        ? `TZS ${cargo.toLocaleString("en-US")} settles USD ${(cargo / rate).toFixed(2)} at ${rate.toLocaleString("en-US")}.`
        : `USD ${cargo.toFixed(2)} settles TZS ${Math.round((Math.round(cargo * 100) * rate) / 100).toLocaleString("en-US")} at ${rate.toLocaleString("en-US")}.`
      : null;

  const corrections = props.canChangeBill ? (
    <>
      <button type="button" onClick={() => setDialog("discount")} className="flex items-center gap-1.5 text-xs text-brand hover:underline">
        <Tag className="size-3.5" />
        {tx("Give a discount")}
      </button>
      {bill.cbm ? (
        <button type="button" onClick={() => setDialog("rate")} className="flex items-center gap-1.5 text-xs text-brand hover:underline">
          <Scale className="size-3.5" />
          {tx("Edit price — category, CBM or rate")}
        </button>
      ) : null}
    </>
  ) : null;

  const dialogs = (
    <>
      {dialog === "discount" ? (
        <DiscountDialog invoiceId={bill.id} total={bill.total} rate={rate} onClose={() => setDialog(null)} onSaved={() => setTyped(null)} />
      ) : null}
      {dialog === "rate" ? (
        <RateDialog
          invoiceId={bill.id}
          standardRate={bill.standardRate}
          appliedRate={bill.appliedRate}
          cbm={bill.cbm}
          category={bill.category}
          categories={props.categories}
          onClose={() => setDialog(null)}
          onSaved={() => setTyped(null)}
        />
      ) : null}
      {dialog === "fx" ? (
        <ExchangeRateDialog invoiceId={bill.id} total={bill.total} current={rate} onClose={() => setDialog(null)} onSaved={() => setTyped(null)} />
      ) : null}
    </>
  );

  return (
    <div className="border-l-2 border-brand px-4 py-3.5">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-2 text-left font-medium">
        <Wallet className={props.settled ? "size-4 text-success" : "size-5 text-brand"} />
        <span className={props.settled ? "text-sm" : "text-base"}>
          {props.settled ? "Settled in full" : "Record payment"}
        </span>
        {!props.settled ? (
          <span className="tnum ml-auto text-right font-mono text-sm text-brand">{owedBoth}</span>
        ) : null}
      </button>

      {open && props.settled ? (
        <div className="mt-3 space-y-2 border-t pt-3">
          <p className="text-xs text-muted-foreground">
            {tx("This bill is settled. These change the bill itself — use them to correct a price or a rate that was wrong.")}
          </p>
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {corrections}
            {props.canChangeRate ? (
              <button type="button" onClick={() => setDialog("fx")} className="flex items-center gap-1.5 text-xs text-brand hover:underline">
                <ArrowLeftRight className="size-3.5" />
                {tx("Change the rate")}
              </button>
            ) : null}
          </div>
          {dialogs}
        </div>
      ) : null}

      {open && !props.settled ? (
        bill.pending ? (
          <div className="mt-3 space-y-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning">
            <p>
              {props.canDecide
                ? "Support recorded a payment on this bill that is waiting for you. Confirm it here if the money is in, or open the queue to send it back."
                : "A payment for this bill is already waiting for Finance."}{" "}
              <Link href="/app/finance/collections/verify" className="font-semibold underline underline-offset-2">
                {tx("Open Verify payments")}
              </Link>
            </p>
            {bill.pendingClearing ? (
              <p className="font-semibold">
                {props.canDecide
                  ? `Confirming it also clears ${bill.pendingClearing} left short.`
                  : `Finance has been asked to clear ${bill.pendingClearing} left short.`}
              </p>
            ) : null}
            {props.canDecide && bill.pendingPaymentId ? (
              <ConfirmWaiting paymentId={bill.pendingPaymentId} />
            ) : null}
          </div>
        ) : (
          <form action={action} className="mt-4 space-y-3">
            <input type="hidden" name="customerId" value={props.customerId} />
            <input type="hidden" name="invoiceIds" value={bill.id} />
            <input type="hidden" name="currency" value={currency} />
            <input type="hidden" name="cargoAmount" value={cargo || ""} />
            <input type="hidden" name="idempotencyKey" value={key} />

            <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">{tx("Cargo charge")}</Label>
                <Input
                  inputMode="decimal"
                  required
                  value={shown}
                  onChange={(e) => setTyped(e.target.value === "" ? null : e.target.value)}
                  className="tnum h-10 font-mono text-base"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">{tx("Paid in")}</Label>
                <NativeSelect
                  value={currency}
                  onChange={(e) => {
                    setCurrency(e.target.value as "TZS" | "USD");
                    setTyped(null);
                    setTransport("");
                    setTransportFrom("");
                    setAccountId("");
                  }}
                  className="h-10 w-24"
                >
                  {bill.outstandingTzs !== null ? <option value="TZS">TZS</option> : null}
                  <option value="USD">USD</option>
                </NativeSelect>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">{tx("Transport they added")}</Label>
                <Input
                  name="transport"
                  inputMode="decimal"
                  placeholder="0"
                  value={transport}
                  onChange={(e) => setTransport(e.target.value)}
                  className="tnum h-10 font-mono"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">{tx("Transport settled from")}</Label>
                <NativeSelect
                  name="transportAccountId"
                  required={fare > 0}
                  disabled={!(fare > 0)}
                  value={transportFrom}
                  onChange={(e) => setTransportFrom(e.target.value)}
                  className="h-10 disabled:opacity-50"
                >
                  <option value="" disabled>
                    {tx("Cash or the Lipa number")}
                  </option>
                  {fareAccounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </NativeSelect>
              </div>
            </div>

            <div className="space-y-2.5">
              {corrections}
              {props.storageLine ? (
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Ban className="size-3.5" />
                  {props.storageLine}
                </p>
              ) : null}
            </div>

            {settles ? (
              <p className="tnum rounded-md border bg-secondary/30 px-3 py-2 text-xs text-muted-foreground">{settles}</p>
            ) : null}

            {props.canChangeRate ? (
              <button type="button" onClick={() => setDialog("fx")} className="flex items-center gap-1.5 text-xs text-brand hover:underline">
                <ArrowLeftRight className="size-3.5" />
                {tx("Change the rate")}
              </button>
            ) : null}

            {over ? (
              <div className="space-y-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs">
                <p>
                  That is {fmt(cargo - owed, currency)} more than {bill.number} owes. If the transport is inside it,
                  put the transport in its own box.
                </p>
                <label className="flex items-center gap-2">
                  <input type="checkbox" name="allowOverpayment" checked={acceptOver} onChange={(e) => setAcceptOver(e.target.checked)} className="size-4" />
                  {tx("Accept overpayment — the extra stays on the bill as a credit")}
                </label>
                {acceptOver ? <Input name="overpaymentReason" required minLength={3} placeholder={tx("Why the extra is being accepted")} className="h-9" /> : null}
              </div>
            ) : cargo > 0 && cargo < owed ? (
              <ShortfallNotice
                gapTzs={
                  bill.outstandingTzs === null
                    ? 0
                    : currency === "USD" && rate
                      ? Math.max(0, bill.outstandingTzs - Math.round((Math.round(cargo * 100) * rate) / 100))
                      : Math.max(0, bill.outstandingTzs - cargo)
                }
                gapUsd={
                  currency === "USD"
                    ? Math.round((owed - cargo) * 100) / 100
                    : rate
                      ? Math.round(((owed - cargo) / rate) * 100) / 100
                      : null
                }
                canClear
                decides={props.canDecide}
                armed={clearArmed}
                onArmedChange={setClearArmed}
                billNumber={bill.number}
              />
            ) : null}

            {eligible.length > 0 ? (
              <div className="space-y-1.5">
                <Label className="text-xs">{tx("Landed in")}</Label>
                <NativeSelect name="accountId" required value={accountId} onChange={(e) => setAccountId(e.target.value)} className="h-10">
                  <option value="" disabled>
                    {tx("Choose the account")}
                  </option>
                  {eligible.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </NativeSelect>
              </div>
            ) : (
              <p className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning">
                No open account can hold {currency}. Switch the money above, or open an account for it first.
              </p>
            )}

            <label className="flex cursor-pointer items-center gap-2 rounded-md border border-warning/40 bg-warning/[0.06] px-3 py-2 text-xs">
              <Paperclip className="size-3.5 text-warning" />
              <span className="font-medium text-warning">{tx("Proof")}</span>
              <input
                type="file"
                name="proof"
                accept="image/*,application/pdf"
                className="min-w-0 flex-1 text-[11px] file:mr-2 file:rounded file:border-0 file:bg-warning/15 file:px-2 file:py-0.5 file:text-warning"
              />
            </label>

            {/* No date to type: the payment is dated the moment it is
                recorded, and every later change keeps its own time. */}
            <FormMessage error={state.error} ok={state.ok} />
            <div className="flex flex-wrap items-center gap-2">
              <SubmitButton size="sm" pendingLabel={tx("Recording…")} disabled={cargo <= 0 || (over && !acceptOver)}>
                {props.canDecide ? "Confirm payment" : "Submit to Finance"}
              </SubmitButton>
              {props.canDecide ? (
                <CreditButton
                  cargoId={props.cargoId}
                  cargoReference={props.cargoReference}
                  customer={props.customerName}
                  invoiceNumber={bill.number}
                  amountLabel={bill.outstandingTzs !== null ? fmt(bill.outstandingTzs, "TZS") : fmt(bill.outstanding, "USD")}
                  onCredit={Boolean(props.pickupNote?.onCredit)}
                />
              ) : (
                <AskCreditButton
                  invoiceId={bill.id}
                  invoiceNumber={bill.number}
                  cargoReference={props.cargoReference}
                  customer={props.customerName}
                  owedLabel={bill.outstandingTzs !== null ? fmt(bill.outstandingTzs, "TZS") : fmt(bill.outstanding, "USD")}
                />
              )}
            </div>
            <p className="text-[11px] text-muted-foreground">
              {props.canDecide
                ? "It counts against the bill straight away, and the receipt is issued."
                : "Nothing is settled until Finance verifies it. No money moves on this screen."}
            </p>
            {dialogs}
          </form>
        )
      ) : null}
    </div>
  );
}

function BillPanel({
  bill,
  atDar,
  cargoId,
  raiseBill,
}: {
  bill: CargoBill | null;
  atDar: boolean;
  cargoId: string;
  raiseBill: boolean;
}) {
  const tx = useT();
  if (!bill && raiseBill) {
    return (
      <div className="px-4 py-3.5">
        <p className="flex items-center gap-2 text-sm font-medium">
          <FileText className="size-4 text-muted-foreground" />
          {tx("Waiting for price confirmation")}
        </p>
        <p className="mt-0.5 mb-2.5 text-xs text-muted-foreground">
          {tx("No container is on record for this consignment, so its bill is raised here from the rate book and confirmed on the invoice.")}
        </p>
        <GenerateInvoiceButton cargoId={cargoId} />
      </div>
    );
  }
  if (!bill) {
    return (
      <div className="px-4 py-3.5">
        <p className="flex items-center gap-2 text-sm font-medium">
          <FileText className="size-4 text-muted-foreground" />
          {atDar ? "Waiting for price confirmation" : "Priced once it lands"}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {atDar
            ? "Finance confirms the price on the arrived container, and the bill appears here."
            : "The bill is raised from the volume Dar counts off the container."}
        </p>
      </div>
    );
  }
  const confirmed = bill.status !== "DRAFT";
  return (
    <div className="px-4 py-3.5">
      <p className="flex items-center gap-2 text-sm font-medium">
        <FileText className="size-4 text-brand" />
        {tx("The bill (invoice)")}
      </p>
      <div className="mt-2.5 flex flex-wrap gap-2">
        {confirmed ? (
          <Button asChild size="sm" className="px-2.5">
            <a href={`/app/finance/invoices/${bill.id}/pdf`} download>
              {tx("Download")}
            </a>
          </Button>
        ) : null}
        <Button asChild size="sm" variant="outline" className="gap-1.5 px-2.5">
          <Link href={`/app/finance/invoices/${bill.id}`}>
            <FileText className="size-3.5" />
            {tx("Open invoice")}
          </Link>
        </Button>
      </div>
    </div>
  );
}

function PickupPanel(props: Props & { settled: boolean }) {
  const tx = useT();
  const [state, action] = useActionState<{ error?: string; ok?: string }, FormData>(issuePickupNote, {});
  const note = props.pickupNote;

  if (note && note.status !== "CANCELLED") {
    return (
      <div className="px-4 py-3.5">
        <p className="flex items-center gap-2 text-sm font-medium">
          <QrCode className="size-4 text-success" />
          Pickup note {note.number}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {note.status === "USED"
            ? "Used — cargo collected."
            : note.onCredit
              ? "Released on credit — the customer can collect; the bill is still owed."
              : "Active — the customer can collect."}
        </p>
        <div className="mt-2.5 flex flex-wrap gap-2">
          <Button asChild size="sm" variant="outline">
            <Link href={`/app/finance/pickup-notes/${note.id}`}>
              <Printer />
              Open & print
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  if (!props.canDecide) {
    return (
      <div className="px-4 py-3.5">
        <p className="flex items-center gap-2 text-sm font-medium">
          <QrCode className="size-4 text-muted-foreground" />
          {tx("No pickup note yet")}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">{tx("Appears once the bill is settled.")}</p>
      </div>
    );
  }

  const blocked = !props.atDar || !props.bill || !props.settled;
  return (
    <div className="px-4 py-3.5">
      <form action={action} className="space-y-2">
        <input type="hidden" name="cargoId" value={props.cargoId} />
        <p className="flex items-center gap-2 text-sm font-medium">
          <QrCode className={cn("size-4", blocked ? "text-muted-foreground" : "text-brand")} />
          {tx("Issue pickup note")}
        </p>
        <p className="text-xs text-muted-foreground">
          {blocked
            ? "Needs the cargo at Dar and the bill settled."
            : "This clears the cargo for release and tells the warehouse."}
        </p>
        <FormMessage error={state.error} ok={state.ok} />
        <SubmitButton size="sm" className="px-2.5" disabled={blocked} pendingLabel={tx("Issuing…")}>
          {tx("Issue pickup note")}
        </SubmitButton>
      </form>
    </div>
  );
}

/** Finance confirming the claim Support left on this bill, without leaving the page. */
function ConfirmWaiting({ paymentId }: { paymentId: string }) {
  const tx = useT();
  const [state, action] = useActionState(verifyPayment, {});
  return (
    <form action={action} className="space-y-1.5">
      <input type="hidden" name="paymentId" value={paymentId} />
      <SubmitButton size="sm" pendingLabel={tx("Confirming…")}>
        {tx("Confirm this payment")}
      </SubmitButton>
      <FormMessage error={state.error} ok={state.ok} />
    </form>
  );
}
