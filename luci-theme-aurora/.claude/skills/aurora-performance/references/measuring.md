# Measuring

Every rule in server.md/loading.md/runtime.md ends in "Verify" and
"Quantify" for a reason: an unmeasured performance claim is an opinion. This
file documents the instrumentation those sections point at.

## `bench.mjs` — on-device HTTP bench

Run from `.dev/`:

```bash
cd .dev
node ../.claude/skills/aurora-performance/scripts/bench.mjs
BENCH_RUNS=20 node ../.claude/skills/aurora-performance/scripts/bench.mjs
```

**Setup.** Reads `.dev/.env` for `VITE_OPENWRT_HOST` (default
`http://192.168.1.1:80`), plus optionally `VITE_OPENWRT_SSH_HOST` and
`VITE_OPENWRT_SSH_KEY` for the device report. If `.env` is missing, it
aborts immediately with a one-line message telling you to copy
`.dev/.env.example` and set `VITE_OPENWRT_HOST`. If a target is unreachable
or returns an HTTP error status mid-run, it aborts with a one-line message
naming the target that failed — it does not silently skip it.

**What it measures.** `BENCH_RUNS` (default 10) samples per target via
`curl`, reduced to a median, against 6 fixed targets. All static assets use
identity transfer because the target `uhttpd` cannot serve gzip:

1. `GET /cgi-bin/luci` (the login page) — the honest unauthenticated target:
   it's the one page a bench script can hit without a session, and TTFB
   comparisons must compare like with like.
   A 403 is accepted for this target only because some LuCI builds render the
   login form with that status; other error responses still abort the run.
2. `main.css`, identity
3. `login.css`, identity
4. the theme's menu script, identity (example: aurora's `menu-aurora.js`)
5. the default first-paint font, identity
6. the default logo, identity

Per target it reports TTFB, total time, transferred bytes, and HTTP status,
summarized as a Markdown table on stdout.

**Device report.** If `VITE_OPENWRT_SSH_HOST` is set, it also SSHes in for a
`## Device` section: `uhttpd` VmRSS (parsed from `/proc/<pid>/status`) and
theme flash usage (`du -sk`) on the static asset directories. If SSH is
unreachable, this section degrades to a one-line "⚠ SSH unreachable —
HTTP metrics only" instead of failing the whole run — the HTTP-only rows
still print.

**Output.** The whole report is Markdown: paste it straight into a PR
description, or archive it (see below).

## `bench-router.mjs` — router verification and A/B (CDP)

The client-side router (`.dev/docs/router.md`) is verified against real
full loads, never against expectation:

```bash
curl -c jar.txt -d 'luci_username=root&luci_password=…' http://<device>/cgi-bin/luci/
HOST=http://<device> COOKIE_NAME=sysauth_http COOKIE_VALUE=<from jar> \
  node ../.claude/skills/aurora-performance/scripts/bench-router.mjs <label>
```

