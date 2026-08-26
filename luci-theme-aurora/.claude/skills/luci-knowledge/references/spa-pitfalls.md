# SPA pitfalls that apply to this router

Distilled from luci-theme-footstrap's router work (public:
https://github.com/VizzleTF/luci-theme-footstrap/blob/main/docs/spa-router.md)
and re-checked against this theme's implementation; Aurora's handling is
specified in `.dev/docs/router.md`. Self-contained — no other note is needed.

| pitfall | why it bites | aurora |
|---|---|---|
| `L.require()` returns the rendered **instance** | re-requiring a view paints nothing; `new` on the instance's class without teardown = double render + double pollers, invisible to the eye | `new instance.constructor()` only after teardown, `router-aurora.js:713` |
| the class rendered by the full load must be marked "seen" | otherwise the first return to that page takes the cold path and renders twice | `initialRoute()` |
| generation check at **paint** time, and a superseded render must never resolve | an empty node blanks the live page, a throw lets luci-base paint an error box into the new page | `navigate()` gen gate |
| poll teardown is three steps: `queue.length = 0`, `stop()`, `start()` | `start()` resets the tick that arms the incoming view's first poll | `teardown()` |
| the `poll-status` indicator outlives polling | core shows it on `poll-start` and never hides it | `hideIndicator('poll-status')` |
| bare `setInterval` in apps survives a same-document swap | a full load killed it; the router must | `hookIntervals()` |
| `alias` / `firstchild` are the most-clicked links and resolve server-side **without a redirect** | `requestpath`/`dispatchpath`/`nodespec` already point at the leaf while the URL stays; port `resolve_firstchild()`/`node_weight()` literally | `resolve()` |
| `env.nodespec.readonly` is not decoration | `hasViewPermission()` reads it → Save/Apply enabled for read-only users if lost | `readonlyAlong()` |
| links with `?query` / `#hash` stay full loads | views read `location.search`; a hash-only change is not a navigation | `onNavigate()` |
| content lands outside `#view` | `<h2>` siblings from server templates, `ui.addNotification()` inserted into `#maincontent` — a full load cleared them, a swap must | `region()`, `commit()` |
| `body[data-page]` and `document.title` | restamp `data-page` from the resolved leaf (page-scoped CSS keys on it); cache the title host once, third-party views overwrite `document.title` | `setEnvironment()` |
| view-injected `<style>`/`<link>` never die, and must never be deleted | ACE's sheet is imported once per document; deleting it leaves a 2-million-pixel black box on the next visit | poison gate: foreign sheet ⇒ next navigation is a full load (`poisoned()`, `knownSheets`) |
| pragma scan must handle a minified one-line head | `/^'require …'$/m` matches nothing on the router's files — silently | `pragmaDeps()` |
| six in-memory names have no file | `baseclass`, `dom`, `poll`, `request`, `session`, `view` 404 on every page if prefetched | `warm()` skips names without a dot |
| prefetch the transitive closure, stop after the click, await in-flight fetches | otherwise the same module downloads twice at full latency | `warm()` |
| hidden tabs keep polling | 24/7 ubus on a low-power router for a page nobody sees | `hookVisibility()` |
| any require/instanceof failure ⇒ full load **with** `console.error` | a silent fallback makes every regression look like "slow page" | `navigate()` catch |

Not applicable here: History API / `pushState` / scroll-restoration pitfalls —
Aurora uses the Navigation API with `scroll: 'after-transition'`.
