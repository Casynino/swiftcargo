import type { Metadata } from "next";
import { AlertTriangle, UserRoundCog } from "lucide-react";

import { PageHeader } from "@/components/app/page-header";
import { startWorkAs } from "@/lib/actions/developer";
import { DEPARTMENT_LABELS, ROLE_LABELS } from "@/lib/constants";
import { canWorkAs } from "@/lib/developer-mode";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { primeLocale, T } from "@/lib/server-t";

export const metadata: Metadata = { title: "Work as" };

/**
 * WORK AS A STAFF MEMBER — THE DEVELOPER'S DOOR.
 *
 * Opens the system as that person: their menu, their permissions, their
 * screens. Everything done there is recorded as the developer, with the
 * person's name beside it, and a banner says so on every page until Stop.
 * Nothing about their sign-in is touched.
 */
export default async function WorkAsPage({ searchParams }: { searchParams: Promise<{ refused?: string }> }) {
  await primeLocale();
  const dev = await requirePermission("developer.activity");
  const sp = await searchParams;
  const people = (
    await prisma.user.findMany({
      where: { role: { notIn: ["CUSTOMER", "DEVELOPER"] } },
      orderBy: [{ role: "asc" }, { name: "asc" }],
      select: { id: true, name: true, email: true, role: true, department: true, active: true, status: true, lastLoginAt: true },
    })
  );

  return (
    <div className="space-y-4">
      <PageHeader
        title={T("Work as")}
        description={T("Open the system as a staff member, with their own role and permissions. Everything you do is recorded as the developer, and a banner shows it until you press Stop. It ends by itself after four hours.")}
      />
      {sp.refused ? (
        <p className="flex items-center gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm">
          <AlertTriangle className="size-4 text-warning" />
          {T("That account cannot be worked as — it is suspended, or not a staff account.")}
        </p>
      ) : null}
      <div className="overflow-hidden rounded-xl border bg-card">
        <ul className="divide-y">
          {people.map((p) => {
            const ok = canWorkAs(p, dev.id);
            return (
              <li key={p.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{p.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {ROLE_LABELS[p.role]}
                    {p.department ? ` · ${DEPARTMENT_LABELS[p.department]}` : ""} · {p.email}
                    {p.status !== "ACTIVE" ? ` · ${p.status.toLowerCase()}` : ""}
                  </p>
                </div>
                <form action={startWorkAs}>
                  <input type="hidden" name="userId" value={p.id} />
                  <button
                    type="submit"
                    disabled={!ok}
                    className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <UserRoundCog className="size-4" />
                    {T("Work as")}
                  </button>
                </form>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
