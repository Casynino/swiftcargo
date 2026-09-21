"use client";

import { useActionState, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeftRight, Ban, CheckCircle2, Clock, Paperclip, Pencil, Scale, Tag, Undo2, Upload } from "lucide-react";

import {
  cancelClaims,
  editClaim,
  verifyClaims,
  type ClaimState,
} from "@/lib/actions/claims";
import { rejectPayment } from "@/lib/actions/payments";
import { FormMessage } from "@/components/app/form-message";
import { Modal } from "@/components/app/modal";
import { DiscountDialog, ExchangeRateDialog, RateDialog } from "@/components/app/bill-dialogs";
import { SubmitButton } from "@/components/app/submit-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import { useT } from "@/components/app/locale-provider";
import { Tx } from "@/components/app/tx";
export type ClaimRow = {
  id: string;
  customer: string;
  customerPhone?: string | null;
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
  /** The desk asked for the rest of the bill to be written off with this
      payment. Verifying it does that; Finance must see it before pressing. */
  clearingAsked: string | null;
  transactionRef: string | null;
  /* Everything else the record says, so the edit starts from it. */
  accountId: string | null;
  paidAt: string;
  method: string;
  payerName: string | null;
  payerBank: string | null;
  payerAccount: string | null;
  notes: string | null;
  proofUrl: string | null;
  reason: string | null;
  /** The bill behind the claim, so its price can be put right from here. */
  bill?: {
    invoiceId: string;
    total: number;
    fxRate: number | null;
    standardRate: number | null;
    appliedRate: number | null;
    cbm: number | null;
    category: string | null;
    perCbm: boolean;
  };
};

type BillTools = {
  canChangeBill: boolean;
  canChangeRate: boolean;
  categories: { name: string; rate: number }[];
};

export type ClaimAccount = { id: string; label: string; currency: string };

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
  accounts = [],
  tools = { canChangeBill: false, canChangeRate: false, categories: [] },
}: {
  rows: ClaimRow[];
  /** Discount, price and exchange rate, from inside the edit dialog. */
  tools?: BillTools;
  /** The collection accounts a payment can be moved to while it is waiting. */
  accounts?: ClaimAccount[];
  /**
   * "waiting" is Support's copy of the verify queue. Until Finance decides,
   * the desk that submitted a claim may still correct it — or the bill behind
   * it — or withdraw it; only verifying is Finance's.
   */
  mode: "verify" | "sentback" | "waiting";
  mayVerify: boolean;
}) {
  const tx = useT();
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
          {tx("Pick all")}
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
            accounts={accounts}
            tools={tools}
            onPick={() => toggle(row.id)}
          />
        ))}
      </ul>
    </div>
  );
}

