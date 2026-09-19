"use client";

import { markNotificationsRead } from "@/lib/actions/messages";
import { SubmitButton } from "@/components/app/submit-button";

import { useT } from "@/components/app/locale-provider";
export function MarkAllRead() {
  const tx = useT();
  return (
    <form action={markNotificationsRead}>
      <SubmitButton variant="outline" size="sm">
        {tx("Mark all read")}
      </SubmitButton>
    </form>
  );
}
