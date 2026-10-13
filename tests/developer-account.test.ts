import assert from "node:assert/strict";
import Module from "node:module";
import path from "node:path";
import { after, before, describe, test } from "node:test";

import { Prisma, PrismaClient } from "@prisma/client";

import { auditIdentity } from "@/lib/audit-identity";
import { developerStanding } from "@/lib/developer-mode";
import { ROLE_PERMISSIONS, can } from "@/lib/rbac";

/*
  THE DEVELOPER ACCOUNT: WHO MAY ACT, AND WHO IS RECORDED.

  The rules that keep developer mode and staff mode apart. The first groups are
  pure; the last runs against the real database and is rolled back or cleaned.
*/

describe("the developer's permissions", () => {
  test("hold everything the owner holds", () => {
    for (const permission of ROLE_PERMISSIONS.ADMIN) assert.ok(can("DEVELOPER", permission), permission);
  });

  test("and the activity view is the developer's alone", () => {
    assert.ok(can("DEVELOPER", "developer.activity"));
    for (const role of ["ADMIN", "MANAGER", "FINANCE", "CUSTOMER_SUPPORT", "CHINA_WAREHOUSE", "DAR_WAREHOUSE", "CUSTOMER"] as const) {
      assert.equal(can(role, "developer.activity"), false, role);
    }
  });

  test("staff roles gain nothing from the new role", () => {
    assert.equal(can("FINANCE", "settings.manage"), false);
    assert.equal(can("CHINA_WAREHOUSE", "finance.view"), false);
  });
});

describe("whether a sign-in may act as the developer", () => {
  const row = (over: Partial<NonNullable<Parameters<typeof developerStanding>[1]>> = {}) => ({
    userId: "dev",
    mode: "DEVELOPER" as const,
    endedAt: null,
    ...over,
  });

  test("only an active session of that account does", () => {
    assert.equal(developerStanding("dev", row()), "active");
  });
  test("one still waiting for the choice holds no privilege", () => {
    assert.equal(developerStanding("dev", row({ mode: "PENDING" })), "pending");
  });
  test("an ended session, a missing row and somebody else's row hold none", () => {
    assert.equal(developerStanding("dev", row({ mode: "ENDED", endedAt: new Date() })), "none");
    assert.equal(developerStanding("dev", row({ endedAt: new Date() })), "none");
    assert.equal(developerStanding("dev", null), "none");
    assert.equal(developerStanding("dev", row({ userId: "someone-else" })), "none");
  });
});

describe("who an audit line names", () => {
  const person = { id: "u1", name: "Finance Officer", email: "f@x.test", role: "FINANCE" as const, department: "FINANCE" as const };

  test("a staff member is recorded as staff, with their own role and department", () => {
    const who = auditIdentity(person);
    assert.equal(who.actorType, "STAFF");
    assert.equal(who.actorRole, "FINANCE");
    assert.equal(who.actorDepartment, "FINANCE");
    assert.equal(who.actorName, "Finance Officer");
  });

  test("only the developer account is recorded as the developer", () => {
    const dev = auditIdentity({ ...person, id: "d1", name: "Dev", role: "DEVELOPER", department: null });
    assert.equal(dev.actorType, "DEVELOPER");
    assert.equal(dev.actorDepartment, null);
    for (const role of ["ADMIN", "MANAGER", "FINANCE", "CUSTOMER_SUPPORT", "CHINA_WAREHOUSE", "DAR_WAREHOUSE"] as const) {
      assert.equal(auditIdentity({ ...person, role }).actorType, "STAFF", role);
    }
  });
});

/* ---------------------------------------------------------- database --- */

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
let dev: typeof import("@/lib/developer");
const cleanup: string[] = [];

before(async () => {
  dev = await import("@/lib/developer");
});
after(async () => {
  if (cleanup.length) await prisma.user.deleteMany({ where: { id: { in: cleanup } } });
  await prisma.$disconnect();
});

async function inRollback(fn: (tx: Prisma.TransactionClient) => Promise<void>) {
  try {
    await prisma.$transaction(async (tx) => { await fn(tx); throw ROLLBACK; }, { timeout: 60_000 });
  } catch (error) {
    if (error !== ROLLBACK) throw error;
  }
}

