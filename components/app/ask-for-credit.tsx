"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { CalendarClock, Clock, Search, X } from "lucide-react";

import { useEscape } from "@/components/app/use-escape";
import { CreditDialog } from "@/components/app/bill-dialogs";
import { FormMessage } from "@/components/app/form-message";
import { SubmitButton } from "@/components/app/submit-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import {
  creditCandidates,
  requestCredit,
  type CreditCandidate,
  type CreditRequestState,
} from "@/lib/actions/credit";

const TERMS = [7, 14, 30, 60] as const;

/**
 * "THIS CUSTOMER WANTS TO TAKE THE CARGO NOW AND PAY LATER."
 *
 * The question arrives on the phone with a name and nothing else, so this opens
 * holding every bill it could be about and the search narrows it — the same
 * shape as Record Payment, because from the desk's side both are "find the
 * customer's bill, do one thing to it".
 *
 * The words follow the authority. Support asks and Finance decides; Finance
 * pressing "Ask for credit" and landing in a queue behind itself would be
 * ceremony, so for a reader who can release, picking the bill opens the release
 * itself.
 */
export function AskForCredit({ canApprove }: { canApprove: boolean }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<CreditCandidate[]>([]);
  const [picked, setPicked] = useState<CreditCandidate | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, start] = useTransition();

  /* Loaded on open, then after a pause in typing — a name is a dozen
     keystrokes, and a query per letter is a query nobody finished asking. */
  useEffect(() => {
    if (!open || picked) return;
    const term = query.trim();
    const timer = setTimeout(
      () =>
        start(async () => {
          try {
            setRows(await creditCandidates(term));
            setError(null);
          } catch (e) {
            setError(e instanceof Error ? e.message : "Could not load the bills.");
          }
        }),
      term.length === 0 ? 0 : 250
    );
    return () => clearTimeout(timer);
  }, [open, query, picked]);

  function close() {
    setOpen(false);
    setPicked(null);
    setQuery("");
  }
  useEscape(open, close);

  const label = canApprove ? "Release on credit" : "Ask for credit";

  const trigger = (
    <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
      <CalendarClock />
      {label}
    </Button>
  );

  if (!open) return trigger;

  /* Finance, bill picked: the release itself, with nothing between. */
  if (picked && canApprove) {
    return (
      <>
        {trigger}
        <CreditDialog
          cargoId={picked.cargoId}
          cargoReference={picked.cargoReference}
          customer={picked.customerName}
          invoiceNumber={picked.invoiceNumber}
          amountLabel={picked.cargoOwedLabel}
          onClose={close}
        />
      </>
    );
  }

  if (typeof document === "undefined") return trigger;

  return (
    <>
      {trigger}
      {createPortal(
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 sm:p-8"
          onClick={(e) => {
            if (e.target === e.currentTarget) close();
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-label={label}
            className="w-full max-w-3xl overflow-hidden rounded-xl border border-warning/30 bg-card text-left shadow-lg"
          >
            <div className="flex items-center justify-between border-b border-warning/20 bg-warning/[0.06] px-5 py-2.5">
              <p className="text-xs font-semibold uppercase tracking-wide text-warning">{label}</p>
              <button
                type="button"
                onClick={close}
                className="rounded p-0.5 text-muted-foreground hover:text-foreground"
                aria-label="Close"
              >
                <X className="size-4" />
              </button>
            </div>

            {picked === null ? (
              <div className="px-5 py-4">
                <label className="relative block">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    autoFocus
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Customer name, tracking number, invoice or phone…"
                    className="pl-9"
                    aria-label="Find the bill"
                  />
                </label>

                <ul className="mt-3 max-h-[60vh] divide-y overflow-y-auto rounded-lg border">
                  {error ? (
                    <li className="px-4 py-3 text-sm text-destructive">{error}</li>
                  ) : loading && rows.length === 0 ? (
                    <li className="px-4 py-3 text-sm text-muted-foreground">Looking…</li>
                  ) : rows.length === 0 ? (
                    <li className="px-4 py-3 text-sm text-muted-foreground">
                      {query.trim()
                        ? "Nothing matches that. Try the tracking number."
                        : "Every open bill is either settled or already free to collect."}
                    </li>
                  ) : (
                    rows.map((row) => {
                      /* Asked once already: a second ask is the same question
                         twice in Finance's queue. Finance can still release it. */
                      const blocked = row.alreadyAsked && !canApprove;
                      return (
                        <li key={row.invoiceId}>
                          <button
                            type="button"
                            disabled={blocked}
                            onClick={() => setPicked(row)}
                            className="group flex w-full flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-2.5 text-left transition-colors hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            <span className="tnum text-xs font-semibold">{row.cargoReference}</span>
                            <span className="min-w-0 flex-1 truncate text-sm">
                              {row.customerName}
                              <span className="ml-2 text-xs text-muted-foreground">
                                {[row.invoiceNumber, row.container, row.goods].filter(Boolean).join(" · ")}
                              </span>
                            </span>
                            <span className="text-right">
                              <span className="tnum block text-sm font-semibold text-destructive">
                                {row.owedLabel}
                              </span>
                              {row.owedUsdLabel ? (
                                <span className="tnum block text-[11px] text-muted-foreground">
                                  {row.owedUsdLabel}
                                </span>
                              ) : null}
                            </span>
                            <span className="hidden shrink-0 rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground transition-colors group-hover:border-warning/40 group-hover:text-warning sm:inline">
                              {row.alreadyAsked
                                ? canApprove
                                  ? "Asked · release it"
                                  : "Already asked"
                                : canApprove
                                  ? "Release it"
                                  : "Ask"}
                            </span>
                          </button>
                        </li>
                      );
                    })
                  )}
                </ul>
              </div>
            ) : (
              <div className="px-5 py-4">
                <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-lg border px-4 py-2.5">
                  <span className="tnum text-xs font-semibold">{picked.cargoReference}</span>
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {picked.customerName}
                    <span className="ml-2 text-xs text-muted-foreground">{picked.invoiceNumber}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setPicked(null)}
                    className="text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                  >
                    pick another
                  </button>
                </div>
                <CreditRequestForm bill={picked} onDone={close} />
              </div>
            )}
          </section>
        </div>,
        document.body
      )}
    </>
  );
}

