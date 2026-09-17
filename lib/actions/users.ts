"use server";

import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { z } from "zod";
import type { Role, WarehouseKind } from "@prisma/client";

import { recordAudit, recordFieldChange } from "@/lib/audit";
import { ROLE_DEPARTMENT, ROLE_LABELS } from "@/lib/constants";
import { prisma, type TxClient } from "@/lib/prisma";
import { authorize, type SessionUser } from "@/lib/session";

export type ActionState = { error?: string; ok?: string };

/**
 * Staff accounts — and the rails that stop staffing from being a way to take
 * the company.
 *
 * The owner has handed hiring to the manager: MANAGER holds `user.manage`, so a
 * manager opens accounts, assigns roles, suspends people and resets passwords
 * without asking anybody. That is also the one capability that can grant every
 * other one — whoever hands out roles can hand one to himself. A manager able to
 * mint an ADMIN would hold the rate book, the company settings and the
 * destructive verbs: every line the owner deliberately kept back in lib/rbac.ts.
 *
 * So ADMIN stays the owner's, and only an ADMIN writes it:
 *
 *   createUser         nobody but the owner creates an owner.
 *   changeUserRole     nobody but the owner moves somebody INTO the owner's
 *                      role, or OUT of it — otherwise a manager demotes the
 *                      owner first and does as he likes with what is left.
 *   setUserActive      an owner account somebody else can switch off is not the
 *   resetUserPassword  owner's, and one somebody else can give a new password
 *                      to is theirs. Both are barred in either direction.
 *
 * WHY HERE AND NOT IN THE PERMISSION TABLE. can(role, permission) answers "may
 * this desk edit staff accounts", and the manager may. What has to be said is
 * "may this desk write THIS VALUE into that column", and a permission has no
 * vocabulary for a value. So it lives at the last point before the write, where
 * the value and the row are both in hand.
 *
 * The row is read inside the transaction that writes it, and the write is
 * claimed on the role that was read (`where: { id, role }`, count === 0). A role
 * read a second before an unconditional update is a race whose losing case is
 * the owner demoted by his own manager while the guard reads "only Finance".
 *
 * Every refusal is a sentence returned to the form, and every one is written to
 * the audit log — a blocked attempt to mint an owner leaves no other trace,
 * since nothing changed.
 */

const OWNER: Role = "ADMIN";

const OWNER_ONLY_CREATE = "Only the owner can create another owner account.";
const OWNER_ONLY_CHANGE = "Only the owner can change the owner's account.";

/*
  CUSTOMER is absent: a customer account is created by registering against a
  Customer record, and one minted here would have no customer to be scoped by —
  an account whose scoping is null and whose portal queries have no WHERE clause.
*/
const STAFF_ROLES = [
  "ADMIN",
  "MANAGER",
  "CUSTOMER_SUPPORT",
  "CHINA_WAREHOUSE",
  "DAR_WAREHOUSE",
  "FINANCE",
] as const;

/** The floor a warehouse role stands on. Any other role stands on none. */
const ROLE_WAREHOUSE_KIND: Partial<Record<Role, WarehouseKind>> = {
  CHINA_WAREHOUSE: "CHINA",
  DAR_WAREHOUSE: "TANZANIA",
};

type Guarded = { error: string | null; ok?: string };

async function gate(): Promise<SessionUser | { error: string }> {
  try {
    return await authorize("user.manage");
  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message : "You do not have permission to do that.",
    };
  }
}

/*
  THE LAST ACTIVE ADMINISTRATOR STAYS.

  With no active ADMIN left, the settings, the rate book and the owner's rails
  are held by nobody, and no screen in the product can put them back.
*/
async function isLastActiveOwner(tx: TxClient, userId: string) {
  const others = await tx.user.count({
    where: { role: OWNER, active: true, status: "ACTIVE", id: { not: userId } },
  });
  return others === 0;
}

const createSchema = z.object({
  name: z.string().trim().min(2, "Name is required."),
  email: z.string().trim().toLowerCase().email("A valid email is required."),
  phone: z.string().trim().optional(),
  role: z.enum(STAFF_ROLES, {
    errorMap: () => ({ message: "Choose a role for them." }),
  }),
  warehouseId: z.string().trim().optional(),
  status: z.enum(["ACTIVE", "SUSPENDED", "INACTIVE"]).default("ACTIVE"),
  password: z.string().min(8, "Password must be at least 8 characters."),
});

