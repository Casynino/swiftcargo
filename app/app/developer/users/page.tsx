import type { Metadata } from "next";
import { AlertTriangle, BadgeDollarSign, Headset, Lock, LogIn, Package, ShieldCheck, Warehouse } from "lucide-react";

import { ReactivateForm, SuspendForm } from "@/components/app/access-actions";
import { AddAccountDialog } from "@/components/app/add-account-dialog";
import { startWorkAs } from "@/lib/actions/developer";
import { canWorkAs } from "@/lib/developer-mode";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { primeLocale, T } from "@/lib/server-t";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Access" };

const GROUPS = [
  { title: "Owner", body: "The business owner's account. Full control of money, staff and reports.", icon: ShieldCheck, roles: ["ADMIN"] },
  { title: "Manager", body: "Runs the operation day to day and approves what needs a second signature.", icon: ShieldCheck, roles: ["MANAGER"] },
  { title: "Finance", body: "Confirms prices, takes and checks payments and follows up debts.", icon: BadgeDollarSign, roles: ["FINANCE"] },
  { title: "Warehouse", body: "Receives, loads, checks in and hands out cargo — Guangzhou and Dar. No money powers.", icon: Warehouse, roles: ["CHINA_WAREHOUSE", "DAR_WAREHOUSE"] },
  { title: "Customer Support", body: "Talks to customers and chases answers. Never verifies a payment or releases cargo.", icon: Headset, roles: ["CUSTOMER_SUPPORT"] },
] as const;

const ago = (d: Date | null) => {
  if (!d) return "never signed in";
  const s = (Date.now() - d.getTime()) / 1000;
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))} minutes ago`;
  if (s < 86400) return `${Math.round(s / 3600)} hours ago`;
  if (s < 86400 * 60) return `${Math.round(s / 86400)} days ago`;
  return `${Math.round(s / 86400 / 30)} months ago`;
};

/**
 * ACCESS — OPEN THE SYSTEM AS ANYONE, IN ONE PRESS.
 *
 * Pick a person and press Work as: their menu, their permissions, their
 * screens, without their password. A bar on every page says who you are and
 * stops it. Everything done is recorded under the developer.
 */
export default async function AccessPage({ searchParams }: { searchParams: Promise<{ refused?: string }> }) {
  await primeLocale();
  const dev = await requirePermission("developer.activity");
  const sp = await searchParams;
  const [people, suspendedByMe, warehouses] = await Promise.all([
    prisma.user.findMany({
      where: { role: { notIn: ["CUSTOMER", "DEVELOPER"] } },
      orderBy: { name: "asc" },
      select: { id: true, name: true, email: true, role: true, active: true, status: true, lastLoginAt: true },
    }),
    prisma.auditLog.findMany({ where: { action: "developer.suspend", actorId: dev.id }, select: { entityId: true } }),
    prisma.warehouse.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true, kind: true } }),
  ]);
  const mine = new Set(suspendedByMe.map((r) => r.entityId));

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
        <h1 className="text-2xl font-bold">{T("Access")}</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          {people.length} {T("accounts. Pick a person and press “Work as” to open their screens exactly as they see them — without their password. Everything you do is recorded under your name.")}
        </p>
        </div>
        <AddAccountDialog warehouses={warehouses} />
      </header>

      {sp.refused ? (
        <p className="flex items-center gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm">
          <AlertTriangle className="size-4 text-warning" />
          {T("That account cannot be worked as — it is suspended, or not a staff account.")}
        </p>
      ) : null}

      <section className="grid gap-3 md:grid-cols-3">
        {[
          { icon: LogIn, title: "Work as", body: "Opens that person's screens with their real permissions. A bar at the top shows who you are working as; press Stop to come back here. It ends by itself after 4 hours." },
          { icon: AlertTriangle, title: "Suspend", body: "Blocks the account at once. You must say why and type CONFIRM. You can only re-activate accounts you suspended yourself." },
          { icon: Lock, title: "Safety while working as someone", body: "You cannot change passwords or roles, or create accounts, while working as someone — so it can never be used to take over an account." },
        ].map((c) => (
          <div key={c.title} className="rounded-2xl border bg-card p-4">
            <c.icon className="size-5 text-brand" />
            <p className="mt-2 text-sm font-semibold">{T(c.title)}</p>
            <p className="mt-1 text-xs text-muted-foreground">{T(c.body)}</p>
          </div>
        ))}
      </section>

      {GROUPS.map((g) => {
        const list = people.filter((p) => (g.roles as readonly string[]).includes(p.role));
        if (list.length === 0) return null;
        return (
          <section key={g.title} className="space-y-2">
            <div className="flex items-start gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand/10 text-brand"><g.icon className="size-5" /></span>
              <div>
                <h2 className="font-semibold">{T(g.title)} · {list.length}</h2>
                <p className="text-sm text-muted-foreground">{T(g.body)}</p>
              </div>
            </div>
            <div className="divide-y rounded-2xl border bg-card">
              {list.map((p) => {
                const ok = canWorkAs(p, dev.id);
                const suspended = p.status === "SUSPENDED";
                return (
                  <div key={p.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                    <span className="grid size-10 shrink-0 place-items-center rounded-full bg-brand/10 text-sm font-semibold text-brand">
                      {p.name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase()}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                        {p.name}
                        <span className={cn("text-xs font-medium", suspended ? "text-destructive" : "text-success")}>{suspended ? T("Suspended") : T("Active")}</span>
                        {p.role === "ADMIN" ? <span className="rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{T("Owner")}</span> : null}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">{p.email}</p>
                      <p className="text-xs text-muted-foreground">{T("Last signed in")} {ago(p.lastLoginAt)}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <form action={startWorkAs}>
                        <input type="hidden" name="userId" value={p.id} />
                        <button
                          type="submit"
                          disabled={!ok}
                          className="inline-flex items-center gap-1.5 rounded-full bg-brand px-4 py-1.5 text-sm font-semibold text-brand-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          <LogIn className="size-4" />
                          {T("Work as")}
                        </button>
                      </form>
                      {p.role === "ADMIN" ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs text-muted-foreground"><Lock className="size-3.5" />{T("Can't be suspended here")}</span>
                      ) : suspended ? (
                        mine.has(p.id) ? <ReactivateForm userId={p.id} /> : <span className="text-xs text-muted-foreground">{T("Suspended by someone else")}</span>
                      ) : (
                        <SuspendForm userId={p.id} name={p.name} />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
      <p className="flex items-center gap-2 text-xs text-muted-foreground"><Package className="size-3.5" />{T("Customer accounts are not listed — they are managed from Customers.")}</p>
    </div>
  );
}
