import "server-only";

import { nextExceptionReference } from "@/lib/ids";
import { notifyStaff, staffInDepartment } from "@/lib/notify";
import type { TxClient } from "@/lib/prisma";
import type { SessionUser } from "@/lib/session";

/**
 * Confirming a container at Dar.
 *
 * The transactional half of `verifyContainer` in lib/actions/dar.ts, which
 * holds the permission check and the form. Every rule about what may be signed
 * off and what blocks the box lives here, so the screen that renders the
 * counters, the action behind the button and a script run against the database
 * all answer the same questions.
 *
 * A refusal is thrown as ConfirmationRefused inside the caller's transaction,
 * so nothing written before the refusal survives it.
 */
export class ConfirmationRefused extends Error {}

/** One consignment on the manifest, as the confirmation reads it. */
export type ConfirmationLine = {
  id: string;
  reference: string;
  status: string;
  senderId: string;
  darReceiving: {
    id: string;
    verified: boolean;
    discrepancy: boolean;
    condition: string;
  } | null;
  openCases: number;
};

/**
 * EXPECTED AGAINST CONFIRMED, IN THE CATEGORIES THE FLOOR ANSWERS FOR.
 *
 * Counted once and used by the screen, by the confirmation and by the audit
 * line, because three places each deciding for themselves what "unchecked"
 * means is three different numbers in front of the same clerk.
 */
export function tally(lines: ConfirmationLine[]) {
  const missing = lines.filter((c) => c.status === "MISSING_AT_DAR");
  const counted = lines.filter((c) => c.darReceiving !== null);
  /* Not counted and not reported missing: nobody has said anything about these
     boxes at all, which is the only state that blocks a confirmation. */
  const unchecked = lines.filter(
    (c) => c.darReceiving === null && c.status !== "MISSING_AT_DAR"
  );
  const damaged = counted.filter((c) => c.darReceiving!.condition !== "GOOD");
  const flagged = counted.filter(
    (c) => c.darReceiving!.discrepancy || c.openCases > 0
  );
  /* A signature is of a clean count. A row carrying a case is what the case is
     for — resolving it is how it gets signed, not confirming the box over it. */
  const toSign = counted.filter(
    (c) =>
      !c.darReceiving!.verified &&
      !c.darReceiving!.discrepancy &&
      c.openCases === 0
  );
  return { expected: lines, counted, unchecked, missing, damaged, flagged, toSign };
}

export async function linesOf(tx: TxClient, containerId: string) {
  const rows = await tx.containerCargo.findMany({
    where: { containerId },
    select: {
      cargo: {
        select: {
          id: true,
          reference: true,
          status: true,
          senderId: true,
          darReceiving: {
            select: {
              id: true,
              verified: true,
              discrepancy: true,
              condition: true,
            },
          },
          exceptions: {
            where: { status: { notIn: ["RESOLVED", "CLOSED"] } },
            select: { id: true },
          },
        },
      },
    },
  });
  return rows.map(
    (row): ConfirmationLine => ({
      id: row.cargo.id,
      reference: row.cargo.reference,
      status: row.cargo.status,
      senderId: row.cargo.senderId,
      darReceiving: row.cargo.darReceiving,
      openCases: row.cargo.exceptions.length,
    })
  );
}

/**
 * THE CONFIRMATION ITSELF.
 *
 * It refuses while anything is unchecked. A consignment nobody looked at is not
 * a consignment that arrived: it is either on the floor or it is a case, and
 * somebody has to say which. Signing the box off over it used to record it as
 * present and undamaged on the way past — ninety cartons ruled on by a button
 * nobody read as a ruling.
 *
 * Missing and damaged NEVER block it. That is the whole reason they are their
 * own states: they have already been answered for, and a hundred boxes are not
 * held hostage by one.
 *
 * The override exists because containers really are confirmed at six in the
 * evening with three marks nobody could read. It asks why, it opens a case on
 * every consignment it rules over so none of them is lost, and the caller puts
 * it in the audit log with a name on it.
 */
