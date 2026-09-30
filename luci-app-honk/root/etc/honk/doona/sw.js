const PREFIX = `doona-shell:${self.registration.scope}:`;
// The page reads the same build from index.html, to tell whether this worker taking it over is a new build.
const BUILD = '45561e6f164844d9';
const CACHE = PREFIX + BUILD;
const PRECACHE = ["assets/ActionGroup-DLxTuKht.js","assets/AddCircle-D11CyK2n.js","assets/AreaChart-CO6S-Jvj.js","assets/AreaCurve-BriPYJva.js","assets/Arrange-BwxzZLbt.js","assets/Arrange-Dd3j3leY.css","assets/Config-163650iV.js","assets/Connections-EJJs6m0v.js","assets/Coverage-DhDWz2sB.js","assets/DaeCode-B8yPDjSE.js","assets/Dns-4ANKlqye.js","assets/Donut-BeIly43C.js","assets/Events-CoPt5zKa.js","assets/FactStrip-DtkOGBRy.js","assets/Flows-CFBMKQ6x.js","assets/Flows-l5FnUA9B.css","assets/ListLayout-_fDlx5XY.js","assets/Login-CpQFWFRI.js","assets/LoginShowcase-hawa0qI8.js","assets/Logs-CVSaRJiC.js","assets/NodeSearch-aCbtGtHA.js","assets/Nodes-Cccfa5J0.js","assets/Overview-D8AoxOgR.js","assets/Policies-Dgwc4tfn.js","assets/Rules-DPrYBlNM.js","assets/SearchDialog-CtHURV7c.js","assets/Settings-pRdLRQRD.js","assets/Sparkline-m5Y8yApW.js","assets/Table-Km6Zv-S8.js","assets/TimeCell-DKHUJpad.js","assets/Virtualizer-DCY9HC9Z.js","assets/array-C0P64tl-.js","assets/auth-BReGn39D.js","assets/auth-DzCdgIKH.js","assets/dns-BCg5F0Tv.js","assets/duck-night-CbKHyiul.webp","assets/files-BxEOxSF8.js","assets/flows-D3eabARZ.js","assets/geodata-De9_qBkH.js","assets/index-7R3bVGRM.css","assets/index-Bw0aJc9a.js","assets/labels-Bgu_ZhL8.js","assets/layout-BWzq8YqC.js","assets/logo-obi05X1B.svg","assets/nav-BASDWt23.js","assets/nav-BFiTWnsa.js","assets/nav-CS6FFQFP.js","assets/nav-CdRBQuvD.js","assets/nav-D5WY5Qjf.js","assets/nav-DONyavaI.js","assets/nav-Wiib71Wo.js","assets/nav-xc_Z_1Qd.js","assets/openGroup-Dk9B33qx.js","assets/outbounds-DMhWS-9H.js","assets/policyText-CltaDVEo.js","assets/probe-D0Quphno.js","assets/qiangguo-gorges-dark-FlgXSNn1.webp","assets/qiangguo-gorges-light-DCWkLX37.webp","assets/qiangguo-lake-dark-B_VaUlAe.webp","assets/qiangguo-lake-light-oWll36-V.webp","assets/qiangguo-square-dark-CG0rwsS1.webp","assets/qiangguo-square-light-OU6dsCf9.webp","assets/qiangguo-taishan-dark-BI3cd4fj.webp","assets/qiangguo-taishan-light-Dip0HmJZ.webp","assets/qiangguo-wall-dark-DCO0xUUO.webp","assets/qiangguo-wall-light-BYfte2Bi.webp","assets/ranked-SM2ov7Tw.js","assets/recorder-DlDpPhd4.js","assets/setup-DLvQ_6ZI.js","assets/useFilter-Tjznm3lB.js","assets/useGridSelectionCheckbox-COXIVEmS.js","assets/useQuickRule-BmFeKwTA.js","assets/useRefreshAll-D0DryBsY.js","assets/vendor-editor-2EGeBPxF.js","assets/vendor-react-Bf71BWbF.js","index.html"];
// Each language's catalogue and stylesheets in this build, cached only for a language a reader uses. A partial
// language's list holds the reference language's files too, since it loads them.
const LANGUAGES = {"zh-TW":["assets/fonts-tc-B6Zt5HQN.css","assets/locale-zh-TW-CjV1NjVp.js"],"zh-CN":["assets/fonts-sc-DWPGxLPK.css","assets/locale-zh-CN-DF_91JnF.js"],"en":["assets/locale-en-CGmJL3j4.js"]};
// The mock backend's chunk, cached only for a page that runs on it.
const MOCK = ["assets/index-DVuHL8NL.js"];
const ROOT = new URL(self.registration.scope);

// A new build takes over on the next online load, including open dashboard tabs.
// Each build records when it was installed, so activation can tell the build it replaces from older ones.
const STAMP = new URL('__installed__', ROOT);
// Fetched past the HTTP cache, so a caching proxy cannot hand the new build an old shell.
self.addEventListener('install', event => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then(cache => Promise.all([cache.addAll(PRECACHE.map(url => new Request(url, {cache: 'reload'}))), cache.put(STAMP, new Response(String(Date.now())))]))
      .then(() => self.skipWaiting())
  );
});
// A page loads its catalogue and backend before this worker controls it, so it reports the language it shows and
// whether it runs on the mock, to have them cached.
self.addEventListener('message', event => {
  if (event.data?.build === true) {
    event.ports[0]?.postMessage(BUILD);
    return;
  }
  const lang = event.data?.language;
  const files = [...(typeof lang === 'string' && Object.hasOwn(LANGUAGES, lang) ? LANGUAGES[lang] : []), ...(event.data?.mock === true ? MOCK : [])];
  if (!files.length) return;
  event.waitUntil(caches.open(CACHE).then(cache => Promise.all(files.map(async url => (await cache.match(url, {ignoreVary: true})) ?? cache.add(url)))));
});
// The build just replaced stays: tabs still showing it load their remaining chunks from it until reloaded.
self.addEventListener('activate', event => {
  event.waitUntil(
    (async () => {
      const older = [];
      for (const key of await caches.keys()) {
        if (!key.startsWith(PREFIX) || key === CACHE) continue;
        const stamp = await (await caches.open(key)).match(STAMP);
        older.push({key, installed: stamp ? Number(await stamp.text()) : 0});
      }
      older.sort((a, b) => b.installed - a.installed);
      await Promise.all(older.slice(1).map(({key}) => caches.delete(key)));
      await self.clients.claim();
    })()
  );
});

function hit(response) {
  if (!response) return Response.error();
  const headers = new Headers(response.headers);
  headers.set('x-doona-sw', 'hit');
  return new Response(response.body, {status: response.status, statusText: response.statusText, headers});
}

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== ROOT.origin || /\/api(?:\/|$)/.test(url.pathname) || !url.pathname.startsWith(ROOT.pathname)) return;
  const navigation = request.mode === 'navigate';
  if (!navigation && !/^(assets|fonts|icons)\//.test(url.pathname.slice(ROOT.pathname.length))) return;
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      if (navigation) {
        try {
          return await fetch(request);
        } catch {
          return hit(await cache.match(new URL('index.html', ROOT)));
        }
      }
      // A build file is the same for every requester, so a server's Vary: Origin must not turn a cached copy into a miss.
      const response = (await cache.match(request, {ignoreVary: true})) ?? (await caches.match(request, {ignoreVary: true}));
      if (response) return hit(response);
      const fresh = await fetch(request);
      if (fresh.ok && fresh.type === 'basic' && !fresh.redirected) await cache.put(request, fresh.clone());
      return fresh;
    })()
  );
});
