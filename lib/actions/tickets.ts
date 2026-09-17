"use server";

import type { Role } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { recordAudit, recordFieldChange } from "@/lib/audit";
import { nextConversationReference } from "@/lib/ids";
import { prisma } from "@/lib/prisma";
import { can, isStaff } from "@/lib/rbac";
import { authorize } from "@/lib/session";

export type TicketActionState = {
  error?: string;
  ok?: string;
  id?: string;
  reference?: string;
};

const STATUSES = [
  "OPEN",
  "WAITING_CUSTOMER",
  "WAITING_STAFF",
  "RESOLVED",
  "CLOSED",
] as const;
const PRIORITIES = ["LOW", "NORMAL", "HIGH", "URGENT"] as const;

const optionalText = z
  .string()
  .trim()
  .optional()
  .transform((value) => (value ? value : undefined));

const createSchema = z.object({
  customerId: optionalText,
  cargoReference: optionalText,
  subject: z.string().trim().min(3, "Say what this is about in a few words."),
  priority: z.enum(PRIORITIES).default("NORMAL"),
  body: z.string().trim().min(3, "Write down what the customer told you."),
});

/**
 * A ticket the desk opens itself — a phone call, a walk-in, a WhatsApp voice
 * note that has to be written down before it is forgotten.
 *
 * The first message is an internal note, not a message to the customer: it is
 * the clerk's account of what was said, in the clerk's words, and sending that
 * to the customer's portal as if Swift Cargo had written to them would be both
 * confusing and occasionally unkind.
 */
