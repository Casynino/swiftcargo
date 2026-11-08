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
      tagline="Ship from China, the easy way"
      defaultOpen={reset}
      photo="portYard"
      welcome="Karibu Swift Cargo"
      title={
        <>
          Ship from China, <span className="text-orange-300">the easy way.</span>
        </>
      }
      subtitle="Create your account in a minute — your shipping mark and our Guangzhou address come straight away."
      points={[
        "Your own shipping mark",
        "Our Guangzhou warehouse address",
        "Track your cargo any time",
        "Invoices and receipts in one place",
      ]}
    >
      <h1 className="font-display text-3xl font-bold tracking-tight text-white">
        {reset ? "Forgot your password?" : "Open your account"}
      </h1>
      <p className="mt-2 text-sm text-white/85">
        {reset
          ? "Enter your phone number, then the 6-digit code our office gives you, and choose a new password."
          : "Shipped with us before? We will find your profile. New? You will get your shipping mark and our Guangzhou address straight away."}
      </p>

      <div className="mt-7">
        <PortalAccess mode={reset ? "reset" : "register"} />
      </div>

      <p className="mt-8 text-sm text-white/85">
        Already have an account?{" "}
        <Link href="/login" className="font-semibold text-orange-300 underline-offset-4 hover:underline">
          Sign in
        </Link>
      </p>
    </AuthScene>
  );
}
