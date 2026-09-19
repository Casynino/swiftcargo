import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { Lock, ShieldCheck } from "lucide-react";

import { Field } from "@/components/app/field";
import { PageHeader } from "@/components/app/page-header";
import { PasswordForm, PersonalDetailsForm } from "@/components/app/profile-forms";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DEPARTMENT_LABELS, ROLE_LABELS } from "@/lib/constants";
import { formatDate, formatDateTime } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";

import { primeLocale, T } from "@/lib/server-t";
export const metadata: Metadata = { title: "My profile" };

/**
 * YOUR OWN ACCOUNT.
 *
 * There is no id in the address, so there is nothing to change to see somebody
 * else's. The split down the page is the point: the left is yours to edit, the
 * right is what the company decided about you and is plain text rather than a
 * disabled field — a greyed-out box invites people to try, a line of text tells
 * them who to ask.
 */
export default async function ProfilePage() {
  await primeLocale();
  const session = await requireUser();

  const me = await prisma.user.findUnique({
    where: { id: session.id },
    select: {
      name: true,
      email: true,
      phone: true,
      locale: true,
      role: true,
      department: true,
      status: true,
      createdAt: true,
      lastLoginAt: true,
      warehouse: { select: { name: true } },
    },
  });
  if (!me) redirect("/login");

  const initials = me.name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <div className="space-y-6">
      <PageHeader
        title={T("My profile")}
        description={T("Your details and your password. Anything about your job is set by the office.")}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{T("About you")}</CardTitle>
            </CardHeader>
            <CardContent>
              <PersonalDetailsForm
                name={me.name}
                phone={me.phone}
                locale={me.locale}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Lock className="size-4" />
                {T("Password")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <PasswordForm />
            </CardContent>
          </Card>
        </div>

        <Card className="h-fit">
          <CardHeader>
            <div className="flex items-center gap-3">
              <span className="grid size-11 shrink-0 place-items-center rounded-full bg-brand text-sm font-semibold text-brand-foreground">
                {initials}
              </span>
              <div className="min-w-0">
                <CardTitle className="truncate text-base">{me.name}</CardTitle>
                <p className="truncate text-xs text-muted-foreground">
                  {me.email}
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <ShieldCheck className="size-3.5" />
              {T("Set by the office. Ask a manager if any of it is wrong.")}
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-1">
              <Field label={T("Desk")} value={ROLE_LABELS[me.role]} />
              <Field
                label={T("Department")}
                value={
                  me.department ? DEPARTMENT_LABELS[me.department] : "—"
                }
              />
              <Field label={T("Warehouse")} value={me.warehouse?.name ?? "—"} />
              <Field label={T("Sign-in email")} value={me.email} mono />
              <Field label={T("Joined")} value={formatDate(me.createdAt)} />
              <Field
                label={T("Last signed in")}
                value={
                  me.lastLoginAt ? formatDateTime(me.lastLoginAt) : "First time"
                }
              />
            </div>
            <Badge tone={me.status === "ACTIVE" ? "good" : "warn"}>
              {me.status === "ACTIVE" ? "Active" : me.status}
            </Badge>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