/**
 * The ask. Commits nothing: no note is written and the cargo does not move.
 * The terms are chosen here so Finance answers a specific question — may this
 * customer have 30 days on this bill — rather than inventing one.
 */
function CreditRequestForm({
  bill,
  onDone,
}: {
  bill: CreditCandidate;
  onDone: () => void;
}) {
  const [state, action] = useActionState<CreditRequestState, FormData>(requestCredit, {});

  if (state.ok) {
    return (
      <div className="space-y-3">
        <FormMessage ok={state.ok} />
        <Button type="button" size="sm" variant="outline" onClick={onDone}>
          Done
        </Button>
      </div>
    );
  }

  return (
    <form action={action} className="max-w-md space-y-3">
      <input type="hidden" name="invoiceId" value={bill.invoiceId} />
      <p className="text-sm font-semibold">
        Ask Finance for credit · {bill.owedLabel}
        {bill.cargoOwedLabel && bill.cargoOwedLabel !== bill.owedLabel ? (
          <span className="block text-xs font-normal text-muted-foreground">
            The whole consignment owes {bill.cargoOwedLabel} — a release lets all of it go.
          </span>
        ) : null}
      </p>
      <label className="flex items-center gap-2 text-sm text-muted-foreground">
        <Clock className="size-4" />
        Terms
        <NativeSelect name="creditDays" defaultValue="14" className="h-9 w-40">
          {TERMS.map((d) => (
            <option key={d} value={d}>
              {d} days
            </option>
          ))}
        </NativeSelect>
      </label>
      <Input
        name="creditReason"
        required
        minLength={3}
        autoFocus
        placeholder="Why are they asking? Finance reads this."
        className="h-9"
      />
      <FormMessage error={state.error} />
      <div className="flex items-center gap-3">
        <SubmitButton size="sm" pendingLabel="Sending…">
          Send to Finance
        </SubmitButton>
        <button
          type="button"
          onClick={onDone}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          Never mind
        </button>
      </div>
      {/* Said plainly, because the alternative is somebody telling a customer
          the cargo is ready when nothing has been agreed. */}
      <p className="text-xs text-muted-foreground">
        Finance decides. Until they release it the cargo stays where it is and the bill stays owed.
      </p>
    </form>
  );
}

/**
 * Finance's answer to one request, from its row on the Credit page: the release
 * dialog, already holding the terms and the reason Support sent up.
 */
export function ReleaseRequest({
  cargoId,
  cargoReference,
  customer,
  invoiceNumber,
  amountLabel,
  days,
  reason,
}: {
  cargoId: string;
  cargoReference: string;
  customer: string;
  invoiceNumber: string;
  amountLabel: string;
  days: number;
  reason: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        type="button"
        size="sm"
        className="h-8 bg-warning text-white hover:bg-warning/90"
        onClick={() => setOpen(true)}
      >
        <CalendarClock />
        Release
      </Button>
      {open ? (
        <CreditDialog
          cargoId={cargoId}
          cargoReference={cargoReference}
          customer={customer}
          invoiceNumber={invoiceNumber}
          amountLabel={amountLabel}
          defaultDays={(TERMS as readonly number[]).includes(days) ? days : 14}
          defaultReason={reason}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}

/**
 * ASK FOR CREDIT, FROM THE CARGO ITSELF.
 *
 * The same ask as the picker, beside Submit to Finance on a consignment's
 * payment panel: the bill is already the one on screen, so it opens straight on
 * the terms.
 */
export function AskCreditButton({
  invoiceId,
  invoiceNumber,
  cargoReference,
  customer,
  owedLabel,
}: {
  invoiceId: string;
  invoiceNumber: string;
  cargoReference: string;
  customer: string;
  owedLabel: string;
}) {
  const [open, setOpen] = useState(false);
  useEscape(open, () => setOpen(false));
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-sm font-medium transition-colors hover:bg-secondary"
      >
        <CalendarClock className="size-4" />
        Ask for credit
      </button>
      {open && typeof document !== "undefined"
        ? createPortal(
            <div
              className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 p-4 sm:items-center"
              onClick={(e) => {
                if (e.target === e.currentTarget) setOpen(false);
              }}
            >
              <div
                role="dialog"
                aria-modal="true"
                className="max-h-[90dvh] w-full max-w-md space-y-3 overflow-y-auto overscroll-contain rounded-xl border bg-card p-4 shadow-lg"
              >
                <p className="flex flex-wrap items-baseline gap-x-2 rounded-lg border px-3 py-2 text-sm">
                  <span className="tnum text-xs font-semibold">{cargoReference}</span>
                  <span>{customer}</span>
                  <span className="tnum text-xs text-muted-foreground">{invoiceNumber}</span>
                </p>
                <CreditRequestForm
                  bill={{ invoiceId, owedLabel, cargoOwedLabel: null } as unknown as CreditCandidate}
                  onDone={() => setOpen(false)}
                />
              </div>
            </div>,
            document.body
          )
        : null}
    </>
  );
}
