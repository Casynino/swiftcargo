import type { Department, Role } from "@prisma/client";

/**
 * WHO ACTED, AS THE AUDIT LOG KEEPS IT.
 *
 * Worked out from the authenticated account, in one place, so every writer
 * records the same things the same way. Name and department are copied as they
 * stand at the moment — a person renamed or moved later does not rewrite what
 * they did. The account type is the role's own fact: an action is a developer's
 * only if the developer account, in developer mode, did it.
 */
export function auditIdentity(actor: {
  id: string;
  name: string;
  email: string;
  role: Role;
  department: Department | null;
}) {
  return {
    actorId: actor.id,
    actorEmail: actor.email,
    actorRole: actor.role,
    actorName: actor.name,
    actorDepartment: actor.department,
    actorType: actor.role === "DEVELOPER" ? "DEVELOPER" : "STAFF",
  };
}
