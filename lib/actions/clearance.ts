"use server";

import { revalidatePath } from "next/cache";

import { clearCargo } from "@/lib/clearance";
import { prisma } from "@/lib/prisma";
import { formMessage } from "@/lib/safe-error";
import { authorize } from "@/lib/session";

export type ClearanceState = { error?: string; ok?: string };

function done(result: { cleared: string[]; skipped: string[] }): ClearanceState {
  if (result.cleared.length === 0) {
    return { error: "Nothing to clear — it is not booked in at Dar yet, or is already cleared." };
  }
  return {
    ok:
      result.cleared.length === 1
        ? `${result.cleared[0]} cleared. The customer has been told.`
        : `${result.cleared.length} consignments cleared. Each customer has been told.`,
  };
}

/** Customs is done for one consignment. The Dar desk's call, not Finance's. */
export async function markCargoCleared(
  _prev: ClearanceState,
  formData: FormData
): Promise<ClearanceState> {
  const actor = await authorize("receiving.dar");
  const cargoId = String(formData.get("cargoId") ?? "");
  const note = String(formData.get("note") ?? "").slice(0, 300);
  try {
    const result = await prisma.$transaction((tx) => clearCargo(tx, [cargoId], actor, note));
    revalidatePath(`/app/cargo/${cargoId}`);
    revalidatePath("/app/release");
    return done(result);
  } catch (error) {
    return { error: formMessage(error, "That did not save. Try again.") };
  }
}

/**
 * Customs clears a container's goods together, so the desk clears them
 * together: every consignment on it that Dar has booked in and not yet cleared.
 * Anything still unchecked, missing or already gone is left alone.
 */
export async function markContainerCleared(
  _prev: ClearanceState,
  formData: FormData
): Promise<ClearanceState> {
  const actor = await authorize("receiving.dar");
  const containerId = String(formData.get("containerId") ?? "");
  const note = String(formData.get("note") ?? "").slice(0, 300);
  const lines = await prisma.containerCargo.findMany({
    where: {
      containerId,
      cargo: { deletedAt: null, clearedAt: null, darReceiving: { isNot: null } },
    },
    select: { cargoId: true },
  });
  if (lines.length === 0) {
    return { error: "Nothing on this container is waiting on clearance." };
  }
  try {
    const result = await prisma.$transaction(
      (tx) => clearCargo(tx, lines.map((l) => l.cargoId), actor, note),
      { timeout: 60_000 }
    );
    revalidatePath(`/app/containers/${containerId}`);
    revalidatePath("/app/release");
    return done(result);
  } catch (error) {
    return { error: formMessage(error, "That did not save. Try again.") };
  }
}