export async function createUser(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const actor = await gate();
  if ("error" in actor) return actor;

  const parsed = createSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    phone: formData.get("phone") || undefined,
    role: formData.get("role"),
    warehouseId: formData.get("warehouseId") || undefined,
    status: formData.get("status") || undefined,
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the form." };
  }
  const input = parsed.data;
  const role = input.role as Role;

  // No transaction needed: this account does not exist yet, so there is no row
  // whose role could change underneath the check.
  if (role === OWNER && actor.role !== OWNER) {
    await recordAudit({
      actor,
      action: "user.escalationBlocked",
      entity: "User",
      summary: `Blocked an attempt to create ${input.name} as ${ROLE_LABELS[OWNER]}`,
      metadata: { attempted: "create", requestedRole: role, email: input.email },
    });
    return { error: OWNER_ONLY_CREATE };
  }

  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) return { error: "A staff account already uses that email." };

  /*
    The warehouse is a Guangzhou or a Dar floor, and the role already says which.
    A Finance account pinned to a warehouse is a field nobody can act on, and a
    China clerk pinned to the Dar floor is narrowed to the wrong site — so the
    choice is kept only for warehouse roles and only when the kinds agree. With
    one floor of that kind there is nothing to choose, and it is filled in.
  */
  const kind = ROLE_WAREHOUSE_KIND[role];
  let warehouseId: string | null = null;
  if (kind) {
    if (input.warehouseId) {
      const warehouse = await prisma.warehouse.findUnique({
        where: { id: input.warehouseId },
        select: { kind: true, active: true },
      });
      if (!warehouse || !warehouse.active) return { error: "That warehouse is not open." };
      if (warehouse.kind !== kind) {
        return {
          error:
            kind === "CHINA"
              ? "China Warehouse staff work in a China warehouse."
              : "Dar Warehouse staff work in a Tanzania warehouse.",
        };
      }
      warehouseId = input.warehouseId;
    } else {
      const floors = await prisma.warehouse.findMany({
        where: { kind, active: true },
        select: { id: true },
        take: 2,
      });
      if (floors.length === 1) warehouseId = floors[0].id;
    }
  }

  const passwordHash = await bcrypt.hash(input.password, 12);

  const user = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: {
        name: input.name,
        email: input.email,
        phone: input.phone || null,
        role,
        department: ROLE_DEPARTMENT[role],
        warehouseId,
        status: input.status,
        // `status` is what a manager reads; `active` is what the sign-in check
        // asks. They move together or someone is locked out of a screen that
        // says they are fine.
        active: input.status === "ACTIVE",
        passwordHash,
        createdById: actor.id,
      },
      select: {
        id: true,
        name: true,
        role: true,
        status: true,
        warehouse: { select: { name: true } },
      },
    });

    await recordAudit(
      {
        actor,
        action: "user.create",
        entity: "User",
        entityId: created.id,
        summary: `Created ${created.name} as ${ROLE_LABELS[created.role]}`,
        metadata: {
          status: created.status,
          warehouse: created.warehouse?.name ?? "n/a",
        },
      },
      tx
    );
    return created;
  });

  revalidatePath("/app/admin/users");
  return { ok: `${user.name} can now sign in.` };
}

export async function setUserActive(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const actor = await gate();
  if ("error" in actor) return actor;

  const userId = String(formData.get("userId") ?? "");
  const active = String(formData.get("active") ?? "") === "true";
  if (!userId) return { error: "Missing staff member." };
  // Locking yourself out can leave the company with no way back in.
  if (userId === actor.id) return { error: "You cannot deactivate your own account." };

  const outcome = await prisma.$transaction(async (tx): Promise<Guarded> => {
    const target = await tx.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, role: true, status: true },
    });
    if (!target || target.role === "CUSTOMER") {
      return { error: "That staff member no longer exists." };
    }

    /*
      Barred in both directions. Switching the owner off is the obvious attack;
      switching a suspended owner account back ON overrules the only person who
      could have suspended it.
    */
    if (target.role === OWNER && actor.role !== OWNER) {
      await recordAudit(
        {
          actor,
          action: "user.escalationBlocked",
          entity: "User",
          entityId: target.id,
          summary: `Blocked an attempt to ${active ? "reactivate" : "deactivate"} ${target.name}, the ${ROLE_LABELS[OWNER]} account`,
          metadata: {
            attempted: active ? "activate" : "deactivate",
            targetRole: target.role,
          },
        },
        tx
      );
      return { error: OWNER_ONLY_CHANGE };
    }

    if (!active && target.role === OWNER && (await isLastActiveOwner(tx, target.id))) {
      return { error: "This is the last active administrator." };
    }

    const status = active ? "ACTIVE" : "SUSPENDED";
    if (target.status === status) {
      return { error: null, ok: `${target.name} is already ${status.toLowerCase()}.` };
    }

    const claimed = await tx.user.updateMany({
      // Claimed on the role the guard just read, so a promotion landing between
      // the read and the write loses instead of slipping past it.
      where: { id: target.id, role: target.role },
      data: { active, status },
    });
    if (claimed.count === 0) {
      return {
        error: "That person's role changed a moment ago. Reload before changing their account.",
      };
    }

    await recordFieldChange(
      {
        actor,
        entity: "User",
        entityId: target.id,
        field: "status",
        oldValue: target.status,
        newValue: status,
      },
      tx
    );
    await recordAudit(
      {
        actor,
        action: active ? "user.activate" : "user.deactivate",
        entity: "User",
        entityId: target.id,
        summary: `${active ? "Reactivated" : "Deactivated"} ${target.name}`,
        metadata: { from: target.status, to: status },
      },
      tx
    );
    return {
      error: null,
      ok: active
        ? `${target.name} can sign in again.`
        : `${target.name} can no longer sign in.`,
    };
  });

  if (outcome.error) return { error: outcome.error };
  revalidatePath("/app/admin/users");
  revalidatePath(`/app/admin/users/${userId}`);
  return { ok: outcome.ok };
}

