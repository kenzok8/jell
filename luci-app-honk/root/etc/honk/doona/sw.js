const PREFIX = `doona-shell:${self.registration.scope}:`;
// The page reads the same build from index.html, to tell whether this worker taking it over is a new build.
const BUILD = 'c24c910c46a4966f';
const CACHE = PREFIX + BUILD;
const PRECACHE = ["assets/AddCircle-net7vCQK.js","assets/AppearanceControls-_LKvZPhT.js","assets/AreaChart-CqTV2ZQk.js","assets/AreaCurve-DQSHOSpG.js","assets/Checkbox-BiXT27lL.js","assets/CodeEditor-BRSeqxyF.js","assets/ConditionRow-BLWAZu2-.js","assets/Config-8ciDdArn.js","assets/Connections-DJnfTV4N.js","assets/Copy-Bp9aWYUl.js","assets/Coverage-Cw68fF9k.js","assets/DaeCode-DEjXqvav.js","assets/Delete-Cfg0qtTJ.js","assets/Dns-CsAXSf3H.css","assets/Dns-Ct5FliFm.js","assets/Donut-B59wjqJE.js","assets/Editors-dKzIa8sH.js","assets/Editors-rPgk_VZK.css","assets/Events-Bong_UD0.js","assets/FlagPicker-xvDaGCKr.js","assets/Flows-B78_vhjx.css","assets/Flows-vB7lLJCa.js","assets/GridList-CZtL3cpM.js","assets/ItemText-CcW62_Lb.js","assets/LinkOut-Bzsd9jX9.js","assets/Login-CYfxhTlj.js","assets/Logs-BF-bjyix.js","assets/Nodes-Dnjby2fw.js","assets/NumberField-DIugwoyR.js","assets/OutboundTag-EsmwFTLz.js","assets/Overview-B70UhI1M.js","assets/Policies-WQANmdA4.js","assets/ProbeOptionsDialog-DFlcv-Ro.js","assets/Rules-BLx-997n.js","assets/SearchDialog-HRWujKxg.js","assets/SearchList-DnHiclH-.js","assets/SearchSelect-FeisYm3Z.js","assets/Select-DfNHOkHm.js","assets/Settings-B62V8vnf.js","assets/Settings-BVpmQMTB.css","assets/Sparkline-CiSVZVwG.js","assets/SubscriptionFields-BL4cB4Hn.js","assets/Table-B9wBdFJO.js","assets/Tabs-DHvnlDOn.js","assets/Tag-DnsbMsos.js","assets/TimeCell-DFg9wUP4.js","assets/Toolbar-CG16bAGF.js","assets/Trace-BxFFDxXZ.js","assets/TwemojiCountryFlags-Bymva2JV.woff2","assets/Virtualizer-D4o4sanH.js","assets/WallpaperSettings-CyA8YuOE.js","assets/XhttpOptions-CZ9pFI3y.js","assets/_commonjsHelpers-CXUWDbkB.js","assets/activity-Db7VRWAG.css","assets/activity-SP7tP5Sc.js","assets/array-C0VuvQyb.js","assets/auth-BJk40oQc.js","assets/auth-CCQVpwEd.js","assets/daeTokens-BVtuNnWZ.js","assets/duck-night-CbKHyiul.webp","assets/files-Dt8K7QfP.js","assets/flows-4vf3kCNL.js","assets/fonts-C5_wsAqZ.css","assets/geodata-X0pHz03D.js","assets/geodataUpdate-D9C47k_Z.js","assets/glass-Cqyc7cvc.js","assets/glass-D3s0PXdk.css","assets/gorges-dark-FlgXSNn1.webp","assets/gorges-light-DCWkLX37.webp","assets/impact-B8feJDtJ.css","assets/index--6K0oddI.css","assets/index-BpMcZry4.js","assets/index-DUM-iwa2.js","assets/ipLookup-BYorpVJi.css","assets/ipLookup-jJz7YASo.js","assets/labels-D8xxfRTQ.js","assets/lake-dark-B_VaUlAe.webp","assets/lake-light-oWll36-V.webp","assets/lens-BItwTMX6.js","assets/logo-obi05X1B.svg","assets/logs-CSLBu0fr.js","assets/match.worker-B2aIccpg.js","assets/nav-BO8viH9G.js","assets/nav-Br4EizUw.js","assets/nav-Cr9xMfh-.js","assets/nav-DSMpjA0M.js","assets/nav-DTGZlsmE.js","assets/nav-Dx6RnOEO.js","assets/nav-gZ83ZK0m.js","assets/nodes-9cDj613b.js","assets/outbounds-BWBv2v0q.js","assets/probe-NjjZcqcD.js","assets/recorder-BHyqDNp5.js","assets/rule-C-7UBgmI.js","assets/square-dark-CG0rwsS1.webp","assets/square-light-OU6dsCf9.webp","assets/taishan-dark-BI3cd4fj.webp","assets/taishan-light-Dip0HmJZ.webp","assets/useQuickRule-DnICQncm.js","assets/vendor-editor-BRV-W12m.js","assets/vendor-react-64fcanlc.js","assets/wall-dark-DCO0xUUO.webp","assets/wall-light-BYfte2Bi.webp","assets/wallpaper-CEC7gitM.js","index.html"];
// Each language's catalogue and stylesheets in this build, cached only for a language a reader uses. A partial
// language's list holds the reference language's files too, since it loads them.
const LANGUAGES = {"zh-TW":["assets/fonts-tc-D9rvq3k7.css","assets/locale-zh-TW-25e8m-hH.js"],"zh-CN":["assets/fonts-sc-Dyn9aW84.css","assets/locale-zh-CN-CnEcL2eL.js"],"en":["assets/locale-en-BUYMyLNF.js"]};
// The mock backend's chunk, cached only for a page that runs on it.
const MOCK = ["assets/index-BMEfMmeK.js"];
const ROOT = new URL(self.registration.scope);

// A new build takes over on the next online load, including open dashboard tabs.
// Each build records when it was installed, so activation can tell the build it replaces from older ones.
const STAMP = new URL('__installed__', ROOT);
// index.html keeps its name across builds, so it is fetched past the HTTP cache: a caching proxy cannot hand the new
// build an old shell. A file under assets/ is named after its content hash, so the copy the page already loaded through
// the HTTP cache is the same file and is not downloaded again.
const precacheRequest = url => (url.startsWith('assets/') ? url : new Request(url, {cache: 'reload'}));
self.addEventListener('install', event => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then(cache => Promise.all([cache.addAll(PRECACHE.map(precacheRequest)), cache.put(STAMP, new Response(String(Date.now())))]))
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
      // A host may answer a missing file with the page; caching that would keep the file missing once it is installed.
      if (fresh.ok && fresh.type === 'basic' && !fresh.redirected && !fresh.headers.get('content-type')?.includes('html'))
        await cache.put(request, fresh.clone());
      return fresh;
    })()
  );
});
