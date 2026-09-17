"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { recordAudit } from "@/lib/audit";
import { nextConversationReference } from "@/lib/ids";
import { notifyCustomer, notifyStaff, staffInDepartment } from "@/lib/notify";
import { prisma } from "@/lib/prisma";
import { authorize, authorizeAny, authorizeCustomer } from "@/lib/session";

export type ActionState = { error?: string; ok?: string; id?: string };

/**
 * Customer messaging.
 *
 * This is the thing that replaces the WhatsApp thread. A message here is
 * attached to the customer and, where it matters, to the consignment — so the
 * next person to pick up the conversation can see what it is about without
 * asking the customer to explain again.
 *
 * `internal` notes live on the same thread rather than somewhere else, because
 * a note about a customer kept in a different system is a note nobody reads.
 * They are filtered out of every customer-facing query.
 */

const startSchema = z.object({
  subject: z.string().trim().min(3, "What is it about?"),
  body: z.string().trim().min(1, "Write something."),
  cargoId: z.string().optional(),
});

/** A customer opens a conversation from their portal. */
export async function startConversation(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const customer = await authorizeCustomer();

  const parsed = startSchema.safeParse({
    subject: formData.get("subject"),
    body: formData.get("body"),
    cargoId: formData.get("cargoId") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the form." };
  }
  const data = parsed.data;

  /* Scoped to their own cargo. An id typed into the form can only ever match
     something they own. */
  const cargo = data.cargoId
    ? await prisma.cargo.findFirst({
        where: {
          id: data.cargoId,
          OR: [
            { senderId: customer.customerId },
            { receiverId: customer.customerId },
          ],
        },
        select: { id: true, reference: true },
      })
    : null;

  const conversation = await prisma.$transaction(async (tx) => {
    const reference = await nextConversationReference(tx);
    const created = await tx.conversation.create({
      data: {
        reference,
        customerId: customer.customerId,
        cargoId: cargo?.id ?? null,
        subject: data.subject,
        status: "WAITING_STAFF",
        staffUnread: true,
        messages: { create: { body: data.body } },
      },
    });

    await notifyStaff(
      await staffInDepartment("CUSTOMER_SUPPORT", tx),
      {
        kind: "message.received",
        title: `${customer.name}: ${data.subject}`,
        body: data.body.slice(0, 160),
        href: `/app/support/${created.id}`,
      },
      tx
    );

    return created;
  });

  revalidatePath("/portal/messages");
  return { ok: "Sent. We usually reply the same working day.", id: conversation.id };
}

const replySchema = z.object({
  conversationId: z.string().min(1),
  body: z.string().trim().min(1, "Write something."),
  internal: z.string().optional(),
  status: z
    .enum(["OPEN", "WAITING_CUSTOMER", "WAITING_STAFF", "RESOLVED", "CLOSED"])
    .optional(),
});

/** Staff reply, or leave an internal note on the thread. */
export async function replyToConversation(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const actor = await authorize("conversation.reply");

  const parsed = replySchema.safeParse({
    conversationId: formData.get("conversationId"),
    body: formData.get("body"),
    internal: formData.get("internal") || undefined,
    status: formData.get("status") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Write something." };
  }
  const data = parsed.data;
  const internal = data.internal === "on";

  const conversation = await prisma.conversation.findUnique({
    where: { id: data.conversationId },
    select: { id: true, reference: true, customerId: true, subject: true },
  });
  if (!conversation) return { error: "That conversation no longer exists." };

  await prisma.$transaction(async (tx) => {
    await tx.message.create({
      data: {
        conversationId: conversation.id,
        authorId: actor.id,
        body: data.body,
        internal,
      },
    });

    await tx.conversation.update({
      where: { id: conversation.id },
      data: {
        lastMessageAt: new Date(),
        /* An internal note is not a reply — the thread is still waiting on us
           and must stay in the inbox. */
        staffUnread: internal,
        customerUnread: !internal,
        status: data.status ?? (internal ? undefined : "WAITING_CUSTOMER"),
        ...(actor.id ? { assignedToId: actor.id } : {}),
      },
    });

    if (!internal) {
      await notifyCustomer(
        [conversation.customerId],
        {
          kind: "message.reply",
          title: `Swift Cargo replied about ${conversation.subject}`,
          body: data.body.slice(0, 160),
          href: `/portal/messages/${conversation.id}`,
        },
        tx
      );
    }
  });

  revalidatePath(`/app/support/${conversation.id}`);
  revalidatePath("/app/support", "layout");
  return { ok: internal ? "Note added." : "Reply sent." };
}

/** The customer answers on their own thread. */
export async function customerReply(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const customer = await authorizeCustomer();

  const conversationId = String(formData.get("conversationId") ?? "");
  const body = String(formData.get("body") ?? "").trim();
  if (!body) return { error: "Write something." };

  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, customerId: customer.customerId },
    select: { id: true, subject: true, assignedToId: true },
  });
  if (!conversation) return { error: "We cannot find that conversation." };

  await prisma.$transaction(async (tx) => {
    await tx.message.create({
      data: { conversationId: conversation.id, body },
    });
    await tx.conversation.update({
      where: { id: conversation.id },
      data: {
        lastMessageAt: new Date(),
        staffUnread: true,
        customerUnread: false,
        status: "WAITING_STAFF",
      },
    });

    await notifyStaff(
      conversation.assignedToId
        ? [conversation.assignedToId]
        : await staffInDepartment("CUSTOMER_SUPPORT", tx),
      {
        kind: "message.received",
        title: `${customer.name} replied: ${conversation.subject}`,
        body: body.slice(0, 160),
        href: `/app/support/${conversation.id}`,
      },
      tx
    );
  });

  revalidatePath(`/portal/messages/${conversationId}`);
  return { ok: "Sent." };
}