function ClaimRowItem({
  tools,
  row,
  mode,
  mayVerify,
  picked,
  onPick,
  accounts,
}: {
  accounts: ClaimAccount[];
  tools: BillTools;
  row: ClaimRow;
  mode: "verify" | "sentback" | "waiting";
  mayVerify: boolean;
  picked: boolean;
  onPick: () => void;
}) {
  const tx = useT();
  const [open, setOpen] = useState<null | "edit" | "back" | "cancel">(null);
  const [billDialog, setBillDialog] = useState<null | "discount" | "price" | "fx">(null);
  const [currency, setCurrency] = useState(row.currency);
  const router = useRouter();
  const [verifyState, verify] = useActionState<ClaimState, FormData>(
    verifyClaims,
    {}
  );
  const [editState, edit] = useActionState<ClaimState, FormData>(editClaim, {});
  const [backState, sendBack] = useActionState<ClaimState, FormData>(
    rejectPayment,
    {}
  );
  const [cancelState, cancel] = useActionState<ClaimState, FormData>(
    cancelClaims,
    {}
  );
  const close = useCallback(() => setOpen(null), []);
  useEffect(() => {
    if (editState.ok || backState.ok || cancelState.ok) setOpen(null);
  }, [editState, backState, cancelState]);

  const message = verifyState.error;
  const done = verifyState.ok ?? editState.ok ?? backState.ok ?? cancelState.ok;

  return (
    <li className={cn("px-5 py-3", picked && "bg-brand/[0.04]")}>
      <div className="flex flex-wrap items-center gap-4">
        {(
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
          {row.clearingAsked ? (
            <p className="mt-1 inline-block rounded-md bg-warning/15 px-2 py-0.5 text-[11px] font-semibold text-warning">
              Also clears {row.clearingAsked} short
            </p>
          ) : null}
        </div>

        {(
        <div className="flex flex-wrap items-center gap-1.5">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setOpen("edit")}
          >
            <Pencil className="mr-1 size-3.5" />
            {mode === "sentback" ? "Fix and send again" : "Edit"}
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
                  {tx("Verify")}
                </SubmitButton>
              </form>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setOpen("back")}
              >
                <Undo2 className="mr-1 size-3.5" />
                {tx("Send it back")}
              </Button>
            </>
          ) : null}
          <Button
            size="sm"
            variant="outline"
            onClick={() => setOpen("cancel")}
          >
            <Ban className="mr-1 size-3.5" />
            {mode === "verify" ? "Cancel it" : "Delete"}
          </Button>
        </div>
        )}
      </div>

      {open === "edit" ? (
        /* The whole record, as saved, ready to put right before it counts —
           nothing here has been verified or printed on a receipt yet. */
        <Modal
          title={
            mode === "verify"
              ? "Correct this payment"
              : mode === "waiting"
                ? "Correct this submission"
                : "Fix and send again"
          }
          onClose={close}
          className="max-w-lg"
        >
          {/* Whose, for what, and who sent it — read, not edited. */}
          <div className="rounded-xl border bg-secondary/30 px-4 py-3 text-sm">
            <div className="flex items-start justify-between gap-3">
              <p className="font-semibold">{row.customer}</p>
              <p className="tnum shrink-0 text-xs text-muted-foreground">{row.reference}</p>
            </div>
            {row.customerPhone ? <p className="tnum text-xs text-muted-foreground">{row.customerPhone}</p> : null}
            <p className="tnum mt-1 text-xs text-muted-foreground">
              {[row.cargo, row.container, row.invoice, `owed ${row.owedLabel}`].filter(Boolean).join(" · ")}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {tx("Submitted by")} <span className="text-brand">{row.submittedBy}</span> · {row.submittedAt}
            </p>
          </div>
          <form action={edit} className="space-y-4">
            <input type="hidden" name="paymentId" value={row.id} />
            <div className="grid grid-cols-2 gap-4">
              <Field label={tx("How much came in")}>
                <Input name="amount" type="number" step="0.01" min="0.01" defaultValue={row.amount} required />
              </Field>
              <Field label={tx("Paid in")}>
                <NativeSelect name="currency" value={currency} onChange={(e) => setCurrency(e.target.value)}>
                  <option value="TZS">TZS</option>
                  <option value="USD">USD</option>
                </NativeSelect>
              </Field>
            </div>
            {/* The bill behind the claim, put right without leaving: Target's
                three doors, in the same order. */}
            {row.bill && (tools.canChangeBill || tools.canChangeRate) ? (
              <div className="flex flex-col items-start gap-1.5">
                {tools.canChangeBill ? (
                  <button type="button" onClick={() => setBillDialog("discount")} className="inline-flex items-center gap-1.5 text-xs text-brand hover:underline">
                    <Tag className="size-3.5" />
                    {tx("Give a discount")}
                  </button>
                ) : null}
                {tools.canChangeBill && row.bill.perCbm ? (
                  <button type="button" onClick={() => setBillDialog("price")} className="inline-flex items-center gap-1.5 text-xs text-brand hover:underline">
                    <Scale className="size-3.5" />
                    {tx("Edit price — category, CBM or rate")}
                  </button>
                ) : null}
                {tools.canChangeRate ? (
                  <button type="button" onClick={() => setBillDialog("fx")} className="inline-flex items-center gap-1.5 text-xs text-brand hover:underline">
                    <ArrowLeftRight className="size-3.5" />
                    {tx("Change the rate")}
                  </button>
                ) : null}
              </div>
            ) : null}
            <Field label={tx("Where the customer's money landed")}>
              <NativeSelect
                key={currency}
                name="accountId"
                defaultValue={currency === row.currency ? (row.accountId ?? "") : ""}
              >
                <option value="">— not said —</option>
                {accounts
                  .filter((acc) => acc.currency === currency || acc.id === row.accountId)
                  .map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      <Tx>{acc.label}</Tx>
                    </option>
                  ))}
              </NativeSelect>
            </Field>
            <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-signal/50 bg-signal/[0.06] px-3 py-2.5 text-sm">
              <Upload className="size-4 shrink-0 text-signal" />
              <span className="font-medium">{tx("Proof")}</span>
              <input
                name="proof"
                type="file"
                accept="image/*,application/pdf"
                className="min-w-0 flex-1 text-xs text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-2.5 file:py-1 file:text-xs file:font-medium file:text-foreground"
              />
            </label>
            {row.proofUrl ? (
              <a href={row.proofUrl} target="_blank" rel="noreferrer" className="-mt-2 inline-flex items-center gap-1 text-xs text-brand hover:underline">
                <Paperclip className="size-3" />
                {tx("View the proof on file")}
              </a>
            ) : null}
            <Field label={tx("What was wrong with it? (optional)")}>
              <Textarea name="wrong" rows={3} placeholder={tx("Reference typed wrong")} className="resize-none" />
            </Field>
            <button
              type="button"
              onClick={() => setOpen("cancel")}
              className="text-xs text-muted-foreground hover:text-destructive hover:underline"
            >
              {tx("Delete this submission instead")}
            </button>
            <FormMessage error={editState.error} />
            <div className="flex flex-wrap gap-2">
              <SubmitButton size="sm">
                {mode === "sentback" ? "Fix and send again" : "Save the correction"}
              </SubmitButton>
              <Button type="button" size="sm" variant="ghost" onClick={close}>
                {tx("Leave it")}
              </Button>
            </div>
          </form>
        </Modal>
      ) : null}

      {open === "back" ? (
        <Modal title={tx("Send this payment back")} onClose={close}>
          <p className="tnum text-sm text-muted-foreground">
            {row.customer} · {row.reference} · {row.amountLabel}
          </p>
          <form action={sendBack} className="space-y-4">
            <input type="hidden" name="paymentId" value={row.id} />
            <Field label={tx("Why it does not check out")}>
              <Textarea name="reason" rows={3} required placeholder={tx("The customer and the person who recorded it are told this")} />
            </Field>
            <FormMessage error={backState.error} />
            <div className="flex flex-wrap gap-2">
              <SubmitButton size="sm">{tx("Send it back")}</SubmitButton>
              <Button type="button" size="sm" variant="ghost" onClick={close}>
                {tx("Leave it")}
              </Button>
            </div>
          </form>
        </Modal>
      ) : null}

      {open === "cancel" ? (
        <Modal title={mode === "verify" ? "Cancel this payment" : "Delete this payment"} onClose={close}>
          <p className="text-sm text-muted-foreground">
            {row.customer} · {row.reference} · {row.amountLabel}. It stops
            counting and leaves this list. The record is kept.
          </p>
          <form action={cancel} className="space-y-4">
            <input type="hidden" name="paymentIds" value={row.id} />
            <FormMessage error={cancelState.error} />
            <div className="flex flex-wrap gap-2">
              <SubmitButton size="sm" variant="destructive">
                {mode === "verify" ? "Cancel it" : "Delete"}
              </SubmitButton>
              <Button type="button" size="sm" variant="ghost" onClick={close}>
                {tx("Keep it")}
              </Button>
            </div>
          </form>
        </Modal>
      ) : null}

      {message || done ? (
        <div className="ml-9 mt-2">
          <FormMessage error={message} ok={done} />
        </div>
      ) : null}
      {row.bill && billDialog === "discount" ? (
        <DiscountDialog invoiceId={row.bill.invoiceId} total={row.bill.total} rate={row.bill.fxRate} onClose={() => setBillDialog(null)} onSaved={() => router.refresh()} />
      ) : null}
      {row.bill && billDialog === "price" ? (
        <RateDialog
          invoiceId={row.bill.invoiceId}
          standardRate={row.bill.standardRate}
          appliedRate={row.bill.appliedRate}
          cbm={row.bill.cbm}
          category={row.bill.category}
          categories={tools.categories}
          onClose={() => setBillDialog(null)}
          onSaved={() => router.refresh()}
        />
      ) : null}
      {row.bill && billDialog === "fx" ? (
        <ExchangeRateDialog invoiceId={row.bill.invoiceId} total={row.bill.total} current={row.bill.fxRate} onClose={() => setBillDialog(null)} onSaved={() => router.refresh()} />
      ) : null}
    </li>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium">{label}</span>
      {children}
    </label>
  );
}
