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

process.env.AUTH_SECRET ||= "test-secret-for-track-key";

const { trackKey, trackKeyValid } = require("@/lib/track-key") as typeof import("@/lib/track-key");

describe("the key in a customer's tracking link", () => {
  test("opens the reference it was made for, in any case", () => {
    const key = trackKey("SC0019");
    assert.ok(trackKeyValid("SC0019", key));
    assert.ok(trackKeyValid("sc0019", key));
  });

  test("opens nothing else: the next reference needs its own key", () => {
    /* References are a counter. A key that worked on SC0020 would let anybody
       holding one bill walk through everybody's. */
    assert.equal(trackKeyValid("SC0020", trackKey("SC0019")), false);
  });

  test("a missing, empty or made-up key opens nothing", () => {
    assert.equal(trackKeyValid("SC0019", null), false);
    assert.equal(trackKeyValid("SC0019", ""), false);
    assert.equal(trackKeyValid("SC0019", "AAAAAAAAAAAAAAAA"), false);
    assert.equal(trackKeyValid("SC0019", "x".repeat(500)), false);
  });
});
