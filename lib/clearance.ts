import "server-only";

import { recordAudit } from "@/lib/audit";
import { setCargoStatus } from "@/lib/cargo";
import { formatDate } from "@/lib/format";
import { owedAcross } from "@/lib/invoice-balance";
import { notifyCustomer } from "@/lib/notify";
import type { TxClient } from "@/lib/prisma";
import { RELEASE_INCLUDE, checkRelease } from "@/lib/release";
import type { SessionUser } from "@/lib/session";
import { storageState } from "@/lib/storage-clock";

/**
 * ARRIVED ≠ CLEARED ≠ READY.
 *
 * Three different facts about a consignment in Dar, recorded by three different
 * events, and each one tells the customer something different:
 *
 *   arrived  — Dar booked the boxes in. Clearance begins and so does the
 *              storage clock. The customer is told it is here and in clearance,
 *              and that another message will follow. Never "come and collect".
 *   cleared  — somebody said customs is done. If the money is settled the
 *              consignment becomes ready; if not, the customer is told payment
 *              is what stands between them and their goods.
 *   ready    — the release check passes. Said once, whichever event completed
 *              it: clearing after paying, or paying after clearing.
 *
 * Money is not part of the physical chain. Finance prices and bills whenever it
 * likes, and a payment never moves boxes; it only ever completes readiness for
 * boxes that are already cleared.
 */

export type StorageSettings = {
  freeStorageDays: number;
  storagePerDay: { toString(): string };
  storageCurrency: string;
};

export async function storageSettings(tx: TxClient): Promise<StorageSettings> {
  const row = await tx.companySetting.findUnique({
    where: { id: "singleton" },
    select: { freeStorageDays: true, storagePerDay: true, storageCurrency: true },
  });
  return row ?? { freeStorageDays: 7, storagePerDay: 0, storageCurrency: "USD" };
}

function storageSentence(settings: StorageSettings, arrivedAt: Date) {
  const clock = storageState({
    arrivedAt,
    freeDays: settings.freeStorageDays,
    perDay: settings.storagePerDay,
    currency: settings.storageCurrency,
    now: arrivedAt,
  });
  const fee = clock.perDay
    ? ` After that, storage is ${clock.currency} ${clock.perDay} a day until it is collected.`
    : "";
  return `Storage: ${clock.freeDays} days free from today, until ${formatDate(clock.lastFreeDay)}.${fee}`;
}

/**
 * The first word from Dar. Called in the check-in transaction, once per
 * consignment that moved to RECEIVED_DAR.
 */
export async function announceDarArrival(
  tx: TxClient,
  cargo: { reference: string; senderId: string; receiverId: string },
  options: { arrivedAt: Date; discrepancy?: boolean }
) {
  const settings = await storageSettings(tx);
  await notifyCustomer(
    [cargo.receiverId, cargo.senderId],
    {
      kind: "cargo.received_dar",
      title: `${cargo.reference} arrived in Dar — clearance in progress`,
      body:
        (options.discrepancy
          ? "It is at our Dar warehouse and in customs clearance. We are also checking something on it and will be in touch. "
          : "It is at our Dar warehouse and in customs clearance. It is not ready to collect yet — we will tell you as soon as clearance is complete. ") +
        storageSentence(settings, options.arrivedAt),
      href: `/portal/cargo/${encodeURIComponent(cargo.reference)}`,
    },
    tx
  );
}

/**
 * READY, SAID ONCE.
 *
 * Runs the release check on a cleared consignment and, the first time it
 * passes, moves it to READY_FOR_RELEASE and tells the customer. Anything that
 * might have completed readiness — clearing, a payment verified, a pickup note
 * written — calls this; readyNotifiedAt is what stops the second call from
 * telling them twice.
 */
