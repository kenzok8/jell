# Packaging facts (luci.mk, Makefile, feed)

## luci.mk rewrites at package build (`$LUCI_SRC/luci.mk:287-298`, `SubstituteVersion`)

Applied to every `*.ut` / `*.htm` under the installed template dir:

1. `{# PKG_VERSION #}` → the package version (aurora `header.ut:227` uses it
   for `body[data-asset-version]`; luci-base `header.ut:10` for `luci.js?v=`).
2. Quoted `"{{ media }}…/x.css"` and `"{{ resource }}…/x.js"` links get
   `?v=$(PKG_VERSION)` appended. The regex requires the literal `.css"`/`.js"`
   at the end of the quoted string, so `{{ resource }}/{{ dispatched.css }}`
   is **not** rewritten (same as bootstrap) while
   `{{ media }}/patches/{{ patch }}.css` **is**.

Never judge versioning from the source `.ut`; inspect the installed file or
the live HTML.

## Theme Makefile

- `PKG_VERSION` / `PKG_RELEASE` (date) in `Makefile`. `LUCI_MINIFY_CSS:=`
  blanks luci.mk's default `LUCI_MINIFY_CSS?=1` (`luci.mk:18`), so the
  csstidy pass (`luci.mk:274-280`) is skipped for the already-minified
  `htdocs/`. `LUCI_MINIFY_JS` is **not** blanked: with `CONFIG_LUCI_JSMIN`
  the package build runs jsmin over `htdocs/**/*.js` (`luci.mk:261-268`),
  so on-device JS sizes can differ from the repo's — measure on the device
  when a JS budget is the question.
- `root/etc/uci-defaults/30_luci-theme-aurora` sets `luci.themes.Aurora` and
  `luci.main.mediaurlbase` on fresh installs only (`PKG_UPGRADE != 1`).
- The OpenWrt buildbot has no Node: `htdocs/luci-static/` is the committed
  output of `pnpm build`; the package copies it verbatim.
- Floors: OpenWrt 23.05 (ucode templates); Chrome 111 / Safari 16.4 /
  Firefox 128; the Navigation API is an optional enhancement.
- CI: `.github/workflows/build-theme-package.yml` builds ipk + apk on tags,
  manual dispatch, and branch pushes whose head commit message contains
  `[build]`.
