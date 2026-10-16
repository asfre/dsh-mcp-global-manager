# 投稿截图拍摄清单（SHOOT.md）

> 给 dsh-mcp-global-manager 的 GitHub 市场详情页用。市场会像 App Store 一样展示这些图。
> 路径在仓库根的 `screenshots.json` 里已声明，本文件只说「截哪 4 张、怎么截」。

## ⚠️ 截图时机（重要）

当前装在 profile 里的插件是**旧代码**（带 `body.force`、没有 CSRF 修复），因为园长要求"先别同步、先放着"。
**在 sync-to-profile.ps1 执行 + 完整重启 DSH 之前，不要截真实面板**——否则截图是改之前的 UI，投稿反而误导审核。

截图的准星：等新代码生效后再开面板（DSH Web → 侧栏 → 第 22 位 MCP 全局管理）。

## 要截的 4 张（对应 screenshots.json 顺序）

| 文件 | 内容 | 怎么截 |
|------|------|--------|
| screenshot-1.png | **扫描结果总览** | 打开面板，点「扫描」，截到顶部那一行状态徽章（已启用/已失效/缺失/幽灵/不同步 等计数）+ 源列表前几行 |
| screenshot-2.png | **「允许写回」确认弹窗** | 对某条「差异」点「采纳/写回」，截出授权确认对话框（说明会写回该工具的配置文件） |
| screenshot-3.png | **DSH 侧增删改** | 在「DSH 侧栏 MCP 服务器」区，截到新增/编辑/删除操作的表单或行内编辑态 |
| screenshot-4.png | **自检输出** | 跑 `node tools/cold-start-check.mjs` 或面板内「自检」，截到检查通过的汇总行 |

## 规格

- 格式 png，宽 1200–1600px 左右即可，不要太大。
- 图片放本目录（`assets/`），文件名与 `screenshots.json` 一一对应。
- `.gitignore` 已确认**不**忽略 `screenshots.json` 与 `assets/`，可正常进 PR。
- 截完确认 4 张都在，再提 PR（加分项，不影响收录，但有了更好看）。
