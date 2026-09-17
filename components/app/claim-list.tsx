"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { Ban, CheckCircle2, Clock, Paperclip, Pencil, Undo2 } from "lucide-react";

import {
  cancelClaims,
  editClaim,
  verifyClaims,
  type ClaimState,
} from "@/lib/actions/claims";
import { rejectPayment } from "@/lib/actions/payments";
import { FormMessage } from "@/components/app/form-message";
import { SubmitButton } from "@/components/app/submit-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type ClaimRow = {
  id: string;
  customer: string;
  container: string | null;
  reference: string;
  cargo: string;
  invoice: string;
  account: string | null;
  submittedBy: string;
  submittedAt: string;
  amount: number;
  currency: string;
  amountLabel: string;
  /** What was handed over and the rate it was valued at, when not shillings. */
  paidAsLabel: string | null;
  owedLabel: string;
  overpayment: string | null;
  transactionRef: string | null;
  proofUrl: string | null;
  reason: string | null;
};

/**
 * WHAT CUSTOMERS SAY THEY HAVE SENT, AND WHAT FINANCE SENT BACK.
 *
 * One list, two modes, because they are the same rows at two moments. Ticking
 * several lets the desk clear a morning's M-Pesa slips in one press — but each
 * is still verified on its own inside, with its own receipt and its own check
 * that nobody verified it a second ago.
 */