export async function resetUserPassword(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const actor = await gate();
  if ("error" in actor) return actor;

  const userId = String(formData.get("userId") ?? "");
  const password = String(formData.get("password") ?? "");
  if (!userId) return { error: "Missing staff member." };
  if (password.length < 8) return { error: "Password must be at least 8 characters." };

  // Hashed before the transaction opens: bcrypt is deliberately slow, and
  // spending that holding a row lock is how this screen starts timing out.
  const passwordHash = await bcrypt.hash(password, 12);

  const outcome = await prisma.$transaction(async (tx): Promise<Guarded> => {
    const target = await tx.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, role: true },
    });
    if (!target || target.role === "CUSTOMER") {
      return { error: "That staff member no longer exists." };
    }

    /*
      Handing somebody a password is handing them the account. Left open this is
      the cheapest route of all: no role changes, nothing on the staff screen
      looks different, and the manager simply signs in as the owner.
    */
    if (target.role === OWNER && actor.role !== OWNER) {
      await recordAudit(
        {
          actor,
          action: "user.escalationBlocked",
          entity: "User",
          entityId: target.id,
          summary: `Blocked an attempt to reset the password of ${target.name}, the ${ROLE_LABELS[OWNER]} account`,
          metadata: { attempted: "resetPassword", targetRole: target.role },
        },
        tx
      );
      return { error: OWNER_ONLY_CHANGE };
    }

    const claimed = await tx.user.updateMany({
      where: { id: target.id, role: target.role },
      data: { passwordHash },
    });
    if (claimed.count === 0) {
      return {
        error: "That person's role changed a moment ago. Reload before resetting their password.",
      };
    }

    // The password itself is never written anywhere — not to the summary, not
    // to metadata. That a reset happened is the fact worth keeping.
    await recordAudit(
      {
        actor,
        action: "user.resetPassword",
        entity: "User",
        entityId: target.id,
        summary: `Reset the password for ${target.name}`,
      },
      tx
    );
    return { error: null, ok: `Password reset for ${target.name}.` };
  });

  if (outcome.error) return { error: outcome.error };
  revalidatePath(`/app/admin/users/${userId}`);
  return { ok: outcome.ok };
}

