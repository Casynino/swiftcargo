import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import type { Prisma, Role, TicketPriority } from "@prisma/client";

import { ConversationReply } from "@/components/app/conversation-reply";
import { Field } from "@/components/app/field";
import { PageHeader } from "@/components/app/page-header";
import { TicketWorkflow } from "@/components/app/ticket-forms";
import { CargoStatusBadge } from "@/components/app/status-badge";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { markConversationRead } from "@/lib/actions/messages";
import { formatDate, formatDateTime, formatMoney } from "@/lib/format";
import { balanceOf, owedAcross } from "@/lib/invoice-balance";
import { prisma } from "@/lib/prisma";
import { ROLE_PERMISSIONS, can } from "@/lib/rbac";
import { requirePermission } from "@/lib/session";
import { JOURNEY_INCLUDE, journeyOf } from "@/lib/tracking";
import { cn } from "@/lib/utils";
import { distinctMark } from "@/lib/customer-name";

import { primeLocale, T } from "@/lib/server-t";
import { Tx } from "@/components/app/tx";
export const metadata: Metadata = { title: "Ticket" };

const PRIORITY_TONE: Record<TicketPriority, BadgeProps["tone"]> = {
  URGENT: "bad",
  HIGH: "warn",
  NORMAL: "neutral",
  LOW: "neutral",
};

/** A bill somebody has been asked to pay. A draft is Finance's working. */
const LIVE_BILL: Prisma.InvoiceWhereInput = {
  status: { notIn: ["DRAFT", "CANCELLED"] },
};