describe("provisioning the developer account", () => {
  const long = "a-long-enough-password-1";

  test("creates one account, and running it again changes nothing", () =>
    inRollback(async (tx) => {
      await tx.user.deleteMany({ where: { role: "DEVELOPER" } });
      const first = await dev.provisionDeveloper(tx, { email: "Dev@Example.Test", name: "Dev", password: long });
      assert.equal(first.status, "created");
      const before = await tx.user.findFirstOrThrow({ where: { role: "DEVELOPER" } });
      assert.equal(before.email, "dev@example.test");
      assert.equal(before.department, null);
      assert.notEqual(before.passwordHash, long);

      const again = await dev.provisionDeveloper(tx, { email: "dev@example.test", name: "Other Name", password: "a-different-password-2" });
      assert.equal(again.status, "exists");
      const after = await tx.user.findMany({ where: { role: "DEVELOPER" } });
      assert.equal(after.length, 1);
      assert.equal(after[0].passwordHash, before.passwordHash, "the password is untouched");
      assert.equal(after[0].name, "Dev");
    }));

  test("a password is replaced only when a reset is asked for", () =>
    inRollback(async (tx) => {
      await tx.user.deleteMany({ where: { role: "DEVELOPER" } });
      await dev.provisionDeveloper(tx, { email: "dev@example.test", name: "Dev", password: long });
      const old = (await tx.user.findFirstOrThrow({ where: { role: "DEVELOPER" } })).passwordHash;
      const reset = await dev.provisionDeveloper(tx, { email: "dev@example.test", name: "Dev", password: "a-new-long-password-3", resetPassword: true });
      assert.equal(reset.status, "exists");
      assert.equal(reset.status === "exists" && reset.passwordChanged, true);
      assert.notEqual((await tx.user.findFirstOrThrow({ where: { role: "DEVELOPER" } })).passwordHash, old);
    }));

  test("refuses a second developer, a short password and converting a staff account", () =>
    inRollback(async (tx) => {
      await tx.user.deleteMany({ where: { role: "DEVELOPER" } });
      assert.equal((await dev.provisionDeveloper(tx, { email: "dev@example.test", name: "Dev", password: "short" })).status, "refused");
      await dev.provisionDeveloper(tx, { email: "dev@example.test", name: "Dev", password: long });
      assert.equal((await dev.provisionDeveloper(tx, { email: "second@example.test", name: "Two", password: long })).status, "refused");

      await tx.user.create({ data: { name: "Fin", email: "fin@example.test", passwordHash: "x", role: "FINANCE", department: "FINANCE" } });
      await tx.user.deleteMany({ where: { role: "DEVELOPER" } });
      const refused = await dev.provisionDeveloper(tx, { email: "fin@example.test", name: "Fin", password: long });
      assert.equal(refused.status, "refused");
      assert.equal((await tx.user.findUniqueOrThrow({ where: { email: "fin@example.test" } })).role, "FINANCE");
    }));
});

describe("a developer's server-side session", () => {
  test("holds no privilege until chosen, and none after it ends", async () => {
    const user = await prisma.user.create({
      data: { name: "Session Probe", email: `probe-${Date.now()}@example.test`, passwordHash: "x", role: "ADMIN", department: "MANAGEMENT" },
    });
    cleanup.push(user.id);

    const sid = await dev.startDeveloperSession(user.id, { ipAddress: "127.0.0.1" });
    assert.equal(await dev.standingOf(user.id, sid), "pending");

    assert.equal(await dev.enterDeveloperMode("someone-else", sid), false, "another account cannot activate it");
    assert.equal(await dev.standingOf(user.id, sid), "pending");

    assert.equal(await dev.enterDeveloperMode(user.id, sid), true);
    assert.equal(await dev.standingOf(user.id, sid), "active");
    assert.equal(await dev.enterDeveloperMode(user.id, sid), false, "only a waiting session can be activated");

    await dev.endDeveloperSession(user.id, sid, "switched-to-staff");
    assert.equal(await dev.standingOf(user.id, sid), "none", "switching to a staff account removes the privilege");
    assert.equal(await dev.standingOf(user.id, undefined), "none");
  });

  test("a new sign-in replaces the earlier one", async () => {
    const user = await prisma.user.create({
      data: { name: "Replace Probe", email: `replace-${Date.now()}@example.test`, passwordHash: "x", role: "ADMIN", department: "MANAGEMENT" },
    });
    cleanup.push(user.id);
    const first = await dev.startDeveloperSession(user.id, {});
    await dev.enterDeveloperMode(user.id, first);
    const second = await dev.startDeveloperSession(user.id, {});
    assert.equal(await dev.standingOf(user.id, first), "none", "the old session no longer acts");
    assert.equal(await dev.standingOf(user.id, second), "pending");
  });
});
