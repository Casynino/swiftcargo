const Module = require("node:module"); const path = require("node:path"); const root = process.cwd();
const orig = Module._resolveFilename;
Module._resolveFilename = function (req: string, ...rest: unknown[]) {
  if (req === "server-only") return path.join(root, "node_modules/server-only/empty.js");
  return orig.call(this, req, ...rest);
};
const src = require("fs").readFileSync("lib/i18n.ts", "utf8");
const { t } = require("@/lib/i18n");
const keys = [...src.matchAll(/^\s+"((?:[^"\\]|\\.)+)":\s*"/gm)].map((m) => JSON.parse('"' + m[1] + '"'));
const out: Record<string, string> = {};
for (const k of keys) { const v = t("zh", k); if (v && v !== k) out[k] = v; }
require("fs").writeFileSync("guidebook/data/zh.json", JSON.stringify(out));
console.log(Object.keys(out).length, "Chinese terms");
