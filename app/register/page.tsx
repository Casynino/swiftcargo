import Link from "next/link";
import type { Metadata } from "next";

import { AuthScene } from "@/components/site/auth-scene";
import { RegisterForm } from "@/components/site/register-form";

export const metadata: Metadata = {
  title: "Create an account",
  description:
    "Register with Swift Cargo to get your shipping mark and our Guangzhou warehouse address.",
};

export default function RegisterPage() {
  return (
    <AuthScene
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
      <h1 className="font-display text-3xl font-bold tracking-tight text-white">Create your account</h1>
      <p className="mt-2 text-sm text-white/85">
        You will get a shipping mark and our Guangzhou warehouse address straight away.
      </p>

      <div className="mt-7">
        <RegisterForm />
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