/** Support opens a thread first — after a phone call, or to chase a bill. */
export async function staffStartConversation(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const actor = await authorize("conversation.reply");

  const customerId = String(formData.get("customerId") ?? "");
  const subject = String(formData.get("subject") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  const cargoId = String(formData.get("cargoId") ?? "") || null;

  if (!customerId || !subject || !body) {
    return { error: "Customer, subject and a message are all needed." };
  }

  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { id: true, fullName: true },
  });
  if (!customer) return { error: "That customer no longer exists." };

  const conversation = await prisma.$transaction(async (tx) => {
    const reference = await nextConversationReference(tx);
    const created = await tx.conversation.create({
      data: {
        reference,
        customerId,
        cargoId,
        subject,
        status: "WAITING_CUSTOMER",
        staffUnread: false,
        customerUnread: true,
        assignedToId: actor.id,
        messages: { create: { body, authorId: actor.id } },
      },
    });

    await notifyCustomer(
      [customerId],
      {
        kind: "message.received",
        title: `Swift Cargo: ${subject}`,
        body: body.slice(0, 160),
        href: `/portal/messages/${created.id}`,
      },
      tx
    );

    return created;
  });

  await recordAudit({
    actor,
    action: "conversation.start",
    entity: "Conversation",
    entityId: conversation.id,
    summary: `Messaged ${customer.fullName} — ${subject}`,
  });

  revalidatePath("/app/support", "layout");
  return { ok: "Sent.", id: conversation.id };
}

/** Mark a thread read when staff open it, so the inbox count means something. */
export async function markConversationRead(conversationId: string) {
  await authorize("conversation.view");
  await prisma.conversation.updateMany({
    where: { id: conversationId },
    data: { staffUnread: false },
  });
}

export async function markNotificationsRead() {
  const { currentUser } = await import("@/lib/session");
  const user = await currentUser();
  if (!user) return;

  await prisma.notification.updateMany({
    where: user.customerId
      ? { customerId: user.customerId, readAt: null }
      : { userId: user.id, readAt: null },
    data: { readAt: new Date() },
  });

  revalidatePath("/app/notifications");
  revalidatePath("/portal/notifications");
}

/**
 * LOG THAT WE TOLD THEM.
 *
 * Pressed as WhatsApp opens with the message already written. It records what
 * was put in front of the customer and who put it there — not that anything was
 * delivered, because a person still has to press send in WhatsApp and this
 * system never sees whether they did.
 *
 * The customer is not chosen here. It comes off the cargo or the invoice named
 * in the form, server-side, so a staff member cannot address somebody else's
 * consignment to a number they typed.
 */
export async function logCustomerContact(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  /* Support tells customers their cargo moved; Finance rings them about the
     bill. Both press WhatsApp from their own lists, and both are logged. */
  const actor = await authorizeAny(["conversation.reply", "payment.submit"]);

  const cargoId = String(formData.get("cargoId") ?? "") || null;
  const invoiceId = String(formData.get("invoiceId") ?? "") || null;
  const kind = String(formData.get("kind") ?? "general");
  const channel = String(formData.get("channel") ?? "WHATSAPP");
  const body = String(formData.get("body") ?? "").trim();

  if (!body) return { error: "There is nothing to send." };
  if (!cargoId && !invoiceId) {
    return { error: "A message has to be about a consignment or a bill." };
  }

  const cargo = cargoId
    ? await prisma.cargo.findFirst({
        where: { id: cargoId, deletedAt: null },
        select: { id: true, reference: true, receiverId: true },
      })
    : null;

  const invoice = invoiceId
    ? await prisma.invoice.findUnique({
        where: { id: invoiceId },
        select: { id: true, number: true, customerId: true },
      })
    : null;

  /* The bill's customer first, then the cargo's receiver — the person who is
     invoiced and collects. The sender is in China and is not who is rung. */
  const customerId = invoice?.customerId ?? cargo?.receiverId;
  if (!customerId) return { error: "That record no longer exists." };

  await prisma.customerContact.create({
    data: {
      customerId,
      cargoId: cargo?.id ?? null,
      invoiceId: invoice?.id ?? null,
      kind,
      channel,
      body,
      sentById: actor.id,
    },
  });

  await recordAudit({
    actor,
    action: "customer.contact",
    entity: "Customer",
    entityId: customerId,
    summary: `Contacted about ${cargo?.reference ?? invoice?.number} on ${channel.toLowerCase()}`,
    metadata: { kind, channel },
  });

  if (cargo) revalidatePath(`/app/cargo/${cargo.id}`);
  revalidatePath("/app/finance/collections");
  return { ok: "Logged." };
}
