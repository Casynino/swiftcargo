import "server-only";

import type { Prisma } from "@prisma/client";

import { prisma, type TxClient } from "@/lib/prisma";
import type { SessionUser } from "@/lib/session";

type AuditInput = {
  actor: SessionUser | null;
  action: string;
  entity: string;
  entityId?: string | null;
  summary: string;
  metadata?: Prisma.InputJsonValue;
};

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
  await client.auditLog.create({
    data: {
      actorId: input.actor?.id ?? null,
      actorEmail: input.actor?.email ?? null,
      actorRole: input.actor?.role ?? null,
      action: input.action,
      entity: input.entity,
      entityId: input.entityId ?? null,
      summary: input.summary,
      metadata: input.metadata,
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
      reason: input.reason ?? null,
      actorId: input.actor?.id ?? null,
    },
  });
}
