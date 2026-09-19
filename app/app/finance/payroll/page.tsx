import type { Metadata } from "next";
import Link from "next/link";
import type { PayrollStatus } from "@prisma/client";
import { Clock, Undo2 } from "lucide-react";

import { FinanceTabs } from "@/components/app/finance-tabs";
import { PageHeader } from "@/components/app/page-header";
import { PayrollAmount } from "@/components/app/payroll-amount";
import { PayrollBuild, PayrollLines, PayrollSubmit } from "@/components/app/payroll-lines";
import { formatDate } from "@/lib/format";
import { t } from "@/lib/i18n";
import {
  EDITABLE,
  monthLabel,
  payrollFigure,
  payrollRoster,
  payrollRun,
  payrollRuns,
  payrollView,
} from "@/lib/payroll";
import { currentExchangeRate } from "@/lib/pricing";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { cn } from "@/lib/utils";
import { localeOf } from "@/lib/viewer-locale";

import { primeLocale } from "@/lib/server-t";
import { Tx } from "@/components/app/tx";
export const metadata: Metadata = { title: "Payroll" };

/**
 * Finance prepares the month.
 *
 * Finance prepares the salary run, sends it to the manager, the manager agrees
 * it, and only then is the money deducted as a salary expense. This screen is
 * the first half of that sentence, built so the second half is never a surprise
 * — the account is named here, the total is read here, and the moment it goes up
 * the figures freeze.
 *
 * One run fills the screen rather than a list of months. A month is built,
 * corrected over a day or two and sent, and there is only ever one run anybody
 * is working on. The months behind it are a register at the foot of the page.
 */

/*
  What each status means TO FINANCE. Not shared with the manager's screen,
  which names the same states in the words of the desk reading them — "With the
  manager" here is "Waiting on you" there.
*/
const STATUS_LABEL: Record<PayrollStatus, string> = {
  DRAFT: "Being prepared",
  PENDING_APPROVAL: "With the manager",
  APPROVED: "Agreed — waiting to be paid",
  REJECTED: "Sent back to you",
  PAID: "Paid",
};

const STATUS_TONE: Record<PayrollStatus, string> = {
  DRAFT: "border-border text-muted-foreground",
  PENDING_APPROVAL: "border-warning/40 text-warning",
  APPROVED: "border-brand/40 text-brand",
  REJECTED: "border-destructive/40 text-destructive",
  PAID: "border-success/40 text-success",
};

