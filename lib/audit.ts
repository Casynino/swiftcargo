import "server-only";

import type { Prisma } from "@prisma/client";

import { headers } from "next/headers";

import { auditIdentity } from "@/lib/audit-identity";
import { prisma, type TxClient } from "@/lib/prisma";
import type { SessionUser } from "@/lib/session";

type AuditInput = {
  actor: SessionUser | null;
  action: string;
  entity: string;
  entityId?: string | null;
  summary: string;
  metadata?: Prisma.InputJsonValue;
  /** "FAILURE" for an attempt that did not go through. Defaults to success. */
  outcome?: "SUCCESS" | "FAILURE" | "DENIED";
};

/** The request this line belongs to, when there is one — scripts have none. */
async function requestIdOf(): Promise<string | undefined> {
  try {
    const head = await headers();
    return head.get("x-vercel-id") ?? head.get("x-request-id") ?? undefined;
  } catch {
    return undefined;
  }
}

/**
 * THE NOTE, WHEN SOMEBODY HAD SOMETHING TO SAY.
 *
 * A box that must be filled in is filled in with "ok". The note is offered,
 * never demanded — every line here already carries who, when, which record and
 * the figures on either side, and the note was never the part that answered
 * "what happened". This appends it when there is one and leaves the summary
 * clean when there is not, so no audit line ever ends in a dangling dash.
 */
export function withNote(summary: string, note?: string | null) {
  const said = note?.trim();
  return said ? `${summary} — ${said}` : summary;
}

/**
 * Append-only record of who did what.
 *
 * Pass a transaction client when the entry must live or die with the operation
 * it describes — releasing cargo, verifying a payment, sealing a container.
 */
export async function recordAudit(input: AuditInput, tx?: TxClient) {
  const client = tx ?? prisma;
  /* The developer leaves a track only when something is changed, added or
     removed. An attempt that was refused or failed changed nothing, so it is
     not written down — signing in, looking and trying are not changes. */
  if ((input.actor?.role === "DEVELOPER" || input.actor?.impersonatedBy) && (input.outcome ?? "SUCCESS") !== "SUCCESS") return;
  await client.auditLog.create({
    data: {
      /* The actor is whoever the server authenticated — it is never read from
         a request. Name, department and type are copied as they stand now. */
      ...(input.actor
        ? auditIdentity(input.actor)
        : { actorId: null, actorEmail: null, actorRole: null }),
      outcome: input.outcome ?? "SUCCESS",
      requestId: await requestIdOf(),
      action: input.action,
      entity: input.entity,
      entityId: input.entityId ?? null,
      /* Said in words as well as stored, so the line reads true on any screen. */
      summary: input.actor?.impersonatedBy
        ? `${input.summary} (developer ${input.actor.impersonatedBy.name} working as ${input.actor.name})`
        : input.summary,
      metadata: input.actor?.impersonatedBy
        ? ({
            ...((input.metadata ?? {}) as Record<string, Prisma.InputJsonValue>),
            workingAs: { id: input.actor.id, name: input.actor.name, role: input.actor.role },
          } as Prisma.InputJsonValue)
        : input.metadata,
    },
  });
}

type FieldChangeInput = {
  actor: SessionUser | null;
  entity: string;
  entityId: string;
  field: string;
  oldValue: unknown;
  newValue: unknown;
  reason?: string | null;
};

/**
 * One field moving, with both values.
 *
 * Separate from the audit summary because a weight correction gets asked about
 * by field — "what has this weight been?" — and grepping a sentence for it does
 * not work. Weights, CBM, rates and package counts all come through here.
 */
export async function recordFieldChange(
  input: FieldChangeInput,
  tx?: TxClient
) {
  const client = tx ?? prisma;
  const show = (v: unknown) =>
    v === null || v === undefined ? null : String(v);

  await client.fieldChange.create({
    data: {
      entity: input.entity,
      entityId: input.entityId,
      field: input.field,
      oldValue: show(input.oldValue),
      newValue: show(input.newValue),
      reason: input.actor?.impersonatedBy
        ? `${input.reason ?? "No reason given"} (developer working as ${input.actor.name})`
        : input.reason ?? null,
      /* Under the developer while working as somebody — see auditIdentity. */
      actorId: input.actor?.impersonatedBy?.id ?? input.actor?.id ?? null,
    },
  });
}
