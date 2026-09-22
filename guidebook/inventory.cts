const Module = require("node:module"); const path = require("node:path"); const root = process.cwd();
const orig = Module._resolveFilename;
Module._resolveFilename = function (req: string, ...rest: unknown[]) {
  if (req === "server-only") return path.join(root, "node_modules/server-only/empty.js");
  return orig.call(this, req, ...rest);
};
const { navigationFor, homeFor } = require("@/lib/nav");
const { ROLE_PERMISSIONS } = require("@/lib/rbac");
const roles = ["CHINA_WAREHOUSE", "DAR_WAREHOUSE", "CUSTOMER_SUPPORT", "FINANCE", "MANAGER", "ADMIN"];
const out: any = { menus: {}, permissions: ROLE_PERMISSIONS, home: {} };
for (const r of roles) {
  out.home[r] = homeFor(r);
  out.menus[r] = navigationFor(r).map((s: any) => ({ label: s.label, items: s.items.map((i: any) => ({ label: i.label, href: i.href })) }));
}
require("fs").writeFileSync("guidebook/data/inventory.json", JSON.stringify(out, null, 1));
for (const r of roles) {
  console.log(`\n=== ${r} (home ${out.home[r].href})`);
  for (const s of out.menus[r]) console.log(`  [${s.label}] ` + s.items.map((i: any) => `${i.label} ${i.href}`).join(" · "));
}
