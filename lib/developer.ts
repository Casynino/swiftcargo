import "server-only";

import bcrypt from "bcryptjs";

import {
  DEVELOPER_MIN_PASSWORD,
  developerStanding,
  type DeveloperStanding,
} from "@/lib/developer-mode";
import { prisma, type TxClient } from "@/lib/prisma";

/**
 * THE DEVELOPER ACCOUNT: ONE IDENTITY, TWO WAYS IN.
 *
 * Signing in with the developer's credentials proves who they are, and no
 * more. It opens a DeveloperSession in the PENDING state, which holds no
 * privilege: the person then chooses, and only choosing developer mode makes
 * the session active. Choosing a staff account ends the developer session and
 * sends them to the ordinary staff login — they are then that staff member and
 * nobody else, under that member's own role and credentials, and the work is
 * recorded under that member's name.
 *
 * Nothing here lets anyone become another account by naming it.
 */

/** A new sign-in replaces any earlier one: one live developer session at a time. */
export async function startDeveloperSession(
  userId: string,
  context: { ipAddress?: string | null; userAgent?: string | null }
): Promise<string> {
  return prisma.$transaction(async (tx) => {
    await tx.developerSession.updateMany({
      where: { userId, endedAt: null },
      data: { mode: "ENDED", endedAt: new Date(), endedBy: "replaced" },
    });
    const row = await tx.developerSession.create({
      data: {
        userId,
        mode: "PENDING",
        ipAddress: context.ipAddress ?? null,
        userAgent: context.userAgent?.slice(0, 500) ?? null,
      },
      select: { id: true },
    });
    return row.id;
  });
}

/** Where this sign-in stands, read from the database — never from the browser. */
export async function standingOf(userId: string, sid: string | undefined): Promise<DeveloperStanding> {
  if (!sid) return "none";
  const row = await prisma.developerSession.findUnique({
    where: { id: sid },
    select: { userId: true, mode: true, endedAt: true },
  });
  return developerStanding(userId, row);
}

/** Developer mode, entered on purpose. Only a waiting session can be activated. */
export async function enterDeveloperMode(userId: string, sid: string): Promise<boolean> {
  const done = await prisma.developerSession.updateMany({
    where: { id: sid, userId, mode: "PENDING", endedAt: null },
    data: { mode: "DEVELOPER", chosenAt: new Date() },
  });
  return done.count === 1;
}

export async function endDeveloperSession(
  userId: string,
  sid: string | undefined,
  reason: "signed-out" | "switched-to-staff"
) {
  if (!sid) return;
  await prisma.developerSession.updateMany({
    where: { id: sid, userId, endedAt: null },
    data: { mode: "ENDED", endedAt: new Date(), endedBy: reason },
  });
}

export type ProvisionResult =
  | { status: "created"; id: string }
  | { status: "exists"; id: string; passwordChanged: boolean }
  | { status: "refused"; reason: string };

/**
 * CREATE OR CONFIRM THE DEVELOPER ACCOUNT. SAFE TO RUN ANY NUMBER OF TIMES.
 *
 * - There is at most one developer. A second, differently-named account is
 *   refused rather than made.
 * - An existing developer is left exactly as it is: its password is changed
 *   only when a reset is asked for out loud, never by running this again.
 * - An existing ordinary account with this address is never converted — that
 *   would turn somebody's staff login into the system's highest one.
 * - The password comes from the caller, is held to a length, and is stored as
 *   a bcrypt hash. It is not written anywhere else, and is not returned.
 */
export async function provisionDeveloper(
  client: TxClient | typeof prisma,
  input: { email: string; name: string; password?: string; resetPassword?: boolean }
): Promise<ProvisionResult> {
  const email = input.email.trim().toLowerCase();
  const name = input.name.trim() || "Developer";
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { status: "refused", reason: "That is not an email address." };
  }

  const existingDeveloper = await client.user.findFirst({
    where: { role: "DEVELOPER" },
    select: { id: true, email: true },
  });
  if (existingDeveloper && existingDeveloper.email !== email) {
    return {
      status: "refused",
      reason: "A developer account already exists under a different address. There is only ever one.",
    };
  }
  const sameAddress = await client.user.findUnique({
    where: { email },
    select: { id: true, role: true },
  });
  if (sameAddress && sameAddress.role !== "DEVELOPER") {
    return {
      status: "refused",
      reason: "That address belongs to an ordinary account. It is not converted.",
    };
  }

  if (sameAddress) {
    let passwordChanged = false;
    if (input.resetPassword) {
      if (!input.password || input.password.length < DEVELOPER_MIN_PASSWORD) {
        return { status: "refused", reason: `A new password needs at least ${DEVELOPER_MIN_PASSWORD} characters.` };
      }
      await client.user.update({
        where: { id: sameAddress.id },
        data: { passwordHash: await bcrypt.hash(input.password, 12), active: true, status: "ACTIVE" },
      });
      passwordChanged = true;
    }
    return { status: "exists", id: sameAddress.id, passwordChanged };
  }

  if (!input.password || input.password.length < DEVELOPER_MIN_PASSWORD) {
    return { status: "refused", reason: `The password needs at least ${DEVELOPER_MIN_PASSWORD} characters.` };
  }
  const created = await client.user.create({
    data: {
      name,
      email,
      passwordHash: await bcrypt.hash(input.password, 12),
      role: "DEVELOPER",
      department: null,
      status: "ACTIVE",
      active: true,
    },
    select: { id: true },
  });
  return { status: "created", id: created.id };
}
