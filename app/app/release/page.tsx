import Link from "next/link";
import type { Metadata } from "next";
import { AlertTriangle, Boxes, Hourglass, PackageCheck, Truck } from "lucide-react";

import { EmptyState } from "@/components/app/empty-state";
import { KpiCard } from "@/components/app/kpi-card";
import { PageHeader } from "@/components/app/page-header";
import { SectionTabs } from "@/components/app/section-tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatMoney } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { checkRelease, RELEASE_INCLUDE } from "@/lib/release";
import { requirePermission } from "@/lib/session";
import { companySettings } from "@/lib/pricing";
import { storageStart } from "@/lib/storage-clock";
import { storagePosition } from "@/lib/storage-fee";

import { primeLocale, T } from "@/lib/server-t";
export const metadata: Metadata = { title: "Pickup list" };

const DAY_MS = 86_400_000;

/** "4h", "3d", "3d 5h" — computed here, not on the client, so nothing can
    disagree with what was actually sent down. */
function waitLabel(ms: number): string {
  const hours = Math.floor(ms / 3_600_000);
  if (hours < 1) return "just now";
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  const rest = hours % 24;
  return rest > 0 ? `${days}d ${rest}h` : `${days}d`;
}

/**
 * WHO MAY COLLECT TODAY.
 *
 * One row per live pickup note — Finance has already answered the money
 * question by issuing it, so what is left is the warehouse's own: are all the
 * boxes actually on the floor. Every row carries the same check the counter
 * runs when the box is actually scanned (`lib/release.ts#checkRelease`), so
 * discovering a shortage here is a phone call and discovering it with the
 * customer standing at the desk is a claim.
 *
 * "Release" does not hand anything over from this screen — it opens
 * `/app/scan`, the same door a camera read walks through, because the boxes
 * are not in front of this screen and a handover without a box in the
 * clerk's hand is exactly the wrong habit to build.
 */
