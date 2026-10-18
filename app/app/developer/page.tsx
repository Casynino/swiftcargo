import Link from "next/link";
import type { Metadata } from "next";
import { AlertTriangle, BarChart3, Info, ScrollText, ShieldCheck, TriangleAlert } from "lucide-react";

import { Legend, RankedBars, ScoreRing, StackedBars } from "@/components/app/dev-charts";
import { ROLE_LABELS } from "@/lib/constants";
import { developerOverview, GROUPS, type Finding } from "@/lib/developer-overview";
import { requirePermission } from "@/lib/session";
import { primeLocale, T } from "@/lib/server-t";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Developer home" };

const GROUP_COLOR: Record<string, string> = {
  Owner: "bg-brand",
  Manager: "bg-violet-500",
  Finance: "bg-sky-500",
  Guangzhou: "bg-emerald-500",
  Dar: "bg-teal-500",
  Support: "bg-amber-500",
  Customers: "bg-rose-400",
  Developer: "bg-slate-400",
};

const TONE: Record<Finding["tone"], { icon: typeof Info; ring: string; badge: string; label: string }> = {
  fix: { icon: TriangleAlert, ring: "border-destructive/40 bg-destructive/5", badge: "bg-destructive/15 text-destructive", label: "Fix now" },
  look: { icon: AlertTriangle, ring: "border-warning/40 bg-warning/5", badge: "bg-warning/15 text-warning", label: "Look at it" },
  info: { icon: Info, ring: "border-border bg-card", badge: "bg-secondary text-muted-foreground", label: "Good to know" },
};

