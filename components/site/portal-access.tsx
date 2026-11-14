"use client";

import Link from "next/link";
import { useActionState } from "react";

import { FormMessage } from "@/components/app/form-message";
import { SubmitButton } from "@/components/app/submit-button";
import { RegisterForm } from "@/components/site/register-form";
import { TzPhoneInput } from "@/components/tz-phone-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import {
  activateAccount,
  checkPhone,
  resetCustomerPassword,
  type ActivateState,
  type PhoneStep,
  type ResetState,
} from "@/lib/actions/customer-access";

const link = "font-semibold text-white underline decoration-signal decoration-2 underline-offset-[5px] hover:text-signal";

/**
 * PHONE FIRST. The number says which of four things this person is:
 * on the books with no login yet (activate with the office's code), already
 * has a login (sign in, or reset), not on the books (register as new), or —
 * in reset mode — somebody who forgot their password.
 */
export function PortalAccess({ mode }: { mode: "register" | "reset" }) {
  const [phone, check] = useActionState<PhoneStep, FormData>(checkPhone, {});

  if (!phone.step) {
    return (
      <form action={check} className="space-y-3">
        <div className="space-y-2">
          <Label htmlFor="phone" className="sr-only">Phone number</Label>
          <TzPhoneInput id="phone" name="phone" required autoFocus />
          <p className="text-sm text-white/75 hidden">
            {mode === "reset"
              ? "The phone number on your account."
              : "Enter the phone number you used when sending cargo with us."}
          </p>
        </div>
        <FormMessage error={phone.error} />
        <SubmitButton className="w-full" size="lg" pendingLabel="Checking…">
          Continue
        </SubmitButton>
      </form>
    );
  }

  if (mode === "reset") {
    if (phone.step === "login") return <ResetForm phone={phone.phone!} />;
    return (
      <Notice
        title={phone.step === "activate" ? "You have not opened your account yet" : "We could not find that number"}
        body={
          phone.step === "activate"
            ? "Your customer profile is ready. Activate your account first, with your email and a password."
            : "That number is not on our books. You can create a new account."
        }
        action={<Link href="/register" className={link}>Create or open my account</Link>}
      />
    );
  }

  if (phone.step === "login") {
    return (
      <Notice
        title="You already have an account"
        body="Sign in to continue."
        action={
          <span className="flex flex-wrap gap-x-6 gap-y-2">
            <Link href="/login" className={link}>Sign in</Link>
            <Link href="/register?mode=reset" className={link}>Forgot password?</Link>
          </span>
        }
      />
    );
  }

  if (phone.step === "activate") return <ActivateForm phone={phone.phone!} name={phone.name} />;

  return (
    <div className="space-y-3">
      <p className="text-sm text-white/80">
        New here? Let us create your account.
      </p>
      <RegisterForm initialPhone={phone.phone} />
    </div>
  );
}

function Notice({ title, body, action }: { title: string; body: string; action: React.ReactNode }) {
  return (
    <div className="space-y-3 rounded-xl border border-white/15 bg-white/5 p-4">
      <p className="font-semibold text-white">{title}</p>
      <p className="text-sm text-white/85">{body}</p>
      <div className="text-sm">{action}</div>
    </div>
  );
}

function ActivateForm({ phone, name }: { phone: string; name?: string }) {
  const [state, action] = useActionState<ActivateState, FormData>(activateAccount, {});
  return (
    <form action={action} className="space-y-3">
      <div>
        <h2 className="font-display text-xl font-semibold text-white">{name ? `Welcome, ${name}` : "Welcome back"}</h2>
        <p className="mt-1 text-sm text-white/75">You are on our books. Add your email and a password to open your account.</p>
      </div>
      <input type="hidden" name="phone" value={phone} />
      <div className="space-y-1.5">
        <Label htmlFor="email" className="sr-only">Your email</Label>
        <Input id="email" name="email" type="email" required autoComplete="email" placeholder="Email" />
      </div>
      <div className="grid gap-2.5 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="password" className="sr-only">Choose a password</Label>
          <PasswordInput id="password" name="password" required minLength={8} autoComplete="new-password" placeholder="Password" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="confirmPassword" className="sr-only">Confirm password</Label>
          <PasswordInput id="confirmPassword" name="confirmPassword" required minLength={8} autoComplete="new-password" placeholder="Confirm password" />
        </div>
      </div>
      <FormMessage error={state.error} />
      <SubmitButton className="w-full" size="lg" pendingLabel="Opening…">
        Open my account
      </SubmitButton>
      <p className="text-center text-xs text-white/70">
        Not {name ?? "you"}?{" "}
        <Link href="/register" className={link}>Start again</Link>
      </p>
    </form>
  );
}

function ResetForm({ phone }: { phone: string }) {
  const [state, action] = useActionState<ResetState, FormData>(resetCustomerPassword, {});
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="phone" value={phone} />
      <div className="space-y-2">
        <Label htmlFor="code">Code from our office</Label>
        <Input id="code" name="code" required inputMode="numeric" autoComplete="one-time-code" maxLength={6} pattern="\d{6}" placeholder="6 digits" className="tracking-[0.4em]" />
        <p className="text-sm text-white/75">Call or message our office and we will give you a 6-digit code. It works for 15 minutes.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="password">New password</Label>
          <PasswordInput id="password" name="password" required minLength={8} autoComplete="new-password" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirmPassword">Confirm password</Label>
          <PasswordInput id="confirmPassword" name="confirmPassword" required minLength={8} autoComplete="new-password" />
        </div>
      </div>
      <FormMessage error={state.error} />
      <SubmitButton className="w-full" size="lg" pendingLabel="Saving…">
        Set new password
      </SubmitButton>
    </form>
  );
}
