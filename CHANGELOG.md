# 更新日志 / Changelog

> 每个版本用「中文 + English」双语记录：**更新了什么**（按点列）、**适用 Harness 版本**。
> 发布时复制底部模板填好，作为 GitHub Release 说明（自动同步到本文件对应段落）。

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
