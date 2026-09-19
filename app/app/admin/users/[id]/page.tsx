import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ShieldAlert } from "lucide-react";

import { ActivityBars } from "@/components/app/activity-bars";
import { ProfileHeader } from "@/components/app/profile-header";
import { SalaryForm } from "@/components/app/salary-form";
import { SmartBack } from "@/components/app/smart-back";
import { auditActionLabel, auditSentence } from "@/lib/audit-humanise";
import { DEPARTMENT_LABELS, ROLE_LABELS } from "@/lib/constants";
import { formatCbm, formatDate, formatDateTime, formatRelative } from "@/lib/format";
import { formatCurrency, isUsableRate, usdToTzs } from "@/lib/currency";
import { t } from "@/lib/i18n";
import { currentExchangeRate } from "@/lib/pricing";
import { prisma } from "@/lib/prisma";
import {
  dailyActivity,
  isOnline,
  loginHistory,
  profileActivity,
  profileStats,
} from "@/lib/profile";
import { requirePermission } from "@/lib/session";
import { localeOf } from "@/lib/viewer-locale";

import { primeLocale } from "@/lib/server-t";
import { Tx } from "@/components/app/tx";
export const metadata: Metadata = { title: "Employee" };

/**
 * The manager's view of one employee.
 *
 * What they have done, where they signed in from, what they corrected and what
 * they removed. An employee's own profile is for their work; this one is for
 * answering questions about it.
 *
 * Gated on `user.manage`. Customers are not staff and have no page here — the
 * id in the address only ever opens a staff account.
 */
