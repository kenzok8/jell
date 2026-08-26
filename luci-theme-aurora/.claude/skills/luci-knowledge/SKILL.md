---
name: luci-knowledge
description: Verified facts about luci-base, uhttpd and this theme's own contract — boot order, template scope, L.require semantics, dispatch costs, caching headers, packaging rewrites, router invariants, budgets. Load before reviewing, changing or benchmarking anything in ucode/, .dev/src/, htdocs/ or before proposing a change to luci-base/uhttpd.
user-invocable: false
---

# LuCI knowledge (Aurora)

Facts only, each with a `file:line` in a local checkout. Nothing here is a
recommendation; the workflows decide what to do with the facts.

| Touching | Read |
|---|---|
| `.ut` templates, `<head>` order, anything before `luci.js` exists | references/luci-runtime.md §1–2, references/aurora-contract.md |
| `menu-aurora.js`, `router-aurora.js`, page JS patches, polling | references/luci-runtime.md §3–4, references/spa-pitfalls.md |
| TTFB, per-navigation cost, "is this worth a dispatch" | references/dispatch-cost.md |
| caching, compression, CGI vs mod-ucode, HTTP-only constraints | references/uhttpd.md, references/luci-runtime.md §5 |
| `?v=`, `{# PKG_VERSION #}`, Makefile, feed, apk/opkg | references/packaging.md |
| any claim that sounds familiar | references/traps.md — refute before repeating |

## Source checkouts (`$LUCI_SRC`, `$UHTTPD_SRC`)

The references cite files inside two upstream checkouts. Their location is
machine-specific and lives only in the git-ignored `.dev/.env`:

```
LUCI_SRC=/path/to/openwrt-luci      # git clone https://github.com/openwrt/luci
UHTTPD_SRC=/path/to/uhttpd          # git clone https://git.openwrt.org/project/uhttpd.git
```

Resolve them before reading any source: `grep -E '^(LUCI|UHTTPD)_SRC=' .dev/.env`.
If a variable is unset or the directory is missing, shallow-clone into
`${TMPDIR:-/tmp}/luci-src/<name>` (`git clone --depth 1`) and say so in the
output. For a branch comparison the checkout may lack the release branches
(a fork's remote): fetch them without touching its config —
`git -C "$LUCI_SRC" fetch --depth 1 https://github.com/openwrt/luci
openwrt-23.05:refs/remotes/upstream/openwrt-23.05` (same for 24.10, 25.12)
— then read with `git show upstream/<branch>:<path>`. Never write a
machine-specific path into a repository file, a report or a proposal — cite
as `openwrt/luci@<branch> modules/luci-base/ucode/http.uc:499` or
`uhttpd file.c:344`.

Rules for every agent using this skill:

1. Never assert luci-base/uhttpd behaviour from memory. Open the file, quote
   it, cite `path:line`, and name the branch (`git -C "$LUCI_SRC"
   branch --show-current`, or `git show <branch>:<path>`).
2. Mark each claim `verified` (read the source) or `inferred` (reasoned).
3. Numbers come from `references/dispatch-cost.md` or a fresh bench run;
   never invent a round figure.
4. The theme floor is OpenWrt 23.05 + Chrome 111 / Safari 16.4 / Firefox 128;
   the Navigation API is optional. Say which floor a finding depends on.
