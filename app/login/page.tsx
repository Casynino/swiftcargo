import Link from "next/link";
import type { Metadata } from "next";
import { AlertTriangle } from "lucide-react";

import { BrandMark } from "@/components/brand-mark";
import { LoginForm } from "@/components/login-form";
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
    <main className="grid min-h-dvh lg:grid-cols-2">
      <div className="flex flex-col justify-center px-6 py-12 sm:px-12 lg:px-16">
        <div className="mx-auto w-full max-w-sm">
          <Link href="/" className="inline-block">
            <BrandMark size={44} />
          </Link>

          <h1 className="mt-10 text-2xl font-semibold tracking-tight">
            Sign in
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Staff and customers use the same door. You will land in the right
            place.
          </p>

          {revoked ? (
            <div className="mt-6 flex gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <p>
                Your account is no longer active. Speak to your manager if you
                think this is wrong.
              </p>
            </div>
          ) : null}

          <LoginForm callbackUrl={params.callbackUrl ?? ""} />

          <p className="mt-8 text-sm text-muted-foreground">
            New customer?{" "}
            <Link
              href="/register"
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              Create an account
            </Link>
          </p>
        </div>
      </div>

      {/* The sea, abstracted. Decorative only, and hidden on a phone where the
          form should own the whole screen. */}
      <div className="relative hidden overflow-hidden bg-navy-800 lg:block">
        <div
          aria-hidden
          className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,theme(colors.sun.500)/35,transparent_55%),radial-gradient(ellipse_at_bottom_left,theme(colors.cyan.500)/30,transparent_60%)]"
        />
        <div className="relative flex h-full flex-col justify-end p-14 text-white">
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-cyan-400">
            {ROUTE.originCity} → {ROUTE.destinationCity}
          </p>
          <p className="mt-4 max-w-md text-3xl font-semibold leading-tight">
            One record follows the cargo from the Guangzhou counter to the
            handover in Dar.
          </p>
          <p className="mt-4 max-w-md text-sm text-white/70">
            Loose cargo and full containers, {ROUTE.transitDaysMin}–
            {ROUTE.transitDaysMax} days at sea.
          </p>
        </div>
      </div>
    </main>
  );
}
