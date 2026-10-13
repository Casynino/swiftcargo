import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ShieldCheck, Users } from "lucide-react";

import { auth } from "@/auth";
import { AuthScene } from "@/components/site/auth-scene";
import { chooseDeveloperMode, chooseStaffAccount } from "@/lib/actions/auth";
import { standingOf } from "@/lib/developer";

export const metadata: Metadata = { title: "Choose how to sign in" };

/**
 * THE DEVELOPER'S CHOICE.
 *
 * Reached only by the developer account after its credentials are verified,
 * and only while that sign-in is waiting for the choice. Anybody else, and a
 * sign-in that has already chosen or ended, is sent away — the page decides
 * from the database, not from anything the browser says.
 */
export default async function ChoosePage() {
  const session = await auth();
  const id = session?.user?.id;
  if (!id || session.user.role !== "DEVELOPER") redirect("/login");
  const standing = await standingOf(id, session.user.sid);
  if (standing === "active") redirect("/app/dashboard");
  if (standing !== "pending") redirect("/login?revoked=1&reason=session-ended");

  return (
    <AuthScene
      welcome="Developer"
      title={<>Choose how you want to sign in.</>}
      subtitle="Your developer credentials are verified. Nothing is open yet — pick the account you are working as."
      points={["Developer actions are recorded as the developer", "Staff actions are recorded as that staff member"]}
    >
      <h1 className="font-display text-3xl font-bold tracking-tight text-white">Choose how you want to sign in</h1>
      <p className="mt-2 text-sm text-white/85">
        {session.user.name} · developer account
      </p>

      <div className="mt-8 space-y-4">
        <form action={chooseDeveloperMode}>
          <button
            type="submit"
            className="flex w-full items-start gap-4 rounded-2xl border border-white/20 bg-white/10 p-5 text-left transition hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-300"
          >
            <ShieldCheck className="mt-0.5 size-6 shrink-0 text-orange-300" />
            <span>
              <span className="block text-sm font-semibold uppercase tracking-wider text-white">Developer account</span>
              <span className="mt-1 block text-sm text-white/80">
                Access the system with the dedicated developer identity and its authorised privileges.
              </span>
            </span>
          </button>
        </form>

        <form action={chooseStaffAccount}>
          <button
            type="submit"
            className="flex w-full items-start gap-4 rounded-2xl border border-white/20 bg-white/10 p-5 text-left transition hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-300"
          >
            <Users className="mt-0.5 size-6 shrink-0 text-orange-300" />
            <span>
              <span className="block text-sm font-semibold uppercase tracking-wider text-white">Normal user account</span>
              <span className="mt-1 block text-sm text-white/80">
                Sign in with a staff member&rsquo;s own email and password. You will be that person, with their role and
                permissions, and nothing of the developer account comes with you.
              </span>
            </span>
          </button>
        </form>
      </div>
    </AuthScene>
  );
}
