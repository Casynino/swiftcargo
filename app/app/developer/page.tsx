import Link from "next/link";
import type { Metadata } from "next";
import { AlertTriangle, BarChart3, Info, ScrollText, TriangleAlert } from "lucide-react";

import { AddAccountDialog } from "@/components/app/add-account-dialog";
import { Legend, RankedBars, ScoreRing, StackedBars } from "@/components/app/dev-charts";
import { WorkAsDialog } from "@/components/app/work-as-dialog";
import { startWorkAs } from "@/lib/actions/developer";
import { ROLE_LABELS } from "@/lib/constants";
import { developerOverview, GROUPS, type Finding } from "@/lib/developer-overview";
import { runChecks, type CheckResult } from "@/lib/developer-checks";
import { activityKpis, businessPulse, dataPulse, dbSize, deployment, errorList, jobsTable, messagesPulse, peoplePulse, securityExtras, securityPulse, settingsPulse, timings } from "@/lib/developer-system";
import { WhoCanDo } from "@/components/app/who-can-do";
import { ROLE_PERMISSIONS } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
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
  const [o0, extra, warehouses, people] = await Promise.all([
    developerOverview(),
    runChecks(),
    prisma.warehouse.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true, kind: true } }),
    prisma.user.findMany({
      where: { active: true, status: "ACTIVE", role: { notIn: ["CUSTOMER", "DEVELOPER"] } },
      orderBy: [{ role: "asc" }, { name: "asc" }],
      select: { id: true, name: true, role: true },
    }),
  ]);

  /* What the business is waiting on counts toward the health of the whole. */
  const findings = [...o0.findings, ...extra.findings.map((f) => ({ ...f }))] as Finding[];
  const counts = {
    fix: findings.filter((f) => f.tone === "fix").length,
    look: findings.filter((f) => f.tone === "look").length,
    info: findings.filter((f) => f.tone === "info").length,
  };
  const o = {
    ...o0,
    findings,
    counts,
    score: Math.max(0, Math.min(100, 100 - counts.fix * 35 - counts.look * 15 - Math.min(counts.info, 3) * 2)),
  };

  const envMissing = ["AUTH_SECRET", "DATABASE_URL", "DIRECT_URL", "BLOB_READ_WRITE_TOKEN", "CRON_SECRET", "NEXT_PUBLIC_SITE_URL"].filter((n) => !process.env[n]?.trim()).length;
  /* One page: everything is read, and each part has its own section. */
  const [biz, kpis, msgs, sec, set, ppl, data, errs, jobs, times, size, secX] = await Promise.all([
    businessPulse(),
    activityKpis(),
    messagesPulse(),
    securityPulse(),
    settingsPulse(),
    peoplePulse(),
    dataPulse(),
    errorList(),
    jobsTable(),
    timings(),
    dbSize(),
    securityExtras(),
  ]);
  const deploy = deployment();
  const checks = extra.results;
  const fine = checks.filter((c) => c.status === "ok").length;
  const staffRoles = Array.from(new Set(people.map((p) => p.role)));
  const grants = Object.fromEntries(staffRoles.map((r) => [r, ROLE_PERMISSIONS[r as keyof typeof ROLE_PERMISSIONS] as string[]]));
  const allPermissions = [...ROLE_PERMISSIONS.ADMIN] as string[];

  const hour = Number(new Date().toLocaleString("en-GB", { hour: "2-digit", hour12: false, timeZone: "Africa/Dar_es_Salaam" })) % 24;
  const greeting = hour >= 5 && hour < 12 ? T("Good morning") : hour >= 12 && hour < 17 ? T("Good afternoon") : T("Good evening");
  const hello = new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "Africa/Dar_es_Salaam" });
  const need = o.findings.filter((f) => f.tone !== "info");
  const good = o.findings.filter((f) => f.tone === "info");
  const verdict = o.counts.fix > 0 ? "Something is broken" : o.counts.look > 0 ? "Working, with a few things to look at" : "Everything is working";

  return (
    <div className="space-y-6">
      <section
        className="relative overflow-hidden rounded-2xl px-5 py-5 text-white sm:px-8 sm:py-6"
        style={{ backgroundImage: "linear-gradient(135deg, #2e1065 0%, #5b21b6 55%, #7c3aed 100%)" }}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.12]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)",
            backgroundSize: "36px 36px",
          }}
        />
        <div className="relative">
          <div className="flex flex-wrap items-center gap-2.5 text-xs font-medium text-white/80">
            <span>{hello}</span>
            <span className="rounded-full bg-white/20 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-white">{T("Developer")}</span>
          </div>
          <h1 className="mt-2 text-2xl font-bold leading-tight tracking-tight sm:text-3xl">
            {greeting}, {user.name.split(" ")[0]}.
          </h1>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-white/80">{T("Your control room for Swift Cargo — health, people and everything done, in one place.")}</p>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <WorkAsDialog people={people} />
        <AddAccountDialog warehouses={warehouses} variant="card" />
        {[
          { href: "/app/developer/activity", icon: ScrollText, title: "Audit", body: "Everything done in the system, by staff and by you." },
          { href: "/app/developer/business", icon: BarChart3, title: "Business", body: "Cargo, bills, payments and customers. Read only." },
        ].map((c) => (
          <Link key={c.href} href={c.href} className="group flex items-start gap-3.5 rounded-xl border bg-card p-4 shadow-soft transition-all hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-md">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand/10 text-brand"><c.icon className="size-5" /></span>
            <span>
              <span className="block text-sm font-semibold">{T(c.title)} →</span>
              <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">{T(c.body)}</span>
            </span>
          </Link>
        ))}
      </div>



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
          <Stat label="Server errors" value={String(o.errors24)} tone={o.errors24 ? "text-warning" : undefined} sub={T("in 24 hours")} />
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
                <details key={f.key} open={f.tone !== "info"} className={cn("group rounded-xl border px-4 py-3 lg:col-span-2", t.ring)}>
                  <summary className="flex cursor-pointer list-none items-center gap-3">
                    <t.icon className="size-5 shrink-0" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold">{f.title}</span>
                    </span>
                    <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide", t.badge)}>{T(t.label)}</span>
                  </summary>
                  <p className="mt-2 pl-8 text-sm text-muted-foreground">{f.detail}</p>
                  {f.lines?.length ? (
                    <ul className="mt-2 space-y-0.5 pl-8 text-xs text-muted-foreground">
                      {f.lines.map((l, i) => <li key={i} className="truncate font-mono">• {l}</li>)}
                    </ul>
                  ) : null}
                  {f.fix ? (
                    <p className="mt-3 pl-8 text-sm"><span className="font-semibold">{T("What to do:")}</span> {f.fix}</p>
                  ) : null}
                  {f.href || f.workAs ? (
                    <div className="mt-3 flex flex-wrap items-center gap-2 pl-8">
                      {f.href ? (
                        <Link href={f.href} className="rounded-lg border px-3 py-1.5 text-xs font-medium hover:bg-secondary">{T("Look at it")}</Link>
                      ) : null}
                      {(() => {
                        const who = f.workAs ? people.find((p) => p.role === f.workAs) : null;
                        return who ? (
                          <form action={startWorkAs}>
                            <input type="hidden" name="userId" value={who.id} />
                            {f.href ? <input type="hidden" name="next" value={f.href} /> : null}
                            <button type="submit" className="rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-brand-foreground hover:opacity-90">{T("Work as")} {who.name.split(" ")[0]} · {ROLE_LABELS[who.role as keyof typeof ROLE_LABELS]}</button>
                          </form>
                        ) : null;
                      })()}
                    </div>
                  ) : null}
                  {f.items?.length ? (
                    <ul className="mt-3 space-y-2 pl-8">
                      {f.items.map((it, i) => (
                        <li key={i} className="flex flex-wrap items-center gap-3 rounded-lg border bg-card/60 px-3 py-2.5">
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">{it.title}</p>
                            <p className="truncate text-xs text-muted-foreground">
                              {T("For")} {it.who} · {ROLE_LABELS[it.role as keyof typeof ROLE_LABELS]} · {it.age}
                              {it.body ? ` — ${it.body}` : ""}
                            </p>
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            {it.href ? (
                              <Link href={it.href} className="rounded-lg border px-3 py-1.5 text-xs font-medium hover:bg-secondary">{T("Open")}</Link>
                            ) : null}
                            <form action={startWorkAs}>
                              <input type="hidden" name="userId" value={it.whoId} />
                              {it.href ? <input type="hidden" name="next" value={it.href} /> : null}
                              <button type="submit" className="rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-brand-foreground hover:opacity-90">{T("Work as")} {it.who.split(" ")[0]}</button>
                            </form>
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </details>
              );
            })}
          </div>
        </section>
      ) : (
        <section className="flex items-center gap-3 rounded-xl border border-success/30 bg-success/5 p-4">
          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-success/15 text-success"><Info className="size-4" /></span>
          <span>
            <span className="block text-sm font-semibold">{T("Nothing needs your attention")}</span>
            <span className="block text-xs text-muted-foreground">{T("Nothing is broken and nothing is waiting too long.")}</span>
          </span>
        </section>
      )}



      <ChecksCard checks={checks} fine={fine} />

      <Section id="activity" title="Activity" hint="Who is using the system, and what they are doing.">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Kpi label="People signed in" value={String(kpis.people24)} caption="different people in 24 hours" tag="Live" tone="good"
              explain={`${kpis.people7} different people signed in over the last 7 days. If this drops to zero on a working day, check that sign-in still works.`} />
            <Kpi label="Actions by the team" value={String(kpis.actions24)} caption="saved by staff in 24 hours" tag="Activity" tone="info"
              explain={`Each payment, price, check-in, clearance or release counts as one action.${kpis.peak !== null ? ` Busiest hour: ${kpis.peak}:00 (Tanzania time).` : ""}`} />
            <Kpi label="Sign-ins" value={String(kpis.signins24)} caption="successful sign-ins in 24 hours" tag="Sign-ins" tone="warn"
              explain="Each time someone signs in with the right password. The chart below shows which roles they were." />
            <Kpi label="Failed sign-ins" value={String(kpis.failed24)} caption="wrong tries in 24 hours" tag={kpis.failed24 >= 10 ? "Look" : "Quiet"} tone={kpis.failed24 >= 10 ? "bad" : "good"}
              explain="A few typing mistakes are normal. Many in a day can mean someone is guessing passwords. The details are on the Sign-ins & security tab." />
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
        <Card title={T("Recent sign-ins")} hint={T("The last 9 successful sign-ins: who, on what device, from where.")}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                <tr><th className="pb-2 font-medium">{T("Person")}</th><th className="pb-2 font-medium">{T("Device")}</th><th className="pb-2 font-medium">{T("From")}</th><th className="pb-2 text-right font-medium">{T("When")}</th></tr>
              </thead>
              <tbody className="divide-y">
                {o.recent.slice(0, 9).map((r, i) => (
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
          <Card title={T("Who signs in")} hint={T("Sign-ins in the last 14 days, by kind of account.")}>
            <RankedBars
              rows={GROUPS.map((g) => ({ name: g, count: o.signinsPerDay.reduce((n, d) => n + (d.by[g] ?? 0), 0) })).filter((r) => r.count > 0).sort((a, b) => b.count - a.count)}
              tone="bg-sky-500"
            />
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
      </Section>

      <Section id="security" title="Sign-ins & security" hint="Failed tries, who is locked out, and what people were refused.">
        <SecurityTab s={sec} />
        <SecurityExtras x={secX} />
      </Section>

      <Section id="access" title="Who can do what" hint="Pick a person and a permission. The answer comes from the same table the system enforces.">
        <Card title={T("Check a permission")}>
          <WhoCanDo
            people={people.map((p) => ({ id: p.id, name: p.name, role: p.role, roleLabel: ROLE_LABELS[p.role as keyof typeof ROLE_LABELS] }))}
            grants={grants}
            permissions={allPermissions}
          />
        </Card>
      </Section>

      <Section id="errors" title="Errors & automatic jobs" hint="What went wrong on the server, and whether the nightly jobs ran.">
        <ErrorsAndJobs errs={errs} jobs={jobs} />
      </Section>

      <Section id="speed" title="Speed & size" hint="How long real screens take, and how big the database is.">
        <SpeedTab d={data} times={times} size={size} />
      </Section>

      <Section id="settings" title="Settings & this deployment" hint="Whether everything the system needs is in place, and which build is running.">
        <SettingsTab s={set} />
        <DeploymentCard d={deploy} />
      </Section>

      <Section id="messages" title="Messages" hint="What the system has told customers.">
        <MessagesTab m={msgs} />
      </Section>

      <Section id="people" title="People & my actions" hint="The team, and everything you have done as the developer.">
        <PeopleTab p={ppl} />
      </Section>

      <Section id="business" title="Business, read only" hint="Cargo, money and containers, for looking at. Nothing here is yours to chase.">
        <BusinessTab b={biz} />
      </Section>
    </div>
  );
}

/** One part of the page: a heading that says what it is for, then its contents. */
function Section({ id, title, hint, children }: { id: string; title: string; hint: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-6 space-y-4">
      <div className="border-b pb-2">
        <h2 className="text-xl font-bold tracking-tight">{T(title)}</h2>
        <p className="text-sm text-muted-foreground">{T(hint)}</p>
      </div>
      {children}
    </section>
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

const tsh = (n: number) => `TSh ${Math.round(n).toLocaleString("en-US")}`;
const when = (d: Date) => d.toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Dar_es_Salaam" });

const KPI_TAG: Record<string, string> = {
  good: "bg-success/15 text-success",
  info: "bg-sky-500/15 text-sky-500",
  warn: "bg-warning/15 text-warning",
  bad: "bg-destructive/15 text-destructive",
};

/** A number, what it counts, and — underneath — what it means and when to worry. */
function Kpi({ label, value, caption, tag, tone = "info", explain }: { label: string; value: string; caption?: string; tag?: string; tone?: "good" | "info" | "warn" | "bad"; explain: string }) {
  return (
    <div className="overflow-hidden rounded-2xl border bg-card">
      <div className="p-4">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className="mt-2 text-3xl font-bold tnum">{value}</p>
        {caption ? <p className="mt-0.5 text-xs text-muted-foreground">{caption}</p> : null}
      </div>
      <div className="border-t bg-secondary/30 p-4">
        {tag ? <span className={cn("rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide", KPI_TAG[tone])}>{tag}</span> : null}
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{explain}</p>
      </div>
    </div>
  );
}

const one = (name: string, tone: string) => ({ data: (rows: { label: string; value: number }[]) => rows.map((r) => ({ label: r.label, parts: [{ key: name, value: r.value }] })), colors: { [name]: tone } });

function BusinessTab({ b }: { b: Awaited<ReturnType<typeof businessPulse>> }) {
  const cargo = one("Cargo", "bg-brand");
  const bills = one("Bills", "bg-violet-500");
  const money = one("Received", "bg-emerald-500");
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Still to collect" value={tsh(b.owed)} caption={`${b.owingCount} bills owing`} tag="Money" tone="info"
          explain="Everything customers owe on bills already sent. It becomes income only when the payment is verified." />
        <Kpi label="Received, 14 days" value={tsh(b.received14)} caption="verified payments" tag="Income" tone="good"
          explain="Payments Finance has verified, after reversals and without the transport fare passed on to drivers." />
        <Kpi label="Storage running" value={String(b.storageRunning)} caption={`${tsh(b.storageOwed)} owed on them`} tag="Info" tone="info"
          explain="Consignments cleared and past their free days, still uncollected. Storage is added to their bill each night until pickup." />
        <Kpi label="Payments to verify" value={String(b.pendingPayments)} caption={b.pendingPayments ? `oldest ${b.oldestPending} day(s)` : "none waiting"} tag="Info" tone="info"
          explain="Money reported by a customer or a desk that Finance has not yet checked. This is Finance's to deal with — it is shown here so you can see the system is moving." />
      </div>
      <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
        <Card title="Where the cargo is" hint="Every consignment, by where it stands now.">
          <RankedBars rows={b.pipeline} />
        </Card>
        <Card title="Containers" hint="The latest ten, with what is on them.">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                <tr><th className="pb-2 font-medium">Reference</th><th className="pb-2 font-medium">Status</th><th className="pb-2 text-right font-medium">Cargo</th><th className="pb-2 font-medium">Vessel</th><th className="pb-2 text-right font-medium">Date</th></tr>
              </thead>
              <tbody className="divide-y">
                {b.containers.map((c) => (
                  <tr key={c.reference}>
                    <td className="py-2 font-medium">{c.reference}</td>
                    <td className="py-2 text-muted-foreground">{c.status.replaceAll("_", " ").toLowerCase()}</td>
                    <td className="tnum py-2 text-right">{c.cargo}</td>
                    <td className="py-2 text-muted-foreground">{c.vessel ?? "—"}</td>
                    <td className="py-2 text-right text-muted-foreground">{c.date ? when(c.date).slice(0, 6) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Cargo registered per day" hint="New consignments, last 14 days.">
          <StackedBars data={cargo.data(b.cargoPerDay)} colors={cargo.colors} height={140} />
        </Card>
        <Card title="Bills issued per day" hint="Invoices sent to customers.">
          <StackedBars data={bills.data(b.invoicesPerDay)} colors={bills.colors} height={140} />
        </Card>
        <Card title="Money received per day" hint="In thousands of shillings, after reversals.">
          <StackedBars data={money.data(b.receivedPerDay)} colors={money.colors} height={140} />
        </Card>
      </div>
    </div>
  );
}

function SecurityTab({ s }: { s: Awaited<ReturnType<typeof securityPulse>> }) {
  const failed = one("Failed", "bg-destructive");
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Kpi label="Failed sign-ins" value={String(s.failedTotal)} caption="in 14 days" tag={s.failedTotal > 20 ? "Look" : "Quiet"} tone={s.failedTotal > 20 ? "warn" : "good"}
          explain="Wrong password or a blocked account. A few are typing mistakes; a spike on one day, or many tries from one address, means someone is guessing." />
        <Kpi label="Successful sign-ins" value={String(s.okLogins)} caption="in 14 days" tag="Sign-ins" tone="info"
          explain="Each time someone signed in with the right password, staff and customers together." />
        <Kpi label="Locked out now" value={String(s.lockedNow)} caption="10 wrong tries in 15 minutes" tag={s.lockedNow ? "Locked" : "None"} tone={s.lockedNow ? "bad" : "good"}
          explain="An address is refused for 15 minutes after ten wrong passwords, even if the right one is tried next. It opens again by itself." />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Failed sign-ins per day" hint="A few typing mistakes are normal. A spike means somebody is guessing.">
          <StackedBars data={failed.data(s.failedPerDay)} colors={failed.colors} height={150} />
        </Card>
        <Card title="Failed tries by address" hint="Last 7 days. One address trying many accounts is a warning sign.">
          {s.byIp.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No failed sign-ins in the last 7 days.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-[11px] uppercase tracking-wide text-muted-foreground"><tr><th className="pb-2 font-medium">Address</th><th className="pb-2 text-right font-medium">Tries</th><th className="pb-2 text-right font-medium">Accounts</th><th className="pb-2 text-right font-medium">Last</th></tr></thead>
              <tbody className="divide-y">
                {s.byIp.map((r) => (
                  <tr key={r.ip}><td className="py-2 font-mono text-xs">{r.ip}</td><td className="tnum py-2 text-right">{r.count}</td><td className={cn("tnum py-2 text-right", r.accounts > 2 && "font-semibold text-warning")}>{r.accounts}</td><td className="py-2 text-right text-muted-foreground">{when(r.last)}</td></tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>
      <Card title="Refused actions" hint="Somebody asked for something their role does not allow — through a button or straight at the endpoint.">
        {s.denied.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">Nothing has been refused recently.</p>
        ) : (
          <ul className="divide-y text-sm">
            {s.denied.map((d, i) => (
              <li key={i} className="flex flex-wrap items-baseline justify-between gap-3 py-2"><span>{d.summary}</span><span className="text-xs text-muted-foreground">{when(d.createdAt)}</span></li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function MessagesTab({ m }: { m: Awaited<ReturnType<typeof messagesPulse>> }) {
  const sent = one("Messages", "bg-brand");
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Kpi label="Told to customers" value={String(m.total)} caption="messages in 14 days" tag="Customers" tone="info"
          explain="Every message the system sent to a customer's portal — cargo received, on the way, arrived, cleared, bill issued, ready for pickup." />
        <Kpi label="Opened" value={m.total ? `${Math.round((m.read / m.total) * 100)}%` : "—"} caption={`${m.read} of ${m.total} read`} tag="Reach" tone="good"
          explain="How many of those messages the customer has actually opened. A low figure means customers are not looking at the portal." />
      </div>
      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card title="Messages to customers per day" hint="Last 14 days.">
          <StackedBars data={sent.data(m.perDay)} colors={sent.colors} height={150} />
        </Card>
        <Card title="What they were about" hint="The kinds of message sent.">
          <RankedBars rows={m.kinds} />
        </Card>
      </div>
      <Card title="Latest messages" hint="The newest eight sent to customers.">
        <ul className="divide-y text-sm">
          {m.recent.map((r, i) => (
            <li key={i} className="flex flex-wrap items-baseline justify-between gap-3 py-2"><span className="min-w-0 truncate">{r.title}</span><span className="shrink-0 text-xs text-muted-foreground">{r.readAt ? "read" : "unread"} · {when(r.createdAt)}</span></li>
          ))}
          {m.recent.length === 0 ? <li className="py-4 text-center text-muted-foreground">No messages in 14 days.</li> : null}
        </ul>
      </Card>
    </div>
  );
}

function SettingsTab({ s }: { s: Awaited<ReturnType<typeof settingsPulse>> }) {
  const row = (label: string, value: string, ok: boolean | null, note: string) => (
    <li key={label} className="flex flex-wrap items-start justify-between gap-3 py-3">
      <div className="min-w-0 flex-1"><p className="text-sm font-medium">{label}</p><p className="text-xs text-muted-foreground">{note}</p></div>
      <span className={cn("shrink-0 text-sm font-semibold tnum", ok === false ? "text-destructive" : ok ? "text-success" : "")}>{value}</span>
    </li>
  );
  const c = s.company;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title="How the business is set up" hint="The numbers prices and bills are worked out from.">
        <ul className="divide-y">
          {row("Exchange rate (USD → TZS)", s.rate ? s.rate.toLocaleString("en-US") : "not set", s.rate ? (s.rateAge! <= 7 ? true : false) : false, s.rate ? `Set ${s.rateAge} day(s) ago. A rate older than a week is worth refreshing.` : "Bills cannot be issued without one.")}
          {row("Free storage days", String(c?.freeStorageDays ?? "—"), true, "Days after clearance before storage is charged.")}
          {row("Storage per day", c && Number(c.storagePerDay) > 0 ? `${c.storageCurrency} ${Number(c.storagePerDay)}` : "not charged", c ? Number(c.storagePerDay) > 0 : false, "At 0 nothing is ever charged for storage.")}
          {row("VAT", `${Number(c?.vatPercent ?? 0)}%${c?.pricesIncludeVat ? " · inside prices" : " · on top"}`, null, "Applied to new invoices.")}
          {row("Payment accounts open", String(s.accounts), s.accounts > 0, "Banks, mobile money and cash tins customers can pay into.")}
          {row("Warehouses open", String(s.warehouses), s.warehouses > 0, "Guangzhou and Dar floors.")}
          {row("Last automatic storage charge", s.lastCharge ? when(s.lastCharge) : "never", null, "The nightly job adds storage to bills past their free days. Nothing here yet is normal if no goods have run past them.")}
        </ul>
      </Card>
      <div className="space-y-4">
        <Card title="What the system needs to run" hint="Whether each required setting is present. Values are never shown.">
          <ul className="divide-y">
            {s.env.map((e) => row(e.name, e.set ? "set" : "missing", e.set, e.set ? "" : "Required. Parts of the system will not work without it."))}
          </ul>
        </Card>
        <Card title="Who is on the team" hint="Active accounts by role.">
          <RankedBars rows={s.roles.map((r) => ({ name: ROLE_LABELS[r.role as keyof typeof ROLE_LABELS] ?? r.role, count: r.count }))} tone="bg-violet-500" />
        </Card>
      </div>
    </div>
  );
}

function PeopleTab({ p }: { p: Awaited<ReturnType<typeof peoplePulse>> }) {
  return (
    <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
      <Card title="The team" hint="Everyone with a staff account, what they did this week, and when they last signed in.">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-[11px] uppercase tracking-wide text-muted-foreground"><tr><th className="pb-2 font-medium">Person</th><th className="pb-2 font-medium">Role</th><th className="pb-2 text-right font-medium">Actions, 7 days</th><th className="pb-2 text-right font-medium">Last in</th></tr></thead>
            <tbody className="divide-y">
              {p.staff.map((x) => (
                <tr key={x.id}>
                  <td className="py-2 font-medium">{x.name}{x.status !== "ACTIVE" ? <span className="ml-2 text-xs text-destructive">{x.status.toLowerCase()}</span> : null}</td>
                  <td className="py-2 text-muted-foreground">{ROLE_LABELS[x.role]}</td>
                  <td className="tnum py-2 text-right">{x.actions7}</td>
                  <td className="py-2 text-right text-muted-foreground">{x.lastLoginAt ? when(x.lastLoginAt) : "never"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <Card title="My recent actions" hint="What you did as the developer — these lines can never be edited or deleted.">
        <ul className="divide-y text-sm">
          {p.mine.map((m, i) => (
            <li key={i} className="py-2"><p>{m.summary}</p><p className="text-xs text-muted-foreground">{when(m.createdAt)}</p></li>
          ))}
          {p.mine.length === 0 ? <li className="py-4 text-center text-muted-foreground">Nothing yet.</li> : null}
        </ul>
      </Card>
    </div>
  );
}

const kb = (n: number) => (n >= 1_048_576 ? `${(n / 1_048_576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

function SpeedTab({ d, times, size }: { d: Awaited<ReturnType<typeof dataPulse>>; times: Awaited<ReturnType<typeof timings>>; size: Awaited<ReturnType<typeof dbSize>> }) {
  const top = Math.max(1, ...times.map((t) => t.ms));
  const slow = times.filter((t) => t.ms >= t.slowAt).length;
  const sizeTop = Math.max(1, ...(size?.tables.map((t) => t.bytes) ?? [1]));
  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title={T("How long each thing takes")} hint={slow ? `${slow} ${T("slower than it should be.")}` : T("Measured just now, one after another. All within the normal range.")}>
          <ul className="space-y-3">
            {times.map((t) => {
              const bad = t.ms < 0 || t.ms >= t.slowAt;
              const warn = !bad && t.ms >= t.slowAt / 2;
              return (
                <li key={t.name}>
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="font-medium">{T(t.name)}</span>
                    <span className={cn("tnum", bad ? "text-destructive" : warn ? "text-warning" : "text-muted-foreground")}>{t.ms < 0 ? T("failed") : `${t.ms} ms`}</span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-secondary">
                    <div className={cn("h-full rounded-full", bad ? "bg-destructive" : warn ? "bg-warning" : "bg-brand")} style={{ width: `${Math.max(2, (Math.max(t.ms, 0) / top) * 100)}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
        <Card title={T("Database size")} hint={size ? `${kb(size.total)} ${T("in")} ${size.count} ${T("tables. The biggest are below.")}` : T("The size could not be read just now.")}>
          {size ? (
            <ul className="space-y-3">
              {size.tables.map((t) => (
                <li key={t.name}>
                  <div className="flex items-baseline justify-between gap-3 text-sm"><span className="font-mono text-xs">{t.name}</span><span className="tnum text-muted-foreground">{kb(t.bytes)}</span></div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-secondary"><div className="h-full rounded-full bg-brand" style={{ width: `${Math.max(2, (t.bytes / sizeTop) * 100)}%` }} /></div>
                </li>
              ))}
            </ul>
          ) : null}
        </Card>
      </div>
      <Card title={T("What the system holds")} hint={d.since ? `${T("Records in the database. The audit log reaches back to")} ${when(d.since).slice(0, 6)}.` : T("Records in the database.")}>
        <div className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
          {d.rows.map((r) => (
            <div key={r.name} className="flex items-baseline justify-between gap-3 border-b border-dashed py-1.5 text-sm last:border-0"><span>{r.name}</span><span className="tnum font-medium">{r.count.toLocaleString("en-US")}</span></div>
          ))}
        </div>
      </Card>
    </div>
  );
}

const CHECK_TONE: Record<CheckResult["status"], { dot: string; label: string }> = {
  ok: { dot: "bg-emerald-500", label: "Fine" },
  fix: { dot: "bg-destructive", label: "Fix" },
  look: { dot: "bg-warning", label: "Look" },
  unknown: { dot: "bg-slate-400", label: "Not known yet" },
};

/** Every check that ran, not just the ones that found something — so "nothing wrong" can be told from "nothing looked". */
function ChecksCard({ checks, fine }: { checks: CheckResult[]; fine: number }) {
  const bad = checks.filter((c) => c.status === "fix" || c.status === "look").length;
  return (
    <details className="group rounded-2xl border bg-card p-5">
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-3">
        <span className={cn("grid size-9 shrink-0 place-items-center rounded-full text-sm font-bold", bad ? "bg-warning/15 text-warning" : "bg-emerald-500/15 text-emerald-600")}>{fine}</span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">{fine} {T("of")} {checks.length} {T("system checks are fine")}</span>
          <span className="block text-xs text-muted-foreground">{T("Show what was checked")}</span>
        </span>
      </summary>
      <ul className="mt-4 grid gap-x-8 gap-y-2 sm:grid-cols-2">
        {checks.map((c) => {
          const t = CHECK_TONE[c.status];
          return (
            <li key={c.id} className="flex items-start gap-2.5 text-sm">
              <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", t.dot)} />
              <span className="min-w-0">
                <span className="block">{T(c.name)}</span>
                {c.status !== "ok" ? <span className="block text-xs text-muted-foreground">{c.note ?? c.finding?.title}</span> : null}
              </span>
            </li>
          );
        })}
      </ul>
    </details>
  );
}

function ErrorsAndJobs({ errs, jobs }: { errs: Awaited<ReturnType<typeof errorList>>; jobs: Awaited<ReturnType<typeof jobsTable>> }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title={T("Server errors")} hint={`${errs.last24} ${T("in 24 hours")} · ${errs.last7} ${T("in 7 days")}`}>
        {errs.groups.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">{T("No errors in the last 7 days.")}</p>
        ) : (
          <ul className="divide-y text-sm">
            {errs.groups.map((g, i) => (
              <li key={i} className="py-2.5">
                <p className="break-words font-medium">{g.message.slice(0, 160)}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {g.where ? <span className="font-mono">{g.where}</span> : null}{g.where ? " · " : ""}
                  {g.count > 1 ? `${g.count} ${T("times")} · ` : ""}{T("last")} {ago(g.last)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card title={T("Automatic jobs")} hint={T("Run by the platform on a timer. Each run is written down when it ends.")}>
        <ul className="divide-y text-sm">
          {jobs.map(({ job, last, lastOkAt, runs, late }) => {
            const state = !last ? { t: "No run yet", c: "bg-secondary text-muted-foreground" } : !last.ok ? { t: "Failed", c: "bg-destructive/15 text-destructive" } : late ? { t: "Late", c: "bg-warning/15 text-warning" } : { t: "On time", c: "bg-emerald-500/15 text-emerald-600" };
            return (
              <li key={job.name} className="py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{T(job.label)}</span>
                  <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide", state.c)}>{T(state.t)}</span>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">{job.runsAt}</p>
                <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                  <div><dt className="text-muted-foreground">{T("Last run")}</dt><dd>{last ? ago(last.startedAt) : "—"}</dd></div>
                  <div><dt className="text-muted-foreground">{T("Last success")}</dt><dd>{ago(lastOkAt)}</dd></div>
                  <div><dt className="text-muted-foreground">{T("Took")}</dt><dd>{last?.ms != null ? `${last.ms} ms` : "—"}</dd></div>
                  <div><dt className="text-muted-foreground">{T("Runs recorded")}</dt><dd>{runs}</dd></div>
                </dl>
                {last?.result ? <p className="mt-2 break-words rounded-lg bg-secondary px-2.5 py-1.5 font-mono text-[11px]">{last.result.slice(0, 200)}</p> : null}
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}

function SecurityExtras({ x }: { x: Awaited<ReturnType<typeof securityExtras>> }) {
  return (
    <div className="mt-4 grid gap-4 lg:grid-cols-3">
      <Card title={T("Latest failed tries")} hint={T("Wrong passwords in the last 7 days.")}>
        {x.failed.length === 0 ? <p className="py-2 text-sm text-muted-foreground">{T("None.")}</p> : (
          <ul className="space-y-2 text-xs">
            {x.failed.map((f, i) => (
              <li key={i}><span className="block truncate font-medium">{f.email}</span><span className="text-muted-foreground">{f.ipAddress ?? T("unknown address")} · {ago(f.createdAt)}</span></li>
            ))}
          </ul>
        )}
      </Card>
      <Card title={T("Refused today")} hint={T("Times somebody asked for something their role may not do.")}>
        <p className="text-3xl font-semibold tnum">{x.refused}</p>
        <p className="mt-1 text-xs text-muted-foreground">{x.refused === 0 ? T("Nobody tried anything outside their role.") : T("The names and what they tried are listed above, under refused.")}</p>
      </Card>
      <Card title={T("Your own sign-ins")} hint={`${x.devSessions} ${T("developer session(s) open now")}`}>
        <ul className="space-y-2 text-xs">
          {x.mine.map((m, i) => (
            <li key={i} className="flex items-baseline justify-between gap-2"><span className={m.ok ? "" : "text-destructive"}>{m.ok ? T("Signed in") : T("Wrong password")} · {m.ipAddress ?? "—"}</span><span className="text-muted-foreground">{ago(m.createdAt)}</span></li>
          ))}
          {x.mine.length === 0 ? <li className="text-muted-foreground">{T("Nothing yet.")}</li> : null}
        </ul>
      </Card>
    </div>
  );
}

function DeploymentCard({ d }: { d: ReturnType<typeof deployment> }) {
  const rows: [string, string | null][] = [["Running on", d.place], ["Region", d.region], ["Version", d.commit], ["Branch", d.branch], ["Last change", d.message], ["Node", d.node]];
  return (
    <Card title={T("This deployment")} hint={T("Which build is serving this page right now.")} className="mt-4">
      <dl className="grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
        {rows.filter(([, v]) => v).map(([k, v]) => (
          <div key={k} className="flex justify-between gap-3 border-b border-dashed py-1.5 last:border-0"><dt className="text-muted-foreground">{T(k)}</dt><dd className="min-w-0 truncate text-right font-medium">{v}</dd></div>
        ))}
      </dl>
    </Card>
  );
}
