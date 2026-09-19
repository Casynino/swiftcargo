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
 *   at port  — the ship is in and customs has the goods. The customer is told
 *              it is in clearance and that another message will follow.
 *              Never "come and collect". (lib/actions/containers.ts)
 *   cleared  — somebody said customs is done, at the port. The goods are then
 *              brought to our warehouse.
 *   warehouse— Dar books the boxes in. The storage clock starts here.
 *   ready    — the release check passes: at our warehouse, cleared, paid, no
 *              hold. Said once, whichever event completed it — clearing,
 *              checking in, or paying, in whatever order they happened.
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
 * Booked in at our Dar warehouse. Called in the check-in transaction, once per
 * consignment that moved to RECEIVED_DAR. The storage clock starts now. If
 * customs has already cleared it and the money is settled, it is ready — and
 * announceIfReady says so instead.
 */
export async function announceDarArrival(
  tx: TxClient,
  cargo: { id: string; reference: string; senderId: string; receiverId: string },
  options: { arrivedAt: Date; discrepancy?: boolean; actorId?: string | null }
) {
  if (!options.discrepancy && (await announceIfReady(tx, cargo.id, options.actorId ? { id: options.actorId } : null))) {
    return;
  }
  const row = await tx.cargo.findUnique({ where: { id: cargo.id }, select: { clearedAt: true } });
  const settings = await storageSettings(tx);
  const cleared = Boolean(row?.clearedAt);
  await notifyCustomer(
    [cargo.receiverId, cargo.senderId],
    {
      kind: "cargo.received_dar",
      title: cleared
        ? `${cargo.reference} is at our Dar warehouse`
        : `${cargo.reference} is at our Dar warehouse — clearance in progress`,
      body:
        (options.discrepancy
          ? "We are checking something on it and will be in touch. "
          : cleared
            ? "It has cleared customs and is on our floor. Once payment is confirmed it will be ready to collect — we will tell you. "
            : "Customs clearance is still in progress. It is not ready to collect yet — we will tell you when it is. ") +
        storageSentence(settings, options.arrivedAt),
      href: `/portal/cargo/${encodeURIComponent(cargo.reference)}`,
    },
    tx
  );
}

/**
 * THE SHIP IS IN: CLEARANCE, AND WHAT TO PAY.
 *
 * One message per consignment when Dar marks the container arrived at the
 * port: it is here, customs has it, it is not ready, another message follows —
 * and, when a bill is out, the invoice and the amount, because paying now is
 * what makes it ready the day clearance finishes.
 */
export async function announcePortArrival(tx: TxClient, cargoIds: string[]) {
  const rows = await tx.cargo.findMany({
    where: { id: { in: cargoIds }, deletedAt: null, status: "ARRIVED_TANZANIA" },
    select: {
      reference: true,
      senderId: true,
      receiverId: true,
      invoices: {
        where: { status: { notIn: ["DRAFT", "CANCELLED"] } },
        select: {
          number: true,
          status: true,
          total: true,
          currency: true,
          fxRate: true,
          totalTzs: true,
          payments: {
            select: { status: true, amount: true, currency: true, fxRate: true, baseCurrencyAmount: true, creditedAmount: true },
          },
        },
      },
    },
  });
  for (const cargo of rows) {
    const owed = owedAcross(cargo.invoices);
    const bill = cargo.invoices[0];
    await notifyCustomer(
      [cargo.receiverId, cargo.senderId],
      {
        kind: "cargo.arrived",
        title: `${cargo.reference} has arrived in Dar es Salaam — clearance in progress`,
        body:
          "Your goods are at Dar es Salaam port and going through customs clearance. They are not ready to collect yet — we will tell you as soon as clearance is complete." +
          (bill && owed.owes
            ? ` Invoice ${bill.number}: ${owed.primary}${owed.equivalent ? ` (${owed.equivalent})` : ""} to pay. Paying now means it is ready the day clearance finishes.`
            : bill
              ? ` Invoice ${bill.number} is paid.`
              : ""),
        href: bill ? "/portal/invoices" : `/portal/cargo/${encodeURIComponent(cargo.reference)}`,
      },
      tx
    );
  }
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
  note?: string | null,
  /* False when the caller books the goods into the warehouse straight after
     and lets that one message speak for both. */
  announce = true
): Promise<{ cleared: string[]; skipped: string[] }> {
  const rows = await tx.cargo.findMany({
    where: { id: { in: cargoIds }, deletedAt: null },
    include: { ...RELEASE_INCLUDE, darReceiving: { select: { verified: true, discrepancy: true, packagesCount: true, receivedAt: true } } },
  });
  const cleared: string[] = [];
  const skipped: string[] = [];
  const now = new Date();

  for (const cargo of rows) {
    /* Customs clears goods that have landed: at the port, or — when the
       floor booked them in first — already in our warehouse. Never at sea. */
    const eligible =
      cargo.clearedAt === null &&
      (cargo.status === "ARRIVED_TANZANIA" ||
        (cargo.darReceiving !== null &&
          !["COLLECTED", "DELIVERED", "CANCELLED", "MISSING_AT_DAR"].includes(cargo.status)));
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
    if (!announce) continue;

    if (await announceIfReady(tx, cargo.id, actor)) continue;

    const live = cargo.invoices.filter((i) => i.status !== "DRAFT" && i.status !== "CANCELLED");
    const owed = owedAcross(live);
    const atWarehouse = cargo.darReceiving !== null;
    const next = atWarehouse ? "" : "It is now being brought to our Dar warehouse. ";
    await notifyCustomer(
      [cargo.receiverId, cargo.senderId],
      {
        kind: "cargo.cleared",
        title: `${cargo.reference} has completed customs clearance`,
        body:
          next +
          (owed.owes
            ? `Payment is still required before pickup: ${owed.primary}${owed.equivalent ? ` (${owed.equivalent})` : ""}. We will tell you when it is ready to collect.`
            : live.length === 0
              ? "Your invoice is being prepared. We will tell you when it is ready to collect."
              : "We will tell you as soon as it is ready to collect."),
        href: live.length > 0 ? "/portal/invoices" : `/portal/cargo/${encodeURIComponent(cargo.reference)}`,
      },
      tx
    );
  }
  return { cleared, skipped };
}
