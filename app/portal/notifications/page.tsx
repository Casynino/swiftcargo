import Link from "next/link";
import type { Metadata } from "next";

import { EmptyState } from "@/components/app/empty-state";
import { MarkAllRead } from "@/components/app/mark-all-read";
import { Card } from "@/components/ui/card";
import { formatRelative } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { requireCustomer } from "@/lib/session";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Notifications" };

/* What each filter keeps, by the event name written on the notification. */
const FILTERS = {
  all: { label: "All", kinds: null },
  unread: { label: "Unread", kinds: null },
  cargo: { label: "Cargo", kinds: ["cargo.", "container.", "shipment.", "exception."] },
  money: { label: "Money", kinds: ["invoice.", "payment.", "receipt.", "pickup.", "storage."] },
  requests: { label: "Requests", kinds: ["request.", "delivery."] },
} as const;
type Filter = keyof typeof FILTERS;

export default async function PortalNotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ show?: string }>;
}) {
  const user = await requireCustomer();
  const { show } = await searchParams;
  const filter: Filter = show && show in FILTERS ? (show as Filter) : "all";
  const kinds = FILTERS[filter].kinds;

  const [notifications, unread] = await Promise.all([
    prisma.notification.findMany({
      where: {
        customerId: user.customerId,
        ...(filter === "unread" ? { readAt: null } : {}),
        ...(kinds ? { OR: kinds.map((k) => ({ kind: { startsWith: k } })) } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    prisma.notification.count({ where: { customerId: user.customerId, readAt: null } }),
  ]);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Notifications</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {unread > 0
              ? `You have ${unread} unread notification${unread === 1 ? "" : "s"}.`
              : "Everything that has happened to your cargo and your account."}
          </p>
        </div>
        {unread > 0 ? <MarkAllRead /> : null}
      </header>

      <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
        {(Object.keys(FILTERS) as Filter[]).map((key) => (
          <Link
            key={key}
            href={key === "all" ? "/portal/notifications" : `/portal/notifications?show=${key}`}
            className={cn(
              "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium",
              filter === key ? "border-brand bg-brand text-brand-foreground" : "bg-card text-muted-foreground hover:text-foreground"
            )}
          >
            {FILTERS[key].label}
            {key === "unread" && unread > 0 ? <span className="tnum text-xs opacity-75">{unread}</span> : null}
          </Link>
        ))}
      </div>

      <Card>
        {notifications.length === 0 ? (
          <EmptyState
            icon="Bell"
            title={filter === "all" ? "Nothing yet" : "Nothing here"}
            description="We tell you here when your cargo moves, a bill is issued or a payment is received."
          />
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
                  {/* Opening one marks it read, then goes where it points. */}
                  <a href={`/portal/notifications/open/${n.id}`} className="block hover:bg-secondary/50">
                    {body}
                  </a>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
