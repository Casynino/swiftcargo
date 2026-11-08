import assert from "node:assert/strict";
import Module from "node:module";
import path from "node:path";
import { after, describe, test } from "node:test";

import { Prisma, PrismaClient } from "@prisma/client";

/*
  A CUSTOMER ON THE BOOKS OPENS THEIR LOGIN WITH THE OFFICE'S CODE.

  The rules that stop a phone number alone from handing over somebody's cargo:
  the code works once, runs out, dies after five wrong guesses, and a code for
  one purpose or one customer is no good for another. Rolled back each time.
*/

const resolve = (Module as unknown as { _resolveFilename: (...args: unknown[]) => string })._resolveFilename;
(Module as unknown as { _resolveFilename: (...args: unknown[]) => string })._resolveFilename = function (
  this: unknown,
  request: unknown,
  ...rest: unknown[]
) {
  if (request === "server-only") return path.join(__dirname, "..", "node_modules", "server-only", "empty.js");
  return resolve.call(this, request, ...rest);
};

const prisma = new PrismaClient();
const ROLLBACK = new Error("rollback");
after(() => prisma.$disconnect());

async function inRollback(fn: (tx: Prisma.TransactionClient) => Promise<void>) {
  try {
    await prisma.$transaction(async (tx) => {
      await fn(tx);
      throw ROLLBACK;
    }, { timeout: 60_000 });
  } catch (error) {
    if (error !== ROLLBACK) throw error;
  }
}

const customer = (tx: Prisma.TransactionClient, tag: string) =>
  tx.customer.create({ data: { code: `T-${tag}-${Date.now()}`, fullName: `Probe ${tag}`, phone: `+2557${String(Date.now()).slice(-8)}` } });

describe("activation codes", () => {
  test("a code works once, for its own customer and its own purpose", () =>
    inRollback(async (tx) => {
      const { issueCode, consumeCode } = await import("@/lib/customer-activation");
      const a = await customer(tx, "A");
      const b = await customer(tx, "B");
      const { code } = await issueCode(tx, a.id, "ACTIVATE", null);
      assert.equal(await consumeCode(tx, b.id, "ACTIVATE", code), false, "another customer's code is no good");
      assert.equal(await consumeCode(tx, a.id, "RESET", code), false, "a code for one purpose is no good for the other");
      assert.equal(await consumeCode(tx, a.id, "ACTIVATE", code), true);
      assert.equal(await consumeCode(tx, a.id, "ACTIVATE", code), false, "it works once");
    }));

  test("a new code replaces the old one", () =>
    inRollback(async (tx) => {
      const { issueCode, consumeCode } = await import("@/lib/customer-activation");
      const c = await customer(tx, "C");
      const first = await issueCode(tx, c.id, "ACTIVATE", null);
      const second = await issueCode(tx, c.id, "ACTIVATE", null);
      if (first.code !== second.code) assert.equal(await consumeCode(tx, c.id, "ACTIVATE", first.code), false);
      assert.equal(await consumeCode(tx, c.id, "ACTIVATE", second.code), true);
    }));

  test("it runs out", () =>
    inRollback(async (tx) => {
      const { issueCode, consumeCode } = await import("@/lib/customer-activation");
      const c = await customer(tx, "D");
      const { code } = await issueCode(tx, c.id, "ACTIVATE", null);
      await tx.activationCode.updateMany({ where: { customerId: c.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
      assert.equal(await consumeCode(tx, c.id, "ACTIVATE", code), false);
    }));

  test("five wrong guesses kill the code, even for the right answer afterwards", () =>
    inRollback(async (tx) => {
      const { issueCode, consumeCode } = await import("@/lib/customer-activation");
      const c = await customer(tx, "E");
      const { code } = await issueCode(tx, c.id, "ACTIVATE", null);
      const wrong = code === "000000" ? "111111" : "000000";
      for (let i = 0; i < 5; i++) assert.equal(await consumeCode(tx, c.id, "ACTIVATE", wrong), false);
      assert.equal(await consumeCode(tx, c.id, "ACTIVATE", code), false);
    }));

  test("only the hash is kept — the code itself is nowhere in the table", () =>
    inRollback(async (tx) => {
      const { issueCode } = await import("@/lib/customer-activation");
      const c = await customer(tx, "F");
      const { code } = await issueCode(tx, c.id, "ACTIVATE", null);
      const row = await tx.activationCode.findFirstOrThrow({ where: { customerId: c.id } });
      assert.notEqual(row.codeHash, code);
      assert.ok(row.codeHash.startsWith("$2"));
    }));
});

describe("who may give a code", () => {
  test("Support and the manager — nobody on the floor, in Finance, or the owner's account", async () => {
    const { can } = await import("@/lib/rbac");
    for (const role of ["CUSTOMER_SUPPORT", "MANAGER"] as const) assert.ok(can(role, "customer.activate"), role);
    for (const role of ["CHINA_WAREHOUSE", "DAR_WAREHOUSE", "FINANCE", "ADMIN", "CUSTOMER", "DEVELOPER"] as const) assert.ok(!can(role, "customer.activate"), role);
  });
});
