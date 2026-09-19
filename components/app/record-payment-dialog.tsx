"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { Check, Paperclip, Search, X } from "lucide-react";

import { useEscape } from "@/components/app/use-escape";
import { recordCombinedPayment, type MergeState } from "@/lib/actions/merge";
import { loadPayable } from "@/lib/actions/payable";
import { DiscountDialog, RateDialog } from "@/components/app/bill-dialogs";
import { ShortfallNotice } from "@/components/app/shortfall-notice";
import { FormMessage } from "@/components/app/form-message";
import { SubmitButton } from "@/components/app/submit-button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { cn } from "@/lib/utils";

import { useT } from "@/components/app/locale-provider";
import { Tx } from "@/components/app/tx";
export type PayableBill = {
  invoiceId: string;
  number: string;
  customerId: string;
  customerName: string;
  phone: string;
  cargo: string;
  goods: string;
  containerId: string | null;
  container: string | null;
  currency: string;
  /** In the bill's own currency. */
  outstanding: number;
  /** Whole shillings, exact — what the customer is asked for. */
  outstandingTzs: number | null;
  totalTzs: number | null;
  total: number;
  /** The rate pinned on the bill, as written in the database. */
  rate: string | null;
  standardRate: number | null;
  appliedRate: number | null;
  cbm: number | null;
};

export type PayAccount = {
  id: string;
  name: string;
  currency: string;
  kind: "BANK" | "MOBILE_MONEY" | "CASH";
};

/* Display only. The server values every payment again in Decimal and its
   figure is the one that is stored. */
const money = (n: number, currency: string) =>
  `${currency} ${n.toLocaleString("en-US", {
    minimumFractionDigits: currency === "TZS" ? 0 : 2,
    maximumFractionDigits: currency === "TZS" ? 0 : 2,
  })}`;

/** Dollars to whole shillings, worked in cents so 99.99 × 2,700 is 269,973. */
const usdToTzs = (usd: number, rate: number) =>
  Math.round((Math.round(usd * 100) * rate) / 100);

const newKey = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

/**
 * RECORD PAYMENT, FROM ANYWHERE.
 *
 * An overlay rather than a page, so the same button works from the collections
 * header, the finance overview and the payments list without the desk losing
 * the screen they were on. Two steps: find the bill — by customer, tracking
 * number, invoice or phone, or by the container the money is coming in for —
 * then say what arrived and where it landed.
 *
 * The list is only bills waiting to be recorded. A bill with a claim already
 * waiting on Finance is not on it: taking a second payment for it is how a
 * customer pays twice.
 */
/** The address that opens the dialog from any link, on any screen. */
export const RECORD_PAYMENT_HASH = "#record-payment";

/** Open the dialog; with an invoice id it opens straight on that bill. */
export function openRecordPayment(invoiceId?: string) {
  window.dispatchEvent(
    new CustomEvent("record-payment:open", { detail: { invoiceId: invoiceId ?? null } })
  );
}

