/**
 * Screenshots for the user guidebook, from the running app (npx next dev -p 3177).
 *
 *   node guidebook/shoot.mjs guidebook/shots.json [onlyIdPrefix]
 *
 * Each shot signs in as a role (a session token minted with the local
 * AUTH_SECRET — the same cookie a real sign-in sets), opens the page at the
 * viewport asked for, masks personal phone numbers and email addresses, draws
 * numbered callouts where the spec asks, and saves a JPEG.
 */
import { spawn, execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { encode } from "next-auth/jwt";

const BASE = process.env.GUIDE_BASE || "http://localhost:3178";
const OUT = "guidebook/out/shots";
fs.mkdirSync(OUT, { recursive: true });

const env = Object.fromEntries(
  fs.readFileSync(".env", "utf8").split("\n").filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")]; })
);
const psql = (sql) => execFileSync("psql", ["-At", "-d", "swiftcargo", "-c", sql]).toString().trim();

const VIEW = {
  d: { width: 1440, height: 900, deviceScaleFactor: 1.5, mobile: false, maxH: 1250 },
  m: { width: 390, height: 844, deviceScaleFactor: 2, mobile: true, maxH: 1250 },
  t: { width: 820, height: 1180, deviceScaleFactor: 2, mobile: true, maxH: 1300 },
};

const users = {};
for (const role of ["CHINA_WAREHOUSE", "DAR_WAREHOUSE", "CUSTOMER_SUPPORT", "FINANCE", "MANAGER", "ADMIN", "CUSTOMER"]) {
  users[role] = psql(`select id from "User" where role='${role}' and active order by "createdAt" limit 1`);
}
const tokens = {};
async function token(role) {
  if (!tokens[role]) {
    tokens[role] = await encode({
      token: { id: users[role], sub: users[role], role, name: role },
      secret: env.AUTH_SECRET, salt: "authjs.session-token", maxAge: 6 * 3600,
    });
  }
  return tokens[role];
}

const MASK = `(() => {
  const keepPhone = /767\\s?852\\s?126|656\\s?852\\s?121|17688833885|18574434015/;
  const keepMail = /swiftcargo\\.co\\.tz|cargoswift160@gmail\\.com/i;
  const phone = /(\\+?255[\\s-]?\\d{3}[\\s-]?\\d{3}[\\s-]?\\d{3})|(\\b0[67]\\d{2}[\\s-]?\\d{3}[\\s-]?\\d{3}\\b)/g;
  const mail = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}/g;
  const fix = (v) => v
    .replace(phone, (m) => keepPhone.test(m) ? m : m.slice(0, m.startsWith("+") ? 7 : 4) + " ••• •••")
    .replace(mail, (m) => keepMail.test(m) ? m : m[0] + "•••@" + m.split("@")[1]);
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let n; while ((n = w.nextNode())) { const v = fix(n.nodeValue); if (v !== n.nodeValue) n.nodeValue = v; }
  document.querySelectorAll("input,textarea").forEach((i) => { if (i.value) i.value = fix(i.value); });
  /* Development overlays are not part of the product. */
  document.querySelectorAll("nextjs-portal, [data-nextjs-toast], #__next-build-watcher").forEach((e) => e.remove());
  return true;
})()`;

function calloutJs(callouts) {
  return `(() => {
    const items = ${JSON.stringify(callouts)};
    const find = (c) => {
      if (c.sel) return document.querySelector(c.sel);
      const all = [...document.querySelectorAll(c.tag || "button,a,h1,h2,h3,label,p,span,th,dt,div")];
      return all.find((e) => e.children.length <= (c.depth ?? 3) && e.innerText && e.innerText.trim().startsWith(c.text) && e.getBoundingClientRect().width > 0) || null;
    };
    const placed = [];
    for (const c of items) {
      const el = find(c); if (!el) { placed.push(c.n + ":missing"); continue; }
      const r = el.getBoundingClientRect();
      const b = document.createElement("div");
      b.textContent = c.n;
      Object.assign(b.style, { position: "absolute", zIndex: 2147483647, width: "26px", height: "26px", borderRadius: "999px",
        background: "#f97316", color: "#fff", font: "700 14px/26px Inter, system-ui, sans-serif", textAlign: "center",
        boxShadow: "0 0 0 3px #fff, 0 2px 8px rgba(0,0,0,.35)", pointerEvents: "none",
        left: Math.max(2, r.left + window.scrollX - 13 + (c.dx || 0)) + "px", top: Math.max(2, r.top + window.scrollY - 13 + (c.dy || 0)) + "px" });
      document.body.appendChild(b);
      el.style.outline = "2px solid #f97316"; el.style.outlineOffset = "2px"; el.style.borderRadius = el.style.borderRadius || "6px";
      placed.push(c.n + ":ok");
    }
    return placed.join(",");
  })()`;
}

/* The app's own Chinese, so a callout finds its button on a Chinese page. */
const ZH = fs.existsSync("guidebook/data/zh.json") ? JSON.parse(fs.readFileSync("guidebook/data/zh.json", "utf8")) : {};

const specFile = process.argv[2];
const only = process.argv[3] || "";
const shots = JSON.parse(fs.readFileSync(specFile, "utf8")).filter((s) => s.id.startsWith(only));

const chrome = spawn("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ["--headless=new", "--remote-debugging-port=9341", "--user-data-dir=/tmp/claude-501/chr-guide", "--hide-scrollbars", "--force-color-profile=srgb", "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ws;
for (let i = 0; i < 60; i++) {
  try { const j = await (await fetch("http://127.0.0.1:9341/json")).json(); const p = j.find((t) => t.type === "page"); if (p) { ws = new WebSocket(p.webSocketDebuggerUrl); break; } } catch {}
  await sleep(250);
}
await new Promise((r) => ws.addEventListener("open", r));
let seq = 0; const pend = new Map();
ws.addEventListener("message", (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
const send = (method, params = {}) => new Promise((r) => { const i = ++seq; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expr) => (await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true })).result?.result?.value;

await send("Page.enable");
await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "light" }] });

