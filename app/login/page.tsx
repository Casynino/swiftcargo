import Link from "next/link";
import type { Metadata, Viewport } from "next";

import { LoginForm } from "@/components/login-form";
import { AuthScene } from "@/components/site/auth-scene";

/* The browser bars take the scene's own colour, so the picture runs to the edges of the screen. */
export const viewport: Viewport = { themeColor: "#040e1a" };

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; revoked?: string; reason?: string; open?: string }>;
}) {
  const params = await searchParams;
  const revoked = params.revoked === "1";
  const sessionEnded = revoked && params.reason === "session-ended";

  return (
    <AuthScene
      cta="Sign in"
      alt={{ label: "Create account", href: "/register" }}
      defaultOpen={params.open === "1"}
      tagline={
        revoked ? (
          <span className="text-amber-200">
            {sessionEnded ? "That sign-in has ended. Sign in again." : "Your account is no longer active."}
          </span>
        ) : undefined
      }
    >
      <h1 className="sc-title text-xl text-white">Sign in</h1>
      <LoginForm callbackUrl={params.callbackUrl ?? ""} />

      <div className="mt-4 flex items-center justify-between gap-3 text-xs">
        <Link href="/register?mode=reset" className="text-white/55 transition-colors hover:text-white">
          Forgot password?
        </Link>
        <Link href="/register" className="font-semibold text-white underline decoration-signal decoration-2 underline-offset-[6px] hover:text-signal">
          Create account
        </Link>
      </div>
    </AuthScene>
  );
}
