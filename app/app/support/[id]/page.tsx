import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import type { Role, TicketPriority } from "@prisma/client";

import { ConversationReply } from "@/components/app/conversation-reply";
import { Field } from "@/components/app/field";
import { PageHeader } from "@/components/app/page-header";
import { TicketWorkflow } from "@/components/app/ticket-forms";
import { CargoStatusBadge } from "@/components/app/status-badge";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { markConversationRead } from "@/lib/actions/messages";
import { formatDateTime, formatMoney } from "@/lib/format";
import { outstandingOf } from "@/lib/invoice-balance";
import { prisma } from "@/lib/prisma";
import { ROLE_PERMISSIONS, can } from "@/lib/rbac";
import { requirePermission } from "@/lib/session";
import { cn } from "@/lib/utils";
import { distinctMark } from "@/lib/customer-name";

export const metadata: Metadata = { title: "Ticket" };

const PRIORITY_TONE: Record<TicketPriority, BadgeProps["tone"]> = {
  URGENT: "bad",
  HIGH: "warn",
  NORMAL: "neutral",
  LOW: "neutral",
};

/**
 * ONE CONVERSATION, WITH THE CUSTOMER BESIDE IT.
 *
 * This is §10: the thread on the left, and on the right everything Support
 * would otherwise have to open four screens to find — where the cargo is, which
 * container, what the ETA is, what is owed. The whole point is answering a
 * phone call without saying "let me check and call you back".
 */
export default async function ConversationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requirePermission("conversation.view");
  const { id } = await params;

  const [conversation, staff] = await Promise.all([
    prisma.conversation.findUnique({
      where: { id },
      include: {
        customer: {
          include: {
            invoices: { include: { payments: true } },
          },
        },
        cargo: {
          include: {
            containerLines: {
              include: { container: { include: { shipment: true } } },
            },
            darReceiving: true,
            invoices: { include: { payments: true } },
          },
        },
        assignedTo: { select: { name: true } },
        messages: {
          include: { author: { select: { name: true } } },
          orderBy: { createdAt: "asc" },
        },
      },
    }),
    /* Who may be handed a ticket is read off the permission table rather than
       typed out as a role list, so a ticket can never be given to somebody the
       support pages turn away at the door. */
    prisma.user.findMany({
      where: {
        active: true,
        role: {
          in: (Object.keys(ROLE_PERMISSIONS) as Role[]).filter((role) =>
            can(role, "conversation.reply")
          ),
        },
      },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);
  if (!conversation) notFound();

  await markConversationRead(conversation.id);

  const balance = conversation.customer.invoices
    .filter((i) => i.status !== "DRAFT" && i.status !== "CANCELLED")
    .reduce((sum, i) => sum + Number(outstandingOf(i)), 0);

  const container = conversation.cargo?.containerLines.at(-1)?.container;
  const cargoInvoice = conversation.cargo?.invoices.at(0);

  return (
    <div className="space-y-6">
      <PageHeader
        title={conversation.subject}
        description={`${conversation.customer.fullName} · ${conversation.reference}`}
        back={{ href: "/app/support/tickets", label: "Tickets" }}
        actions={
          <>
            <Badge tone={PRIORITY_TONE[conversation.priority]}>
              {conversation.priority.toLowerCase()}
            </Badge>
            <Badge tone="progress">
              {conversation.status.replace(/_/g, " ").toLowerCase()}
            </Badge>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardContent className="space-y-4 pt-6">
              {conversation.messages.map((message) => (
                <div
                  key={message.id}
                  className={cn(
                    "rounded-lg p-3.5",
                    message.internal
                      ? "border border-amber-300 bg-amber-50"
                      : message.authorId
                        ? "bg-navy-50"
                        : "bg-secondary"
                  )}
                >
                  <p className="whitespace-pre-wrap text-sm">{message.body}</p>
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    {message.internal ? (
                      <span className="font-medium text-amber-800">
                        Internal note ·{" "}
                      </span>
                    ) : null}
                    {message.author?.name ?? conversation.customer.fullName} ·{" "}
                    {formatDateTime(message.createdAt)}
                  </p>
                </div>
              ))}
            </CardContent>
          </Card>

          {can(user.role, "conversation.reply") ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Reply</CardTitle>
              </CardHeader>
              <CardContent>
                <ConversationReply
                  conversationId={conversation.id}
                  status={conversation.status}
                />
              </CardContent>
            </Card>
          ) : null}
        </div>

        <div className="space-y-6">
          {can(user.role, "conversation.reply") ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Move it forward</CardTitle>
              </CardHeader>
              <CardContent>
                <TicketWorkflow
                  ticket={{
                    id: conversation.id,
                    status: conversation.status,
                    priority: conversation.priority,
                    assignedToId: conversation.assignedToId,
                  }}
                  staff={
                    /* Whoever holds it now stays in the list even if they have
                       since left the desk, so the select shows the truth. */
                    conversation.assignedTo &&
                    !staff.some((p) => p.id === conversation.assignedToId)
                      ? [
                          ...staff,
                          {
                            id: conversation.assignedToId!,
                            name: conversation.assignedTo.name,
                          },
                        ]
                      : staff
                  }
                  canAssign={can(user.role, "conversation.assign")}
                />
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Customer</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-4">
                <Field
                  label="Name"
                  value={
                    <Link
                      href={`/app/customers/${conversation.customerId}`}
                      className="font-medium hover:underline"
                    >
                      {conversation.customer.fullName}
                    </Link>
                  }
                />
                <Field label="Phone" value={conversation.customer.phone} mono />
                <Field label="Code" value={conversation.customer.code} mono />
                {distinctMark(
                  conversation.customer.fullName,
                  conversation.customer.shippingMark
                ) ? (
                  <Field
                    label="Trades as"
                    value={conversation.customer.shippingMark}
                    mono
                  />
                ) : null}
                <Field
                  label="Outstanding"
                  value={
                    <span className={balance > 0 ? "font-semibold" : ""}>
                      {formatMoney(balance, "USD")}
                    </span>
                  }
                  mono
                />
              </dl>
            </CardContent>
          </Card>

          {conversation.cargo ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">This cargo</CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="grid gap-4">
                  <Field
                    label="Reference"
                    value={
                      <Link
                        href={`/app/cargo/${conversation.cargo.id}`}
                        className="font-medium hover:underline"
                      >
                        {conversation.cargo.reference}
                      </Link>
                    }
                  />
                  <Field
                    label="Where it is"
                    value={
                      <CargoStatusBadge status={conversation.cargo.status} />
                    }
                  />
                  <Field
                    label="Container"
                    value={container?.containerNumber ?? container?.reference}
                    mono
                  />
                  <Field label="Vessel" value={container?.shipment?.vessel} />
                  <Field
                    label="ETA"
                    value={
                      container?.shipment?.eta
                        ? container.shipment.eta.toDateString()
                        : null
                    }
                  />
                  <Field label="Invoice" value={cargoInvoice?.number} mono />
                  <Field
                    label="Owing on it"
                    value={
                      cargoInvoice
                        ? formatMoney(
                            outstandingOf(cargoInvoice),
                            cargoInvoice.currency
                          )
                        : null
                    }
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
