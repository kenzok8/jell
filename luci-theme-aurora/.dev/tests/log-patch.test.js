import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

/* The patch ships as a plain deferred script, not a module. Evaluate it with
   an injected `module` to reach its parsing exports; `document` stays
   undefined so the DOM bootstrap is skipped. */
const source = await readFile(
  new URL("../src/resource/patches/admin-status-logs.js", import.meta.url),
  "utf8",
);
const mod = { exports: {} };
new Function("module", "exports", "document", "window", source)(
  mod,
  mod.exports,
  undefined,
  undefined,
);
const { parseSyslogLine, parseDmesgLine, shortenTime, evaluate, PARSE_GATE } =
  mod.exports;

test("classic logread format (23.05 syslog, 24.10 syslog-wrapper) parses", () => {
  const r = parseSyslogLine(
    "Sat Jul 26 03:14:15 2026 daemon.info dnsmasq-dhcp[1]: DHCPACK(br-lan) 192.168.1.140",
  );
  assert.deepEqual(
    { time: r.time, fac: r.fac, sev: r.sev, tag: r.tag },
    {
      time: "Jul 26 03:14:15",
      fac: "daemon",
      sev: "info",
      tag: "dnsmasq-dhcp[1]",
    },
  );
  assert.equal(r.msg, "DHCPACK(br-lan) 192.168.1.140");

  // ctime() pads single-digit days with a space.
  const padded = parseSyslogLine(
    "Sun Jul  6 09:05:07 2026 daemon.warn odhcpd[2029]: No default route present",
  );
  assert.equal(padded.time, "Jul 06 09:05:07");

  // Kernel lines routed through logread; hostapd logs without a pid.
  assert.equal(
    parseSyslogLine(
      "Sat Jul 26 03:14:16 2026 kern.info kernel: [73412.882110] br-lan: port 3(lan3) entered forwarding state",
    ).tag,
    "kernel",
  );
  assert.equal(
    parseSyslogLine(
      "Sat Jul 26 03:14:17 2026 daemon.notice hostapd: wlan1: AP-STA-CONNECTED 3c:22:fb:8a:12:9d",
    ).tag,
    "hostapd",
  );
});

test("master RPC bracket format parses across browser locales", () => {
  const en = parseSyslogLine(
    "[Jul 24, 2026, 10:59:50 PM UTC] daemon.info: dnsmasq-dhcp[1]: DHCPREQUEST(br-lan) 192.168.1.140",
  );
  assert.equal(en.time, "Jul 24 22:59:50");
  assert.equal(en.fullTime, "Jul 24, 2026, 10:59:50 PM UTC");

  // timeStyle "full" spells the zone out; still en-shaped, still shortened.
  assert.equal(
    parseSyslogLine(
      "[Jul 24, 2026, 10:59:50 PM Coordinated Universal Time] daemon.warn: odhcpd[2029]: No default route present",
    ).time,
    "Jul 24 22:59:50",
  );

  // Non-en datestrs parse fine and display untouched — never guessed at.
  const zh = parseSyslogLine(
    "[2026年7月24日 GMT 22:59:50] daemon.err: odhcpd[2029]: Failed to send RA",
  );
  assert.equal(zh.sev, "err");
  assert.equal(zh.time, "2026年7月24日 GMT 22:59:50");
});

test("severity comes from the field, never from message content", () => {
  const r = parseSyslogLine(
    "[Jul 24, 2026, 11:00:00 PM UTC] daemon.info: logger: user said daemon.err: fake",
  );
  assert.equal(r.sev, "info");
  assert.equal(r.msg, "user said daemon.err: fake");
});

test("unknown facility/severity and foreign formats are rejected", () => {
  assert.equal(
    parseSyslogLine("[Jul 24, 2026, 11:00:00 PM UTC] bogus.info: x: y"),
    null,
  );
  assert.equal(
    parseSyslogLine("[Jul 24, 2026, 11:00:00 PM UTC] daemon.bogus: x: y"),
    null,
  );
  // syslog-ng's classic template has no facility.severity field at all.
  assert.equal(
    parseSyslogLine("Jul 26 10:00:00 OpenWrt dnsmasq[123]: query answered"),
    null,
  );
  assert.equal(parseSyslogLine(""), null);
});

test("dmesg lines: uptime stamp and safe tag split, no severity", () => {
  const r = parseDmesgLine(
    "[   12.345678] br-lan: port 3(lan3) entered forwarding state",
  );
  assert.equal(r.time, "[12.345678]");
  assert.equal(r.tag, "br-lan");
  assert.equal(r.sev, "");

  // A device path with spaces must not be mistaken for a tag.
  const pci = parseDmesgLine(
    "[75821.004518] mt7921e 0000:01:00.0: Message 00000010 timeout",
  );
  assert.equal(pci.tag, "");
  assert.equal(pci.msg, "mt7921e 0000:01:00.0: Message 00000010 timeout");

  assert.equal(parseDmesgLine("no bracket prefix here"), null);
});

test("shortenTime handles 12-hour edges and leaves unknown shapes alone", () => {
  assert.equal(shortenTime("Jul 24, 2026, 12:05:01 AM UTC"), "Jul 24 00:05:01");
  assert.equal(shortenTime("Jul 24, 2026, 12:15:09 PM UTC"), "Jul 24 12:15:09");
  assert.equal(
    shortenTime("2026年7月24日 GMT 22:59:50"),
    "2026年7月24日 GMT 22:59:50",
  );
});

test("parse gate: mixed content falls back, empty value stays calm", () => {
  const good = "Sat Jul 26 03:14:15 2026 daemon.info dnsmasq[1]: ok";
  const bad = "Jul 26 10:00:00 OpenWrt dnsmasq[123]: syslog-ng style";

  const healthy = evaluate(
    [good, good, good, good, bad].join("\n"),
    parseSyslogLine,
  );
  assert.ok(healthy.ratio >= PARSE_GATE, "4/5 parsed must stay enhanced");

  const foreign = evaluate([bad, bad, bad].join("\n"), parseSyslogLine);
  assert.ok(foreign.ratio < PARSE_GATE, "foreign log must fall back");

  const empty = evaluate("", parseSyslogLine);
  assert.equal(empty.rows.length, 0);
  assert.equal(empty.ratio, 1, "empty log must not trip the gate");
});

test("built log payloads land in their homes", () => {
  const out = resolve(import.meta.dirname, "../../htdocs/luci-static/aurora");
  // The JS ships on-demand under one name — every supported release
  // (23.05/24.10/master) mounts both log pages under admin/status/logs/*.
  const js = resolve(out, "patches/admin-status-logs.js");
  assert.ok(existsSync(js), `${js} missing — run pnpm build first`);
  assert.ok(statSync(js).size <= 6_000, `${js} exceeds 6 KB`);
  // The CSS is core-page styling and lives in the main bundle, where the
  // Tailwind token pipeline (radius-base chain, app shadows) applies — a
  // stray patches/ copy would mean the component migration regressed.
  const main = readFileSync(resolve(out, "main.css"), "utf8");
  assert.ok(main.includes(".syslog-view"), "main.css lost the log viewer");
  assert.ok(
    main.includes("calc(var(--radius-base)"),
    "radius utilities no longer resolve through the reactive base chain",
  );
  assert.ok(!existsSync(resolve(out, "patches/admin-status-logs.css")));
  assert.ok(!existsSync(resolve(out, "patches/_log-shared.css")));
});
