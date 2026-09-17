import "server-only";

import type { PhotoKind } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { canAny, isStaff, type Permission } from "@/lib/rbac";
import type { SessionUser } from "@/lib/session";

/**
 * MAY THIS PERSON OPEN THIS FILE?
 *
 * A file has no owner of its own. It is a payment slip because a PaymentProof
 * row points at it, a counter photo because a CargoPhoto row does, and the
 * answer is whatever that record would answer. So the URL is looked up in
 * every table that stores one, and the file opens if any of them lets this
 * viewer in. A URL no record claims opens for nobody — an orphan is evidence of
 * nothing, and serving it would make the upload folder a public drop box.
 *
 * "public" means anybody, signed in or not; "private" means this viewer only,
 * and the response must not be cached by anything shared.
 */

/**
 * The photographs the portal shows a customer of their own cargo — the boxes,
 * their mark, the state they arrived in. Damage and receiving evidence, and the
 * handover photos, are the company's case file and stay inside.
 */
export const CUSTOMER_PHOTO_KINDS: PhotoKind[] = ["PACKAGE", "SHIPPING_MARK", "CONDITION"];

export type FileAccess = "public" | "private" | null;

export async function fileAccess(
  url: string,
  viewer: SessionUser | null
): Promise<FileAccess> {
  const staff = viewer && isStaff(viewer.role) ? viewer : null;
  const customerId = viewer?.role === "CUSTOMER" ? viewer.customerId : null;
  const staffMay = (permissions: Permission[]) =>
    !!staff && canAny(staff.role, permissions);

  const [photos, proofs, expenses, releases, documents, markets] = await Promise.all([
    /* A customer's lookup is narrowed to their own rows first: the same file can
       sit behind several records, and a sample of any five could miss theirs. */
    prisma.cargoPhoto.findMany({
      where: customerId
        ? { url, cargo: { OR: [{ senderId: customerId }, { receiverId: customerId }] } }
        : { url },
      select: {
        kind: true,
        cargo: { select: { deletedAt: true, senderId: true, receiverId: true } },
      },
      take: 5,
    }),
    prisma.paymentProof.findMany({
      where: customerId ? { url, payment: { customerId } } : { url },
      select: { payment: { select: { customerId: true } } },
      take: 5,
    }),
    prisma.containerExpense.count({ where: { receiptUrl: url } }),
    prisma.release.count({ where: { signatureUrl: url } }),
    prisma.shipmentDocument.count({ where: { url } }),
    prisma.marketInformation.count({ where: { imageUrl: url, published: true } }),
  ]);

  if (markets > 0) return "public";

  /* A counter photograph shows what somebody owns and what it is worth, so it
     is not public even though its name is unguessable: the owner sees it on
     the portal, and nobody else outside the company sees it at all. */
  if (photos.length > 0 && staffMay(["cargo.view"])) return "private";
  if (
    customerId &&
    photos.some(
      (p) =>
        !p.cargo.deletedAt &&
        CUSTOMER_PHOTO_KINDS.includes(p.kind) &&
        (p.cargo.senderId === customerId || p.cargo.receiverId === customerId)
    )
  ) {
    return "private";
  }
  if (
    proofs.length > 0 &&
    (staffMay(["finance.view", "payment.submit", "payment.verify"]) ||
      (customerId && proofs.some((p) => p.payment.customerId === customerId)))
  ) {
    return "private";
  }
  if (expenses > 0 && staffMay(["expense.view", "accounting.view"])) return "private";
  if (releases > 0 && staffMay(["release.view"])) return "private";
  if (documents > 0 && staffMay(["shipment.view"])) return "private";

  /* Case evidence is kept in a JSON column rather than a row per file, so it is
     recognised by the folder `store()` put it in. Only staff read a case. */
  if (url.startsWith("/uploads/exceptions/") && staffMay(["exception.view"])) {
    return "private";
  }

  return null;
}
