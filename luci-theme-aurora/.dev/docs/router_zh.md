<h4 align="right"><a href="router.md">English</a> | <strong>简体中文</strong></h4>

# 客户端路由

本文讲清楚三件事：主题如何把一次菜单点击变成文档内的视图替换、而不是整页加载；哪些情况下它刻意不这么做；以及一个跑在 LuCI 里的路由必须守住哪些不变量。源码在 `.dev/src/resource/router-aurora.js`，由 `footer.ut` 与 `menu-aurora.js` 一同加载。**没有改动 luci-base，也没有改动任何 view** —— 路由是纯增量的主题 JS，加上三处很小的模板钩子（补丁清单、`<footer>` 边界，以及 header.ut 自己渲染的样式表上的 `data-aurora-*` 标记）。

![一次 LuCI 导航：设备做了什么、浏览器做了什么，以及同文档路由删掉了其中哪些步骤](https://raw.githubusercontent.com/eamonxg/assets/master/shared/architecture/same-document-router-architecture.zh-cn.svg)

## 前人的工作

[luci-theme-footstrap](https://github.com/VizzleTF/luci-theme-footstrap) 解决的是同一个问题，读它的代码启发了这里的两处实现：隐藏标签页时暂停 `L.Poll`，以及沿 dispatch 路径折叠 view 的只读状态（两者都在下文）。其余部分是独立实现，且有一处选择是刻意分道扬镳的。footstrap 用 **History API**（`pushState`/`popstate`）驱动导航，需要自己记账滚动位置，并用 `prototype.render` 守卫来修复过期渲染；本路由建立在 **Navigation API** 之上（见「内核」一节），把滚动、历史和取代关系都交还给浏览器，因而完全不需要那些东西 —— 代价是只能跑在较新的浏览器上，在其余浏览器里主题退回它本来就是的普通 MPA。在这个共同的基座之上，本路由还加了会话过期闸门、直接从服务端自己的外壳复制 `template` 页面（而不是手工移植），以及用视图过渡为替换做交叉淡入 —— 每一项在下文各有一节。

## 收益实测

**Cudy TR3000**（mediatek/filogic，ARMv8），OpenWrt SNAPSHOT r0-20d94d5，部署本分支，纯 HTTP，热缓存，2026-08-18。两条路径在同一个循环里测量（`bench-fullload.mjs`，RUNS=10，对下面 8 个页面取中位数），因此它们看到的设备状态相同。整页加载的多次运行波动为 ±40 ms：结论在比例，不在具体数字。

### 一次整页加载的时间都花在哪

| 阶段 | ms | 具体是什么 |
|---|--:|---|
| dispatch #1 —— 页面 HTML | 0→123 | TTFB 118：菜单树、ACL 折叠、`view.ut` → `header.ut` |
| dispatch #2 —— `admin/translations/<lang>` | 124→209 | *第二个* CGI 进程，阻塞解析，不可缓存 |
| DOMContentLoaded | 215 | 外壳回来了，与刚刚被丢弃的那份逐字节相同 |
| view 模块 + ubus 数据 + 渲染 | 215→321 | 静态资源已经是缓存命中 |

**321 ms 里有 209 ms 花在任何页面相关的事情发生之前。** 两次 dispatch 都在重新推导一个浏览器屏幕上本来就有的外壳；view 自己的 ubus 调用要到 227 ms 才开始。同文档替换删掉了这两次 dispatch，只留下最后一行 —— 同样这 8 个页面在热缓存下的中位数是 **91 ms**，数据调用从 227 ms 提前到 2 ms 开始。

### 一次 dispatch 让设备付出多少

在设备本机测量，所以数字里不含网络（`bench-dispatch.sh`）。

| 请求 | ms | 字节 |
|---|--:|--:|
| 页面 HTML，一个 `view` 节点 | 75.4 | 18,583 |
| `admin/translations/en` | 62.7 | **13** |
| `admin/translations/zh-cn` | 60.3 | 229,503 |
| `admin/menu` —— 每 *会话* 一次，不是每次导航 | 68.2 | 45,022 |
| 静态 `main.css` | **0.8** | 191,899 |

| 一次 dispatch 内部，按进程计 | ms |
|---|--:|
| fork + ucode VM | 2.2 |
| `import luci.dispatcher`（runtime、http、ubus、uci、core、authplugins） | 37.2 |
| 菜单树：stat 8 个 `menu.d` 文件 + 解析 28,307 B 的索引缓存 | 13.8 |
| 经 ubus 的 `session.get` + `session.access` | 6.0 |

`en` 那一行是对照组：一个 **13 字节** 的响应仍然要花 62.7 ms，而一个 191,899 字节的静态文件 0.8 ms 就送出去了。成本在 dispatch，不在负载 —— 而一次整页加载要把这一整块付 **两遍**。（`zh-cn` 客户端还要在每次导航时重新传输 229,503 B：`http.uc` 里的 `write_headers()` 设置了 `Cache-Control: no-cache` 和 `Expires: 0`，且没有 `ETag` 或 `Last-Modified`，因此根本没有可供重新校验的依据。）

### 端到端，从点击到视图绘制

每页取 10 次中位数，整页加载 = 导航开始 → `#view` 的第一个非 spinner 子节点；路由 = 点击 → 该次导航的 `finished` promise。

| 页面 | 整页加载 | 路由（热） | 快了 |
|---|--:|--:|--:|
| status/routesj | 326 | 92 | 72 % |
| status/nftables | 316 | 90 | 72 % |
| status/logs | 281 | 100 | 64 % |
| status/processes | 457 | 228 | 50 % |
| status/channel_analysis | 401 | 54 | 87 % |
| status/realtime | 211 | 37 | 82 % |
| system/system | 496 | 132 | 73 % |
| system/admin | 231 | 40 | 83 % |

中位数 **快 73 %**，范围 50–87 %。另一套独立的测量工具 `bench-router.mjs timing` 在同一天跑了两次，结果分别是 72 % 和 74.5 % —— 这些差异都落在设备自身的波动范围内，所以请把范围、而不是某个数字，当作结论。

Speculation Rules 预取够不到这块收益：该 API 只在安全上下文可用，所以在 HTTP 上是失效的；而在 HTTPS 上，文档预取也只能藏起第一次 dispatch —— 语言包是子资源，要等文档到达之后才会去取。

## 为什么这件事做得成

对一个 `view` 节点，dispatcher 渲染的是 `view.ut`：先是主题 header，然后 `<div id="view">` 里带一段内联的 `L.require('ui').then(ui => ui.instantiateView('<path>'))`，最后是主题 footer。服务端决定 *哪一个* view；客户端负责渲染它。路由做的就是在不重新加载的前提下重复 `view.ut` 做的事：把路径拿到客户端已经持有的菜单树里解析（`ui.menu.load()` 从 `sessionStorage` 供给），替换内容区域，重新实例化 view，并把 URL 交给浏览器自己管。

## 内核：只用 Navigation API

`navigation.addEventListener('navigate', …)` + `event.intercept()`。一个事件就覆盖了链接点击、`location.assign`、回退/前进到同文档条目，以及我们自己的 `navigation.navigate()`；浏览器负责写 URL 和历史条目，通过 `event.signal` 暴露取代关系，并且（配合 `scroll: 'after-transition'`）在回退/前进时恢复滚动、在压栈时滚到顶部 —— 所以路由里没有任何 `pushState`/`popstate` 代码，没有滚动记账，也没有「是片段跳转还是导航」的启发式判断。

为什么用这个 API，而不是 footstrap 用的 History API：

- **URL、历史和滚动都归浏览器管。** `pushState` 会把这三者、以及让它们与渲染结果保持一致的责任全塞给路由；而在这里，路由永远只负责渲染。
- **取代关系是内建的。** 更新的一次导航会中止更旧那次的 `event.signal`；下文的世代闸门只是一个检查，不是状态机，也不需要 `render` 守卫去修复过期的绘制。
- **各种导航形式都汇聚到同一个监听器** —— 链接点击、`location.assign`、回退/前进到同文档条目、我们自己的 `navigation.navigate()` —— 因此需要保证正确的只有一条路径。
- **回退方案是免费的。** 在没有该 API 的地方，主题就是它本来的 MPA；不需要 polyfill，也不需要按特性分叉。

**没有该 API 的浏览器保持 MPA。** `footer.ut` 只在 `window.navigation` 存在时才 require 该模块，而 `__init__` 会再次检查它真正用到的接口面：`navigation.addEventListener`、`NavigateEvent`，以及其原型上的 `intercept`。Chrome/Edge **105+**、Safari 26.2+、Firefox 147+ 会启用路由 —— 是 105 而不是首次发布 Navigation API 的 102，因为直到 Chrome 108 之前该方法都叫 `transitionWhile()`，`canIntercept` 也还叫 `canTransition`；正是「以 `intercept` 为闸门」把下限抬到了 105。主题声明的下限（Chrome 111 / Safari 16.4 / Firefox 128）照旧生效。这是一个刻意的取舍：一条构造上就正确的代码路径，胜过再加一条 History API 路径、把下文所有内容的面积翻倍。

## 兼容性

### 浏览器 —— 按平台特性分列

| 特性 | 用途 | 是否必需？ | Chrome / Edge | Safari | Firefox | 缺失时 |
|---|---|---|---|---|---|---|
| Navigation API（`navigation.addEventListener('navigate')`、`NavigateEvent.intercept()`、`event.destination/signal`、`navigation.navigate()/back()`） | 整个路由 | **是 —— 闸门** | 105+（2022） | 26.2+（2026-01） | 147+（2026-01） | `router-aurora.js` 根本不会被加载（`footer.ut` 检查 `window.navigation`）；主题就是之前那个普通 MPA |
| `document.startViewTransition()`（同文档） | 替换时的交叉淡入 | 否 | 111+ | 18+ | 144+ | 无动画直接替换；在 `prefers-reduced-motion` 下同样关闭 |
| `fetch(url, { priority: 'low' })` | 悬停预热模块 | 否 | 101+ | 17.2+ | 132+ | 该选项被忽略，fetch 仍以默认优先级执行 |
| `MutationObserver`、`DOMParser`、`WeakSet`、`URL`、`Element.replaceWith`、`:scope`、`matchMedia`、可选链 / `??=` | 渲染完成检测、模板外壳、投毒闸门、暂存 | 是 | ≥ 85 | ≥ 14 | ≥ 79 | 全都在主题声明的下限之内（Chrome 111 / Safari 16.4 / Firefox 128） |

所以路由的实际下限是 Chrome/Edge 105、Safari 26.2、Firefox 147；更老的一切都保持主题现有的下限和行为。已在 Chrome 151 上实机验证（headless，`bench-router.mjs`）；Safari/Firefox 仅凭特性检测 —— 闸门检的是同一套 API 接口面，不是 UA 嗅探。

### OpenWrt / LuCI

主题本来就要求 OpenWrt 23.05+（ucode 模板）。除下面点名的两处与版本相关的项目外，路由只触碰在 `openwrt/luci` 的 `openwrt-23.05`、`openwrt-24.10`、`openwrt-25.12` 和 `master` 分支上完全一致的 luci-base 接口面（对照分支源码核查，2026-08）：带实例缓存和 `prototype.constructor` 的 `L.require`、`L.view`、`L.dom.content` 与 `data-idref` 注册表、`L.env.{scriptname, base_url, resource_version, media, requestpath, dispatchpath, pathinfo, nodespec}`、`L.hasSystemFeature`、`L.Poll.{queue, start, stop, active, timer}`（以及 `start()` 对 `tick` 的重置，正是它让进入的 view 的首次轮询重新上膛）、`ui.menu.load()` 那棵会话缓存的树及其 `satisfied` / `firstchild_ineligible` / `wildcard` / `action.type`（`view`、`alias`、`firstchild`、`template`）、`setupDOM` 的 `poll-start` 处理器注册的 `poll-status` 指示器 id（拆除时按这个名字隐藏它）、`ui.instantiateView`、`ui.hideIndicator`、`ui.hideModal`、`uci.state.values` / `uci.unload()` / `uci.load()`、`network.js` 基于 uci 的状态、`Request.addInterceptor` / `rpc.addInterceptor` 以及 `setupDOM` 里 `-32002` → `session.access` 的探测、`dispatcher.uc` 的 `ctx_append` acl 折叠、`view.ut` 的 `#view` + 内联 `instantiateView` 外壳，还有 `dispatcher.uc` 的 `resolve_firstchild` / `node_weight` / alias 重新分发语义（逐行移植）。

**有两处接口面在这些分支之间并不一致**，解析器是按较新的那一版写的：

- **`node.css`** 只在 master 上进入了 `build_pagetree` 的 schema（7c6d8ff，2026-08）。23.05、24.10 和 25.12 的任何节点上都没有 `css`，所以 `nodeCss()` 返回 `null`，该特性在那里就是单纯的失效状态。
- **通配符下降。** `wildcardaction` 存在于 25.12 和 master，不存在于 23.05 或 24.10 —— 键不存在时会退回 `node.action`，那正是这些版本本来的行为，所以这部分是安全的。不安全的是围绕它的 *解析规则*：25.12 和 master 会先下降到匹配的 `satisfied` 子节点，然后才把剩余段当作参数；而 23.05 和 24.10 一旦到达 `wildcard` 节点，就立刻把剩下的每一段都捕获为参数。路由移植的是 25.12/master 的规则。因此在 23.05 或 24.10 上，一棵同时有 `foo/*` 和真实 `foo/bar` 子节点的树，在路由里和在 dispatcher 里会解析出不同结果 —— 正是「点击打开一个页面、F5 打开另一个页面」这种故障，而这个解析器存在的意义就是避免它。该规则和 `wildcardaction` 是同一个提交引入的（df90c60a7，2026-01-17），其声明目的是让 `path/*` 能携带一个区别于裸路径的 action，所以在此之前这种结构根本没有定义好的行为，一棵为 23.05/24.10 编写的树不太可能用到它 —— 但这是一个论证，不是对每一份已安装 `menu.d` 的普查，而且路由从未在这两个版本上跑过。请把 23.05/24.10 当作「已审阅」，而非「已验证」。

目前的实机验证：OpenWrt SNAPSHOT r0-20d94d5（2026-08，mediatek/filogic），以及 ipq60xx 上一个更早的 SNAPSHOT。23.05 / 24.10 / 25.12 仅凭分支源码，未上设备。

上面这份清单同时也是可执行的：`router-aurora.js` 里的 `contract()` 会在启动时逐一查找其中每一个接口面（`L.view`、`L.require`、`L.dom.content`、`L.env.{base_url,resource,media}`、`L.Request.addInterceptor`、`L.uci.{load,unload,state}`、`rpc.addInterceptor`、`poll.{queue,start,stop,active}`、`ui.menu.load`、`ui.hideModal`、`ui.hideIndicator`、`E`），只要有任何一项缺失，就记录是哪一项并且不激活 —— 在一个已经演进过的 luci-base 上，主题仍然是它原本的 MPA，而不是一个坏掉的路由。

## 什么会被拦截

只有当**全部**条件成立时，`navigate` 事件才会被拦截：

- `event.canIntercept`（同源、并非仅限跨文档），不是 `hashChange`，没有 `downloadRequest`，没有 `formData`，且 `navigationType !== 'reload'`；
- 目标**不是文档自身的 URL**（片段除外）。同 URL 导航到达时的 `navigationType` 是 `'replace'` 而非 `'reload'`，但它其实就是换了个名字的重新加载：luci-base 的 `ui.changes.apply/revert` 以 `window.location = window.location.href.split('#')[0]` 结尾（过期弹窗的按钮也一样），正是为了让服务端重新渲染外壳 —— 在「系统 → 语言和界面」下换了主题、换了语言、换了主机名、菜单树变了 —— 而拦截它会导致替换后仍显示旧外壳，直到 F5。点击当前页面自己的链接，在这里和在 MPA 里一样，就是一次重新加载；
- 目标路径（去掉 `L.env.scriptname` 后）在菜单树中解析到一个**可服务节点**（见下）；
- 文档没有被**投毒**（见下），且其会话没有被判定为**已过期**（见下）；
- 路由在本文档中**已激活**：只有当它启动时所在的页面本身可服务，它才会激活。`call`/`cbi`/`function` 页面携带的脚本（遗留的 `XHR.poll`、内联定时器）只有文档死亡才能收回，因此从这类页面点出去的第一次点击总是整页加载。

其他一切原样放行：浏览器执行普通的完整导航，也就是主题以前的行为。带修饰键的点击和 `target=_blank` 根本不会到达这个事件。

### 可服务节点

用 dispatcher 自身规则的移植版来解析，而不是照着意思重写：

- `alias` → 从根开始跳到 `action.path` 并继续；
- `firstchild` → 跑 dispatcher 同款的 `resolve_firstchild()` / `node_weight()`：候选是带 `title` 且 `action` 为对象的 `satisfied` 子节点；权重为 `min(order ?? 9999, 9999)`，`auth.login` 再加 10000；一个 `firstchild` 候选只有在能继续解析下去时才算数；`firstchild_ineligible` 被排除；同分时保持键顺序。跳过 ACL 检查，因为 `/admin/menu` 已经按会话过滤过了；
- `wildcard` 节点先被下降进入 —— 匹配到 `satisfied` 子节点的段优先于参数捕获 —— 只有剩下的部分才成为请求参数；有参数时跑节点的 `wildcardaction`（即 `path/*` 条目自己的 action），裸路径时跑 `action`。这是 25.12/master 的规则；23.05 和 24.10 则是在第一个 `wildcard` 节点处就开始捕获 —— 见上文「OpenWrt / LuCI」；
- 一个跳数计数器（32）用来打断外来 `menu.d` 里的环；
- **任何一段匹配不到 `satisfied` 子节点，就终止本次尝试。** dispatcher 会退回到最深的已满足祖先并从那里重新解析；路由则返回 `null`，把这次导航交给服务端。这是刻意的：退回只花一次整页加载，而祖先猜错要付的是打开错误页面。

有两条轨道被同时维护，正如整页加载所做的那样：**请求到的** 段 → `L.env.requestpath`、`L.env.pathinfo`、`body[data-page]`；**解析出的** 段 → `L.env.dispatchpath`、`L.env.nodespec`、菜单高亮、标题。一旦选中的子节点和 dispatcher 选的不一样，就会出现「点击打开一个页面、F5 打开另一个页面」—— 这正是解析器必须是移植而非重写的原因。

| 节点 | 是否服务 |
|---|---|
| `view` | 是 —— `view.<path>` |
| `alias`、`firstchild` | 是 —— 递归解析到叶子 |
| 页面本身是 view 外壳的 `template`（状态 → 概览） | 是 —— 外壳只取一次，见下 |
| Lua `template`、`call`、`function`、`cbi`、`rewrite` | 否 → 整页加载 |

`rewrite` 是刻意不解析的。节点和它的 action *确实* 在树里，但要跟进它就得重新实现 `dispatcher.uc` 的 `splice(request_path, 0, action.remove)` 并从结果重新分发；那里差一位就会打开错误的页面，而这比它退回的那次重新加载糟糕得多。

### template 节点：直接用服务端自己的外壳，绝不手工移植

`admin/status/overview` 是一个 `template`，其服务端定义了页面级全局（`progressbar`、`renderBox`、`renderBadge`），输出一个 `<h2>` 和一个 `div.includes`（服务端渲染的 Lua include），然后实例化 `view.status.index`。第一版曾在路由里重新实现这些辅助函数，结果在第一个真实页面上就跑偏了（网络徽章丢了标签：上游的 `renderBadge` 会接收移植版不知道的额外 `L.itemlist` 参数）。所以路由什么都不移植：当指向 template 节点的链接被悬停或聚焦时，它的页面会**每个文档只取一次**（在它解析完成前到达的所有意图事件共享同一个进行中的请求），用 `DOMParser` 解析，并把 `#tabmenu` 与 `<footer>` 之间的内容区保存为该页面的 *外壳* —— 克隆每一个节点，把 `#view` 替换成一个空 div，从内联的 `instantiateView('…')` 脚本里读出类名，其余的内联脚本（那些辅助函数）在暂存时重放进全局作用域。luci-base 自己的引导代码（`luci.js` 和 `L = new LuCI(env)`）也在这个区域里，会被过滤掉。如果当前文档 *就是* 那个 template（会话从「概览」开始），外壳直接取自实时区域，不发生任何 fetch。template 节点只有在它的外壳已知之后才会被拦截 —— 于是一个 Lua template 页面（没有 `instantiateView` 调用）在一次悬停取回后就被记为不可服务，永远不会进入路由的错误路径；而一个没有先悬停就被点击的 template 就是一次普通整页加载，并顺便为本文档后续的使用播下外壳。它的状态 include 模块是携带 `oneshot`/`hide` 状态的单例，整页加载会重置这些状态 —— 这一点是对着真实的整页加载验证的，不是靠推测。

## 导航流程

`intercept({ handler, focusReset: 'manual', scroll: 'after-transition' })`，handler 按顺序：

1. **世代。** `const gen = ++this.gen`；此后每一次 DOM 写入都以它为闸门。
   `event.signal` 能中止我们自己的 await，但它无法取消一个 LuCI XHR（`L.Request` 交回的是一个裸 promise；`XMLHttpRequest` 只在 *已解析的* `Response` 上才浮现，那时中止已经太晚），也无法取消一条已经在跑的 `View.__init__` 链，所以世代才是正确性机制，signal 只是卫生措施。
2. **拆除离场文档的状态**，也就是文档死亡本会免费替你做掉的事：
   - `Poll`：`queue.length = 0; stop(); start()` —— 三个步骤。清空队列丢掉旧 view 的轮询器；`stop()` 丢掉 tick；在空队列上 `start()` 会把 `tick = 0` 重新上膛，这样进入的 view 的 `poll.add()` 会自动启动并立刻触发，而不是等上最多 `interval` 秒去对齐一个存活下来的 tick。上游的 `initDOM()` 在第一个 view 之前对空队列做的也是同样的 `Poll.start()`。
   - `uci`：对出现在 `state.values` **或** `uci.loaded` 中的每个包执行 `unload()`（文档启动时缓存是空的；有四个已发布的应用把 `load()` 的返回值当作存在性检查，当缓存回答 `[]` 时会在页面上盖一个错误提示；而且 `uci.loaded` 会一直保留某个包的请求 promise —— 包括已经 reject 的那个 —— 直到 `unload()`，所以一个失败的加载留在那里会被交给之后的每一个 view）。然后，如果 `L.network` 已被加载，就重新发起 `load(['network','luci'])` —— 当 `L.hasSystemFeature('wifi')` 时再加上 `'wireless'` —— 并且 **await 它**；一旦 reject 就传播到硬加载回退路径，而不是把 `network.js` 留在空配置上：`network.js` 只填充一次它的 `_state`，此后一律从 uci 缓存作答（`getWifiDevices()` *就是* `uci.sections('wireless','wifi-device')`），所以只卸载不重填，会让本文档剩下的时间里每一个消费者都拿到空配置。未保存的本地编辑会随页面消亡，这和整页加载一样；已保存的更改在服务端，「未保存更改」指示器不受影响。
   - 路由启动之后注册的裸 `setInterval` 会被清除（`setInterval`/`clearInterval` 在 `__init__` 里被挂钩，也就是 `L.require('router-aurora')` 实例化该类的时候；`poll.timer` 这个 `L.Poll` 自己持有的唯一 interval 会被跳过）。`setTimeout` 和 rAF **不** 动：核心把工具提示、通知超时和一个请求超时都放在 `setTimeout` 上，而且已发布的 view 里没有任何自我重排的 timeout。
   - view 在**渲染期间**注册的 `window`/`document` 监听器会被移除。有好几个已发布的 view 每次渲染都加（statistics 图表：一个匿名 `resize`，之后会对着已分离的 DOM 抛错；nlbwmon：`tooltip-open`/`touchstart`；核心自己的下拉组件：每个实例一个 `window` click/touchstart），于是它们会越积越多，并作用在早已消失的页面上。钩子只记录渲染窗口内的注册。一次**热**渲染不会执行任何模块，所以它的注册在构造上就是每次渲染一份，会在下次拆除时移除。一次**冷**渲染还会跑模块的顶层，那些注册必须存活下来（移除它们是单向的 —— 编辑器的模块求值期监听器再也回不来了），所以冷注册只被记在类的账上，等到该类之后的某次热渲染注册了相同的 target/type，证明它确实是每次渲染一份时，才会被释放。
   - `ui.hideIndicator('poll-status')` —— luci-base 会留下一个 *正在刷新* / *已暂停* 的指示器，而文档死亡本会把它一并带走。
   - `ui.hideModal()`，以及主题自己的各种界面（大菜单、移动端抽屉、命令面板）关闭。
   - 页面级的补丁 CSS 被禁用，其 JS 补丁被卸载（见下）。

   uci 的清空是这一整步里唯一被 await 而非发射即忘的部分，因此它是 `teardown()` 返回之后的一个独立步骤。
3. **环境。** `L.env.requestpath/dispatchpath/pathinfo/nodespec`、`body[data-page]`、`document.title`。alias 在服务端会被重新分发，所以 `requestpath` 和 `data-page` 承载的是 alias 的目标，而 `pathinfo` 保留请求时的 URL；`firstchild` 则两者都保留请求路径。标题后缀（` - 主机名`）从初始文档里读出，因此它与模板输出的内容一致。`nodespec` 驱动 `L.hasViewPermission()`，进而决定「保存/应用」页脚的只读状态 —— 而它的 `readonly` 是**沿 dispatch 路径折叠**出来的，与 `dispatcher.uc` 的做法一致：`ctx_append` 收集每个节点的 `depends.acl`，对并集做一次 `check_acl_depends()`，只要 *任意* 一个组可写就算可写，所以只有当路径上每一个带 acl 的节点都只读时，页面才是只读的。树里的逐节点标志（`apply_tree_acls`）只覆盖该节点自身的 acl；直接把叶子节点原样递过去，会让一个只读用户在某个只读组下的每个页面上都拿到可用的「保存并应用」。树对象不会被修改（`nodespec` 是一份拷贝）。`data-page` 是 `ui.tabs` 会话状态和主题页面级 CSS 的键。
4. **外壳装饰。** `menu-aurora.js` 暴露了 `syncRoute()`：它依据 `L.env.dispatchpath` 在每一个导航界面上重新标注 `is-active-page`/`aria-current`，展开活动的侧边栏/移动端分组并收起其余的，重建头部面包屑，并为新的分区重新渲染 `#tabmenu`。菜单**不会**重建 —— 大菜单在构造时就完成了测量和绑定，命令面板的索引是同一模型的扁平数组 —— 只有它们的状态在变。
5. **暂存。** 一个全新的 `<div id="view" class="view-staging">` 被插到 `#tabmenu` 之后，也就是**树序上的第一个** —— `getElementById('view')` 返回第一个匹配项，所以 LuCI 的 view 链写入的一切都进了这个暂存元素，而离场的页面仍留在屏幕上（变暗，`.view-leaving`）。这个暂存区不可见但**参与布局**（`visibility:hidden; height:0; overflow:hidden`，绝不用 `display:none`）：实时图表在 `render()` 内部按 `#view.offsetWidth` 给自己定尺寸，而 `display:none` 的暂存区会递给它们一个宽度为 0 的画布。此时还什么都没被移除。
6. **补丁。** `header.ut` 把已安装的按需补丁词干输出为 `body[data-patches]`；路由施加与模板在渲染时相同的段前缀规则：匹配的 `patches/<stem>.css` 链接被确保存在（`<link data-aurora-patch>`，对屏幕上的页面启用，对其余页面 `disabled` —— 而不是移除，所以回来时不花任何代价）；匹配的 `patches/<stem>.js` 文件只加载一次，其 `window.aurora.patches[stem]` 的 `{ mount, unmount }` 对按访问驱动（要挂载的词干列表属于计算出它的那次导航，所以一次被取代的导航之后不会挂载任何东西）；路由添加的 URL 带着与模板自身链接相同的 `?v=PKG_VERSION` luci.mk 戳记，从 `body[data-asset-version]` 读出，因此它们命中同一个缓存条目 —— 一个什么都不注册的 JS 补丁就只是被执行一次，和 MPA 一样。补丁脚本在求值时自行挂载；如果用户在它到达之前已经导航走了，它的 `load` 处理器会检查当前页面是否仍然需要那个词干，否则就卸载它（期间到达的同词干页面会让它保持挂载）。
   menu.d 节点自身的 `css`（`header.ut` 为被分发的节点链接 `<resource>/<node.css>`，标记为 `data-aurora-node-css`）用同样的方式维护：每张样式表一个 `<link>`，对解析出的叶子声明了它的那个页面启用，对其余每个页面 `disabled`，永不移除。这两个属性都豁免于投毒闸门。
7. **视图。**
   - **冷**（本文档中从未 require 过 `view.<path>`）：`window.L.require(className)` —— 这个 require *就是* 渲染（LuCI 在首次 require 时实例化），而且它必须走 `window.L` 这个运行时实例，绝不能走模块工厂拿到的那个原型式 `L`（`ui` 把 `itemlist`/`showModal` 挂在 `window.L` 上；通过错误的 `L` require 进来的 view 会在三层模块之后死在 `L.itemlist is not a function`，而且由于 `require()` 按名字缓存，绑定会被 *第一个* 请求者固定下来）；
   - **热**：`require()` 交回那个 `__init__` 已经跑过的缓存实例；LuCI 的类系统设置了 `prototype.constructor`，所以 `new instance.constructor()` 会跑一次全新的 `__init__` → `load()` → `render()` → `dom.content('#view')`，与整页加载的起点完全一致。两种情况下，require 到的值都会用 `instanceof L.view` 检查；不是的话就抛进硬加载路径，而不是把一个非 view 暂存起来。
   - **完成是被观测的，不是被假定的**：暂存元素上的一个 `MutationObserver` 会在非 spinner 子节点落地时（或空渲染时 spinner 被移除时）解析。15 秒内没有完成算 **失败**，不算完成：提交 spinner 并释放序列化，会让仍在运行的链绘制到后来某次导航的 `#view` 里，所以超时会 reject，catch 路径硬加载目标地址。完成时 —— 并且仅当这次导航仍是最新的一次 —— 离场区域（`#tabmenu` 与 `<footer>` 之间除暂存元素外的一切）被移除，暂存的 view 在 `document.startViewTransition()` 可用且未开启减弱动效时于其内部显现；该次导航的 `finished` promise 在这次替换之后 resolve。每个离场元素在 `remove()` 之前都要走一遍 `L.dom.content(el, null)`：正是它清掉了元素的 `data-idref` 注册表条目，否则那些条目会把已分离的子树及其类实例一直吊着不放 —— 这正是下文浸泡测试所测量的东西。
   - **渲染是被串行化的。** 进行中的 LuCI XHR 和正在跑的 `View.__init__` 链都无法取消（原因同上），而每条链都会绘制到绘制时刻*恰好排第一*的那个 `#view` 里。所以一次导航会先等待上一次导航的完成（受同一个超时约束），然后才拆除任何东西或暂存任何东西 —— 上一条链会完成到它自己的暂存元素里，随后被丢弃。因此快速的 A→B→C 绝不会交错：当 C 在 B 还没开跑时就到达，B 会被跳过（`event.signal` / 世代），而 C 会等待真正在飞的那次渲染。文档最初那次由 LuCI 渲染的 view 也按同样方式追踪，所以首次加载期间的一次点击不会被它覆盖绘制 —— 而一次永不完成的首次渲染会让那个等待 reject，于是第一次导航走硬加载回退，而不是在一条可能仍会绘制的链旁边做暂存。那次首渲染同样运行在一个渲染窗口内（该窗口在路由自己的监听器注册之后打开），所以它添加的监听器像冷渲染一样被记在其类的账上；而它在路由加载之前注册的那些则够不着。代价是慢加载期间的点击要等那次加载完成；替代方案 —— 逐类包裹 `prototype.render` 并通过重新导航来修复过期的冷渲染 —— 会留下一个真实的窗口，而且需要三套机制去做一套就够的事。
8. **焦点与播报。** 用 `preventScroll` 聚焦 `#maincontent`（`tabindex=-1`）；新的 `document.title` 被写入 `#aurora-nav-status`（`role=status`、`aria-live=polite`），因为同文档替换不会触发屏幕阅读器会播报的 load 事件。这个地标带着 `outline-none`：iOS WebKit（Safari 和 iOS 版 Chrome 都一样）会为编程式聚焦绘制焦点环，而这个环紧贴吸顶头部下方的上边缘被用户报告为「一个永远走不完的进度条」—— 它从来就不是进度条。
9. **进度。** 存活超过 150 ms 的导航会插入 `#aurora-nav-progress` —— 形态上就是 Turbo Drive 那根条：顶部一条发丝细线，`width` 以内联方式驱动，并以越来越小的步长**涓流**推进（每 300 ms `+ (100 - w) / 30`）直到提交，这样慢渲染看起来一直在动而不是卡住；提交时填到 100 %，淡出（`data-state="done"`）并从 DOM 中**移除**。更短的导航保持沉默，重叠的导航共用同一根条。浏览器自带的进度条在这里帮不上忙：它只在文档加载时显示，而同文档替换恰恰不是文档加载 —— 这也正是 GitHub、YouTube、Turbo/HEY 和每一个 nprogress 用户都要自己画一根的原因。减弱动效只去掉过渡，不去掉这根条。
10. 任何异常 → `console.error`（静默回退会让每一次路由回归都看起来像「页面就是有点慢」）→ `location.href = destination` —— 一次硬性的整页加载，绝不留下卡住的页面。会先设置一个 `bypass` 标志，这样那次写入产生的 `navigate` 事件会直接放行，而不是被拦回失败路径；随后 handler 会停在一个永不落定的 promise 上，这样就不会再有别的东西对着一个正在离开的文档运行。

## 过期闸门

luci-base 用 `notifySessionExpiry()` 应对失效会话：`Poll.stop()` 加上一个唯一按钮是硬重载的弹窗。同文档替换会径直 `hideModal()` 和 `Poll.start()` 穿过它继续浏览，然后每个页面依次报错（实测：`bench-router.mjs expiry` 对着上一版路由 —— `expiredFullLoad: false`）。所以路由会监听 luci-base 依据的同样两个信号 —— 任一 `L.Request` 上带 `X-LuCI-Login-Required: yes` 的 `403`，以及 luci-base 在 `-32002` 之后发起的 `session.access` 探测被拒绝或出错 —— 此后什么都不再拦截：下一次点击是整页加载，dispatcher 会把它变成登录页。其他对象上的一次拒绝属于 ACL 事务，会被忽略。什么都不重置：这个标志随文档一起消亡，就像会话那样。同一个标志也让下文的可见性闸门不会去重启一个被过期停掉的轮询。

## 隐藏的标签页

luci-base 在后台标签页里会继续轮询。路由在 `visibilitychange` → hidden 且轮询原本处于活动状态时停掉 `Poll`，并在回来时重新启动 —— 除非用户自己暂停过，或期间会话已失效。在一台性能孱弱的路由器上，那是没人在看的 RPC 开销。

## 投毒闸门

view 写进 `<head>` 的 `<style>`/`<link rel=stylesheet>` 会在整页加载时随文档消亡，却会在同文档替换中**存活**，然后污染其后的每一个页面（某个已发布的文件管理器用一条未分层的 `!important` 规则在每个配置页上隐藏了保存/重置）。移除它并不是一个选项：在模块求值时导入 CSS 的库永远不会再执行一次，所以删除是单向的（某个编辑器页面回来时变成了一个两百万像素高的黑矩形）。因此这里用的是闸门，不是清扫：在拦截之前，`#view` 之外任何一张不属于主题自己的样式表都会把文档标记为**已投毒**，这次导航就是整页加载 —— 新文档不带任何 view CSS，所以路由会立刻恢复工作。「自己的」意思是*被标记过的*：header.ut 会给它渲染的一切打戳（`main.css`、字体、自定义与 token `<style>` 上的 `data-aurora-shell`；补丁上的 `data-aurora-patch`；menu.d 节点 css 上的 `data-aurora-node-css`）。闸门用来比对的启动快照按这些标记过滤，所以启动页自己的模块在路由加载之前插入的样式表仍然算作外来，而不会被「祖父条款」放行到文档余下的时间里。正确性优先于速度，绝不反过来。

一个基于「归属」的精细化方案（从调用栈上把插入模块的身份戳到每张样式表上，对依赖闭包中包含该模块的页面启用它，对其余页面 `disabled`）曾被实现、在设备上验证过，然后又被**移除**了：在这台设备上只有一个 view 页面插入自己的 CSS，省下的不过是离开它时的一次重载，而代价是三处 monkeypatch 加一段内联模板脚本，它的故障模式 —— 某个页面悄无声息地少了一个共享库的 CSS —— 比它避免掉的那次重载更糟。只有当出现一批真实的自带样式的 view 页面时才值得重新考虑。

## 悬停时的模块预热

进入（`pointerover`/`focusin`/`pointerdown`）一个指向可服务节点的链接时，会用 `priority: 'low'` `fetch()` 它的 view 模块 —— 不是 `require()`，因为那会把它渲染出来。URL 是逐字节按 `LuCI.require()` 的构造方式拼出来的（`<base_url>/<把 . 换成 / 的 name>.js?v=<resource_version>`），否则就会错过 HTTP 缓存。这个遍历是传递性的：取回内容的**前 4 KB** 会被扫描，找出开头连续的那串 `'require x'` 字符串字面量，用的正则**不是**行锚定的（已发布的文件被压缩到了一行上），带点的名字会以同样方式预热；不带点的名字要么是 luci-base 那些没有对应文件的内建（`view`、`baseclass`、`dom`、`poll`、`request`、`session`），要么是外壳早已加载的扁平库，因此直接拒绝。按类名去重；一旦有一次导航到该链接完成提交就停止。这只在冷导航上体现出来；热导航本来就是 0 字节的缓存命中。

## 刻意不做的事

- **不做 History API 路径。** 见「内核」。
- **路由激活期间不做文档预取。** 路由接管时，`speculationrules` 脚本会在启动时被移除 —— 对一个路由永远不会去加载的文档做悬停预取，纯属浪费路由器 CPU。没有 Navigation API 的浏览器保留这些规则和 MPA 路径。
- **永不使用 `unload`/`beforeunload`**（bfcache）。
- **不取消进行中的 XHR** —— 根本没有可用来取消的句柄（见第 1 步）；世代闸门让这件事成为浪费，而不是缺陷。这只能由上游解决。
- **不清扫 view 的全局监听器或 timeout** —— 那是对模块求值期注册的单向删除。如果哪天真出现了一个每次渲染都注册的冒犯者，答案是有针对性的拆除，而不是一个全局钩子。
- **`ui.changes.confirm/revert` 和 `awaitReconnect`** 保留它们硬性的 `window.location` 写入 —— 回滚/重启这样的边界*就应该*是一个全新的文档。

## 验证矩阵

- 单元测试（`.dev/tests/router.test.js`）：解析器对着一棵固定装置树（alias 链、嵌套 firstchild、权重、ineligible、unsatisfied、通配符参数、环）；URL → 段；补丁前缀匹配；对压缩过的 head 做 pragma 扫描；只读折叠；过期信号；同 URL 重载规则；解析出的叶子的 node css；契约检查。
- 设备测试（`.claude/skills/aurora-performance/scripts/bench-router.mjs`，CDP）：
  1. 在每种导航模式下完整走一遍每个可点击节点，每一个都与同 URL 的真实整页加载对比 —— `data-page`、`dispatchpath`、URL、标题、标签数、footer 是否存在、控制台是否干净；
  2. 点击 → 视图绘制，N 次中位数，路由 vs 整页加载，冷热皆测；
  3. 浸泡测试：12 个页面上做 60 次导航，第一轮之后堆内存 / DOM 节点 / 监听器 / 轮询队列长度保持平稳；
  4. 穿过 alias 和 firstchild URL 的前进/后退链 —— 不发生重载；
  5. 投毒闸门：`<head>` 里一个外来 `<style>` 使下一次导航变成整页加载，再下一次又恢复为同文档替换；
  5b. 样式表：同上，但作用在遍历时发现的、真正会插入自己样式表的每一个 view 页面上（而不是注入一个假的）—— 分别以同文档方式到达和直接落地（它的模块在路由启动之前就插入了），离开时无论哪种方式都是整页加载；
  5c. 卫生检查：替换之后 DOM 里没有残留的进度条，live region 存在且携带标题，隐藏标签页停止轮询、可见时恢复；
  6. nodecss：一个 menu.d 节点声明了 `css` 的页面 —— 到达时链接启用，离开后禁用，返回时重新启用且不产生重复（没有已安装节点声明 css 时跳过）；
  7. 过期（放在最后，会毁掉会话）：从文档内部 fetch 登出，一个失败的 RPC → luci-base 的弹窗和 `Poll.stop()`；下一次导航是落在登录表单上的整页加载。
  该遍历还会把 `nodespec.readonly`、`L.hasViewPermission()`、启用的 node-css 链接集合以及 live region 文本与整页加载对比，并报告哪些页面带有不属于主题的样式表。
- 设备测试（`bench-fullload.mjs`，CDP）：一次整页加载的时间都花在哪 —— dispatch #1、阻塞解析的语言包、DOMContentLoaded、view 自己的 ubus 窗口 —— 以及同一页面走路由的情况，两者在同一个循环里，因此可以相减。
- 设备测试（`bench-dispatch.sh`，在路由器上运行）：在任何页面相关工作之前，一次 CGI dispatch 的成本 —— 进程、模块图、菜单树、会话探测 —— 外加一次导航会拉取的每个响应的回环成本与大小。`en` 语言包那一行是把 dispatch 成本和负载成本区分开的对照组。
- 性能 skill（`.claude/skills/aurora-performance/`）在 `references/measuring.md` 中记录了全部三套测量工具；本路由所消除的服务端成本，就是 `references/server.md` 里的 S1/S2 预算。
