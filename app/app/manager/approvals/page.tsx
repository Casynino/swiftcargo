import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  CalendarClock,
  CheckCircle2,
  FileText,
  Percent,
  Ship,
  ShieldCheck,
  TriangleAlert,
  Wallet,
  XCircle,
  type LucideIcon,
} from "lucide-react";

import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { approvalQueues, decisionHistory, type QueueKey } from "@/lib/approvals";
import { ROLE_LABELS } from "@/lib/constants";
import { formatCurrency } from "@/lib/currency";
import { formatDateTime } from "@/lib/format";
import { t } from "@/lib/i18n";
import { can } from "@/lib/rbac";
import { requirePermission } from "@/lib/session";
import { cn } from "@/lib/utils";
import { localeOf } from "@/lib/viewer-locale";

import { primeLocale } from "@/lib/server-t";
export const metadata: Metadata = { title: "Approvals" };

const ICONS: Record<QueueKey, LucideIcon> = {
  credit: CalendarClock,
  payments: ShieldCheck,
  prices: FileText,
  rates: Percent,
  statements: Ship,
  payroll: Wallet,
  claims: TriangleAlert,
};

type View = "waiting" | "approved" | "rejected";

/**
 * What the money on the right of each row IS, said on the row.
 *
 * One column filled from different questions — what a customer still owes,
 * what a claim says arrived, what a draft was priced at, what a sailing billed —
 * inherits whatever the reader assumed the column meant unless each figure
 * names itself. A queue with no entry prints no figure.
 */
const VALUE_LABEL: Partial<Record<QueueKey, string>> = {
  credit: "still owed",
  payments: "claimed, at each payment's rate",
  prices: "in draft, at today's rate",
  statements: "billed on those containers",
  payroll: "net pay, at today's rate",
};

/**
 * Everything waiting on a decision, how long it has been waiting, and what has
 * lately been decided.
 *
 * The second column is the point of the board. Any of these queues can be
 * opened on its own screen, and on its own screen a backlog looks like a to-do
 * list; it is only next to the age of its oldest item that "eleven payments"
 * becomes "eleven payments, the oldest sitting nine days".
 *
 * Nothing is decided here — every row opens the screen where the decision is
 * taken, with the evidence attached to it. A manager who cannot rule on one of
 * these still sees the row, without its arrow: knowing Finance is behind is the
 * job even when signing it off is not.
 */
