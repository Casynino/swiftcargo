"use client";

import { useState, useTransition, type ComponentProps } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Ban, Pencil, X } from "lucide-react";

import { useEscape } from "@/components/app/use-escape";
import { CorrectExpenseDialog } from "@/components/app/correct-expense-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { cancelTransfer } from "@/lib/actions/accounts";
import { cancelExpense } from "@/lib/actions/expenses";
import {
  editLedgerPayment,
  reverseCombinedPayment,
} from "@/lib/actions/ledger";
import { reversePayment } from "@/lib/actions/payments";
import { t, type Locale } from "@/lib/i18n";
import type {
  LedgerFixExpense,
  LedgerFixPayment,
  LedgerFixTransfer,
} from "@/lib/ledger";

type Result = { error?: string; ok?: string };

const METHODS: [string, string][] = [
  ["CASH", "Cash"],
  ["BANK_TRANSFER", "Bank transfer"],
  ["MOBILE_MONEY", "Mobile money"],
  ["CHEQUE", "Cheque"],
  ["OTHER", "Other"],
];

const pill =
  "inline-flex h-7 items-center gap-1 whitespace-nowrap rounded-full border bg-card px-2.5 text-xs font-medium text-foreground shadow-sm transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/**
 * FIX THE LINE FROM THE LINE.
 *
 * A desk reading down the register is looking at the row it wants to put right,
 * so the correction opens over the row rather than on another screen.
 *
 * Nothing here deletes. Edit on a payment changes what it says about itself —
 * never a figure a receipt was built from. Edit on a cost opens the cost's own
 * correction dialog, where a paid figure is cancelled and reposted rather than
 * written over. Either way the old value, the new one and the reason are
 * written before anything moves. Cancel is the record's own reversal
 * or cancellation, with a reason if the desk wants to give one: the row stays
 * on the register,
 * struck through and no longer counted.
 */
