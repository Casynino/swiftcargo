"use client";

import { useActionState } from "react";

import { registerCustomer, type ActionState } from "@/lib/actions/register";
import { FormMessage } from "@/components/app/form-message";
import { SubmitButton } from "@/components/app/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function RegisterForm() {
  const [state, action] = useActionState<ActionState, FormData>(
    registerCustomer,
    {}
  );

  return (
    <form action={action} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="fullName">Full name</Label>
        <Input id="fullName" name="fullName" required autoComplete="name" />
      </div>

      <div className="space-y-2">
        <Label htmlFor="businessName">
          Business name{" "}
          <span className="font-normal text-muted-foreground">(optional)</span>
        </Label>
        <Input id="businessName" name="businessName" autoComplete="organization" />
      </div>

      <div className="space-y-2">
        <Label htmlFor="phone">Phone number</Label>
        <Input
          id="phone"
          name="phone"
          required
          autoComplete="tel"
          placeholder="0767 852 126"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            name="password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirmPassword">Confirm password</Label>
          <Input
            id="confirmPassword"
            name="confirmPassword"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
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
