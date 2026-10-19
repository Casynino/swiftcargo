"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { recordAudit } from "@/lib/audit";
import { startWorkingAs, stopWorkingAs, workingAs } from "@/lib/developer";
import { isDeletedEmail, removeAccess, wouldLeaveNoOwner } from "@/lib/developer-accounts";
import { prisma } from "@/lib/prisma";
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
  /* Straight to the thing that needed doing, when asked — only ever a page in
     the app, never a link to somewhere else. */
  const next = String(formData.get("next") ?? "");
  redirect(next.startsWith("/app/") && !next.startsWith("//") ? next : "/app/dashboard");
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

export type AccessState = { error?: string; ok?: string };

/**
 * SUSPEND AN ACCOUNT — ASKED ONCE, IN A DIALOG, BEFORE IT IS SENT.
 *
 * Blocks the account at once — every request re-reads it, so an open session
 * stops with the next click. Never the owner, never another developer, never
 * oneself, and never while working as somebody. Recorded under the developer.
 */
export async function suspendAccount(_prev: AccessState, formData: FormData): Promise<AccessState> {
  const dev = await realDeveloper();
  if (!dev) return { error: "Not allowed." };
  if (await workingAs(dev.user.id, dev.sid)) return { error: "Stop working as someone first." };
  const id = String(formData.get("userId") ?? "");
  const target = await prisma.user.findUnique({ where: { id }, select: { id: true, name: true, role: true, status: true, email: true } });
  if (!target || target.role === "DEVELOPER" || target.id === dev.user.id || isDeletedEmail(target.email)) {
    return { error: "That account cannot be suspended here." };
  }
  if (target.status !== "ACTIVE") return { error: "It is not active." };
  if (await wouldLeaveNoOwner(prisma, target)) return { error: "That is the only active owner account. Open another owner account first." };
  await prisma.user.update({ where: { id: target.id }, data: { status: "SUSPENDED" } });
  await recordAudit({
    actor: dev.user,
    action: "developer.suspend",
    entity: "User",
    entityId: target.id,
    summary: `${dev.user.name} suspended ${target.name}`,
  });
  revalidatePath("/app/developer/users");
  return { ok: `${target.name} is suspended.` };
}

/** Re-activate — only an account this developer suspended and nobody has touched since. */
export async function reactivateAccount(_prev: AccessState, formData: FormData): Promise<AccessState> {
  const dev = await realDeveloper();
  if (!dev) return { error: "Not allowed." };
  if (await workingAs(dev.user.id, dev.sid)) return { error: "Stop working as someone first." };
  const id = String(formData.get("userId") ?? "");
  const target = await prisma.user.findUnique({ where: { id }, select: { id: true, name: true, status: true } });
  if (!target || target.status !== "SUSPENDED") return { error: "It is not suspended." };
  const last = await prisma.auditLog.findFirst({
    where: { entityId: id, action: { in: ["developer.suspend", "developer.reactivate"] }, actorId: dev.user.id },
    orderBy: { createdAt: "desc" },
    select: { action: true },
  });
  if (last?.action !== "developer.suspend") return { error: "You can only re-activate accounts you suspended yourself." };
  await prisma.user.update({ where: { id }, data: { status: "ACTIVE" } });
  await recordAudit({
    actor: dev.user,
    action: "developer.reactivate",
    entity: "User",
    entityId: id,
    summary: `${dev.user.name} re-activated ${target.name}`,
  });
  revalidatePath("/app/developer/users");
  return { ok: `${target.name} can sign in again.` };
}

/**
 * DELETE AN ACCOUNT: REMOVE THE PERSON'S WAY IN, KEEP EVERYTHING THEY DID.
 *
 * Any account but another developer's, one's own, or the last active owner's.
 * They can never sign in again and disappear from every list, but the records
 * they made — payments, receiving, bills, messages — stay exactly as they
 * were, under their name (lib/developer-accounts.ts). Recorded under the
 * developer first, with who it was and the address they signed in with.
 */
export async function deleteAccount(_prev: AccessState, formData: FormData): Promise<AccessState> {
  const dev = await realDeveloper();
  if (!dev) return { error: "Not allowed." };
  if (await workingAs(dev.user.id, dev.sid)) return { error: "Stop working as someone first." };
  const id = String(formData.get("userId") ?? "");
  const target = await prisma.user.findUnique({ where: { id }, select: { id: true, name: true, email: true, role: true } });
  if (!target || target.role === "DEVELOPER" || target.id === dev.user.id || isDeletedEmail(target.email)) {
    return { error: "That account cannot be deleted here." };
  }
  if (await wouldLeaveNoOwner(prisma, target)) return { error: "That is the only active owner account. Open another owner account first." };

  await prisma.$transaction((tx) => removeAccess(tx, id));
  await recordAudit({
    actor: dev.user,
    action: "developer.delete",
    entity: "User",
    entityId: id,
    summary: `${dev.user.name} deleted the account of ${target.name} (${target.role})`,
    metadata: { was: { name: target.name, email: target.email, role: target.role } },
  });
  revalidatePath("/app/developer/users");
  return { ok: `${target.name}'s account is deleted. What they recorded is kept.` };
}

/**
 * DELETE A CUSTOMER: THEY LOSE THEIR WAY IN, THEIR HISTORY STAYS.
 *
 * The customer is taken off the books the way the customers screen does it —
 * archived, so lists and search stop offering them for new cargo — and their
 * portal sign-in, if any, is closed. Unlike the customers screen it is not
 * refused for cargo or bills on record: nothing is removed, so every
 * consignment, bill and payment still names them.
 */
export async function deleteCustomerAccount(_prev: AccessState, formData: FormData): Promise<AccessState> {
  const dev = await realDeveloper();
  if (!dev) return { error: "Not allowed." };
  if (await workingAs(dev.user.id, dev.sid)) return { error: "Stop working as someone first." };
  const id = String(formData.get("customerId") ?? "");
  const customer = await prisma.customer.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, code: true, fullName: true, businessName: true, login: { select: { id: true } } },
  });
  if (!customer) return { error: "That customer is already gone." };
  await prisma.$transaction(async (tx) => {
    await tx.customer.update({ where: { id: customer.id }, data: { deletedAt: new Date() } });
    if (customer.login) await removeAccess(tx, customer.login.id);
  });
  const name = customer.businessName || customer.fullName;
  await recordAudit({
    actor: dev.user,
    action: "developer.delete_customer",
    entity: "Customer",
    entityId: customer.id,
    summary: `${dev.user.name} deleted the customer ${name} (${customer.code})`,
  });
  revalidatePath("/app/developer/users");
  revalidatePath("/app/customers");
  return { ok: `${name} is deleted. Their cargo and bills are kept.` };
}