export async function changeUserRole(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const actor = await gate();
  if ("error" in actor) return actor;

  const userId = String(formData.get("userId") ?? "");
  const parsedRole = z.enum(STAFF_ROLES).safeParse(formData.get("role"));
  if (!userId || !parsedRole.success) return { error: "Choose a valid role." };
  const role = parsedRole.data as Role;
  if (userId === actor.id) return { error: "You cannot change your own role." };

  const outcome = await prisma.$transaction(async (tx): Promise<Guarded> => {
    const target = await tx.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, role: true, department: true, warehouseId: true },
    });
    if (!target || target.role === "CUSTOMER") {
      return { error: "That staff member no longer exists." };
    }

    /*
      Both halves of the rule. Barring promotion INTO the owner's role alone
      still leaves a manager able to demote the owner to Finance, and then there
      is no owner left to overrule anything. `role` is the request; who the
      person IS comes off the row read inside this transaction, because that is
      the half a browser would lie about.
    */
    if (actor.role !== OWNER && (role === OWNER || target.role === OWNER)) {
      await recordAudit(
        {
          actor,
          action: "user.escalationBlocked",
          entity: "User",
          entityId: target.id,
          summary: `Blocked an attempt to move ${target.name} from ${ROLE_LABELS[target.role]} to ${ROLE_LABELS[role]}`,
          metadata: { attempted: "changeRole", from: target.role, to: role },
        },
        tx
      );
      return { error: OWNER_ONLY_CHANGE };
    }

    if (target.role === role) {
      return { error: null, ok: `${target.name} is already ${ROLE_LABELS[role]}.` };
    }

    if (target.role === OWNER && (await isLastActiveOwner(tx, target.id))) {
      return { error: "This is the last administrator. Promote somebody else first." };
    }

    // A warehouse pin survives only a move between roles on the same floor; a
    // China clerk moved to Finance is no longer narrowed to Guangzhou.
    const nextKind = ROLE_WAREHOUSE_KIND[role];
    const warehouseId =
      nextKind !== undefined && nextKind === ROLE_WAREHOUSE_KIND[target.role]
        ? target.warehouseId
        : null;
    const department = ROLE_DEPARTMENT[role];

    const claimed = await tx.user.updateMany({
      where: { id: target.id, role: target.role },
      data: { role, department, warehouseId },
    });
    if (claimed.count === 0) {
      return {
        error: "Somebody changed that person's role a moment ago. Reload before changing it again.",
      };
    }

    const changes: { field: string; oldValue: unknown; newValue: unknown }[] = [
      { field: "role", oldValue: target.role, newValue: role },
      { field: "department", oldValue: target.department, newValue: department },
      { field: "warehouseId", oldValue: target.warehouseId, newValue: warehouseId },
    ];
    for (const change of changes) {
      if (change.oldValue === change.newValue) continue;
      await recordFieldChange(
        { actor, entity: "User", entityId: target.id, ...change },
        tx
      );
    }

    await recordAudit(
      {
        actor,
        action: "user.changeRole",
        entity: "User",
        entityId: target.id,
        // Both ends of the move: "moved Amina to Finance" does not say what she
        // could do yesterday, which is the question asked of this line later.
        summary: `Moved ${target.name} from ${ROLE_LABELS[target.role]} to ${ROLE_LABELS[role]}`,
        metadata: { from: target.role, to: role },
      },
      tx
    );
    return { error: null, ok: `${target.name} is now ${ROLE_LABELS[role]}.` };
  });

  if (outcome.error) return { error: outcome.error };
  revalidatePath("/app/admin/users");
  revalidatePath(`/app/admin/users/${userId}`);
  return { ok: outcome.ok };
}

const salarySchema = z.object({
  userId: z.string().trim().min(1, "Missing staff member."),
  /* Blank takes somebody off the payroll; it never means zero. */
  baseSalary: z
    .string()
    .trim()
    .transform((v) => (v === "" ? null : Number(v.replace(/,/g, ""))))
    .refine((v) => v === null || (Number.isFinite(v) && v > 0), "A salary is a positive amount, or blank for nobody on the payroll."),
});

/**
 * WHAT SOMEBODY IS PAID A MONTH, ON THEIR STAFF RECORD.
 *
 * The one place a salary is written. A run copies it onto its lines when it is
 * built, so a change here reaches next month's run and never restates a month
 * already paid. Every change keeps both figures in FieldChange: a raise is the
 * first thing asked about when a salary bill moves.
 */
export async function setBaseSalary(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const actor = await gate();
  if ("error" in actor) return actor;

  const parsed = salarySchema.safeParse({
    userId: formData.get("userId") ?? "",
    baseSalary: String(formData.get("baseSalary") ?? ""),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the form." };
  }
  const { userId, baseSalary } = parsed.data;
  const next = baseSalary === null ? null : Math.round(baseSalary * 100) / 100;
  /* Whoever manages staff also sits on the payroll. Writing your own pay is the
     one salary change nobody else would ever see being made. */
  if (userId === actor.id) return { error: "You cannot set your own salary." };

  const outcome = await prisma.$transaction(async (tx): Promise<Guarded> => {
    const target = await tx.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, role: true, baseSalary: true },
    });
    if (!target || target.role === "CUSTOMER") {
      return { error: "That staff member no longer exists." };
    }
    const before = target.baseSalary === null ? null : Number(target.baseSalary);
    if (before === next) {
      return { error: null, ok: "Nothing changed." };
    }

    await recordFieldChange(
      { actor, entity: "User", entityId: target.id, field: "baseSalary", oldValue: before, newValue: next },
      tx
    );
    await tx.user.update({ where: { id: target.id }, data: { baseSalary: next } });
    await recordAudit(
      {
        actor,
        action: "user.setSalary",
        entity: "User",
        entityId: target.id,
        summary:
          next === null
            ? `Took ${target.name} off the payroll (was USD ${before?.toFixed(2)})`
            : `Set ${target.name}'s monthly salary to USD ${next.toFixed(2)}${before === null ? "" : ` (was USD ${before.toFixed(2)})`}`,
        metadata: { from: before, to: next },
      },
      tx
    );
    return { error: null, ok: "Salary saved." };
  });

  if (outcome.error) return { error: outcome.error };
  revalidatePath(`/app/admin/users/${userId}`);
  revalidatePath("/app/finance/payroll");
  revalidatePath("/app/manager/payroll");
  return { ok: outcome.ok };
}
