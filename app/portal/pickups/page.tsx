import Link from "next/link";
import type { Metadata } from "next";
import { QrCode, Truck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { formatDate } from "@/lib/format";
import { DEFAULT_LOCALE, t } from "@/lib/i18n";
import { mine } from "@/lib/portal";
import { prisma } from "@/lib/prisma";
import { requireCustomer } from "@/lib/session";

export const metadata: Metadata = { title: "My pickups" };

/**
 * Collecting from the Dar warehouse: what is ready now, and every pickup note
 * the customer has been given. The note is the permission to collect — its
 * code is what the counter scans — so it opens full size from here.
 */
export default async function PickupsPage() {
  const locale = DEFAULT_LOCALE;
  const user = await requireCustomer();

  const [ready, notes] = await Promise.all([
    prisma.cargo.findMany({
      where: { ...mine(user.customerId), receiverId: user.customerId, status: "READY_FOR_RELEASE" },
      orderBy: { updatedAt: "desc" },
      select: { id: true, reference: true, description: true, pickupNote: { select: { id: true, status: true } } },
    }),
    prisma.pickupNote.findMany({
      where: { customerId: user.customerId },
      orderBy: { issuedAt: "desc" },
      take: 50,
      select: {
        id: true,
        noteNumber: true,
        status: true,
        issuedAt: true,
        usedAt: true,
        onCredit: true,
        cargo: { select: { reference: true, description: true } },
      },
    }),
  ]);

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">{t(locale, "My pickups")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t(locale, "Collecting your cargo from our Dar es Salaam warehouse.")}
        </p>
      </header>

      <section>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          {t(locale, "Ready for pickup")}
        </h2>
        {ready.length === 0 ? (
          <Card className="flex items-center gap-3 p-4 text-sm text-muted-foreground">
            <Truck className="size-5 shrink-0" />
            {t(locale, "Nothing is waiting for you to collect right now.")}
          </Card>
        ) : (
          <Card className="divide-y">
            {ready.map((c) => (
              <div key={c.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <Link href={`/portal/cargo/${encodeURIComponent(c.reference)}`} className="min-w-0 hover:text-brand">
                  <p className="tnum font-semibold">{c.reference}</p>
                  <p className="truncate text-xs text-muted-foreground">{c.description}</p>
                </Link>
                {c.pickupNote && c.pickupNote.status === "ACTIVE" ? (
                  <Link
                    href={`/portal/pickups/${c.pickupNote.id}`}
                    className="inline-flex items-center gap-1.5 rounded-full bg-brand px-3 py-1.5 text-xs font-semibold text-brand-foreground"
                  >
                    <QrCode className="size-3.5" />
                    {t(locale, "Show pickup note")}
                  </Link>
                ) : (
                  <Badge tone="good">{t(locale, "Ready for pickup")}</Badge>
                )}
              </div>
            ))}
          </Card>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          {t(locale, "Pickup notes")}
        </h2>
        {notes.length === 0 ? (
          <Card className="flex items-center gap-3 p-4 text-sm text-muted-foreground">
            <QrCode className="size-5 shrink-0" />
            {t(locale, "A pickup note is issued once your invoice is paid. It appears here, with the code the warehouse scans.")}
          </Card>
        ) : (
          <Card className="divide-y">
            {notes.map((n) => (
              <Link
                key={n.id}
                href={`/portal/pickups/${n.id}`}
                className="flex flex-wrap items-center justify-between gap-3 p-4 transition-colors hover:bg-secondary/50"
              >
                <div className="min-w-0">
                  <p className="tnum font-semibold">{n.noteNumber}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {n.cargo.reference} · {n.cargo.description}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t(locale, "Issued")} {formatDate(n.issuedAt)}
                    {n.usedAt ? ` · ${t(locale, "collected")} ${formatDate(n.usedAt)}` : ""}
                  </p>
                </div>
                <Badge tone={n.status === "ACTIVE" ? "good" : n.status === "USED" ? "neutral" : "bad"}>
                  {t(locale, n.status === "ACTIVE" ? "Ready to use" : n.status === "USED" ? "Collected" : "Withdrawn")}
                </Badge>
              </Link>
            ))}
          </Card>
        )}
      </section>
    </div>
  );
}
