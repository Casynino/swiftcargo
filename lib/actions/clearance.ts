"use server";

import { revalidatePath } from "next/cache";

import { announceDarArrival, clearCargo } from "@/lib/clearance";
import { notifyStaff, staffInDepartment } from "@/lib/notify";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { formMessage } from "@/lib/safe-error";
import { authorize, type SessionUser } from "@/lib/session";

export type ClearanceState = { error?: string; ok?: string };

const GONE = ["COLLECTED", "DELIVERED", "CANCELLED", "MISSING_AT_DAR"] as const;

/**
 * CLEARED STARTS STORAGE; CHECK-IN VERIFIES.
 *
 * By the owner's decision clearing is when the goods enter the Dar warehouse's
 * flow and the free storage days begin (lib/storage-clock.ts). Checking them in
 * is the Dar warehouse's internal verification, done after — it never moves the
 * storage date and is never a stage the customer sees. So clearing tells the
 * customers as before and asks the Dar warehouse to verify and check the goods
 * in.
 */
async function clear(actor: SessionUser, cargoIds: string[], note: string) {
  const before = await prisma.cargo.findMany({
    where: { id: { in: cargoIds } },
    select: { id: true, darReceiving: { select: { id: true } } },
  });
  const onFloor = new Set(before.filter((c) => c.darReceiving).map((c) => c.id));
  const atPortIds = cargoIds.filter((id) => !onFloor.has(id));
  const floorIds = cargoIds.filter((id) => onFloor.has(id));

  const { atPort, alreadyIn } = await prisma.$transaction(
    async (tx) => ({
      /* At the port: the clearance letter says they are on the way. */
      atPort: atPortIds.length
        ? await clearCargo(tx, atPortIds, actor, note, true)
        : { cleared: [] as string[], skipped: [] as string[] },
      /* On our floor already: the arrival letter below speaks for both. */
      alreadyIn: floorIds.length
        ? await clearCargo(tx, floorIds, actor, note, false)
        : { cleared: [] as string[], skipped: [] as string[] },
    }),
    { timeout: 60_000 }
  );

  if (alreadyIn.cleared.length > 0) {
    const rows = await prisma.cargo.findMany({
      where: { id: { in: floorIds }, reference: { in: alreadyIn.cleared } },
      select: { id: true, reference: true, senderId: true, receiverId: true },
    });
    for (const cargo of rows) {
      await prisma.$transaction((tx) =>
        announceDarArrival(tx, cargo, { arrivedAt: new Date(), actorId: actor.id })
      );
    }
  }

  /* THE WAREHOUSE IS TOLD, NOT LEFT TO NOTICE. Staff only — the customer's
     status does not change on it. */
  if (atPort.cleared.length > 0) {
    const refs = atPort.cleared;
    await notifyStaff(
      (await staffInDepartment("DAR_WAREHOUSE")).filter((id) => id !== actor.id),
      {
        kind: "cargo.cleared",
        title:
          refs.length === 1
            ? `${refs[0]} cleared — warehouse verification required`
            : `${refs.length} consignments cleared — warehouse verification required`,
        body: `${refs.slice(0, 8).join(", ")}${
          refs.length > 8 ? " and others" : ""
        } ${refs.length === 1 ? "has" : "have"} completed clearance. Please verify and check in the cargo, and report anything missing or damaged.`,
        href: "/app/receive/dar",
      }
    );
  }

  return { atPort: atPort.cleared, alreadyIn: alreadyIn.cleared };
}

function sentence(
  actor: SessionUser,
  outcome: Awaited<ReturnType<typeof clear>>
): ClearanceState {
  const { atPort, alreadyIn } = outcome;
  if (atPort.length + alreadyIn.length === 0) {
    return { error: "Nothing to clear — it has not landed in Dar yet, or is already cleared." };
  }
  const count = (n: number) => `${n} consignment${n === 1 ? "" : "s"}`;
  const parts: string[] = [];
  parts.push(`${count(atPort.length + alreadyIn.length)} cleared — storage starts today.`);
  if (atPort.length > 0) {
    parts.push(
      can(actor.role, "receiving.dar")
        ? "Verify and check them in on the Receiving dock."
        : "The Dar warehouse has been asked to verify and check them in."
    );
  }
  parts.push("Customers have been told.");
  return { ok: parts.join(" ") };
}

/** Customs is done for one consignment. */
export async function markCargoCleared(
  _prev: ClearanceState,
  formData: FormData
): Promise<ClearanceState> {
  const actor = await authorize("cargo.clear");
  const cargoId = String(formData.get("cargoId") ?? "");
  const note = String(formData.get("note") ?? "").slice(0, 300);
  try {
    const outcome = await clear(actor, [cargoId], note);
    revalidatePath(`/app/cargo/${cargoId}`);
    revalidatePath("/app/release");
    revalidatePath("/app/receive/dar");
    return sentence(actor, outcome);
  } catch (error) {
    return { error: formMessage(error, "That did not save. Try again.") };
  }
}

/** Customs clears a container's goods together, so the desk clears them together. */
export async function markContainerCleared(
  _prev: ClearanceState,
  formData: FormData
): Promise<ClearanceState> {
  const actor = await authorize("cargo.clear");
  const containerId = String(formData.get("containerId") ?? "");
  const note = String(formData.get("note") ?? "").slice(0, 300);
  const lines = await prisma.containerCargo.findMany({
    where: {
      containerId,
      cargo: {
        deletedAt: null,
        clearedAt: null,
        status: { notIn: [...GONE] },
        OR: [{ status: "ARRIVED_TANZANIA" }, { darReceiving: { isNot: null } }],
      },
    },
    select: { cargoId: true },
  });
  if (lines.length === 0) {
    return { error: "Nothing on this container is waiting on clearance." };
  }
  try {
    const outcome = await clear(actor, lines.map((l) => l.cargoId), note);
    revalidatePath(`/app/containers/${containerId}`);
    revalidatePath("/app/release");
    revalidatePath("/app/receive/dar");
    return sentence(actor, outcome);
  } catch (error) {
    return { error: formMessage(error, "That did not save. Try again.") };
  }
}
