import assert from "node:assert/strict";
import Module from "node:module";
import path from "node:path";
import { describe, test } from "node:test";

/* `server-only` refuses to load outside the Next server; answered with an
   empty module, as in tests/tracking-public.test.ts. */
const resolve = (Module as unknown as { _resolveFilename: (...args: unknown[]) => string })
  ._resolveFilename;
(Module as unknown as { _resolveFilename: (...args: unknown[]) => string })._resolveFilename =
  function (this: unknown, request: unknown, ...rest: unknown[]) {
    if (request === "server-only") {
      return path.join(__dirname, "..", "node_modules", "server-only", "empty.js");
    }
    return resolve.call(this, request, ...rest);
  };

const { normalSiteUrl } = require("@/lib/site-url") as typeof import("@/lib/site-url");

describe("the public address, however it was typed", () => {
  test("a bare host gets https:// — the value that broke every build", () => {
    assert.equal(normalSiteUrl("www.swiftcargotz.com"), "https://www.swiftcargotz.com");
  });

  test("a full address is kept, without its trailing slash or path", () => {
    assert.equal(normalSiteUrl("https://www.swiftcargotz.com/"), "https://www.swiftcargotz.com");
    assert.equal(normalSiteUrl("  https://www.swiftcargotz.com  "), "https://www.swiftcargotz.com");
  });

  test("nothing, junk or this machine is treated as unset", () => {
    assert.equal(normalSiteUrl(undefined), null);
    assert.equal(normalSiteUrl(""), null);
    assert.equal(normalSiteUrl("http://localhost:3177"), null);
    assert.equal(normalSiteUrl("not a url at all"), null);
  });
});
