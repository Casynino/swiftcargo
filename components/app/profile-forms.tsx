"use client";

import { useActionState } from "react";

import { FormMessage } from "@/components/app/form-message";
import { SubmitButton } from "@/components/app/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import {
  changeMyPassword,
  updateMyProfile,
  type ProfileState,
} from "@/lib/actions/profile";

export function PersonalDetailsForm({
  name,
  phone,
  locale,
}: {
  name: string;
  phone: string | null;
  locale: string;
}) {
  const [state, action] = useActionState<ProfileState, FormData>(
    updateMyProfile,
    {}
  );

  return (
    <form action={action} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="name">Your name</Label>
          <Input id="name" name="name" defaultValue={name} required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="phone">Phone</Label>
          <Input
            id="phone"
            name="phone"
            type="tel"
            inputMode="tel"
            defaultValue={phone ?? ""}
            placeholder="+255 7…"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="locale">Language</Label>
        <NativeSelect id="locale" name="locale" defaultValue={locale}>
          <option value="en">English</option>
          <option value="sw">Kiswahili</option>
          <option value="zh">中文</option>
        </NativeSelect>
        <p className="text-xs text-muted-foreground">
          The screens are English today. Choosing here is what tells us which
          desk needs its own language first.
        </p>
      </div>

      <FormMessage error={state.error} ok={state.ok} />
      <SubmitButton>Save changes</SubmitButton>
    </form>
  );
}

export function PasswordForm() {
  const [state, action] = useActionState<ProfileState, FormData>(
    changeMyPassword,
    {}
  );

  return (
    <form action={action} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="current">Current password</Label>
        <Input
          id="current"
          name="current"
          type="password"
          autoComplete="current-password"
          required
        />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="next">New password</Label>
          <Input
            id="next"
            name="next"
            type="password"
            autoComplete="new-password"
            minLength={10}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="confirm">New password again</Label>
          <Input
            id="confirm"
            name="confirm"
            type="password"
            autoComplete="new-password"
            minLength={10}
            required
          />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        At least ten characters. Nobody in the office can read your password —
        if you forget it, an administrator sets a new one.
      </p>
      <FormMessage error={state.error} ok={state.ok} />
      <SubmitButton>Change password</SubmitButton>
    </form>
  );
}