export default async function EmployeeProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await primeLocale();
  const actor = await requirePermission("user.manage");
  const locale = await localeOf(actor.id);
  const { id } = await params;

  const person = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      role: true,
      department: true,
      status: true,
      createdAt: true,
      lastActiveAt: true,
      lastLoginAt: true,
      baseSalary: true,
      warehouse: { select: { name: true } },
      createdBy: { select: { name: true } },
    },
  });
  if (!person || person.role === "CUSTOMER") notFound();

  const [stats, activity, daily, logins, edits, deletions, rateRow] = await Promise.all([
    profileStats(person.id),
    profileActivity(person.id, 20),
    dailyActivity(person.id, 14),
    loginHistory(person.id, 12, locale),
    prisma.fieldChange.count({ where: { actorId: person.id } }),
    prisma.auditLog.count({
      where: { actorId: person.id, action: { contains: "delete" } },
    }),
    currentExchangeRate(),
  ]);
  const salary = person.baseSalary === null ? null : Number(person.baseSalary);

  return (
    <div className="space-y-6">
      <SmartBack fallbackHref="/app/admin/users" fallbackLabel={t(locale, "All staff")} />

      <ProfileHeader
        locale={locale}
        identity={{
          name: person.name,
          email: person.email,
          departmentLabel: person.department ? DEPARTMENT_LABELS[person.department] : "—",
          roleLabel: ROLE_LABELS[person.role],
          warehouseName: person.warehouse?.name ?? null,
          joinedLabel: formatDate(person.createdAt),
          online: isOnline(person.lastActiveAt),
          lastSeenLabel: person.lastActiveAt ? formatRelative(person.lastActiveAt) : null,
          status: person.status,
        }}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Cargo received in China", value: stats.chinaReceived.toLocaleString("en-US") },
          { label: "Volume received", value: formatCbm(stats.cbmReceived) },
          { label: "Checked in at Dar", value: stats.darCheckedIn.toLocaleString("en-US") },
          { label: "Containers worked on", value: stats.containersTouched.toLocaleString("en-US") },
        ].map((item) => (
          <div key={item.label} className="rounded-xl border bg-card p-5 shadow-soft">
            <p className="text-xs text-muted-foreground">{t(locale, item.label)}</p>
            <p className="tnum mt-1.5 text-2xl font-bold">{item.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          <section className="rounded-xl border bg-card shadow-soft">
            <div className="border-b px-5 py-4">
              <h2 className="font-semibold">{t(locale, "Last two weeks")}</h2>
              <p className="text-xs text-muted-foreground">
                {t(locale, "Actions recorded per day")}
              </p>
            </div>
            <div className="p-5">
              <ActivityBars
                points={daily.map((d) => ({ label: d.label, value: d.actions }))}
                unit={t(locale, "actions")}
              />
            </div>
          </section>

          <section className="rounded-xl border bg-card shadow-soft">
            <h2 className="border-b px-5 py-4 font-semibold">{t(locale, "Audit history")}</h2>
            {activity.length === 0 ? (
              <p className="p-5 text-sm text-muted-foreground">
                {t(locale, "Nothing recorded against this account.")}
              </p>
            ) : (
              <ol className="divide-y">
                {activity.map((entry) => (
                  <li key={entry.id} className="flex gap-4 px-5 py-3">
                    <div className="w-24 shrink-0 text-xs text-muted-foreground">
                      <p className="tnum">{entry.timeLabel}</p>
                      <p className="tnum">{entry.dateLabel}</p>
                    </div>
                    <div className="min-w-0">
                      {/* Said again from the stored row, never rewritten in it;
                          the code stays on hover for searching the full log. */}
                      <p className="text-sm">{auditSentence(locale, entry)}</p>
                      <p className="text-xs text-muted-foreground" title={entry.action}>
                        {auditActionLabel(locale, entry.action)}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>

        <div className="space-y-6">
          {/* Where a salary run reads this person's pay from. */}
          <section className="rounded-xl border bg-card shadow-soft">
            <h2 className="border-b px-5 py-4 font-semibold">{t(locale, "Payroll")}</h2>
            <SalaryForm
              userId={person.id}
              baseSalary={salary}
              shillings={
                salary !== null && rateRow && isUsableRate(rateRow.rate)
                  ? formatCurrency(usdToTzs(salary, rateRow.rate), "TZS")
                  : null
              }
              isSelf={person.id === actor.id}
              locale={locale}
            />
          </section>

          {/* The part the employee cannot see about themselves. */}
          <section className="rounded-xl border bg-card shadow-soft">
            <h2 className="flex items-center gap-2 border-b px-5 py-4 font-semibold">
              <ShieldAlert className="h-4 w-4" />
              {t(locale, "Oversight")}
            </h2>
            <dl className="divide-y">
              {[
                {
                  label: "Last sign-in",
                  value: person.lastLoginAt
                    ? formatDateTime(person.lastLoginAt)
                    : t(locale, "Never"),
                },
                {
                  label: "Last active",
                  value: person.lastActiveAt
                    ? formatRelative(person.lastActiveAt)
                    : t(locale, "Never"),
                },
                { label: "Edits made", value: String(edits) },
                { label: "Records deleted", value: String(deletions) },
                {
                  label: "Account created by",
                  value: person.createdBy?.name ?? t(locale, "System"),
                },
                { label: "Phone", value: person.phone ?? t(locale, "Not given") },
              ].map((item) => (
                <div key={item.label} className="px-5 py-3">
                  <dt className="text-xs text-muted-foreground">{t(locale, item.label)}</dt>
                  <dd className="mt-0.5 text-sm font-medium">{item.value}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section className="rounded-xl border bg-card shadow-soft">
            <h2 className="border-b px-5 py-4 font-semibold">{t(locale, "Sign-in history")}</h2>
            {logins.length === 0 ? (
              <p className="p-5 text-sm text-muted-foreground">
                {person.lastLoginAt
                  ? t(locale, "Last signed in {when}.").replace(
                      "{when}",
                      formatDateTime(person.lastLoginAt)
                    )
                  : t(locale, "No sign-ins recorded yet.")}
              </p>
            ) : (
              <ul className="divide-y text-sm">
                {logins.map((login) => (
                  <li key={login.id} className="px-5 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={
                          login.ok ? "text-foreground" : "font-medium text-destructive"
                        }
                      >
                        {login.ok ? t(locale, "Signed in") : t(locale, "Failed attempt")}
                      </span>
                      <span className="tnum text-xs text-muted-foreground">
                        {login.atLabel}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {login.device}
                      {login.ipAddress ? ` · ${login.ipAddress}` : ""}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
