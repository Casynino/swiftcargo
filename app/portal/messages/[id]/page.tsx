import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ChevronLeft } from "lucide-react";

import { CustomerReplyForm } from "@/components/portal/message-forms";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTime } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { requireCustomer } from "@/lib/session";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Message" };

export default async function PortalConversationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireCustomer();
  const { id } = await params;

  const conversation = await prisma.conversation.findFirst({
    where: { id, customerId: user.customerId },
    include: {
      cargo: { select: { reference: true } },
      /*
        INTERNAL NOTES ARE FILTERED OUT HERE.

        Staff leave notes to each other on the same thread, deliberately — the
        alternative is a second system nobody reads. This `where` is the only
        thing keeping them off the customer's screen, so it is not optional and
        must never be relaxed to "include everything and hide in the UI".
      */
      messages: {
        where: { internal: false },
        include: { author: { select: { name: true } } },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!conversation) notFound();

  await prisma.conversation.updateMany({
    where: { id: conversation.id, customerId: user.customerId },
    data: { customerUnread: false },
  });

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Link
        href="/portal/messages"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" />
        Messages
      </Link>

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {conversation.subject}
        </h1>
        <p className="tnum mt-1 text-sm text-muted-foreground">
          {conversation.reference}
          {conversation.cargo ? ` · ${conversation.cargo.reference}` : ""}
        </p>
      </div>

      <Card>
        <CardContent className="space-y-4 pt-6">
          {conversation.messages.map((message) => (
            <div
              key={message.id}
              className={cn(
                "rounded-lg p-3.5",
                message.authorId ? "bg-brand-muted" : "bg-secondary"
              )}
            >
              <p className="whitespace-pre-wrap text-sm">{message.body}</p>
              <p className="mt-1.5 text-xs text-muted-foreground">
                {message.author?.name ?? "You"} ·{" "}
                {formatDateTime(message.createdAt)}
              </p>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Reply</CardTitle>
        </CardHeader>
        <CardContent>
          <CustomerReplyForm conversationId={conversation.id} />
        </CardContent>
      </Card>
    </div>
  );
}