export async function confirmContainerAtDar(
  tx: TxClient,
  actor: SessionUser,
  input: {
    container: { id: string; reference: string; status: string };
    overrideReason: string;
    /** Does this desk hold `container.confirmUnchecked`? The caller asks rbac. */
    mayOverride: boolean;
  }
) {
  const { container } = input;
  const reason = input.overrideReason.trim();

  /*
    A BOX IS CONFIRMED WHERE IT WAS EMPTIED.

    The dock only ever links a landed container, so this is not a button anybody
    can reach — and a server action is a public endpoint whether or not a button
    renders for it. Confirming one still being filled in Guangzhou would sign
    off cargo nobody in Dar has stood in front of, and close a box that has not
    sailed.
  */
  if (container.status !== "ARRIVED" && container.status !== "CLOSED") {
    throw new ConfirmationRefused(
      `${container.reference} has not been discharged yet. A container is confirmed once it has landed and been emptied.`
    );
  }

  const counts = tally(await linesOf(tx, container.id));

  /* Nothing on the manifest is not a container that checked out clean — it is a
     container nothing was ever loaded into, and saying "confirmed" about it puts
     a sign-off in the history of an empty box. */
  if (counts.expected.length === 0) {
    throw new ConfirmationRefused(
      `There is no cargo on ${container.reference} to confirm.`
    );
  }

  let overridden = false;
  if (counts.unchecked.length > 0) {
    const named = counts.unchecked
      .slice(0, 5)
      .map((c) => c.reference)
      .join(", ");
    if (!reason) {
      throw new ConfirmationRefused(
        `${counts.unchecked.length} consignment(s) on ${container.reference} have not been checked in — ${named}${
          counts.unchecked.length > 5 ? " and others" : ""
        }. Check them in, or report them missing.`
      );
    }
    if (!input.mayOverride) {
      throw new ConfirmationRefused(
        "Confirming a container over cargo nobody counted is a manager's decision. Check the rest in, or report them missing."
      );
    }
    if (reason.length < 3) {
      throw new ConfirmationRefused(
        "Say why the container is being confirmed over cargo nobody counted."
      );
    }
    overridden = true;
  }

  if (counts.toSign.length > 0) {
    await tx.darReceiving.updateMany({
      where: { id: { in: counts.toSign.map((c) => c.darReceiving!.id) } },
      data: { verified: true, verifiedAt: new Date() },
    });
  }

  /* Ruled over, not forgotten. Each one leaves the dock with the container and
     keeps a case that says nobody counted it, so it is still on a list somebody
     reads. */
  const stranded: string[] = [];
  for (const item of counts.unchecked) {
    if (item.openCases > 0) continue;
    const reference = await nextExceptionReference(tx);
    const opened = await tx.exceptionCase.create({
      data: {
        reference,
        type: "OTHER",
        priority: "HIGH",
        cargoId: item.id,
        customerId: item.senderId,
        containerId: container.id,
        department: "DAR_WAREHOUSE",
        title: `${item.reference} was never checked off ${container.reference}`,
        description: reason,
        raisedById: actor.id,
      },
      select: { id: true },
    });
    await tx.exceptionEvent.create({
      data: {
        caseId: opened.id,
        to: "OPEN",
        note: `${container.reference} was confirmed with this consignment still unchecked: ${reason}`,
        actorId: actor.id,
      },
    });
    stranded.push(item.reference);
  }

  if (stranded.length > 0) {
    await notifyStaff(
      [
        ...(await staffInDepartment("CUSTOMER_SUPPORT", tx)),
        ...(await staffInDepartment("MANAGEMENT", tx)),
      ],
      {
        kind: "exception.raised",
        title: `${container.reference} confirmed with ${stranded.length} consignment(s) unchecked`,
        body: reason,
        href: "/app/exceptions",
      },
      tx
    );
  }

  /* The confirmation itself, on the container's own history, whether or not
     anything was signed off by it. */
  await tx.containerEvent.create({
    data: {
      containerId: container.id,
      from: container.status as never,
      to: container.status as never,
      note: overridden
        ? `Confirmed at Dar over ${counts.unchecked.length} unchecked consignment(s): ${reason}`
        : `Confirmed at Dar — ${counts.counted.length} counted, ${counts.missing.length} missing, ${counts.damaged.length} damaged`,
      actorId: actor.id,
    },
  });

  return { counts, stranded, overridden };
}
