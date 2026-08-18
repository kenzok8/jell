#!/usr/bin/env node
/**
 * bench-fullload.mjs <label> — where the time goes in ONE full-page LuCI
 * navigation, split between the device and the browser, over raw CDP
 * (headless Chrome, no npm deps, node >= 22).
 *
 * bench-router.mjs answers "how much faster is the same-document router";
 * this answers "what is the full load actually spending its time on", which
 * is what the router.md stage table and the architecture diagram quote.
 *
 * Every measured load is preceded by another full load, so static assets are
 * already cached and only the uncacheable work is left — the same warm state
 * bench-router.mjs measures the router in.
 *
 * env: HOST (default http://192.168.1.1), COOKIE_NAME, COOKIE_VALUE,
 *      CHROME_BIN, RUNS (default and minimum 10), PAGES (comma-separated
 *      paths under /cgi-bin/luci; defaults to the router.md sample).
 *
 * Per page it reports the medians of, all on the document's own clock
 * (time origin = navigation start):
 *   ttfb        responseStart of the page HTML — dispatcher run #1
 *   htmlEnd     responseEnd of the page HTML
 *   trStart/End the admin/translations/<lang> script — dispatcher run #2,
 *               a parser-blocking <script> in <head>
 *   dcl         domContentLoadedEventEnd
 *   viewReady   first non-spinner child inside #view — the view is painted
 *   serverMs    htmlEnd + (trEnd - trStart): wall time owned by the device
 *   bytes       transferEncodedBodyLength of the HTML and the catalog
 */
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const HOST = (process.env.HOST ?? "http://192.168.1.1").replace(/\/+$/, "");
const LABEL = process.argv[2] ?? "run";
// measuring.md: medians of at least 10 runs.
const RUNS = Math.max(10, +(process.env.RUNS ?? 10) || 10);
const CHROME =
  process.env.CHROME_BIN ??
  (process.platform === "darwin"
    ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
    : "google-chrome");
if (!process.env.COOKIE_NAME || !process.env.COOKIE_VALUE)
  throw new Error("COOKIE_NAME and COOKIE_VALUE are required");
const COOKIE = {
  name: process.env.COOKIE_NAME,
  value: process.env.COOKIE_VALUE,
  domain: new URL(HOST).hostname,
  path: "/",
};
// The bench-router.mjs timing sample, verbatim, so the two runs compare.
const PAGES = (
  process.env.PAGES ??
  [
    "admin/status/routesj",
    "admin/status/nftables",
    "admin/status/logs",
    "admin/status/processes",
    "admin/status/channel_analysis",
    "admin/status/realtime",
    "admin/system/system",
    "admin/system/admin",
  ].join(",")
)
  .split(",")
  .map((p) => `${HOST}/cgi-bin/luci/${p.trim().replace(/^\/+/, "")}`);
// Loaded between measured loads so the measured one is never the first hit.
const WARMUP = `${HOST}/cgi-bin/luci/admin/status/overview`;

