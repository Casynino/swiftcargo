"use client";

import { useActionState } from "react";
import { Loader2 } from "lucide-react";

import { FormMessage } from "@/components/app/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { changeMyPassword, updateMyCustomerDetails, type ProfileState } from "@/lib/actions/profile";

export function BusinessDetailsForm({
  defaults,
}: {
  defaults: { businessName: string; address: string; city: string; altPhone: string; taxId: string };
}) {
  const [state, action, pending] = useActionState<ProfileState, FormData>(updateMyCustomerDetails, {});
  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Text name="businessName" label="Company name" value={defaults.businessName} />
        <Text name="taxId" label="TIN / VRN" value={defaults.taxId} />
        <Text name="address" label="Address" value={defaults.address} wide />
        <Text name="city" label="City" value={defaults.city} />
        <Text name="altPhone" label="Second phone / WhatsApp" value={defaults.altPhone} type="tel" />
      </div>
      <FormMessage error={state.error} ok={state.ok} />
      <Button type="submit" disabled={pending}>
        {pending ? <Loader2 className="animate-spin" /> : null}
        Save details
      </Button>
    </form>
  );
}

export function PasswordForm() {
  const [state, action, pending] = useActionState<ProfileState, FormData>(changeMyPassword, {});
  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <Text name="current" label="Current password" type="password" autoComplete="current-password" />
        <Text name="next" label="New password" type="password" autoComplete="new-password" />
        <Text name="confirm" label="New password again" type="password" autoComplete="new-password" />
      </div>
      <p className="text-xs text-muted-foreground">At least 10 characters.</p>
      <FormMessage error={state.error} ok={state.ok} />
      <Button type="submit" variant="outline" disabled={pending}>
        {pending ? <Loader2 className="animate-spin" /> : null}
        Change password
      </Button>
    </form>
  );
}

function Text({
  name,
  label,
  value,
  type = "text",
  wide,
  autoComplete,
}: {
  name: string;
  label: string;
  value?: string;
  type?: string;
  wide?: boolean;
  autoComplete?: string;
}) {
  return (
    <div className={wide ? "space-y-2 sm:col-span-2" : "space-y-2"}>
      <Label htmlFor={`pf-${name}`}>{label}</Label>
      {type === "password" ? (
        <PasswordInput id={`pf-${name}`} name={name} defaultValue={value} autoComplete={autoComplete} />
      ) : (
        <Input id={`pf-${name}`} name={name} type={type} defaultValue={value} autoComplete={autoComplete} />
      )}
    </div>
  );
}
