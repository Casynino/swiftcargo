import Link from "next/link";
import type { Metadata } from "next";

import { EmptyState } from "@/components/app/empty-state";
import { NewMessageForm } from "@/components/portal/message-forms";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { formatRelative } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { requireCustomer } from "@/lib/session";

export const metadata: Metadata = { title: "Messages" };

export default async function PortalMessagesPage() {
  const user = await requireCustomer();

  const [conversations, cargo] = await Promise.all([
    prisma.conversation.findMany({
      where: { customerId: user.customerId },
      orderBy: { lastMessageAt: "desc" },
      include: {
        messages: {
          where: { internal: false },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
        cargo: { select: { reference: true } },
      },
    }),
    prisma.cargo.findMany({
      where: {
        deletedAt: null,
        OR: [{ senderId: user.customerId }, { receiverId: user.customerId }],
      },
      orderBy: { createdAt: "desc" },
      select: { id: true, reference: true, description: true },
      take: 40,
    }),
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Messages</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Ask us anything about your cargo. We usually reply the same working
          day.
        </p>
      </header>

      <NewMessageForm cargo={cargo} />

      {conversations.length === 0 ? (
        <Card>
          <EmptyState icon="MessagesSquare" title="No messages yet" />
        </Card>
      ) : (
        <ul className="space-y-3">
          {conversations.map((conversation) => (
            <li key={conversation.id}>
              <Link
                href={`/portal/messages/${conversation.id}`}
                className="focus-ring block rounded-xl"
              >
                <Card className="p-5 transition-colors hover:bg-secondary/40">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium">{conversation.subject}</p>
                      <p className="mt-0.5 line-clamp-1 text-sm text-muted-foreground">
                        {conversation.messages[0]?.body}
                      </p>
                      <p className="tnum mt-1.5 text-xs text-muted-foreground">
                        {conversation.reference}
                        {conversation.cargo
                          ? ` · ${conversation.cargo.reference}`
                          : ""}{" "}
                        · {formatRelative(conversation.lastMessageAt)}
                      </p>
                    </div>
                    {conversation.customerUnread ? (
                      <Badge tone="warn">new reply</Badge>
                    ) : (
                      <Badge tone="neutral">
                        {conversation.status.replace(/_/g, " ").toLowerCase()}
                      </Badge>
                    )}
                  </div>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
