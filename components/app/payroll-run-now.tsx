"use client";

import { useActionState, useState } from "react";
import { Banknote, Zap } from "lucide-react";

import { FormMessage } from "@/components/app/form-message";
import { SubmitButton } from "@/components/app/submit-button";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { runPayrollNow, type ActionState } from "@/lib/actions/payroll";
import { t, type Locale } from "@/lib/i18n";

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/**
 * The month in one press, for the chair that answers for it anyway.
 *
 * The two-step month — Finance builds, the manager accepts — remains the
 * ordinary way and keeps its same-person control. This is the explicit
 * exception: the manager runs the payroll and the money is deducted. The press
 * builds, agrees and settles the run in one transaction, and the audit trail
 * says one person did the whole thing.
 */
export function PayrollRunNow({
  accounts,
  headcount,
  totalLabel,
  defaultYear,
  defaultMonth,
  monthTaken,
  locale,
}: {
  accounts: { id: string; name: string }[];
  headcount: number;
  /** The roster total, already written in shillings on the server. */
  totalLabel: string;
  defaultYear: number;
  defaultMonth: number;
  /** The default month already has a run, so say so instead of failing. */
  monthTaken: boolean;
  locale: Locale;
}) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState<ActionState, FormData>(runPayrollNow, {});

  if (headcount === 0) return null;

  return (
    <div className="rounded-xl border border-brand/25 bg-gradient-to-br from-brand/[0.08] via-card to-card p-4 shadow-soft">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <Zap className="size-4 text-brand" />
            {t(locale, "Run this month yourself")}
          </p>
          <p className="mt-1 text-xs leading-snug text-muted-foreground">
            {headcount} {t(locale, "staff on the register")} · {totalLabel}{" "}
            {t(locale, "leaves the account you choose, as one salaries expense.")}
          </p>
        </div>
        {!open ? (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="inline-flex h-10 items-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-brand-foreground hover:bg-brand/90"
          >
            <Banknote className="size-4" />
            {t(locale, "Run payroll")}
          </button>
        ) : null}
      </div>

      {open ? (
        <form action={action} className="mt-3 space-y-3 rounded-lg border bg-background/50 p-3">
          {monthTaken ? (
            <p className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning">
              {t(
                locale,
                "This month already has a run from Finance — it is on this page and this press will refuse. Pick another month only if that is really what you mean."
              )}
            </p>
          ) : null}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="runNowMonth">{t(locale, "Month")}</Label>
              <NativeSelect id="runNowMonth" name="month" defaultValue={String(defaultMonth)}>
                {MONTHS.map((name, i) => (
                  <option key={name} value={i + 1}>
                    {t(locale, name)}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="runNowYear">{t(locale, "Year")}</Label>
              <NativeSelect id="runNowYear" name="year" defaultValue={String(defaultYear)}>
                {[defaultYear, defaultYear - 1].map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="runNowAccount">{t(locale, "Paid from")}</Label>
              <NativeSelect id="runNowAccount" name="accountId" required defaultValue="">
                <option value="" disabled>
                  {t(locale, "Choose an account")}
                </option>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </NativeSelect>
            </div>
          </div>

          <FormMessage error={state.error} ok={state.ok} />

          <div className="flex flex-wrap items-center gap-2">
            <SubmitButton pendingLabel={t(locale, "Paying…")}>
              {t(locale, "Run payroll — the money leaves now")}
            </SubmitButton>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="inline-flex h-10 items-center rounded-md px-3 text-sm text-muted-foreground hover:text-foreground"
            >
              {t(locale, "Cancel")}
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
