import type { Prisma } from "@prisma/client";

/**
 * A DELETED ACCOUNT IS GONE FROM EVERY SCREEN AND CAN NEVER SIGN IN — BUT THE
 * ROW STAYS WHEN THE BOOKS POINT AT IT.
 *
 * A payment verified by this person, a bill issued by them, a check-in they
 * counted: those records name a user id, and the books must keep saying who. So
 * a person with any history is scrubbed rather than removed — name, address,
 * phone and password go, the id stays and reads "Deleted account". Only an
 * account that never did anything is removed outright.
 */
export const DELETED_DOMAIN = "deleted.invalid";
export const DELETED_NAME = "Deleted account";

export const isDeletedEmail = (email: string) => email.endsWith(`@${DELETED_DOMAIN}`);

type Db = Prisma.TransactionClient;

/** The last active owner cannot be switched off or deleted: nobody would be left to hold the rails. */
export async function wouldLeaveNoOwner(db: Db, target: { id: string; role: string }) {
  if (target.role !== "ADMIN") return false;
  const others = await db.user.count({ where: { role: "ADMIN", active: true, status: "ACTIVE", id: { not: target.id } } });
  return others === 0;
}

export async function scrubAccount(db: Db, id: string) {
  await db.notification.deleteMany({ where: { userId: id } });
  await db.user.update({
    where: { id },
    data: {
      name: DELETED_NAME,
      email: `deleted-${id}@${DELETED_DOMAIN}`,
      phone: null,
      passwordHash: "!deleted",
      status: "INACTIVE",
      active: false,
      customerId: null,
      warehouseId: null,
    },
  });
}