export default async function FinancePayrollPage({
  searchParams,
}: {
  searchParams: Promise<{ run?: string }>;
}) {
  await primeLocale();
  const user = await requirePermission("payroll.prepare");
  const { run: asked } = await searchParams;

  const [locale, runs, accounts, roster, rateRow] = await Promise.all([
    localeOf(user.id),
    payrollRuns(),
    prisma.bankAccount.findMany({
      where: { active: true },
      orderBy: [{ sortOrder: "asc" }, { bankName: "asc" }],
      select: { id: true, bankName: true, currency: true },
    }),
    payrollRoster(),
    currentExchangeRate(),
  ]);
  const liveRate = rateRow?.rate ?? null;

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const thisMonth = runs.find((r) => r.year === year && r.month === month);

  /*
    Which run the screen opens on.

    A run Finance still has to act on outranks this month's: a July run sent
    back on the 3rd of August, with August already gone up, is the only thing on
    this desk anybody is waiting for. Asked-for first, then newest editable,
    then this month.
  */
  const open =
    runs.find((r) => r.id === asked) ??
    runs.find((r) => EDITABLE.includes(r.status)) ??
    thisMonth ??
    null;
  const run = open ? await payrollRun(open.id) : null;
  const view = run ? payrollView(run, liveRate) : null;
  const editable = run !== null && EDITABLE.includes(run.status);

  const history = runs.filter((r) => r.id !== run?.id);

  return (
    <div className="space-y-6">
      <PageHeader
        title={t(locale, "Payroll")}
        description={t(
          locale,
          "Build the month from the staff register, correct the exceptions, and send it to the manager. Nothing leaves an account until it is agreed."
        )}
      />
      <FinanceTabs />

      {/* Building leads when this month has no run: it is then the one thing
          to do on the screen, and it should not sit under last month's. */}
      {thisMonth ? null : <PayrollBuild year={year} month={month} headcount={roster.length} locale={locale} />}

      {run && view ? (
        <section className="space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <h2 className="text-lg font-semibold">
              {t(locale, monthLabel(run.year, run.month))}
              <span className="ml-2 font-mono text-xs font-normal text-muted-foreground">{run.code}</span>
            </h2>
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={cn(
                  "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold",
                  STATUS_TONE[run.status]
                )}
              >
                {t(locale, STATUS_LABEL[run.status])}
              </span>
              <span className="text-xs text-muted-foreground">
                {t(locale, "prepared by")} {run.preparedBy.name} · {formatDate(run.preparedAt)}
              </span>
            </div>
          </div>

          {/* The manager's reason, above everything else. It is the only message
              that travels down this workflow; under the table it would be found
              after Finance had already started guessing which line he meant. */}
          {run.status === "REJECTED" ? (
            <div className="rounded-xl border border-destructive/40 bg-destructive/[0.05] p-3">
              <p className="flex flex-wrap items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-destructive">
                <Undo2 className="size-3.5" />
                {t(locale, "Sent back")}
                {run.approvedBy ? ` · ${run.approvedBy.name}` : ""}
                {run.approvedAt ? ` · ${formatDate(run.approvedAt)}` : ""}
              </p>
              <p className="mt-1 text-sm font-medium">{run.decisionNote ?? t(locale, "No reason was given.")}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {t(
                  locale,
                  "Correct the lines below and send it up again. Last time's ruling is dropped the moment it goes."
                )}
              </p>
            </div>
          ) : null}

          {run.status === "PENDING_APPROVAL" ? (
            <p className="flex flex-wrap items-center gap-x-1.5 rounded-xl border border-warning/40 bg-warning/[0.05] p-3 text-xs text-warning">
              <Clock className="size-3.5 shrink-0" />
              <span className="font-semibold">
                {t(locale, "With the manager since")} {formatDate(run.submittedAt ?? run.preparedAt)}.
              </span>
              <span className="text-muted-foreground">
                {t(locale, "Nothing on it can change while it waits. It comes back only if he sends it back.")}
              </span>
            </p>
          ) : null}

          {run.status === "APPROVED" ? (
            <p className="flex flex-wrap items-center gap-x-1.5 rounded-xl border border-brand/40 bg-brand/[0.05] p-3 text-xs text-brand">
              <span className="font-semibold">
                {t(locale, "Agreed by")} {run.approvedBy?.name ?? "—"}
                {run.approvedAt ? ` · ${formatDate(run.approvedAt)}` : ""}
              </span>
              <span className="text-muted-foreground">
                {t(locale, "The money has not moved. The manager pays it, out of")}{" "}
                {run.account ? `${run.account.bankName} (${run.account.currency})` : t(locale, "no account named")}.
              </span>
            </p>
          ) : null}

          {run.status === "PAID" ? (
            <p className="flex flex-wrap items-center gap-x-1.5 rounded-xl border border-success/40 bg-success/[0.05] p-3 text-xs text-success">
              <span className="font-semibold">
                {t(locale, "Paid")}
                {run.paidAt ? ` · ${formatDate(run.paidAt)}` : ""}
                {run.paidBy ? ` · ${run.paidBy.name}` : ""}
              </span>
              <span className="text-muted-foreground">
                {t(locale, "out of")} {run.account ? `${run.account.bankName} (${run.account.currency})` : "—"}
                {run.expense ? ` · ${run.expense.reference}` : ""}
                {run.expense?.cancelledAt ? ` · ${t(locale, "the salaries expense has since been cancelled")}` : ""}
              </span>
            </p>
          ) : null}

          {run.note && run.status !== "REJECTED" ? (
            <p className="text-xs text-muted-foreground">
              {t(locale, "Sent up with a note:")} “<Tx>{run.note}</Tx>”
            </p>
          ) : null}

          <PayrollLines
            lines={view.lines}
            totals={view.totals}
            editable={editable}
            locale={locale}
            payslipBase={run.status === "PAID" ? `/app/finance/payroll/${run.id}/payslips` : null}
          />

          {editable ? (
            <PayrollSubmit
              runId={run.id}
              accounts={accounts.map((a) => ({
                id: a.id,
                name: `${a.bankName} (${a.currency})`,
                currency: a.currency,
              }))}
              defaultAccountId={run.accountId}
              netLabel={view.totals.net.lead}
              rateMissing={view.rateMissing}
              locale={locale}
            />
          ) : null}
        </section>
      ) : null}

      {/* The months behind it, one line each. The only figure is the net — what
          left the account, or what will. Each row opens, because a run sent back
          in March is still Finance's to fix in April. */}
      {history.length > 0 ? (
        <section>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {t(locale, "Earlier months")}
          </h2>
          <ul className="divide-y overflow-hidden rounded-xl border bg-card shadow-soft">
            {history.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/app/finance/payroll?run=${r.id}`}
                  className="flex flex-wrap items-center gap-x-3 gap-y-0.5 px-4 py-2 hover:bg-secondary/40"
                >
                  <span className="min-w-[8rem] text-sm font-medium">{t(locale, monthLabel(r.year, r.month))}</span>
                  <span className="font-mono text-xs text-muted-foreground">{r.code}</span>
                  <span
                    className={cn(
                      "inline-flex items-center rounded-full border px-1.5 py-px text-xs font-medium",
                      STATUS_TONE[r.status]
                    )}
                  >
                    {t(locale, STATUS_LABEL[r.status])}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                    {r.totals.headcount} {t(locale, "staff")}
                    {r.account ? ` · ${r.account.bankName} (${r.account.currency})` : ""}
                    {r.approvedBy ? ` · ${t(locale, "agreed by")} ${r.approvedBy.name}` : ""}
                  </span>
                  <PayrollAmount
                    figure={payrollFigure(
                      r.totals.net,
                      liveRate,
                      r.status === "PAID" && r.expense ? r.expense : null
                    )}
                    strong
                    className="text-right"
                  />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {run === null && history.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          {t(
            locale,
            "No salary run has been built yet. Build one above and it appears here, name by name, for you to correct before it goes up."
          )}
        </p>
      ) : null}
    </div>
  );
}
