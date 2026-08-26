# luci-base runtime contract

Verified against openwrt/luci master (31748dcc2a, 2026-06-17); paths are
relative to that checkout (`$LUCI_SRC`, see SKILL.md). Every fact cites a
file; re-verify on the branch you target before relying on it, and cite
`file:line` in any finding you derive from this page.

## 1. Boot order of an admin page

1. `dispatcher.uc` resolves the node and runs its action. A `view` node
   includes `modules/luci-base/ucode/template/view.ut`:

   ```
   {% include('header') %}
   <div id="view">
     <div class="spinning">{{ _('Loading view…') }}</div>
     <script>L.require('ui').then(function(ui){ ui.instantiateView('{{ view }}'); });</script>
   </div>
   {% include('footer') %}
   ```

2. luci-base `ucode/template/header.ut` first includes the **theme** header
   (`include(\`themes/${theme}/header\`)`, same scope — the theme renders the
   whole `<head>` and opens `<body>`), then emits (header.ut:10-31):

   ```
   <script src="{{ resource }}/luci.js?v={# PKG_VERSION #}-{{ pkgs_update_time }}"></script>
   <script>L = new LuCI({ media, resource, scriptname, pathinfo, documentroot,
     requestpath, dispatchpath, pollinterval, ubuspath, sessionid, token,
     nodespec, apply_rollback, apply_holdoff, apply_timeout, apply_display,
     rollback_token })</script>
   ```

   Consequences: the theme `<head>` is parsed **before** `luci.js` exists;
   `luci.js` itself sits in the body region after `#tabmenu`; the `?v=` of
   `luci.js` (and therefore `L.env.resource_version`, used for every
   `L.require` URL) changes whenever any package is installed, because
   `pkgs_update_time` is the mtime of `/lib/apk/db/installed` or
   `/usr/lib/opkg/status` (`ucode/runtime.uc:182`). On `openwrt-23.05` the
   tag is a bare `luci.js` (preceded by `promis.min.js`) and
   `pkgs_update_time` does not exist (`23.05 header.ut:10-11`,
   `runtime.uc:179-182`), so `resource_version` is undefined and module
   URLs are unversioned there.

   `_()` is **not** in `luci.js`: it is defined by `cbi.js`
   (`resources/cbi.js:154-157`), reads `window.TR` lazily at call time and
   falls back to the source string. The catalog script and `cbi.js` must
   therefore have executed before any module that calls `_()` runs — and
   this theme's `menu-aurora.js` calls `_()` synchronously in `__init__`.

3. `view.ut`'s inline `L.require('ui')` runs synchronously in parser order
   right after `luci.js`. A wrapper installed from the theme **footer** is too
   late for that call, but early enough for `ui.instantiateView(view)` →
   `L.require(view)` and for `L.require('menu-aurora')`.

4. luci-base `ucode/template/footer.ut` includes the theme footer and, when
   an apply/revert/rollback is pending, an inline script bound to the
   `luci-loaded` event.

## 2. Template scope the theme can use

Globals set by `runtime.uc` / `dispatcher.uc` and visible inside
`themes/<theme>/header.ut`: `media`, `resource`, `theme`, `dispatcher`
(`.lang`, `.build_url()`, `.lookup()`), `dispatched` (the node: `title`,
`css`, …), `ctx.request_path`, `ctx.path`, `config`, `version`,
`pkgs_update_time`, `http`, `ubus`, `_()`, `striptags()`, `entityencode()`.
Callers may add scope: `sysauth.ut` passes `blank_page`, and the theme adds
its own `prefetched_*` (aurora `sysauth.ut:17-21`).

`{{ expr }}` prints raw — the shipped templates call `entityencode(v, true)`
for attributes and `striptags()` for text explicitly. Do the same.

## 3. Module loader — `L.require`

- URL: `${env.base_url}/${name.replace(/\./g,'/')}.js` + `?v=${env.resource_version}`
  (`luci.js:2474`); both env values are parsed from the `luci.js` script src
  at boot (`luci.js:2257`).
- Loads the source, lexes the leading string literals `'require x [as y]'`
  (works on a minified one-line head), then loads dependencies **serially per
  level** — a dependency depth of *n* costs *n* round trips.
- Returns the **instance**: `__init__` has already run, so re-requiring a
  view returns the rendered singleton. To render again use
  `new instance.constructor()` (aurora `router-aurora.js:713`).
- Six names are seeded in memory (`luci.js:2237-2244`) and have **no file**
  on disk: `baseclass`, `dom`, `poll`, `request`, `session`, `view`.
  Prefetchers must skip them or they 404 on every page.

## 4. Menu, session store, polling

- `ui.menu.load()` (`ui.js:3733`): `session.getLocalData('menu')` first —
  sessionStorage key `luci-session-store`, namespaced by session id
  (`luci.js:1883-1932`) — else one `GET admin/menu` per **session**, not per
  page. `ui.menu.flushCache()` (`ui.js:3748`) has no caller in luci-base or
  the bootstrap theme.
- `L.Poll` is a singleton inside `luci.js` (`luci.js:1067`): `queue`
  (`:1070`), `start()` (`:1158`, dispatches `poll-start` at `:1167`),
  `stop()` (`:1183`, dispatches `poll-stop`), `active()`, `tick`. Core's
  `setupDOM` shows the `poll-status` indicator on `poll-start`
  (`luci.js:2743`) and flips it to "Paused" on `poll-stop` (`:2749`); nothing
  in luci-base hides it.
