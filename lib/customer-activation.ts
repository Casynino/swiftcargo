import "server-only";

import { randomInt } from "node:crypto";

import bcrypt from "bcryptjs";

import type { Prisma } from "@prisma/client";

/**
 * THE ONE-TIME CODE THAT OPENS A CUSTOMER'S PORTAL LOGIN.
 *
 * A customer registered at the counter has a record, cargo and bills but no
 * login. Their phone number is written on every box and delivery note, so it
 * proves nothing. Instead the office — who has spoken to the person — reads
 * them a six-digit code, and the code is what lets them set a password. It
 * expires in 15 minutes, works once, dies after five wrong guesses, and only
 * its hash is stored: nobody, staff included, can read one back.
 */
export const CODE_MINUTES = 15;
export const MAX_GUESSES = 5;

export type CodePurpose = "ACTIVATE" | "RESET";
type Db = Prisma.TransactionClient;

export const newCode = () => String(randomInt(0, 1_000_000)).padStart(6, "0");

/** Replaces any unused code for this customer and purpose with a fresh one. */
export async function issueCode(db: Db, customerId: string, purpose: CodePurpose, issuedById: string | null) {
  const code = newCode();
  await db.activationCode.deleteMany({ where: { customerId, purpose, usedAt: null } });
  const expiresAt = new Date(Date.now() + CODE_MINUTES * 60_000);
  await db.activationCode.create({
    data: { customerId, purpose, issuedById, expiresAt, codeHash: await bcrypt.hash(code, 8) },
  });
  return { code, expiresAt };
}

/**
 * Checks a typed code and, when right, uses it up. A wrong guess is counted
 * before the answer is given, so parallel guesses cannot beat the limit.
 */
export async function consumeCode(db: Db, customerId: string, purpose: CodePurpose, typed: string): Promise<boolean> {
  const row = await db.activationCode.findFirst({
    where: { customerId, purpose, usedAt: null, expiresAt: { gt: new Date() }, attempts: { lt: MAX_GUESSES } },
    orderBy: { createdAt: "desc" },
  });
  if (!row) return false;
  const counted = await db.activationCode.updateMany({
    where: { id: row.id, usedAt: null, attempts: { lt: MAX_GUESSES } },
    data: { attempts: { increment: 1 } },
  });
  if (counted.count === 0) return false;
  if (!/^\d{6}$/.test(typed.trim()) || !(await bcrypt.compare(typed.trim(), row.codeHash))) return false;
  const used = await db.activationCode.updateMany({ where: { id: row.id, usedAt: null }, data: { usedAt: new Date() } });
  return used.count === 1;
}
