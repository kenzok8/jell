import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const source = await readFile(
  new URL("../src/resource/menu-aurora.js", import.meta.url),
  "utf8",
);

const E = (tagName, attributes, children) => ({
  tagName,
  attributes,
  children,
});

const loadMenuModule = (
  localStorage = {},
  { document = {}, navigator = { platform: "" } } = {},
) => {
  const baseclass = {
    extend(module) {
      return module;
    },
  };
  const ui = { menu: { getChildren: () => [] } };
  const L = {
    env: { dispatchpath: [], requestpath: [] },
    url: (...segments) => `/${segments.join("/")}`,
  };

  return new Function(
    "baseclass",
    "ui",
    "E",
    "L",
    "_",
    "document",
    "window",
    "localStorage",
    "navigator",
    source,
  )(baseclass, ui, E, L, (value) => value, document, {}, localStorage, navigator);
};

const menu = loadMenuModule();

const score = (query, text) => menu.fuzzyMatch(query, text)?.score ?? null;

const sliced = (text, ranges) =>
  ranges.map(([from, to]) => text.slice(from, to));

test("matches a scattered subsequence and reports its ranges", () => {
  const match = menu.fuzzyMatch("dns", "DHCP and DNS");

  assert.ok(match);
  assert.deepEqual(sliced("DHCP and DNS", match.ranges), ["DNS"]);
});

test("returns null when the query is not a subsequence", () => {
  assert.equal(menu.fuzzyMatch("zzz", "Firewall"), null);
});

test("retries from every first-character occurrence instead of staying greedy", () => {
  // A single greedy pass anchors "dns" to the leading D of "DHCP and DNS" and
  // scatters, scoring the real hit below shorter near-misses.
  assert.ok(score("dns", "DHCP and DNS") > score("dns", "Diagnostics"));
});

test("scores an adjacency run above the same characters scattered", () => {
  assert.ok(score("fir", "Firewall") > score("fir", "Failover in Routing"));
});

test("rewards word starts", () => {
  assert.ok(score("s", "Status") > score("s", "Wireless"));
});

test("penalises longer targets so the tighter title wins", () => {
  assert.ok(score("log", "Logout") > score("log", "Logging and reporting"));
});

test("matches CJK titles", () => {
  const match = menu.fuzzyMatch("防火墙", "防火墙设置");

  assert.ok(match);
  assert.deepEqual(sliced("防火墙设置", match.ranges), ["防火墙"]);
});

test("keeps astral characters whole in the reported ranges", () => {
  // `at` is a UTF-16 offset while for...of yields code points: advancing by 1
  // would end the range inside the surrogate pair and slice it into mojibake.
  const title = "🚀 Passwall";
  const match = menu.fuzzyMatch("🚀", title);

  assert.ok(match);
  assert.deepEqual(match.ranges, [[0, 2]]);
  assert.deepEqual(sliced(title, match.ranges), ["🚀"]);
});

test("merges adjacent astral matches into one range", () => {
  const title = "𠀀𠀁 Extension";
  const match = menu.fuzzyMatch("𠀀𠀁", title);

  assert.ok(match);
  assert.deepEqual(match.ranges, [[0, 4]]);
  assert.deepEqual(sliced(title, match.ranges), ["𠀀𠀁"]);
});

test("an empty query matches every entry unranked and unhighlighted", () => {
  assert.deepEqual(menu.matchPaletteEntry("", { title: "Status" }), {
    score: 0,
    ranges: null,
  });
});

test("title hits outrank name hits and are the only highlighted ones", () => {
  const title = menu.matchPaletteEntry("dns", {
    title: "DNS",
    name: "dns",
    group: "Network",
  });
  const viaName = menu.matchPaletteEntry("dhcp", {
    title: "DNS",
    name: "dhcp",
    group: "Network",
  });

  assert.ok(title.ranges);
  assert.equal(viaName.ranges, null);
  assert.ok(title.score > viaName.score);
});

test("falls back to the group when neither title nor name matches", () => {
  const match = menu.matchPaletteEntry("netw", {
    title: "DNS",
    name: "dns",
    group: "Network",
  });

  assert.ok(match);
  assert.equal(match.ranges, null);
});

test("returns falsy when nothing on the entry matches", () => {
  assert.ok(
    !menu.matchPaletteEntry("zzz", {
      title: "DNS",
      name: "dns",
      group: "Network",
    }),
  );
});

