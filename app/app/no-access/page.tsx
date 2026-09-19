import Link from "next/link";
import type { Metadata } from "next";
import { Lock } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ROLE_LABELS } from "@/lib/constants";
import { requireStaff } from "@/lib/session";
import { primeLocale, T } from "@/lib/server-t";

export const metadata: Metadata = { title: "No access" };

export default async function NoAccessPage() {
  const user = await requireStaff();
  await primeLocale();

  return (
    <div className="mx-auto flex max-w-md flex-col items-center py-20 text-center">
      <span className="grid size-12 place-items-center rounded-full bg-secondary">
        <Lock className="size-5 text-muted-foreground" />
      </span>
      <h1 className="mt-6 text-xl font-semibold">{T("That page is not yours")}</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {T("You are signed in as")} {user.name} ({T(ROLE_LABELS[user.role])}).{" "}
        {T("This screen belongs to another desk. If you need it, ask a manager rather than another sign-in.")}
      </p>
      <Button asChild className="mt-6">
        <Link href="/app/dashboard">{T("Back to dashboard")}</Link>
      </Button>
    </div>
  );
}
