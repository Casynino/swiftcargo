"use client";

import { markNotificationsRead } from "@/lib/actions/messages";
import { SubmitButton } from "@/components/app/submit-button";

export function MarkAllRead() {
  return (
    <form action={markNotificationsRead}>
      <SubmitButton variant="outline" size="sm">
        Mark all read
      </SubmitButton>
    </form>
  );
}