export default async function ReleasePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  await primeLocale();
  const user = await requirePermission("release.execute");
  const { q } = await searchParams;
  const query = q?.trim() ?? "";
  const showMoney = can(user.role, "finance.view");
  const now = new Date();

  const notes = await prisma.pickupNote.findMany({
    where: {
      status: "ACTIVE",
      cargo: { deletedAt: null },
      ...(query
        ? {
            OR: [
              { noteNumber: { contains: query, mode: "insensitive" as const } },
              { cargo: { reference: { contains: query, mode: "insensitive" as const } } },
              { customer: { fullName: { contains: query, mode: "insensitive" as const } } },
              { customer: { phone: { contains: query } } },
            ],
          }
        : {}),
    },
    orderBy: { issuedAt: "asc" },
    take: 100,
    include: {
      customer: { select: { fullName: true, phone: true } },
      cargo: {
        include: {
          ...RELEASE_INCLUDE,
          receiver: { select: { fullName: true, phone: true } },
          /* The storage clock's own start — see lib/storage-clock.ts. Not
             part of RELEASE_INCLUDE, which carries only what the release
             decision itself needs. */
          darReceiving: { select: { verified: true, discrepancy: true, packagesCount: true, receivedAt: true } },
        },
      },
    },
  });

  /* Storage — days AND money both — is read only for a viewer who holds
     finance.view, the same gate lib/storage-card.tsx uses on the cargo page.
     Not computed at all otherwise: the boundary is enforced by never touching
     the figures, not by hiding a card built from them. */
  const settings = showMoney ? await companySettings() : null;
  const boxRows = notes.length
    ? await prisma.cargoBox.groupBy({
        by: ["cargoId"],
        where: { cargoId: { in: notes.map((n) => n.cargoId) }, voidedAt: null },
        _count: { _all: true, collectedAt: true },
      })
    : [];
  const boxesOf = new Map(boxRows.map((r) => [r.cargoId, { done: r._count.collectedAt, total: r._count._all }]));

  const rows = notes.map((note) => {
    const cargo = note.cargo;
    const check = checkRelease(cargo);
    const boxes = boxesOf.get(cargo.id) ?? { done: 0, total: 0 };
    const waitingMs = Math.max(0, now.getTime() - note.issuedAt.getTime());

    const storageDays = settings
      ? storagePosition({
          receivedAt: storageStart(cargo.darReceiving?.receivedAt ?? null, cargo.clearedAt),
          collectedAt: null,
          freeDays: settings.freeStorageDays ?? 7,
          perDay: settings.storagePerDay ?? 0,
          currency: settings.storageCurrency ?? "USD",
        }).chargeableDays
      : 0;

    return {
      storageDays,
      id: note.id,
      noteNumber: note.noteNumber,
      customerName: note.customer.fullName,
      customerPhone: note.customer.phone,
      cargoId: cargo.id,
      reference: cargo.reference,
      packages: boxes.total || cargo.darReceiving?.packagesCount || 0,
      boxesDone: boxes.done,
      boxesTotal: boxes.total,
      waitingMs,
      waitingLabel: waitLabel(waitingMs),
      onCredit: note.onCredit,
      amountPaid: note.amountPaid,
      currency: note.currency,
      check,
      ready: check.ok,
    };
  });

  const ready = rows.filter((r) => r.ready).length;
  const held = rows.length - ready;
  const boxesWaiting = rows.reduce((sum, r) => sum + r.packages, 0);
  const longestWait = rows.reduce((max, r) => Math.max(max, r.waitingMs), 0);
  const overAWeek = rows.filter((r) => r.waitingMs >= 7 * DAY_MS).length;
  const charging = rows.filter((r) => r.storageDays > 0).length;
  /* The floor's own fifth fact, in place of storage: how much scanning is
     still ahead of it — a box not yet read out is a box not yet handed over,
     whatever the paperwork says. */
  const notScanned = rows.reduce((sum, r) => sum + Math.max(0, r.boxesTotal - r.boxesDone), 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title={T("Pickup list")}
        description={T(
          "Cargo Finance has cleared for collection. Open a row to release it — the pickup note itself is issued and cancelled by Finance."
        )}
      />
      <SectionTabs />

      <form className="max-w-md">
        <Input
          name="q"
          defaultValue={query}
          placeholder={T("Customer, phone, tracking or pickup note")}
          aria-label={T("Find a pickup")}
        />
      </form>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <KpiCard
          index={0}
          label={T("Awaiting collection")}
          numeric={rows.length}
          hint={longestWait > 0 ? `${T("Longest wait")} ${waitLabel(longestWait)}` : T("Nobody waiting")}
          icon={Truck}
          tone="brand"
        />
        <KpiCard
          index={1}
          label={T("Ready to release")}
          numeric={ready}
          hint={T("Every package accounted for")}
          icon={PackageCheck}
          tone="success"
          ring={{ value: ready, total: rows.length }}
        />
        <KpiCard
          index={2}
          label={T("Held back")}
          numeric={held}
          hint={held > 0 ? T("Cannot be handed over yet") : T("Nothing blocked")}
          icon={AlertTriangle}
          tone={held > 0 ? "danger" : "success"}
        />
        <KpiCard
          index={3}
          label={T("Boxes on the floor")}
          numeric={boxesWaiting}
          hint={T("Packages held for these customers")}
          icon={Boxes}
          tone="marine"
        />
        {showMoney ? (
          <KpiCard
            index={4}
            label={T("Storage accruing")}
            numeric={charging}
            hint={overAWeek > 0 ? `${overAWeek} ${T("waiting over a week")}` : T("Everyone still inside free storage")}
            icon={Hourglass}
            tone={charging > 0 ? "warning" : "success"}
          />
        ) : (
          <KpiCard
            index={4}
            label={T("Boxes not yet scanned")}
            numeric={notScanned}
            hint={notScanned > 0 ? T("Still to be read out at the counter") : T("Every ready box has been scanned")}
            icon={Hourglass}
            tone={notScanned > 0 ? "warning" : "success"}
          />
        )}
      </div>

      {rows.length === 0 ? (
        <Card>
          <EmptyState
            icon="DoorOpen"
            title={T("Nobody is waiting to collect")}
            description={T("Cargo joins this list the moment Finance confirms payment and issues its pickup note.")}
          />
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{T("Customer")}</TableHead>
                <TableHead>{T("Tracking")}</TableHead>
                <TableHead className="text-right">{T("Pkgs")}</TableHead>
                <TableHead>{T("Waiting")}</TableHead>
                {showMoney ? <TableHead className="text-right">{T("Settled")}</TableHead> : null}
                <TableHead>{T("Status")}</TableHead>
                <TableHead className="w-8" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="text-sm font-semibold">
                    {row.customerName}
                    <span className="tnum block text-xs font-normal text-muted-foreground">
                      {row.customerPhone}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Link
                      href={`/app/cargo/${row.cargoId}`}
                      className="tnum font-medium tracking-wide hover:underline"
                    >
                      {row.reference}
                    </Link>
                    <span className="tnum block text-xs text-muted-foreground">
                      {row.noteNumber}
                    </span>
                  </TableCell>
                  <TableCell className="tnum text-right text-sm">{row.packages || "—"}</TableCell>
                  <TableCell
                    className={
                      row.waitingMs >= 7 * DAY_MS
                        ? "tnum text-sm font-medium text-destructive"
                        : row.waitingMs >= 2 * DAY_MS
                          ? "tnum text-sm font-medium text-warning"
                          : "tnum text-sm text-muted-foreground"
                    }
                  >
                    {row.waitingLabel}
                  </TableCell>
                  {showMoney ? (
                    <TableCell className="tnum text-right text-sm">
                      {formatMoney(row.amountPaid, row.currency)}
                      {row.onCredit ? (
                        <span className="block text-xs text-warning">{T("on credit")}</span>
                      ) : null}
                    </TableCell>
                  ) : null}
                  <TableCell>
                    {row.ready ? (
                      <Badge tone="good">{T("cleared")}</Badge>
                    ) : (
                      <Badge tone="warn" title={row.check.blockedBy ?? undefined}>
                        {T("held")}
                      </Badge>
                    )}
                    {!row.ready && row.check.blockedBy ? (
                      <span className="mt-0.5 block max-w-xs truncate text-xs text-muted-foreground">
                        {row.check.blockedBy}
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <Button asChild size="sm">
                      <Link href={`/app/scan?code=${encodeURIComponent(row.reference)}`}>
                        {T("Release")}
                      </Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
