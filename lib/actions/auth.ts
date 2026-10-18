"use server";

import { AuthError } from "next-auth";

import { auth, signIn, signOut } from "@/auth";
import { recordAudit } from "@/lib/audit";
import { endDeveloperSession } from "@/lib/developer";
import { prisma } from "@/lib/prisma";

export type LoginState = { error?: string };

/**
 * Sign in.
 *
 * The error message is deliberately the same whether the address is unknown or
 * the password is wrong. Telling a stranger which half they got right is how a
 * login form becomes a way to enumerate who works here.
 */
export async function login(
  _prev: LoginState,
  formData: FormData
): Promise<LoginState> {
  const email = String(formData.get("identifier") ?? formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const callbackUrl = String(formData.get("callbackUrl") ?? "");

  try {
    await signIn("credentials", {
      email,
      password,
      redirectTo: callbackUrl || "/app/dashboard",
    });
    return {};
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: "That phone number or email and password do not match an active account." };
    }
    /* next-auth signals a successful sign-in by throwing a redirect. Swallowing
       it here would leave the user staring at the form they just completed. */
    throw error;
  }
}

/** The signed-in account, read from the database — never from the request. */
async function whoIsSigningOut() {
  const session = await auth();
  if (!session?.user?.id) return null;
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, name: true, email: true, role: true, department: true, warehouseId: true, customerId: true },
  });
  return user ? { user, sid: session.user.sid } : null;
}

export async function logout() {
  const who = await whoIsSigningOut();
  if (who) {
    /* Signing out ends the developer's server-side session too, so the cookie
       is worth nothing the moment after, whoever still holds a copy. */
    if (who.user.role === "DEVELOPER") await endDeveloperSession(who.user.id, who.sid, "signed-out");
    await recordAudit({
      actor: who.user,
      action: "auth.logout",
      entity: "User",
      entityId: who.user.id,
      summary: `${who.user.name} signed out`,
    });
  }
  await signOut({ redirectTo: "/login" });
}
