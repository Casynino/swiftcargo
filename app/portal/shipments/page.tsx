import Link from "next/link";
import type { Metadata } from "next";
import { Ship } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ROUTE } from "@/lib/constants";
import { formatCbm, formatDate } from "@/lib/format";
import { DEFAULT_LOCALE, t } from "@/lib/i18n";
import { CUSTOMER_STATUS_WORDS, portalShipments } from "@/lib/portal";
import { requireCustomer } from "@/lib/session";

export const metadata: Metadata = { title: "My shipments" };

/**
 * The containers the customer's goods travel in.
 *
 * A container is shared: forty customers' cargo in one box. This page shows
 * the box's journey and the customer's own share of it, and nothing about
 * anybody else's — portalShipments never selects another consignment.
 */
export default async function ShipmentsPage() {
  const locale = DEFAULT_LOCALE;
  const user = await requireCustomer();
  const shipments = await portalShipments(user.customerId);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">{t(locale, "My shipments")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t(locale, "The containers carrying your cargo from")} {ROUTE.originCity} {t(locale, "to")}{" "}
          {ROUTE.destinationCity}.
        </p>
      </header>

      {shipments.length === 0 ? (
        <Card className="p-8 text-center">
          <Ship className="mx-auto size-8 text-muted-foreground" />
          <p className="mt-3 font-semibold">{t(locale, "No shipments yet")}</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
            {t(locale, "Once your cargo is loaded into a container, the container and its journey appear here.")}
          </p>
          <Button asChild size="sm" className="mt-4">
            <Link href="/portal/cargo">{t(locale, "See my cargo")}</Link>
          </Button>
        </Card>
      ) : (
        <ul className="grid grid-cols-1 gap-4 [&>li]:min-w-0">
          {shipments.map((s) => {
            const state = s.arrivedAt
              ? { label: "Arrived in Dar", tone: "good" as const }
              : s.departedAt
                ? { label: "At sea", tone: "progress" as const }
                : { label: "Loading in Guangzhou", tone: "neutral" as const };
            return (
              <li key={s.container.id}>
                <Card className="p-4 sm:p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-xs text-muted-foreground">{t(locale, "Container")}</p>
                      <p className="tnum text-lg font-bold">{s.container.reference}</p>
                    </div>
                    <Badge tone={state.tone}>{t(locale, state.label)}</Badge>
                  </div>

                  <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                    <Fact label="Left China" value={s.departedAt ? formatDate(s.departedAt) : "Not yet"} />
                    <Fact
                      label={s.arrivedAt ? "Arrived" : "Expected in Dar"}
                      value={s.arrivedAt ? formatDate(s.arrivedAt) : s.eta ? formatDate(s.eta) : "To be confirmed"}
                    />
                    <Fact label="Your cargo in it" value={String(s.cargo.length)} />
                    <Fact label="Your volume" value={formatCbm(s.cbm)} />
                  </dl>

                  <div className="mt-4 rounded-xl bg-surface-2 p-3">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {t(locale, "Your cargo in this shipment")}
                    </p>
                    <ul className="divide-y">
                      {s.cargo.map((c) => (
                        <li key={c.id}>
                          <Link
                            href={`/portal/cargo/${encodeURIComponent(c.reference)}`}
                            className="flex items-center justify-between gap-3 py-2 text-sm hover:text-brand"
                          >
                            <span className="min-w-0">
                              <span className="tnum font-medium">{c.reference}</span>
                              <span className="block truncate text-xs text-muted-foreground">{c.description}</span>
                            </span>
                            <span className="shrink-0 text-xs text-muted-foreground">
                              {t(locale, CUSTOMER_STATUS_WORDS[c.status])}
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="tnum mt-0.5 truncate font-medium">{value}</dd>
    </div>
  );
}
