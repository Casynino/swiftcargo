"use server";

import { AuthError } from "next-auth";

import { signIn, signOut } from "@/auth";

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

export async function logout() {
  await signOut({ redirectTo: "/login" });
}
