import "server-only";

import { revalidatePath } from "next/cache";

import { recordAudit } from "@/lib/audit";
import { announceDarArrival } from "@/lib/clearance";
import { priceOnCheckIn } from "@/lib/price-confirmation";
import { prisma } from "@/lib/prisma";
import type { SessionUser } from "@/lib/session";

type ActionState = { error?: string; ok?: string };

/**
 * PRESENT AND CORRECT, IN ONE PRESS — the work behind it, for whichever
 * caller has already been authorised.
 *
 * Two callers: the Dar floor's own "accept as expected" (receiving.dar), and
 * clearance, which books in whatever the floor has not yet checked in as
 * China sent it (cargo.clear). Kept out of the "use server" file because an
 * export there is a public endpoint, and this one must only ever run behind
 * one of those two checks.
 */
export async function acceptAsExpectedBy(
  actor: SessionUser,
  cargoIds: string[]
): Promise<ActionState> {
  if (cargoIds.length === 0) return { error: "Nothing was picked." };

  const warehouse =
    (actor.warehouseId
      ? await prisma.warehouse.findFirst({
          where: { id: actor.warehouseId, active: true, kind: "TANZANIA" },
          select: { id: true },
        })
      : null) ??
    (await prisma.warehouse.findFirst({
      where: { active: true, kind: "TANZANIA" },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    }));
  if (!warehouse) {
    return {
      error: "No Dar warehouse is set up to receive into. Ask an administrator.",
    };
  }

  const cargo = await prisma.cargo.findMany({
    where: { id: { in: cargoIds }, deletedAt: null, darReceiving: null },
    include: {
      chinaReceiving: true,
      containerLines: { include: { container: true } },
    },
  });

  let accepted = 0;
  const checkedIn: string[] = [];
  const skipped: string[] = [];
  const notLanded: string[] = [];

  for (const item of cargo) {
    /* "As sent" is a statement about boxes on the Dar floor. A consignment
       whose container has not been recorded as arrived is not in front of
       the clerk, and one reported missing that turns up is counted on the
       scales, not waved through. */
    if (item.status !== "ARRIVED_TANZANIA") {
      notLanded.push(item.reference);
      continue;
    }
    const china = item.chinaReceiving;
    if (!china) {
      skipped.push(item.reference);
      continue;
    }

    const took = await prisma.$transaction(async (tx) => {
      /* The status is claimed, not assumed: two clerks ticking the same row
         must not both write a receiving record. */
      const claim = await tx.cargo.updateMany({
        where: { id: item.id, status: "ARRIVED_TANZANIA" },
        data: { status: "RECEIVED_DAR" },
      });
      if (claim.count === 0) return false;

      await tx.darReceiving.create({
        data: {
          cargoId: item.id,
          warehouseId: warehouse.id,
          containerId: item.containerLines.at(-1)?.containerId ?? null,
          packagesCount: china.packagesCount,
          piecesCount: china.piecesCount,
          weightKg: china.weightKg,
          cbm: china.cbm,
          condition: "GOOD",
          discrepancy: false,
          receivedById: actor.id,
          /* Signed off in the same breath. The clerk looked at the boxes and
             said they match; asking them to tick a second time on the same row
             is ceremony, and ceremony is what gets skipped. */
          verified: true,
          verifiedAt: new Date(),
        },
      });

      await tx.cargoStatusHistory.create({
        data: {
          cargoId: item.id,
          from: item.status,
          to: "RECEIVED_DAR",
          actorId: actor.id,
          reason: "Checked in at Dar as sent",
        },
      });

      /* The same message the scales form sends, so a customer is told their
         goods reached Dar however the clerk checked them in. */
      await announceDarArrival(tx, item, { arrivedAt: new Date(), actorId: actor.id });
      return true;
    });
    if (took) {
      accepted++;
      checkedIn.push(item.id);
    }
  }

  await priceOnCheckIn(actor, checkedIn);

  await recordAudit({
    actor,
    action: "cargo.receive.dar",
    entity: "Cargo",
    entityId: cargo[0]?.id ?? "",
    summary: `Checked in ${accepted} consignment(s) at Dar as sent`,
  });

  revalidatePath("/app/receive/dar");
  revalidatePath("/app/inventory");

  if (accepted === 0) {
    return {
      error: skipped.length
        ? `Nothing was checked in — ${skipped.join(", ")} has no Guangzhou count to agree with. Use the scales to enter what is there.`
        : notLanded.length
          ? `Nothing was checked in — ${notLanded.join(", ")} is not on an arrived container.`
          : "Nothing was checked in.",
    };
  }
  return {
    ok: [
      `${accepted} checked in.`,
      skipped.length ? `${skipped.join(", ")} needs counting by hand.` : "",
      notLanded.length ? `${notLanded.join(", ")} is not on an arrived container.` : "",
    ]
      .filter(Boolean)
      .join(" "),
  };
}
