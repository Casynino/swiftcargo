import Link from "next/link";
import type { Metadata } from "next";

import { EmptyState } from "@/components/app/empty-state";
import { MarkAllRead } from "@/components/app/mark-all-read";
import { Card } from "@/components/ui/card";
import { formatRelative } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { requireCustomer } from "@/lib/session";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Updates" };

export default async function PortalNotificationsPage() {
  const user = await requireCustomer();

  const notifications = await prisma.notification.findMany({
    where: { customerId: user.customerId },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  const unread = notifications.filter((n) => !n.readAt).length;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Updates</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Everything that has happened to your cargo.
          </p>
        </div>
        {unread > 0 ? <MarkAllRead /> : null}
      </header>

      <Card>
        {notifications.length === 0 ? (
          <EmptyState icon="Bell" title="Nothing yet" />
        ) : (
          <ul className="divide-y">
            {notifications.map((n) => {
              const body = (
                <div className="flex gap-3 p-4">
                  <span
                    className={cn(
                      "mt-1.5 size-2 shrink-0 rounded-full",
                      n.readAt ? "bg-transparent" : "bg-signal"
                    )}
                  />
                  <div className="min-w-0 flex-1">
                    <p className={cn("text-sm", !n.readAt && "font-medium")}>
                      {n.title}
                    </p>
                    {n.body ? (
                      <p className="mt-0.5 text-sm text-muted-foreground">
                        {n.body}
                      </p>
                    ) : null}
                    <p className="mt-1 text-xs text-muted-foreground">
                      {formatRelative(n.createdAt)}
                    </p>
                  </div>
                </div>
              );
              return (
                <li key={n.id}>
                  {n.href ? (
                    <Link href={n.href} className="block hover:bg-secondary/50">
                      {body}
                    </Link>
                  ) : (
                    body
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
