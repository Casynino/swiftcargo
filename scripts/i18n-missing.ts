/**
 * Every English key the interface asks to translate that the Chinese
 * dictionary does not have yet. `npx tsx scripts/i18n-missing.ts [dir…]`
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { t } from "@/lib/i18n";

const roots = process.argv.slice(2).length ? process.argv.slice(2) : ["app/app", "components/app", "lib"];
const files: string[] = [];
const walk = (d: string) => {
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(tsx?|ts)$/.test(f)) files.push(p);
  }
};
roots.forEach((r) => { try { statSync(r).isDirectory() ? walk(r) : files.push(r); } catch {} });

const missing = new Map<string, string>();
const call = /\b(?:t|T|tx|L)\(\s*(?:locale\s*,\s*)?("(?:[^"\\]|\\.)*")\s*\)/g;
const props = /(?:title|description|label)="([^"]+)"/g;
for (const f of files) {
  const src = readFileSync(f, "utf8");
  for (const m of src.matchAll(call)) {
    const key = JSON.parse(m[1]);
    if (t("zh", key) === key && /[a-z]/i.test(key)) missing.set(key, f);
  }
  if (f.includes("app/app") && f.endsWith("page.tsx")) {
    for (const m of src.matchAll(props)) {
      const key = m[1];
      if (t("zh", key) === key && /[a-z]/i.test(key) && !key.startsWith("/")) missing.set(key, f);
    }
  }
}
console.log(JSON.stringify([...missing.keys()].sort(), null, 1));
