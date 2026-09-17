import Link from "next/link";
import type { Metadata } from "next";
import { Check } from "lucide-react";

import { BrandMark } from "@/components/brand-mark";
import { RegisterForm } from "@/components/site/register-form";
import { ROUTE } from "@/lib/constants";

export const metadata: Metadata = {
  title: "Create an account",
  description:
    "Register with Swift Cargo to get your shipping mark and our Guangzhou warehouse address.",
};

export default function RegisterPage() {
  return (
    <main className="grid min-h-dvh lg:grid-cols-2">
      <div className="flex flex-col justify-center px-6 py-12 sm:px-12 lg:px-16">
        <div className="mx-auto w-full max-w-md">
          <Link href="/" className="focus-ring inline-block rounded">
            <BrandMark size={44} />
          </Link>

          <h1 className="mt-10 text-2xl font-semibold tracking-tight">
            Create your account
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            You will get a shipping mark and our Guangzhou warehouse address
            straight away.
          </p>

          <div className="mt-8">
            <RegisterForm />
          </div>

          <p className="mt-8 text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link
              href="/login"
              className="font-medium text-brand underline-offset-4 hover:underline"
            >
              Sign in
            </Link>
          </p>
        </div>
      </div>

      <div className="relative hidden overflow-hidden bg-ink lg:block">
        <div
          aria-hidden
          className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,hsl(var(--signal)/0.32),transparent_55%),radial-gradient(ellipse_at_bottom_left,hsl(var(--marine)/0.28),transparent_60%)]"
        />
        <div className="relative flex h-full flex-col justify-center p-14 text-white">
          <p className="eyebrow text-marine">
            {ROUTE.originCity} → {ROUTE.destinationCity}
          </p>
          <p className="mt-5 max-w-md text-3xl font-semibold leading-tight">
            One account, and your supplier knows exactly where to send the boxes.
          </p>

          <ul className="mt-10 space-y-4">
            {[
              "Your own shipping mark, generated instantly",
              "Our Guangzhou warehouse address to pass on",
              "Track every consignment from receipt to collection",
              "See invoices, pay, and download receipts",
            ].map((point) => (
              <li key={point} className="flex items-start gap-3 text-white/80">
                <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-marine/20 text-marine">
                  <Check className="size-3" />
                </span>
                {point}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </main>
  );
}
