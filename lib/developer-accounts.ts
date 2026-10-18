import type { Prisma } from "@prisma/client";

/**
 * DELETING AN ACCOUNT TAKES AWAY ACCESS, NEVER THE RECORD.
 *
 * Whatever this person recorded — payments checked, cargo received, bills
 * issued, messages sent — is the business's history and keeps saying who did
 * it, by name. So the row stays and only the way in goes: the password is
 * made unusable, the sign-in address is freed (so it can be used again), the
 * account is switched off and every list that offers a person to pick leaves
 * it out. The address it had is kept in the developer's audit line.
 */
export const DELETED_DOMAIN = "deleted.invalid";

export const isDeletedEmail = (email: string) => email.endsWith(`@${DELETED_DOMAIN}`);

type Db = Prisma.TransactionClient;

/** The last active owner cannot be switched off or deleted: nobody would be left to hold the rails. */
export async function wouldLeaveNoOwner(db: Db, target: { id: string; role: string }) {
  if (target.role !== "ADMIN") return false;
  const others = await db.user.count({ where: { role: "ADMIN", active: true, status: "ACTIVE", id: { not: target.id } } });
  return others === 0;
}

export async function removeAccess(db: Db, id: string) {
  await db.user.update({
    where: { id },
    data: {
      email: `deleted-${id}@${DELETED_DOMAIN}`,
      passwordHash: "!deleted",
      status: "INACTIVE",
      active: false,
      customerId: null,
    },
  });
}
