import { cache } from "react";
import { redirect } from "next/navigation";
import type { Department, Role } from "@prisma/client";

import { auth } from "@/auth";
import { auditIdentity } from "@/lib/audit-identity";
import { standingOf, workingAs } from "@/lib/developer";
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
  /** "DEVELOPER" only for the developer account in developer mode. */
  accountType?: "DEVELOPER" | "STAFF";
  /**
   * Set while the developer is working as this person. The session IS that
   * person — their role, their permissions, their menu — and this says who is
   * really behind it, so everything recorded is recorded under the developer.
   */
  impersonatedBy?: { id: string; name: string; email: string } | null;
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

  /* THE DEVELOPER ACTS ONLY IN DEVELOPER MODE, AND THE DATABASE SAYS WHEN.
     The token proves the account; the server-side session row says whether the
     account has chosen developer mode and has not since left it. Anything else
     is treated as signed out — so a stale cookie, a token for a session that
     was switched to a staff account, or one that never made the choice keeps
     no privilege at all. */
  if (user.role === "DEVELOPER") {
    const standing = await standingOf(user.id, session.user.sid);
    if (standing !== "active") return null;
    /* WORKING AS. The target's own role and permissions apply, never the
       developer's — a refusal for that person is a refusal. */
    const target = await workingAs(user.id, session.user.sid);
    if (target) {
      return {
        id: target.id,
        name: target.name,
        email: target.email,
        role: target.role,
        department: target.department,
        warehouseId: target.warehouseId,
        customerId: target.customerId,
        accountType: "DEVELOPER",
        impersonatedBy: { id: user.id, name: user.name, email: user.email },
      };
    }
  }
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    department: user.department,
    warehouseId: user.warehouseId,
    customerId: user.customerId,
    accountType: user.role === "DEVELOPER" ? "DEVELOPER" : "STAFF",
  };
}

export async function currentUser(): Promise<SessionUser | null> {
  return viewer();
}

/** For pages: bounce to login when there is no session. */
export async function requireUser(): Promise<SessionUser> {
  const user = await viewer();
  if (!user) {
    /* A developer who has not chosen yet goes to the choice; one whose sign-in
       was ended goes to the login page and is told so. Asked of the database
       here, on the one path that needs it, rather than carried in a flag that
       a concurrent request could overwrite. */
    if (!revoked) {
      const held = await auth();
      if (held?.user?.id && held.user.role === "DEVELOPER") {
        const standing = await standingOf(held.user.id, held.user.sid);
        if (standing === "pending") redirect("/login");
        if (standing === "none") redirect("/login?revoked=1&reason=session-ended");
      }
    }
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
    await recordDenied(user, permission);
    throw new Error("You do not have permission to do that.");
  }
  return user;
}

/**
 * The developer themselves, whatever they are working as — for the few things
 * only the developer may do (start or stop working as someone). Null for
 * anybody else, and for a developer who has not chosen developer mode.
 */
export async function realDeveloper() {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== "DEVELOPER") return null;
  if ((await standingOf(session.user.id, session.user.sid)) !== "active") return null;
  const row = await liveUser(session.user.id);
  if (!row || !row.active || row.status !== "ACTIVE") return null;
  return { user: row, sid: session.user.sid! };
}

/**
 * A REFUSAL IS A SECURITY EVENT.
 *
 * A signed-in person asking for something their role does not hold — through a
 * button that was never rendered, or by calling the endpoint directly — is
 * written down under their own name, so the pattern is visible. Never allowed
 * to stop the refusal itself.
 */
async function recordDenied(user: SessionUser, permission: string) {
  try {
    await prisma.auditLog.create({
      data: {
        ...auditIdentity(user),
        action: "security.denied",
        entity: "Permission",
        summary: `${user.name} was refused ${permission}`,
        outcome: "DENIED",
        metadata: { permission },
      },
    });
  } catch {
    /* The refusal stands whether or not the line was written. */
  }
}

/** As `authorize`, for an act more than one desk does as part of its own job. */
export async function authorizeAny(permissions: Permission[]): Promise<SessionUser> {
  const user = await viewer();
  if (!user) throw new Error("Not signed in.");
  if (!isStaff(user.role)) throw new Error("Not permitted.");
  if (!permissions.some((permission) => can(user.role, permission))) {
    await recordDenied(user, permissions.join(" | "));
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
