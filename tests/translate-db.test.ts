import assert from "node:assert/strict";
import Module from "node:module";
import path from "node:path";
import { after, before, describe, test } from "node:test";

import { PrismaClient } from "@prisma/client";

/**
 * THE GOODS IN BOTH LANGUAGES — the glossary against the real database,
 * every write rolled back.
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
let tr: typeof import("@/lib/translate");

before(async () => {
  tr = await import("@/lib/translate");
});
after(() => prisma.$disconnect());

async function rolledBack(fn: (tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0]) => Promise<void>) {
  await prisma
    .$transaction(async (tx) => {
      await fn(tx);
      throw ROLLBACK;
    })
    .catch((error) => {
      if (error !== ROLLBACK) throw error;
    });
}

describe("goods in both languages", () => {
  test("the clerks' own 'English (中文)' shape is split, whichever way round", () => {
    assert.deepEqual(tr.splitPair("Accessories (配件)"), { en: "Accessories", zh: "配件" });
    assert.deepEqual(tr.splitPair("配件（Accessories）"), { en: "Accessories", zh: "配件" });
    assert.equal(tr.splitPair("Ladies shoes"), null);
    assert.equal(tr.splitPair("Model (X200)"), null);
  });

  test("a term the glossary knows is filled in both directions; the typed words are kept", async () => {
    await rolledBack(async (tx) => {
      await tx.cargoTerm.create({ data: { zh: "测试卷烟纸", en: "Test cigarette paper", source: "STAFF" } });
      assert.deepEqual(await tr.bilingual("测试卷烟纸", null, tx), { en: "Test cigarette paper", zh: "测试卷烟纸" });
      assert.deepEqual(await tr.bilingual("test CIGARETTE paper", null, tx), { en: "test CIGARETTE paper", zh: "测试卷烟纸" });
    });
  });

  test("an unknown term stands as typed, never blank, and a line described twice is learned", async () => {
    await rolledBack(async (tx) => {
      assert.deepEqual(await tr.bilingual("未知测试货物", null, tx), { en: null, zh: "未知测试货物" });
      assert.deepEqual(await tr.bilingual("Unknown test goods", null, tx), { en: "Unknown test goods", zh: null });
      await tr.bilingual("Test blenders", "测试搅拌机", tx);
      const learned = await tx.cargoTerm.findUnique({ where: { zh: "测试搅拌机" } });
      assert.equal(learned?.en, "Test blenders");
      assert.equal(learned?.source, "STAFF");
    });
  });

  test("a machine's guess never replaces a person's pairing", async () => {
    await rolledBack(async (tx) => {
      await tx.cargoTerm.create({ data: { zh: "测试配件", en: "Test parts", source: "STAFF" } });
      await tr.learnTerm("测试配件", "Test fittings", "MACHINE", tx);
      assert.equal((await tx.cargoTerm.findUnique({ where: { zh: "测试配件" } }))?.en, "Test parts");
    });
  });
});
