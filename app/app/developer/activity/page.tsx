import Link from "next/link";
import type { Metadata } from "next";
import type { Prisma } from "@prisma/client";
import { ShieldCheck, UserRound } from "lucide-react";

import { PageHeader } from "@/components/app/page-header";
import { recordAudit } from "@/lib/audit";
import { DEPARTMENT_LABELS, ROLE_LABELS } from "@/lib/constants";
import { darMidnight } from "@/lib/dar-time";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { primeLocale, T } from "@/lib/server-t";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Audit" };

const PAGE = 50;
const DAR = "Africa/Dar_es_Salaam";

type Params = {
  kind?: string;
  type?: string;
  actor?: string;
  role?: string;
  department?: string;
  module?: string;
  action?: string;
  outcome?: string;
  record?: string;
  from?: string;
  to?: string;
  page?: string;
};

const day = (iso?: string) => {
  const m = iso ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso) : null;
  return m ? darMidnight(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
};
const stamp = (d: Date) =>
  d.toLocaleString("en-GB", { timeZone: DAR, day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" });

const select = "h-9 min-w-36 rounded-lg border bg-card px-2 text-sm";

/**
 * EVERYTHING DONE IN THE SYSTEM, AND BY WHOM.
 *
 * The developer's view of the audit log. Developer actions and staff actions
 * are kept apart on every line — an action is the developer's only when the
 * developer account, in developer mode, did it. A staff member's work is that
 * staff member's, whoever was at the keyboard, and the view does not guess
 * otherwise. Nothing on this page can be edited, and opening it is itself
 * written to the log.
 */
export default async function DeveloperActivityPage({ searchParams }: { searchParams: Promise<Params> }) {
  await primeLocale();
  const viewer = await requirePermission("developer.activity");
  const sp = await searchParams;
  const kind = sp.kind === "signins" ? "signins" : "actions";
  const page = Math.max(1, Math.floor(Number(sp.page)) || 1);

  const from = day(sp.from);
  const to = day(sp.to);
  const createdAt: Prisma.DateTimeFilter = {
    ...(from ? { gte: from } : {}),
    ...(to ? { lt: new Date(to.getTime() + 86_400_000) } : {}),
  };

  const where: Prisma.AuditLogWhereInput = {
    ...(Object.keys(createdAt).length ? { createdAt } : {}),
    ...(sp.type === "DEVELOPER" || sp.type === "STAFF" ? { actorType: sp.type } : {}),
    ...(sp.actor ? { actorId: sp.actor } : {}),
    ...(sp.role ? { actorRole: sp.role as never } : {}),
    ...(sp.department ? { actorDepartment: sp.department as never } : {}),
    ...(sp.module ? { entity: sp.module } : {}),
    ...(sp.action ? { action: { contains: sp.action.trim(), mode: "insensitive" } } : {}),
    ...(sp.outcome ? { outcome: sp.outcome } : {}),
    ...(sp.record ? { entityId: { contains: sp.record.trim() } } : {}),
  };

  const [people, modules] = await Promise.all([
    prisma.user.findMany({
      where: { role: { not: "CUSTOMER" } },
      orderBy: { name: "asc" },
      select: { id: true, name: true, role: true },
    }),
    prisma.auditLog.groupBy({ by: ["entity"], orderBy: { entity: "asc" } }),
  ]);

  /* Reading the log is privileged, so it is on the log. */
  await recordAudit({
    actor: viewer,
    action: "developer.activity.viewed",
    entity: "AuditLog",
    summary: `${viewer.name} opened ${kind === "signins" ? "the sign-in attempts" : "the activity log"}`,
    metadata: { filters: Object.fromEntries(Object.entries(sp).filter(([, v]) => v)) },
  });

  const link = (extra: Record<string, string | undefined>) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...sp, ...extra })) if (v) q.set(k, v);
    return `/app/developer/activity?${q.toString()}`;
  };

  const chip = (label: string, extra: Record<string, string | undefined>, on: boolean) => (
    <Link
      href={link({ kind: "actions", type: undefined, outcome: undefined, page: undefined, ...extra })}
      className={cn("rounded-full border px-3 py-1 text-xs font-medium", on ? "border-brand bg-brand/10 text-brand" : "bg-card hover:bg-secondary")}
    >
      {T(label)}
    </Link>
  );

  const tabs = (
    <div className="flex flex-wrap items-center gap-2">
      {kind === "actions" ? (
        <>
          {chip("Everything", {}, !sp.type && !sp.outcome)}
          {chip("Developer actions", { type: "DEVELOPER" }, sp.type === "DEVELOPER")}
          {chip("Failures", { outcome: "FAILURE" }, sp.outcome === "FAILURE")}
          <span className="mx-1 h-4 w-px bg-border" aria-hidden />
        </>
      ) : null}
      {([["actions", "Actions"], ["signins", "Sign-in attempts"]] as const).map(([k, label]) => (
        <Link
          key={k}
          href={link({ kind: k, page: undefined })}
          className={cn(
            "rounded-full border px-4 py-1.5 text-sm font-medium",
            kind === k ? "border-brand bg-brand text-brand-foreground" : "bg-card hover:bg-secondary"
          )}
        >
          {T(label)}
        </Link>
      ))}
    </div>
  );

  const filters = (
    <form action="/app/developer/activity" className="flex flex-wrap items-end gap-2 rounded-xl border bg-card p-3">
      <input type="hidden" name="kind" value={kind} />
      {kind === "actions" ? (
        <>
          <Field label="Account type">
            <select name="type" defaultValue={sp.type ?? ""} className={select}>
              <option value="">{T("Everyone")}</option>
              <option value="DEVELOPER">{T("Developer account")}</option>
              <option value="STAFF">{T("Staff accounts")}</option>
            </select>
          </Field>
          <Field label="Person">
            <select name="actor" defaultValue={sp.actor ?? ""} className={select}>
              <option value="">{T("Anyone")}</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} · {ROLE_LABELS[p.role]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Role">
            <select name="role" defaultValue={sp.role ?? ""} className={select}>
              <option value="">{T("Any role")}</option>
              {(Object.keys(ROLE_LABELS) as (keyof typeof ROLE_LABELS)[]).map((r) => (
                <option key={r} value={r}>{ROLE_LABELS[r]}</option>
              ))}
            </select>
          </Field>
          <Field label="Department">
            <select name="department" defaultValue={sp.department ?? ""} className={select}>
              <option value="">{T("Any department")}</option>
              {(Object.keys(DEPARTMENT_LABELS) as (keyof typeof DEPARTMENT_LABELS)[]).map((d) => (
                <option key={d} value={d}>{DEPARTMENT_LABELS[d]}</option>
              ))}
            </select>
          </Field>
          <Field label="Module">
            <select name="module" defaultValue={sp.module ?? ""} className={select}>
              <option value="">{T("Any module")}</option>
              {modules.map((m) => (
                <option key={m.entity} value={m.entity}>{m.entity}</option>
              ))}
            </select>
          </Field>
          <Field label="Action contains">
            <input name="action" defaultValue={sp.action ?? ""} placeholder="payment, price, release…" className={cn(select, "w-44")} />
          </Field>
          <Field label="Record id">
            <input name="record" defaultValue={sp.record ?? ""} className={cn(select, "w-44")} />
          </Field>
        </>
      ) : null}
      <Field label="Result">
        <select name="outcome" defaultValue={sp.outcome ?? ""} className={select}>
          <option value="">{T("Any")}</option>
          <option value="SUCCESS">{T("Succeeded")}</option>
          <option value="FAILURE">{T("Failed")}</option>
          <option value="DENIED">{T("Refused")}</option>
        </select>
      </Field>
      <Field label="From">
        <input type="date" name="from" defaultValue={sp.from ?? ""} className={select} />
      </Field>
      <Field label="To">
        <input type="date" name="to" defaultValue={sp.to ?? ""} className={select} />
      </Field>
      <button className="h-9 rounded-lg bg-foreground px-4 text-sm font-medium text-background">{T("Show")}</button>
      <Link href={`/app/developer/activity?kind=${kind}`} className="h-9 content-center px-2 text-sm text-muted-foreground hover:text-foreground">
        {T("Clear")}
      </Link>
    </form>
  );

  if (kind === "signins") {
    const attempts = await prisma.loginEvent.findMany({
      where: {
        ...(Object.keys(createdAt).length ? { createdAt } : {}),
        ...(sp.outcome === "FAILURE" ? { ok: false } : sp.outcome === "SUCCESS" ? { ok: true } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: PAGE,
      skip: (page - 1) * PAGE,
      select: { id: true, email: true, ok: true, ipAddress: true, createdAt: true, user: { select: { name: true, role: true } } },
    });
    return (
      <div className="space-y-4">
        <PageHeader title={T("Audit")} description={T("Every sign-in attempt, successful or not. Passwords are never recorded.")} />
        {tabs}
        {filters}
        <div className="overflow-x-auto rounded-xl border bg-card">
          <table className="w-full text-sm">
            <thead className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr><th className="px-4 py-2">{T("When")}</th><th className="px-4 py-2">{T("Account")}</th><th className="px-4 py-2">{T("Result")}</th><th className="px-4 py-2">{T("From")}</th></tr>
            </thead>
            <tbody className="divide-y">
              {attempts.map((a) => (
                <tr key={a.id}>
                  <td className="tnum whitespace-nowrap px-4 py-2">{stamp(a.createdAt)}</td>
                  <td className="px-4 py-2">{a.user ? `${a.user.name} · ${ROLE_LABELS[a.user.role]}` : a.email}</td>
                  <td className="px-4 py-2"><Result outcome={a.ok ? "SUCCESS" : "FAILURE"} /></td>
                  <td className="px-4 py-2 font-mono text-xs text-muted-foreground">{a.ipAddress ?? "—"}</td>
                </tr>
              ))}
              {attempts.length === 0 ? <tr><td colSpan={4} className="px-4 py-10 text-center text-muted-foreground">{T("Nothing for these filters.")}</td></tr> : null}
            </tbody>
          </table>
        </div>
        <Pager page={page} more={attempts.length === PAGE} link={link} />
      </div>
    );
  }

  const [rows, total] = await Promise.all([
    prisma.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, take: PAGE, skip: (page - 1) * PAGE }),
    prisma.auditLog.count({ where }),
  ]);

  /* BEFORE AND AFTER. The field history written with the action: the same
     record, by the same account, within two minutes of the line. */
  const ids = [...new Set(rows.map((r) => r.entityId).filter((v): v is string => Boolean(v)))];
  const changes = ids.length
    ? await prisma.fieldChange.findMany({
        where: {
          entityId: { in: ids },
          createdAt: {
            gte: new Date(Math.min(...rows.map((r) => r.createdAt.getTime())) - 120_000),
            lte: new Date(Math.max(...rows.map((r) => r.createdAt.getTime())) + 120_000),
          },
        },
        orderBy: { createdAt: "asc" },
      })
    : [];
  const changesFor = (r: (typeof rows)[number]) =>
    changes.filter(
      (c) =>
        c.entityId === r.entityId &&
        c.actorId === r.actorId &&
        Math.abs(c.createdAt.getTime() - r.createdAt.getTime()) <= 120_000
    );

  return (
    <div className="space-y-4">
      <PageHeader
        title={T("Audit")}
        description={T("Every action in the system and who did it. The developer account and staff accounts are never mixed: staff work is recorded under the staff member, whoever was at the keyboard.")}
      />
      {tabs}
      {filters}
      <p className="tnum text-xs text-muted-foreground">
        {total === 0 ? 0 : (page - 1) * PAGE + 1}–{Math.min(page * PAGE, total)} {T("of")} {total}
      </p>
      <div className="overflow-hidden rounded-xl border bg-card">
        {rows.length === 0 ? (
          <p className="px-5 py-12 text-center text-sm text-muted-foreground">{T("Nothing for these filters.")}</p>
        ) : (
          <ul className="divide-y">
            {rows.map((r) => {
              const dev = r.actorType === "DEVELOPER";
              const moved = changesFor(r);
              return (
                <li key={r.id} className="px-4 py-3">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold",
                        dev ? "bg-warning/15 text-warning" : "bg-secondary text-muted-foreground"
                      )}
                    >
                      {dev ? <ShieldCheck className="size-3" /> : <UserRound className="size-3" />}
                      {dev ? T("Developer account") : T("Staff account")}
                    </span>
                    <span className="text-sm font-medium">{r.actorName ?? r.actorEmail ?? T("System")}</span>
                    <span className="text-xs text-muted-foreground">
                      {[r.actorRole ? ROLE_LABELS[r.actorRole] : null, r.actorDepartment ? DEPARTMENT_LABELS[r.actorDepartment] : null].filter(Boolean).join(" · ")}
                    </span>
                    <span className="tnum ml-auto text-xs text-muted-foreground">{stamp(r.createdAt)}</span>
                  </div>
                  <p className="mt-1 text-sm">{r.summary}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <code className="rounded bg-secondary px-1.5 py-0.5">{r.action}</code>
                    <span>{r.entity}{r.entityId ? ` · ${r.entityId}` : ""}</span>
                    <Result outcome={r.outcome} />
                    {r.requestId ? <span className="font-mono">req {r.requestId.slice(0, 16)}</span> : null}
                  </div>
                  {moved.length > 0 || r.metadata ? (
                    <details className="mt-2 text-xs">
                      <summary className="cursor-pointer text-brand">
                        {moved.length > 0 ? `${moved.length} ${T("field change(s) — before and after")}` : T("Details")}
                      </summary>
                      {moved.length > 0 ? (
                        <table className="mt-2 w-full max-w-3xl">
                          <thead className="text-left text-muted-foreground"><tr><th className="py-1 pr-3">{T("Field")}</th><th className="pr-3">{T("Before")}</th><th className="pr-3">{T("After")}</th><th>{T("Reason")}</th></tr></thead>
                          <tbody>
                            {moved.map((c) => (
                              <tr key={c.id} className="border-t align-top">
                                <td className="py-1 pr-3 font-medium">{c.entity}.{c.field}</td>
                                <td className="pr-3 text-destructive">{c.oldValue ?? "—"}</td>
                                <td className="pr-3 text-success">{c.newValue ?? "—"}</td>
                                <td className="text-muted-foreground">{c.reason ?? ""}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      ) : null}
                      {r.metadata ? (
                        <pre className="mt-2 max-w-3xl overflow-x-auto rounded bg-secondary/60 p-2 text-[11px]">{JSON.stringify(r.metadata, null, 2)}</pre>
                      ) : null}
                    </details>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <Pager page={page} more={page * PAGE < total} link={link} />
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="space-y-1">
      <span className="block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function Result({ outcome }: { outcome: string }) {
  const tone =
    outcome === "SUCCESS" ? "bg-success/15 text-success" : outcome === "DENIED" ? "bg-warning/15 text-warning" : "bg-destructive/15 text-destructive";
  const text = outcome === "SUCCESS" ? "Succeeded" : outcome === "DENIED" ? "Refused" : "Failed";
  return <span className={cn("rounded px-1.5 py-0.5 text-[11px] font-medium", tone)}>{text}</span>;
}

function Pager({ page, more, link }: { page: number; more: boolean; link: (e: Record<string, string | undefined>) => string }) {
  if (page === 1 && !more) return null;
  return (
    <div className="flex items-center justify-between text-sm">
      {page > 1 ? <Link href={link({ page: String(page - 1) })} className="rounded-lg border px-3 py-1.5 hover:bg-secondary">← Newer</Link> : <span />}
      {more ? <Link href={link({ page: String(page + 1) })} className="rounded-lg border px-3 py-1.5 hover:bg-secondary">Older →</Link> : null}
    </div>
  );
}
