"use server";

import { revalidatePath } from "next/cache";

import { acceptAsExpectedBy } from "@/lib/accept-as-expected";
import { announceDarArrival, clearCargo } from "@/lib/clearance";
import { prisma } from "@/lib/prisma";
import { formMessage } from "@/lib/safe-error";
import { authorize, type SessionUser } from "@/lib/session";

export type ClearanceState = { error?: string; ok?: string };

const GONE = ["COLLECTED", "DELIVERED", "CANCELLED", "MISSING_AT_DAR"] as const;

/**
 * CLEARED, AND IN OUR WAREHOUSE, IN ONE PRESS.
 *
 * The owner's flow: the ship is marked arrived, the team inspects at the port
 * — reports what is missing, tags what is damaged — and when customs is done
 * one press clears the goods and books them into our warehouse together.
 * Anything the team has not already checked in is checked in as China sent
 * it; anything reported missing is left alone. The storage clock starts now,
 * and each customer gets one message: ready for pickup if they have paid,
 * payment required if not.
 */
async function clearAndReceive(actor: SessionUser, cargoIds: string[], note: string) {
  const result = await prisma.$transaction(
    (tx) => clearCargo(tx, cargoIds, actor, note, false),
    { timeout: 60_000 }
  );
  if (result.cleared.length === 0) return { result, unchecked: [] as string[], received: 0 };

  const rows = await prisma.cargo.findMany({
    where: { id: { in: cargoIds }, clearedAt: { not: null } },
    select: {
      id: true,
      reference: true,
      status: true,
      senderId: true,
      receiverId: true,
      darReceiving: { select: { id: true } },
    },
  });
  const cleared = rows.filter((r) => result.cleared.includes(r.reference));

  /* Already checked in at the port: they reach our warehouse now. */
  for (const cargo of cleared.filter((c) => c.darReceiving)) {
    await prisma.$transaction((tx) =>
      announceDarArrival(tx, cargo, { arrivedAt: new Date(), actorId: actor.id })
    );
  }

  /* Not checked in yet: checked in as China sent them, which also tells the
     customer and prices the draft. */
  const toReceive = cleared.filter((c) => !c.darReceiving && c.status === "ARRIVED_TANZANIA");
  let received = 0;
  const unchecked: string[] = [];
  if (toReceive.length > 0) {
    /* As the person clearing, who is authorised for clearance — not as the
       floor, whose own button asks for receiving.dar. */
    await acceptAsExpectedBy(actor, toReceive.map((c) => c.id));
    const after = await prisma.cargo.findMany({
      where: { id: { in: toReceive.map((c) => c.id) } },
      select: { reference: true, darReceiving: { select: { id: true } } },
    });
    received = after.filter((c) => c.darReceiving).length;
    unchecked.push(...after.filter((c) => !c.darReceiving).map((c) => c.reference));
  }
  return { result, unchecked, received };
}

function sentence(outcome: Awaited<ReturnType<typeof clearAndReceive>>): ClearanceState {
  const { result, unchecked } = outcome;
  if (result.cleared.length === 0) {
    return { error: "Nothing to clear — it has not landed in Dar yet, or is already cleared." };
  }
  const n = result.cleared.length;
  return {
    ok: [
      `${n} consignment${n === 1 ? "" : "s"} cleared and in our warehouse. Customers have been told; storage starts today.`,
      unchecked.length
        ? `${unchecked.join(", ")} has no Guangzhou count — check it in on the scales.`
        : "",
    ]
      .filter(Boolean)
      .join(" "),
  };
}

/** Customs is done for one consignment — the Dar floor's call, or Finance's. */
export async function markCargoCleared(
  _prev: ClearanceState,
  formData: FormData
): Promise<ClearanceState> {
  const actor = await authorize("cargo.clear");
  const cargoId = String(formData.get("cargoId") ?? "");
  const note = String(formData.get("note") ?? "").slice(0, 300);
  try {
    const outcome = await clearAndReceive(actor, [cargoId], note);
    revalidatePath(`/app/cargo/${cargoId}`);
    revalidatePath("/app/release");
    revalidatePath("/app/receive/dar");
    return sentence(outcome);
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
    const outcome = await clearAndReceive(actor, lines.map((l) => l.cargoId), note);
    revalidatePath(`/app/containers/${containerId}`);
    revalidatePath("/app/release");
    revalidatePath("/app/receive/dar");
    return sentence(outcome);
  } catch (error) {
    return { error: formMessage(error, "That did not save. Try again.") };
  }
}