export function RecordPaymentDialog({ canClear = false }: { canClear?: boolean }) {
  const tx = useT();
  const [open, setOpen] = useState(false);
  const [bills, setBills] = useState<PayableBill[]>([]);
  const [accounts, setAccounts] = useState<PayAccount[]>([]);
  const [loading, setLoading] = useState(false);
  /* The bill a row asked for, picked as soon as the list arrives. */
  const [wantedId, setWantedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<"rate" | "discount" | null>(null);

  /* Opened by an event from a button, or by #record-payment on any link —
     the sidebar, the finance overview, the home shortcuts. The hash is taken
     off again at once so the back button does not reopen it. */
  useEffect(() => {
    const show = (event: Event) => {
      const wanted = (event as CustomEvent<{ invoiceId?: string | null }>).detail?.invoiceId;
      setWantedId(wanted ?? null);
      setOpen(true);
    };
    const fromHash = () => {
      if (window.location.hash === RECORD_PAYMENT_HASH) {
        history.replaceState(null, "", window.location.pathname + window.location.search);
        setOpen(true);
      }
    };
    /* In-app links change the address with pushState, which fires no
       hashchange — so a click on any link to #record-payment is caught
       before it navigates, wherever that link is on the page. */
    const onClick = (event: MouseEvent) => {
      const link = (event.target as Element | null)?.closest?.("a[href]");
      if (!link) return;
      if (link.getAttribute("href")?.endsWith(RECORD_PAYMENT_HASH)) {
        event.preventDefault();
        event.stopPropagation();
        setOpen(true);
      }
    };
    fromHash();
    window.addEventListener("record-payment:open", show);
    window.addEventListener("hashchange", fromHash);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("record-payment:open", show);
      window.removeEventListener("hashchange", fromHash);
      document.removeEventListener("click", onClick, true);
    };
  }, []);

  const refresh = async () => {
    setLoading(true);
    try {
      const data = await loadPayable();
      setBills(data.bills);
      setAccounts(data.accounts);
      /* After a rate change or a discount the picked bill has new figures;
         swap them in rather than leaving the old balance on screen. */
      setPicked((current) =>
        current ? (data.bills.find((b) => b.invoiceId === current.invoiceId) ?? null) : current
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) void refresh();
  }, [open]);

  useEffect(() => {
    if (!wantedId || bills.length === 0) return;
    const bill = bills.find((b) => b.invoiceId === wantedId);
    if (bill) pick(bill);
    setWantedId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bills, wantedId]);

  const [query, setQuery] = useState("");
  const [containerId, setContainerId] = useState("");
  const [picked, setPicked] = useState<PayableBill | null>(null);

  const [state, action] = useActionState<MergeState, FormData>(
    recordCombinedPayment,
    {}
  );
  const [savedFor, setSavedFor] = useState<string | null>(null);

  const [tendered, setTendered] = useState<"TZS" | "USD">("TZS");
  const [typed, setTyped] = useState<string | null>(null);
  const [transport, setTransport] = useState("");
  const [transportFrom, setTransportFrom] = useState("");
  const [accountId, setAccountId] = useState("");
  /* Minted when a bill is picked: pressing Record twice, or a retry on a bad
     line, is still one payment. */
  const [submitKey, setSubmitKey] = useState(newKey);
  const [acceptOver, setAcceptOver] = useState(false);
  const [clearArmed, setClearArmed] = useState(false);

  /* Back to the list once it is recorded, with the result said at the top —
     the next customer is usually already at the counter. */
  useEffect(() => {
    if (state.ok && picked) {
      setSavedFor(`${picked.cargo} · ${state.ok}`);
      setPicked(null);
      void refresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const containers = useMemo(() => {
    const map = new Map<string, { id: string; name: string; bills: number }>();
    for (const b of bills) {
      if (!b.containerId || !b.container) continue;
      const row = map.get(b.containerId) ?? { id: b.containerId, name: b.container, bills: 0 };
      row.bills += 1;
      map.set(b.containerId, row);
    }
    return [...map.values()].sort((a, b) => b.bills - a.bills);
  }, [bills]);

  const term = query.trim().toLowerCase();
  const shown = bills.filter((b) => {
    if (term.length >= 2) {
      return `${b.cargo} ${b.customerName} ${b.number} ${b.phone} ${b.goods}`
        .toLowerCase()
        .includes(term);
    }
    return !containerId || b.containerId === containerId;
  });

  /** The bill's balance in the money handed over, at the bill's own rate. */
  const owedIn = (bill: PayableBill, currency: string) => {
    const rate = Number(bill.rate);
    if (bill.outstandingTzs === null || !rate) return bill.outstanding;
    return currency === "TZS"
      ? bill.outstandingTzs
      : Math.ceil((bill.outstandingTzs / rate) * 100) / 100;
  };

  const pick = (bill: PayableBill) => {
    setPicked(bill);
    setSavedFor(null);
    const shillings = bill.currency === "TZS" || Number(bill.rate) > 1;
    setTendered(shillings && bill.outstandingTzs !== null ? "TZS" : "USD");
    setSubmitKey(newKey());
    setAcceptOver(false);
    setTyped(null);
    setTransport("");
    setTransportFrom("");
    setAccountId("");
  };

  const close = () => {
    setOpen(false);
    setPicked(null);
    setWantedId(null);
    setEditing(null);
  };
  useEscape(open, close);

  /* An agreement to clear one figure does not survive the figure changing.
     Declared before the early return: hooks run in the same order on every
     render, open or shut. */
  useEffect(() => {
    setClearArmed(false);
  }, [picked?.invoiceId, tendered, typed]);

  if (!open) return null;

  const chip = (on: boolean) =>
    cn(
      "rounded-full border px-3 py-1 text-xs transition-colors",
      on ? "border-brand bg-brand text-brand-foreground" : "bg-card hover:bg-secondary"
    );

  const owed = picked ? owedIn(picked, tendered) : 0;
  const cargoShown = typed ?? (picked ? String(owed) : "");
  const cargo = Number(cargoShown) || 0;
  const fare = Number(transport) || 0;
  const over = picked !== null && cargo > owed;
  const here = accounts.filter((a) => a.currency === tendered);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-background/70 p-4 backdrop-blur-sm sm:p-8">
      <button
        type="button"
        aria-label={tx("Close")}
        onClick={close}
        className="absolute inset-0 cursor-default"
      />
      <section
        role="dialog"
        aria-modal="true"
        aria-label={tx("Record Payment")}
        className="relative w-full max-w-4xl overflow-hidden rounded-xl border border-success/30 bg-card text-left shadow-lg"
      >
        <div className="flex items-center justify-between border-b border-success/20 bg-success/[0.06] px-5 py-2.5">
          <p className="text-xs font-semibold uppercase tracking-wide text-success">
            {tx("Record Payment")}
          </p>
          <button
            type="button"
            onClick={close}
            className="rounded p-0.5 text-muted-foreground hover:text-foreground"
            aria-label={tx("Close")}
          >
            <X className="size-4" />
          </button>
        </div>

        {savedFor ? (
          <p className="border-b border-success/20 px-5 py-2.5 text-sm text-success">
            <Check className="mr-1.5 inline size-4" />
            {savedFor}
          </p>
        ) : null}

        {picked === null ? (
          <div className="px-5 py-4">
            <label className="relative block">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={tx("Customer name, tracking number, invoice or phone…")}
                className="h-11 pl-9"
                aria-label={tx("Find the bill")}
              />
            </label>

            {/* The containers money is still owed on, heaviest first — a box
                lands and its customers are rung through in one sitting. */}
            {term.length < 2 && containers.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-1.5">
                <button type="button" onClick={() => setContainerId("")} className={chip(containerId === "")}>
                  {tx("Everyone who owes")}
                </button>
                {containers.map((c) => (
                  <button key={c.id} type="button" onClick={() => setContainerId(c.id)} className={chip(containerId === c.id)}>
                    {c.name}
                    <span className="ml-1.5 opacity-50">·</span>
                    <span className="ml-1 opacity-70">{c.bills}</span>
                  </button>
                ))}
              </div>
            ) : null}

            <ul className="mt-3 max-h-[65vh] divide-y overflow-y-auto rounded-lg border bg-card">
              {shown.length === 0 ? (
                <li className="px-4 py-3 text-sm text-muted-foreground">
                  {loading
                    ? "Looking…"
                    : term.length >= 2
                      ? "Nothing matches that. Try the tracking number."
                      : "Nothing is waiting to be recorded."}
                </li>
              ) : (
                shown.map((bill) => {
                  const tzs = bill.outstandingTzs;
                  return (
                    <li key={bill.invoiceId}>
                      <button
                        type="button"
                        onClick={() => pick(bill)}
                        className="group flex w-full flex-wrap items-center gap-x-3 gap-y-0.5 px-4 py-2.5 text-left transition-colors hover:bg-secondary/50 sm:flex-nowrap"
                      >
                        {/* On a phone: reference and amount on one line, the
                            customer under them — four columns in 340px left the
                            name and the button cut off at the edge. */}
                        <span className="tnum order-1 shrink-0 text-xs font-semibold sm:w-24">{bill.cargo}</span>
                        <span className="order-3 min-w-0 basis-full truncate text-sm sm:order-2 sm:flex-1 sm:basis-auto" title={bill.customerName}>
                          {bill.customerName}
                          <span className="ml-2 text-xs text-muted-foreground">{bill.goods}</span>
                        </span>
                        <span className="order-2 ml-auto shrink-0 text-right sm:order-3 sm:ml-0">
                          <span className="tnum block text-sm font-semibold text-destructive">
                            {tzs !== null ? money(tzs, "TZS") : money(bill.outstanding, bill.currency)}
                          </span>
                          {bill.currency === "USD" ? (
                            <span className="tnum block text-[11px] text-muted-foreground">
                              {money(bill.outstanding, "USD")}
                            </span>
                          ) : null}
                        </span>
                        <span className="order-4 hidden shrink-0 rounded-full border px-2.5 py-1 text-xs group-hover:bg-card sm:inline">
                          {tx("Record payment")}
                        </span>
                      </button>
                    </li>
                  );
                })
              )}
            </ul>
          </div>
        ) : (
          <form action={action} className="px-5 py-4">
            <input type="hidden" name="customerId" value={picked.customerId} />
            <input type="hidden" name="invoiceIds" value={picked.invoiceId} />
            <input type="hidden" name="currency" value={tendered} />
            <input type="hidden" name="cargoAmount" value={cargo || ""} />
            <input type="hidden" name="idempotencyKey" value={submitKey} />

            {/* What is owed, in the currency it is collected in, with the dollar
                figure and the rate beside it — never a dollar figure alone. */}
            {picked.outstandingTzs !== null ? (
              <div className="mb-3 grid grid-cols-1 gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-4">
                {[
                  { label: "Amount due", value: money(picked.outstandingTzs, "TZS"), strong: true },
                  { label: "USD equivalent", value: money(picked.outstanding, "USD") },
                  { label: "Invoice total", value: `${money(picked.totalTzs ?? 0, "TZS")} · ${money(picked.total, "USD")}` },
                  { label: "Exchange rate", value: `1 USD = ${Number(picked.rate).toLocaleString("en-US")} TZS` },
                ].map((cell) => (
                  <div key={cell.label} className="bg-card px-3 py-2">
                    <p className="text-[11px] text-muted-foreground"><Tx>{cell.label}</Tx></p>
                    <p className={cn("tnum text-sm", cell.strong ? "font-semibold text-destructive" : "font-medium")}>
                      {cell.value}
                    </p>
                  </div>
                ))}
              </div>
            ) : null}

            <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-lg border bg-card px-4 py-2.5">
              <span className="tnum text-xs font-semibold">{picked.cargo}</span>
              <span className="min-w-0 flex-1 truncate text-sm">
                {picked.customerName}
                <span className="ml-2 text-xs text-muted-foreground">{picked.number}</span>
              </span>
              <span className="text-xs text-muted-foreground">
                owes{" "}
                <span className="tnum font-semibold text-destructive">
                  {picked.outstandingTzs !== null ? money(picked.outstandingTzs, "TZS") : money(picked.outstanding, picked.currency)}
                </span>
              </span>
              <button
                type="button"
                onClick={() => setPicked(null)}
                className="text-xs text-muted-foreground underline hover:text-foreground"
              >
                pick another
              </button>
            </div>

            <div className="flex flex-wrap items-end gap-2">
              {/* Pre-filled with the balance — settling in full is what nearly
                  every payment is — and editable for the part-payments. */}
              <label className="flex flex-col gap-1">
                <span className="text-[11px] text-muted-foreground">Cargo charge ({tendered})</span>
                <Input
                  inputMode="decimal"
                  required
                  value={cargoShown}
                  onChange={(e) => setTyped(e.target.value === "" ? null : e.target.value)}
                  className="tnum w-36"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="whitespace-nowrap text-[11px] text-muted-foreground">{tx("Transport they added")}</span>
                <Input
                  name="transport"
                  inputMode="decimal"
                  placeholder="0"
                  value={transport}
                  onChange={(e) => setTransport(e.target.value)}
                  className="tnum w-28"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="whitespace-nowrap text-[11px] text-muted-foreground">{tx("Transport settled from")}</span>
                <NativeSelect
                  name="transportAccountId"
                  required={fare > 0}
                  disabled={!(fare > 0)}
                  value={transportFrom}
                  onChange={(e) => setTransportFrom(e.target.value)}
                  className="w-52 disabled:opacity-50"
                >
                  <option value="" disabled>
                    {tx("Cash or the Lipa number")}
                  </option>
                  {here
                    .filter((a) => a.kind === "CASH" || a.kind === "MOBILE_MONEY")
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                </NativeSelect>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[11px] text-muted-foreground">{tx("Paid in")}</span>
                <NativeSelect
                  value={tendered}
                  onChange={(e) => {
                    setTendered(e.target.value as "TZS" | "USD");
                    setTyped(null);
                    setTransport("");
                    setTransportFrom("");
                    setAccountId("");
                  }}
                  className="w-28"
                >
                  <option value="TZS">TZS</option>
                  <option value="USD">USD</option>
                </NativeSelect>
              </label>
              <label className="flex flex-col gap-1">
                <span className="whitespace-nowrap text-[11px] text-muted-foreground">{tx("Into which account")}</span>
                <NativeSelect
                  name="accountId"
                  required
                  value={accountId}
                  onChange={(e) => setAccountId(e.target.value)}
                  className="w-52"
                >
                  <option value="" disabled>
                    {tx("Choose the account")}
                  </option>
                  {here.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </NativeSelect>
              </label>
              <label className="flex cursor-pointer items-center gap-2 rounded-md border border-warning/40 bg-warning/[0.06] px-3 py-2 text-xs">
                <Paperclip className="size-3.5 text-warning" />
                <span className="font-medium text-warning">{tx("Proof")}</span>
                <input
                  type="file"
                  name="proof"
                  accept="image/*,application/pdf"
                  className="w-44 text-[11px] file:mr-2 file:rounded file:border-0 file:bg-warning/15 file:px-2 file:py-0.5 file:text-warning"
                />
              </label>

              <div className="flex w-full flex-wrap items-center gap-x-4 gap-y-2 pt-1 text-xs">
                <button type="button" onClick={() => setEditing("discount")} className="text-brand hover:underline">
                  {tx("Give a discount")}
                </button>
                <button type="button" onClick={() => setEditing("rate")} className="text-brand hover:underline">
                  {tx("Change the rate")}
                </button>
                <a href={`/app/finance/invoices/${picked.invoiceId}`} className="text-brand hover:underline">
                  {tx("Open the bill")}
                </a>
              </div>
            </div>

            {tendered === "USD" && cargo > 0 && picked.rate ? (
              <p className="tnum mt-3 text-xs text-muted-foreground">
                {money(cargo, "USD")} × {Number(picked.rate).toLocaleString("en-US")} ={" "}
                <span className="font-semibold text-foreground">
                  {money(usdToTzs(cargo, Number(picked.rate)), "TZS")}
                </span>{" "}
                credited against this bill.
              </p>
            ) : null}
            {cargo > 0 && cargo < owed ? (
              <div className="mt-3">
                <ShortfallNotice
                  gapTzs={
                    picked.outstandingTzs === null
                      ? 0
                      : tendered === "USD" && picked.rate
                        ? Math.max(0, picked.outstandingTzs - usdToTzs(cargo, Number(picked.rate)))
                        : Math.max(0, picked.outstandingTzs - cargo)
                  }
                  gapUsd={
                    tendered === "USD"
                      ? Math.round((owed - cargo) * 100) / 100
                      : picked.rate
                        ? Math.round(((owed - cargo) / Number(picked.rate)) * 100) / 100
                        : null
                  }
                  canClear={canClear}
                  armed={clearArmed}
                  onArmedChange={setClearArmed}
                  billNumber={picked.number}
                />
              </div>
            ) : null}
            {over ? (
              <div className="mt-3 space-y-2 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm">
                <p>
                  That is {money(cargo - owed, tendered)} more than {picked.number} owes. If the
                  transport is inside it, put the transport in its own box.
                </p>
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
              </div>
            ) : null}

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <FormMessage error={state.error} />
              <SubmitButton
                className="ml-auto bg-success text-white hover:bg-success/90"
                disabled={cargo <= 0 || (over && !acceptOver)}
              >
                Record {money(cargo + fare, tendered)}
              </SubmitButton>
            </div>
          </form>
        )}
        {picked && editing === "rate" ? (
          <RateDialog
            invoiceId={picked.invoiceId}
            standardRate={picked.standardRate}
            appliedRate={picked.appliedRate}
            cbm={picked.cbm}
            onClose={() => setEditing(null)}
            onSaved={() => {
              setTyped(null);
              void refresh();
            }}
          />
        ) : null}
        {picked && editing === "discount" ? (
          <DiscountDialog
            invoiceId={picked.invoiceId}
            total={picked.total}
            /* The bill's own rate arms the shilling box — a discount is agreed
               at the counter in shillings. Without one the server refuses a
               shilling figure, so only dollars are offered. */
            rate={Number(picked.rate) > 1 ? Number(picked.rate) : null}
            onClose={() => setEditing(null)}
            onSaved={() => {
              setTyped(null);
              void refresh();
            }}
          />
        ) : null}
      </section>
    </div>
  );
}
