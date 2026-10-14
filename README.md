# dsh-mcp-global-manager

把本机**所有工具的 MCP 配置**收在一处看、一处管：扫描差异 → 一键采纳进 DSH → 需要时写回原工具 → DSH 侧直接增删改停用。侧栏入口是地球图标 + 文字 **MCP全局管理**（`order: 22`，恰好排在 dsh-remote-web-ui「远程链接」的 21 后面；没装那个插件也照常可用）。

## 它解决什么

MCP 配置往往散在 Claude Code / Codex / VS Code / Trae / Kiro / MarsCode / OpenCode / O+Connect 等十来个工具的配置文件里，同名条目（比如 `pencil` 出现在 5 个工具里）改一处忘三处。这个插件做三件事：

1. **发现**：按注册表扫每个工具的配置文件，识别各自的方言（JSON / TOML / OpenCode / Continue 数组形态…）。
2. **同步**：勾选后写进 DSH 的 `cordis.patch.yml`，生成 `@deepseek-ai/dsh-mcp-client` 行（与 `dsh-mcp-manager-plus` 的行形状互通，两边都能认出彼此管的行）。
3. **管理**：DSH 侧的新增 / 编辑 / 删除 / 停用直接在面板做；写回原工具需在条目上显式打开「允许写回」。

## 安全边界（重要）

- **删除只标记，不自动删**：别的工具里条目消失了，面板只标红 `缺`，DSH 那一行原样保留；要删得亲手点。
- **密钥打码，写入必还原**：`/scan` 响应里 env/headers 的敏感键显示为 `••••••••`；保存/写回时服务端用磁盘上的**未打码原值**补回（`restoreSecrets`），补不回原值的（比如给源文件里没有的新条目带掩码提交）直接 409 拒写——任何配置文件都不会被写进八个圆点。`tools/cold-start-check.mjs` 第 [5] 相对临时探针文件做正反两向演练。
- **写回是破坏性操作**：任何写盘都走 `读原文 → 纯函数改 → 结构校验 → 回读验证 → 备份 → 原子写`，任一环节不过就整笔取消，磁盘一个字节不动。
- **备份**：写入前把原文件复制到 `~/.dsh/mcp-global-manager/backups/`，最多留 40 份。
- **凭据掩码**：`*KEY* / *PASSWORD* / *SECRET* / *TOKEN*` 的环境变量在面板里显示为 `••••••••`；不改它就用原值，改了才覆盖。
  ⚠️ 注意：不少工具（例如 Trae CN 的 Apifox 条目）会把 token **明文**存在自己的配置文件里。本插件只在面板显示时打码，源文件本身仍是明文——别把那些文件原样贴给别人或提交进仓库。
- **只读源**：注册表里标 `writeBack:false` 的源（lingma / cherry-studio / zed / warp / continue）只读不写，面板点写回会被 403 挡下。
- **仅本机访问**：API 挂在 `/mcp-global/*`，非 loopback 请求一律 403。

## 面板怎么用

1. 侧栏点 **MCP全局管理**。
2. 顶部 **刷新扫描** = 重新读所有源文件（有 400ms 缓存，防止连点把磁盘扫穿）。
3. 徽章一行：总数 / 新发现 / 有变化 / 源里已删 / DSH 已管 / 存在的文件 / 读取失败。
4. 「各工具的 MCP 配置」每个源一块：勾选 → **采纳选中**；或单条点 **采纳到 DSH**。
5. 单条 **改配置** 后可编辑；先打开 **允许写回**，才会出现 **写回该工具 / 从该工具删除**。这两个按钮改的是**别的工具的配置文件**，所以点下去会先弹确认框；服务端还有第二道门——没在账本里授权过这条，直接 403 拒绝（`force` 只是给手工/CLI 留的后门，面板不用它）。冒烟测试把这条钉成了静态规则：`client.js` 里出现无条件 `force: true` 就判失败。
6. 「DSH 侧」那块做增删改与停用；**新增 DSH 条目** 手工建一条。
7. **自检** 按钮出三样东西，鼠标悬上去是完整 JSON：
   - `yaml 解析 js-yaml 4.3.2 OK` —— **现场**解析补丁依赖（绕开 import 缓存）。这是唯一能提前发现「重启后会崩」的信号；
   - `安装包 ✓ / bundles 名单 ✓ / client.js ✓` —— 侧栏条目出不来的三个常见原因；
   - `DSH 受管行 N` —— 补丁里已托管几条。
   
   如果显示「冷启动字段缺失」，说明当前进程还在跑安装前的旧代码，重启 DSH 再点就正常了，不是坏了。

