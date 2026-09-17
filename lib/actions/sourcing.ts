"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { recordAudit, recordFieldChange } from "@/lib/audit";
import { nextSourcingReference } from "@/lib/ids";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { authorize, type SessionUser } from "@/lib/session";

export type SourcingActionState = {
  error?: string;
  ok?: string;
  id?: string;
  reference?: string;
};

/**
 * Sourcing requests: a customer wants something found in China.
 *
 * Nothing here is cargo, a price or a payment. It is support's pipeline from the
 * first call to a supplier found, and every move along it is kept so the next
 * person to pick the request up can see how it got where it is.
 */

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v && v.length > 0 ? v : null));

const PRIORITY = z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]);
const STATUS = z.enum([
  "NEW",
  "IN_PROGRESS",
  "WAITING_CUSTOMER",
  "SUPPLIER_FOUND",
  "COMPLETED",
  "CANCELLED",
]);

const createSchema = z.object({
  customerId: optionalText(64),
  contactName: optionalText(120),
  contactPhone: optionalText(40),
  product: z.string().trim().min(2, "Say what the customer is looking for.").max(200),
  details: optionalText(4000),
  quantity: optionalText(120),
  budget: optionalText(120),
  market: optionalText(160),
  priority: PRIORITY.default("NORMAL"),
});

function denied(error: unknown): SourcingActionState {
  return { error: error instanceof Error ? error.message : "Not permitted." };
}

export async function createSourcingRequest(
  _prev: SourcingActionState,
  formData: FormData
): Promise<SourcingActionState> {
  let actor: SessionUser;
  try {
    actor = await authorize("conversation.reply");
  } catch (error) {
    return denied(error);
  }

  const parsed = createSchema.safeParse(Object.fromEntries(formData) as Record<string, string>);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the request details." };
  }
  const input = parsed.data;

  // A customer on the books takes precedence; the typed contact is for somebody
  // who is not registered yet, and keeping both would be two answers to "who".
  if (!input.customerId && !input.contactName && !input.contactPhone) {
    return { error: "Choose the customer, or take a name or phone number so this can be followed up." };
  }

  if (input.customerId) {
    const customer = await prisma.customer.findFirst({
      where: { id: input.customerId, deletedAt: null },
      select: { id: true },
    });
    if (!customer) return { error: "That customer no longer exists." };
  }

  try {
    const created = await prisma.$transaction(async (tx) => {
      const reference = await nextSourcingReference(tx);
      const request = await tx.sourcingRequest.create({
        data: {
          reference,
          customerId: input.customerId,
          contactName: input.customerId ? null : input.contactName,
          contactPhone: input.customerId ? null : input.contactPhone,
          product: input.product,
          details: input.details,
          quantity: input.quantity,
          budget: input.budget,
          market: input.market,
          priority: input.priority,
          assignedToId: actor.id,
          createdById: actor.id,
        },
        select: { id: true, reference: true },
      });

      await recordAudit(
        {
          actor,
          action: "sourcing.create",
          entity: "SourcingRequest",
          entityId: request.id,
          summary: `Opened sourcing request ${request.reference}: ${input.product}`,
        },
        tx
      );

      return request;
    });

    revalidatePath("/app/support/sourcing");
    return {
      ok: `Request ${created.reference} opened and assigned to you.`,
      id: created.id,
      reference: created.reference,
    };
  } catch {
    return { error: "The request could not be opened. Try again." };
  }
}

const updateSchema = z.object({
  requestId: z.string().trim().min(1),
  status: STATUS,
  priority: PRIORITY,
  assignedToId: optionalText(64),
  outcome: optionalText(4000),
});

export async function updateSourcingRequest(
  _prev: SourcingActionState,
  formData: FormData
): Promise<SourcingActionState> {
  let actor: SessionUser;
  try {
    actor = await authorize("conversation.reply");
  } catch (error) {
    return denied(error);
  }

  const parsed = updateSchema.safeParse(Object.fromEntries(formData) as Record<string, string>);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the details." };
  }
  const input = parsed.data;

  const existing = await prisma.sourcingRequest.findUnique({
    where: { id: input.requestId },
    select: {
      reference: true,
      status: true,
      priority: true,
      assignedToId: true,
      outcome: true,
      assignedTo: { select: { name: true } },
    },
  });
  if (!existing) return { error: "That request no longer exists." };

  const finishing = input.status === "COMPLETED" || input.status === "SUPPLIER_FOUND";
  if (finishing && !input.outcome) {
    return { error: "Record what was found before marking this done." };
  }

  let assignee: { id: string; name: string } | null = null;
  if (input.assignedToId !== existing.assignedToId) {
    /* Taking a request yourself is part of replying; handing one to somebody
       else is assigning work, which is its own permission. */
    if (input.assignedToId !== actor.id && !can(actor.role, "conversation.assign")) {
      return { error: "You can take a request yourself, but not assign it to somebody else." };
    }
    if (input.assignedToId) {
      const user = await prisma.user.findFirst({
        where: { id: input.assignedToId, status: "ACTIVE", role: { not: "CUSTOMER" } },
        select: { id: true, name: true, role: true },
      });
      if (!user || !can(user.role, "conversation.reply")) {
        return { error: "That person cannot work sourcing requests." };
      }
      assignee = { id: user.id, name: user.name };
    }
  }

  const changes: { field: string; oldValue: string | null; newValue: string | null }[] = [];
  if (input.status !== existing.status) {
    changes.push({ field: "status", oldValue: existing.status, newValue: input.status });
  }
  if (input.priority !== existing.priority) {
    changes.push({ field: "priority", oldValue: existing.priority, newValue: input.priority });
  }
  if (input.assignedToId !== existing.assignedToId) {
    changes.push({
      field: "assignedTo",
      oldValue: existing.assignedTo?.name ?? null,
      newValue: assignee?.name ?? null,
    });
  }
  if ((input.outcome ?? null) !== (existing.outcome ?? null)) {
    changes.push({ field: "outcome", oldValue: existing.outcome, newValue: input.outcome });
  }

  if (changes.length === 0) return { ok: "Nothing changed." };

  try {
    await prisma.$transaction(async (tx) => {
      await tx.sourcingRequest.update({
        where: { id: input.requestId },
        data: {
          status: input.status,
          priority: input.priority,
          assignedToId: input.assignedToId,
          outcome: input.outcome,
        },
      });

      for (const change of changes) {
        await recordFieldChange(
          {
            actor,
            entity: "SourcingRequest",
            entityId: input.requestId,
            field: change.field,
            oldValue: change.oldValue,
            newValue: change.newValue,
          },
          tx
        );
      }

      await recordAudit(
        {
          actor,
          action: "sourcing.update",
          entity: "SourcingRequest",
          entityId: input.requestId,
          summary:
            input.status !== existing.status
              ? `Request ${existing.reference}: ${existing.status} → ${input.status}`
              : `Updated request ${existing.reference}`,
          metadata: { changed: changes.map((c) => c.field) },
        },
        tx
      );
    });

    revalidatePath("/app/support/sourcing");
    revalidatePath(`/app/support/sourcing/${input.requestId}`);
    return { ok: "Saved." };
  } catch {
    return { error: "The request could not be saved. Try again." };
  }
}
