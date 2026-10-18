import Link from "next/link";
import type { Metadata } from "next";
import { AlertTriangle, BarChart3, Info, ScrollText, TriangleAlert } from "lucide-react";

import { AddAccountDialog } from "@/components/app/add-account-dialog";
import { Legend, RankedBars, ScoreRing, StackedBars } from "@/components/app/dev-charts";
import { WorkAsDialog } from "@/components/app/work-as-dialog";
import { ROLE_LABELS } from "@/lib/constants";
import { developerOverview, GROUPS, type Finding } from "@/lib/developer-overview";
import { businessFindings, businessPulse, dataPulse, securityPulse } from "@/lib/developer-system";
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
export default async function DeveloperHome({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  await primeLocale();
  const sp = await searchParams;
  const tab = ["activity", "security", "data"].includes(sp.tab ?? "") ? (sp.tab as string) : "business";
  const user = await requirePermission("developer.activity");
  const [o0, extra, warehouses, people] = await Promise.all([
    developerOverview(),
    businessFindings(),
    prisma.warehouse.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true, kind: true } }),
    prisma.user.findMany({
      where: { active: true, status: "ACTIVE", role: { notIn: ["CUSTOMER", "DEVELOPER"] } },
      orderBy: [{ role: "asc" }, { name: "asc" }],
      select: { id: true, name: true, role: true },
    }),
  ]);

  /* What the business is waiting on counts toward the health of the whole. */
  const findings = [...o0.findings, ...extra.map((f) => ({ ...f }))] as Finding[];
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

  const [biz, sec, data] = await Promise.all([
    tab === "business" ? businessPulse() : null,
    tab === "security" ? securityPulse() : null,
    tab === "data" ? dataPulse() : null,
  ]);

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
      ) : (
        <section className="flex items-center gap-3 rounded-xl border border-success/30 bg-success/5 p-4">
          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-success/15 text-success"><Info className="size-4" /></span>
          <span>
            <span className="block text-sm font-semibold">{T("Nothing needs your attention")}</span>
            <span className="block text-xs text-muted-foreground">{T("Nothing is broken and nothing is waiting too long.")}</span>
          </span>
        </section>
      )}

      <nav className="flex flex-wrap gap-2">
        {([["business", "Cargo & money"], ["activity", "Activity"], ["security", "Sign-ins & security"], ["data", "The data"]] as const).map(([k, label]) => (
          <Link
            key={k}
            href={k === "business" ? "/app/developer" : `/app/developer?tab=${k}`}
            className={cn("rounded-full border px-4 py-1.5 text-sm font-medium", tab === k ? "border-foreground/60 bg-secondary" : "bg-card text-muted-foreground hover:text-foreground")}
          >
            {T(label)}
          </Link>
        ))}
      </nav>

      {tab === "activity" ? (
        <>
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
        </>
      ) : null}

      {biz ? <BusinessTab b={biz} /> : null}
      {sec ? <SecurityTab s={sec} /> : null}
      {data ? <DataTab d={data} /> : null}
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

const tsh = (n: number) => `TSh ${Math.round(n).toLocaleString("en-US")}`;
const when = (d: Date) => d.toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Dar_es_Salaam" });

function Tile({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div className="rounded-2xl border bg-card p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={cn("mt-1 text-2xl font-bold tnum", tone)}>{value}</p>
      {sub ? <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p> : null}
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
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Tile label="Still to collect" value={tsh(b.owed)} sub={`${b.owingCount} bills owing`} />
        <Tile label="Received, 14 days" value={tsh(b.received14)} sub="verified payments" tone="text-success" />
        <Tile label="Storage running" value={String(b.storageRunning)} sub={`${tsh(b.storageOwed)} owed on them`} tone={b.storageRunning ? "text-warning" : undefined} />
        <Tile label="Payments to verify" value={String(b.pendingPayments)} sub={b.pendingPayments ? `oldest ${b.oldestPending} day(s)` : "none waiting"} tone={b.oldestPending >= 2 ? "text-warning" : undefined} />
        <Tile label="Containers listed" value={String(b.containers.length)} sub="latest ten shown below" />
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
        <Tile label="Failed sign-ins, 14 days" value={String(s.failedTotal)} tone={s.failedTotal > 20 ? "text-warning" : undefined} sub="wrong password or blocked account" />
        <Tile label="Successful sign-ins, 14 days" value={String(s.okLogins)} />
        <Tile label="Locked out right now" value={String(s.lockedNow)} tone={s.lockedNow ? "text-destructive" : "text-success"} sub="10 wrong tries in 15 minutes" />
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

function DataTab({ d }: { d: Awaited<ReturnType<typeof dataPulse>> }) {
  const max = Math.max(1, ...d.rows.map((r) => r.count));
  return (
    <Card title="What the system holds" hint={d.since ? `Records in the database. The audit log reaches back to ${when(d.since).slice(0, 6)}.` : "Records in the database."}>
      <ul className="space-y-3">
        {d.rows.map((r) => (
          <li key={r.name}>
            <div className="flex items-baseline justify-between gap-3 text-sm"><span className="font-medium">{r.name}</span><span className="tnum text-muted-foreground">{r.count.toLocaleString("en-US")}</span></div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-secondary"><div className="h-full rounded-full bg-brand" style={{ width: `${Math.max(1, (r.count / max) * 100)}%` }} /></div>
          </li>
        ))}
      </ul>
    </Card>
  );
}
