import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { CaseActions } from "@/components/app/exception-forms";
import { Field } from "@/components/app/field";
import { PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DEPARTMENT_LABELS,
  EXCEPTION_PRIORITY_LABELS,
  EXCEPTION_STATUS_LABELS,
} from "@/lib/constants";
import { formatDateTime } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { requirePermission } from "@/lib/session";

import { primeLocale, T } from "@/lib/server-t";
import { Tx } from "@/components/app/tx";
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const item = await prisma.exceptionCase.findUnique({
    where: { id },
    select: { reference: true },
  });
  return { title: item?.reference ?? "Case" };
}

export default async function ExceptionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await primeLocale();
  const user = await requirePermission("exception.view");
  const { id } = await params;

  const item = await prisma.exceptionCase.findUnique({
    where: { id },
    include: {
      cargo: {
        include: {
          sender: { select: { fullName: true, phone: true } },
          chinaReceiving: true,
          darReceiving: true,
        },
      },
      customer: true,
      raisedBy: { select: { name: true } },
      assignedTo: { select: { name: true } },
      events: { include: { actor: true }, orderBy: { createdAt: "asc" } },
    },
  });
  if (!item) notFound();

  const staff = can(user.role, "exception.assign")
    ? await prisma.user.findMany({
        where: { role: { not: "CUSTOMER" }, active: true, status: "ACTIVE" },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      })
    : [];

  const evidence = Array.isArray(item.evidence)
    ? (item.evidence as string[])
    : [];

  return (
    <div className="space-y-6">
      <PageHeader
        title={item.reference}
        description={item.title}
        back={{ href: "/app/exceptions", label: "Issues & claims" }}
        actions={
          <>
            <Badge
              tone={
                item.priority === "URGENT"
                  ? "bad"
                  : item.priority === "HIGH"
                    ? "warn"
                    : "neutral"
              }
            >
              {EXCEPTION_PRIORITY_LABELS[item.priority]}
            </Badge>
            <Badge
              tone={
                item.status === "RESOLVED" || item.status === "CLOSED"
                  ? "good"
                  : "progress"
              }
            >
              {EXCEPTION_STATUS_LABELS[item.status]}
            </Badge>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{T("What happened")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="whitespace-pre-wrap text-sm"><Tx>{item.description}</Tx></p>
              {evidence.length > 0 ? (
                <ul className="flex flex-wrap gap-2">
                  {evidence.map((url) => (
                    <li key={url}>
                      <a
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-sm text-primary underline-offset-4 hover:underline"
                      >
                        {T("Evidence")}
                      </a>
                    </li>
                  ))}
                </ul>
              ) : null}
              {item.resolution ? (
                <div className="rounded-md bg-emerald-50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">
                    {T("Resolution")}
                  </p>
                  <p className="mt-1 text-sm text-emerald-900">{item.resolution}</p>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">{T("History")}</CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="space-y-4">
                {item.events.map((event) => (
                  <li key={event.id} className="border-l-2 border-border pl-4">
                    <p className="text-sm"><Tx>{event.note}</Tx></p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {formatDateTime(event.createdAt)}
                      {event.actor ? ` · ${event.actor.name}` : ""}
                      {event.to
                        ? ` · ${EXCEPTION_STATUS_LABELS[event.to]}`
                        : ""}
                    </p>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>

          {can(user.role, "exception.raise") ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{T("Update this case")}</CardTitle>
              </CardHeader>
              <CardContent>
                <CaseActions
                  caseId={item.id}
                  status={item.status}
                  staff={staff}
                  canResolve={can(user.role, "exception.resolve")}
                  canClose={can(user.role, "exception.close")}
                  canAssign={can(user.role, "exception.assign")}
                />
              </CardContent>
            </Card>
          ) : null}
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{T("Case")}</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-4">
                <Field
                  label={T("Type")}
                  value={item.type.replace(/_/g, " ").toLowerCase()}
                />
                <Field
                  label={T("Department")}
                  value={
                    item.department ? DEPARTMENT_LABELS[item.department] : null
                  }
                />
                <Field label={T("Assigned to")} value={item.assignedTo?.name} />
                <Field label={T("Raised by")} value={item.raisedBy?.name} />
                <Field label={T("Opened")} value={formatDateTime(item.createdAt)} />
                <Field label={T("Resolved")} value={formatDateTime(item.resolvedAt)} />
              </dl>
            </CardContent>
          </Card>

          {item.cargo ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{T("Cargo")}</CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="grid gap-4">
                  <Field
                    label={T("Reference")}
                    value={
                      <Link
                        href={`/app/cargo/${item.cargo.id}`}
                        className="font-medium hover:underline"
                      >
                        {item.cargo.reference}
                      </Link>
                    }
                  />
                  <Field label={T("Customer")} value={item.cargo.sender.fullName} />
                  <Field label={T("Phone")} value={item.cargo.sender.phone} mono />
                  <Field
                    label={T("China counted")}
                    value={item.cargo.chinaReceiving?.packagesCount}
                    mono
                  />
                  <Field
                    label={T("Dar counted")}
                    value={item.cargo.darReceiving?.packagesCount}
                    mono
                  />
                </dl>
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}
