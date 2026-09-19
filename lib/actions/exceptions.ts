"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ExceptionStatus } from "@prisma/client";

import { recordAudit } from "@/lib/audit";
import { nextExceptionReference } from "@/lib/ids";
import { notifyCustomer, notifyStaff, staffInDepartment } from "@/lib/notify";
import { prisma } from "@/lib/prisma";
import type { Permission } from "@/lib/rbac";
import { authorize, type SessionUser } from "@/lib/session";
import { store, UploadError } from "@/lib/storage";

export type ActionState = { error?: string; ok?: string; id?: string };

const TYPES = [
  "MISSING_CARGO",
  "DAMAGED_CARGO",
  "PACKAGE_MISMATCH",
  "WEIGHT_DIFFERENCE",
  "CBM_DIFFERENCE",
  "WRONG_CUSTOMER",
  "WRONG_CONTAINER",
  "UNIDENTIFIED_CARGO",
  "CUSTOMS_HOLD",
  "SHIPMENT_DELAY",
  "PAYMENT_DISCREPANCY",
  "CUSTOMER_COMPLAINT",
  "DELIVERY_FAILURE",
  "OTHER",
] as const;

const DEPARTMENTS = [
  "MANAGEMENT",
  "CUSTOMER_SUPPORT",
  "CHINA_WAREHOUSE",
  "DAR_WAREHOUSE",
  "FINANCE",
] as const;

const raiseSchema = z.object({
  type: z.enum(TYPES),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]),
  department: z.enum(DEPARTMENTS).optional(),
  cargoId: z.string().optional(),
  title: z.string().trim().min(4, "Give it a title somebody can scan."),
  description: z.string().trim().min(4, "Say what happened."),
});

/**
 * Open a case.
 *
 * Every department can raise one, because a problem is noticed by whoever is
 * standing in front of it. What each may then DO to a case is gated per action,
 * which is why this is the widest permission in the file.
 */