`ONLY=walk|timing|soak|back|poison|sheets|hygiene|nodecss|expiry` runs one
scenario (`RUNS` defaults to and is floored at 10). `walk` visits every page
the navigation model links to (menu + each page's tab strip) through the
router, then full-loads the same URL and diffs title, `data-page`,
`dispatchpath`, tab strip, active nav mark, footer presence and console
errors — the report lists fallbacks (pages the router declined) and
divergences separately, and 0 divergences is the merge gate. `timing` is
click → view painted, median of `RUNS`, router warm/cold vs full load.
`soak` samples heap, DOM nodes, listeners and the poll queue on the same
page after each of 5 laps over 12 pages. `back` traverses a chain that
deliberately interleaves alias/firstchild URLs (read from the menu tree)
with view URLs and asserts each step stayed same-document with the right
URL and `data-page`. `poison` injects a foreign `<style>` into `<head>` and
asserts the next navigation is a full load and the one after is
same-document again. `sheets` repeats that against the view pages the walk
found actually inserting their own sheets. `hygiene` checks that no progress
bar is left in the DOM, that the live region carries the title, and that a
hidden tab stops polling. `nodecss` checks a `menu.d` node's `css` link is
enabled on arrival, disabled after leaving and re-enabled without a
duplicate. `expiry` destroys the session and must land on the login form —
it always runs last.

Trap: a navigation the router does not take is a real document load and
tears down the CDP evaluation ("Inspected target navigated"); the harness
treats that as a fallback, waits for the new document, and re-arms its
same-document marker there.

## `bench-fullload.mjs` — where one navigation's time goes (CDP)

`bench-router.mjs` answers *how much faster*; this answers *what the full
load was spending the time on*, which is what the router doc's stage table
and the architecture diagram quote.

```bash
HOST=http://<device> COOKIE_NAME=sysauth_http COOKIE_VALUE=<sid> RUNS=10 \
  node ../.claude/skills/aurora-performance/scripts/bench-fullload.mjs <label>
```

Per page it reports medians, read off the document's own Navigation/Resource
Timing rather than the harness clock: `ttfb` and `htmlEnd` (dispatcher run
#1), `trStart`/`trEnd` (the `admin/translations/<lang>` script — dispatcher
run #2, parser-blocking), `dcl`, `viewReady`, and the `ubus` window (the
view's own data calls). It then measures the **same page over the router in
the same loop**, so both halves see the same device state and are
subtractable — run-to-run spread on an embedded device is large enough that
two separately-run harnesses will not agree.

Set `PAGES` to override the sample; the default is the same 8 pages
`bench-router.mjs timing` uses.

## `bench-dispatch.sh` — what one CGI dispatch costs (on the device)

```bash
ssh root@<device> 'sh -s' < ../.claude/skills/aurora-performance/scripts/bench-dispatch.sh
```

Runs on the router, so no network is in the number. Two halves: loopback
`curl` medians (page HTML, both i18n catalogs, `/admin/menu`, one static
file) and the per-process cost of each phase every dispatch pays, timed over
50 `ucode` processes (`fork + ucode VM`, `import luci.dispatcher`, menu tree
stat + index-cache parse, `session.get` + `session.access`).

The `admin/translations/en` row is the control: a 13-byte response that still
pays a full dispatch. Compare it against the static-file row to separate
dispatch cost from payload cost. It makes and destroys its own session.

## Measurement discipline

- **Median of ≥10 runs**, never a single sample — router-side variance
  (other requests, GC, thermal throttling) is real.
- **Hard refresh** before any browser-side recording; a warm cache measures
  the cache, not the change.
- **Pin the CPU throttle** (4× in the Performance panel) for every runtime
  recording so results are comparable across sessions and machines.
- **Track two numbers, not one**: the absolute value against the theme's
  budget table, *and* the delta versus the base branch. A budget pass on
  absolute numbers with a regression in the delta is still a regression.
- **Budgets come from baselines, never from intuition.** If a number isn't
  in the theme's budget sheet (`aurora-budgets.md`), it isn't a budget yet — propose
  one from a measured baseline, don't invent a round number.

## A/B delta protocol

For any change that touches server or loading plane performance:

```bash
git checkout <base-branch>
cd .dev && pnpm build && node ../.claude/skills/aurora-performance/scripts/bench.mjs > /tmp/bench-base.md
git checkout <working-branch>
cd .dev && pnpm build && node ../.claude/skills/aurora-performance/scripts/bench.mjs > /tmp/bench-branch.md
```

Put the two Markdown tables side by side in the PR. For a runtime-plane
change, pair this with one DevTools Performance recording (see runtime.md
R1/R2 Verify steps) on each branch, hard-refreshing between them — the dev
server re-proxies the new build automatically, but the browser cache does
not clear itself.

## Baseline archive

Save the bench output to the skill's `baselines/` directory as
`<version>-<device>.md` (`../baselines/` relative to this file) — the
directory is git-ignored because the report records the device model and LAN
address, so it stays local. Budget claims stay falsifiable across releases and
hardware. Any PR that proposes revising a budget number must add a new baseline
entry backing the revision — a budget change without an archived measurement is
not accepted.

## Field data

Lab measurements (this file, DevTools) catch regressions before ship; they
don't tell you what real users experience. If the theme ships the
[`web-vitals`](https://github.com/GoogleChrome/web-vitals) library, watch
the **P75** of INP/LCP/CLS, not the average — a P75 regression is a real
user-facing regression even when the lab numbers look fine.
