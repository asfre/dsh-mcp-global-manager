# 更新日志 / Changelog

> 每个版本用「中文 + English」双语记录：**更新了什么**（按点列）、**适用 Harness 版本**。
> 发布时复制底部模板填好，作为 GitHub Release 说明（自动同步到本文件对应段落）。

---

## v0.2.0 — 2026-11-05
**适用 Harness 版本 / Compatible harness:** `>= 0.1.0-rc.6 <0.3.0-0`
**类型 / Type:** 兼容性加固 / Compatibility hardening

### 更新内容 / What's changed
1. 兼容：放宽 `engines.dsh` 至 `>=0.1.0-rc.6 <0.3.0-0`，覆盖更多老版本 DSH — Compat: relaxed `engines.dsh` to `>=0.1.0-rc.6 <0.3.0-0`, covering more old DSH builds.
2. 兼容：浏览器半改为特性探测（缺 `webServer` / `ctx.slots` / `locale` 时优雅降级），新增「当前环境不可用」横幅而非静默白屏 — Compat: client now feature-detects; graceful degradation when `webServer`/`ctx.slots`/`locale` are absent; added an "environment unavailable" banner instead of a blank screen.
3. 兼容：宿主侧 `webServer` 注册整体包 try/catch，避免异常拖垮宿主插件加载器 — Compat: host-side `webServer` registration wrapped in try/catch so an unexpected error can't take down the host's plugin loader.
4. 文案：写回→同步回、采纳→加入 等整界面大白话化，降低理解门槛 — Wording: plain-language rewrite across the UI (write-back → sync-back, adopt → add-to-DSH).
5. 文档：README 重构（兼容性矩阵 + Issue 模板 + 中英双语），新增 `README.en.md` 互链 — Docs: README reworked (compatibility matrix + issue template + bilingual), added cross-linked `README.en.md`.
6. 修复：备份目录「浏览」选**空文件夹**时切换失败 —— 浏览器沙箱对空目录连目录名都不返回，旧逻辑只弹「请直接输入完整路径」死循环。宿主侧新增系统原生目录窗口回退（Electron → 系统对话框，Windows/macOS/Linux），空目录也能拿到完整绝对路径；前端空文件夹改为聚焦输入框 + 可操作引导 — Fix: picking an **empty folder** for the backup dir never worked because browser sandboxes return neither files nor a fakepath; the host now falls back to a native system folder dialog and the client gives an actionable hint instead of a dead-end message.
7. 修复：浅色 / 壁纸主题下工具图标、徽章、卡片、滚动条、提示气泡变深色块（部分 `--dsw-alias-bg-*` 令牌未注入时兜底色写死深色，造成深底深字看不清报错）。全部兜底色改为中性自适应；工具图标只在被选中的条目上显示强调色 — Fix: dark fallback colors produced unreadable "black blocks" under light/wallpaper themes; all fallbacks are now theme-adaptive and source icons only light up on the selected tool.
8. 健壮性：`/settings` 支持目录名智能解析与 Windows 反斜杠路径规范化；`saveBackupDir` 不再因 localStorage 残留而跳过服务端落盘；系统窗口「取消」与「不可用」分离，取消后不再弹第二个窗口 — Robustness: `/settings` resolves bare directory names and normalizes Windows paths; a stale localStorage value no longer skips the server write; dialog "canceled" and "unavailable" are distinguished so canceling never opens a second picker.
9. 修复：浅色 / 壁纸主题下**所有表格的吸顶表头**背景半透明，滚动时数据行文字透过表头与表头文字叠印（同步台 / DSH 条目 / 来源注册表 / 粘贴导入预览共 23 个表头单元格）。表头改为「不透明 Canvas 底 + 半透明主题色层」叠加，提升 `z-index` 并补内阴影分界线 — Fix: sticky table headers were translucent under light/wallpaper themes, so scrolling rows bled through and overprinted header text; all 23 header cells now use an opaque base with a translucent theme layer, a higher z-index and a crisp separator.
10. 文档：中英 README 的 4 张截图全部按**当前 UI** 重新生成 —— 旧图仍是 10 月的折叠式原型界面，带个人壁纸与「采纳 / 写回」旧文案。图注同步对齐，并把 `assets/screenshot-*.png` 加进 `files`，避免 tarball 里图片裂开 — Docs: all four screenshots in both READMEs were regenerated from the current UI (the old ones still showed the October prototype with a personal wallpaper and outdated wording); captions updated and screenshot assets added to `files` so they ship in the tarball.
11. 发布前脱敏：移除代码注释与内部文档里的真实姓名、本机绝对路径和昵称；README 示例统一用 `~` / `%APPDATA%` 占位，git 历史无残留 — Pre-release scrub: removed real names, local absolute paths and nicknames from code comments and internal docs; examples now use generic `~` / `%APPDATA%` placeholders with no git history residue.

