import assert from "node:assert/strict";
import Module from "node:module";
import path from "node:path";
import { after, describe, test } from "node:test";

import { PrismaClient } from "@prisma/client";

/*
  THE RECORD OF AN AUTOMATIC JOB.

  A run is written down when it ends, a failure is recorded and then raised as
  before, and the record never changes what the job returns.
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
const NAME = "test-job-record";

after(async () => {
  await prisma.jobRun.deleteMany({ where: { name: NAME } });
  await prisma.$disconnect();
});

describe("runJob", () => {
  test("records a finished run with what it reported and how long it took", async () => {
    const { runJob } = await import("@/lib/jobs");
    const out = await runJob(NAME, async () => ({ checked: 3, charged: 1 }));
    assert.deepEqual(out, { checked: 3, charged: 1 });
    const row = await prisma.jobRun.findFirst({ where: { name: NAME }, orderBy: { startedAt: "desc" } });
    assert.equal(row?.ok, true);
    assert.equal(row?.result, JSON.stringify({ checked: 3, charged: 1 }));
    assert.ok(row?.finishedAt && row.ms !== null);
  });

  test("records a failure, hides any database address, and still raises it", async () => {
    const { runJob } = await import("@/lib/jobs");
    await assert.rejects(
      runJob(NAME, async () => {
        throw new Error("cannot reach postgresql://user:secret@host:5432/db");
      }),
      /cannot reach/
    );
    const row = await prisma.jobRun.findFirst({ where: { name: NAME, ok: false }, orderBy: { startedAt: "desc" } });
    assert.ok(row);
    assert.ok(!row.result?.includes("secret"));
  });
});
