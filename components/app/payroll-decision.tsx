"use client";

import { useActionState, useState } from "react";
import { Banknote, BadgeCheck, Undo2 } from "lucide-react";

import { FormMessage } from "@/components/app/form-message";
import { SubmitButton } from "@/components/app/submit-button";
import { Input } from "@/components/ui/input";
import { decidePayrollRun, payPayrollRun, type ActionState } from "@/lib/actions/payroll";
import { t, type Locale } from "@/lib/i18n";

/**
 * Accept the month — which pays it — or send it back.
 *
 * Accepting is one press and IT MOVES THE MONEY: the action books one Salaries
 * cost for the run's total in the same transaction as the acceptance, so there
 * is no state in which the manager believes salaries are paid and the account
 * disagrees. The button says so.
 */
export function PayrollDecision({
  runId,
  code,
  locale,
}: {
  runId: string;
  code: string;
  locale: Locale;
}) {
  const [state, decide] = useActionState<ActionState, FormData>(decidePayrollRun, {});
  const [sendingBack, setSendingBack] = useState(false);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <form action={decide}>
          <input type="hidden" name="runId" value={runId} />
          <input type="hidden" name="decision" value="APPROVED" />
          <SubmitButton size="sm" pendingLabel={t(locale, "Paying…")}>
            <BadgeCheck />
            {t(locale, "Accept & pay")}
          </SubmitButton>
        </form>

        <button
          type="button"
          onClick={() => setSendingBack((v) => !v)}
          aria-expanded={sendingBack}
          className="inline-flex h-9 items-center gap-1.5 rounded-md border border-destructive/40 px-3 text-sm font-medium text-destructive hover:bg-destructive/10"
        >
          <Undo2 className="size-4" />
          {t(locale, "Send it back")}
        </button>

        <span className="text-xs text-muted-foreground">
          {t(locale, "Accepting pays it: one salaries expense for the total leaves the named account.")}
        </span>
      </div>

      {sendingBack ? (
        <form
          action={decide}
          className="flex flex-wrap items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/[0.04] p-2"
        >
          <input type="hidden" name="runId" value={runId} />
          <input type="hidden" name="decision" value="REJECTED" />
          <Input
            name="decisionNote"
            aria-label={`${t(locale, "Note on sending")} ${code} ${t(locale, "back")}`}
            placeholder={t(locale, "Note (optional) — Finance sees only this.")}
            className="h-9 min-w-[220px] flex-1 text-sm"
          />
          <SubmitButton size="sm" variant="destructive" pendingLabel={t(locale, "Sending…")}>
            {t(locale, "Send it back to Finance")}
          </SubmitButton>
        </form>
      ) : null}

      <FormMessage error={state.error} ok={state.ok} />
    </div>
  );
}

/**
 * The money leaving, for a run that was agreed and is still unpaid.
 *
 * Behind a press of its own with the consequence written above the button:
 * what gets booked, out of which account, and that the run closes on the spot.
 */
export function PayrollPay({
  runId,
  code,
  accountName,
  netLabel,
  headcount,
  needsRate,
  locale,
}: {
  runId: string;
  code: string;
  accountName: string;
  netLabel: string;
  headcount: number;
  needsRate: boolean;
  locale: Locale;
}) {
  const [state, pay] = useActionState<ActionState, FormData>(payPayrollRun, {});
  const [open, setOpen] = useState(false);
  const today = new Date().toISOString().slice(0, 10);

  if (!open) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex h-9 items-center gap-1.5 rounded-md border border-warning/50 bg-warning/10 px-3 text-sm font-semibold text-warning hover:bg-warning/20"
        >
          <Banknote className="size-4" />
          {t(locale, "Pay the salaries")}
        </button>
        <span className="text-xs text-muted-foreground">
          {t(locale, "Agreed and waiting. Nothing has left the account yet.")}
        </span>
      </div>
    );
  }

  return (
    <form action={pay} className="space-y-2 rounded-lg border border-warning/50 bg-warning/[0.05] p-3">
      <input type="hidden" name="runId" value={runId} />
      <p className="text-xs text-muted-foreground">
        {t(
          locale,
          "This is the money leaving. It books a salaries expense out of the account, the same as any other cost. The run closes on the spot and cannot be paid twice."
        )}
      </p>
      <p className="tnum text-sm font-semibold">
        {netLabel}
        <span className="ml-1.5 font-normal text-muted-foreground">
          {headcount} {t(locale, "staff")} · {t(locale, "out of")} {accountName}
        </span>
      </p>
      {needsRate ? (
        <p className="text-xs font-semibold text-destructive">
          {t(
            locale,
            "No exchange rate is set, so a dollar salary bill cannot leave a shilling account. Set one first."
          )}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        {/* The day the money actually left, which is not always today. */}
        <Input
          type="date"
          name="paidAt"
          defaultValue={today}
          max={today}
          aria-label={t(locale, "Date the money left")}
          className="h-9 w-40 text-sm"
        />
        <SubmitButton size="sm" disabled={needsRate} pendingLabel={t(locale, "Paying…")}>
          <Banknote />
          {t(locale, "Pay")} {code}
        </SubmitButton>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="h-9 rounded-md px-2 text-sm text-muted-foreground hover:text-foreground"
        >
          {t(locale, "Not now")}
        </button>
      </div>
      <FormMessage error={state.error} ok={state.ok} />
    </form>
  );
}
