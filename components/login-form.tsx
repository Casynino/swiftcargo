"use client";

import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";

import { login, type LoginState } from "@/lib/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? <Loader2 className="animate-spin" /> : null}
      {pending ? "Signing in…" : "Sign in"}
    </Button>
  );
}

export function LoginForm({ callbackUrl }: { callbackUrl: string }) {
  const [state, action] = useActionState<LoginState, FormData>(login, {});
  const first = useRef<HTMLInputElement>(null);

  /* Focus the field on a computer only. On a phone the form sits out of sight
     until the button is pressed, and focusing it there raises the keyboard and
     scrolls the card before anybody has asked for it. */
  useEffect(() => {
    if (window.matchMedia("(min-width: 1024px)").matches) first.current?.focus();
  }, []);

  return (
    <form action={action} className="mt-4 space-y-2.5">
      <input type="hidden" name="callbackUrl" value={callbackUrl} />

      <div className="space-y-1.5">
        <Label htmlFor="identifier" className="sr-only">Phone number or email</Label>
        <Input
          id="identifier"
          name="identifier"
          type="text"
          inputMode="email"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          required
          ref={first}
          placeholder="Phone or email"
        />
        <p className="text-xs text-muted-foreground hidden">
          Customers: your Tanzanian number, such as 0712 345 678. Staff: your work email.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="password" className="sr-only">Password</Label>
        <PasswordInput
          id="password"
          name="password"
          autoComplete="current-password"
          placeholder="Password"
          required
        />
      </div>

      {state.error ? (
        <p
          role="alert"
          className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {state.error}
        </p>
      ) : null}

      <SubmitButton />
    </form>
  );
}
