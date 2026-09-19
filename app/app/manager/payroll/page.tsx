import type { Metadata } from "next";
import type { PayrollStatus } from "@prisma/client";
import { Clock } from "lucide-react";

import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { PayrollAmount } from "@/components/app/payroll-amount";
import { PayrollDecision, PayrollPay } from "@/components/app/payroll-decision";
import { PayrollLines } from "@/components/app/payroll-lines";
import { PayrollRunNow } from "@/components/app/payroll-run-now";
import { SectionLabel } from "@/components/app/section-label";
import { Card } from "@/components/ui/card";
import { formatDate } from "@/lib/format";
import { t } from "@/lib/i18n";
import {
  monthLabel,
  payrollFigure,
  payrollRoster,
  payrollRun,
  payrollRuns,
  payrollView,
  pendingPayrollApproval,
  shillingsOf,
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
 * The manager agrees the month, which pays it.
 *
 * The lines are printed in full, not summarised. Nobody can agree to a total:
 * the question this desk is being asked is whether that is the right list of
 * people at the right amounts, and that question needs the list.
 *
 * A run this reader prepared offers no controls. The action refuses it against
 * the stored preparedById, and a screen that offered the button anyway would be
 * teaching the wrong rule and then failing at the last moment.
 */

/** The status words for THIS desk. Finance's screen names them differently. */
const STATUS_LABEL: Record<PayrollStatus, string> = {
  DRAFT: "Still with Finance",
  PENDING_APPROVAL: "Waiting on you",
  APPROVED: "Agreed — not yet paid",
  REJECTED: "Sent back to Finance",
  PAID: "Paid",
};

const STATUS_TONE: Record<PayrollStatus, string> = {
  DRAFT: "border-border text-muted-foreground",
  PENDING_APPROVAL: "border-warning/40 text-warning",
  APPROVED: "border-brand/40 text-brand",
  REJECTED: "border-destructive/40 text-destructive",
  PAID: "border-success/40 text-success",
};

export default async function ManagerPayrollPage() {
  await primeLocale();
  const user = await requirePermission("payroll.approve");

  const [locale, pending, runs, rateRow, roster, accounts] = await Promise.all([
    localeOf(user.id),
    pendingPayrollApproval(),
    payrollRuns(12),
    currentExchangeRate(),
    payrollRoster(),
    prisma.bankAccount.findMany({
      where: { active: true },
      orderBy: [{ sortOrder: "asc" }, { bankName: "asc" }],
      select: { id: true, bankName: true, currency: true },
    }),
  ]);
  const liveRate = rateRow?.rate ?? null;

  /* Both queues opened in full, lines and all. A run is one per month, so this
     desk is never looking at more than two or three at once. */
  const approvedIds = runs.filter((r) => r.status === "APPROVED").map((r) => r.id);
  const opened = await Promise.all([...pending.map((p) => p.id), ...approvedIds].map((id) => payrollRun(id)));
  const detailed = opened.filter((r): r is NonNullable<typeof r> => r !== null);
  const waitedDays = new Map(pending.map((p) => [p.id, p.waitingDays]));

  const decided = runs.filter((r) => r.status === "PAID" || r.status === "REJECTED");
  const now = new Date();

  return (
    <div className="space-y-6">
      <PageHeader
        title={t(locale, "Payroll")}
        description={t(
          locale,
          "What Finance has prepared, name by name. Accept it — which pays it — or send it back with a reason."
        )}
      />

      <PayrollRunNow
        accounts={accounts.map((a) => ({ id: a.id, name: `${a.bankName} (${a.currency})` }))}
        headcount={roster.length}
        totalLabel={shillingsOf(
          roster.reduce((sum, person) => sum + person.baseSalary, 0),
          liveRate
        )}
        defaultYear={now.getFullYear()}
        defaultMonth={now.getMonth() + 1}
        monthTaken={runs.some((r) => r.year === now.getFullYear() && r.month === now.getMonth() + 1)}
        locale={locale}
      />

      {detailed.length === 0 ? (
        <Card>
          <EmptyState
            icon="BadgeCheck"
            title={t(locale, "Nothing is waiting on you")}
            description={t(
              locale,
              "Finance has not sent up a salary run, and nothing you have agreed is still unpaid."
            )}
          />
        </Card>
      ) : (
        <div className="space-y-8">
          {detailed.map((run) => {
            const waiting = run.status === "PENDING_APPROVAL";
            /* Nobody agrees their own run — the split IS the control. */
            const mine = run.preparedById === user.id;
            const days = waitedDays.get(run.id) ?? 0;
            const view = payrollView(run, liveRate);
            const accountName = run.account
              ? `${run.account.bankName} (${run.account.currency})`
              : t(locale, "no account named");

            return (
              <section key={run.id} className="space-y-3">
                <SectionLabel>
                  {t(locale, monthLabel(run.year, run.month))} · {t(locale, STATUS_LABEL[run.status])}
                </SectionLabel>

                <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-xl border bg-card px-4 py-3 shadow-soft">
                  <span className="font-mono text-xs font-semibold">{run.code}</span>
                  <span className="text-xs text-muted-foreground">
                    {t(locale, "prepared by")}{" "}
                    <span className="font-medium text-foreground">{run.preparedBy.name}</span>
                    {" · "}
                    {formatDate(run.submittedAt ?? run.preparedAt)}
                  </span>
                  {waiting ? (
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 text-xs font-semibold",
                        days >= 3 ? "text-destructive" : "text-warning"
                      )}
                    >
                      <Clock className="size-3.5" />
                      {days === 0
                        ? t(locale, "sent up today")
                        : `${t(locale, "waiting")} ${days} ${t(locale, days === 1 ? "day" : "days")}`}
                    </span>
                  ) : null}
                  <span className="text-xs text-muted-foreground">
                    {run.totals.headcount} {t(locale, "staff")}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {t(locale, "out of")} <span className="font-medium text-foreground">{accountName}</span>
                  </span>
                  <PayrollAmount figure={view.totals.net} strong className="ml-auto text-right" />
                </div>

                {run.note ? (
                  <p className="text-xs text-muted-foreground">
                    {t(locale, "Finance says:")} “<Tx>{run.note}</Tx>”
                  </p>
                ) : null}

                <PayrollLines lines={view.lines} totals={view.totals} editable={false} locale={locale} />

                {mine ? (
                  <p className="rounded-lg border border-warning/40 bg-warning/[0.04] px-3 py-2 text-xs text-muted-foreground">
                    {t(
                      locale,
                      "You prepared this run, so you cannot be the one who agrees it. Somebody else holding payroll approval has to read it."
                    )}
                  </p>
                ) : waiting ? (
                  <PayrollDecision runId={run.id} code={run.code} locale={locale} />
                ) : (
                  <PayrollPay
                    runId={run.id}
                    code={run.code}
                    accountName={accountName}
                    netLabel={view.totals.net.lead}
                    headcount={run.totals.headcount}
                    needsRate={(run.account?.currency ?? "USD") !== "USD" && view.rateMissing}
                    locale={locale}
                  />
                )}
              </section>
            );
          })}
        </div>
      )}

      {/* What has already been ruled on, short and read-only — so a run sent
          back does not vanish from the manager's view the moment he sends it. */}
      {decided.length > 0 ? (
        <section>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {t(locale, "Already ruled on")}
          </h2>
          <ul className="divide-y overflow-hidden rounded-xl border bg-card shadow-soft">
            {decided.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 px-4 py-2">
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
                  {r.status === "PAID" && r.paidAt ? ` · ${formatDate(r.paidAt)}` : ""}
                  {r.expense ? ` · ${r.expense.reference}` : ""}
                </span>
                {r.status === "PAID" ? (
                  <a
                    href={`/app/finance/payroll/${r.id}/payslips`}
                    className="text-xs font-medium text-brand hover:underline"
                  >
                    {t(locale, "Payslips")}
                  </a>
                ) : null}
                <PayrollAmount
                  figure={payrollFigure(r.totals.net, liveRate, r.status === "PAID" && r.expense ? r.expense : null)}
                  strong
                  className="text-right"
                />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