const log = [];
const originalLocale = psql(`select coalesce(locale,'') from "User" where id='${users.CHINA_WAREHOUSE}'`);
let currentLocale = null;

for (const s of shots) {
  if (s.locale && s.role && s.locale !== currentLocale) {
    psql(`update "User" set locale='${s.locale}' where id='${users[s.role]}'`);
    currentLocale = s.locale;
  }
  await send("Network.clearBrowserCookies");
  if (s.role) {
    await send("Network.setCookie", { name: "authjs.session-token", value: await token(s.role), url: BASE });
    await send("Network.setCookie", { name: "swc.session", value: s.role === "CUSTOMER" ? "customer" : "staff", url: BASE });
  }
  /* Compile the route before the browser waits on it. */
  try { await fetch(BASE + s.path, { headers: { cookie: s.role ? `authjs.session-token=${await token(s.role)}` : "" } }); } catch {}

  for (const v of s.vw || ["d", "m"]) {
    const V = VIEW[v];
    await send("Emulation.setDeviceMetricsOverride", { width: V.width, height: V.height, deviceScaleFactor: V.deviceScaleFactor, mobile: V.mobile });
    await send("Page.navigate", { url: BASE + s.path });
    for (let i = 0; i < 40; i++) { await sleep(250); if ((await ev("document.readyState")) === "complete") break; }
    await sleep(s.wait ?? 900);
    await ev(`document.documentElement.style.scrollBehavior='auto'; document.querySelectorAll('*').forEach(e=>{if(getComputedStyle(e).animationName!=='none'){e.style.animation='none'}}); true`);
    if (s.before) { await ev(s.before); await sleep(s.afterWait ?? 900); }
    await ev(MASK);
    let placed = "";
    let top = 0;
    if (s.anchor) {
      top = (await ev(`(() => { const e = [...document.querySelectorAll('h1,h2,h3,p,span,div,dt,label,button')].find(x => x.children.length <= 2 && x.innerText && x.innerText.trim().startsWith(${JSON.stringify(s.anchor)})); return e ? Math.max(0, Math.round(e.getBoundingClientRect().top + window.scrollY - ${v === "d" ? 90 : 76})) : 0; })()`)) || 0;
    }
    const fullH = await ev("Math.max(document.documentElement.scrollHeight, document.body.scrollHeight)");
    const maxH = s.maxH?.[v] ?? V.maxH;
    const h = Math.max(V.height, Math.min(fullH - top, maxH));
    /* Lay the page out at the height being captured, so a fixed sidebar runs
       the full length and floating bars sit at the bottom where a person sees
       them — not stitched part-way down the picture. */
    await send("Emulation.setDeviceMetricsOverride", { width: V.width, height: h, deviceScaleFactor: V.deviceScaleFactor, mobile: V.mobile });
    await sleep(500);
    if (s.callouts && (!s.calloutsOn || s.calloutsOn.includes(v))) {
      const items = s.locale === "zh" ? s.callouts.map((c) => ({ ...c, text: c.text ? (ZH[c.text] ?? c.text) : c.text })) : s.callouts;
      placed = await ev(calloutJs(items));
    }
    await ev(`window.scrollTo(0, ${top}); true`);
    await sleep(350);
    const shot = await send("Page.captureScreenshot", { format: "jpeg", quality: 84 });
    const file = path.join(OUT, `${s.id}-${v}.jpg`);
    if (!shot.result?.data) { log.push({ id: s.id, v, error: JSON.stringify(shot.error || shot).slice(0, 200) }); continue; }
    fs.writeFileSync(file, Buffer.from(shot.result.data, "base64"));
    const url = await ev("location.pathname");
    log.push({ id: s.id, v, file, url, h, placed });
    process.stdout.write(`${s.id}-${v} ${url === s.path.split("?")[0] ? "" : "(landed " + url + ") "}${placed ? "[" + placed + "]" : ""}\n`);
  }
}

psql(`update "User" set locale=${originalLocale ? `'${originalLocale}'` : "null"} where id='${users.CHINA_WAREHOUSE}'`);
fs.writeFileSync(path.join("guidebook/out", `shots-log-${only || "all"}.json`), JSON.stringify(log, null, 1));
ws.close(); chrome.kill();