- `dom.content(node, children)` (`luci.js:1442-1449`) deletes the
  `data-idref` registry entries under `node` — the only call that does;
  without it a departed subtree and its class instances stay referenced.
- Session expiry is signalled two ways (`luci.js:2715-2733`): a ubus error
  `-32002` on anything but `session.access` triggers a `session.access`
  probe, and an HTTP 403 carrying `X-LuCI-Login-Required: yes` is the
  login-required path.
- `hasViewPermission()` is `!env.nodespec.readonly` (`luci.js:3263-3267`);
  the form footer's Save/Apply state reads it (`luci.js:2195`).
- `env.pollinterval` defaults to 5 s; a hidden tab keeps polling unless a
  theme stops it.

## 5. Dispatcher responses and caching

- `http.uc` `write_headers()` (`http.uc:497-512`): unless the action set
  its own, every dispatcher response gets `Cache-Control: no-cache` and
  `Expires: 0`, plus `X-Frame-Options: SAMEORIGIN`, `X-XSS-Protection`,
  `X-Content-Type-Options: nosniff`. No `ETag`, no `Last-Modified` — nothing
  to revalidate against, so browsers refetch every dispatcher response.
- `admin/translations/<lang>` (`ucode/controller/admin/index.uc:124-136`,
  `action_translations`) streams `window.TR={"%08x":"…",…};`. It is a full
  CGI dispatch per document and uncacheable by the rule above. Themes link it
  as a synchronous `<head>` script (bootstrap `header.ut:44`, aurora
  `header.ut:222`), so it is parser-blocking on every MPA navigation. Its
  menu node is `type: function` with `auth: {}` (`menu.d/luci-base.json:62-69`),
  which only skips the login redirect: `resolve_page()` still runs
  `is_authenticated()` for the `admin` node's cookie methods
  (`dispatcher.uc:650-651`, `:533-551`), so the dispatch pays the
  `session.get` + `session.access` round-trip like any page.
- An action can override the default: `http.header()` stores keys
  lower-cased (`http.uc:466-469`), so a `Cache-Control` set by the action
  suppresses the `no-cache` default. No `.lmo` exists for `en`
  (`luci.mk:10`, `src/lib/lmo.c:237`), so a file-mtime cache key is
  undefined for the English catalog; `pkgs_update_time` is not.
- A query string never changes which node is dispatched: uhttpd splits it
  off before path lookup and the dispatcher reads `PATH_INFO` only
  (`dispatcher.uc:929`; `QUERY_STRING` is parsed separately, `http.uc:606`).
  `?v=` on a dispatcher URL is therefore safe.
- Menu tree: `dispatcher.uc:19,366-374` — index cache
  `/tmp/luci-indexcache.<hash>.json`, hashed over the `menu.d` file list; each
  dispatch stats the `menu.d` files and parses the cached JSON.
- ACL: `dispatcher.uc` folds every `depends.acl` on the dispatch path into a
  single `check_acl_depends()`; `env.nodespec.readonly` is what
  `hasViewPermission()` reads, which is what disables Save/Apply.
- Alias / firstchild are resolved server-side **without a redirect**: the
  URL stays, `requestpath`/`dispatchpath`/`nodespec`/`ctx.path` already point
  at the leaf. `resolve_firstchild()` / `node_weight()` semantics are ported
  line for line in `router-aurora.js:25-98`.

## 6. Branch differences (23.05 / 24.10 / 25.12 / master)

Source-checked 2026-08 (see `.dev/docs/router.md` §Compatibility):

| Surface | 23.05 | 24.10 | 25.12 | master |
|---|---|---|---|---|
| `node.css` in the page tree | — | — | — | yes (7c6d8ff, 2026-08) |
| `wildcardaction` + descend-into-satisfied-child rule | — | — | yes | yes (df90c60a7, 2026-01-17) |
| `pkgs_update_time` template global; `luci.js?v=PKG-mtime` (so `L.env.resource_version` and versioned `L.require` URLs) | — (`runtime.uc:179-182`, `header.ut:11`) | yes | yes | yes |
| `action_translations` body, `http.uc` `no-cache` default | same | same | same | same |
| everything else the router uses (`L.require` instance cache, `dom.content`, `Poll`, `ui.menu.load` session cache, interceptors, `-32002` probe, `view.ut` shell) | same | same | same | same |

The theme targets 23.05+ (ucode templates); anything relying on a newer
surface must degrade to the older behaviour, and the finding must name the
branch.

## 7. Where to look

- `$LUCI_SRC/modules/luci-base/ucode/{dispatcher,http,runtime}.uc`
- `$LUCI_SRC/modules/luci-base/ucode/template/{header,footer,view}.ut`
- `$LUCI_SRC/modules/luci-base/ucode/controller/admin/index.uc`
- `$LUCI_SRC/modules/luci-base/ucode/uhttpd.uc` (in-process handler entry)
- `$LUCI_SRC/modules/luci-base/htdocs/luci-static/resources/{luci,ui,rpc,uci,form,network}.js` (`Poll`, `dom`, `session`, `view` live inside `luci.js`)
- `$LUCI_SRC/luci.mk`, `$LUCI_SRC/themes/luci-theme-bootstrap/`
- Other branches: `git -C $LUCI_SRC show <branch>:<path>` (fetch
  `openwrt-23.05`, `openwrt-24.10`, `openwrt-25.12` first if missing).