### 升级提示 / Upgrade notes
- 建议升级；本次为纯向后兼容增强，无破坏性变更，旧版 `cordis.patch.yml` 受管行与 `state.json` 账本均可直接沿用 — Recommended upgrade; purely backward-compatible, no breaking changes. Existing `cordis.patch.yml` rows and `state.json` ledger carry over as-is.
- 本批次改到了宿主半 `lib/index.js`，**升级后需彻底重启 DSH**（托盘退出再打开）；仅 `Ctrl+R` 刷新不会加载新的宿主代码 — This batch touches the host half `lib/index.js`, so a **full DSH restart** is required; a plain `Ctrl+R` won't reload host-side code.

---

## v0.1.1 — 2026-10-22
**适用 Harness 版本 / Compatible harness:** `>= 0.1.6-alpha.1 < 0.2.0-0` 或 / or `>= 0.2.0-rc.1 < 0.3.0-0`
**类型 / Type:** 安全加固 / Security hardening

### 更新内容 / What's changed
1. 安全：删除 `/push` 服务端残留的 `force` 绕过分支，写回授权门不可被跳过 — Security: removed the legacy `force` bypass in the `/push` handler; the per-entry write-back gate can no longer be skipped.
2. 安全：localhost API 增加 Origin/Host 同源 + DNS 重绑定校验 — Security: added same-origin and DNS-rebinding checks on the loopback API.
3. 健壮性：把 js-yaml 4.x 显式声明进 `dependencies`，不再依赖兄弟插件 `.pnpm` 兜底 — Robustness: pinned js-yaml 4.x as a direct dependency instead of relying on sibling plugins.
4. 文档：README 补足「权限与风险披露 / 兼容性 / 安装」三节 — Docs: added permission/disclosure, compatibility and install sections to the README.
5. 测试：后端单测达 50 项（含写路径沙箱与冷启动演练）— Tests: 50 backend unit tests including write-path sandbox and cold-start drills.

### 升级提示 / Upgrade notes
- 建议升级；本次以安全修复为主，无破坏性变更 — Recommended upgrade; security-focused, no breaking changes.

---

<!-- 新版本模板 / Template —— 复制这一段，替换版本号/日期/内容 -->
## vX.Y.Z — YYYY-MM-DD
**适用 Harness 版本 / Compatible harness:** `>= ... < ...`
**类型 / Type:** 新增功能 / 修复 / 移除（三选一 / pick one）

### 更新内容 / What's changed
1. （中文）— (English)
2. （中文）— (English)

### 升级提示 / Upgrade notes
- （中文）— (English)

---

<!-- 版本号命名规范 / Versioning —— 供发版时参考，不属于某个具体版本 -->
## 版本号命名规范 / Versioning (SemVer)

本项目遵循 [SemVer](https://semver.org/lang/zh-CN/)：`主版本.次版本.补丁`（`MAJOR.MINOR.PATCH`）。
DSH 生态仍处于 `0.x` 阶段，约定如下：**配置文件格式 / API 契约出现不兼容变更才进位到 `1.0.0`**；
其余向后兼容的功能增强走 `0.x.0`，纯修复走 `0.x.y`。以下为基于本次工作的取名示例：

| 版本号 | 类型 | 适用场景 / Scenario |
| --- | --- | --- |
| `0.1.0` | 首次公开可用 | 初版功能集稳定、可供他人安装使用。First stable, installable feature set. |
| `0.1.1` | 补丁 / patch | 修一个写回确认框在暗色下看不清的样式 bug，功能与接口不变。Bug fix, no behavior/API change. |
| `0.2.0` | 次版本 / minor | **本次发布**：新增向后兼容能力（多版本兼容性加固 + 特性探测 + 环境不可用横幅）。New backward-compatible capability. |
| `0.3.0` | 次版本 / minor | DSH `0.3.0` 发布后放宽 `engines.dsh` 上限并适配新插槽 API，旧配置仍可用。Adapt to new DSH major, config stays compatible. |
| `1.0.0` | 主版本 / major | `cordis.patch.yml` 受管行格式或本机 API 契约出现**不兼容变更**，需用户手动迁移。Breaking change to config/API contract. |

> 预发布/构建元数据示例：`0.2.0-rc.1`（候选版）、`0.2.0+build.42`（构建号）。本插件 `package.json` 当前为 `0.2.0`。

