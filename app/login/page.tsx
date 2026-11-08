import Link from "next/link";
import type { Metadata, Viewport } from "next";
import { AlertTriangle } from "lucide-react";

import { LoginForm } from "@/components/login-form";
import { AuthScene } from "@/components/site/auth-scene";

/* The browser bars take the scene's own colour, so the picture runs to the edges of the screen. */
export const viewport: Viewport = { themeColor: "#040e1a" };

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; revoked?: string; reason?: string }>;
}) {
  const params = await searchParams;
  const revoked = params.revoked === "1";
  const sessionEnded = revoked && params.reason === "session-ended";

  return (
    <AuthScene
      cta="Log in"
      tagline={
        revoked ? (
          <span className="text-amber-200">
            {sessionEnded ? "That sign-in has ended. Sign in again." : "Your account is no longer active."}
          </span>
        ) : (
          "Your cargo, from Guangzhou to Dar es Salaam"
        )
      }
      welcome="Karibu tena"
      title={
        <>
          Welcome back. <span className="text-orange-300">Your cargo is waiting.</span>
        </>
      }
      subtitle="Track your shipments, see your invoices and the photos of your goods — all in one place."
      points={[
        "Track your cargo",
        "Invoices and receipts",
        "Photos of your goods",
        "A sailing every Monday",
      ]}
    >
      <h1 className="font-display text-3xl font-bold tracking-tight text-white max-lg:text-2xl">Sign in</h1>
      <p className="mt-2 text-sm text-white/85 max-lg:hidden">
        Staff and customers use the same door. You will land in the right place.
      </p>

      {revoked ? (
        <div className="mt-6 flex gap-3 rounded-xl border border-amber-300/40 max-lg:hidden bg-amber-500/15 p-3 text-sm text-amber-100">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <p>
            {sessionEnded
              ? "That sign-in has ended. Sign in again to continue."
              : "Your account is no longer active. Speak to your manager if you think this is wrong."}
          </p>
        </div>
      ) : null}

      <LoginForm callbackUrl={params.callbackUrl ?? ""} />

      <p className="mt-4 text-sm text-white/85 lg:mt-6">
        <Link href="/register?mode=reset" className="font-semibold text-orange-300 underline-offset-4 hover:underline">
          Forgot your password?
        </Link>
      </p>

      <p className="mt-2 text-sm text-white/85 lg:mt-3">
        New customer, or shipped with us before?{" "}
        <Link href="/register" className="font-semibold text-orange-300 underline-offset-4 hover:underline">
          Create an account
        </Link>
      </p>
    </AuthScene>
  );
}