export async function announceIfReady(
  tx: TxClient,
  cargoId: string,
  actor: Pick<SessionUser, "id"> | null
): Promise<boolean> {
  const cargo = await tx.cargo.findFirst({
    where: { id: cargoId, deletedAt: null },
    include: RELEASE_INCLUDE,
  });
  if (!cargo || !cargo.clearedAt || cargo.readyNotifiedAt) return false;
  if (!checkRelease(cargo).ok) return false;

  const claimed = await tx.cargo.updateMany({
    where: { id: cargoId, readyNotifiedAt: null },
    data: { readyNotifiedAt: new Date() },
  });
  if (claimed.count === 0) return false;

  await setCargoStatus(tx, cargoId, "READY_FOR_RELEASE", actor, "Cleared, paid and released for pickup");
  const note = cargo.pickupNote?.noteNumber;
  await notifyCustomer(
    [cargo.receiverId, cargo.senderId],
    {
      kind: "cargo.ready",
      title: `${cargo.reference} is ready for pickup`,
      body:
        `Cleared and paid. Collect it at our Dar es Salaam warehouse` +
        (note ? ` — show pickup note ${note} and your ID.` : " with your ID."),
      href: `/portal/cargo/${encodeURIComponent(cargo.reference)}`,
    },
    tx
  );
  return true;
}

/**
 * CLEARANCE COMPLETE.
 *
 * Records who and when, then either announces ready or — when money still
 * stands in the way — tells the customer that, with what is owed. A consignment
 * not yet booked in at Dar, already cleared, or already gone is skipped: the
 * button cannot clear goods that are still at sea.
 */
export async function clearCargo(
  tx: TxClient,
  cargoIds: string[],
  actor: SessionUser,
  note?: string | null
): Promise<{ cleared: string[]; skipped: string[] }> {
  const rows = await tx.cargo.findMany({
    where: { id: { in: cargoIds }, deletedAt: null },
    include: { ...RELEASE_INCLUDE, darReceiving: { select: { verified: true, discrepancy: true, packagesCount: true, receivedAt: true } } },
  });
  const cleared: string[] = [];
  const skipped: string[] = [];
  const now = new Date();

  for (const cargo of rows) {
    const eligible =
      cargo.darReceiving !== null &&
      cargo.clearedAt === null &&
      !["COLLECTED", "DELIVERED", "CANCELLED", "MISSING_AT_DAR"].includes(cargo.status);
    if (!eligible) {
      skipped.push(cargo.reference);
      continue;
    }
    const claim = await tx.cargo.updateMany({
      where: { id: cargo.id, clearedAt: null },
      data: { clearedAt: now, clearedById: actor.id },
    });
    if (claim.count === 0) {
      skipped.push(cargo.reference);
      continue;
    }
    await tx.fieldChange.create({
      data: {
        entity: "Cargo",
        entityId: cargo.id,
        field: "clearance",
        oldValue: "In clearance",
        newValue: "Cleared",
        reason: note?.trim() || null,
        actorId: actor.id,
      },
    });
    await recordAudit(
      {
        actor,
        action: "cargo.clear",
        entity: "Cargo",
        entityId: cargo.id,
        summary: `Cleared ${cargo.reference}${note?.trim() ? ` — ${note.trim()}` : ""}`,
        metadata: { from: "IN_CLEARANCE", to: "CLEARED", department: actor.department ?? null },
      },
      tx
    );
    cleared.push(cargo.reference);

    if (await announceIfReady(tx, cargo.id, actor)) continue;

    const live = cargo.invoices.filter((i) => i.status !== "DRAFT" && i.status !== "CANCELLED");
    const owed = owedAcross(live);
    await notifyCustomer(
      [cargo.receiverId, cargo.senderId],
      {
        kind: "cargo.cleared",
        title: `${cargo.reference} has completed clearance`,
        body: owed.owes
          ? `Payment is still required before pickup: ${owed.primary}${owed.equivalent ? ` (${owed.equivalent})` : ""}. Once your payment is confirmed it will be ready to collect.`
          : live.length === 0
            ? "Your invoice is being prepared. We will tell you when it is ready to collect."
            : "We are preparing your pickup note and will tell you when it is ready to collect.",
        href: live.length > 0 ? "/portal/invoices" : `/portal/cargo/${encodeURIComponent(cargo.reference)}`,
      },
      tx
    );
  }
  return { cleared, skipped };
}
