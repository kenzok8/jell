# What a request costs the router

Numbers measured on the maintainer's test router (OpenWrt SNAPSHOT, plain HTTP) with
`.claude/skills/aurora-performance/scripts/bench-dispatch.sh` and
`bench-fullload.mjs`, 2026-08; reproduced in `.dev/docs/router.md` §"Why it
pays". Treat the **ratios** as stable and the digits as device-specific —
re-measure before quoting them for another box.

## One request, on the router (no network in the number)

| request | ms | bytes | note |
|---|--:|--:|---|
| page HTML, a `view` node | 75.4 | 18,583 | dispatch #1 |
| `admin/translations/en` | 62.7 | **13** | dispatch #2 — the control: 13 bytes still pay a full dispatch |
| `admin/translations/zh-cn` | 60.3 | 229,503 | same dispatch, re-sent every navigation (`no-cache`, no validators) |
| `admin/menu` | 68.2 | 45,022 | once per **session** (`ui.menu.load` caches it) |
| static `main.css` | **0.8** | 191,899 | uhttpd `file.c`, identity bytes |

## Inside one dispatch

| phase every dispatch pays | ms |
|---|--:|
| fork + ucode VM start | 2.2 |
| `import luci.dispatcher` (runtime, http, ubus, uci, core, authplugins) | **37.2** |
| menu tree: stat 8 `menu.d` files + parse the 28,307 B index cache | 13.8 |
| `session.get` + `session.access` over ubus | 6.0 |

Reading: the cost is **process bootstrap, not work**. A persistent handler
(`uhttpd-mod-ucode` + `luci-base/ucode/uhttpd.uc`) pays the 37.2 ms import
once per uhttpd process instead of once per request — see `uhttpd.md` §3.

## A full MPA page load, end to end (browser clock)

| stage | ms | what it is |
|---|--:|---|
| dispatch #1 — page HTML | 0→123 | TTFB 118: menu tree, ACL fold, `view.ut` → theme `header.ut` |
| dispatch #2 — `admin/translations/<lang>` | 124→209 | a second CGI process, parser-blocking, uncacheable |
| DOMContentLoaded | 215 | the shell is back, byte-identical to the one just discarded |
| view module + ubus data + render | 215→321 | static assets were cache hits |

209 of 321 ms pass before anything page-specific happens. The same-document
router removes both dispatches (median 91 ms warm, data calls start at 2 ms
instead of 227 ms). On browsers without the Navigation API (Safari < 26.2,
Firefox < 147) every click still pays the full column.

## Wire cost without compression (uhttpd sends identity)

| asset | raw | gzip -9 |
|---|--:|--:|
| aurora `main.css` | 192,154 | 23,439 |
| aurora `menu-aurora.js` | 21,809 | 6,665 |
| aurora `router-aurora.js` | 14,844 | 5,552 |
| luci-base `luci.js` | 99,444 | 24,817 |
| luci-base `ui.js` | 167,889 | 37,856 |
| luci-base `form.js` | 184,155 | 37,454 |
| luci-base `network.js` | 125,286 | 27,263 |

A form page's JS + CSS (`luci.js`, `ui.js`, `form.js`, `uci.js` 28,922,
`rpc.js` 15,344, `validation.js` 44,031, plus the theme's `main.css`,
`menu-aurora.js`, `router-aurora.js`) is 768,592 B identity and 157,618 B
gzip -9 (fonts and images excluded). The lever is uhttpd's, not any
theme's.

## Budget rules that follow

- Count dispatches per navigation, not just bytes: one avoided dispatch
  ≈ 60–75 ms on this class of SoC, more than the entire theme CSS transfer.
- A new per-request `ubus`/`uci`/`fs` call in a template is a measurable
  fraction of the 6–14 ms rows above; name the reason in the PR.
- Static files cost ~1 ms regardless of size on the server; their cost is
  on the wire (identity) and in parse time on the phone.