test("wraps matched ranges in <mark> and keeps the surrounding text", () => {
  const parts = menu.highlightPaletteMatch("DHCP and DNS", [[9, 12]]);

  assert.deepEqual(
    parts.map((part) => (typeof part === "string" ? part : part.children[0])),
    ["DHCP and ", "DNS", ""],
  );
  assert.equal(parts[1].tagName, "mark");
});

test("highlights astral characters without splitting the surrogate pair", () => {
  const parts = menu.highlightPaletteMatch("🚀 Passwall", [[0, 2]]);

  assert.equal(parts[1].children[0], "🚀");
  assert.ok(!parts.some((part) => String(part).includes("�")));
});

test("skips highlighting when case folding would skew the offsets", () => {
  // "İ".toLowerCase() is two code units, so ranges measured on the lowercased
  // copy no longer index the original.
  assert.deepEqual(menu.highlightPaletteMatch("İnterface", [[0, 1]]), [
    "İnterface",
  ]);
});

test("renders the plain title when there are no ranges", () => {
  assert.deepEqual(menu.highlightPaletteMatch("Status", null), ["Status"]);
});

// ---- Recents: recording, storage hygiene, and browse-order floating ----

const RECENTS_KEY = "aurora.paletteRecents";

const fakeStorage = (initial = {}) => {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    map,
  };
};

const navPage = (name, title, group = "Group") => ({
  title,
  name,
  group,
  href: `/${name}`,
});

const paletteWith = (storage, index) => {
  const module = loadMenuModule(storage);
  module.paletteIndex = index;
  return module;
};

const browseIndex = () => [
  navPage("status/overview", "概览", "状态"),
  navPage("status/syslog", "系统日志", "状态"),
  navPage("network/iface", "接口", "网络"),
  navPage("network/firewall", "防火墙", "网络"),
  { title: "浅色模式", name: "theme light", group: "主题", mode: "light" },
];

const stored = (recents) => ({ [RECENTS_KEY]: JSON.stringify(recents) });

const names = (matches) => matches.map((match) => match.page.name);

test("a recorded selection lands at the head of the stored recents", () => {
  const storage = fakeStorage();
  const palette = paletteWith(storage, browseIndex());

  palette.recordPaletteRecent("status/syslog");
  palette.recordPaletteRecent("network/iface");

  assert.deepEqual(JSON.parse(storage.map.get(RECENTS_KEY)), [
    "network/iface",
    "status/syslog",
  ]);
});

test("re-recording an entry moves it up instead of duplicating it", () => {
  const storage = fakeStorage(stored(["network/iface", "status/syslog"]));
  const palette = paletteWith(storage, browseIndex());

  palette.recordPaletteRecent("status/syslog");

  assert.deepEqual(JSON.parse(storage.map.get(RECENTS_KEY)), [
    "status/syslog",
    "network/iface",
  ]);
});

test("the store has no artificial cap — dedupe is the only bound", () => {
  const storage = fakeStorage(stored(["h", "g", "f", "e", "d", "c", "b", "a"]));
  const palette = paletteWith(storage, browseIndex());

  palette.recordPaletteRecent("i");

  assert.deepEqual(JSON.parse(storage.map.get(RECENTS_KEY)), [
    "i",
    "h",
    "g",
    "f",
    "e",
    "d",
    "c",
    "b",
    "a",
  ]);
});

test("corrupt or foreign stored values read as no history", () => {
  for (const value of ["not json", '"just a string"', "[1,2,3]", "{}"]) {
    const palette = paletteWith(
      fakeStorage({ [RECENTS_KEY]: value }),
      browseIndex(),
    );
    assert.deepEqual(palette.readPaletteRecents(), [], value);
  }
});

test("a throwing storage neither breaks reads nor records", () => {
  const hostile = {
    getItem: () => {
      throw new Error("privacy mode");
    },
    setItem: () => {
      throw new Error("quota");
    },
  };
  const palette = paletteWith(hostile, browseIndex());

  assert.deepEqual(palette.readPaletteRecents(), []);
  assert.doesNotThrow(() => palette.recordPaletteRecent("status/overview"));
});

test("browsing floats stored recents in recency order, menu order behind", () => {
  const palette = paletteWith(
    fakeStorage(stored(["network/iface", "status/syslog"])),
    browseIndex(),
  );

  assert.deepEqual(names(palette.collectPaletteMatches("")), [
    "network/iface",
    "status/syslog",
    "status/overview",
    "network/firewall",
    "theme light",
  ]);
});