const median = (v) => {
  const s = [...v].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const r0 = (v) => (v == null ? null : +v.toFixed(0));

/* ---------- chrome + CDP ---------- */
const profile = mkdtempSync(join(tmpdir(), "cdp-aurora-fullload-"));
const chrome = spawn(
  CHROME,
  [
    "--headless=new",
    "--remote-debugging-port=0",
    `--user-data-dir=${profile}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--ignore-certificate-errors",
    "about:blank",
  ],
  { stdio: ["ignore", "ignore", "pipe"] },
);
let wsUrl = "";
chrome.stderr.setEncoding("utf8");
chrome.stderr.on("data", (d) => {
  const m = d.match(/ws:\/\/[^\s]+/);
  if (m && !wsUrl) wsUrl = m[0];
});
const deadline = Date.now() + 20000;
while (!wsUrl && Date.now() < deadline) await sleep(50);
if (!wsUrl) throw new Error("chrome did not report a devtools endpoint");

const ws = new WebSocket(wsUrl);
await new Promise((res, rej) => {
  ws.addEventListener("open", res, { once: true });
  ws.addEventListener("error", rej, { once: true });
});
let msgId = 0;
const pending = new Map();
const handlers = new Set();
ws.addEventListener("message", (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id != null && pending.has(m.id)) {
    const { res, rej } = pending.get(m.id);
    pending.delete(m.id);
    m.error ? rej(new Error(m.error.message)) : res(m.result);
    return;
  }
  for (const h of handlers) h(m);
});
function send(method, params = {}, sessionId) {
  const id = ++msgId;
  ws.send(JSON.stringify({ id, method, params, sessionId }));
  return new Promise((res, rej) => pending.set(id, { res, rej }));
}
function waitEvent(method, sessionId, timeout = 30000) {
  return new Promise((res, rej) => {
    const t = setTimeout(() => (handlers.delete(h), rej(new Error(`timeout ${method}`))), timeout);
    const h = (m) => {
      if (m.method !== method || (sessionId && m.sessionId !== sessionId)) return;
      clearTimeout(t);
      handlers.delete(h);
      res(m.params);
    };
    handlers.add(h);
  });
}

const { targetId } = await send("Target.createTarget", { url: "about:blank" });
const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
await send("Page.enable", {}, sessionId);
await send("Runtime.enable", {}, sessionId);

await send("Storage.setCookies", { cookies: [COOKIE] });
await send(
  "Emulation.setDeviceMetricsOverride",
  { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false },
  sessionId,
);
// Same view-paint clock bench-router.mjs uses for full loads.
await send(
  "Page.addScriptToEvaluateOnNewDocument",
  {
    source: `
    window.__viewReady = null;
    new MutationObserver(() => {
      const v = document.getElementById('view');
      if (v && v.querySelector(':scope > :not(.spinning):not(script)') && window.__viewReady == null)
        window.__viewReady = performance.now();
    }).observe(document, { childList: true, subtree: true });`,
  },
  sessionId,
);

async function evaljs(expression, awaitPromise = false, timeout = 30000) {
  const r = await Promise.race([
    send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise }, sessionId),
    new Promise((_, rej) => setTimeout(() => rej(new Error("evaluate stalled")), timeout)),
  ]);
  if (r.exceptionDetails)
    throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
  return r.result.value;
}
async function waitViewSettled(timeout = 15000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const ok = await evaljs(`(() => {
      const v = document.getElementById('view');
      return !v || !!v.querySelector(':scope > :not(.spinning):not(script)') ||
        (v.childElementCount === 0 && document.readyState === 'complete' && (window.L?.loaded ?? false));
    })()`);
    if (ok) return;
    await sleep(50);
  }
}
async function fullLoad(url) {
  const load = waitEvent("Page.loadEventFired", sessionId);
  await send("Page.navigate", { url }, sessionId);
  await load;
  await waitViewSettled();
  if (await evaljs(`!!document.querySelector('input[name="luci_username"]')`))
    throw new Error(`landed on the login form for ${url} — session expired?`);
}

/* Everything below is read off the document's own performance timeline, so
 * the numbers are the browser's, not the harness's. */
const SAMPLE = `(() => {
  const nav = performance.getEntriesByType('navigation')[0];
  const res = performance.getEntriesByType('resource');
  const tr = res.find(e => /\\/admin\\/translations\\//.test(e.name));
  // The view's own data calls: the one piece of device work both paths share.
  const ub = res.filter(e => /\\/ubus/.test(e.name));
  return JSON.stringify({
    ubusStart: ub.length ? Math.min(...ub.map(e => e.startTime)) : null,
    ubusEnd: ub.length ? Math.max(...ub.map(e => e.responseEnd)) : null,
    ubusCount: ub.length,
    ttfb: nav.responseStart,
    htmlEnd: nav.responseEnd,
    htmlBytes: nav.transferSize,
    trStart: tr ? tr.startTime : null,
    trEnd: tr ? tr.responseEnd : null,
    trBytes: tr ? tr.transferSize : null,
    trUrl: tr ? new URL(tr.name).pathname : null,
    dcl: nav.domContentLoadedEventEnd,
    load: nav.loadEventEnd,
    viewReady: window.__viewReady,
    // Every request the document made, so nothing counted here is invisible.
    requests: res.length,
  });
})()`;

/* The same page over the same-document router, measured in the same loop so
 * both halves of the comparison see the same device state. Mirrors
 * bench-router.mjs: hover first (a user does), then navigate and await the
 * navigation's own `finished` promise. */
const SPA = (url) => `(async () => {
  const link = [...document.querySelectorAll('a[href]')].find(a => a.href === ${JSON.stringify(url)});
  if (link) { link.dispatchEvent(new Event('pointerover', { bubbles: true })); await new Promise(r => setTimeout(r, 400)); }
  performance.clearResourceTimings();
  const t0 = performance.now();
  let error = null;
  try {
    await Promise.race([navigation.navigate(${JSON.stringify(url)}).finished,
      new Promise((_, rej) => setTimeout(() => rej(new Error('router did not finish in 20 s')), 20000))]);
  } catch (e) { error = String(e); }
  const t1 = performance.now();
  const res = performance.getEntriesByType('resource').filter(e => e.startTime >= t0);
  const ub = res.filter(e => /\\/ubus/.test(e.name));
  return JSON.stringify({
    ms: t1 - t0, error, sameDoc: window.__sameDocMarker === 1,
    ubusStart: ub.length ? Math.min(...ub.map(e => e.startTime)) - t0 : null,
    ubusEnd: ub.length ? Math.max(...ub.map(e => e.responseEnd)) - t0 : null,
    ubusCount: ub.length, requests: res.length,
  });
})()`;

const rows = [];
for (const url of PAGES) {
  const s = [];
  for (let i = 0; i < RUNS; i++) {
    await fullLoad(WARMUP);
    await fullLoad(url);
    const one = JSON.parse(await evaljs(SAMPLE));
    if (one.viewReady != null) s.push(one);
  }
  // Router path: one document, warmed on the start page, RUNS round trips.
  const spa = [];
  await fullLoad(WARMUP);
  await evaljs("window.__sameDocMarker = 1");
  await evaljs(SPA(url), true); // cold: module not yet required in this document
  for (let i = 0; i < RUNS; i++) {
    const back = JSON.parse(await evaljs(SPA(WARMUP), true));
    if (!back.sameDoc) { await evaljs("window.__sameDocMarker = 1"); continue; }
    const r = JSON.parse(await evaljs(SPA(url), true));
    if (!r.error && r.sameDoc) spa.push(r);
  }
  if (!s.length) {
    rows.push({ page: url.replace(`${HOST}/cgi-bin/luci`, ""), n: 0 });
    continue;
  }
  const med = (k) => median(s.map((x) => x[k]).filter((v) => v != null));
  const smed = (k) => (spa.length ? median(spa.map((x) => x[k]).filter((v) => v != null)) : null);
  const row = {
    page: url.replace(`${HOST}/cgi-bin/luci`, ""),
    n: s.length,
    spaN: spa.length,
    spaMs: r0(smed("ms")),
    spaUbusStart: r0(smed("ubusStart")),
    spaUbusEnd: r0(smed("ubusEnd")),
    spaUbusCount: r0(smed("ubusCount")),
    spaRequests: r0(smed("requests")),
    ttfb: r0(med("ttfb")),
    htmlEnd: r0(med("htmlEnd")),
    trStart: r0(med("trStart")),
    trEnd: r0(med("trEnd")),
    dcl: r0(med("dcl")),
    viewReady: r0(med("viewReady")),
    ubusStart: r0(med("ubusStart")),
    ubusEnd: r0(med("ubusEnd")),
    ubusCount: r0(med("ubusCount")),
    htmlBytes: r0(med("htmlBytes")),
    trBytes: r0(med("trBytes")),
    trUrl: s[0].trUrl,
    requests: r0(med("requests")),
  };
  // Wall time the device owns: the HTML response plus the blocking catalog.
  row.serverMs = r0((row.htmlEnd ?? 0) + ((row.trEnd ?? 0) - (row.trStart ?? 0)));
  row.browserMs = r0((row.viewReady ?? 0) - row.serverMs);
  rows.push(row);
  console.error(
    `${row.page}: ttfb ${row.ttfb} · html ${row.htmlEnd} · tr ${row.trStart}→${row.trEnd} · dcl ${row.dcl} · view ${row.viewReady} · ubus ${row.ubusStart}→${row.ubusEnd} (${row.ubusCount}) || router ${row.spaMs} · ubus ${row.spaUbusStart}→${row.spaUbusEnd} (${row.spaUbusCount}) n=${row.spaN}`,
  );
}

const agg = (k) => r0(median(rows.filter((r) => r.n).map((r) => r[k])));
const out = {
  label: LABEL,
  host: HOST,
  runs: RUNS,
  pages: rows,
  median: {
    ttfb: agg("ttfb"),
    htmlEnd: agg("htmlEnd"),
    trStart: agg("trStart"),
    trEnd: agg("trEnd"),
    dcl: agg("dcl"),
    viewReady: agg("viewReady"),
    serverMs: agg("serverMs"),
    browserMs: agg("browserMs"),
    ubusStart: agg("ubusStart"),
    ubusEnd: agg("ubusEnd"),
    spaMs: r0(median(rows.filter((r) => r.spaN).map((r) => r.spaMs))),
    spaUbusStart: r0(median(rows.filter((r) => r.spaN).map((r) => r.spaUbusStart))),
    spaUbusEnd: r0(median(rows.filter((r) => r.spaN).map((r) => r.spaUbusEnd))),
  },
};
console.log(JSON.stringify(out, null, 2));

await send("Target.closeTarget", { targetId });
ws.close();
chrome.kill();
// Chrome unlinks its profile lazily; removing it under the exiting process
// races and throws ENOTEMPTY, which would mask a clean run.
await sleep(400);
try { rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } catch {}
