"use client";

import { useActionState } from "react";

import { FormMessage } from "@/components/app/form-message";
import { SubmitButton } from "@/components/app/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { setBaseSalary, type ActionState } from "@/lib/actions/users";
import { t, type Locale } from "@/lib/i18n";

/**
 * The monthly salary on a staff record.
 *
 * Typed in dollars, which is what the column holds and what a run copies. Blank
 * takes the person off the payroll rather than paying them nothing.
 */
export function SalaryForm({
  userId,
  baseSalary,
  shillings,
  isSelf,
  locale,
}: {
  userId: string;
  baseSalary: number | null;
  /** The same figure at the published rate, already written out. */
  shillings: string | null;
  isSelf: boolean;
  locale: Locale;
}) {
  const [state, action] = useActionState<ActionState, FormData>(setBaseSalary, {});

  return (
    <form action={action} className="space-y-3 p-5">
      <input type="hidden" name="userId" value={userId} />
      <div className="space-y-1.5">
        <Label htmlFor={`salary-${userId}`} className="text-xs">
          {t(locale, "Monthly salary (USD)")}
        </Label>
        <Input
          id={`salary-${userId}`}
          name="baseSalary"
          inputMode="decimal"
          defaultValue={baseSalary === null ? "" : baseSalary.toFixed(2)}
          placeholder={t(locale, "Not on the payroll")}
          disabled={isSelf}
        />
        <p className="text-xs text-muted-foreground">
          {baseSalary === null
            ? t(locale, "Blank means this person is left off every salary run.")
            : shillings
              ? `${t(locale, "About")} ${shillings} ${t(locale, "a month at today's rate.")}`
              : null}
        </p>
      </div>
      {isSelf ? (
        <p className="text-xs text-muted-foreground">
          {t(locale, "Somebody else sets your own salary.")}
        </p>
      ) : (
        <SubmitButton size="sm" pendingLabel={t(locale, "Saving…")}>
          {t(locale, "Save salary")}
        </SubmitButton>
      )}
      <FormMessage
        error={state.error ? t(locale, state.error) : undefined}
        ok={state.ok ? t(locale, state.ok) : undefined}
      />
    </form>
  );
}
