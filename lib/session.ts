import { cache } from "react";
import { redirect } from "next/navigation";
import type { Department, Role } from "@prisma/client";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { can, isStaff, type Permission } from "@/lib/rbac";

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
  department: Department | null;
  warehouseId: string | null;
  /** Set only for role CUSTOMER. The only thing that scopes a portal query. */
  customerId: string | null;
};

/**
 * THE SESSION SAYS WHO. THE DATABASE SAYS WHAT THEY MAY DO.
 *
 * The signed token carries the role and the department, and it carries them
 * unchanged from the moment somebody signed in — the jwt callback writes them
 * once and nothing reads them again. So suspending a member of staff would take
 * effect only when their token expired, and demoting one only then too: for up
 * to a working day, a person who had been removed would keep recording payments
 * with the authority they used to have.
 *
 * One indexed read by primary key, cached for the request, so a page that checks
 * a permission six times asks once. What it costs is a millisecond; what it buys
 * is that "remove access" means now.
 */
const liveUser = cache(async (id: string) => {
  return prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      department: true,
      warehouseId: true,
      customerId: true,
      active: true,
      status: true,
    },
  });
});

/**
 * Set by `viewer()` when the session is real but the account behind it is not.
 *
 * A module-level flag rather than a return value because viewer() has several
 * callers with different shapes and only the redirecting one needs to know the
 * difference. It is read immediately after the call that sets it.
 */
let revoked = false;

/**
 * Who is asking, as the database currently describes them.
 *
 * Null when there is no session, and null when the account behind the session
 * has been suspended or removed — the same two tests the login screen makes,
 * asked again on every request rather than once at sign-in.
 */
async function viewer(): Promise<SessionUser | null> {
  const session = await auth();
  if (!session?.user?.id) return null;

  const user = await liveUser(session.user.id);
  if (!user || !user.active || user.status !== "ACTIVE") {
    /* Distinguished from "not signed in", because the cookie is still valid and
       middleware would otherwise bounce them straight back off the login page
       into the app, and the app straight back to login. */
    revoked = true;
    return null;
  }

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    department: user.department,
    warehouseId: user.warehouseId,
    customerId: user.customerId,
  };
}

export async function currentUser(): Promise<SessionUser | null> {
  return viewer();
}

/** For pages: bounce to login when there is no session. */
export async function requireUser(): Promise<SessionUser> {
  const user = await viewer();
  if (!user) {
    /*
      A SUSPENDED ACCOUNT MUST NOT LOOP.

      Their cookie is still valid, so middleware sees a signed-in person on
      /login and sends them to the dashboard, which sends them back here. The
      marker tells middleware to let the login page render, and the page tells
      them what happened instead of leaving them staring at a form that was
      working ten minutes ago.
    */
    redirect(revoked ? "/login?revoked=1" : "/login");
  }
  return user;
}

/** For staff pages: a session, and not a customer's. */
export async function requireStaff(): Promise<SessionUser> {
  const user = await requireUser();
  if (!isStaff(user.role)) redirect("/portal");
  return user;
}

/** For staff pages: bounce to the no-access screen when the permission is missing. */
export async function requirePermission(
  permission: Permission
): Promise<SessionUser> {
  const user = await requireStaff();
  if (!can(user.role, permission)) redirect("/app/no-access");
  return user;
}

/**
 * For server actions. Throws instead of redirecting, so the caller can return a
 * typed error to the form rather than a mystery navigation.
 *
 * EVERY `"use server"` EXPORT CALLS THIS. A server action is a public endpoint
 * whether or not a button renders for it, so hiding the control is not a
 * permission — it is only a courtesy to the person who cannot use it.
 */
export async function authorize(permission: Permission): Promise<SessionUser> {
  const user = await viewer();
  if (!user) throw new Error("Not signed in.");
  if (!isStaff(user.role)) throw new Error("Not permitted.");
  if (!can(user.role, permission)) {
    throw new Error("You do not have permission to do that.");
  }
  return user;
}

/** As `authorize`, for an act more than one desk does as part of its own job. */
export async function authorizeAny(permissions: Permission[]): Promise<SessionUser> {
  const user = await viewer();
  if (!user) throw new Error("Not signed in.");
  if (!isStaff(user.role)) throw new Error("Not permitted.");
  if (!permissions.some((permission) => can(user.role, permission))) {
    throw new Error("You do not have permission to do that.");
  }
  return user;
}

/**
 * THE CUSTOMER GATE.
 *
 * Returns the customer id this session is allowed to read, and nothing else.
 * Every portal query must be scoped by this value — never by an id taken from a
 * URL, a form field or a request body. Changing a number in an address bar is
 * the whole attack, and the only defence that works is never reading the number.
 */
export async function requireCustomer(): Promise<
  SessionUser & { customerId: string }
> {
  const user = await requireUser();
  if (user.role !== "CUSTOMER" || !user.customerId) redirect("/app/dashboard");
  return user as SessionUser & { customerId: string };
}

/** The same gate, for customer-facing server actions. Throws rather than redirects. */
export async function authorizeCustomer(): Promise<
  SessionUser & { customerId: string }
> {
  const user = await viewer();
  if (!user) throw new Error("Not signed in.");
  if (user.role !== "CUSTOMER" || !user.customerId) {
    throw new Error("Not permitted.");
  }
  return user as SessionUser & { customerId: string };
}
