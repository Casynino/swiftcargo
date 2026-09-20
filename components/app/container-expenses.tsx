"use client";

import { useActionState, useState } from "react";
import { Ban, Plus } from "lucide-react";

import {
  cancelExpense,
  recordExpense,
  type ActionState,
} from "@/lib/actions/expenses";
import { CorrectExpenseDialog } from "@/components/app/correct-expense-dialog";
import { FormMessage } from "@/components/app/form-message";
import { SubmitButton } from "@/components/app/submit-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import type { CorrectableExpense, CorrectionAccount } from "@/lib/expense-correction";
import type { Locale } from "@/lib/i18n";
import { cn } from "@/lib/utils";

import { useT } from "@/components/app/locale-provider";
import { Tx } from "@/components/app/tx";
export type ContainerExpenseRow = {
  id: string;
  reference: string;
  name: string;
  account: string | null;
  amountLabel: string;
  /** Share of everything this sailing has cost. */
  share: number;
  cancelled: boolean;
  cancelledReason: string | null;
  /** Present when the viewer may correct it and it is still counting. */
  correction: CorrectableExpense | null;
};

type Correcting = {
  locale: Locale;
  accounts: CorrectionAccount[];
  categories: { id: string; name: string }[];
};

/**
 * WHAT THIS SAILING COST, RECORDED WHERE THE SAILING IS.
 *
 * Costs were being entered on a page of their own, which meant choosing the
 * container from a list of forty — and a cost filed against the wrong box is a
 * margin wrong on two sailings at once. Here the container is fixed and cannot
 * be got wrong.
 *
 * The "still to record" line is the point: a container that has landed and has
 * no clearing charge against it is not a cheap container, it is an incomplete
 * one, and its margin is a lie until somebody enters the rest.
 */
export function ContainerExpenses({
  containerId,
  rows,
  types,
  accounts,
  missing,
  totalLabel,
  totalSecondary,
  mayRecord,
  locale,
  correctionAccounts,
  correctionCategories,
}: {
  containerId: string;
  rows: ContainerExpenseRow[];
  types: { id: string; name: string }[];
  accounts: { id: string; label: string }[];
  /** Usual costs with nothing recorded against this container yet. */
  missing: string[];
  totalLabel: string;
  totalSecondary: string | null;
  mayRecord: boolean;
  locale: Locale;
  correctionAccounts: readonly CorrectionAccount[];
  correctionCategories: readonly { id: string; name: string }[];
}) {
  const tx = useT();
  const correcting: Correcting = {
    locale,
    accounts: [...correctionAccounts],
    categories: [...correctionCategories],
  };
  const [state, action] = useActionState<ActionState, FormData>(
    recordExpense,
    {}
  );

  return (
    <section className="overflow-hidden rounded-xl border border-destructive/25 bg-destructive/[0.03] shadow-soft">
      <header className="flex flex-wrap items-start justify-between gap-3 px-5 py-4">
        <div>
          <h2 className="font-semibold">{tx("Expenses on this container")}</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {rows.filter((r) => !r.cancelled).length} expense
            {rows.filter((r) => !r.cancelled).length === 1 ? "" : "s"}
            {missing.length > 0
              ? ` · ${missing.length} usual cost${missing.length === 1 ? "" : "s"} still to record`
              : " · nothing usual is missing"}
          </p>
        </div>
        <div className="text-right">
          <p className="tnum text-2xl font-semibold text-destructive">
            {totalLabel}
          </p>
          {totalSecondary ? (
            <p className="tnum text-xs text-muted-foreground">
              {totalSecondary}
            </p>
          ) : null}
        </div>
      </header>

      {rows.length === 0 ? (
        /* Said plainly, because a blank card reads as "no costs" when it means
           "nobody has entered the costs" — and the margin above is wrong by
           exactly the difference. */
        <p className="border-t px-5 py-4 text-sm text-muted-foreground">
          {tx("Nothing recorded against this container yet, so its profit has nothing taken off it.")}
        </p>
      ) : null}

      {rows.length > 0 ? (
        <ul className="divide-y border-t">
          {rows.map((row) => (
            <ExpenseRow key={row.id} row={row} mayRecord={mayRecord} correcting={correcting} />
          ))}
        </ul>
      ) : null}

      {mayRecord ? (
        <form
          action={action}
          className="flex flex-wrap items-end gap-3 border-t px-5 py-4"
        >
          <input type="hidden" name="containerId" value={containerId} />
          <div className="min-w-[14rem] flex-1 space-y-1.5">
            <Label htmlFor="quick-type" className="text-xs">
              {tx("Expense")}
            </Label>
            <NativeSelect id="quick-type" name="expenseTypeId" defaultValue="">
              <option value="">{tx("Something else")}</option>
              {types.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                  {missing.includes(t.name) ? " — not recorded yet" : ""}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="w-36 space-y-1.5">
            <Label htmlFor="quick-amount" className="text-xs">
              {tx("Amount")}
            </Label>
            <Input
              id="quick-amount"
              name="amount"
              type="number"
              step="0.01"
              min="0.01"
              required
              defaultValue=""
            />
          </div>
          <div className="w-28 space-y-1.5">
            <Label htmlFor="quick-currency" className="text-xs">
              {tx("Currency")}
            </Label>
            <NativeSelect
              id="quick-currency"
              name="currency"
              defaultValue="USD"
            >
              <option value="USD">USD</option>
              <option value="TZS">TZS</option>
            </NativeSelect>
          </div>
          <div className="min-w-[12rem] flex-1 space-y-1.5">
            <Label htmlFor="quick-account" className="text-xs">
              {tx("Paid from")}
            </Label>
            <NativeSelect id="quick-account" name="accountId" defaultValue="">
              {/* A cost with no account is real money the balances cannot
                  account for, so the screen names that rather than assuming. */}
              <option value="">{tx("Not paid yet")}</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  <Tx>{a.label}</Tx>
                </option>
              ))}
            </NativeSelect>
          </div>
          <SubmitButton>
            <Plus className="mr-1.5 size-4" />
            {tx("Add")}
          </SubmitButton>
          <div className="w-full">
            <FormMessage error={state.error} ok={state.ok} />
          </div>
        </form>
      ) : null}
    </section>
  );
}