export function ClaimList({
  rows,
  mode,
  mayVerify,
}: {
  rows: ClaimRow[];
  /**
   * "waiting" is Support's copy of the verify queue: the same rows, read-only.
   * Nothing on it is theirs to act on until Finance answers.
   */
  mode: "verify" | "sentback" | "waiting";
  mayVerify: boolean;
}) {
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [bulkVerifyState, bulkVerify] = useActionState<ClaimState, FormData>(
    verifyClaims,
    {}
  );
  const [bulkCancelState, bulkCancel] = useActionState<ClaimState, FormData>(
    cancelClaims,
    {}
  );

  const all = rows.length > 0 && picked.size === rows.length;
  const toggle = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const ids = useMemo(() => [...picked], [picked]);

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border bg-card px-5 py-12 text-center">
        <p className="font-medium">
          {mode === "verify"
            ? "Nothing is waiting on you"
            : mode === "waiting"
              ? "Nothing is with Finance"
              : "Nothing was sent back"}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          {mode === "sentback"
            ? "Every claim Finance looked at was accepted."
            : "Every payment somebody submitted has been checked."}
        </p>
      </div>
    );
  }

  if (mode === "waiting") {
    return (
      <div className="overflow-hidden rounded-xl border bg-card">
        <p className="border-b px-5 py-3 text-xs text-muted-foreground">
          {rows.length} waiting on Finance. They check each one against the bank and
          verify it or send it back — anything sent back lands in Sent back for this
          desk to fix.
        </p>
        <ul className="divide-y">
          {rows.map((row) => (
            <ClaimRowItem
              key={row.id}
              row={row}
              mode={mode}
              mayVerify={false}
              picked={false}
              onPick={() => {}}
            />
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-3">
        <label className="flex cursor-pointer items-center gap-3 text-sm font-medium">
          <input
            type="checkbox"
            className="size-5 rounded accent-[hsl(var(--brand))]"
            checked={all}
            onChange={() =>
              setPicked(all ? new Set() : new Set(rows.map((r) => r.id)))
            }
          />
          Pick all
        </label>

        {picked.size > 0 ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {picked.size} picked
            </span>
            {mode === "verify" && mayVerify ? (
              <form action={bulkVerify}>
                {ids.map((id) => (
                  <input key={id} type="hidden" name="paymentIds" value={id} />
                ))}
                <SubmitButton size="sm" className="bg-success text-white hover:bg-success/90">
                  <CheckCircle2 className="mr-1.5 size-4" />
                  Verify {picked.size}
                </SubmitButton>
              </form>
            ) : null}
            <form action={bulkCancel}>
              {ids.map((id) => (
                <input key={id} type="hidden" name="paymentIds" value={id} />
              ))}
              <SubmitButton size="sm" variant="outline">
                <Ban className="mr-1.5 size-4" />
                {mode === "verify" ? "Cancel" : "Delete"} {picked.size}
              </SubmitButton>
            </form>
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">
            {rows.length} can be {mode === "verify" ? "verified" : "deleted"} together
          </span>
        )}
      </div>
      {bulkVerifyState.error || bulkVerifyState.ok || bulkCancelState.error || bulkCancelState.ok ? (
        <div className="border-b px-5 py-2">
          <FormMessage
            error={bulkVerifyState.error ?? bulkCancelState.error}
            ok={bulkVerifyState.ok ?? bulkCancelState.ok}
          />
        </div>
      ) : null}

      <ul className="divide-y">
        {rows.map((row) => (
          <ClaimRowItem
            key={row.id}
            row={row}
            mode={mode}
            mayVerify={mayVerify}
            picked={picked.has(row.id)}
            onPick={() => toggle(row.id)}
          />
        ))}
      </ul>
    </div>
  );
}

function ClaimRowItem({
  row,
  mode,
  mayVerify,
  picked,
  onPick,
}: {
  row: ClaimRow;
  mode: "verify" | "sentback" | "waiting";
  mayVerify: boolean;
  picked: boolean;
  onPick: () => void;
}) {
  const [open, setOpen] = useState<null | "edit" | "back" | "cancel">(null);
  const [verifyState, verify] = useActionState<ClaimState, FormData>(
    verifyClaims,
    {}
  );
  const [editState, edit] = useActionState<ClaimState, FormData>(editClaim, {});
  useEffect(() => {
    if (editState.ok) setOpen(null);
  }, [editState]);
  const [backState, sendBack] = useActionState<ClaimState, FormData>(
    rejectPayment,
    {}
  );
  const [cancelState, cancel] = useActionState<ClaimState, FormData>(
    cancelClaims,
    {}
  );

  const message =
    verifyState.error ?? editState.error ?? backState.error ?? cancelState.error;
  const done = verifyState.ok ?? editState.ok ?? backState.ok ?? cancelState.ok;

  return (
    <li className={cn("px-5 py-3", picked && "bg-brand/[0.04]")}>
      <div className="flex flex-wrap items-center gap-4">
        {mode === "waiting" ? null : (
          <input
            type="checkbox"
            className="size-5 shrink-0 rounded accent-[hsl(var(--brand))]"
            checked={picked}
            onChange={onPick}
            aria-label={`Pick ${row.reference}`}
          />
        )}

        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{row.customer}</span>
            {row.container ? (
              <span className="tnum rounded bg-secondary px-1.5 py-0.5 text-[11px] text-muted-foreground">
                {row.container}
              </span>
            ) : null}
          </p>
          <p className="tnum mt-0.5 text-xs text-muted-foreground">
            {[row.reference, row.cargo, row.invoice, row.account ?? "no account"].join(
              " · "
            )}{" "}
            · Submitted by{" "}
            <span className="text-foreground">{row.submittedBy}</span> ·{" "}
            {row.submittedAt}
            {row.transactionRef ? ` · ${row.transactionRef}` : ""}
          </p>
          <p className="mt-1 flex flex-wrap items-center gap-2">
            {row.proofUrl ? (
              <a
                href={row.proofUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 rounded bg-brand/10 px-1.5 py-0.5 text-[11px] text-brand hover:underline"
              >
                <Paperclip className="size-3" />
                view proof
              </a>
            ) : (
              /* Named in red because verifying a payment with nothing to look
                 at is verifying somebody's word. */
              <span className="inline-flex items-center gap-1 rounded bg-destructive/10 px-1.5 py-0.5 text-[11px] text-destructive">
                <Paperclip className="size-3" />
                no proof attached
              </span>
            )}
            {row.reason ? (
              <span className="text-xs text-warning">Sent back: {row.reason}</span>
            ) : null}
          </p>
        </div>

        <div className="text-right">
          <p className="tnum font-semibold">{row.amountLabel}</p>
          {row.paidAsLabel ? (
            <p className="tnum text-[11px] text-muted-foreground">{row.paidAsLabel}</p>
          ) : null}
          <p className="tnum text-xs text-muted-foreground">owed {row.owedLabel}</p>
          {row.overpayment ? (
            <p className="max-w-56 text-[11px] font-medium text-destructive">Overpaid · {row.overpayment}</p>
          ) : null}
        </div>

        {mode === "waiting" ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-warning/40 bg-warning/10 px-2.5 py-1 text-xs font-medium text-warning">
            <Clock className="size-3.5" />
            Waiting on Finance
          </span>
        ) : (
        <div className="flex flex-wrap items-center gap-1.5">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setOpen(open === "edit" ? null : "edit")}
          >
            <Pencil className="mr-1 size-3.5" />
            {mode === "verify" ? "Edit" : "Fix and send again"}
          </Button>
          {mode === "verify" && mayVerify ? (
            <>
              <form action={verify}>
                <input type="hidden" name="paymentIds" value={row.id} />
                <SubmitButton
                  size="sm"
                  className="bg-success text-white hover:bg-success/90"
                >
                  <CheckCircle2 className="mr-1 size-3.5" />
                  Verify
                </SubmitButton>
              </form>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setOpen(open === "back" ? null : "back")}
              >
                <Undo2 className="mr-1 size-3.5" />
                Send it back
              </Button>
            </>
          ) : null}
          <Button
            size="sm"
            variant="outline"
            onClick={() => setOpen(open === "cancel" ? null : "cancel")}
          >
            <Ban className="mr-1 size-3.5" />
            {mode === "verify" ? "Cancel it" : "Delete"}
          </Button>
        </div>
        )}
      </div>

      {open === "edit" ? (
        <form
          action={edit}
          className="ml-9 mt-3 flex flex-wrap items-end gap-2 rounded-lg border bg-secondary/30 p-3"
        >
          <input type="hidden" name="paymentId" value={row.id} />
          <label className="space-y-1 text-xs">
            <span className="text-muted-foreground">Amount ({row.currency})</span>
            <Input
              name="amount"
              type="number"
              step="0.01"
              min="0.01"
              defaultValue={row.amount}
              className="w-40"
              required
            />
          </label>
          <label className="space-y-1 text-xs">
            <span className="text-muted-foreground">Their reference</span>
            <Input
              name="transactionRef"
              defaultValue={row.transactionRef ?? ""}
              placeholder="M-Pesa code, slip number…"
              className="w-56"
            />
          </label>
          <SubmitButton size="sm">
            {mode === "verify" ? "Save" : "Send again"}
          </SubmitButton>
        </form>
      ) : null}

      {open === "back" ? (
        <form
          action={sendBack}
          className="ml-9 mt-3 flex flex-wrap items-end gap-2 rounded-lg border bg-secondary/30 p-3"
        >
          <input type="hidden" name="paymentId" value={row.id} />
          <Input
            name="reason"
            required
            placeholder="Why it does not check out — the customer is told this"
            className="min-w-[20rem] flex-1"
          />
          <SubmitButton size="sm" variant="outline">
            Send it back
          </SubmitButton>
        </form>
      ) : null}

      {open === "cancel" ? (
        <form
          action={cancel}
          className="ml-9 mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/[0.04] p-3"
        >
          <input type="hidden" name="paymentIds" value={row.id} />
          <p className="flex-1 text-sm">
            Remove {row.reference}? It stops counting and leaves this list. The
            record is kept.
          </p>
          <SubmitButton size="sm" variant="destructive">
            {mode === "verify" ? "Cancel it" : "Delete"}
          </SubmitButton>
          <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(null)}>
            Keep it
          </Button>
        </form>
      ) : null}

      {message || done ? (
        <div className="ml-9 mt-2">
          <FormMessage error={message} ok={done} />
        </div>
      ) : null}
    </li>
  );
}