## 刷新按钮到底标了什么

按的是「这次扫到的内容指纹」和「上次账本基线」的差异，四种状态：

- `无变化 (same)`：指纹一致。
- `新发现 (new)`：上次基线里没有这个 `源id::服务名` 键。
- `有变化 (changed)`：键在，但指纹变了（改命令、改参数、改 env 值、改 url 都算；**键的顺序**不算，所以别的工具重排 JSON 不会误报）。启用/停用开关不计入指纹——DSH 侧那块的停用状态走行内红色 `已停用` 标记和开关按钮，不靠差异标记。
- `源里已删 (gone)`：基线里有、这次文件里读不到了。**只标红提示，绝不自动删** DSH 那侧的行，勾选框直接禁用；条目还带着上次的展示信息与采纳关系，所以你知道它原先是谁。

同名散落在多个工具里会互相点名（`重复于: Trae CN, Cursor`），这就是你最关心的「pencil 到底有几份」。

消失后又**原样回来**的条目仍然是 `same` 而不是 `new`——基线会跟着 gone 一起留着。真想把某条彻底从账本抹掉（比如那个工具你不用了），删掉 `~/.dsh/mcp-global-manager/state.json` 即可，下次扫描当作全新开始；插件自己的数据只有这个文件加 `backups/`，不碰任何工具的配置。

## 服务名规范

DSH 的 `serverName` 会进工具名前缀，所以非 `[A-Za-z0-9_-]` 会被规范化：`API 文档` → `API`，纯中文 → `server-<hash6>`。面板会显示 `服务名已规范化: 原名 → 新名`；DSH 侧已存在的行不会被回头改写。

## 离线自测（零写入）

```powershell
# 只扫描打印
node "$env:USERPROFILE\dsh-plugins\dsh-mcp-global-manager\tools\cli-scan.mjs"

# 演示「采纳全部外部条目」会写出什么 YAML（不碰磁盘）
node "$env:USERPROFILE\dsh-plugins\dsh-mcp-global-manager\tools\cli-scan.mjs" --emit

# 真写入（必须带 --confirm，会先备份）
node "…\tools\cli-scan.mjs" --adopt "vscode::pencil,trae-cn::playwright" --confirm

# 单元测试
node "$env:USERPROFILE\dsh-plugins\dsh-mcp-global-manager\test\run.mjs"
```

`--emit` 的预览和真实导入共用同一个纯函数 `planImport`，所以「面板说写几行」等于「真写几行」；批次内同名（如 5 个 pencil）只采纳第一条，其余报 `跳过`。

## 改完代码之后

`file:` 安装是**实拷贝**，源码改了 profile 里不会自己变：

```powershell
# 1. 回归（后端 49 项，含 sync.js 写路径的沙箱演练 + 客户端包冒烟）
node "$env:USERPROFILE\dsh-plugins\dsh-mcp-global-manager\test\run.mjs"
node "$env:USERPROFILE\dsh-plugins\dsh-mcp-global-manager\tools\smoke-client.mjs"

# 1.5 冷启动演练：在新进程里加载**已安装副本**，伪造 loader/webServer 挂路由，
#     再打 /selftest、/scan 和自定义源增删。它等价于「重启后用户的第一次点击」，
#     专治「现在能用、重启就崩」（js-yaml 那次就是这么被骗的）。
node "$env:USERPROFILE\dsh-plugins\dsh-mcp-global-manager\tools\cold-start-check.mjs"

# 2. 同步进 profile（被 DSH 占用的文件会跳过并提示）
powershell -ExecutionPolicy Bypass -File "$env:USERPROFILE\dsh-plugins\dsh-mcp-global-manager\tools\sync-to-profile.ps1"

# 3. 只改客户端 → Ctrl+R 刷新界面即可；改了宿主侧 lib/*.js → 重启 DSH
```

`smoke-client.mjs` 用 React / slots / locale 桩把面板渲染跑一遍，专门拦「一个 ReferenceError 让整页白屏」这类事故，并校验侧栏 `order=22`、文案 `MCP全局管理`、以及全部 91 个 `t()` key 都在 `zh` 里。

## 一个会反复咬人的坑：js-yaml 版本

补丁方言依赖 js-yaml **4.x** 的 `Type` 构造器（DSH 加载器同款）。profile 的 hoisted `node_modules/js-yaml` 会被别的插件（如 `dsh-config-manager` 依赖 5.x）占位，而 5.x 没有 `Type` → `buildSchema` 直接 TypeError。`resolveYaml()` 因此按**能力**挑副本：先标准解析，拿到不可用的就退到 `node_modules/.pnpm/js-yaml@4.x/node_modules/js-yaml`。pnpm 重整目录（`Packages: +N -M` 里那 M 个孤儿）会让「之前能用、重启后崩」这种情况出现，所以别只测当前进程，重启后也要点一次 **自检**。