export default async function ManagerApprovals({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  await primeLocale();
  const user = await requirePermission("record.review");
  const { view } = await searchParams;
  const tab: View = view === "approved" || view === "rejected" ? view : "waiting";

  const [locale, queues, decided] = await Promise.all([
    localeOf(user.id),
    approvalQueues(),
    decisionHistory(),
  ]);

  const waiting = queues.filter((q) => q.count > 0);
  const clear = queues.filter((q) => q.count === 0);
  /* Items, not queues. What the manager is being told is how many things are
     sitting, not how this page happens to group them. */
  const waitingCount = waiting.reduce((n, q) => n + q.count, 0);
  const oldestDays = Math.max(0, ...waiting.map((q) => q.oldestDays ?? 0));

  const approved = decided.filter((d) => d.outcome === "approved");
  const rejected = decided.filter((d) => d.outcome === "rejected");
  const rows = tab === "approved" ? approved : tab === "rejected" ? rejected : [];

  const chip =
    "focus-ring rounded-full border px-3 py-1 text-xs font-medium transition-colors";
  const tabs: { key: View; label: string; count: number }[] = [
    { key: "waiting", label: "Waiting", count: waitingCount },
    { key: "approved", label: "Approved", count: approved.length },
    { key: "rejected", label: "Sent back", count: rejected.length },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title={t(locale, "Approvals")}
        description={t(
          locale,
          "Every queue in the company that is waiting on somebody, oldest item first — and what has lately been ruled on."
        )}
      />

      <div>
        {/* Each count is of what its own view actually holds, so a chip reading
            zero is a promise the view is empty. */}
        <div className="mb-3 flex flex-wrap gap-1.5">
          {tabs.map((option) => (
            <Link
              key={option.key}
              href={
                option.key === "waiting"
                  ? "/app/manager/approvals"
                  : `/app/manager/approvals?view=${option.key}`
              }
              aria-current={tab === option.key ? "page" : undefined}
              className={cn(
                chip,
                tab === option.key
                  ? "border-brand bg-brand text-brand-foreground"
                  : "bg-card text-muted-foreground hover:bg-accent hover:text-foreground"
              )}
            >
              {t(locale, option.label)}
              <span className="tnum ml-1.5 opacity-70">{option.count}</span>
            </Link>
          ))}
        </div>

        {/* The alarm follows the reader. A backlog that vanishes the moment
            somebody looks at last week's rulings is a backlog nobody clears. */}
        {tab !== "waiting" && waitingCount > 0 ? (
          <Link
            href="/app/manager/approvals"
            className={cn(
              "focus-ring mb-3 flex flex-wrap items-baseline gap-x-1.5 rounded-lg border px-3 py-2 text-[11px] font-medium",
              oldestDays >= 3
                ? "border-destructive/40 bg-destructive/[0.05] text-destructive"
                : "border-warning/40 bg-warning/[0.05] text-warning"
            )}
          >
            <span className="tnum">{waitingCount}</span>
            <span>{t(locale, "still waiting")}</span>
            <span className="opacity-80">
              ·{" "}
              {oldestDays === 0
                ? t(locale, "oldest today")
                : `${t(locale, "oldest")} ${oldestDays}${t(locale, "d")}`}
            </span>
          </Link>
        ) : null}

        {tab === "waiting" ? (
          waiting.length === 0 ? (
            <EmptyState
              icon="BadgeCheck"
              title={t(locale, "Nothing is waiting")}
              description={t(
                locale,
                "No credit request, payment, price, container statement or claim is sitting undecided."
              )}
            />
          ) : (
            <div className="space-y-2">
              {waiting.map((q) => {
                const Icon = ICONS[q.key] ?? BadgeCheck;
                const mine = can(user.role, q.permission);
                /* Aging is the alarm, not the count. A queue of one nobody has
                   looked at for a week is worse than twenty from today. The rate
                   row is information and never raises it. */
                const stale = q.key !== "rates" && (q.oldestDays ?? 0) >= 3;
                const label = VALUE_LABEL[q.key];
                return (
                  <Link
                    key={q.key}
                    href={q.href}
                    className="focus-ring group flex items-center gap-3 rounded-xl border bg-card p-3 transition-colors hover:border-brand/40 hover:bg-accent/40"
                  >
                    <span
                      className={cn(
                        "grid size-9 shrink-0 place-items-center rounded-lg",
                        stale
                          ? "bg-destructive/10 text-destructive"
                          : "bg-muted text-muted-foreground"
                      )}
                    >
                      <Icon className="size-4" />
                    </span>

                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-baseline gap-x-2">
                        <span className="text-sm font-semibold">{t(locale, q.label)}</span>
                        <span className="tnum text-sm text-muted-foreground">{q.count}</span>
                        {q.oldestDays !== null ? (
                          <span
                            className={cn(
                              "text-[11px]",
                              stale ? "font-semibold text-destructive" : "text-muted-foreground"
                            )}
                          >
                            {q.oldestDays === 0
                              ? t(locale, "oldest today")
                              : `${t(locale, "oldest")} ${q.oldestDays}${t(locale, "d")}`}
                          </span>
                        ) : null}
                      </span>
                      <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                        {t(locale, q.detail)}
                      </span>
                    </span>

                    {label && q.valueTzs !== null && q.valueTzs.greaterThan(0) ? (
                      <span className="shrink-0 text-right">
                        <span className="tnum block text-sm font-semibold">
                          {formatCurrency(q.valueTzs, "TZS")}
                        </span>
                        <span className="block text-[11px] leading-snug text-muted-foreground">
                          {t(locale, label)}
                        </span>
                      </span>
                    ) : null}

                    {/* No arrow where the reader is watching rather than
                        deciding. The row still opens — reading is not ruling. */}
                    <ArrowRight
                      className={cn(
                        "size-4 shrink-0",
                        mine
                          ? "text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground"
                          : "text-muted-foreground/25"
                      )}
                    />
                  </Link>
                );
              })}
            </div>
          )
        ) : rows.length === 0 ? (
          <EmptyState
            icon="History"
            title={
              tab === "approved"
                ? t(locale, "Nothing agreed yet")
                : t(locale, "Nothing sent back")
            }
            description={t(
              locale,
              "Rulings appear here the moment they are made, on the screen that makes them."
            )}
          />
        ) : (
          <ul className="space-y-2">
            {rows.map((d) => {
              const ruled = d.outcome === "approved";
              return (
                <li key={d.id}>
                  <Link
                    href={d.href}
                    className="focus-ring flex items-start gap-3 rounded-xl border bg-card p-3 transition-colors hover:border-brand/40 hover:bg-accent/40"
                  >
                    {/* The raw action code stays on the title, for whoever wants
                        to find the row again in the audit log. */}
                    <span
                      title={d.action}
                      aria-label={t(locale, ruled ? "Approved" : "Sent back")}
                      className={cn(
                        "mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg",
                        ruled ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"
                      )}
                    >
                      {ruled ? (
                        <CheckCircle2 className="size-3.5" />
                      ) : (
                        <XCircle className="size-3.5" />
                      )}
                    </span>

                    <span className="min-w-0 flex-1">
                      {/* The stored sentence, untouched. Every send-back writes
                          its reason into it, so the "why" is this line. */}
                      <span className="block text-sm">{d.summary}</span>
                      <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                        {d.actor ?? t(locale, "System")}
                        {d.role ? ` · ${t(locale, ROLE_LABELS[d.role])}` : ""}
                        {" · "}
                        {formatDateTime(d.at)}
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}

        {tab === "waiting" && clear.length > 0 && waiting.length > 0 ? (
          <p className="mt-3 text-[11px] text-muted-foreground">
            {t(locale, "Clear:")} {clear.map((q) => t(locale, q.label)).join(" · ")}
          </p>
        ) : null}

        {tab !== "waiting" ? (
          <p className="mt-3 text-[11px] text-muted-foreground">
            {t(
              locale,
              "The last 30 of each: payments verified, sent back and reversed, credit releases and withdrawals, container prices confirmed, and cases finished."
            )}
            {can(user.role, "audit.view") ? (
              <>
                {" "}
                <Link
                  href="/app/finance/audit"
                  className="focus-ring rounded underline-offset-2 hover:underline"
                >
                  {t(locale, "The full log has everything else.")}
                </Link>
              </>
            ) : null}
          </p>
        ) : null}
      </div>
    </div>
  );
}
