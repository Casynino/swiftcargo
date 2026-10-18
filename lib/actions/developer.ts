"use server";

import { redirect } from "next/navigation";

import { recordAudit } from "@/lib/audit";
import { startWorkingAs, stopWorkingAs, workingAs } from "@/lib/developer";
import { realDeveloper } from "@/lib/session";

/**
 * WORK AS A STAFF MEMBER.
 *
 * Only a developer in developer mode can start it — the server reads that from
 * the session row, never from the request. While it lasts the session is that
 * person: their menu, their permissions, their refusals. Everything done is
 * recorded under the developer, with the person's name beside it, and it ends
 * by Stop, by four hours, or by the person becoming ineligible.
 */
export async function startWorkAs(formData: FormData) {
  const dev = await realDeveloper();
  if (!dev) redirect("/login");
  const targetId = String(formData.get("userId") ?? "");
  const target = await startWorkingAs(dev.user.id, dev.sid, targetId);
  if (!target) redirect("/app/developer/users?refused=1");
  await recordAudit({
    actor: dev.user,
    action: "developer.work_as.start",
    entity: "User",
    entityId: target.id,
    summary: `${dev.user.name} started working as ${target.name} (${target.role})`,
    metadata: { target: { id: target.id, name: target.name, role: target.role } },
  });
  redirect("/app/dashboard");
}

export async function stopWorkAs() {
  const dev = await realDeveloper();
  if (!dev) redirect("/login");
  const target = await workingAs(dev.user.id, dev.sid);
  await stopWorkingAs(dev.user.id, dev.sid);
  await recordAudit({
    actor: dev.user,
    action: "developer.work_as.stop",
    entity: "User",
    entityId: target?.id ?? null,
    summary: `${dev.user.name} stopped working as ${target?.name ?? "a staff member"}`,
  });
  redirect("/app/developer/users");
}
