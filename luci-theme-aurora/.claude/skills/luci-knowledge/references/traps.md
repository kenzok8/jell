# False beliefs to refute on sight

Each line: the belief · the fact · where to check.

- "`cbi.js` bootstraps `luci.js`." · No — `cbi.js` is 26 KB of legacy CBI globals; `luci.js` is emitted by luci-base `header.ut:10` **after** the theme header. · `$LUCI_SRC/modules/luci-base/ucode/template/header.ut`
- "`?v=` makes an asset cache forever." · No — uhttpd sends only `ETag`/`Last-Modified`; browsers use heuristic freshness, then 304. · `uhttpd/file.c:344`
- "uhttpd can serve `.gz` sidecars / negotiates gzip." · No — `Accept-Encoding` is never read. · `uhttpd/file.c`
- "`/admin/menu` is fetched on every page." · No — once per session via `luci-session-store`. · `ui.js:3733`
- "The translation catalog is cached." · No — `Cache-Control: no-cache`, no validators; refetched every document. · `http.uc:499`, `controller/admin/index.uc:124`
- "`{{ expr }}` HTML-escapes." · No — call `entityencode()`/`striptags()`. · any shipped `.ut`
- "`L.require()` returns a class." · No — an instance whose `__init__` already ran. · `luci.js` require; `router-aurora.js:713`
- "`baseclass.js` / `dom.js` / `poll.js` / `request.js` / `session.js` / `view.js` exist on disk." · No — seeded in memory. · `luci.js`
- "`uhttpd-mod-ucode` handles requests in-process without forking." · No — VM + handler top level run at startup, then one fork per request. · `uhttpd/ucode.c:224-300,378`
- "23.05/24.10 have `node.css` / `wildcardaction`." · No — master only / 25.12+. · `.dev/docs/router.md` §Compatibility
- "The built CSS is OKLCH." · Only if browserslist allows it; today `vite.config.ts:33` (`last 4 versions`) lowers tokens to hex + `lab()` fallbacks. · `htdocs/luci-static/aurora/main.css` `:root{--bg:#f7fafc`
- "main.css can be reviewed from the PR diff." · It is one 192 KB line; review the source partials and re-measure the build. · `tests/build-performance.test.js`
- "A theme can set headers on dispatcher responses." · No — only the action (upstream) can; the theme controls the tags, not the headers.
- "A dispatcher action can answer 304 with ETag/Last-Modified." · No — uhttpd never exports `If-None-Match`/`If-Modified-Since` to CGI or the ucode handler. · `uhttpd proc.c:56-76`
- "`cbi.js` is legacy and can be deferred or dropped." · `_()` is defined only there (`cbi.js:154-157`); `menu-aurora.js` calls `_()` synchronously at init → `ReferenceError` without it. · `resources/cbi.js`, `.dev/src/resource/menu-aurora.js:59`
- "23.05 versions `luci.js` and module URLs too." · No — the `?v=PKG-pkgs_update_time` key starts with 24.10; on 23.05 `resource_version` is undefined. · `openwrt-23.05 header.ut:10-11`, `runtime.uc:179-182`
- "Service Worker / speculation rules will work on the router." · Not over `http://` (not a secure context).
