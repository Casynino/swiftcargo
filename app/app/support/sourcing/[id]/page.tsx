import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Store, User } from "lucide-react";

import { PageHeader } from "@/components/app/page-header";
import { SourcingWorkflow } from "@/components/app/sourcing-forms";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { formatDateTime, formatRelative } from "@/lib/format";
import { t } from "@/lib/i18n";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { requirePermission } from "@/lib/session";
import { localeOf } from "@/lib/viewer-locale";

import { primeLocale } from "@/lib/server-t";
export const metadata: Metadata = { title: "Sourcing request" };

const STATUS_TONE: Record<string, "neutral" | "progress" | "good" | "warn" | "bad"> = {
  NEW: "warn",
  IN_PROGRESS: "progress",
  WAITING_CUSTOMER: "warn",
  SUPPLIER_FOUND: "good",
  COMPLETED: "good",
  CANCELLED: "neutral",
};

const FIELD_LABEL: Record<string, string> = {
  status: "Status",
  priority: "Priority",
  assignedTo: "Handled by",
  outcome: "What we found",
};

const humanise = (value: string | null) =>
  value ? value.replace(/_/g, " ").toLowerCase() : "—";

export default async function SourcingRequestPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await primeLocale();
  const user = await requirePermission("conversation.view");
  const { id } = await params;

  const request = await prisma.sourcingRequest.findUnique({
    where: { id },
    include: {
      customer: { select: { id: true, code: true, fullName: true, phone: true } },
      createdBy: { select: { name: true } },
      assignedTo: { select: { id: true, name: true } },
    },
  });
  if (!request) notFound();

  const [locale, market, history, staffRows] = await Promise.all([
    localeOf(user.id),
    request.market
      ? prisma.marketInformation.findFirst({
          where: { name: { equals: request.market, mode: "insensitive" }, published: true },
          select: { slug: true, name: true },
        })
      : Promise.resolve(null),
    prisma.fieldChange.findMany({
      where: { entity: "SourcingRequest", entityId: request.id },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { actor: { select: { name: true } } },
    }),
    prisma.user.findMany({
      where: { status: "ACTIVE", role: { not: "CUSTOMER" } },
      orderBy: { name: "asc" },
      select: { id: true, name: true, role: true },
    }),
  ]);

  const staff = staffRows
    .filter((person) => can(person.role, "conversation.reply"))
    .map(({ id, name }) => ({ id, name }));
  // A request can sit with somebody who has since changed desk; the select must
  // still show who holds it rather than quietly reading "Unassigned".
  if (request.assignedTo && !staff.some((p) => p.id === request.assignedTo!.id)) {
    staff.push({ id: request.assignedTo.id, name: request.assignedTo.name });
  }
  const mayWork = can(user.role, "conversation.reply");

  return (
    <div className="space-y-6">
      <PageHeader
        title={request.product}
        description={`${request.reference} · ${t(locale, "opened")} ${formatDateTime(request.createdAt)}${
          request.createdBy ? ` ${t(locale, "by")} ${request.createdBy.name}` : ""
        }`}
        back={{ href: "/app/support/sourcing", label: "Sourcing requests" }}
        actions={
          <>
            <Badge tone={request.priority === "URGENT" ? "bad" : request.priority === "HIGH" ? "warn" : "neutral"}>
              {t(locale, request.priority.toLowerCase())}
            </Badge>
            <Badge tone={STATUS_TONE[request.status]}>
              {t(locale, humanise(request.status))}
            </Badge>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          <Card className="p-5">
            <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              {t(locale, "What they asked for")}
            </h2>
            <p className="mt-3 whitespace-pre-wrap text-sm">
              {request.details ?? t(locale, "No details taken.")}
            </p>
            <dl className="mt-4 grid grid-cols-1 gap-4 border-t pt-4 sm:grid-cols-2 xl:grid-cols-4">
              <div>
                <dt className="text-xs text-muted-foreground">{t(locale, "Quantity")}</dt>
                <dd className="mt-0.5 text-sm font-medium">
                  {request.quantity ?? t(locale, "Not given")}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">{t(locale, "Budget")}</dt>
                <dd className="mt-0.5 text-sm font-medium">
                  {request.budget ?? t(locale, "Open")}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">{t(locale, "Market")}</dt>
                <dd className="mt-0.5 text-sm font-medium">
                  {market ? (
                    <Link
                      href={`/app/support/markets#${market.slug}`}
                      className="text-brand hover:underline"
                    >
                      {market.name}
                    </Link>
                  ) : (
                    (request.market ?? t(locale, "Not chosen"))
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">{t(locale, "Handled by")}</dt>
                <dd className="mt-0.5 text-sm font-medium">
                  {request.assignedTo?.name ?? t(locale, "Unassigned")}
                </dd>
              </div>
            </dl>
          </Card>

          {request.outcome ? (
            <Card className="border-success/30 bg-success/5 p-5">
              <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-success">
                {t(locale, "What we found")}
              </h2>
              <p className="mt-2 whitespace-pre-wrap text-sm">{request.outcome}</p>
            </Card>
          ) : null}

          <Card className="p-5">
            <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              {t(locale, "History")}
            </h2>
            {history.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">
                {t(locale, "Nothing has changed since it was opened.")}
              </p>
            ) : (
              <ul className="mt-3 divide-y">
                {history.map((change) => (
                  <li key={change.id} className="py-2.5 text-sm">
                    <p>
                      <span className="font-medium">
                        {t(locale, FIELD_LABEL[change.field] ?? change.field)}
                      </span>
                      {change.field === "outcome" ? (
                        <span className="text-muted-foreground"> {t(locale, "updated")}</span>
                      ) : (
                        <span className="text-muted-foreground">
                          {" "}
                          {change.field === "assignedTo"
                            ? (change.oldValue ?? t(locale, "unassigned"))
                            : t(locale, humanise(change.oldValue))}{" "}
                          →{" "}
                          {change.field === "assignedTo"
                            ? (change.newValue ?? t(locale, "unassigned"))
                            : t(locale, humanise(change.newValue))}
                        </span>
                      )}
                    </p>
                    <p className="tnum mt-0.5 text-xs text-muted-foreground">
                      {change.actor?.name ?? t(locale, "System")} ·{" "}
                      {formatRelative(change.createdAt)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="p-5">
            <h2 className="mb-3 font-semibold">{t(locale, "Customer")}</h2>
            {request.customer ? (
              <Link
                href={`/app/customers/${request.customer.id}`}
                className="flex items-start gap-3 rounded-lg border p-3 transition-colors hover:bg-secondary/60"
              >
                <User className="mt-0.5 size-4 text-muted-foreground" />
                <div className="min-w-0">
                  <p className="font-medium">{request.customer.fullName}</p>
                  <p className="tnum text-xs text-muted-foreground">
                    {request.customer.code} · {request.customer.phone}
                  </p>
                </div>
              </Link>
            ) : (
              <div className="rounded-lg border p-3 text-sm">
                <p className="font-medium">{request.contactName ?? t(locale, "Unknown")}</p>
                <p className="tnum text-xs text-muted-foreground">
                  {request.contactPhone ?? t(locale, "No number taken")}
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  {t(locale, "Not registered as a customer yet.")}
                </p>
              </div>
            )}
            <p className="mt-3 flex items-start gap-2 text-xs text-muted-foreground">
              <Store className="mt-0.5 size-3.5 shrink-0" />
              <span>
                <Link href="/app/support/markets" className="text-brand hover:underline">
                  {t(locale, "Browse the China markets directory")}
                </Link>{" "}
                {t(locale, "to point them at the right place.")}
              </span>
            </p>
          </Card>

          <Card className="p-5">
            <h2 className="mb-4 font-semibold">{t(locale, "Move it forward")}</h2>
            {mayWork ? (
              <SourcingWorkflow
                locale={locale}
                staff={staff}
                request={{
                  id: request.id,
                  status: request.status,
                  priority: request.priority,
                  assignedToId: request.assignedToId,
                  outcome: request.outcome,
                }}
              />
            ) : (
              <p className="text-sm text-muted-foreground">
                {t(locale, "You can read this request but not work it.")}
              </p>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
