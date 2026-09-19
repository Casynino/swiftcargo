/**
 * English the staff screens print that the dictionary has never seen.
 *
 * i18n-missing.ts finds text already asking to be translated. This finds the
 * other half: sentences built in code as plain object properties — a card's
 * note, an attention row's detail, a button's label — which no translation
 * call ever touches.
 *
 * `npx tsx scripts/i18n-unwrapped.ts [dir…]`
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { t } from "@/lib/i18n";

const roots = process.argv.slice(2).length ? process.argv.slice(2) : ["lib", "components/app", "app/app"];
const files: string[] = [];
const walk = (d: string) => {
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.tsx?$/.test(f)) files.push(p);
  }
};
roots.forEach((r) => (statSync(r).isDirectory() ? walk(r) : files.push(r)));

/* The keys whose values are read out on a screen. */
/* The keys whose values are read out on a screen, whether the sentence sits
   on one line, wraps onto several, or is written as a plain backtick string. */
const FIELDS =
  /\b(title|label|detail|description|hint|note|sub|caption|subtitle|explanation|headline|message|summaryLabel|emptyTitle|emptyDescription|pendingLabel|placeholder|ask|reason|metaSub)\s*:\s*(?:\n\s*)?("(?:[^"\\]|\\.)+"|`[^`$]+`)/g;

const missing = new Map<string, string>();
for (const file of files) {
  if (file.endsWith("i18n.ts") || file.includes("/stubs/")) continue;
  const src = readFileSync(file, "utf8");
  for (const m of src.matchAll(FIELDS)) {
    const before = src.slice(Math.max(0, m.index! - 12), m.index!);
    if (/[tT]x?\(\s*$/.test(before)) continue;
    let key: string;
    const raw = m[2];
    try {
      key = raw.startsWith("`") ? raw.slice(1, -1) : (JSON.parse(raw) as string);
    } catch {
      continue; /* a quoted fragment of JSX, not a string literal */
    }
    key = key.replace(/\s+/g, " ").trim();
    if (!/[a-z]{3}/.test(key) || key.startsWith("/") || key.includes("@")) continue;
    if (t("zh", key) === key) missing.set(key, file);
  }
}

console.log(JSON.stringify([...missing.entries()].map(([k, f]) => `${k}   ·   ${f}`), null, 1));
console.log(`${missing.size} phrase(s) with no Chinese`);