const PAYMENT_TONE: Record<string, BadgeProps["tone"]> = {
  PENDING: "warn",
  VERIFIED: "good",
  REJECTED: "bad",
  REVERSED: "bad",
  CANCELLED: "neutral",
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
  await primeLocale();
  const user = await requirePermission("conversation.view");
  const { id } = await params;

  /*
    THE MONEY IS GATED AT THE QUERY, NOT AT THE MARKUP.

    Every other screen in the app decides whether to READ a bill rather than
    whether to draw one, and this page did the opposite: it pulled both invoice
    trees with their payments for anybody holding `conversation.view` and then
    chose what to print. Support holds `finance.view` as well, so nothing leaked
    today — but the day a desk is given tickets and not bills, the figures would
    already be in the page's payload.
  */
  const money = can(user.role, "finance.view");
  const billsFor = () => ({
    /* Not hidden in the markup: a desk without `finance.view` is handed no
       rows at all, so there is nothing in the payload to forget to hide. */
    where: money ? LIVE_BILL : { id: { in: [] as string[] } },
    orderBy: { createdAt: "asc" as const },
    include: {
      payments: {
        orderBy: { createdAt: "desc" as const },
        select: {
          id: true,
          reference: true,
          status: true,
          amount: true,
          currency: true,
          method: true,
          paidAt: true,
          createdAt: true,
          writtenOff: true,
          fxRate: true,
          baseCurrencyAmount: true,
          creditedAmount: true,
        },
      },
    },
  });

  const [conversation, staff] = await Promise.all([
    prisma.conversation.findUnique({
      where: { id },
      include: {
        customer: { include: { invoices: billsFor() } },
        cargo: {
          include: {
            containerLines: {
              include: { container: { include: { shipment: true } } },
            },
            darReceiving: true,
            invoices: billsFor(),
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

  /* Shillings summed in shillings, with the dollar figure beside them. The
     page used to add every bill's outstanding together as a number and print
     the total as dollars, so one TZS 36,450 bill and one USD 50 bill came out
     as "USD 36,500" on the screen the desk reads a balance off down a phone. */
  const owed = money ? owedAcross(conversation.customer.invoices) : null;

  const container = conversation.cargo?.containerLines.at(-1)?.container;

  /* The bill they are being asked to pay: the unsettled one, or the last one
     issued when nothing is owing. `.at(0)` took whichever row came back first,
     which on an older consignment is a bill that was settled months ago. */
  const bills = conversation.cargo?.invoices ?? [];
  const cargoInvoice =
    bills.find((invoice) => !balanceOf(invoice).settled) ?? bills.at(-1) ?? null;
  const bill = cargoInvoice ? balanceOf(cargoInvoice) : null;
  const payments = cargoInvoice?.payments ?? [];

  /* The same stage the customer is looking at while they are on the phone.
     Answering "it is at sea" to somebody whose screen says "being located" is
     how a call becomes a complaint. */
  const journey = conversation.cargoId
    ? await prisma.cargo
        .findUnique({
          where: { id: conversation.cargoId },
          include: JOURNEY_INCLUDE,
        })
        .then((cargo) => (cargo ? journeyOf(cargo) : null))
    : null;

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
                <CardTitle className="text-base">{T("Reply")}</CardTitle>
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
                <CardTitle className="text-base">{T("Move it forward")}</CardTitle>
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
              <CardTitle className="text-base">{T("Customer")}</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-4">
                <Field
                  label={T("Name")}
                  value={
                    <Link
                      href={`/app/customers/${conversation.customerId}`}
                      className="font-medium hover:underline"
                    >
                      {conversation.customer.fullName}
                    </Link>
                  }
                />
                <Field label={T("Phone")} value={conversation.customer.phone} mono />
                <Field label={T("Code")} value={conversation.customer.code} mono />
                {distinctMark(
                  conversation.customer.fullName,
                  conversation.customer.shippingMark
                ) ? (
                  <Field
                    label={T("Trades as")}
                    value={conversation.customer.shippingMark}
                    mono
                  />
                ) : null}
                {owed ? (
                  <Field
                    label={T("Outstanding")}
                    value={
                      <>
                        <span className={owed.owes ? "font-semibold" : ""}>
                          {owed.owes ? owed.primary : formatMoney(0, "TZS")}
                        </span>
                        {owed.owes && owed.equivalent ? (
                          <span className="ml-2 text-xs text-muted-foreground">
                            {owed.equivalent}
                          </span>
                        ) : null}
                      </>
                    }
                    mono
                  />
                ) : null}
              </dl>
            </CardContent>
          </Card>

          {conversation.cargo ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{T("This cargo")}</CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="grid gap-4">
                  <Field
                    label={T("Reference")}
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
                    label={T("Where it is")}
                    value={
                      <CargoStatusBadge status={conversation.cargo.status} />
                    }
                  />
                  {/* WHAT THE CUSTOMER IS LOOKING AT WHILE THEY ARE ON THE
                      PHONE. The badge above is the company's own word for the
                      record; this is the sentence their tracking page prints,
                      and answering the call from the other one is how a
                      question becomes a complaint. */}
                  {journey ? (
                    <Field
                      label={T("Their tracking says")}
                      value={
                        <>
                          <Badge
                            tone={
                              journey.tone === "progress"
                                ? "progress"
                                : journey.tone === "good"
                                  ? "good"
                                  : journey.tone === "warn"
                                    ? "warn"
                                    : journey.tone === "bad"
                                      ? "bad"
                                      : "neutral"
                            }
                          >
                            <Tx>{journey.headline}</Tx>
                          </Badge>
                          {journey.notice ? (
                            <span className="mt-1.5 block text-xs text-muted-foreground">
                              {journey.notice}
                            </span>
                          ) : null}
                        </>
                      }
                    />
                  ) : null}
                  <Field
                    label={T("Container")}
                    value={container?.containerNumber ?? container?.reference}
                    mono
                  />
                  <Field label={T("Vessel")} value={container?.shipment?.vessel} />
                  <Field
                    label="ETA"
                    value={
                      container?.shipment?.eta
                        ? container.shipment.eta.toDateString()
                        : null
                    }
                  />
                  {money ? (
                    <>
                      <Field
                        label={T("Invoice")}
                        value={
                          cargoInvoice ? (
                            <Link
                              href={`/app/finance/invoices/${cargoInvoice.id}`}
                              className="font-medium hover:underline"
                            >
                              {cargoInvoice.number}
                            </Link>
                          ) : null
                        }
                        mono
                      />
                      <Field
                        label={T("Billed")}
                        value={
                          bill
                            ? formatMoney(bill.total, cargoInvoice!.currency)
                            : null
                        }
                        mono
                      />
                      <Field
                        label={T("Owing on it")}
                        value={
                          bill ? (
                            <>
                              <span className={bill.settled ? "" : "font-semibold"}>
                                {bill.outstandingTzs
                                  ? formatMoney(bill.outstandingTzs, "TZS")
                                  : formatMoney(
                                      bill.outstanding,
                                      cargoInvoice!.currency
                                    )}
                              </span>
                              {bill.outstandingTzs &&
                              cargoInvoice!.currency !== "TZS" ? (
                                <span className="ml-2 text-xs text-muted-foreground">
                                  {formatMoney(
                                    bill.outstanding,
                                    cargoInvoice!.currency
                                  )}
                                </span>
                              ) : null}
                            </>
                          ) : null
                        }
                        mono
                      />
                      {/* The bill's OWN rate, pinned when it was issued. Never
                          today's board — a bill agreed at 2,650 is still 2,650
                          after the board moves, and quoting today's figure down
                          the phone is quoting a different bill. */}
                      <Field
                        label={T("Rate on the bill")}
                        value={
                          bill?.rate
                            ? `1 USD = ${bill.rate.toString()} TZS`
                            : null
                        }
                        mono
                      />
                    </>
                  ) : null}
                </dl>

                {money && payments.length > 0 ? (
                  <div className="mt-5 border-t pt-4">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      {T("Payments")}
                    </p>
                    <ul className="mt-2 space-y-2">
                      {payments.slice(0, 6).map((payment) => (
                        <li
                          key={payment.id}
                          className="flex items-baseline justify-between gap-3 text-sm"
                        >
                          <span className="tnum font-medium">
                            {formatMoney(payment.amount, payment.currency)}
                          </span>
                          <span className="flex items-center gap-2 text-xs text-muted-foreground">
                            {formatDate(payment.paidAt ?? payment.createdAt)}
                            <Badge tone={PAYMENT_TONE[payment.status] ?? "neutral"}>
                              {payment.status.toLowerCase()}
                            </Badge>
                          </span>
                        </li>
                      ))}
                    </ul>
                    {/* The rule the whole system turns on, said where a clerk
                        is about to repeat a figure to a customer. */}
                    <p className="mt-2 text-xs text-muted-foreground">
                      {T("Only verified payments count against the balance.")}
                    </p>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}
