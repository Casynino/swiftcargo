import "server-only";

import { formatDate } from "@/lib/format";
import { notifyCustomer } from "@/lib/notify";
import { prisma } from "@/lib/prisma";
import { storageStart, storageState } from "@/lib/storage-clock";

/**
 * TELL CUSTOMERS WHOSE FREE STORAGE HAS RUN OUT — ONCE.
 *
 * Run daily. Every consignment still on the Dar floor whose free days are
 * over, and whose customer has not been told, is told: the free period ended,
 * and the daily fee when one is configured (a fee nobody set is never quoted).
 * storageNoticeAt is claimed before the message is written, so two runs at
 * once cannot tell anybody twice.
 */
export async function sendStorageNotices(now = new Date()) {
  const settings = await prisma.companySetting.findUnique({
    where: { id: "singleton" },
    select: { freeStorageDays: true, storagePerDay: true, storageCurrency: true },
  });
  const freeDays = settings?.freeStorageDays ?? 7;
  /* A generous cut: the exact Dar-calendar test is made per row below. */
  const before = new Date(now.getTime() - (freeDays - 1) * 86_400_000);

  const candidates = await prisma.cargo.findMany({
    where: {
      deletedAt: null,
      storageNoticeAt: null,
      status: { notIn: ["COLLECTED", "DELIVERED", "CANCELLED", "MISSING_AT_DAR"] },
      darReceiving: { isNot: null },
      /* The clock starts once cleared into our warehouse. */
      clearedAt: { lte: before },
    },
    select: {
      id: true,
      reference: true,
      senderId: true,
      receiverId: true,
      clearedAt: true,
      darReceiving: { select: { receivedAt: true } },
    },
    take: 500,
  });

  let told = 0;
  for (const cargo of candidates) {
    const start = storageStart(cargo.darReceiving?.receivedAt, cargo.clearedAt);
    if (!start) continue;
    const clock = storageState({
      arrivedAt: start,
      freeDays,
      perDay: settings?.storagePerDay ?? null,
      currency: settings?.storageCurrency ?? "USD",
      now,
    });
    if (!clock.expired) continue;

    await prisma.$transaction(async (tx) => {
      const claim = await tx.cargo.updateMany({
        where: { id: cargo.id, storageNoticeAt: null },
        data: { storageNoticeAt: now },
      });
      if (claim.count === 0) return;
      await notifyCustomer(
        [cargo.receiverId, cargo.senderId],
        {
          kind: "storage.expired",
          title: `Free storage has ended for ${cargo.reference}`,
          body:
            `The ${clock.freeDays} free days ended on ${formatDate(clock.lastFreeDay)}. ` +
            (clock.perDay
              ? `Storage is now ${clock.currency} ${clock.perDay} a day until it is collected.`
              : "Storage charges may now apply."),
          href: `/portal/cargo/${encodeURIComponent(cargo.reference)}`,
        },
        tx
      );
      told++;
    });
  }
  return { checked: candidates.length, told };
}
