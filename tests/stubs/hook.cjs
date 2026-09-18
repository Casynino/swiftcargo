/*
  Swap the modules a server action reaches for that a test process has no
  business having: the request's headers, Next's cache, the `server-only`
  marker and the session. Everything else — the rate book, the counter, the
  audit trail — is the real thing against the real database, so what these
  tests prove is what production does.

  Required for its side effect, before any project file is imported.
*/
const Module = require("node:module");
const path = require("node:path");

const MAP = {
  "@/lib/session": path.join(__dirname, "session.cjs"),
  "next/cache": path.join(__dirname, "cache.cjs"),
  "next/headers": path.join(__dirname, "headers.cjs"),
  "server-only": path.join(__dirname, "empty.cjs"),
};

const original = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  if (MAP[request]) return MAP[request];
  return original.call(this, request, ...rest);
};