export async function createTicket(
  _prev: TicketActionState,
  formData: FormData
): Promise<TicketActionState> {
  let actor;
  try {
    actor = await authorize("conversation.reply");
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Not permitted." };
  }

  const parsed = createSchema.safeParse({
    customerId: formData.get("customerId") ?? undefined,
    cargoReference: formData.get("cargoReference") ?? undefined,
    subject: formData.get("subject") ?? "",
    priority: formData.get("priority") || undefined,
    body: formData.get("body") ?? "",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the ticket details." };
  }
  const input = parsed.data;

  const cargo = input.cargoReference
    ? await prisma.cargo.findFirst({
        where: {
          reference: { equals: input.cargoReference, mode: "insensitive" },
          deletedAt: null,
        },
        select: { id: true, reference: true, senderId: true, receiverId: true },
      })
    : null;
  if (input.cargoReference && !cargo) {
    return { error: `No cargo found with reference ${input.cargoReference}.` };
  }

  /* A cargo reference with no customer chosen is still somebody's: the
     receiver, who is invoiced and collects and is therefore the one who rings. */
  const customerId = input.customerId ?? cargo?.receiverId;
  if (!customerId) {
    return { error: "Choose the customer, or give the cargo reference it is about." };
  }

  /* A ticket about somebody else's consignment shows that consignment's
     whereabouts and balance beside the thread — so it must be theirs. */
  if (cargo && cargo.senderId !== customerId && cargo.receiverId !== customerId) {
    return {
      error: `${cargo.reference} is neither sent by nor addressed to that customer.`,
    };
  }

  const customer = await prisma.customer.findFirst({
    where: { id: customerId, deletedAt: null },
    select: { id: true, fullName: true },
  });
  if (!customer) return { error: "That customer no longer exists." };

  const created = await prisma.$transaction(async (tx) => {
    const reference = await nextConversationReference(tx);
    const conversation = await tx.conversation.create({
      data: {
        reference,
        customerId: customer.id,
        cargoId: cargo?.id ?? null,
        subject: input.subject,
        priority: input.priority,
        status: "OPEN",
        staffUnread: false,
        customerUnread: false,
        // Whoever opens it owns it until somebody hands it on. An unowned
        // queue is a queue nobody works.
        assignedToId: actor.id,
        messages: {
          create: { body: input.body, authorId: actor.id, internal: true },
        },
      },
      select: { id: true, reference: true },
    });

    await recordAudit(
      {
        actor,
        action: "ticket.create",
        entity: "Conversation",
        entityId: conversation.id,
        summary: `Opened ticket ${conversation.reference} for ${customer.fullName}: ${input.subject}`,
        metadata: {
          priority: input.priority,
          cargo: cargo?.reference ?? null,
        },
      },
      tx
    );

    return conversation;
  });

  revalidatePath("/app/support", "layout");
  return {
    ok: `Ticket ${created.reference} opened and assigned to you.`,
    id: created.id,
    reference: created.reference,
  };
}

const updateSchema = z.object({
  conversationId: z.string().trim().min(1),
  status: z.enum(STATUSES),
  priority: z.enum(PRIORITIES),
  assignedToId: optionalText,
});

/** Status, priority and who has it — each change kept with both values. */
export async function updateTicket(
  _prev: TicketActionState,
  formData: FormData
): Promise<TicketActionState> {
  let actor;
  try {
    actor = await authorize("conversation.reply");
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Not permitted." };
  }

  const parsed = updateSchema.safeParse({
    conversationId: formData.get("conversationId") ?? "",
    status: formData.get("status") ?? "",
    priority: formData.get("priority") ?? "",
    assignedToId: formData.get("assignedToId") ?? undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the details." };
  }
  const input = parsed.data;

  const existing = await prisma.conversation.findUnique({
    where: { id: input.conversationId },
    select: {
      id: true,
      reference: true,
      status: true,
      priority: true,
      assignedToId: true,
    },
  });
  if (!existing) return { error: "That ticket no longer exists." };

  const assignedToId = input.assignedToId ?? null;
  const reassigning = assignedToId !== existing.assignedToId;

  if (reassigning) {
    // Replying and handing work to somebody else are separate grants; a desk
    // that may answer a ticket is not thereby entitled to deal out the queue.
    if (!can(actor.role, "conversation.assign")) {
      return { error: "You do not have permission to reassign tickets." };
    }
    if (assignedToId) {
      const assignee = await prisma.user.findUnique({
        where: { id: assignedToId },
        select: { active: true, role: true },
      });
      /* A ticket handed to somebody the support pages turn away at the door
         is a ticket nobody can open. */
      if (
        !assignee ||
        !assignee.active ||
        !isStaff(assignee.role as Role) ||
        !can(assignee.role as Role, "conversation.reply")
      ) {
        return { error: "That person cannot work support tickets." };
      }
    }
  }

  const changes: { field: string; oldValue: string | null; newValue: string | null }[] = [];
  if (input.status !== existing.status) {
    changes.push({ field: "status", oldValue: existing.status, newValue: input.status });
  }
  if (input.priority !== existing.priority) {
    changes.push({ field: "priority", oldValue: existing.priority, newValue: input.priority });
  }
  if (reassigning) {
    changes.push({
      field: "assignedToId",
      oldValue: existing.assignedToId,
      newValue: assignedToId,
    });
  }
  if (changes.length === 0) return { ok: "Nothing changed." };

  await prisma.$transaction(async (tx) => {
    for (const change of changes) {
      await recordFieldChange(
        {
          actor,
          entity: "Conversation",
          entityId: existing.id,
          field: change.field,
          oldValue: change.oldValue,
          newValue: change.newValue,
        },
        tx
      );
    }

    await tx.conversation.update({
      where: { id: existing.id },
      data: {
        status: input.status,
        priority: input.priority,
        assignedToId,
      },
    });

    await recordAudit(
      {
        actor,
        action: "ticket.update",
        entity: "Conversation",
        entityId: existing.id,
        summary:
          input.status !== existing.status
            ? `Ticket ${existing.reference}: ${existing.status} → ${input.status}`
            : `Updated ticket ${existing.reference}`,
        metadata: { changes },
      },
      tx
    );
  });

  revalidatePath(`/app/support/${existing.id}`);
  revalidatePath("/app/support", "layout");
  return { ok: "Ticket saved." };
}
