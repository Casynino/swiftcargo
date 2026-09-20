"use client";

import { useActionState, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowLeftRight,
  Banknote,
  CalendarClock,
  Clock,
  Download,
  Scale,
  Tag,
} from "lucide-react";

import { changeInvoiceRate, discountInvoice, repriceInvoice } from "@/lib/actions/invoices";
import { issuePickupNote } from "@/lib/actions/pickup-notes";
import { FormMessage } from "@/components/app/form-message";
import { SubmitButton } from "@/components/app/submit-button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { cn } from "@/lib/utils";

import { useT } from "@/components/app/locale-provider";
type State = { error?: string; ok?: string };

const SQUARE =
  "relative inline-flex size-9 items-center justify-center rounded-md border transition-colors";

const usd = (n: number) =>
  `USD ${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/*
  PORTALLED TO THE BODY.

  The triggers sit inside table cells and inside the Record Payment form. A
  dialog rendered in place would be clipped by the table, and a form inside a
  form is dropped by the browser with its fields handed to the outer submit.
*/
function Shell({
  onClose,
  children,
  className,
}: {
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 p-4 sm:items-center"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          "max-h-[90dvh] w-full max-w-sm overflow-y-auto overscroll-contain rounded-xl border bg-card p-4 text-left shadow-lg",
          className
        )}
      >
        {children}
      </div>
    </div>,
    document.body
  );
}

function useCloseOnOk(state: State, close: () => void, onSaved?: () => void) {
  useEffect(() => {
    if (state.ok) {
      close();
      onSaved?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);
}

/**
 * THE RATE FOR THIS CARGO, CHANGED WITHOUT LEAVING THE ROW.
 *
 * The book's rate and the one on the bill are both named before anything is
 * typed, and the arithmetic is shown, so nobody multiplies 1.29 m³ by a rate in
 * their head to check the bill.
 */
export function RateDialog({
  invoiceId,
  standardRate,
  appliedRate,
  cbm,
  category,
  categories,
  onClose,
  onSaved,
}: {
  invoiceId: string;
  standardRate: number | null;
  appliedRate: number | null;
  cbm: number | null;
  /** The bill's category, when it has one freight line — then category and
      volume can be changed here too. */
  category?: string | null;
  /** The rate book's categories and their rate per CBM. */
  categories?: { name: string; rate: number }[];
  onClose: () => void;
  onSaved?: () => void;
}) {
  const tx = useT();
  const [state, action] = useActionState<State, FormData>(repriceInvoice, {});
  const [typed, setTyped] = useState(appliedRate !== null ? appliedRate.toFixed(2) : "");
  const [picked, setPicked] = useState(category ?? "");
  const [volume, setVolume] = useState(cbm !== null ? cbm.toFixed(3) : "");
  useCloseOnOk(state, onClose, onSaved);

  const editable = category !== undefined && (categories?.length ?? 0) > 0;
  /* The book's rate for whatever category is picked now. */
  const book = editable
    ? (categories!.find((c) => c.name === picked)?.rate ?? standardRate)
    : standardRate;
  const special =
    standardRate !== null && appliedRate !== null && Math.abs(standardRate - appliedRate) > 0.005;
  const rate = Number(typed);
  const qty = editable ? Number(volume) : cbm;
  const freight = qty && rate > 0 ? Math.round(rate * qty * 100) / 100 : null;
  const off = book !== null && rate > 0 ? Math.round((book - rate) * 100) / 100 : null;

  return (
    <Shell onClose={onClose}>
      <form action={action} className="space-y-3">
        <input type="hidden" name="invoiceId" value={invoiceId} />
        <p className="flex items-center gap-1.5 text-sm font-semibold">
          <Scale className="size-4 text-brand" />
          {tx("Edit price")}
        </p>
        <dl className="space-y-1 rounded-lg border bg-secondary/40 px-3 py-2 text-xs">
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">{tx("Standard rate")}</dt>
            <dd className="tnum font-medium">{standardRate !== null ? `${usd(standardRate)} per CBM` : "not recorded"}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">{tx("Current rate")}</dt>
            <dd className="tnum font-medium">{appliedRate !== null ? `${usd(appliedRate)} per CBM` : "not recorded"}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">{tx("Special rate")}</dt>
            <dd className={special ? "font-semibold text-brand" : "text-muted-foreground"}>{special ? "Yes" : "No"}</dd>
          </div>
        </dl>
        {editable ? (
          <div className="grid grid-cols-2 gap-2">
            <label className="block space-y-1">
              <span className="text-[11px] uppercase tracking-wide text-muted-foreground">{tx("Category")}</span>
              <NativeSelect
                name="category"
                value={picked}
                onChange={(e) => {
                  setPicked(e.target.value);
                  /* A new category brings its own book rate; the desk can
                     still type an agreed one over it. */
                  const next = categories!.find((c) => c.name === e.target.value);
                  if (next) setTyped(next.rate.toFixed(2));
                }}
                className="h-9"
              >
                {!picked ? <option value="">— none —</option> : null}
                {categories!.map((c) => (
                  <option key={c.name} value={c.name}>
                    {c.name} · {usd(c.rate)}
                  </option>
                ))}
                {picked && !categories!.some((c) => c.name === picked) ? (
                  <option value={picked}>{picked}</option>
                ) : null}
              </NativeSelect>
            </label>
            <label className="block space-y-1">
              <span className="text-[11px] uppercase tracking-wide text-muted-foreground">{tx("Total CBM")}</span>
              <Input
                name="cbm"
                type="number"
                step="0.001"
                min={0.001}
                value={volume}
                onChange={(e) => setVolume(e.target.value)}
                className="tnum h-9"
              />
            </label>
          </div>
        ) : null}
        <label className="block space-y-1">
          <span className="text-[11px] uppercase tracking-wide text-muted-foreground">{tx("Rate per CBM")}</span>
          <span className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">USD</span>
            <Input
              name="rate"
              type="number"
              step="0.01"
              min={0}
              required
              autoFocus
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              className="tnum h-9"
            />
          </span>
        </label>
        {freight !== null ? (
          <p className="tnum text-xs text-muted-foreground">
            {rate.toFixed(2)} × {Number(qty).toFixed(3)} CBM ={" "}
            <span className="font-semibold text-foreground">{usd(freight)}</span>
            {off !== null && Math.abs(off) > 0.005 ? (
              <span className={off > 0 ? "text-success" : "text-warning"}>
                {" · "}
                {off > 0 ? "−" : "+"}
                {usd(Math.abs(off))} per CBM against the book
              </span>
            ) : null}
          </p>
        ) : null}
        <FormMessage error={state.error} />
        <div className="flex items-center gap-2">
          <SubmitButton size="sm" pendingLabel="Saving…">{tx("Save price")}</SubmitButton>
          <button type="button" onClick={onClose} className="text-xs text-muted-foreground hover:text-foreground">
            {tx("Cancel")}
          </button>
        </div>
      </form>
    </Shell>
  );
}

/** Take something off the bill. Appended as its own line, never an edit. */
export function DiscountDialog({
  invoiceId,
  total,
  rate,
  onClose,
  onSaved,
}: {
  invoiceId: string;
  /** The bill in dollars. */
  total: number;
  /** The bill's own rate, so a shilling discount can be shown in dollars. */
  rate?: number | null;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const tx = useT();
  const [state, action] = useActionState<State, FormData>(discountInvoice, {});
  const [currency, setCurrency] = useState<"TZS" | "USD">(rate ? "TZS" : "USD");
  const [typed, setTyped] = useState("");
  useCloseOnOk(state, onClose, onSaved);
  const n = Number(typed) || 0;
  const inUsd = currency === "USD" ? n : rate ? n / rate : 0;
  return (
    <Shell onClose={onClose}>
      <form action={action} className="space-y-3">
        <input type="hidden" name="invoiceId" value={invoiceId} />
        <input type="hidden" name="currency" value={currency} />
        <p className="flex items-center gap-1.5 text-sm font-semibold">
          <Tag className="size-4 text-brand" />
          {tx("Give a discount")}
        </p>
        <div className="flex items-center gap-2">
          <div className="inline-flex shrink-0 rounded-md border p-0.5 text-xs">
            {(rate ? (["TZS", "USD"] as const) : (["USD"] as const)).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCurrency(c)}
                className={cn(
                  "rounded px-2 py-1 font-medium",
                  currency === c ? "bg-brand text-brand-foreground" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {c === "TZS" ? "TSh" : "USD"}
              </button>
            ))}
          </div>
          <Input
            name="amount"
            type="number"
            step={currency === "TZS" ? 1 : 0.01}
            min={0}
            required
            autoFocus
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder="0"
            className="tnum h-9"
          />
        </div>
        {n > 0 ? (
          <p className="tnum text-xs text-muted-foreground">
            {currency === "TZS" ? `≈ ${usd(inUsd)} off` : rate ? `≈ TZS ${Math.round(n * rate).toLocaleString("en-US")} off` : ""}
            {" · "}the bill is {usd(total)}
          </p>
        ) : null}
        <Input name="reason" placeholder={tx("Why — agreed with the customer, damaged goods…")} className="h-9" />
        <FormMessage error={state.error} />
        <div className="flex items-center gap-2">
          <SubmitButton size="sm" pendingLabel="Saving…">{tx("Apply")}</SubmitButton>
          <button type="button" onClick={onClose} className="text-xs text-muted-foreground hover:text-foreground">
            {tx("Cancel")}
          </button>
        </div>
      </form>
    </Shell>
  );
}

/**
 * THE EXCHANGE RATE ON THIS BILL ONLY.
 *
 * The dollar total does not move — only what it comes to in shillings. The sum
 * is shown before it is saved.
 */
export function ExchangeRateDialog({
  invoiceId,
  total,
  current,
  onClose,
  onSaved,
}: {
  invoiceId: string;
  total: number;
  current: number | null;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const tx = useT();
  const [state, action] = useActionState<State, FormData>(changeInvoiceRate, {});
  const [typed, setTyped] = useState(current ? String(current) : "");
  useCloseOnOk(state, onClose, onSaved);
  const rate = Number(typed.replace(/,/g, "")) || 0;
  return (
    <Shell onClose={onClose}>
      <form action={action} className="space-y-3">
        <input type="hidden" name="invoiceId" value={invoiceId} />
        <p className="flex items-center gap-1.5 text-sm font-semibold">
          <ArrowLeftRight className="size-4 text-brand" />
          {tx("Change the rate")}
        </p>
        <p className="text-xs text-muted-foreground">
          {tx("This bill only. The dollar total does not move — only what it comes to in shillings.")}
        </p>
        <label className="flex items-center gap-2">
          <span className="shrink-0 text-xs text-muted-foreground">USD 1 =</span>
          <Input
            name="rate"
            inputMode="decimal"
            required
            autoFocus
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            className="tnum h-9"
          />
        </label>
        {rate > 0 ? (
          <p className="tnum rounded-md border bg-secondary/40 px-3 py-2 text-xs">
            {usd(total)} = TZS {Math.round((Math.round(total * 100) * rate) / 100).toLocaleString("en-US")}
          </p>
        ) : null}
        <Input name="note" placeholder={tx("Note (optional) — agreed at the counter, bank rate on the day…")} className="h-9" />
        <FormMessage error={state.error} />
        <div className="flex items-center gap-2">
          <SubmitButton size="sm" pendingLabel="Saving…">{tx("Save")}</SubmitButton>
          <button type="button" onClick={onClose} className="text-xs text-muted-foreground hover:text-foreground">
            {tx("Cancel")}
          </button>
        </div>
      </form>
    </Shell>
  );
}

/* ------------------------------------------------------------ row icons */

export function RateIcon(props: {
  invoiceId: string;
  standardRate: number | null;
  appliedRate: number | null;
  cbm: number | null;
  category?: string | null;
  categories?: { name: string; rate: number }[];
}) {
  const tx = useT();
  const [open, setOpen] = useState(false);
  const special =
    props.standardRate !== null &&
    props.appliedRate !== null &&
    Math.abs(props.standardRate - props.appliedRate) > 0.005;
  return (
    <>
      <button
        type="button"
        title={tx("Edit price — category, CBM or rate")}
        onClick={() => setOpen(true)}
        className={cn(
          SQUARE,
          special
            ? "border-brand bg-brand/15 text-brand hover:bg-brand/25"
            : "border-brand/40 text-brand hover:bg-brand/10"
        )}
      >
        <Scale className="size-4" />
        <span className="sr-only">{tx("Edit the rate")}</span>
      </button>
      {open ? <RateDialog {...props} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

/** Opens Record Payment on this very bill — the form comes to the row. */
export function PaymentIcon({ invoiceId }: { invoiceId: string }) {
  const tx = useT();
  return (
    <button
      type="button"
      title={tx("Record a payment")}
      /* The same event the dialog listens for; imported by name it would make
         the dialog and these dialogs import each other. */
      onClick={() =>
        window.dispatchEvent(new CustomEvent("record-payment:open", { detail: { invoiceId } }))
      }
      className={cn(SQUARE, "border-brand/40 text-brand hover:bg-brand/10")}
    >
      <Banknote className="size-4" />
      <span className="sr-only">{tx("Record a payment")}</span>
    </button>
  );
}

const TERMS = [7, 14, 30, 60] as const;

/**
 * RELEASE ON CREDIT.
 *
 * The customer asks to take the cargo now and pay later. Granting it writes the
 * pickup note marked "on credit", in the name of whoever pressed it, with the
 * terms and the reason — the bill stays owed until they pay.
 */
export function CreditDialog({
  cargoId,
  cargoReference,
  customer,
  invoiceNumber,
  amountLabel,
  defaultDays = 14,
  defaultReason,
  onClose,
}: {
  cargoId: string;
  cargoReference: string;
  customer: string;
  invoiceNumber: string;
  amountLabel: string;
  /** The terms and reason Support asked for, when this answers a request. */
  defaultDays?: number;
  defaultReason?: string;
  onClose: () => void;
}) {
  const tx = useT();
  const [state, action] = useActionState<State, FormData>(issuePickupNote, {});
  useCloseOnOk(state, onClose);
  return (
    <Shell onClose={onClose} className="max-w-md">
      <form action={action} className="space-y-3">
        <input type="hidden" name="cargoId" value={cargoId} />
        <input type="hidden" name="onCredit" value="1" />
        <p className="flex flex-wrap items-baseline gap-x-2 rounded-lg border px-3 py-2 text-sm">
          <span className="tnum text-xs font-semibold">{cargoReference}</span>
          <span>{customer}</span>
          <span className="tnum text-xs text-muted-foreground">{invoiceNumber}</span>
        </p>
        <p className="text-sm font-semibold">Release on credit · {amountLabel}</p>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <Clock className="size-4" />
          {tx("Terms")}
          <NativeSelect name="creditDays" defaultValue={String(defaultDays)} className="h-9 w-40">
            {TERMS.map((d) => (
              <option key={d} value={d}>
                {d} days
              </option>
            ))}
          </NativeSelect>
        </label>
        <Input name="creditReason" required minLength={3} autoFocus defaultValue={defaultReason} placeholder={tx("Why are they asking? Finance reads this.")} className="h-9" />
        <FormMessage error={state.error} />
        <div className="flex items-center gap-3">
          <SubmitButton size="sm" pendingLabel="Releasing…" className="bg-warning text-white hover:bg-warning/90">
            {tx("Release it on credit")}
          </SubmitButton>
          <button type="button" onClick={onClose} className="text-xs text-muted-foreground hover:text-foreground">
            {tx("Never mind")}
          </button>
        </div>
        <p className="text-xs text-muted-foreground">
          {tx("Granted the moment you press it, in your name, with the due date counted from today. The pickup note is written and the bill stays owed until the customer pays — it is a sale, not a payment.")}
        </p>
      </form>
    </Shell>
  );
}

type CreditProps = {
  cargoId: string;
  cargoReference: string;
  customer: string;
  invoiceNumber: string;
  amountLabel: string;
  /** Already released on credit — opens the credit book instead. */
  onCredit: boolean;
};

export function CreditIcon(props: CreditProps) {
  const tx = useT();
  const [open, setOpen] = useState(false);
  if (props.onCredit) {
    return (
      <a
        href="/app/finance/credit"
        title={tx("On credit — see the terms")}
        className={cn(SQUARE, "border-warning bg-warning/15 text-warning hover:bg-warning/25")}
      >
        <CalendarClock className="size-4" />
        <span className="sr-only">{tx("See the credit terms")}</span>
      </a>
    );
  }
  return (
    <>
      <button
        type="button"
        title={tx("Release on credit")}
        onClick={() => setOpen(true)}
        className={cn(SQUARE, "border-warning/40 text-warning hover:bg-warning/10")}
      >
        <CalendarClock className="size-4" />
        <span className="sr-only">{tx("Release on credit")}</span>
      </button>
      {open ? <CreditDialog {...props} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

/** The same act as a worded button, beside Confirm payment. */
export function CreditButton(props: CreditProps) {
  const tx = useT();
  const [open, setOpen] = useState(false);
  if (props.onCredit) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-sm font-medium transition-colors hover:bg-secondary"
      >
        <CalendarClock className="size-4" />
        {tx("Release on credit")}
      </button>
      {open ? <CreditDialog {...props} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

/** Straight to the PDF file, named after the customer and the consignment. */
export function DownloadIcon({ invoiceId, number }: { invoiceId: string; number: string }) {
  const tx = useT();
  return (
    <a
      href={`/app/finance/invoices/${invoiceId}/pdf`}
      download
      title={`Download ${number}`}
      className={cn(SQUARE, "border-signal/40 text-signal hover:bg-signal/10")}
    >
      <Download className="size-4" />
      <span className="sr-only">{tx("Download the invoice")}</span>
    </a>
  );
}

/** The same price dialog, as a text button for a page with room for words. */
export function ChangePriceButton(props: {
  invoiceId: string;
  standardRate: number | null;
  appliedRate: number | null;
  cbm: number | null;
  category?: string | null;
  categories?: { name: string; rate: number }[];
}) {
  const tx = useT();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-md border border-brand/40 px-3 py-1.5 text-sm font-medium text-brand hover:bg-brand/10"
      >
        <Scale className="size-4" />
        {tx("Edit price")}
      </button>
      {open ? <RateDialog {...props} onClose={() => setOpen(false)} /> : null}
    </>
  );
}
