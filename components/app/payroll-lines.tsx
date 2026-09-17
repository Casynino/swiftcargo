"use client";

import { useActionState, useState } from "react";
import { CalendarPlus, Check, Download, Send } from "lucide-react";

import { FormMessage } from "@/components/app/form-message";
import { PayrollAmount } from "@/components/app/payroll-amount";
import { SubmitButton } from "@/components/app/submit-button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import {
  buildPayrollRun,
  submitPayrollRun,
  updatePayrollItem,
  type ActionState,
} from "@/lib/actions/payroll";
import { t, type Locale } from "@/lib/i18n";
import type { PayrollFigure } from "@/lib/payroll";
import { cn } from "@/lib/utils";

/*
  Finance's half of the salary run: build it, edit the exceptions, send it up.

  The lines are a grid of forms rather than a <table>. A row here has to POST on
  its own — thirty lines saved together is one clerk overwriting another's
  correction — and a <form> is not allowed inside a <tr>: the parser hoists it
  out of the table and the server and client trees stop matching.
*/

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

/** The widths every row, the header and the totals line agree on. */
const W = {
  gross: "w-24 text-right",
  adjust: "w-[4.5rem]",
  note: "w-24",
  net: "w-28 text-right",
  save: "w-8",
};

export type PayrollLineRow = {
  id: string;
  name: string;
  roleLabel: string;
  /** USD, like every stored salary figure. */
  gross: number;
  allowance: number;
  deduction: number;
  net: number;
  note: string | null;
  figures: {
    gross: PayrollFigure;
    allowance: PayrollFigure;
    deduction: PayrollFigure;
    net: PayrollFigure;
  };
};

export type PayrollTotalsView = {
  headcount: number;
  gross: PayrollFigure;
  allowance: PayrollFigure;
  deduction: PayrollFigure;
  net: PayrollFigure;
};

export type PayrollAccountOption = {
  id: string;
  name: string;
  currency: string;
};

/**
 * Build the month from the staff register.
 *
 * The period is asked for rather than assumed. Finance closes a month a few days
 * into the next one as often as not, and a screen that could only build today's
 * month would leave no way to run August on the 2nd of September.
 */
