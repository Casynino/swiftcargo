import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requireCustomer } from "@/lib/session";

/**
 * Open one notification: mark it read, then go where it points.
 *
 * Only the customer's own notification is touched — found by id and the
 * session's customer together — and only an address inside this site is
 * followed, so a stored link can never send somebody off to another domain.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireCustomer();
  const { id } = await params;

  const note = await prisma.notification.findFirst({
    where: { id, customerId: user.customerId },
    select: { id: true, href: true, readAt: true },
  });
  if (note && !note.readAt) {
    await prisma.notification.update({ where: { id: note.id }, data: { readAt: new Date() } });
  }

  const target =
    note?.href && note.href.startsWith("/") && !note.href.startsWith("//") ? note.href : "/portal/notifications";
  return NextResponse.redirect(new URL(target, request.url));
}
