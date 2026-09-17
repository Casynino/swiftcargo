"use client";

import { useActionState, useEffect, useState } from "react";
import { Check, Scale, X } from "lucide-react";

import { useEscape } from "@/components/app/use-escape";
import { FormMessage } from "@/components/app/form-message";
import { SubmitButton } from "@/components/app/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { checkAccount, type ReviewActionState } from "@/lib/actions/reconciliation";
import { t, type Locale } from "@/lib/i18n";

/**
 * Where the second number comes from, in the account's own words. Naming the
 * source is also the instruction: the figure must come from outside this
 * system, which is the entire reason the form exists.
 */
const SOURCE = {
  BANK: "off the bank statement",
  MOBILE_MONEY: "off the phone",
  CASH: "counted in the tin",
} as const;

export type CheckableAccount = {
  id: string;
  name: string;
  kind: "BANK" | "MOBILE_MONEY" | "CASH";
  currency: string;
  /** What the register says right now, in the account's own currency. Display only. */
  balance: number;
  /** The same figure, already written by the server. */
  balanceText: string;
};

const digits = (currency: string) => (currency === "TZS" ? 0 : 2);

/**
 * THE ACCOUNT CHECK, OPENED OVER THE PAGE.
 *
 * A form unfolded inside a grid of equal cards stretches its whole row and
 * leaves the others as towers of empty ground; a dialog keeps the page where it
 * was behind it.
 *
 * The difference is shown the moment the figure is typed, BEFORE submitting.
 * Half the time a difference is a typo, and the form is the last place a typo
 * is cheap. The register balance shown here is not what gets stored — the
 * action reads it again on the server.
 *
 * With one account it opens straight onto that account; with `accounts` it
 * opens onto a picker, which is what the page header's button does.
 */
export function AccountCheckButton({
  locale,
  accounts,
  label,
  variant = "chip",
}: {
  locale: Locale;
  accounts: CheckableAccount[];
  label?: string;
  variant?: "chip" | "primary";
}) {
  const [open, setOpen] = useState(false);
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [actual, setActual] = useState("");
  useEscape(open, () => setOpen(false));
  const [state, action] = useActionState<ReviewActionState, FormData>(checkAccount, {});

  const account = accounts.find((a) => a.id === accountId) ?? accounts[0];

  useEffect(() => {
    if (state.ok) setActual("");
  }, [state]);

  if (!account) return null;

  const typed = actual.replace(/,/g, "").trim();
  const places = digits(account.currency);
  const scale = 10 ** places;
  const diff =
    typed === "" || !/^-?\d+(\.\d+)?$/.test(typed)
      ? null
      : Math.round((Number(typed) - account.balance) * scale) / scale;
  const format = (n: number) =>
    `${account.currency} ${Math.abs(n).toLocaleString("en-US", {
      minimumFractionDigits: places,
      maximumFractionDigits: places,
    })}`;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          variant === "primary"
            ? "focus-ring inline-flex h-10 items-center gap-2 rounded-md bg-brand px-4 text-sm font-medium text-brand-foreground shadow-soft hover:bg-brand/90"
            : "focus-ring inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-lg border border-brand/30 bg-brand/10 px-2.5 text-[11px] font-semibold text-brand transition-colors hover:bg-brand/20"
        }
      >
        <Scale className={variant === "primary" ? "size-4" : "size-3"} />
        {label ?? t(locale, "Check")}
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-50 overflow-y-auto bg-background/70 p-4 backdrop-blur-sm sm:p-8"
          role="dialog"
          aria-modal="true"
          aria-label={t(locale, "Reconcile an account")}
          onClick={(event) => {
            if (event.target === event.currentTarget) setOpen(false);
          }}
        >
          <div className="mx-auto max-w-xl">
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="min-w-0 truncate text-sm font-semibold text-foreground">
                {accounts.length > 1 ? t(locale, "Reconcile an account") : account.name}
              </p>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="focus-ring inline-flex items-center gap-1.5 rounded-lg border bg-card px-3 py-1.5 text-xs font-medium hover:bg-secondary"
              >
                <X className="size-3.5" />
                {t(locale, "Close")}
              </button>
            </div>

            <form action={action} className="rounded-xl border bg-card p-4 shadow-lg">
              {accounts.length > 1 ? (
                <div className="mb-3 space-y-1">
                  <Label htmlFor="checkAccountId" className="text-xs">
                    {t(locale, "Account")}
                  </Label>
                  <select
                    id="checkAccountId"
                    name="accountId"
                    value={account.id}
                    onChange={(event) => setAccountId(event.target.value)}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  >
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <input type="hidden" name="accountId" value={account.id} />
              )}

              {/* The first of the two numbers, where the second is typed, so the
                  comparison happens in one eyeful. */}
              <div className="flex items-baseline justify-between gap-3 rounded-lg bg-muted/40 px-3 py-2">
                <span className="text-[11px] text-muted-foreground">{t(locale, "The register says")}</span>
                <span className="tnum text-sm font-semibold">{account.balanceText}</span>
              </div>

              <div className="mt-3 space-y-1">
                <Label htmlFor="checkCounted" className="text-xs">
                  {t(locale, "What it actually holds")}{" "}
                  <span className="font-normal text-muted-foreground">
                    — {t(locale, SOURCE[account.kind])}
                  </span>
                </Label>
                {/* Negative is allowed: an overdrawn account's true balance is
                    exactly the case this form exists for. */}
                <Input
                  id="checkCounted"
                  name="counted"
                  inputMode="decimal"
                  autoComplete="off"
                  className="tnum"
                  value={actual}
                  onChange={(event) => setActual(event.target.value)}
                  required
                />
              </div>

              {diff !== null ? (
                <p
                  aria-live="polite"
                  className={`mt-2 rounded-lg px-3 py-2 text-xs font-medium ${
                    diff === 0
                      ? "bg-success/10 text-success"
                      : diff < 0
                        ? "bg-destructive/10 text-destructive"
                        : "bg-warning/10 text-warning"
                  }`}
                >
                  {diff === 0
                    ? t(locale, "Matches the register exactly.")
                    : `${diff < 0 ? t(locale, "Short by") : t(locale, "Over by")} ${format(diff)} — ${
                        diff < 0
                          ? t(locale, "the account holds less than the books say.")
                          : t(locale, "the account holds more than the books say.")
                      }`}
                </p>
              ) : null}

              <div className="mt-3 space-y-1">
                <Label htmlFor="checkNote" className="text-xs">
                  {t(locale, "Note")}
                </Label>
                <Textarea
                  id="checkNote"
                  name="note"
                  rows={2}
                  placeholder={t(locale, "e.g. bank charge not yet booked")}
                />
                {diff !== null && diff !== 0 ? (
                  <p className="text-[11px] text-warning">
                    {t(
                      locale,
                      "Say what explains the difference, or that nothing does yet — the next person to read this check will ask."
                    )}
                  </p>
                ) : null}
              </div>

              <div className="mt-3 space-y-2">
                <FormMessage error={state.error} ok={state.ok} />
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[11px] text-muted-foreground">
                    {t(locale, "This records the check beside the account. It changes no figure.")}
                  </p>
                  <SubmitButton size="sm" pendingLabel={t(locale, "Recording…")}>
                    <Check />
                    {t(locale, "Record the check")}
                  </SubmitButton>
                </div>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