const ago = (d: Date | null) => {
  if (!d) return "never";
  const s = (Date.now() - d.getTime()) / 1000;
  if (s < 90) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} minutes ago`;
  if (s < 86400) return `${Math.round(s / 3600)} hours ago`;
  if (s < 86400 * 60) return `${Math.round(s / 86400)} days ago`;
  return `${Math.round(s / 86400 / 30)} months ago`;
};

const Card = ({ title, hint, children, className }: { title: string; hint?: string; children: React.ReactNode; className?: string }) => (
  <section className={cn("rounded-2xl border bg-card p-5", className)}>
    <h2 className="font-semibold">{title}</h2>
    {hint ? <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p> : null}
    <div className="mt-4">{children}</div>
  </section>
);

/**
 * THE DEVELOPER'S CONTROL ROOM.
 *
 * Health, people and everything done, on one page — read off the audit log,
 * the sign-in log and the accounts, never kept. What needs attention comes
 * first, then the shape of the last two weeks.
 */
export default async function DeveloperHome() {
  await primeLocale();
  const user = await requirePermission("developer.activity");
  const o = await developerOverview();

  const hello = new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "Africa/Dar_es_Salaam" });
  const need = o.findings.filter((f) => f.tone !== "info");
  const good = o.findings.filter((f) => f.tone === "info");
  const verdict = o.counts.fix > 0 ? "Something is broken" : o.counts.look > 0 ? "Working, with a few things to look at" : "Everything is working";

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-brand via-violet-500 to-fuchsia-500 px-6 py-7 text-white shadow-sm">
        <p className="flex items-center gap-2 text-xs text-white/85">
          {hello}
          <span className="rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide">{T("Developer")}</span>
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">
          {T("Good day")}, {user.name.split(" ")[0]}.
        </h1>
        <p className="mt-1 text-sm text-white/90">{T("Your control room for Swift Cargo — health, people and everything done, in one place.")}</p>
      </section>

      <section className="grid gap-6 rounded-2xl border bg-card p-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="flex items-center gap-6">
          <ScoreRing score={o.score} />
          <div>
            <h2 className="text-xl font-semibold">{T(verdict)}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {o.counts.fix === 0 && o.counts.look === 0
                ? T("Nothing needs you.")
                : o.counts.fix > 0
                  ? T("Fix the red items first.")
                  : `${o.counts.look} ${T("thing(s) worth a look. Nothing is broken.")}`}
            </p>
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              <span className="rounded-full bg-secondary px-3 py-1">{o.counts.fix} {T("to fix now")}</span>
              <span className="rounded-full bg-warning/15 px-3 py-1 text-warning">{o.counts.look} {T("to look at")}</span>
              <span className="rounded-full bg-secondary px-3 py-1">{o.counts.info} {T("for information")}</span>
            </div>
          </div>
        </div>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-5 border-t pt-5 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
          <Stat label="Database" value={o.db.ok ? "Online" : "Down"} tone={o.db.ok ? "text-success" : "text-destructive"} sub={`${o.db.ms} ms`} />
          <Stat label="Signed in today" value={String(o.signedInToday)} sub={T("different people")} />
          <Stat label="Actions today" value={String(o.actionsToday)} sub={T("saved in 24 hours")} />
          <Stat label="Alerts waiting" value={String(o.alertsWaiting)} tone={o.alertsOverDay ? "text-warning" : undefined} sub={`${o.alertsOverDay} ${T("over a day")}`} />
        </dl>
      </section>

      {o.findings.length > 0 ? (
        <section className="space-y-3">
          <div>
            <h2 className="font-semibold">{T("Needs your attention")} · {need.length}</h2>
            <p className="text-sm text-muted-foreground">{T("Checked just now.")}</p>
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            {[...need, ...good].map((f) => {
              const t = TONE[f.tone];
              return (
                <details key={f.key} className={cn("group rounded-xl border px-4 py-3", t.ring)}>
                  <summary className="flex cursor-pointer list-none items-center gap-3">
                    <t.icon className="size-5 shrink-0" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold">{f.title}</span>
                    </span>
                    <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide", t.badge)}>{T(t.label)}</span>
                  </summary>
                  <p className="mt-2 pl-8 text-sm text-muted-foreground">{f.detail}</p>
                </details>
              );
            })}
          </div>
        </section>
      ) : null}

      <div className="grid gap-4 md:grid-cols-3">
        {[
          { href: "/app/developer/users", icon: ShieldCheck, title: "Open Access (work as someone)", body: "Open the system as the owner, a team member or a partner to help them or to see what they see. Every click is recorded under your name." },
          { href: "/app/developer/activity", icon: ScrollText, title: "Open Audit", body: "The permanent diary of everything done in the system — by staff and by you. Your own lines can never be edited or deleted." },
          { href: "/app/developer/business", icon: BarChart3, title: "Open Business", body: "Customers, cargo, invoices and payments in read-only tables. Good for checking a number without risking a change." },
        ].map((c) => (
          <Link key={c.href} href={c.href} className="rounded-2xl border bg-card p-5 transition hover:border-foreground/30">
            <c.icon className="size-5 text-brand" />
            <p className="mt-3 font-semibold">{T(c.title)} →</p>
            <p className="mt-1 text-sm text-muted-foreground">{T(c.body)}</p>
          </Link>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title={T("Sign-ins per day")} hint={T("Last 14 days, coloured by who signed in. Hover a bar for exact numbers.")}>
          <StackedBars
            data={o.signinsPerDay.map((d) => ({ label: d.label, parts: GROUPS.map((g) => ({ key: g, value: d.by[g] ?? 0 })) }))}
            colors={GROUP_COLOR}
          />
          <Legend colors={GROUP_COLOR} />
        </Card>
        <Card title={T("Actions per day")} hint={T("Everything saved in the audit log, split between the team and you.")}>
          <StackedBars
            data={o.actionsPerDay.map((d) => ({ label: d.label, parts: [{ key: "Team", value: d.team }, { key: "Developer", value: d.developer }] }))}
            colors={{ Team: "bg-brand", Developer: "bg-amber-500" }}
          />
          <Legend colors={{ Team: "bg-brand", Developer: "bg-amber-500" }} />
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <Card title={T("Busiest hours of the day")} hint={T("When the team works (Tanzania time, last 14 days).")}>
          <StackedBars data={o.hours.map((n, h) => ({ label: `${h}h`, parts: [{ key: "Actions", value: n }] }))} colors={{ Actions: "bg-brand" }} height={150} />
        </Card>
        <Card title={T("Where the work happens")} hint={T("Actions by area, last 7 days.")}>
          <RankedBars rows={o.areas} />
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <Card title={T("Recent sign-ins")} hint={T("The last 12 successful sign-ins: who, on what device, from where.")}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                <tr><th className="pb-2 font-medium">{T("Person")}</th><th className="pb-2 font-medium">{T("Device")}</th><th className="pb-2 font-medium">{T("From")}</th><th className="pb-2 text-right font-medium">{T("When")}</th></tr>
              </thead>
              <tbody className="divide-y">
                {o.recent.map((r, i) => (
                  <tr key={i}>
                    <td className="py-2.5"><span className="font-medium">{r.name}</span><span className="block text-xs text-muted-foreground">{r.role ? ROLE_LABELS[r.role as keyof typeof ROLE_LABELS] : ""}</span></td>
                    <td className="py-2.5 text-muted-foreground">{r.device}</td>
                    <td className="py-2.5 font-mono text-xs text-muted-foreground">{r.ip ?? "—"}</td>
                    <td className="py-2.5 text-right text-muted-foreground">{ago(r.at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        <div className="space-y-4">
          <Card title={T("Most active people")} hint={T("Actions saved in the last 7 days.")}>
            <RankedBars rows={o.active} tone="bg-violet-500" />
          </Card>
          <Card title={T("Not using the system")} hint={T("Active accounts that never signed in, or not for 30+ days.")}>
            {o.idle.length === 0 ? (
              <p className="text-sm text-muted-foreground">{T("Everyone has signed in this month.")}</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {o.idle.map((u) => (
                  <li key={u.name} className="flex items-baseline justify-between gap-3">
                    <span className="truncate">{u.name} <span className="text-xs text-muted-foreground">· {ROLE_LABELS[u.role as keyof typeof ROLE_LABELS]}</span></span>
                    <span className="shrink-0 text-xs text-muted-foreground">{ago(u.last)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className={cn("mt-1 text-3xl font-bold tnum", tone)}>{value}</dd>
      {sub ? <p className="text-xs text-muted-foreground">{sub}</p> : null}
    </div>
  );
}
