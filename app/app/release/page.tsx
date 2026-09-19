import Link from "next/link";
import type { Metadata } from "next";

import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { SectionTabs } from "@/components/app/section-tabs";
import { ReleaseForm } from "@/components/app/release-panel";
import { BoxScanner } from "@/components/app/box-scanner";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { prisma } from "@/lib/prisma";
import { checkRelease, RELEASE_INCLUDE } from "@/lib/release";
import { requirePermission } from "@/lib/session";

import { primeLocale, T } from "@/lib/server-t";
export const metadata: Metadata = { title: "Pickup list" };

/**
 * THE COUNTER, AND ONLY WHAT MAY LEAVE IT.
 *
 * Cleared consignments only. The page once listed the blocked ones too, with a
 * checklist of what each was missing — which meant the floor read five reasons
 * for every one thing it could actually hand over, and the money owed was
 * printed on a screen the warehouse is deliberately kept away from.
 *
 * Why a consignment is not here is a question for its own page, where the
 * timeline and the case live. This list answers one question: who is standing
 * at the counter, and may they take their goods.
 *
 * The exception is a search. Somebody typed a name because that person is in
 * front of them, and an empty list in answer teaches the counter nothing — so a
 * search that matches blocked cargo says which consignment and what is missing,
 * in the words lib/release.ts uses, which carry no figure. The alternative is a
 * clerk ringing Finance, or releasing on a customer's word.
 *
 * Clearance is computed on every read — verified, invoiced, paid, no case, no
 * hold. Nothing on this screen can grant it.
 */
export default async function ReleasePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  await primeLocale();
  await requirePermission("release.execute");
  const { q } = await searchParams;
  const query = q?.trim() ?? "";

  const cargo = await prisma.cargo.findMany({
    where: {
      deletedAt: null,
      status: { in: ["RECEIVED_DAR", "READY_FOR_RELEASE"] },
      ...(query
        ? {
            OR: [
              { reference: { contains: query, mode: "insensitive" as const } },
              { shippingMark: { contains: query, mode: "insensitive" as const } },
              {
                receiver: {
                  OR: [
                    { fullName: { contains: query, mode: "insensitive" as const } },
                    { phone: { contains: query } },
                  ],
                },
              },
            ],
          }
        : {}),
    },
    orderBy: { updatedAt: "asc" },
    take: 60,
    include: {
      ...RELEASE_INCLUDE,
      receiver: { select: { fullName: true, phone: true } },
      sender: { select: { fullName: true } },
    },
  });

  const checked = cargo.map((item) => ({ item, check: checkRelease(item) }));

  /* How far each cleared consignment's boxes have been scanned out. */
  const boxRows = await prisma.cargoBox.groupBy({
    by: ["cargoId"],
    where: { cargoId: { in: cargo.map((c) => c.id) }, voidedAt: null },
    _count: { _all: true, collectedAt: true },
  });
  const boxesOf = new Map(boxRows.map((r) => [r.cargoId, { done: r._count.collectedAt, total: r._count._all }]));
  const ready = checked.filter((c) => c.check.ok);
  const held = query ? checked.filter((c) => !c.check.ok) : [];

  return (
    <div className="space-y-6">
      {/*
        THE PICKUP LIST, NOT "RELEASE".

        The word on the counter is pickup: a customer rings to ask whether their
        goods are ready to collect, and this is the list that answers. The screen
        is named after the question rather than after the database operation.

        What may go is computed, never asserted — verified, invoiced, paid, no
        case and no hold. Nobody here can overrule it; settling what is missing
        is what clears it.
      */}
      <PageHeader
        title={T("Pickup list")}
        description={T("Customers who have paid and whose cargo is cleared to collect. Open a row to hand it over.")}
      />
      <SectionTabs />

      <form className="max-w-md">
        <Input
          name="q"
          defaultValue={query}
          placeholder={T("Reference, mark, customer or phone…")}
          aria-label={T("Find cargo")}
        />
      </form>

      <section className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Ready to collect ({ready.length})
        </h2>
        {ready.length === 0 ? (
          <Card>
            <EmptyState
              icon="DoorOpen"
              title={T("Nobody is waiting to collect")}
              description={T("Cargo joins this list the moment it is verified, invoiced and paid in full.")}
            />
          </Card>
        ) : (
          ready.map(({ item }) => (
            <Card key={item.id}>
              <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
                {/* The person at the counter leads. A pickup list is read by
                    somebody looking for a name, and the tracking number is what
                    confirms it once they have found them. */}
                <div>
                  <CardTitle className="text-base">
                    {item.receiver.fullName}
                  </CardTitle>
                  <p className="mt-1 text-sm text-muted-foreground">
                    <span className="tnum">{item.receiver.phone}</span>
                    {" · "}
                    <Link
                      href={`/app/cargo/${item.id}`}
                      className="tnum hover:underline"
                    >
                      {item.reference}
                    </Link>
                    {item.receiverId !== item.senderId
                      ? ` · sent by ${item.sender.fullName}`
                      : ""}
                  </p>
                </div>
                {/* The paper the customer is holding, so the counter can match
                    one against the other before anything moves. */}
                <div className="flex items-center gap-2">
                  {item.pickupNote?.noteNumber ? (
                    <span className="tnum text-xs text-muted-foreground">
                      {item.pickupNote.noteNumber}
                    </span>
                  ) : null}
                  <Badge tone="good">cleared</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Every box goes out under its own scan; the handover is
                    completed once they all have. */}
                {boxesOf.get(item.id)?.total ? (
                  <BoxScanner mode="release" cargoId={item.id} initial={boxesOf.get(item.id)} />
                ) : null}
                <ReleaseForm
                  cargoId={item.id}
                  packages={boxesOf.get(item.id)?.total || item.darReceiving?.packagesCount || 1}
                  receiverName={item.receiver.fullName}
                  receiverPhone={item.receiver.phone}
                />
              </CardContent>
            </Card>
          ))
        )}
      </section>

      {/* Only ever in answer to a search: the customer is at the counter and
          the clerk needs a sentence to give them. */}
      {held.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Found, but not cleared ({held.length})
          </h2>
          <Card>
            <CardContent className="space-y-2 pt-6">
              {held.map(({ item, check }) => (
                <div
                  key={item.id}
                  className="flex flex-wrap items-start justify-between gap-3 rounded-lg border px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{item.receiver.fullName}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      <Link
                        href={`/app/cargo/${item.id}`}
                        className="tnum hover:underline"
                      >
                        {item.reference}
                      </Link>
                      {" · "}
                      {check.blockedBy}
                    </p>
                  </div>
                  <Badge tone="warn">not cleared</Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        </section>
      ) : null}
    </div>
  );
}
