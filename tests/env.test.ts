import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { assertProductionEnvironment, EnvironmentError, environmentProblems } from "@/lib/env";

const complete = {
  NODE_ENV: "production",
  DATABASE_URL: "postgresql://u:p@ep-x-pooler.neon.tech/swiftcargo?sslmode=require",
  DIRECT_URL: "postgresql://u:p@ep-x.neon.tech/swiftcargo?sslmode=require",
  AUTH_SECRET: "a".repeat(44),
  NEXT_PUBLIC_SITE_URL: "https://swiftcargo.co.tz",
};

describe("production environment", () => {
  test("a complete environment passes", () => {
    assert.deepEqual(environmentProblems(complete), []);
    assert.doesNotThrow(() => assertProductionEnvironment(complete));
  });

  test("development is never held to it", () => {
    assert.doesNotThrow(() => assertProductionEnvironment({ NODE_ENV: "development" }));
  });

  test("names every missing or unusable variable", () => {
    const problems = environmentProblems({ NODE_ENV: "production" });
    for (const name of ["DATABASE_URL", "AUTH_SECRET", "NEXT_PUBLIC_SITE_URL"]) {
      assert.ok(problems.some((p) => p.startsWith(name)), `${name} reported`);
    }
    assert.throws(() => assertProductionEnvironment({ NODE_ENV: "production" }), EnvironmentError);
  });

  test("a localhost site address or short secret is refused", () => {
    const problems = environmentProblems({
      ...complete,
      NEXT_PUBLIC_SITE_URL: "http://localhost:3000",
      AUTH_SECRET: "short",
    });
    assert.ok(problems.some((p) => p.startsWith("NEXT_PUBLIC_SITE_URL")));
    assert.ok(problems.some((p) => p.startsWith("AUTH_SECRET")));
  });

  test("NEXTAUTH_SECRET is accepted in place of AUTH_SECRET", () => {
    const { AUTH_SECRET, ...rest } = complete;
    assert.deepEqual(environmentProblems({ ...rest, NEXTAUTH_SECRET: AUTH_SECRET }), []);
  });

  test("on Vercel, uploads require the blob store", () => {
    assert.ok(
      environmentProblems({ ...complete, VERCEL: "1" }).some((p) =>
        p.startsWith("BLOB_READ_WRITE_TOKEN")
      )
    );
    assert.deepEqual(
      environmentProblems({ ...complete, VERCEL: "1", BLOB_READ_WRITE_TOKEN: "vercel_blob_rw_x_y" }),
      []
    );
  });
});
