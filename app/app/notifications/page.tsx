import Link from "next/link";
import type { Metadata } from "next";

import { EmptyState } from "@/components/app/empty-state";
import { MarkAllRead } from "@/components/app/mark-all-read";
import { PageHeader } from "@/components/app/page-header";
import { Card } from "@/components/ui/card";
import { formatRelative } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/session";
import { cn } from "@/lib/utils";

import { primeLocale, T } from "@/lib/server-t";
import { Tx } from "@/components/app/tx";
export const metadata: Metadata = { title: "Notifications" };

export default async function NotificationsPage() {
  await primeLocale();
  const user = await requireStaff();

  const notifications = await prisma.notification.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  const unread = notifications.filter((n) => !n.readAt).length;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title={T("Notifications")}
        description={T("What happened that concerns your desk.")}
        actions={unread > 0 ? <MarkAllRead /> : undefined}
      />
      <Card>
        {notifications.length === 0 ? (
          <EmptyState icon="Bell" title={T("Nothing yet")} />
        ) : (
          <ul className="divide-y">
            {notifications.map((n) => {
              const body = (
                <div className="flex gap-3 p-4">
                  <span
                    className={cn(
                      "mt-1.5 size-2 shrink-0 rounded-full",
                      n.readAt ? "bg-transparent" : "bg-accent"
                    )}
                  />
                  <div className="min-w-0 flex-1">
                    <p className={cn("text-sm", !n.readAt && "font-medium")}>
                      <Tx>{n.title}</Tx>
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
                    <Link href={n.href} className="block hover:bg-secondary/60">
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
