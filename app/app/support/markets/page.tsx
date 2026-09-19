import type { Metadata } from "next";
import Link from "next/link";
import { Clock, Info, MapPin, Pencil } from "lucide-react";

import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { SectionLabel } from "@/components/app/section-label";
import { SectionTabs } from "@/components/app/section-tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { t } from "@/lib/i18n";
import { parseMarketBody } from "@/lib/markets";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { requirePermission } from "@/lib/session";
import { localeOf } from "@/lib/viewer-locale";

import { primeLocale } from "@/lib/server-t";
export const metadata: Metadata = { title: "China markets" };

/**
 * The directory the desk recommends from.
 *
 * Written to be read aloud on a phone call: what the market is for, in one
 * line, then the products, then the practical warnings. Grouped by the kind of
 * goods, because a customer rings saying what they want to buy, not where.
 */
export default async function MarketsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  await primeLocale();
  const user = await requirePermission("conversation.view");
  const { q } = await searchParams;
  const query = (q ?? "").trim();

  const [locale, rows] = await Promise.all([
    localeOf(user.id),
    prisma.marketInformation.findMany({
      where: {
        published: true,
        ...(query
          ? {
              OR: [
                { name: { contains: query, mode: "insensitive" } },
                { city: { contains: query, mode: "insensitive" } },
                { category: { contains: query, mode: "insensitive" } },
                { summary: { contains: query, mode: "insensitive" } },
                { body: { contains: query, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
  ]);

  const groups = new Map<string, typeof rows>();
  for (const market of rows) {
    const key = market.category?.trim() || "Other";
    groups.set(key, [...(groups.get(key) ?? []), market]);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t(locale, "China markets")}
        description={t(locale, "Where to send a customer for what they are buying.")}
        actions={
          can(user.role, "content.manage") ? (
            <Button asChild variant="outline">
              <Link href="/app/admin/markets">
                <Pencil />
                {t(locale, "Edit the directory")}
              </Link>
            </Button>
          ) : null
        }
      />
      <SectionTabs />

      <Card className="flex items-start gap-3 p-4 text-sm">
        <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <p className="text-muted-foreground">
          {t(
            locale,
            "Wherever the goods are bought, they come to our Guangzhou warehouse and sail from there to Dar es Salaam — roughly 28 to 30 days at sea. Sea freight is charged on volume at the rate for the cargo type, so the packed size of what they buy matters as much as its price."
          )}
        </p>
      </Card>

      <form className="max-w-md">
        <Input
          name="q"
          defaultValue={query}
          placeholder={t(locale, "Product, market or city…")}
          aria-label={t(locale, "Search markets")}
        />
      </form>

      {rows.length === 0 ? (
        <Card>
          <EmptyState
            icon="Store"
            title={
              query
                ? t(locale, "No market matches that")
                : t(locale, "No markets in the directory yet")
            }
            description={
              query
                ? t(locale, "Try the kind of goods rather than the product name.")
                : t(
                    locale,
                    "Once the directory is written, every market appears here with what it sells."
                  )
            }
          />
        </Card>
      ) : (
        [...groups.entries()].map(([category, markets]) => (
          <section key={category}>
            <SectionLabel>{t(locale, category)}</SectionLabel>
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
              {markets.map((market) => {
                const body = parseMarketBody(market.body);
                return (
                  <Card
                    key={market.id}
                    id={market.slug}
                    className="flex scroll-mt-24 flex-col target:ring-2 target:ring-brand"
                  >
                    <header className="border-b p-5">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <h2 className="text-lg font-semibold">{market.name}</h2>
                        {market.city ? (
                          <Badge tone="outline">
                            <MapPin className="mr-1 size-3" />
                            {market.city}
                          </Badge>
                        ) : null}
                      </div>
                      {market.summary ? (
                        <p className="mt-2 text-sm font-medium text-brand">{market.summary}</p>
                      ) : null}
                    </header>

                    <div className="flex-1 space-y-4 p-5">
                      {body.description ? (
                        <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                          {body.description}
                        </p>
                      ) : null}

                      {body.district || body.hours ? (
                        <dl className="grid gap-2 text-sm">
                          {body.district ? (
                            <div className="flex items-start gap-2">
                              <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                              <dd>{body.district}</dd>
                            </div>
                          ) : null}
                          {body.hours ? (
                            <div className="flex items-start gap-2">
                              <Clock className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                              <dd className="text-muted-foreground">{body.hours}</dd>
                            </div>
                          ) : null}
                        </dl>
                      ) : null}

                      {body.products.length > 0 ? (
                        <div>
                          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            {t(locale, "What they sell")}
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {body.products.map((product) => (
                              <span key={product} className="rounded-full border px-2.5 py-1 text-xs">
                                {product}
                              </span>
                            ))}
                          </div>
                        </div>
                      ) : null}

                      {body.tips.length > 0 ? (
                        <div>
                          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            {t(locale, "Tell the customer")}
                          </p>
                          <ul className="space-y-1.5 text-sm text-muted-foreground">
                            {body.tips.map((tip) => (
                              <li key={tip} className="flex gap-2">
                                <span className="text-brand">•</span>
                                <span>{tip}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : null}

                      {body.verify ? (
                        <p className="rounded-md border border-warning/30 bg-warning/5 p-2.5 text-xs text-warning">
                          {body.verify}
                        </p>
                      ) : null}
                    </div>
                  </Card>
                );
              })}
            </div>
          </section>
        ))
      )}

      <p className="text-sm text-muted-foreground">
        {t(locale, "A customer who wants us to find it for them becomes a")}{" "}
        <Link href="/app/support/sourcing?new=1" className="text-brand hover:underline">
          {t(locale, "sourcing request")}
        </Link>
        .
      </p>
    </div>
  );
}
