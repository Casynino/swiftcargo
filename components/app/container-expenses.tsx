"use client";

import { useActionState, useState } from "react";
import { Ban } from "lucide-react";

import { cancelExpense, type ActionState } from "@/lib/actions/expenses";
import { CorrectExpenseDialog } from "@/components/app/correct-expense-dialog";
import {
  RecordExpense,
  type PickerContainer,
  type PickerGroup,
  type PickerHistory,
} from "@/components/app/expense-picker";
import { FormMessage } from "@/components/app/form-message";
import { SubmitButton } from "@/components/app/submit-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  containerReference,
  rows,
  accounts,
  picker,
  missing,
  totalLabel,
  totalSecondary,
  mayRecord,
  locale,
  correctionAccounts,
  correctionCategories,
}: {
  containerId: string;
  /** The sailing's own reference, so the second step names it. */
  containerReference: string;
  rows: ContainerExpenseRow[];
  accounts: { id: string; label: string }[];
  /** What this business pays for, read off the register. See the picker. */
  picker: {
    history: PickerHistory;
    groups: PickerGroup[];
    containers: PickerContainer[];
  };
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
        /* THE SAME TWO STEPS AS EVERYWHERE ELSE: what it was for, then how
           much. Opened from this sailing, so every cost recorded here is this
           sailing's and nobody is asked which container. */
        <div className="flex flex-wrap items-center justify-between gap-3 border-t px-5 py-4">
          <p className="text-sm text-muted-foreground">
            {missing.length > 0
              ? `${missing.length} ${missing.length === 1 ? tx("usual cost has") : tx("usual costs have")} ${tx("not been recorded on this container yet.")}`
              : tx("Everything usual has been recorded against this container.")}
          </p>
          <RecordExpense
            history={picker.history}
            groups={picker.groups}
            containers={picker.containers}
            executives={[]}
            accounts={accounts}
            containerId={containerId}
            label={tx("Record a cost")}
          />
        </div>
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