## 验收清单（彻底重启后照着走一遍，约 2 分钟）

> 「彻底重启」= 托盘右键退出 DSH 再打开。`Ctrl+R` 只重载前端，宿主进程里跑的还是旧的 `lib/*.js`，
> 这时候面板会报「冷启动字段缺失」——那是没重启，不是坏了。

| # | 做什么 | 应该看到 | 看不到时怎么办 |
|---|---|---|---|
| 1 | 看侧栏 | 「远程链接」正下方一项 **MCP全局管理**（有地球图标 + 文字） | 侧栏条目顺序：远程链接 `order: 21`，本插件 `order: 22`，同一个槽 `sidebar.panellist`。若装了 dsh-remote-web-ui 且「远程链接」整项消失 → 是那个插件的补丁被插件市场更新洗掉了，重打它的补丁即可，跟本插件无关 |
| 2 | 点 **自检** | `js-yaml 4.x OK`、客户端包三项 ✓、`DSH 受管行 0` | js-yaml 报 FAIL → 见下面「一个会反复咬人的坑」；受管行不是 0 → 说明你已经有采纳进去的行，属正常 |
| 3 | 点 **刷新扫描** | 摘要大约 **28 条目 / 11 个文件 / 0 错误**（数字随你装的工具变，重点是错误=0） | 有解析错误就把该条源的名字念出来，注册表里它的方言没吃对 |
| 4 | 勾 1~2 条点 **采纳选中** | 面板出现 DSH 侧新行；`~/.dsh/mcp-global-manager/backups/` 里多一个备份目录；`cordis.patch.yml` 行数增加 | 报错且文件没变 → 校验没过（validateDocument），文本被原样退回，不会有半成品 |
| 5 | 在条目上开 **允许写回** 再点 **写回该工具** | 先弹确认框；确认后目标工具的配置被改，且备份目录多一项。表单里的 `••••` 只是占位——保存时服务端自动用磁盘原值还原，不用重填密钥 | 没弹确认就没发出请求；直接 403 说明这条还没授权，或者该源在注册表里是只读（Zed / Warp / Continue 那批）；409 说「仍是掩码」= 源文件里找不到原值，得手工填真实值 |

第 4、5 步是唯一会**真的写文件**的动作，做到那儿先看清确认框里写的是哪个工具。想回到干净状态：DSH 侧的行用面板删（会先备份），账本本身删 `~/.dsh/mcp-global-manager/state.json` 即可重来。

## 已知限制

- JSON 源被写回时 `//` 与 `/* */` 注释、以及尾随逗号会**丢失**（脚本必须容错读，但没法还原注释）；写前一定有备份，丢了也能回滚。
- TOML 只处理 `[mcp_servers.x]` 一层；`[mcp_servers.x.env]` / `.http_headers` 子表会被合并进父条目（写回时展平成 `env = { K = "V" }`）。
- 只扫注册表里的路径。新工具想支持：**扫描的源** 里加一条自定义源（id / 格式 / 容器键 / 候选路径，支持 `%APPDATA%` 之类环境变量），标 `允许写回` 才会真写。
- 面板不代管 DSH 的 MCP 运行状态（启不启得来还得看 DSH 自己的 MCP 层）；它管的是配置。
- 补丁的 `id` 命名空间是全 profile 共享的：一条 `- id: mcp-xxx / disabled: true` 到底是「某台 MCP 服务器的停用覆盖」还是「隔壁插件自己的配置行」，文件里没有任何标记能区分（真实机器上就可能躺着一条 `- id: mcp-manager-plus`）。因此本插件的三个写操作（停用/删除/改名）都先确认**补丁里确实存在这条受管服务器行**，认不出主就拒绝并回报 409/404，一个字节都不动、也不清账本——宁可少管一条，也不误删别人的配置。`tools/cold-start-check.mjs` 会在真实补丁上对一条外来 id 亲自试一遍这三件事，并对比文件哈希。真要停一个名字叫 `manager-plus` 的服务器，会跟同名前缀的插件打架——避开这个服务名即可。

## 卸载

删掉 profile 里的这条依赖并从 `dsh.profile.bundles` 移除，再刷新界面。DSH 补丁里已经生成的 `mcp-*` 行**不会**跟着消失（那是你的配置，不是插件的东西），需要的话在面板里逐条删。
