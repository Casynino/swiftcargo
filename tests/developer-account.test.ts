import assert from "node:assert/strict";
import Module from "node:module";
import path from "node:path";
import { after, before, describe, test } from "node:test";

import { Prisma, PrismaClient } from "@prisma/client";

import { auditIdentity } from "@/lib/audit-identity";
import { canWorkAs, developerStanding, workAsLive } from "@/lib/developer-mode";
import { ROLE_PERMISSIONS, can } from "@/lib/rbac";

/*
  THE DEVELOPER ACCOUNT: WHO MAY ACT, AND WHO IS RECORDED.

  The rules that keep developer mode and staff mode apart. The first groups are
  pure; the last runs against the real database and is rolled back or cleaned.
*/

describe("the developer's permissions", () => {
  test("look at everything the business holds", () => {
    for (const p of ["cargo.view", "finance.view", "accounting.view", "audit.view", "customer.view", "release.view", "expense.view"] as const) {
      assert.ok(can("DEVELOPER", p), p);
    }
  });

  test("change nothing operational — that is done by working as the person who does it", () => {
    for (const p of [
      "payment.verify", "payment.record", "invoice.priceConfirm", "invoice.issue", "invoice.discount", "cargo.clear",
      "release.execute", "cargo.edit", "cargo.delete", "cargo.amendDar", "container.arrive", "container.depart",
      "expense.record", "payroll.approve", "settings.manage", "cbm.override", "receiving.dar", "receiving.china",
    ] as const) {
      assert.equal(can("DEVELOPER", p), false, p);
    }
  });

  test("open accounts, and own the developer pages — alone", () => {
    assert.ok(can("DEVELOPER", "user.manage"));
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

/* The developer's audit lines are append-only, so a developer account that has
   acted cannot be deleted. The tests stand it aside instead, inside a
   transaction that is rolled back. */
async function clearDeveloper(tx: Prisma.TransactionClient) {
  await tx.user.updateMany({
    where: { role: "DEVELOPER" },
    data: { role: "ADMIN", email: `stood-aside-${Date.now()}@example.test` },
  });
}

describe("provisioning the developer account", () => {
  const long = "a-long-enough-password-1";

  test("creates one account, and running it again changes nothing", () =>
    inRollback(async (tx) => {
      await clearDeveloper(tx);
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
      await clearDeveloper(tx);
      await dev.provisionDeveloper(tx, { email: "dev@example.test", name: "Dev", password: long });
      const old = (await tx.user.findFirstOrThrow({ where: { role: "DEVELOPER" } })).passwordHash;
      const reset = await dev.provisionDeveloper(tx, { email: "dev@example.test", name: "Dev", password: "a-new-long-password-3", resetPassword: true });
      assert.equal(reset.status, "exists");
      assert.equal(reset.status === "exists" && reset.passwordChanged, true);
      assert.notEqual((await tx.user.findFirstOrThrow({ where: { role: "DEVELOPER" } })).passwordHash, old);
    }));

  test("refuses a second developer, a short password and converting a staff account", () =>
    inRollback(async (tx) => {
      await clearDeveloper(tx);
      assert.equal((await dev.provisionDeveloper(tx, { email: "dev@example.test", name: "Dev", password: "short" })).status, "refused");
      await dev.provisionDeveloper(tx, { email: "dev@example.test", name: "Dev", password: long });
      assert.equal((await dev.provisionDeveloper(tx, { email: "second@example.test", name: "Two", password: long })).status, "refused");

      await tx.user.create({ data: { name: "Fin", email: "fin@example.test", passwordHash: "x", role: "FINANCE", department: "FINANCE" } });
      await clearDeveloper(tx);
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

  test("signing in can open developer mode at once — there is no second step", async () => {
    const user = await prisma.user.create({
      data: { name: "Direct Probe", email: `direct-${Date.now()}@example.test`, passwordHash: "x", role: "ADMIN", department: "MANAGEMENT" },
    });
    cleanup.push(user.id);
    const sid = await dev.startDeveloperSession(user.id, {}, true);
    assert.equal(await dev.standingOf(user.id, sid), "active");
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

describe("who the developer may work as", () => {
  const live = { id: "t", role: "FINANCE", active: true, status: "ACTIVE" };
  test("any live staff account, the owner included", () => {
    assert.ok(canWorkAs(live, "dev"));
    assert.ok(canWorkAs({ ...live, role: "ADMIN" }, "dev"));
  });
  test("never themselves, another developer, a customer, or a suspended or inactive account", () => {
    assert.equal(canWorkAs({ ...live, id: "dev" }, "dev"), false);
    assert.equal(canWorkAs({ ...live, role: "DEVELOPER" }, "dev"), false);
    assert.equal(canWorkAs({ ...live, role: "CUSTOMER" }, "dev"), false);
    assert.equal(canWorkAs({ ...live, status: "SUSPENDED" }, "dev"), false);
    assert.equal(canWorkAs({ ...live, active: false }, "dev"), false);
  });
  test("a developer sign-in and a work-as both run out", () => {
    const now = Date.now();
    const hours = (n: number) => new Date(now - n * 3_600_000);
    assert.equal(developerStanding("d", { userId: "d", mode: "DEVELOPER", endedAt: null, createdAt: hours(1) }, now), "active");
    assert.equal(developerStanding("d", { userId: "d", mode: "DEVELOPER", endedAt: null, createdAt: hours(9) }, now), "none");
    assert.equal(workAsLive(hours(3), now), true);
    assert.equal(workAsLive(hours(5), now), false);
    assert.equal(workAsLive(null, now), false);
  });
});

describe("work as is recorded under the developer", () => {
  test("the line names the developer, not the person worked as", () => {
    const who = auditIdentity({
      id: "finance-1", name: "Finance Officer", email: "f@x.test", role: "FINANCE", department: "FINANCE",
      impersonatedBy: { id: "dev-1", name: "Dev", email: "dev@x.test" },
    });
    assert.equal(who.actorId, "dev-1");
    assert.equal(who.actorType, "DEVELOPER");
    assert.equal(who.actorName, "Dev");
    assert.equal(who.actorDepartment, null);
  });
});

describe("working as, against the database", () => {
  test("starts only for eligible people, follows the session, and ends with it", async () => {
    const stamp = Date.now();
    const mk = (suffix: string, role: "FINANCE" | "ADMIN", extra: Record<string, unknown> = {}) =>
      prisma.user.create({
        data: { name: `Probe ${suffix}`, email: `probe-${suffix}-${stamp}@example.test`, passwordHash: "x", role, department: role === "ADMIN" ? "MANAGEMENT" : "FINANCE", ...extra },
      });
    const [devish, finance, suspended] = await Promise.all([
      mk("dev", "ADMIN"),
      mk("fin", "FINANCE"),
      mk("sus", "FINANCE", { status: "SUSPENDED" }),
    ]);
    cleanup.push(devish.id, finance.id, suspended.id);

    const sid = await dev.startDeveloperSession(devish.id, {});
    assert.equal(await dev.startWorkingAs(devish.id, sid, finance.id), null, "not before developer mode is chosen");
    await dev.enterDeveloperMode(devish.id, sid);

    assert.equal(await dev.startWorkingAs(devish.id, sid, devish.id), null, "never themselves");
    assert.equal(await dev.startWorkingAs(devish.id, sid, suspended.id), null, "never a suspended account");
    assert.equal(await dev.workingAs(devish.id, sid), null);

    assert.equal((await dev.startWorkingAs(devish.id, sid, finance.id))?.id, finance.id);
    assert.equal((await dev.workingAs(devish.id, sid))?.id, finance.id);
    assert.equal(await dev.workingAs("someone-else", sid), null, "another account cannot use this session");

    await prisma.user.update({ where: { id: finance.id }, data: { status: "SUSPENDED" } });
    assert.equal(await dev.workingAs(devish.id, sid), null, "ends the moment the person is suspended");
    await prisma.user.update({ where: { id: finance.id }, data: { status: "ACTIVE" } });

    assert.equal((await dev.workingAs(devish.id, sid))?.id, finance.id);
    await dev.stopWorkingAs(devish.id, sid);
    assert.equal(await dev.workingAs(devish.id, sid), null, "Stop ends it");

    await dev.startWorkingAs(devish.id, sid, finance.id);
    await dev.endDeveloperSession(devish.id, sid, "signed-out");
    assert.equal(await dev.workingAs(devish.id, sid), null, "ending the session ends it");
  });
});

describe("the developer's audit lines cannot be rewritten", () => {
  test("update and delete are refused for the developer's, and allowed for staff's", () =>
    inRollback(async (tx) => {
      const dev1 = await tx.auditLog.create({ data: { action: "probe", entity: "Probe", summary: "dev", actorType: "DEVELOPER" } });
      const staff = await tx.auditLog.create({ data: { action: "probe", entity: "Probe", summary: "staff", actorType: "STAFF" } });

      await assert.rejects(() => tx.$executeRaw`UPDATE "AuditLog" SET "summary" = 'changed' WHERE "id" = ${dev1.id}`, /append-only/);
    }));

  test("a refused delete leaves the line there", async () => {
    await assert.rejects(
      () =>
        prisma.$transaction(async (tx) => {
          const row = await tx.auditLog.create({ data: { action: "probe", entity: "Probe", summary: "dev", actorType: "DEVELOPER" } });
          await tx.$executeRaw`DELETE FROM "AuditLog" WHERE "id" = ${row.id}`;
        }),
      /append-only/
    );
  });

  test("staff lines behave as they always did", () =>
    inRollback(async (tx) => {
      const staff = await tx.auditLog.create({ data: { action: "probe", entity: "Probe", summary: "staff", actorType: "STAFF" } });
      await tx.auditLog.update({ where: { id: staff.id }, data: { summary: "edited" } });
      await tx.auditLog.delete({ where: { id: staff.id } });
    }));
});

describe("deleting an account", () => {
  test("scrubs what is personal, keeps the row, and the account can never sign in", () =>
    inRollback(async (tx) => {
      const { scrubAccount, isDeletedEmail, DELETED_NAME } = await import("@/lib/developer-accounts");
      const u = await tx.user.create({ data: { name: "Real Person", email: "real@example.test", phone: "+255700000000", passwordHash: "secret-hash", role: "FINANCE", department: "FINANCE" } });
      await tx.notification.create({ data: { userId: u.id, kind: "probe", title: "hello", body: "x" } });
      await scrubAccount(tx, u.id);
      const after = await tx.user.findUniqueOrThrow({ where: { id: u.id } });
      assert.equal(after.name, DELETED_NAME);
      assert.ok(isDeletedEmail(after.email));
      assert.equal(after.phone, null);
      assert.notEqual(after.passwordHash, "secret-hash");
      assert.equal(after.active, false);
      assert.equal(after.status, "INACTIVE");
      assert.equal(await tx.notification.count({ where: { userId: u.id } }), 0);
    }));

  test("the last active owner is protected; with another owner it is not", () =>
    inRollback(async (tx) => {
      const { wouldLeaveNoOwner } = await import("@/lib/developer-accounts");
      await tx.user.updateMany({ where: { role: "ADMIN" }, data: { status: "SUSPENDED" } });
      const only = await tx.user.create({ data: { name: "Only Owner", email: "only@example.test", passwordHash: "x", role: "ADMIN", department: "MANAGEMENT" } });
      assert.equal(await wouldLeaveNoOwner(tx, only), true);
      await tx.user.create({ data: { name: "Second Owner", email: "second-owner@example.test", passwordHash: "x", role: "ADMIN", department: "MANAGEMENT" } });
      assert.equal(await wouldLeaveNoOwner(tx, only), false);
      const fin = await tx.user.create({ data: { name: "Fin2", email: "fin2@example.test", passwordHash: "x", role: "FINANCE", department: "FINANCE" } });
      assert.equal(await wouldLeaveNoOwner(tx, fin), false);
    }));
});