export async function raiseException(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const actor = await authorize("exception.raise");

  const parsed = raiseSchema.safeParse({
    type: formData.get("type") || "OTHER",
    priority: formData.get("priority") || "NORMAL",
    department: formData.get("department") || undefined,
    cargoId: formData.get("cargoId") || undefined,
    title: formData.get("title"),
    description: formData.get("description"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the form." };
  }
  const data = parsed.data;

  const cargo = data.cargoId
    ? await prisma.cargo.findFirst({
        where: { id: data.cargoId, deletedAt: null },
        select: {
          id: true,
          senderId: true,
          receiverId: true,
          reference: true,
          containerLines: { select: { containerId: true } },
        },
      })
    : null;

  const files = formData
    .getAll("evidence")
    .filter((f): f is File => f instanceof File && f.size > 0);

  let evidence: string[] = [];
  try {
    for (const file of files) evidence.push(await store(file, "exceptions"));
  } catch (error) {
    return {
      error: error instanceof UploadError ? error.message : "That upload failed.",
    };
  }

  const created = await prisma.$transaction(async (tx) => {
    const reference = await nextExceptionReference(tx);
    const item = await tx.exceptionCase.create({
      data: {
        reference,
        type: data.type,
        priority: data.priority,
        department: data.department ?? actor.department ?? null,
        cargoId: cargo?.id ?? null,
        customerId: cargo?.senderId ?? null,
        containerId: cargo?.containerLines.at(-1)?.containerId ?? null,
        title: data.title,
        description: data.description,
        evidence: evidence.length > 0 ? evidence : undefined,
        raisedById: actor.id,
      },
    });

    await tx.exceptionEvent.create({
      data: {
        caseId: item.id,
        to: "OPEN",
        note: data.description,
        actorId: actor.id,
      },
    });

    await notifyStaff(
      [
        ...(await staffInDepartment("MANAGEMENT", tx)),
        ...(data.department && data.department !== "MANAGEMENT"
          ? await staffInDepartment(data.department, tx)
          : []),
      ],
      {
        kind: "exception.raised",
        title: `${reference}: ${data.title}`,
        body: data.description.slice(0, 160),
        href: `/app/exceptions/${item.id}`,
      },
      tx
    );

    /* The owner of the goods hears that something is wrong, in plain words
       and nothing more. The case's own description is the desk's working and
       can name other people's cargo; it never leaves the building. */
    const TELL: Partial<Record<string, string>> = {
      MISSING_CARGO: "We are tracing part of your cargo",
      DAMAGED_CARGO: "Some of your cargo arrived damaged",
      CUSTOMS_HOLD: "Your cargo is held at customs",
      SHIPMENT_DELAY: "Your shipment is delayed",
      PACKAGE_MISMATCH: "We need to check your package count with you",
    };
    const told = TELL[data.type];
    if (cargo && told) {
      await notifyCustomer(
        [cargo.receiverId, cargo.senderId].filter((id): id is string => Boolean(id)),
        {
          kind: `exception.${data.type.toLowerCase()}`,
          title: `${cargo.reference}: ${told}`,
          body: "Our team is on it and will contact you. Reply in Support if you have questions.",
          href: `/portal/cargo/${encodeURIComponent(cargo.reference)}`,
        },
        tx
      );
    }

    return item;
  });

  await recordAudit({
    actor,
    action: "exception.raise",
    entity: "ExceptionCase",
    entityId: created.id,
    summary: `Opened ${created.reference} — ${data.title}`,
    /* Which consignment, which container and what kind of trouble. The
       sentence above reads well to a person; these are what a question about
       one consignment's history is actually asked with. */
    metadata: {
      type: data.type,
      priority: data.priority,
      department: data.department ?? null,
      cargoId: data.cargoId ?? null,
      reason: data.description,
    },
  });

  revalidatePath("/app/exceptions");
  return { ok: `Case ${created.reference} opened.`, id: created.id };
}

const updateSchema = z.object({
  caseId: z.string().min(1),
  status: z
    .enum([
      "OPEN",
      "INVESTIGATING",
      "WAITING_CUSTOMER",
      "WAITING_FINANCE",
      "WAITING_WAREHOUSE",
      "ESCALATED",
      "RESOLVED",
      "CLOSED",
    ])
    .optional(),
  note: z.string().trim().optional(),
  resolution: z.string().trim().optional(),
  assignedToId: z.string().optional(),
});

/**
 * Move a case along, and say why.
 *
 * Every change appends an event. Resolving and closing are separate
 * permissions from investigating, because "we know what happened" and "this is
 * finished" are different claims and the second one usually belongs to somebody
 * more senior.
 */
export async function updateException(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const parsed = updateSchema.safeParse({
    caseId: formData.get("caseId"),
    status: formData.get("status") || undefined,
    note: formData.get("note") || undefined,
    resolution: formData.get("resolution") || undefined,
    assignedToId: formData.get("assignedToId") || undefined,
  });
  if (!parsed.success) return { error: "Check the form." };
  const data = parsed.data;

  let actor: SessionUser;
  try {
    actor = await authorize("exception.raise");
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Not permitted." };
  }

  const before = await prisma.exceptionCase.findUnique({
    where: { id: data.caseId },
    select: {
      id: true,
      reference: true,
      status: true,
      cargoId: true,
      title: true,
      evidence: true,
    },
  });
  if (!before) return { error: "That case no longer exists." };

  /* The photo that settles a damage claim is often taken days after the case
     was opened — when the box is finally unpacked, or when customs sends its
     letter. Evidence is added to a case, never swapped for what was there. */
  const files = formData
    .getAll("evidence")
    .filter((f): f is File => f instanceof File && f.size > 0);

  /* The form always sends the status select, so the permission follows what
     actually changes: a note on a resolved case is not a second resolution, and
     assigning while moving to Resolved needs both authorities, not whichever
     one the order of the checks happened to reach first. */
  const moving = data.status && data.status !== before.status ? data.status : null;
  const needed: Permission[] = [];
  if (moving === "CLOSED") needed.push("exception.close");
  if (moving === "RESOLVED" || data.resolution) needed.push("exception.resolve");
  if (data.assignedToId) needed.push("exception.assign");
  try {
    for (const permission of needed) await authorize(permission);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Not permitted." };
  }

  if (
    !moving &&
    !data.note &&
    !data.assignedToId &&
    !data.resolution &&
    files.length === 0
  ) {
    return { error: "Nothing to record." };
  }

  const added: string[] = [];
  try {
    for (const file of files) added.push(await store(file, "exceptions"));
  } catch (error) {
    return {
      error: error instanceof UploadError ? error.message : "That upload failed.",
    };
  }
  const kept = Array.isArray(before.evidence) ? (before.evidence as string[]) : [];

  const status = (data.status ?? before.status) as ExceptionStatus;

  await prisma.$transaction(async (tx) => {
    await tx.exceptionCase.update({
      where: { id: before.id },
      data: {
        status,
        ...(data.assignedToId ? { assignedToId: data.assignedToId } : {}),
        ...(data.resolution ? { resolution: data.resolution } : {}),
        ...(moving === "RESOLVED" ? { resolvedAt: new Date() } : {}),
        ...(moving === "CLOSED" ? { closedAt: new Date() } : {}),
        ...(added.length > 0 ? { evidence: [...kept, ...added] } : {}),
      },
    });

    await tx.exceptionEvent.create({
      data: {
        caseId: before.id,
        from: before.status,
        to: status,
        note:
          data.note ||
          data.resolution ||
          (moving
            ? `Moved to ${status.toLowerCase()}`
            : added.length > 0
              ? `Added ${added.length} photo(s) or document(s)`
              : "Reassigned"),
        actorId: actor.id,
      },
    });

    /*
      CLOSING A CASE CLEARS THE WAREHOUSE FLAG.

      The discrepancy flag on the receiving row is what stops verification, and
      verification is what the release engine checks. Leaving the flag set on a
      resolved case means cargo everybody agrees is fine can never be handed
      over, and somebody eventually works around the system to release it.
    */
    if ((status === "RESOLVED" || status === "CLOSED") && before.cargoId) {
      await tx.darReceiving.updateMany({
        where: { cargoId: before.cargoId },
        data: { discrepancy: false },
      });
    }
  });

  await recordAudit({
    actor,
    action: "exception.update",
    entity: "ExceptionCase",
    entityId: before.id,
    summary: `${before.reference}: ${before.status} → ${status}${
      data.note ? ` — ${data.note}` : ""
    }`,
    metadata: {
      cargoId: before.cargoId,
      oldValue: before.status,
      newValue: status,
      /* Resolving or closing a case clears the discrepancy flag on the Dar
         receiving row, which is what was stopping the release. That is a
         consequence worth being able to find from the case rather than only
         from the cargo. */
      clearedDiscrepancy:
        (status === "RESOLVED" || status === "CLOSED") && Boolean(before.cargoId),
      reason: data.note || data.resolution || null,
    },
  });

  revalidatePath("/app/exceptions");
  revalidatePath(`/app/exceptions/${before.id}`);
  revalidatePath("/app/receive/dar");
  return { ok: "Recorded." };
}
