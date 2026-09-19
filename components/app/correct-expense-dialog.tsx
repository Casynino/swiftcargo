"use client";

import { useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Paperclip, Pencil, Upload, X } from "lucide-react";

import { useEscape } from "@/components/app/use-escape";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { addExpenseReceipt, correctExpense } from "@/lib/actions/expenses";
import type { CorrectableExpense, CorrectionAccount } from "@/lib/expense-correction";
import { t, type Locale } from "@/lib/i18n";
import { cn } from "@/lib/utils";

import { Tx } from "@/components/app/tx";
export const pillButton =
  "inline-flex h-7 items-center gap-1 whitespace-nowrap rounded-full border bg-card px-2.5 text-xs font-medium text-foreground shadow-sm transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

const money = (currency: string) => (currency === "TZS" ? "TSh" : currency);

/**
 * CORRECT A COST FROM WHEREVER IT IS READ.
 *
 * The Edit on a cost used to be a link back to the list it was pressed on, so
 * nothing happened. The correction opens over the row instead, with every field
 * starting at what the cost says now.
 *
 * Nothing here deletes. Words are corrected in place; a paid cost's figure or
 * account is cancelled and reposted by the server, which is said in the dialog
 * before anybody presses Save, so the second number on the register is expected
 * rather than alarming.
 */
