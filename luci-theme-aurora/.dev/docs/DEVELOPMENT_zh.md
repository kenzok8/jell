<h4 align="right"><a href="DEVELOPMENT.md">English</a> | <strong>简体中文</strong></h4>

# 开发指南

本指南覆盖 Aurora 主题从环境搭建到构建生产包的完整开发流程。

## 前置条件

- **[Node.js 20.19+ / 22.12+](https://nodejs.org/en/download)** —— JavaScript 运行时（与 Vite 7 的支持范围一致 —— 21.x 这类奇数版本不符合要求；在 `pnpm install` 时通过 `engines` + `engine-strict` 强制执行，因此不受支持的 Node 会立刻失败并给出清晰提示）
- **pnpm** —— 包管理器（通过 [Corepack](https://github.com/nodejs/corepack) 管理版本）
- **Tailwind CSS 知识** —— 写样式必备。参见 [Tailwind CSS 文档](https://tailwindcss.com/docs)
- **网络连通** —— 开发机必须与你的 OpenWrt 路由器处在同一网络

## 环境搭建

### 1. 克隆与安装

```bash
# 克隆仓库
git clone git@github.com:eamonxg/luci-theme-aurora.git
cd luci-theme-aurora/.dev/

# 启用 Corepack 来管理 pnpm 版本
corepack enable && corepack prepare

# 安装依赖
pnpm install
```

### 2. 配置环境

```bash
# 一站式向导：询问每一个 .env 值（路由器 IP、开发服务器 host/port，
# 以当前 .env 条目为默认值），生成/安装 SSH 密钥（只提示一次路由器密码），
# 端到端验证模板同步，然后写入 .env
pnpm setup:router

# 非交互式：直接传入 IP（不再提问；开发服务器相关的值保持
# 已保存的 .env 条目或默认值）
pnpm setup:router 192.168.2.1
```

> 脚本名叫 `setup:router` 而不是 `setup`，因为 `pnpm setup` 会解析到 pnpm 自带的内置 setup 命令，永远不会执行包脚本。

**它做了什么**（`scripts/setup.js`），按顺序：

1. **收集 `.env` 的值。** 不带参数时会逐个变量提问，并把当前 `.env` 条目作为默认值展示（回车留空即保持原值）。带 IP 参数时则非交互地把它当作 `VITE_OPENWRT_HOST`，开发服务器相关的值原样不动。此时还什么都没写 —— 只有下面每一步都成功后，`.env` 才会被更新。
2. **预检连接。** 对 `<host>:22` 做一次超时 2 秒的原始 TCP 探测，这样不可达的设备、或关闭了 SSH 的设备会立刻带着清晰提示失败，而不是卡在 ssh 里面。
3. **找到或生成 SSH 密钥。** 它按顺序查找 `~/.ssh/id_ed25519.pub`、`id_rsa.pub`、`id_ecdsa.pub`，复用第一个存在的 —— 已有密钥绝不会被覆盖。**如果你完全没有密钥，它会生成一个**（`ssh-keygen -t ed25519 -N "" -f ~/.ssh/id_ed25519`）。空口令是刻意的：`.ut` 同步必须在整个 `pnpm dev` 会话期间无人值守地运行。
4. **把公钥装到路由器上。** 它先测试免密 SSH 是否已经可用（`ssh -o BatchMode=yes … echo ok`），可用就跳过安装 —— 而在一次抹掉密钥的完整刷机之后，该测试会失败，安装便会重新执行。否则它会在一次交互式 SSH 会话中把密钥追加到 `/etc/dropbear/authorized_keys`；追加由 `grep -qxF` 守卫，所以重复运行不会产生重复条目。**这是唯一一个会询问路由器 root 密码的步骤，而且只问一次。** 之后它会重新测试免密认证，并对任何失败进行归类（密码错误 / 主机不可达 / 其他）。如果设备跑的是 openssh 而不是 dropbear，密钥应该放在 `/root/.ssh/authorized_keys` —— 手动装到那里，本步骤会检测到并跳过。
5. **端到端验证同步。** 它不满足于 `echo ok`，而是用 `ut-sync` 插件所使用的完全相同的 `tar -cf - | ssh … tar -xf -` 管道把 `ucode/template/themes/aurora/` 推上去（见 [模板（`.ut`）实时同步](#模板ut实时同步)）。这一步通过了，`pnpm dev` 的模板同步也就通过了。
6. **写入 `.env`。** 受管理的键在原位重写，周围的注释因此保持意义；缺失的键追加到末尾；其他任何行原样透传。

> 第 4 步的密码提示来自**本地**的 ssh 客户端，它直接从 `/dev/tty` 读取而不是 stdin —— 所以即便脚本为了归类错误而管道化了 ssh 的 stderr，提示仍会正常显示。但这也意味着该步骤需要**开发机上**有一个控制终端（路由器一侧不受影响）：请在普通 shell 里运行，而不要在 CI、`nohup` 或编辑器任务面板里运行，那些环境下 ssh 无从提问，运行会在认证处失败。不确定就用 `tty` 检查；在这类环境下，请改为手动安装密钥。

如果路由器就在默认的 `192.168.1.1` 上、且免密 SSH 已经可用，那么完全不需要 `.env` —— 下面每一个值都有可用的默认值。

**环境变量**（全部可选）：

- `VITE_OPENWRT_HOST` —— 路由器裸地址，例如 `192.168.1.1`（默认值；也接受 `host:port` 和完整 URL 形式）。Web 代理目标和 `.ut` 同步的 SSH 目标（`root@<hostname>`）都由它推导。更花哨的需求（专用密钥、跳板机、非标准 ssh 端口）应写进 `~/.ssh/config` 的 `Host` 块，ssh 会自动读取。
- `VITE_DEV_HOST` —— 开发服务器 host（代码默认值 `127.0.0.1`，`.env.example` 里设为 `0.0.0.0` 以便局域网访问）
- `VITE_DEV_PORT` —— 开发服务器端口（默认 `5173`）

## 开发流程

### 启动开发服务器

```bash
cd luci-theme-aurora/.dev/
pnpm dev
```

开发服务器会在 `http://127.0.0.1:5173` 启动，并把请求代理到你的 OpenWrt 设备。

**Vite 代理的工作方式：**

Vite 开发服务器用中间件重写本地请求，使 CSS/JS 资源由你的开发环境提供，而不是由路由器提供。这样就能在不部署到路由器的前提下实时编辑。具体实现见 `vite.config.ts`。

**代理的关键行为：**

1. 把 `/cgi-bin` 和 `/luci-static` 请求代理到 OpenWrt 设备
2. 用中间件（`createLocalServePlugin`）重写 CSS 和 JS 文件的请求路径
3. 对 `/luci-static/aurora/main.css` 和 `/luci-static/aurora/login.css` 的 CSS 请求分别被重写为由 `.dev/src/media/main.css` 和 `.dev/src/media/login.css` 提供
4. JS 文件请求直接由 `.dev/src/resource/` 提供，中间件读取文件内容并返回
5. 向被代理的 HTML 响应注入 Vite HMR 客户端以支持实时重载
6. 把 `/` 重定向到 `/cgi-bin/luci` 以正确路由

### 代码风格与格式化

本项目使用 **Prettier** 进行代码格式化，并开启保存时自动格式化。

**Prettier 配置：**

- 位于 `.prettierrc`
- `.vscode/settings.json` 中的 VS Code 设置为 CSS 和 JS 文件启用保存时格式化
- 使用 `prettier-plugin-tailwindcss` 排序 Tailwind CSS 类名

### CSS 嵌套支持

得益于 **lightningcss**，你可以在样式表中自由使用 [CSS 嵌套语法](https://drafts.csswg.org/css-nesting/)。构建过程会自动把嵌套 CSS 编译成扁平的、浏览器兼容的形式。

它会被编译成在所有浏览器中都能工作的标准 CSS。

### CSS 架构

主题有两个彼此独立的 Tailwind CSS v4 入口，均来自 `.dev/src/media/`：

- **`main.css`** —— LuCI 管理界面。它是一份 import 清单，禁用了 Tailwind 的自动源码扫描（`source(none)`），并按顺序引入 `@eamonxg/luci-theme-tokens/dist/aurora/tokens.css`（OKLCH 主题 token，经 `@theme inline` 映射）、共享的 `_icons.css`、`_base.css`、`_elements.css`、`_layout.css`、`components/` 下的每一个文件（每个 UI 组件一个片段 —— 按钮、卡片、弹窗、表格等等），以及 `_utilities.css`。
- **`login.css`** —— 独立的登录页（`sysauth.ut`）。自包含：用 `source(none)` 引入 Tailwind 的 theme/utilities，不用完整 Preflight 而改用一份极小的本地 reset，并直接引入 `@eamonxg/luci-theme-tokens/dist/aurora/tokens.css`。构建时 `login-css-prune` 插件（`vite.config.ts`）会剥掉该页 var() 链条永远够不到的每一个自定义属性，于是管理端尺寸的 token 表以登录页的尺寸发布。

第三方兼容补丁**不会**被打进 `main.css` —— 它们被拆成 `media/patches/` 下的按页文件并按需加载（见下文 [按需第三方补丁](#按需第三方补丁)）。

**新增样式：**

- 新的 UI 组件 → 创建 `components/_<name>.css` 并在 `main.css` 中加一行 `@import`。每个文件都是自己的组织单元 —— 不要加 `@layer` 包裹：主题片段保持不分层，因此无论特异性如何都压过 Tailwind 分层的 base/utilities。
- 针对第三方 LuCI 应用/页面的兼容修复 → 在 `media/patches/` 下新建一个文件（见下文）。

所有规则都用 `@apply` 配合 Tailwind 工具类和 CSS 嵌套 —— 不写裸 CSS 属性。唯一刻意的例外是 `media/patches/*.css`，它按设计就是原生 CSS（见下文）。

### 按需第三方补丁

> 页面级 JS 补丁必须暴露 `window.luciPatches[stem] = { mount, unmount }`（并在求值时自行挂载一次），这样客户端路由才能在同文档导航之间驱动它们 —— 见 `router_zh.md`。

有些第三方 LuCI 应用发布的标记结构无法适配主题，需要一处狭窄的兼容覆盖。与其把每一个这样的补丁都打进 `main.css`（那会把它们发到**每一个**页面），不如让每个补丁成为一个独立 CSS 文件，**只在它所针对的页面上加载**。

**工作方式：**

1. **一页一文件，以 `data-page` 命名。** 每个补丁位于 `media/patches/<page>.css`，其中 `<page>` 是目标页面 `<body data-page="…">` 的值 —— 也就是请求路径各段用 `-` 连接的结果（例如 `admin-services-openclash-config`）。`header.ut` 在渲染时从 `ctx.request_path` 计算出同样的字符串，`request_path` 为空时回退到 `ctx.path`（`join('-', length(ctx.request_path) ? ctx.request_path : ctx.path)`），这样不带显式路径抵达的默认落地页也能解析出自己的补丁。
2. **构建是拆分，不是打包。** `vite.config.ts` 把每个 `media/patches/*.css` 都加为独立的 Rollup 入口，因此各自编译成 `htdocs/luci-static/aurora/patches/<page>.css`。它们不再是 `main.css` 的一部分。
3. **原生 CSS，不用 `@apply`。** 补丁是唯一写原生声明而非 Tailwind 工具类的地方。每个补丁都是独立构建入口，而旧的 `@reference "../main.css";` + `@apply` 方案会让每个文件各自携带一份 `@property`/辅助样板。把*同样的规则*改写成原生 —— 基于 v1.1.7 → v1.1.8 的转换实测，构建产物，选择器和取值完全相同：

   | 补丁 | `@reference` + `@apply` | 原生 CSS | 节省 |
   | --- | ---: | ---: | ---: |
   | admin-dashboard | 6,940 B | 2,639 B | −62% |
   | admin-modem-modemdata-modempreview | 162 B | 96 B | −41% |
   | admin-modem-qmodem | 9,483 B | 4,497 B | −53% |
   | admin-network-network | 160 B | 86 B | −46% |
   | admin-services-openclash-config | 187 B | 87 B | −53% |
   | admin-services-openclash-settings | 638 B | 509 B | −20% |
   | admin-statistics-graphs | 1,609 B | 110 B | −93% |
   | admin-system-filemanager | 576 B | 184 B | −68% |
   | **合计** | **19,755 B** | **8,208 B** | **−58%** |

   这份开销是按入口计的、且大体固定（`@property` 注册、`--tw-*` 辅助链），所以补丁越小、比例越难看 —— 只有两条规则的 statistics 补丁付出了自身重量 15 倍的代价。uhttpd 按原样字节提供服务（不做 gzip），所以原始体积就是传输体积。注意运行时的 `:root` 暴露的是原始颜色 token 加上 `--radius-base` 和 `--app-shadow-*` —— `--radius-3xl` 这类名字只存在于 Tailwind 构建内部，所以补丁要写 `calc(var(--radius-base) * 3)` 来取圆角，绝不要写 `var(--radius-3xl)`。对主题仓库自己的补丁而言，旧的 Tailwind 模式仍然*受支持* —— 以 `@reference "../main.css";` 开头并使用 `@apply` 的文件照样能编译 —— 而且它有几个值得与上表权衡的实在好处：**构建期校验**（写错的工具类或颜色名会让构建失败，而写错的 `var()` 只会在运行时静默失效 —— `--radius-3xl` 那次回归正是这样溜进原生改写版的）、与组件片段**同一套词汇**以及 `dark:`/`md:`/`hover:` 变体简写，还有主题重新映射某个工具类时的**自动跟随**（圆角链或阴影 token 的改动会免费重新编译进 Tailwind 补丁；原生补丁则需要手动改）。原生是为了上面那组体积数字而定的默认约定，不是硬性门槛。由应用自带的补丁（直接装进设备的 `patches/` 目录）从来就没有选择余地：它们完全绕过构建，`@apply` 到浏览器就是一段无效文本 —— 一如既往，只能写原生 CSS。这也意味着第三方补丁作者不需要懂 Tailwind。请通过 `:root` 自定义属性取用主题值（`var(--surface-sunken)`、`var(--hairline)`、`var(--radius-3xl)`、`var(--shadow-lg)` 等），不要硬编码颜色或圆角；深色变体是一个普通选择器（`[data-darkmode="true"] & { … }`），断点是普通媒体查询（`@media (width < 48rem)`），CSS 嵌套依旧可用 —— 构建（lightningcss）会为受支持的浏览器压缩并降级它。
4. **`header.ut` 在渲染时发现补丁。** 每次（非登录页）渲染时，`header.ut` 用 ucode 的 `fs.lsdir()` 列出 `/www/luci-static/aurora/patches/`（读取十来个条目的 readdir —— 微秒级，被模板已有的 `ubus` 调用完全盖过），并把已安装的 `*.css` 文件名与请求的**累积路径段前缀**匹配：一个补丁匹配它的精确页面和任意子页面，但只在真正的段边界上 —— `admin-services-wol.css` 覆盖 `admin/services/wol/plus`，却绝不会覆盖某个自身段只是恰好以同样字符开头的兄弟应用（`admin/services/wol-plus`）。每个匹配到的补丁都会紧跟在 `main.css` 之后链接，按字典序排列 —— 于是通用补丁先加载、更具体的后加载，具体的那个在层叠中压在上面。没有匹配的页面什么都不会拿到 —— 没有额外请求，也没有 404。如果目录缺失或不可读，列表为空，页面就以未打补丁的状态渲染。
5. **补丁目录是一个即插即用的扩展点。** 由于发现发生在渲染时，补丁不必随主题发布：**任何包都可以把一个 `<page-prefix>.css` 装进 `/www/luci-static/aurora/patches/`**，主题就会在匹配的页面上加载它。安装/卸载的生命周期是自动的 —— 文件随包出现和消失，无需注册，也无需重建白名单。（以这种方式发布的补丁按原样作为纯 CSS 提供；主题自己的补丁也是同样写法，只是额外过一遍构建做压缩。）
6. **动态生成的页面由它们的固定前缀覆盖。** 有些应用为每个实体铸造一个页面 —— 例如 QModem 的短信会话渲染为 `admin-modem-qmodem-sms-conversation-<contact>`。把补丁按固定前缀命名（`admin-modem-qmodem-sms-conversation.css`），前缀匹配就会为每个会话页面加载它，与联系人名字无关。不需要通配符语法（文件名里的 `*` 也不受支持）。

**添加一个补丁：**

1. 在浏览器里打开目标页面并读取 `document.body.dataset.page` —— 那个精确字符串就是你的文件名（对于一族动态的按实体页面，改用它们的固定前缀 —— 见上文第 5 点）。
2. 创建 `media/patches/<那个字符串>.css`：
   ```css
   /* PATCH: <page> (luci-app-foo) */

   [data-page="<page>"] {
     /* 狭窄的、限定在选择器内的覆盖 —— 原生 CSS + CSS 嵌套，
        主题值通过 var(--surface)、var(--hairline)、… 取用 */
   }
   ```
3. 运行 `pnpm build`。没有白名单需要重新生成 —— 加载器会在渲染时发现 `patches/` 下安装了哪些 `.css` 文件。
4. 确认 `htdocs/luci-static/aurora/patches/<page>.css` 很小（只有你写的规则）。

> 移除补丁是对称的：删掉文件并重新构建 —— 加载器不再链接它，因为它不存在了。

**随第三方应用一起发布补丁**（无需主题发版）：构建或手写一个以你页面 `data-page` 前缀命名的纯 CSS 文件，并在你的包 Makefile 中安装它：

```makefile
define Package/luci-app-foo/install
	...
	$(INSTALL_DIR) $(1)/www/luci-static/aurora/patches
	$(INSTALL_DATA) ./htdocs/aurora-patch.css \
		$(1)/www/luci-static/aurora/patches/admin-services-foo.css
endef
```

只要两个包都安装了，主题就会在 `admin-services-foo` 及其所有子页面上自动加载它。注意应用自带的补丁绕过了主题的 Tailwind 构建 —— 请写纯 CSS（你仍然可以引用主题的 CSS 自定义属性，例如 `var(--surface)`），并把每条规则都限定在你自己的 `[data-page^="…"]` 选择器之下。

**命名。** 文件名就是页面的 `data-page` 字符串；因为按前缀匹配，更宽的目标也自然生效：

| 你想打补丁的对象… | 要创建的文件 | 它会在哪些页面加载 |
| --- | --- | --- |
| 某个具体页面，`admin/services/foo/general` | `admin-services-foo-general.css` | 该页面（及其下任意子页面） |
| 整个应用，`admin/services/foo/…` 下所有页面 | `admin-services-foo.css` | `foo`、`foo/general`、`foo/rules`、… |
| 动态的按实体页面，例如 QModem 短信 `…/sms/conversation/<contact>` | `admin-modem-qmodem-sms-conversation.css`（固定前缀 —— 无需通配符） | 每一个会话页面，不论联系人是谁 |

由前缀匹配自然引出两条经验法则：

- **补丁默认作用于它的页面和所有子页面。** `admin-services-foo.css` 会在 `admin/services/foo/…` 下的每个页面加载。需要更精确的目标时，有两种收窄方式：在文件内部限定单条规则的作用域（`[data-page="admin-services-foo-general"] { … }` 只影响那一个页面），或者为页面专属规则再发布一个名字更长的文件（`admin-services-foo-rules.css`）—— 在两者都匹配的页面上，**两个都会加载**，名字短的在前，因此更具体的那个赢得层叠。
- **匹配遵守路径段边界**，所以前缀绝不会泄漏到长得像的兄弟上：`admin-services-wol.css` 覆盖 `admin/services/wol/plus`，但不覆盖位于 `admin/services/wol-plus` 的另一个应用。唯一无法避免的冲突是两条路径拼接出同一个 `data-page` 字符串（`wol/plus` vs `wol-plus`）—— 这样的补丁会在两个页面上都加载。如果这有影响，就把规则挂到你自己应用的类名/id 上，这样意外加载也匹配不到任何东西。

> 与 `_` 前缀的片段（那些是只供 `@import` 的碎片）不同，补丁文件名没有 `_` 前缀 —— 每一个都是会发布到 `htdocs/` 的真实构建入口。这一点在 `media/patches/` 内部同样成立：那里以 `_` 开头的文件是供其他补丁 `@import` 的共享片段，会被入口扫描跳过，永不发布。

**JS 负载。** 这套机制并不限于 CSS：同一次 `lsdir()` 扫描也会收集 `patches/<page>.js` 文件，作为 `<script defer src>` 输出在补丁样式表链接之后 —— 同样的按页前缀匹配，同样对第三方包即插即用的生命周期（发布一个纯脚本；它不能假设解析时就能通过 `L.require` 加载 LuCI 模块 —— 请在 DOM ready 之后运行，或轮询你的目标元素）。主题自有的 JS 补丁放在 `src/resource/patches/<page>.js`，和其他资源 JS 一样经过 Terser 处理，但落到 `aurora/patches/` 下，这样一次目录列举就能同时服务两种负载类型。第一个使用者：`admin-status-logs` 上的日志查看器增强（把只读的 `#syslog` textarea 解析成带颜色、按列对齐的视图，并带一道解析成功闸门 —— 遇到未知日志格式时回退到原生 textarea；这一个前缀覆盖了系统日志标签页、内核日志标签页以及每个受支持版本上的裸 `/logs` alias）。它的 CSS 刻意**不是**补丁：日志页面是原生 LuCI，所以它们的样式放在 `main.css` 内的 `components/_syslog.css` 里，那里完整的 Tailwind token 流水线（响应式圆角、阴影、配置应用的覆盖）都适用 —— patches/ 保持只服务于第三方兼容。

**别名 —— 一份负载，多个页面。** 当两个不相关的页面名需要同一份负载时，按它们的共同前缀命名会过度匹配（一个 `admin-status` 补丁会加载到*每一个* status 子页面上，包括最繁忙的概览页）。为此，`vite.config.ts` 里的 `PATCH_ALIASES` 会把构建产物（CSS 和 JS）复制成每个别名的名字，开发服务器则把别名请求解析回共享的源文件。用重复的 CSS *入口* 作为替代方案行不通：Rollup 会把内容相同的资源去重成一个文件，于是两个名字里的一个会悄无声息地永不发布。（这张映射表目前是空的 —— 日志查看器最后只需要 `admin-status-logs`，因为每个受支持版本都把两个日志页挂在 `admin/status/logs/*` 之下。）

### Mock 页面

给第三方应用的页面做样式 —— 编写或调整它的 `patches/*.css`，或拿它来检验 `main.css`/组件的改动 —— **无需安装那个应用（甚至无需设备）**。把页面渲染后的 HTML 保存一次，之后就能在主题实时热重载的情况下对着它开发。

- **快照放在哪：** `.dev/mocks/*.html`（被 git 忽略 —— 快照体积大、与设备/分支强相关、还会过期，所以只留在本地）。全新克隆里这个目录不必存在；首次捕获时会自动创建。
- **Mock 工具条：** 这个开发服务器交出的每一个 HTML 页面 —— 无论是代理的设备页面还是提供的快照 —— 都会带上 `scripts/mock-bar.client.js`（在 `/mocks/__bar.js` 提供），它是左下角的一个浮动工具条。它活在 Shadow DOM 里，因此主题和补丁 CSS 既不能重新给它上样式、也不会被它污染，而主题自己的浮动工具栏继续占据右下角。在设备页面上它会列出 `.dev/mocks/` 里有什么，这样不用手敲 `/mocks/` URL 也能进入该工作流：当本页 `data-page` 匹配到某个快照时会出现 `◆`，一键打开它；`⊕` 捕获当前打开的页面；`.dev/mocks/` 为空时工具条会缩成一个孤零零的 `⊕`。在快照内部，它会显示当前打开的是哪一个、可以逐个切换其余快照，而 `↩` 回到设备上的同一页面。`✕` 把它收起为一个点，状态记在 `localStorage['aurora.mockbar.collapsed']`。快照列表被内联注入在脚本旁边；两个标签都带 `data-aurora-mock`，捕获时正是靠它把这些标签剥掉 —— 快照绝不能把一份列表烤进去，因为每次提供服务时都会重新注入一份最新的。
- **捕获一个：** 让开发服务器代理一台装有该页面的设备，通过代理打开页面并点 mock 工具条上的 `⊕` —— 或者按 <kbd>Alt/Option+Shift+S</kbd>，或者在控制台里调用 `__auroraMockCapture()`。它会把实时 DOM POST 到 `/mocks/__save`，后者写出 `.dev/mocks/<data-page>.html` —— 以页面的 `data-page` 命名，包含 doctype，仅开发用的 script 标签被剥除。（该端点只接受带有辅助脚本自定义头的请求，跨源页面在没有本服务器绝不批准的 CORS 预检的情况下发不出这个头。）手动捕获同样可行：在 DevTools 控制台运行 `copy(document.documentElement.outerHTML)`，把粘贴内容存成 `.dev/mocks/<name>.html` —— 文件名随意；页面真正的身份是它 `<body>` 里已有的 `data-page` 属性，补丁选择器匹配的正是它。
- **必须从运行着*本*主题的设备上捕获 —— 快照在主题之间不可移植。** 快照是渲染后页面的逐字拷贝，所以它在三个地方硬编码了渲染它的那个主题：样式表链接（`/luci-static/aurora/main.css` 加上该页的补丁）、内联 `<style>` 里设备存储的 UCI token 覆盖，以及主题自己的头部/导航标记。把一个在 `luci-theme-shadcn` 下捕获的快照丢进来（或者反过来），页面会**完全没有样式**，因为开发服务器只提供它自己的 `/luci-static/<theme>/` 前缀。破绽是终端里一行点名了另一个主题样式表的输出：
  ```
  [Mocks] miss /luci-static/shadcn/main.css → 404 (mirror it at .dev/mocks/static/… to serve it)
  ```
  那条通用提示建议的「镜像」在这里是错误的修法 —— 请从运行着本主题的设备上重新捕获该页面。如果你无论如何都要复用一个外来快照，那么只有该应用自己的内容区还有意义：把它的样式表链接指向本主题，并删掉那个内联 `<style>` 块，否则被捕获设备的颜色会覆盖当前检出的 token。
- **查看：** `pnpm dev`，然后打开 <http://localhost:5173/mocks/> —— 一个自动生成的索引会列出每个快照及其 `data-page` 和存在时长。`mock-pages-plugin`（在 `vite.config.ts` 中）在提供每个页面时注入 Vite HMR 客户端，因此编辑任何主题源码（`main.css`、某个组件、某个 `patches/*.css`、或被提供的 JS）都会触发常规的整页重载（见 [实时重载行为](#实时重载行为)）。快照保留它绝对的 `/luci-static/…` 链接；主题的 CSS/JS、字体和图片都在本地解析并即时编译。提供服务时会补上 `outerHTML` 捕获会丢掉的 `<!doctype html>`，所以 mock 会像真实页面一样以标准模式渲染。
- **在快照之间原地导航：** 在 mock 内部，工具条还会接管快照自身 LuCI 链接（`/cgi-bin/luci/…`）的点击，按 `data-page`（精确匹配）把它们解析到已有快照上并直接跳转 —— 应用的标签栏或侧边栏用起来就跟在设备上一样。未捕获的目标会被拦下，并给出点名缺失快照的提示，而不是穿透到代理。工具条列出每一个快照，用 <kbd>[</kbd>/<kbd>]</kbd>（或它的 ‹/› 按钮）循环切换，并链接回索引。`↩` 离开去往真实页面：它的目标来自 LuCI 自己内联引导代码里的 `requestpath`，但仅在该值与快照的 `data-page` 一致时才用（手工拼装的 mock 可能带着它所依据页面的路径段）；否则回退到拆分 `data-page`，而只要某个路径段自身含有连字符（`admin-status-disks-info`），这种拆分就是有损的；再不行就回退到本标签页最后访问过的设备页面。
- **第三方资源：** 快照引用的应用自有 css/js（例如 `qmodem-next.css`，或某个只存在于设备上的自定义 logo）不在本仓库里。要提供它们，就把它的 URL 镜像到 `.dev/mocks/static/` 之下（例如 `.dev/mocks/static/luci-static/resources/qmodem/qmodem-next.css`）；那里的文件按原样提供（无 HMR）。mock 页面请求的未命中会立即 404 —— 绝不代理到路由器，因此 mock 完全可以离线使用 —— 而每次未命中都会打印一次性的终端提示，给出准确的镜像路径。（由 CSS 发起的请求，例如导航图标，携带的 referer 是样式表的 URL，无法归因到 mock 页面；因此任何穿透到代理的 `/luci-static` 请求都被限制在 5 秒内，路由器不可达时回答 504。）没有这些资源，主题依然生效。
- **无认证，无运行时：** 快照是静态 DOM，所以 `mock-pages-plugin` 会剥掉 LuCI 的运行时脚本（`luci.js`/`cbi.js`/`xhr.js` 以及 `/cgi-bin/` 端点），并在提供服务前注入一个空操作的 `L`/`LuCI`/`XHR` 桩。没有这一步，LuCI 会启动、轮询后端、拿到 403（没有会话）并弹出「会话已过期」弹窗。代价是：依赖框架的主题 JS（例如 `menu-aurora`）在 mock 里变成空操作 —— 但捕获的 DOM 本来就已经渲染好了，所以看上去仍然是对的。主题自己的内联脚本（深色模式、工具栏状态）以及任何 `src/media/` 下的 JS 仍然会运行。

### 设计 Token

这里没有本地的 `_tokens.css`，也没有生成步骤：`main.css`/`login.css` 直接 `@import "@eamonxg/luci-theme-tokens/dist/aurora/tokens.css"`，在构建时直接从 `node_modules` 解析。真正的源头在独立的 [`@eamonxg/luci-theme-tokens`](https://github.com/eamonxg/luci-theme-tokens) npm 包里，本仓库以 devDependency 方式消费它：

- **`aurora/defaults.js`** —— 浅色和深色模式下 10 个可编辑的输入色（`bg`、`surface`、`text`、`brand`、`on_brand`、`link`、`info`、`warning`、`success`、`danger`），以 OKLCH 字符串表示。
- **`aurora/spec.js`** —— `DERIVATIONS`（其余每一个 token —— `text_muted`、`surface_sunken`、`hairline`、`brand_hover`、`brand_subtle`、`focus_ring`、`progress_start`/`progress_end`、`*_surface`、`scrim`、`mega_menu_bg` 等等 —— 如何通过 `mix`/`shade`/`set`/`alpha`/`const` 运算符从输入色计算出来），以及 `FIXED`（绕过推导的、按模式区分的字面量，例如阴影）。
- **`engine.js`** —— 这些运算符背后的 OKLCH/OKLAB 色彩数学，基于 [colorjs.io](https://colorjs.io/)。
- **`resolve.js`** —— `createResolver` 遍历一份 `DERIVATIONS` 规格并返回一张扁平的 `{token: oklchString}` 映射，其中不留任何 `color-mix()`/`var()`；`aurora/index.js` 把它预绑定到 Aurora 自己的规格上，导出为 `resolveMode(mode)`，从包的 `/aurora` 入口暴露。
- **`dist/aurora/tokens.css`** —— 由该包自己的 `build.mjs`（其 `prepublishOnly`）构建并随发布的 tarball 一起分发；本仓库不会重新生成它。

**修改一个颜色：**

1. 在 [`luci-theme-tokens`](https://github.com/eamonxg/luci-theme-tokens) 仓库里编辑 `aurora/spec.js`/`aurora/defaults.js`（推导规则、固定字面量、基础输入色），打一个 release tag 让 CI 跑测试、构建 `dist/` 并发布包，然后在这里 bump `@eamonxg/luci-theme-tokens` 这个 devDependency 的版本并运行 `pnpm install`。若要对着本地检出做未发版的迭代，改为在 `.dev` 下运行 `pnpm link ../../luci-theme-tokens`，而不必 bump/发布。
2. 运行 `pnpm build` —— Vite 直接从 `node_modules` 解析 `@eamonxg/luci-theme-tokens/dist/aurora/tokens.css`，所以在本侧，一次颜色改动所需要的就只是一次版本 bump（或 `pnpm link`）。
3. 运行 `pnpm test` 检查色彩数学与派生 token 的不变量（`tests/resolve.test.js`、`tests/surfaces.test.js`，两者都从 `@eamonxg/luci-theme-tokens/aurora` 引入 `resolveMode`）—— 例如色相族、`bg`/`surface_sunken`/`surface` 之间的明度顺序，以及菜单背景的半透明性。

**来自 UCI 的运行时覆盖：** `header.ut` 在每次渲染时读取 `uci get_all aurora.theme`，并把存储的 token 以 CSS 自定义属性覆盖的形式，在 `main.css` 之后重新输出到一个内联 `<style>` 中。键按前缀分命名空间 —— `light_*` 和 `struct_*` 落到 `:root`，`dark_*` 落到 `[data-darkmode="true"]` —— 前缀被剥掉，`_` 映射为 `-`（例如 `light_surface_sunken` → `--surface-sunken`）。模板在一次遍历中把所有键扁平化成两个预先拼好的声明字符串（而不是逐键的模板循环），这把迭代工作量减半，并让输出的 `<style>` 保持紧凑。这正是 `luci-app-aurora-config` 写入的那个钩子。

### LuCI JavaScript API

LuCI 相关的 JavaScript 开发，请参考官方 API 文档：

- [LuCI JavaScript API Reference](http://openwrt.github.io/luci/jsapi/index.html)

### 实时重载行为

- **CSS 改动**：通过自定义 HMR 处理器触发整页重载
- **JS 改动**：通过自定义 HMR 处理器触发整页重载
- **模板改动**（`.ut` 文件）：经 SSH 自动同步到路由器并触发整页重载（需一次性运行 `pnpm setup:router`，见下）

### 模板（`.ut`）实时同步

`.ut` 模板文件是在 OpenWrt 设备上服务端渲染的，所以不像 CSS/JS 那样能本地提供 —— 开发服务器改为把它们推送到路由器。运行一次 `pnpm setup:router` 配置好免密 SSH；此后全自动：

- **启动时**，整个模板目录被推送一次（通过 ssh stdin 传一个 tarball —— Dropbear 没有给 scp 用的 SFTP 服务），这样开发服务器停机期间做的编辑绝不会让路由器上的文件陈旧。
- **保存时**，改动经防抖后再次推送整个目录，然后浏览器重载。
- **页面加载时**，对 `/cgi-bin` 的请求会等待任何进行中的推送，因此被代理的渲染绝不会用到陈旧模板。

**排障** —— 同步错误会连同修复方法一起打印：

- **主机密钥不匹配**（设备被刷过机）：运行 `ssh-keygen -R <device-ip>`，然后重启开发服务器
- **认证失败**（公钥不在设备上，例如刷机之后）：运行 `pnpm setup:router`
- **连接被拒绝/超时**：检查设备是否在线、SSH 是否启用

失败的同步会在下一次 `.ut` 改动时重试；没有 SSH 时 CSS/JS 的开发功能照常工作。

## 构建生产版本

### 构建命令

```bash
cd luci-theme-aurora/.dev/
pnpm build
```

它把所有资源编译到生产目录 `htdocs/luci-static/`，OpenWrt 打包编译时 LuCI 会使用该目录。

**构建产物：**

```
htdocs/luci-static/
├── aurora/
│   ├── main.css           # 压缩后的管理界面 CSS（经 lightningcss）
│   ├── login.css          # 压缩后的登录页 CSS（经 lightningcss）
│   ├── fonts/             # Web 字体（Lato）
│   └── images/            # Logo 资源 + PWA 图标
└── resources/
    └── menu-aurora.js     # 菜单配置（经 Terser 压缩）
```

**构建过程：**

1. Vite 构建两个 CSS 入口（`src/media/main.css` 和 `src/media/login.css`），直接从 `node_modules` 解析 `@eamonxg/luci-theme-tokens/dist/aurora/tokens.css`（见[设计 Token](#设计-token)），并保留 Tailwind 原生的 `@layer` 结构
2. 自定义 Vite 插件（`luci-js-compress`）经 Terser 压缩 JS 文件
3. 从 `.dev/public/aurora/` 复制静态资源

## 打包编译

### 通过 GitHub Actions

**构建前端资源：**

1. 手动触发 `frontend-assets-build` 工作流
2. 它运行 `pnpm build`，若有变化则把产物自动提交到 `htdocs/`

**构建 `.ipk`/`.apk` 包：**

1. 推送版本 tag（`v*`）、以带 `[build]` 的提交信息推到 `master`/`feat/**`，或手动触发工作流
2. `build-theme-package` 工作流会同时编译 `.ipk` 和 `.apk` 两种 OpenWrt 包

**PR 审查：**

触及 `.dev/`、`htdocs/`、`ucode/` 或 `root/` 的 Pull Request 会由 `claude-pr-review` 工作流自动审查 —— 它在源码 diff 上发布行内评论（生成的 `htdocs/` 产物被排除），外加一条总结评论。在 PR 评论中 `@claude` 可请求追加审查或提问。

**Issue 分诊：**

新 issue 由 `claude-issue-bot` 工作流处理 —— 它检查垃圾/重复内容、打标签，并发布一条深入的技术分析评论。在 issue 评论中 `@claude` 即可获得回复。

**工作流文件：** `.github/workflows/`
- `frontend-assets-build.yml` —— 构建资源并自动提交（手动触发）
- `build-theme-package.yml` —— 编译 `.ipk`/`.apk` 包
- `claude-pr-review.yml` —— PR 的 AI 代码审查（行内 + 总结评论）
- `claude-issue-bot.yml` —— AI issue 分诊与分析

## 目录结构

```
luci-theme-aurora/
├── .dev/                           # 开发环境
│   ├── docs/                       # 项目文档
│   │   └── DEVELOPMENT.md          # 开发指南（本文件的英文版）
│   ├── mocks/                      # /mocks/ 用的本地页面快照（被 git 忽略，见 Mock 页面）
│   ├── public/aurora/              # 公共静态资源
│   │   ├── fonts/                  # Web 字体（Lato）
│   │   └── images/                 # 主题图片 + PWA 图标
│   ├── scripts/                    # 构建脚本 + 开发服务器客户端辅助脚本
│   │   ├── clean.js                # 构建清理工具
│   │   ├── mock-bar.client.js      # 注入到设备页面和 /mocks/ —— 快照工具条、捕获、链接接管
│   │   └── setup.js                # pnpm setup:router —— .env 向导 + 到路由器的免密 SSH
│   ├── src/                        # 源码
│   │   ├── assets/icons/           # SVG 图标
│   │   ├── media/                  # CSS 源码（Tailwind CSS v4）
│   │   │   ├── main.css            # 管理界面入口（import 清单；token 来自 @eamonxg/luci-theme-tokens）
│   │   │   ├── login.css           # 登录页入口
│   │   │   ├── _base.css           # 文档基座（html/body 视口背景）
│   │   │   ├── _elements.css       # 基础元素样式（标题、链接等）
│   │   │   ├── _layout.css         # 页面布局/结构
│   │   │   ├── _utilities.css      # 自定义工具类
│   │   │   ├── components/         # 每个 UI 组件一个片段
│   │   │   └── patches/            # 按页的第三方补丁（按需加载，一个 data-page 一个文件）
│   │   └── resource/               # JavaScript 资源
│   │       └── menu-aurora.js      # 菜单逻辑
│   ├── tests/                      # 全部测试套件（pnpm test）
│   │   ├── resolve.test.js         # 解析后 token 的不变量（对着 @eamonxg/luci-theme-tokens/aurora）
│   │   ├── surfaces.test.js        # 表面/色相分层的不变量
│   │   ├── overlay.test.js         # 遮罩/布局 CSS 断言
│   │   └── navigation-*.test.js    # 导航模型/渲染/样式
│   ├── .env.example                # 环境变量模板
│   ├── .prettierrc                 # Prettier 配置
│   ├── package.json                # Node.js 依赖
│   ├── pnpm-lock.yaml              # pnpm 锁文件
│   └── vite.config.ts              # 带自定义插件的 Vite 配置
├── .github/                        # GitHub 配置
│   ├── ISSUE_TEMPLATE/             # Issue 模板
│   ├── workflows/                  # GitHub Actions 工作流
│   └── renovate.json               # Renovate 依赖更新配置
├── .vscode/                        # VS Code 工作区设置
│   └── settings.json               # 保存时自动格式化设置
├── htdocs/luci-static/             # 构建产物（由 Vite 生成）
│   ├── aurora/                     # 主题 CSS 与资源
│   │   ├── fonts/                  # 构建后的字体文件
│   │   ├── images/                 # 构建后的图片 + PWA 图标
│   │   ├── main.css                # 编译后的管理界面 CSS
│   │   ├── login.css               # 编译后的登录页 CSS
│   │   └── patches/                # 编译后的按页补丁（由 header.ut 按需链接）
│   └── resources/                  # 构建后的 JavaScript 模块
│       └── menu-aurora.js          # 压缩后的菜单逻辑
├── root/etc/uci-defaults/          # OpenWrt 系统集成
│   └── 30_luci-theme-aurora        # 主题自动配置脚本
├── ucode/template/themes/aurora/   # LuCI ucode 模板
│   ├── header.ut                   # 头部模板
│   ├── footer.ut                   # 底部模板
│   └── sysauth.ut                  # 登录页模板
├── LICENSE                         # Apache License 2.0
├── Makefile                        # OpenWrt 包 Makefile
├── README.md                       # 英文文档
└── README_zh.md                    # 中文文档
```

## 工具与技术

- **[Tailwind CSS v4](https://tailwindcss.com/)** —— 工具类优先的 CSS 框架
- **[Vite](https://vitejs.dev/)** —— 构建工具与开发服务器
- **[pnpm](https://pnpm.io/)** —— 快速、节省磁盘空间的包管理器
- **[lightningcss](https://lightningcss.dev/)** —— CSS 压缩器
- **[colorjs.io](https://colorjs.io/)** —— 设计 token 生成所用的 OKLCH/OKLAB 色彩数学（由 [`@eamonxg/luci-theme-tokens`](https://github.com/eamonxg/luci-theme-tokens) 使用）
- **[Terser](https://terser.org/)** —— JavaScript 压缩器
- **[Prettier](https://prettier.io/)** —— 代码格式化工具
- **[prettier-plugin-tailwindcss](https://github.com/tailwindlabs/prettier-plugin-tailwindcss)** —— Tailwind 类名排序
- **[tw-animate-css](https://github.com/Wombosvideo/tw-animate-css)** —— Tailwind CSS 的动画工具类
- **[tailwind-scrollbar](https://github.com/adoxography/tailwind-scrollbar)** —— 自定义滚动条样式插件
