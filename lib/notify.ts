import "server-only";

import { prisma, type TxClient } from "@/lib/prisma";

/**
 * Telling people things.
 *
 * Notifications are written where the event happens, in the same transaction,
 * so a container that departed and a notification saying so cannot disagree.
 * They are deliberately thin — a line of text and somewhere to go — because
 * they are read on a phone, once.
 *
 * This is what replaces the operational WhatsApp group. WhatsApp can carry the
 * message afterwards; it must never be where the fact lives.
 *
 * Nothing here fans out to everybody. A notification with no clear reader is an
 * announcement, and announcements are addressed explicitly.
 */

type Payload = {
  kind: string;
  title: string;
  body?: string | null;
  href?: string | null;
};

export async function notifyStaff(
  userIds: string[],
  payload: Payload,
  tx?: TxClient
) {
  const recipients = [...new Set(userIds)].filter(Boolean);
  if (recipients.length === 0) return;

  const client = tx ?? prisma;
  await client.notification.createMany({
    data: recipients.map((userId) => ({ userId, ...payload })),
  });
}

/**
 * A customer, in their own portal.
 *
 * `href` points into /portal, never into /app — a customer following a
 * notification into a staff route gets a redirect, which reads as a broken
 * message rather than as the security boundary it is.
 */
export async function notifyCustomer(
  customerIds: string[],
  payload: Payload,
  tx?: TxClient
) {
  const recipients = [...new Set(customerIds)].filter(Boolean);
  if (recipients.length === 0) return;

  const client = tx ?? prisma;

  /* ONE EVENT, ONE NOTICE. A container moved back to loading and forward
     again, or a button pressed twice, told the customer the same sentence
     four times — which reads as a system that does not know what it said.
     The same words about the same thing inside a day are said once. */
  const already = await client.notification.findMany({
    where: {
      customerId: { in: recipients },
      kind: payload.kind,
      title: payload.title,
      createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    },
    select: { customerId: true },
  });
  const told = new Set(already.map((n) => n.customerId));
  const fresh = recipients.filter((id) => !told.has(id));
  if (fresh.length === 0) return;

  await client.notification.createMany({
    data: fresh.map((customerId) => ({ customerId, ...payload })),
  });
}

/** Everyone on a desk. For "a container arrived" — the desk, not one person. */
export async function staffInDepartment(
  department: "MANAGEMENT" | "CUSTOMER_SUPPORT" | "CHINA_WAREHOUSE" | "DAR_WAREHOUSE" | "FINANCE",
  tx?: TxClient
): Promise<string[]> {
  const client = tx ?? prisma;
  const rows = await client.user.findMany({
    where: { department, active: true, status: "ACTIVE" },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}
