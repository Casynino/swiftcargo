"use client";

import { useActionState } from "react";

import { registerCustomer, type ActionState } from "@/lib/actions/register";
import { FormMessage } from "@/components/app/form-message";
import { SubmitButton } from "@/components/app/submit-button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { TzPhoneInput } from "@/components/tz-phone-input";

export function RegisterForm({ initialPhone }: { initialPhone?: string }) {
  const [state, action] = useActionState<ActionState, FormData>(
    registerCustomer,
    {}
  );

  return (
    <form action={action} className="space-y-2.5 lg:space-y-4">
      <div className="space-y-1.5 lg:space-y-2">
        <Label htmlFor="fullName" className="max-lg:sr-only">Full name</Label>
        <Input id="fullName" name="fullName" required autoComplete="name" placeholder="Full name" defaultValue={state.values?.fullName} key={state.values?.fullName} />
      </div>

      <div className="space-y-1.5 lg:space-y-2">
        <Label htmlFor="businessName" className="max-lg:sr-only">
          Business name{" "}
          <span className="font-normal text-muted-foreground">(optional)</span>
        </Label>
        <Input id="businessName" name="businessName" autoComplete="organization" placeholder="Business name (optional)" defaultValue={state.values?.businessName} key={state.values?.businessName} />
      </div>

      <div className="space-y-1.5 lg:space-y-2">
        <Label htmlFor="phone" className="max-lg:sr-only">Phone number</Label>
        <TzPhoneInput key={state.values?.phone ?? initialPhone} id="phone" name="phone" required defaultValue={state.values?.phone ?? initialPhone} />
      </div>

      <div className="space-y-1.5 lg:space-y-2">
        <Label htmlFor="email" className="max-lg:sr-only">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="Email"
          defaultValue={state.values?.email}
          key={state.values?.email}
        />
      </div>

      <div className="grid gap-2.5 sm:grid-cols-2 lg:gap-4">
        <div className="space-y-1.5 lg:space-y-2">
          <Label htmlFor="password" className="max-lg:sr-only">Password</Label>
          <PasswordInput
            id="password"
            name="password"
            required
            minLength={8}
            autoComplete="new-password"
            placeholder="Password"
          />
        </div>
        <div className="space-y-1.5 lg:space-y-2">
          <Label htmlFor="confirmPassword" className="max-lg:sr-only">Confirm password</Label>
          <PasswordInput
            id="confirmPassword"
            name="confirmPassword"
            required
            minLength={8}
            autoComplete="new-password"
            placeholder="Confirm password"
          />
        </div>
      </div>

      <FormMessage error={state.error} />
      <SubmitButton className="w-full" size="lg" pendingLabel="Creating…">
        Create my account
      </SubmitButton>
    </form>
  );
}