export function PayrollBuild({
  year,
  month,
  headcount,
  locale,
}: {
  year: number;
  month: number;
  /** How many staff have a monthly salary set — what the run would contain. */
  headcount: number;
  locale: Locale;
}) {
  const [state, build] = useActionState<ActionState, FormData>(buildPayrollRun, {});

  return (
    <section className="space-y-3 rounded-xl border bg-card p-4 shadow-soft">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="text-sm font-semibold">{t(locale, "Build the salary run")}</h2>
        <p className="text-xs text-muted-foreground">
          {headcount === 0
            ? t(locale, "Nobody on the staff register has a monthly salary set, so there is nothing to build yet.")
            : `${headcount} ${t(
                locale,
                "staff have a monthly salary set. Anybody missing has none — set it on their staff record."
              )}`}
        </p>
      </div>

      <form action={build} className="flex flex-wrap items-center gap-2">
        <NativeSelect name="month" defaultValue={String(month)} aria-label={t(locale, "Month")} className="h-9 w-40 text-sm">
          {MONTHS.map((name, i) => (
            <option key={name} value={i + 1}>
              {t(locale, name)}
            </option>
          ))}
        </NativeSelect>
        {/* This year and last, and no further. Anything older is a month that
            was either run at the time or never will be. */}
        <NativeSelect name="year" defaultValue={String(year)} aria-label={t(locale, "Year")} className="h-9 w-28 text-sm">
          {[year, year - 1].map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </NativeSelect>
        <SubmitButton size="sm" pendingLabel={t(locale, "Building…")}>
          <CalendarPlus />
          {t(locale, "Build it from the staff register")}
        </SubmitButton>
      </form>

      <FormMessage error={state.error} ok={state.ok} />
    </section>
  );
}

/**
 * One person's line, editable.
 *
 * Gross is printed, never typed: what somebody earns a month lives on their
 * staff record. The net is recomputed as it is typed so the effect of a
 * deduction is seen before it is saved, in dollars — the unit being typed —
 * and the server recomputes it from the same sum.
 */
function EditableLine({ line, locale }: { line: PayrollLineRow; locale: Locale }) {
  const [state, save] = useActionState<ActionState, FormData>(updatePayrollItem, {});

  const [allowance, setAllowance] = useState(line.allowance ? String(line.allowance) : "");
  const [deduction, setDeduction] = useState(line.deduction ? String(line.deduction) : "");

  const n = (v: string) => (v.trim() === "" ? 0 : Number(v.replace(/,/g, "")) || 0);
  const cents = Math.round(line.gross * 100) + Math.round(n(allowance) * 100) - Math.round(n(deduction) * 100);
  const changed = n(allowance) !== line.allowance || n(deduction) !== line.deduction;

  return (
    <form action={save} className="flex flex-wrap items-center gap-2 px-4 py-2">
      <input type="hidden" name="itemId" value={line.id} />

      <div className="min-w-[8rem] flex-1">
        <p className="truncate text-sm font-medium">{line.name}</p>
        <p className="truncate text-xs text-muted-foreground">{t(locale, line.roleLabel)}</p>
      </div>

      <PayrollAmount figure={line.figures.gross} className={W.gross} />

      {/* Typed in dollars, which is what the line is stored in. A shilling box
          would have to convert at a rate that moves, and a slip for a month that
          has passed cannot be allowed to restate itself. */}
      <Input
        name="allowance"
        inputMode="decimal"
        value={allowance}
        onChange={(e) => setAllowance(e.target.value)}
        placeholder="0.00"
        aria-label={`${t(locale, "Allowance for")} ${line.name}`}
        className={cn("h-8 text-xs", W.adjust)}
      />
      <Input
        name="deduction"
        inputMode="decimal"
        value={deduction}
        onChange={(e) => setDeduction(e.target.value)}
        placeholder="0.00"
        aria-label={`${t(locale, "Deduction for")} ${line.name}`}
        className={cn("h-8 text-xs", W.adjust)}
      />
      <Input
        name="note"
        defaultValue={line.note ?? ""}
        placeholder={t(locale, "Why")}
        aria-label={`${t(locale, "Note for")} ${line.name}`}
        className="h-8 w-full text-xs sm:w-24"
      />

      {changed ? (
        <span className={cn("tnum block whitespace-nowrap text-sm font-semibold", W.net, cents < 0 ? "text-destructive" : "")}>
          USD {(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </span>
      ) : (
        <PayrollAmount figure={line.figures.net} strong className={W.net} />
      )}

      <SubmitButton
        size="sm"
        variant="outline"
        aria-label={t(locale, "Save this line")}
        title={t(locale, "Save this line")}
        className={cn("h-8 p-0", W.save)}
        pendingLabel=""
      >
        <Check />
      </SubmitButton>

      {state.error ? (
        <div className="basis-full">
          <FormMessage error={state.error} />
        </div>
      ) : null}
    </form>
  );
}

/** The same line once the run has left Finance's hands. */
function ReadOnlyLine({
  line,
  locale,
  payslipHref,
}: {
  line: PayrollLineRow;
  locale: Locale;
  payslipHref: string | null;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 px-4 py-2">
      <div className="min-w-[8rem] flex-1">
        <p className="truncate text-sm font-medium">{line.name}</p>
        <p className="truncate text-xs text-muted-foreground">
          {t(locale, line.roleLabel)}
          {line.note ? ` · “${line.note}”` : ""}
        </p>
      </div>

      <PayrollAmount figure={line.figures.gross} className={W.gross} />
      {/* A dash where there is nothing. Most people have neither an allowance
          nor a deduction, and thirty stacked zeros would bury the two that do. */}
      <Adjustment usd={line.allowance} figure={line.figures.allowance} />
      <Adjustment usd={line.deduction} figure={line.figures.deduction} />
      <PayrollAmount figure={line.figures.net} strong className={W.net} />
      {payslipHref ? (
        <a
          href={payslipHref}
          title={t(locale, "Download payslip")}
          aria-label={`${t(locale, "Download payslip for")} ${line.name}`}
          className={cn(
            "inline-flex h-8 items-center justify-center rounded-md border text-muted-foreground hover:bg-secondary hover:text-foreground",
            W.save
          )}
        >
          <Download className="size-4" />
        </a>
      ) : null}
    </div>
  );
}

function Adjustment({ usd, figure }: { usd: number; figure: PayrollFigure }) {
  if (usd === 0) {
    return <span className={cn("text-right text-xs text-muted-foreground/50", W.adjust)}>—</span>;
  }
  return <PayrollAmount figure={figure} className={cn("text-right", W.adjust)} />;
}

/**
 * The month, line by line, and what it adds up to.
 *
 * The totals are summed from the lines on every read rather than stored on the
 * run: a line is edited here, and a header total written once would disagree
 * with the rows underneath it the moment somebody records a deduction.
 */
export function PayrollLines({
  lines,
  totals,
  editable,
  locale,
  payslipBase = null,
}: {
  lines: PayrollLineRow[];
  totals: PayrollTotalsView;
  editable: boolean;
  locale: Locale;
  /** Where a paid run's slips download from. Null until the run is paid. */
  payslipBase?: string | null;
}) {
  const slips = !editable && payslipBase !== null;

  return (
    <div className="overflow-hidden rounded-xl border bg-card shadow-soft">
      {/* Column names on the widths the rows use. Hidden until the rows fit on
          one line — a header over wrapped rows lines up with nothing. */}
      <div className="hidden items-center gap-2 border-b bg-muted/40 px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground xl:flex">
        <span className="min-w-0 flex-1">{t(locale, "Staff")}</span>
        <span className={W.gross}>{t(locale, "Salary")}</span>
        <span className={cn(W.adjust, editable ? "" : "text-right")}>
          {t(locale, "Allowance")}
          {editable ? " (USD)" : ""}
        </span>
        <span className={cn(W.adjust, editable ? "" : "text-right")}>
          {t(locale, "Deduction")}
          {editable ? " (USD)" : ""}
        </span>
        {editable ? <span className={W.note}>{t(locale, "Why")}</span> : null}
        <span className={W.net}>{t(locale, "Net")}</span>
        {editable || slips ? <span className={W.save} /> : null}
      </div>

      <div className="divide-y">
        {lines.map((line) =>
          editable ? (
            <EditableLine key={line.id} line={line} locale={locale} />
          ) : (
            <ReadOnlyLine
              key={line.id}
              line={line}
              locale={locale}
              payslipHref={slips ? `${payslipBase}?line=${encodeURIComponent(line.id)}` : null}
            />
          )
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t bg-muted/40 px-4 py-2.5">
        <span className="min-w-[8rem] flex-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {totals.headcount} {t(locale, totals.headcount === 1 ? "person on this run" : "people on this run")}
        </span>
        <PayrollAmount figure={totals.gross} className={W.gross} />
        <PayrollAmount figure={totals.allowance} className={cn("text-right", W.adjust)} />
        <PayrollAmount figure={totals.deduction} className={cn("text-right", W.adjust)} />
        {editable ? <span className={cn("hidden sm:block", W.note)} /> : null}
        <PayrollAmount figure={totals.net} strong className={W.net} />
        {slips ? (
          <a
            href={payslipBase!}
            title={t(locale, "Download every payslip")}
            aria-label={t(locale, "Download every payslip")}
            className={cn(
              "inline-flex h-8 items-center justify-center rounded-md border bg-card text-muted-foreground hover:bg-secondary hover:text-foreground",
              W.save
            )}
          >
            <Download className="size-4" />
          </a>
        ) : editable ? (
          <span className={W.save} />
        ) : null}
      </div>
    </div>
  );
}

/**
 * Send the month up.
 *
 * The account is chosen here rather than at payment, because that is what the
 * manager is being asked to agree to: money leaving a named account whose
 * balance he can check, not a total in the abstract.
 */
export function PayrollSubmit({
  runId,
  accounts,
  defaultAccountId,
  netLabel,
  rateMissing,
  locale,
}: {
  runId: string;
  accounts: PayrollAccountOption[];
  /** The account a sent-back run already named, kept so it is not re-chosen. */
  defaultAccountId: string | null;
  netLabel: string;
  /** No usable rate is published, so a shilling account cannot be paid from. */
  rateMissing: boolean;
  locale: Locale;
}) {
  const [state, submit] = useActionState<ActionState, FormData>(submitPayrollRun, {});
  const [accountId, setAccountId] = useState(defaultAccountId ?? "");

  const account = accounts.find((a) => a.id === accountId) ?? null;
  /* A dollar bill cannot leave a shilling account with no rate, and the
     settlement refuses it. Saying so now spares the manager agreeing to
     something that will not go through. */
  const needsRate = account !== null && account.currency !== "USD" && rateMissing;

  return (
    <form action={submit} className="space-y-3 rounded-xl border bg-card p-4 shadow-soft">
      <input type="hidden" name="runId" value={runId} />

      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[12rem] flex-1 space-y-1">
          <label htmlFor={`payroll-account-${runId}`} className="block text-xs font-medium text-muted-foreground">
            {t(locale, "Paid from")}
          </label>
          <NativeSelect
            id={`payroll-account-${runId}`}
            name="accountId"
            required
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            className="h-9 text-sm"
          >
            <option value="">{t(locale, "Choose the account")}</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </NativeSelect>
        </div>

        <div className="min-w-[12rem] flex-1 space-y-1">
          <label htmlFor={`payroll-note-${runId}`} className="block text-xs font-medium text-muted-foreground">
            {t(locale, "Anything the manager should know")}
          </label>
          <Input id={`payroll-note-${runId}`} name="note" placeholder={t(locale, "Optional")} className="h-9 text-sm" />
        </div>

        <SubmitButton size="sm" pendingLabel={t(locale, "Sending…")}>
          <Send />
          {t(locale, "Send it to the manager")}
        </SubmitButton>
      </div>

      <p className="text-xs text-muted-foreground">
        {account ? (
          <>
            <span className="font-semibold text-foreground">{netLabel}</span> {t(locale, "leaves")} {account.name}
            {" · "}
          </>
        ) : null}
        {t(
          locale,
          "Nothing on the run can be changed once it has gone up. It comes back only if the manager sends it back."
        )}
      </p>

      {needsRate ? (
        <p className="text-xs font-semibold text-warning">
          {t(
            locale,
            "No exchange rate is set, so a dollar salary bill cannot be paid out of a shilling account. Set one before this is agreed."
          )}
        </p>
      ) : null}

      <FormMessage error={state.error} ok={state.ok} />
    </form>
  );
}
