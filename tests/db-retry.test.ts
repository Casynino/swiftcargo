import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { withRetry } from "@/lib/db-retry";

const unreachable = Object.assign(new Error("Can't reach database server"), { code: "P1001" });

describe("withRetry", () => {
  test("asks again when the database was asleep, and returns the answer", async () => {
    let calls = 0;
    const out = await withRetry(async () => {
      calls++;
      if (calls < 3) throw unreachable;
      return "ok";
    }, [1, 1, 1]);
    assert.equal(out, "ok");
    assert.equal(calls, 3);
  });

  test("gives up after the last wait and raises the original error", async () => {
    let calls = 0;
    await assert.rejects(
      withRetry(async () => {
        calls++;
        throw unreachable;
      }, [1, 1]),
      /Can't reach/
    );
    assert.equal(calls, 3);
  });

  test("never repeats any other failure — it may already have run", async () => {
    let calls = 0;
    await assert.rejects(
      withRetry(async () => {
        calls++;
        throw Object.assign(new Error("Unique constraint"), { code: "P2002" });
      }, [1, 1]),
      /Unique/
    );
    assert.equal(calls, 1);
  });
});