export function LedgerRowFix({
  subject,
  locale,
  mayEdit,
  mayCancel,
  accounts,
  categories,
}: {
  subject: LedgerFixPayment | LedgerFixExpense | LedgerFixTransfer;
  locale: Locale;
  mayEdit: boolean;
  mayCancel: boolean;
  accounts: { id: string; label: string; currency: string }[];
  categories: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState<"edit" | "cancel" | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const payment = subject.kind === "payment" ? subject : null;
  const expense = subject.kind === "expense" ? subject : null;

  const [form, setForm] = useState<Record<string, string>>((): Record<string, string> =>
    payment
      ? {
          transactionRef: payment.transactionRef ?? "",
          method: payment.method,
          payerName: payment.payerName ?? "",
          payerAccount: payment.payerAccount ?? "",
          payerBank: payment.payerBank ?? "",
          notes: payment.notes ?? "",
        }
      : {}
  );
  const set = (key: string) => (value: string) => setForm((f) => ({ ...f, [key]: value }));

  const canEdit = mayEdit && subject.kind !== "transfer";
  useEscape(open !== null && !pending, close);

  if (!canEdit && !mayCancel) return null;

  function close() {
    setOpen(null);
    setError(null);
    setReason("");
  }

  function run(act: (fd: FormData) => Promise<Result>, build: (fd: FormData) => void) {
    setError(null);
    start(async () => {
      const fd = new FormData();
      fd.set("reason", reason);
      build(fd);
      const result = await act(fd);
      if (result.error) {
        setError(result.error);
        return;
      }
      close();
      router.refresh();
    });
  }

  function cancelIt() {
    if (payment) {
      run(
        (fd) => (payment.merged ? reverseCombinedPayment({}, fd) : reversePayment({}, fd)),
        (fd) => payment.paymentIds.forEach((id) => fd.append("paymentId", id))
      );
    } else if (expense) {
      run((fd) => cancelExpense({}, fd), (fd) => fd.set("expenseId", expense.expenseId));
    } else if (subject.kind === "transfer") {
      run((fd) => cancelTransfer({}, fd), (fd) => fd.set("transferId", subject.transferId));
    }
  }

  function saveEdit() {
    if (payment) {
      run(
        (fd) => editLedgerPayment({}, fd),
        (fd) => {
          payment.paymentIds.forEach((id) => fd.append("paymentId", id));
          for (const [key, value] of Object.entries(form)) {
            if (key === "transactionRef" && payment.merged) continue;
            fd.set(key, value);
          }
        }
      );
    }
  }

  const field = (key: string, label: string, props: ComponentProps<typeof Input> = {}) => (
    <div className="space-y-1.5">
      <Label htmlFor={`fix-${key}`}>{t(locale, label)}</Label>
      <Input
        id={`fix-${key}`}
        value={form[key] ?? ""}
        onChange={(e) => set(key)(e.target.value)}
        /* An empty box here means nothing was recorded, not that it failed
           to load — so it says so. */
        placeholder={t(locale, "Not recorded — type it in")}
        {...props}
      />
    </div>
  );

  const explain = payment
    ? payment.merged
      ? "This payment was taken as one across several bills. Every one of them is reversed together, and any write-off made with it is taken back, so each customer bill owes its full amount again. The rows stay on the register, struck through and no longer counted."
      : "The money comes off the bill and any write-off made with it is taken back, so the customer owes the full amount again. The customer holds a receipt for it, so the reason is the whole record. The row stays on the register, struck through and no longer counted."
    : expense
      ? "The cost stops counting against the account and the profit report. It has been in a profit report, so the row stays on the register, struck through, with your reason beside it."
      : "Both accounts moved when this was written, and both go back. The two rows stay on the register, struck through, with your reason beside them.";

  return (
    <span className="relative z-10 inline-flex items-center gap-1">
      {canEdit && expense ? (
        /* A cost is corrected through the same dialog wherever it is listed,
           which can also move its figure and account by cancel-and-repost. */
        <CorrectExpenseDialog
          expense={expense.correction}
          accounts={accounts}
          categories={categories.filter((c) => c.name !== "Salaries")}
          locale={locale}
        />
      ) : canEdit ? (
        <button type="button" onClick={() => setOpen("edit")} className={pill}>
          <Pencil className="size-3.5" />
          {t(locale, "Edit")}
        </button>
      ) : null}
      {mayCancel ? (
        <button
          type="button"
          onClick={() => setOpen("cancel")}
          className={`${pill} hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive`}
        >
          <Ban className="size-3.5" />
          {t(locale, "Cancel")}
        </button>
      ) : null}

      {open
        ? createPortal(
            /* Portalled to the body: the register scrolls sideways, and an
               overflow-clipping ancestor confines even a fixed dialog to its
               own rectangle, leaving the rest of the page lit behind it. */
            <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center">
              <div
                role="dialog"
                aria-modal="true"
                className="max-h-[85dvh] w-full max-w-md space-y-3 overflow-y-auto overscroll-contain rounded-xl border bg-card p-5 text-left shadow-lg"
              >
                <div className="flex items-start justify-between gap-3">
                  <h2 className="font-semibold">
                    {open === "cancel"
                      ? t(locale, payment ? "Reverse this payment" : "Cancel this movement")
                      : t(locale, "Correct this record")}
                  </h2>
                  <button
                    type="button"
                    onClick={close}
                    aria-label={t(locale, "Close")}
                    className="rounded p-1 text-muted-foreground hover:text-foreground"
                  >
                    <X className="size-4" />
                  </button>
                </div>

                {open === "cancel" ? (
                  <p className="text-sm text-muted-foreground">{t(locale, explain)}</p>
                ) : payment ? (
                  <>
                    {payment.summary ? (
                      <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 rounded-lg bg-secondary/60 p-3 text-xs">
                        {payment.summary.map(([label, value]) => (
                          <div key={label} className="min-w-0">
                            <dt className="text-muted-foreground">{t(locale, label)}</dt>
                            <dd className="tnum truncate font-medium">{value}</dd>
                          </div>
                        ))}
                      </dl>
                    ) : null}
                    <p className="text-xs text-muted-foreground">
                      {t(
                        locale,
                        "The figure and the account are not corrected here: a receipt was printed from them and the bill was settled by them. A wrong amount is reversed and taken again, so both stay on the books."
                      )}
                    </p>
                    {payment.merged ? (
                      <p className="text-xs text-muted-foreground">
                        {t(
                          locale,
                          "Taken as one across several bills — a correction is written to every one of them, and the shared reference that ties them is not offered."
                        )}
                      </p>
                    ) : (
                      field("transactionRef", "Transaction reference (M-Pesa code, bank ref)")
                    )}
                    <div className="space-y-1.5">
                      <Label htmlFor="fix-method">{t(locale, "How it was paid")}</Label>
                      <NativeSelect
                        id="fix-method"
                        value={form.method}
                        onChange={(e) => set("method")(e.target.value)}
                      >
                        {METHODS.map(([value, label]) => (
                          <option key={value} value={value}>
                            {t(locale, label)}
                          </option>
                        ))}
                      </NativeSelect>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {field("payerName", "Paid by")}
                      {field("payerBank", "Payer's bank")}
                    </div>
                    {field("payerAccount", "Payer's account or number")}
                    {field("notes", "Note")}
                  </>
                ) : null}

                <div className="space-y-1.5">
                  <Label htmlFor="fix-reason">
                    {open === "cancel"
                      ? t(locale, "Why? (optional)")
                      : t(locale, "What was wrong with the record? (optional)")}
                  </Label>
                  <Textarea
                    id="fix-reason"
                    rows={2}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder={t(
                      locale,
                      open === "cancel" ? "Test entry, money never received" : "Reference typed wrong"
                    )}
                  />
                </div>

                {error ? (
                  <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    {t(locale, error)}
                  </p>
                ) : null}

                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant={open === "cancel" ? "destructive" : "default"}
                    disabled={pending || reason.trim().length < 3}
                    onClick={open === "cancel" ? cancelIt : saveEdit}
                  >
                    {pending
                      ? t(locale, "Working…")
                      : open === "cancel"
                        ? t(locale, payment ? "Reverse it" : "Cancel it")
                        : t(locale, "Save the correction")}
                  </Button>
                  <Button type="button" variant="ghost" size="sm" onClick={close}>
                    {t(locale, "Leave it")}
                  </Button>
                </div>
              </div>
            </div>,
            document.body
          )
        : null}
    </span>
  );
}