function ExpenseRow({
  row,
  mayRecord,
  correcting,
}: {
  row: ContainerExpenseRow;
  mayRecord: boolean;
  correcting: Correcting;
}) {
  const tx = useT();
  const [state, action] = useActionState<ActionState, FormData>(
    cancelExpense,
    {}
  );
  const [asking, setAsking] = useState(false);

  return (
    <li
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 px-5 py-3",
        row.cancelled && "opacity-70"
      )}
    >
      <div className="min-w-0">
        <p
          className={cn(
            "flex flex-wrap items-baseline gap-2 font-medium",
            row.cancelled && "line-through"
          )}
        >
          {row.name}
          <span className="text-xs font-normal text-muted-foreground">
            {row.account ?? "not paid yet"}
          </span>
        </p>
        <p className="tnum text-xs text-muted-foreground">{row.reference}</p>
        {row.cancelledReason ? (
          <p className="mt-0.5 text-sm text-warning">
            Cancelled — {row.cancelledReason}
          </p>
        ) : null}
      </div>

      {asking ? (
        <form action={action} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="expenseId" value={row.id} />
          <Input
            name="reason"
            placeholder={tx("Why is it being cancelled?")}
            className="w-60"
          />
          <SubmitButton size="sm" variant="destructive">
            {tx("Cancel it")}
          </SubmitButton>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => setAsking(false)}
          >
            {tx("Keep it")}
          </Button>
          <FormMessage error={state.error} ok={state.ok} />
        </form>
      ) : (
        <div className="flex items-center gap-4">
          <span className="tnum text-xs text-muted-foreground">
            {Math.round(row.share)}%
          </span>
          <span
            className={cn(
              "tnum font-semibold text-destructive",
              row.cancelled && "line-through"
            )}
          >
            {row.amountLabel}
          </span>
          {mayRecord && row.correction ? (
            <CorrectExpenseDialog
              expense={row.correction}
              accounts={correcting.accounts}
              categories={correcting.categories}
              locale={correcting.locale}
            />
          ) : null}
          {mayRecord && !row.cancelled ? (
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-2"
              onClick={() => setAsking(true)}
            >
              <Ban className="mr-1 size-3" />
              {tx("Cancel")}
            </Button>
          ) : null}
        </div>
      )}
    </li>
  );
}
