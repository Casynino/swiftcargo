import Link from "next/link";
import type { Metadata, Viewport } from "next";

import { AuthScene } from "@/components/site/auth-scene";
import { PortalAccess } from "@/components/site/portal-access";

/* The browser bars take the scene's own colour, so the picture runs to the edges of the screen. */
export const viewport: Viewport = { themeColor: "#040e1a" };

export const metadata: Metadata = {
  title: "Create an account",
  description:
    "Register with Swift Cargo to get your shipping mark and our Guangzhou warehouse address.",
};

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ mode?: string }> }) {
  const reset = (await searchParams).mode === "reset";
  return (
    <AuthScene
      cta={reset ? "Reset password" : "Create account"}
      alt={{ label: "Sign in", href: "/login?open=1" }}
      defaultOpen
      tagline="Ship from China, the easy way"
    >
      <h1 className="font-display text-2xl font-bold tracking-tight text-white">
        {reset ? "Forgot your password?" : "Open your account"}
      </h1>
      <div className="mt-4">
        <PortalAccess mode={reset ? "reset" : "register"} />
      </div>

      <p className="mt-4 text-center text-xs text-white/70">
        Already have an account?{" "}
        <Link href="/login?open=1" className="font-semibold text-orange-300 underline-offset-4 hover:underline">
          Sign in
        </Link>
      </p>
    </AuthScene>
  );
}
