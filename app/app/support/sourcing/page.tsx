import type { Metadata } from "next";
import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { Plus, X } from "lucide-react";

import { PageHeader } from "@/components/app/page-header";
import { SectionTabs } from "@/components/app/section-tabs";
import { NewSourcingForm } from "@/components/app/sourcing-forms";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { formatRelative } from "@/lib/format";
import { t } from "@/lib/i18n";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { localeOf } from "@/lib/viewer-locale";

export const metadata: Metadata = { title: "Sourcing requests" };

const COLUMNS = [
  { key: "NEW", label: "New" },
  { key: "IN_PROGRESS", label: "In progress" },
  { key: "WAITING_CUSTOMER", label: "Waiting" },
  { key: "SUPPLIER_FOUND", label: "Supplier found" },
  { key: "COMPLETED", label: "Completed" },
] as const;

const PRIORITY_TONE: Record<string, "neutral" | "warn" | "bad"> = {
  LOW: "neutral",
  NORMAL: "neutral",
  HIGH: "warn",
  URGENT: "bad",
};

/**
 * The sourcing pipeline, laid out as a board.
 *
 * Sourcing is a pipeline, not a list: a request moves left to right and the
 * useful question is "what is stuck in the middle", which a table hides and
 * columns make obvious.
 */
export default async function SourcingPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; new?: string }>;
}) {
  const user = await requirePermission("conversation.view");
  const { q, new: newParam } = await searchParams;
  const query = (q ?? "").trim();
  const creating = newParam === "1";

  const where: Prisma.SourcingRequestWhereInput = query
    ? {
        OR: [
          { reference: { contains: query, mode: "insensitive" } },
          { product: { contains: query, mode: "insensitive" } },
          { details: { contains: query, mode: "insensitive" } },
          { market: { contains: query, mode: "insensitive" } },
          { contactName: { contains: query, mode: "insensitive" } },
          { contactPhone: { contains: query } },
          { customer: { fullName: { contains: query, mode: "insensitive" } } },
          { customer: { code: { contains: query, mode: "insensitive" } } },
          { customer: { phone: { contains: query } } },
        ],
      }
    : {};

  const [locale, requests, markets] = await Promise.all([
    localeOf(user.id),
    prisma.sourcingRequest.findMany({
      where,
      orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
      take: 300,
      select: {
        id: true,
        reference: true,
        product: true,
        priority: true,
        status: true,
        createdAt: true,
        contactName: true,
        contactPhone: true,
        customer: { select: { fullName: true } },
        assignedTo: { select: { name: true } },
      },
    }),
    creating
      ? prisma.marketInformation.findMany({
          where: { published: true },
          orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
          select: { name: true },
        })
      : Promise.resolve([] as { name: string }[]),
  ]);

  const cancelled = requests.filter((r) => r.status === "CANCELLED");
  const keep = (extra: Record<string, string>) => {
    const params = new URLSearchParams({ ...(query ? { q: query } : {}), ...extra });
    const s = params.toString();
    return s ? `/app/support/sourcing?${s}` : "/app/support/sourcing";
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={t(locale, "Sourcing requests")}
        description={t(locale, "Customers who want something found in China.")}
        actions={
          creating ? (
            <Button asChild variant="outline">
              <Link href={keep({})}>
                <X />
                {t(locale, "Close")}
              </Link>
            </Button>
          ) : (
            <Button asChild>
              <Link href={keep({ new: "1" })}>
                <Plus />
                {t(locale, "New request")}
              </Link>
            </Button>
          )
        }
      />
      <SectionTabs />

      {creating ? (
        <Card className="p-5">
          <h2 className="mb-4 font-semibold">{t(locale, "New sourcing request")}</h2>
          <NewSourcingForm markets={markets.map((m) => m.name)} locale={locale} />
        </Card>
      ) : null}

      <form className="max-w-md">
        {creating ? <input type="hidden" name="new" value="1" /> : null}
        <Input
          name="q"
          defaultValue={query}
          placeholder={t(locale, "Product, reference, customer or phone…")}
          aria-label={t(locale, "Search sourcing requests")}
        />
      </form>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
        {COLUMNS.map((column) => {
          const items = requests.filter((request) => request.status === column.key);
          return (
            <Card key={column.key} className="self-start">
              <header className="flex items-center justify-between gap-2 border-b p-3">
                <h2 className="text-sm font-semibold">{t(locale, column.label)}</h2>
                <span className="tnum rounded-full bg-secondary px-2 py-0.5 text-xs text-muted-foreground">
                  {items.length}
                </span>
              </header>
              <ul className="divide-y">
                {items.map((request) => (
                  <li key={request.id}>
                    <Link
                      href={`/app/support/sourcing/${request.id}`}
                      className="block p-3 transition-colors hover:bg-secondary/60"
                    >
                      <p className="text-sm font-medium">{request.product}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {request.customer?.fullName ??
                          request.contactName ??
                          request.contactPhone ??
                          t(locale, "Unknown")}
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        <Badge tone={PRIORITY_TONE[request.priority]}>
                          {t(locale, request.priority.toLowerCase())}
                        </Badge>
                        {request.assignedTo ? null : (
                          <Badge tone="outline">{t(locale, "unassigned")}</Badge>
                        )}
                      </div>
                      <p className="tnum mt-2 text-xs text-muted-foreground">
                        {request.reference} · {formatRelative(request.createdAt)}
                      </p>
                    </Link>
                  </li>
                ))}
                {items.length === 0 ? (
                  <li className="p-4 text-center text-xs text-muted-foreground">
                    {t(locale, "Empty")}
                  </li>
                ) : null}
              </ul>
            </Card>
          );
        })}
      </div>

      {cancelled.length > 0 ? (
        <p className="text-sm text-muted-foreground">
          {t(locale, "Cancelled, kept off the board:")}{" "}
          {cancelled.map((request, index) => (
            <span key={request.id}>
              {index > 0 ? ", " : null}
              <Link
                href={`/app/support/sourcing/${request.id}`}
                className="tnum hover:underline"
              >
                {request.reference}
              </Link>
            </span>
          ))}
        </p>
      ) : null}
    </div>
  );
}
