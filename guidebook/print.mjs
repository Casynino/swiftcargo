/**
 * HTML → PDF through headless Chrome, with a running header and page numbers.
 *   node guidebook/print.mjs in.html out.pdf "Header text" "Footer text"
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const [input, output, header = "Swift Cargo", footer = ""] = process.argv.slice(2);
const chrome = spawn("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ["--headless=new", "--remote-debugging-port=9342", "--user-data-dir=/tmp/claude-501/chr-print", "--allow-file-access-from-files", "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ws;
for (let i = 0; i < 60; i++) {
  try { const j = await (await fetch("http://127.0.0.1:9342/json")).json(); const p = j.find((t) => t.type === "page"); if (p) { ws = new WebSocket(p.webSocketDebuggerUrl); break; } } catch {}
  await sleep(250);
}
await new Promise((r) => ws.addEventListener("open", r));
let seq = 0; const pend = new Map();
ws.addEventListener("message", (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
const send = (method, params = {}) => new Promise((r) => { const i = ++seq; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });

await send("Page.enable");
await send("Page.navigate", { url: "file://" + path.resolve(input) });
for (let i = 0; i < 120; i++) {
  await sleep(250);
  const r = await send("Runtime.evaluate", { expression: "document.readyState==='complete' && [...document.images].every(i=>i.complete)", returnByValue: true });
  if (r.result?.result?.value) break;
}
await sleep(600);
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
const style = "font-family:'Inter','PingFang SC','Helvetica Neue',Arial,sans-serif;font-size:7.5px;color:#64748b;width:100%;padding:0 16mm;display:flex;justify-content:space-between;";
const res = await send("Page.printToPDF", {
  printBackground: true,
  preferCSSPageSize: true,
  displayHeaderFooter: true,
  headerTemplate: `<div style="${style}"><span style="color:#0e4c87;font-weight:700;letter-spacing:.08em">SWIFT CARGO</span><span>${esc(header)}</span></div>`,
  footerTemplate: `<div style="${style}"><span>${esc(footer)}</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`,
  marginTop: 0.6, marginBottom: 0.6,
});
if (!res.result?.data) { console.error("print failed", JSON.stringify(res).slice(0, 300)); process.exit(1); }
fs.writeFileSync(output, Buffer.from(res.result.data, "base64"));
ws.close(); chrome.kill();
