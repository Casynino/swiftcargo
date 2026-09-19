import Link from "next/link";
import type { Metadata } from "next";
import { ChevronLeft, ChevronRight, Package, Search } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatCbm, formatDate, formatRelative } from "@/lib/format";
import { DEFAULT_LOCALE, t } from "@/lib/i18n";
import { owedAcross } from "@/lib/invoice-balance";
import { mine, portalSummary, STAGE_FILTERS, type StageFilter } from "@/lib/portal";
import { prisma } from "@/lib/prisma";
import { requireCustomer } from "@/lib/session";
import { JOURNEY_INCLUDE, journeyOf } from "@/lib/tracking";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "My cargo" };

const PAGE = 20;

/**
 * Every consignment the customer sent or is receiving, a page at a time.
 *
 * The filter and the search narrow a query that is already this customer's
 * own; neither can widen it. The search looks at the reference, the mark and
 * the description — the three things a customer has in front of them when
 * they wonder where something is.
 */
export default async function MyCargoPage({
  searchParams,
}: {
  searchParams: Promise<{ stage?: string; q?: string; page?: string }>;
}) {
  const locale = DEFAULT_LOCALE;
  const user = await requireCustomer();
  const params = await searchParams;

  const stage = (params.stage && params.stage in STAGE_FILTERS ? params.stage : null) as StageFilter | null;
  const q = (params.q ?? "").trim().slice(0, 60);
  const page = Math.max(1, Number(params.page) || 1);

  const where = {
    ...mine(user.customerId),
    ...(stage ? { status: { in: [...STAGE_FILTERS[stage].statuses] } } : {}),
    ...(q
      ? {
          AND: [
            {
              OR: [
                { reference: { contains: q, mode: "insensitive" as const } },
                { description: { contains: q, mode: "insensitive" as const } },
                { shippingMark: { contains: q, mode: "insensitive" as const } },
              ],
            },
          ],
        }
      : {}),
  };

  const [summary, total, cargo] = await Promise.all([
    portalSummary(user.customerId),
    prisma.cargo.count({ where }),
    prisma.cargo.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * PAGE,
      take: PAGE,
      include: {
        ...JOURNEY_INCLUDE,
        chinaReceiving: { select: { packagesCount: true, piecesCount: true, cbm: true } },
        packages: {
          where: { deletedAt: null },
          select: { cargoType: true },
          take: 1,
        },
      },
    }),
  ]);

  const pages = Math.max(1, Math.ceil(total / PAGE));
  const now = new Date();
  const href = (next: { stage?: string | null; page?: number }) => {
    const sp = new URLSearchParams();
    const s = next.stage === undefined ? stage : next.stage;
    if (s) sp.set("stage", s);
    if (q) sp.set("q", q);
    if (next.page && next.page > 1) sp.set("page", String(next.page));
    const str = sp.toString();
    return `/portal/cargo${str ? `?${str}` : ""}`;
  };

  const counts: Record<StageFilter, number> = {
    china: summary.inChina,
    sea: summary.atSea,
    arrived: summary.arrived,
    ready: summary.ready,
    collected: summary.collected,
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">{t(locale, "My cargo")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t(locale, "Everything you have sent with us, and where each one is now.")}
        </p>
      </header>

      <form action="/portal/cargo" className="flex gap-2">
        {stage ? <input type="hidden" name="stage" value={stage} /> : null}
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            name="q"
            defaultValue={q}
            placeholder={t(locale, "Cargo reference, shipping mark or description")}
            className="h-11 w-full rounded-xl border bg-card pl-9 pr-3 text-sm outline-none focus:border-brand"
          />
        </div>
        <Button type="submit" className="h-11">
          {t(locale, "Search")}
        </Button>
      </form>

      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <Chip href={href({ stage: null, page: 1 })} active={!stage} label="All" count={summary.total} />
        {(Object.keys(STAGE_FILTERS) as StageFilter[]).map((key) => (
          <Chip
            key={key}
            href={href({ stage: key, page: 1 })}
            active={stage === key}
            label={STAGE_FILTERS[key].label}
            count={counts[key]}
          />
        ))}
      </div>

      {cargo.length === 0 ? (
        <Card className="p-8 text-center">
          <Package className="mx-auto size-8 text-muted-foreground" />
          <p className="mt-3 font-semibold">
            {q || stage ? t(locale, "Nothing matches") : t(locale, "No cargo yet")}
          </p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
            {q || stage
              ? t(locale, "Try another search, or show all your cargo.")
              : t(locale, "Send your first shipment to Swift Cargo and track everything from here.")}
          </p>
          <div className="mt-4 flex justify-center gap-2">
            {q || stage ? (
              <Button asChild size="sm" variant="outline">
                <Link href="/portal/cargo">{t(locale, "Show all")}</Link>
              </Button>
            ) : (
              <>
                <Button asChild size="sm">
                  <Link href="/portal/book">{t(locale, "Book cargo")}</Link>
                </Button>
                <Button asChild size="sm" variant="outline">
                  <Link href="/portal/calculator">{t(locale, "Calculate shipping")}</Link>
                </Button>
              </>
            )}
          </div>
        </Card>
      ) : (
        <ul className="grid grid-cols-1 gap-3 [&>li]:min-w-0">
          {cargo.map((item) => {
            const journey = journeyOf(item, now);
            const container = item.containerLines.at(-1)?.container;
            const owed = owedAcross(
              item.invoices.filter((i) => i.status !== "DRAFT" && i.status !== "CANCELLED")
            );
            const packages = item.darReceiving?.packagesCount ?? item.chinaReceiving?.packagesCount;
            return (
              <li key={item.id}>
                <Link
                  href={`/portal/cargo/${encodeURIComponent(item.reference)}`}
                  className="focus-ring block rounded-xl"
                >
                  <Card className="p-4 transition-all hover:-translate-y-0.5 hover:shadow-raised">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="tnum font-semibold">{item.reference}</p>
                        <p className="truncate text-sm text-muted-foreground">
                          {[item.shippingMark, item.description].filter(Boolean).join(" · ")}
                        </p>
                      </div>
                      <Badge tone={journey.tone}>{t(locale, journey.headline)}</Badge>
                    </div>
                    <dl className="mt-3 grid grid-cols-2 gap-3 border-t pt-3 text-xs sm:grid-cols-5">
                      <Fact label="Category" value={item.packages[0]?.cargoType ?? "—"} />
                      <Fact label="Volume" value={item.chinaReceiving ? formatCbm(item.chinaReceiving.cbm) : "—"} />
                      <Fact label="Packages" value={packages != null ? String(packages) : "—"} />
                      <Fact label="Container" value={container?.reference ?? "Not yet loaded"} />
                      <Fact
                        label={journey.eta ? "Expected" : "Last update"}
                        value={journey.eta ? formatDate(journey.eta) : formatRelative(item.updatedAt)}
                      />
                    </dl>
                    {owed.owes ? (
                      <p className="tnum mt-3 rounded-lg bg-warning/10 px-3 py-1.5 text-xs font-medium text-warning">
                        {owed.primary} {t(locale, "to pay")}
                        {owed.equivalent ? ` · ${owed.equivalent}` : ""}
                      </p>
                    ) : null}
                  </Card>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {pages > 1 ? (
        <nav className="flex items-center justify-between gap-3 text-sm">
          {page > 1 ? (
            <Link href={href({ page: page - 1 })} className="inline-flex items-center gap-1 font-medium text-brand">
              <ChevronLeft className="size-4" />
              {t(locale, "Newer")}
            </Link>
          ) : (
            <span />
          )}
          <span className="tnum text-muted-foreground">
            {page} / {pages}
          </span>
          {page < pages ? (
            <Link href={href({ page: page + 1 })} className="inline-flex items-center gap-1 font-medium text-brand">
              {t(locale, "Older")}
              <ChevronRight className="size-4" />
            </Link>
          ) : (
            <span />
          )}
        </nav>
      ) : null}
    </div>
  );
}

function Chip({ href, active, label, count }: { href: string; active: boolean; label: string; count: number }) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
        active ? "border-brand bg-brand text-brand-foreground" : "bg-card text-muted-foreground hover:text-foreground"
      )}
    >
      {label}
      <span className="tnum text-xs opacity-75">{count}</span>
    </Link>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="tnum mt-0.5 truncate font-medium">{value}</dd>
    </div>
  );
}
