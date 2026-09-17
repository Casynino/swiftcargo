"use server";

import { revalidatePath } from "next/cache";

import { recordAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { canAmendCargo } from "@/lib/rbac";
import { authorize } from "@/lib/session";

export type RestoreState = { error?: string; ok?: string };

/**
 * Put a deleted consignment back into the working system.
 *
 * Held to the same authority as deleting it — `cargo.delete` and custody of the
 * cargo where it now sits — because a restore that anybody may press turns
 * every deletion into a suggestion. There is deliberately no counterpart that
 * erases a record for good: the deleted list is where a removed consignment's
 * photos and history are still asked about, and a purge would end that.
 */
export async function restoreCargo(
  _prev: RestoreState,
  formData: FormData
): Promise<RestoreState> {
  const actor = await authorize("cargo.delete");

  const cargoId = String(formData.get("cargoId") ?? "");
  const cargo = await prisma.cargo.findFirst({
    where: { id: cargoId, deletedAt: { not: null } },
    select: { id: true, reference: true, status: true },
  });
  if (!cargo) return { error: "That cargo is not in the deleted list." };
  if (!canAmendCargo(actor.role, cargo.status)) {
    return { error: "This cargo is not in your custody." };
  }

  const restored = await prisma.$transaction(async (tx) => {
    /* Conditional, so two people pressing Restore at once write one restore
       and one audit line, not two. */
    const { count } = await tx.cargo.updateMany({
      where: { id: cargo.id, deletedAt: { not: null } },
      data: { deletedAt: null },
    });
    if (count === 0) return false;

    await recordAudit(
      {
        actor,
        action: "cargo.restore",
        entity: "Cargo",
        entityId: cargo.id,
        summary: `Restored ${cargo.reference} from deleted records`,
      },
      tx
    );
    return true;
  });
  if (!restored) return { error: "Somebody restored it first." };

  revalidatePath("/app/admin/deleted");
  revalidatePath(`/app/cargo/${cargo.id}`);
  revalidatePath("/app/cargo");
  return { ok: `${cargo.reference} restored.` };
}