export function CorrectExpenseDialog({
  expense,
  accounts,
  categories,
  locale,
  buttonClassName,
}: {
  expense: CorrectableExpense;
  accounts: CorrectionAccount[];
  categories: { id: string; name: string }[];
  locale: Locale;
  buttonClassName?: string;
}) {
  const router = useRouter();
  const L = (english: string) => t(locale, english);
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [receiptError, setReceiptError] = useState<string | null>(null);
  useEscape(open && !pending, () => setOpen(false));
  const fileRef = useRef<HTMLInputElement>(null);

  const initial = () => ({
    expenseTypeId: expense.expenseTypeId,
    amount: expense.amount,
    description: expense.description,
    vendor: expense.vendor,
    expenseDate: expense.expenseDate,
    accountId: expense.accountId,
    notes: expense.notes,
  });
  const [form, setForm] = useState(initial);
  const [reason, setReason] = useState("");
  const set = (key: keyof ReturnType<typeof initial>) => (value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

  /* A category retired since the cost was recorded is still this cost's
     category; missing from the list, the select would quietly clear it. */
  const categoryOptions =
    expense.expenseTypeId && !categories.some((c) => c.id === expense.expenseTypeId)
      ? [{ id: expense.expenseTypeId, name: expense.expenseTypeName }, ...categories]
      : categories;
  const accountOptions =
    expense.accountId && !accounts.some((a) => a.id === expense.accountId)
      ? [{ id: expense.accountId, label: expense.accountLabel, currency: expense.currency }, ...accounts]
      : accounts;
  /* The account may move to one holding another currency — the figure is then
     retyped in that currency, and the label says which. */
  const chosen = accountOptions.find((a) => a.id === form.accountId);
  const currency = chosen?.currency ?? expense.currency;

  function close() {
    setOpen(false);
    setError(null);
    setReceiptError(null);
    setReason("");
  }

  function openIt() {
    setForm(initial());
    setOpen(true);
  }

  function save() {
    setError(null);
    start(async () => {
      const fd = new FormData();
      fd.set("expenseId", expense.id);
      fd.set("reason", reason);
      for (const [key, value] of Object.entries(form)) fd.set(key, value);
      const result = await correctExpense({}, fd);
      if (result.error) {
        setError(result.error);
        return;
      }
      close();
      router.refresh();
    });
  }

  function addReceipt() {
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setReceiptError(L("Choose a file first."));
      return;
    }
    setReceiptError(null);
    start(async () => {
      const fd = new FormData();
      fd.set("expenseId", expense.id);
      fd.set("file", file);
      const result = await addExpenseReceipt({}, fd);
      if (result.error) {
        setReceiptError(result.error);
        return;
      }
      if (fileRef.current) fileRef.current.value = "";
      router.refresh();
    });
  }

  return (
    <>
      <button type="button" onClick={openIt} className={cn(pillButton, buttonClassName)}>
        <Pencil className="size-3.5" />
        {L("Edit")}
      </button>

      {open
        ? createPortal(
            /* Portalled to the body: the lists these rows sit in scroll
               sideways, and an overflow-clipping ancestor confines even a fixed
               dialog to its own rectangle, leaving the page lit behind it. */
            <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center">
              <div
                role="dialog"
                aria-modal="true"
                aria-label={L("Correct this record")}
                className="max-h-[85dvh] w-full max-w-md space-y-3 overflow-y-auto overscroll-contain rounded-xl border bg-card p-5 text-left shadow-lg"
              >
                <div className="flex items-start justify-between gap-3">
                  <h2 className="font-semibold">{L("Correct this record")}</h2>
                  <button
                    type="button"
                    onClick={close}
                    aria-label={L("Close")}
                    className="rounded p-1 text-muted-foreground hover:text-foreground"
                  >
                    <X className="size-4" />
                  </button>
                </div>

                {expense.payroll ? (
                  <p className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning">
                    {L(
                      "This is a month's salaries. It is corrected on its run in Payroll, where the manager approves the figures — not from here."
                    )}
                  </p>
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1.5">
                        <Label htmlFor={`cx-${expense.id}-category`}>{L("Category")}</Label>
                        <NativeSelect
                          id={`cx-${expense.id}-category`}
                          value={form.expenseTypeId}
                          onChange={(e) => set("expenseTypeId")(e.target.value)}
                        >
                          <option value="">{L("Uncategorised")}</option>
                          {categoryOptions.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </NativeSelect>
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor={`cx-${expense.id}-amount`}>
                          {L("Amount")} ({money(currency)})
                        </Label>
                        <Input
                          id={`cx-${expense.id}-amount`}
                          value={form.amount}
                          inputMode="decimal"
                          onChange={(e) => set("amount")(e.target.value)}
                        />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor={`cx-${expense.id}-description`}>{L("What it was for")}</Label>
                      <Input
                        id={`cx-${expense.id}-description`}
                        value={form.description}
                        onChange={(e) => set("description")(e.target.value)}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1.5">
                        <Label htmlFor={`cx-${expense.id}-vendor`}>{L("Paid to")}</Label>
                        <Input
                          id={`cx-${expense.id}-vendor`}
                          value={form.vendor}
                          onChange={(e) => set("vendor")(e.target.value)}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor={`cx-${expense.id}-date`}>{L("Date incurred")}</Label>
                        <Input
                          id={`cx-${expense.id}-date`}
                          type="date"
                          value={form.expenseDate}
                          onChange={(e) => set("expenseDate")(e.target.value)}
                        />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor={`cx-${expense.id}-account`}>{L("Paid from")}</Label>
                      {/* No "Not paid yet" once it has been paid: money that has
                          left an account is not un-spent by clearing a select. */}
                      <NativeSelect
                        id={`cx-${expense.id}-account`}
                        value={form.accountId}
                        onChange={(e) => set("accountId")(e.target.value)}
                      >
                        {expense.paid ? (
                          <option value="" disabled>
                            {L("Choose the account")}
                          </option>
                        ) : (
                          <option value="">{L("Not paid yet")}</option>
                        )}
                        {accountOptions.map((a) => (
                          <option key={a.id} value={a.id}>
                            <Tx>{a.label}</Tx>
                          </option>
                        ))}
                      </NativeSelect>
                      {currency !== expense.currency ? (
                        <p className="text-xs text-warning">
                          {L("That account holds")} {currency}. {L("Type the figure as it left the account, in")}{" "}
                          {currency}.
                        </p>
                      ) : null}
                      {expense.paid ? (
                        <p className="text-xs text-warning">
                          {L(
                            "Moving the account or the figure on a cost that has already been paid reverses the old line and posts a corrected one — both stay on the register."
                          )}
                        </p>
                      ) : null}
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor={`cx-${expense.id}-notes`}>{L("Note")}</Label>
                      <Input
                        id={`cx-${expense.id}-notes`}
                        value={form.notes}
                        onChange={(e) => set("notes")(e.target.value)}
                      />
                    </div>
                  </>
                )}

                <div className="space-y-1.5">
                  <Label>{L("Receipt")}</Label>
                  {expense.receiptUrl ? (
                    <a
                      href={expense.receiptUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1.5 truncate rounded border bg-muted/30 px-2 py-1 text-xs font-medium text-brand hover:underline"
                    >
                      <Paperclip className="size-3 shrink-0" />
                      {L("The receipt on file")}
                    </a>
                  ) : null}
                  <div
                    className={cn(
                      "flex flex-wrap items-center gap-1.5 rounded-lg border px-2.5 py-1.5",
                      expense.receiptUrl ? "border-border" : "border-warning/50 bg-warning/[0.04]"
                    )}
                  >
                    <span className="flex shrink-0 items-center gap-1.5 text-xs font-medium text-foreground">
                      <Upload className="size-3.5 shrink-0 text-warning" />
                      {expense.receiptUrl ? L("Replace") : L("Proof")}
                    </span>
                    <input
                      ref={fileRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/heic,application/pdf"
                      className="block min-w-0 flex-1 text-xs text-muted-foreground file:mr-2 file:rounded file:border-0 file:bg-muted file:px-2 file:py-1 file:text-xs file:font-medium"
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 shrink-0 px-2 text-[11px]"
                      disabled={pending}
                      onClick={addReceipt}
                    >
                      {pending ? L("Adding…") : L("Add")}
                    </Button>
                  </div>
                  {receiptError ? <p className="text-xs text-destructive">{receiptError}</p> : null}
                </div>

                {expense.payroll ? null : (
                  <div className="space-y-1.5">
                    <Label htmlFor={`cx-${expense.id}-reason`}>{L("What was wrong with the record?")}</Label>
                    <Textarea
                      id={`cx-${expense.id}-reason`}
                      rows={2}
                      required
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder={L("Amount typed wrong")}
                    />
                  </div>
                )}

                {error ? (
                  <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    {L(error)}
                  </p>
                ) : null}

                <div className="flex flex-wrap gap-2">
                  {expense.payroll ? null : (
                    <Button
                      type="button"
                      size="sm"
                      disabled={pending || reason.trim().length < 3}
                      onClick={save}
                    >
                      {pending ? L("Working…") : L("Save the correction")}
                    </Button>
                  )}
                  <Button type="button" variant="ghost" size="sm" onClick={close}>
                    {L("Leave it")}
                  </Button>
                </div>
              </div>
            </div>,
            document.body
          )
        : null}
    </>
  );
}