test("every visited page floats in recency order; vanished names drop", () => {
  const wide = [
    navPage("p1", "One"),
    navPage("p2", "Two"),
    navPage("p3", "Three"),
    navPage("p4", "Four"),
    navPage("p5", "Five"),
    navPage("p6", "Six"),
    navPage("p7", "Seven"),
  ];
  const palette = paletteWith(
    fakeStorage(stored(["removed/page", "p7", "p6", "p5", "p4", "p3", "p2"])),
    wide,
  );

  // Pure LRU: all six visited pages float, only p1 keeps its menu slot.
  assert.deepEqual(names(palette.collectPaletteMatches("")), [
    "p7",
    "p6",
    "p5",
    "p4",
    "p3",
    "p2",
    "p1",
  ]);
});

test("a stored name never floats a command row", () => {
  const palette = paletteWith(
    fakeStorage(stored(["theme light"])),
    browseIndex(),
  );

  assert.deepEqual(names(palette.collectPaletteMatches("")), [
    "status/overview",
    "status/syslog",
    "network/iface",
    "network/firewall",
    "theme light",
  ]);
});

test("typed queries rank by fuzzy score alone", () => {
  const palette = paletteWith(
    fakeStorage(stored(["diag"])),
    [navPage("dns", "DNS Settings"), navPage("diag", "Diagnostics")],
  );

  // "Diagnostics" is the recent entry, but the tight title hit must win.
  assert.deepEqual(names(palette.collectPaletteMatches("dns")), [
    "dns",
    "diag",
  ]);
});

test("'>' browsing lists command rows only, unaffected by recents", () => {
  const palette = paletteWith(
    fakeStorage(stored(["network/iface"])),
    browseIndex(),
  );

  assert.deepEqual(names(palette.collectPaletteMatches(">")), ["theme light"]);
});

// ---- Logout as a ">"-only command ----

const logoutIndex = () => [
  navPage("p1", "Alpha"),
  navPage("p2", "Beta"),
  navPage("p3", "Gamma"),
  navPage("p4", "Delta"),
  navPage("p5", "Epsilon"),
  navPage("p6", "Zeta"),
  { title: "浅色模式", name: "theme light", group: "主题", mode: "light" },
  { title: "Logout", name: "logout", group: null, href: "/logout", isLogout: true },
];

test("'>' browsing includes the logout command", () => {
  const palette = paletteWith(fakeStorage(), logoutIndex());

  assert.deepEqual(names(palette.collectPaletteMatches(">")), [
    "theme light",
    "logout",
  ]);
});

test("plain browsing hides the logout command", () => {
  const palette = paletteWith(fakeStorage(), logoutIndex());

  assert.deepEqual(names(palette.collectPaletteMatches("")), [
    "p1",
    "p2",
    "p3",
    "p4",
    "p5",
    "p6",
    "theme light",
  ]);
});

test("typed queries still reach logout", () => {
  const palette = paletteWith(fakeStorage(), logoutIndex());

  assert.deepEqual(names(palette.collectPaletteMatches("logout")), ["logout"]);
});

test("a stored logout name never floats", () => {
  const palette = paletteWith(
    fakeStorage(stored(["logout", "p6", "p5", "p4", "p3", "p2"])),
    logoutIndex(),
  );

  assert.deepEqual(names(palette.collectPaletteMatches("")), [
    "p6",
    "p5",
    "p4",
    "p3",
    "p2",
    "p1",
    "theme light",
  ]);
});

test("initPalette appends logout as the last command row", () => {
  const toggle = {
    setAttribute() {},
    addEventListener() {},
  };
  const doc = {
    querySelector: (sel) => (sel === "#cmdk-trigger" ? toggle : null),
    addEventListener() {},
  };
  const palette = loadMenuModule(fakeStorage(), { document: doc });

  palette.initPalette([
    {
      name: "status",
      title: "Status",
      hasChildren: true,
      pages: [{ name: "overview", title: "Overview", href: "/overview" }],
    },
    {
      name: "logout",
      title: "Logout",
      href: "/logout",
      hasChildren: false,
      isLogout: true,
    },
  ]);

  const last = palette.paletteIndex.at(-1);
  assert.equal(last.isLogout, true);
  assert.equal(last.href, "/logout");
  assert.equal(last.title, "Logout");
  // After the theme commands, so ">" lists modes first, logout last.
  assert.ok(palette.paletteIndex.findIndex((page) => page.mode) >= 0);
  assert.ok(
    palette.paletteIndex.findIndex((page) => page.mode) <
      palette.paletteIndex.indexOf(last),
  );
});
