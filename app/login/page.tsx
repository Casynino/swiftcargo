import Link from "next/link";
import type { Metadata } from "next";
import { AlertTriangle } from "lucide-react";

import { LoginForm } from "@/components/login-form";
import { AuthScene } from "@/components/site/auth-scene";
import { ROUTE } from "@/lib/constants";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; revoked?: string }>;
}) {
  const params = await searchParams;
  const revoked = params.revoked === "1";

  return (
    <AuthScene
      welcome="Karibu tena"
      title={
        <>
          Welcome back to <span className="text-orange-300">Swift Cargo.</span>
        </>
      }
      subtitle={`Your cargo, from ${ROUTE.originCity} to ${ROUTE.destinationCity} — ${ROUTE.transitDaysMin}–${ROUTE.transitDaysMax} days at sea, tracked the whole way.`}
      points={[
        "Track every consignment",
        "Invoices, payments and receipts",
        "Photos of your goods on arrival",
        "A sailing every Monday",
      ]}
    >
      <h1 className="font-display text-3xl font-bold tracking-tight text-white">Sign in</h1>
      <p className="mt-2 text-sm text-white/85">
        Staff and customers use the same door. You will land in the right place.
      </p>

      {revoked ? (
        <div className="mt-6 flex gap-3 rounded-xl border border-amber-300/40 bg-amber-500/15 p-3 text-sm text-amber-100">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <p>Your account is no longer active. Speak to your manager if you think this is wrong.</p>
        </div>
      ) : null}

      <LoginForm callbackUrl={params.callbackUrl ?? ""} />

      <p className="mt-8 text-sm text-white/85">
        New customer?{" "}
        <Link href="/register" className="font-semibold text-orange-300 underline-offset-4 hover:underline">
          Create an account
        </Link>
      </p>
    </AuthScene>
  );
}
