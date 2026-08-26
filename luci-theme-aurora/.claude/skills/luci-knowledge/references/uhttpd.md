# uhttpd — what the server actually does

Verified against `$UHTTPD_SRC` (f682cca, 2026-07-24). Stock
OpenWrt serves LuCI with this server; every "cache forever" or "gzip"
assumption must be checked here first.

## 1. Static files (`file.c`)

- Validators only: `ETag` (from inode/size/mtime, `uh_file_mktag`) and
  `Last-Modified` (`file.c:344-345`). Conditional requests
  (`If-None-Match`, `If-Modified-Since`, `If-Range`, …) are honoured.
- **No `Cache-Control`, no `Expires`.** A versioned URL (`?v=1.2.5`) is
  therefore *not* "download once": the browser applies heuristic freshness
  (≈10 % of the file's age since `Last-Modified`) and revalidates with a 304
  after that. Fresh installs (young mtimes) revalidate almost every click.
- **No content negotiation.** `Accept-Encoding` is never read; there is no
  gzip/brotli, and no `.gz` sidecar lookup. Raw bytes are wire bytes.
- The query string is separated from the path and otherwise ignored, which
  is what makes `luci.mk`'s `?v=` rewrite safe.

## 2. Dynamic handlers

| handler | process model | used for |
|---|---|---|
| CGI (`cgi.c`) | `uh_create_process` (fork) + `execl` of the script per request (`cgi.c:63-65`, `:91`) | `/cgi-bin/luci` — the default LuCI dispatch |
| `uhttpd-mod-ubus` (`ubus.c`) | in-process, libubus; no fork, no exec | `/ubus/` JSON-RPC — every `L.rpc` call |
| `uhttpd-mod-ucode` (`ucode.c`) | VM created and handler **executed at startup** (`uh_ucode_state_init`, `ucode.c:224-300`: `uc_compile` + `uc_vm_execute` of the handler file), then `create_process` (fork, no exec) per request calling `handle_request(env)` (`ucode_handle_request`, `ucode.c:378-400`; `ucode_main`, `ucode.c:320`) | `ucode_prefix` mappings |

Request headers reach CGI (and the ucode handler, `ucode.c:348` region)
only through the whitelist `proc_header_env[]` (`proc.c:56-76`, applied at
`:166-173`): Accept*, Authorization, Connection, Cookie, Host, Origin,
Referer, User-Agent, X-Http-Method-Override, Auth-User/Pass, Content-Type,
Content-Length. `If-None-Match` and `If-Modified-Since` are **not** in it —
a dispatcher action can never see a validator and can never answer 304;
only the static-file path does (`file.c:66,426`). Response headers written
by the action are replayed verbatim (`proc.c:207-226`); uhttpd consumes
`Status` and only notes `Content-Length`/`Transfer-Encoding`.

So with `mod-ucode`, top-level code of the handler — including
`import dispatch from 'luci.dispatcher'` in luci-base's
`ucode/uhttpd.uc` — runs **once** in the parent; each request inherits the
warmed VM through fork (copy-on-write). The 37.2 ms `import luci.dispatcher`
line in `dispatch-cost.md` is exactly the cost this model amortises.

Configuration (not the OpenWrt default; `uhttpd-mod-ucode` must be
installed):

```
uci add_list uhttpd.main.ucode_prefix='/cgi-bin/luci=/usr/share/ucode/luci/uhttpd.uc'
```

Open questions to measure before recommending it widely: per-request fork
cost of the larger warmed process, memory (VmRSS) of the parent, behaviour
under concurrent requests (uhttpd is a single-threaded event loop; forked
children run in parallel), and index-cache reparse (`dispatcher.uc:366`) which
is still per request unless memoised in module scope.

## 3. The three server-side changes that matter for this theme

| gap | what nginx/Caddy do | smallest uhttpd change |
|---|---|---|
| no compression (main.css 192 KB → 23 KB gzip; luci-base JS ≈700 KB → ≈150 KB) | `gzip_static` / `precompressed`: serve `<path>.gz` when `Accept-Encoding` allows, `Vary: Accept-Encoding` | `file.c`: after path lookup, if `<phys>.gz` exists and gzip is accepted, serve it with `Content-Encoding: gzip` + `Vary` (≈60–80 lines). Sidecars built at package time; zero router CPU |
| no `Cache-Control` → 304 per click | `Cache-Control: public, max-age=31536000, immutable` on fingerprinted URLs (RFC 8246) | `file.c`: emit it when the query carries `v=` (≈10 lines). Every LuCI `?v=` URL is already a real fingerprint |
| CGI fork+exec per dispatch (37 ms import) | FastCGI / PHP-FPM persistent workers | already shipped: `mod-ucode` + `luci-base/ucode/uhttpd.uc` (§2); needs default config + measurement |

A router reached over plain `http://` on the LAN is not a secure context:
no Service Worker, no speculation rules, no PWA install prompt unless
`luci-ssl` is in use. Baseline designs assume plain HTTP.

## 4. Where to look

- `$UHTTPD_SRC/{file,cgi,ucode,lua,ubus,client,main}.c`
- OpenWrt package: `package/network/services/uhttpd` (Makefile, `files/uhttpd.config`, `files/uhttpd.init`) in an OpenWrt tree
- LuCI side: `$LUCI_SRC/modules/luci-base/ucode/uhttpd.uc`
