/* dsh-mcp-global-manager — 浏览器侧包（惰性 CJS 自注册，不能有 export 语句） */
window.__ModuleLoader__.load({
  id: "dsh-mcp-global-manager",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;

    // ── React ───────────────────────────────────────────────────────────────
    var reactModule = require("react");
    var react = reactModule && reactModule.createElement ? reactModule : reactModule && reactModule.default ? reactModule.default : reactModule;
    var h = react.createElement;
    var useState = react.useState;
    var useEffect = react.useEffect;
    var useCallback = react.useCallback;
    var useMemo = react.useMemo;

    var NS = "dsh-mcp-global-manager";
    var API = "/mcp-global";
    var ENTRY_ID = "mcp-global-manager";
    var MASK = "••••••••";

    /* ── 多版本兼容层 ────────────────────────────────────────────────────────
     * 本插件依赖两类宿主能力，不同 DSH 大版本形态不同（一律「特性探测」而非版本嗅探）：
     *   1) 宿主半（lib/index.js）的 loopback API（webServer 能力）→ 用于扫描/采纳/同步回；
     *   2) 浏览器半（本文件）经 ctx.slots 注册侧栏入口、经 ctx.locale 取译文。
     * DSH 版本拐点（来自市场插件的兼容声明，已实测）：
     *   - DSH < 0.1.0-rc.6 ：多数插件自禁用；本面板显示「环境不可用」横幅；
     *   - DSH 0.1.5+        ：标准侧栏入口（图标进左侧导航）；更早回退侧栏底部按钮+浮层（0.5.0 移除）；
     *   - DSH 0.2.1+        ：入口位于 Plugins 页签（紧挨 Installed），由宿主自行路由；
     *   - 缺 webServer      ：宿主半无法提供 API，浏览器半显示横幅而非静默空白；
     *   - 缺 --dsw-alias-*  ：CSS 已用 var(--dsw-alias-*, 兜底色) 回退，无需代码。
     * 版本号仅用于横幅文案，绝不作为分支条件（避免嗅探误判）。
     * ───────────────────────────────────────────────────────────────────── */
    var MG_HOST = null;      // 当前挂载的宿主 DOM 容器
    var MG_BOOTED = false;   // 首次 reload 是否已完成（无论成败）
    var MG_API_DOWN = false; // 本机 API 是否不可用（缺 webServer / 老版本 / headless）

    // 尽量读取运行时的 DSH 版本（仅用于横幅说明，不作为分支条件）。
    function dshRuntimeVersion() {
      try {
        var g = (typeof window !== 'undefined') && window;
        var v = g && (g.__DSH__ && g.__DSH__.version || g.DSH_VERSION || (g.dsh && g.dsh.version));
        return v ? String(v) : null;
      } catch { return null; }
    }

    // 兼容：本机 API 不可用（缺 webServer / 老版本 DSH / headless）时显示明确横幅，而非静默空白。
    // 做法：保留 #app 骨架但隐藏它，叠加横幅；reload 成功时由成功分支恢复骨架可见性并移除横幅，
    // 这样即使在「横幅显示期间 API 恢复可用」的罕见情况下，renderAll 也不会因找不到骨架元素而报错。
    function showApiUnavailable(err) {
      if (!MG_HOST || typeof document === 'undefined') return;
      var app = MG_HOST.querySelector('#app');
      if (!app) { // 骨架被意外替换时先还原
        MG_HOST.innerHTML = MG_HTML;
        app = MG_HOST.querySelector('#app');
      }
      var old = MG_HOST.querySelector('.mg-apidown');
      if (old && old.parentNode) old.parentNode.removeChild(old);
      var banner = document.createElement('div');
      banner.className = 'mg-apidown';
      var ver = dshRuntimeVersion() || '未知';
      function esc2(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
      }); }
      banner.innerHTML =
        '<style>' +
        '.mg-apidown{max-width:680px;margin:48px auto;padding:24px 28px;border:1px solid var(--mg-border,#3a3a44);border-radius:12px;background:var(--mg-surface,#1c1c22);color:var(--mg-text,#e8e8ec);font:14px/1.7 system-ui,sans-serif}' +
        '.mg-apidown h2{margin:0 0 12px;font-size:18px}.mg-apidown p{margin:8px 0}' +
        '.mg-apidown code{background:var(--mg-surface-1,#26262e);padding:2px 6px;border-radius:6px}' +
        '.mg-apidown .mg-sub{color:var(--mg-text-3,#9a9aa6);font-size:12px;word-break:break-all}' +
        '</style>' +
        '<h2>MCP 全局管理 · 当前环境不可用</h2>' +
        '<p>本面板需要 DSH 在 <b>web / 桌面版</b> 下提供的本机扫描 API（要求 DSH ≥ 0.1.0-rc.6，且宿主具备 webServer 能力）。</p>' +
        '<p>检测到的 DSH 版本：<code>' + esc2(ver) + '</code></p>' +
        '<p>常见原因：① 运行在 headless 或不带 webServer 的宿主；② DSH 版本低于 0.1.0-rc.6；③ 面板与宿主不在同一 profile。</p>' +
        '<p class="mg-sub">技术信息：' + esc2(String(err && err.message ? err.message : err)) + '</p>';
      if (app) app.style.display = 'none';
      MG_HOST.appendChild(banner);
    }

    // ── 文案 ────────────────────────────────────────────────────────────────
    var zh = {
      "entry.label": "MCP全局管理",
      "title": "MCP 全局管理",
      "hint": "这个面板把你电脑上各工具（VS Code、Claude、Cursor 等）里的 MCP 配置集中到一起，统一在 DSH 里管理：可把别的工具里的配置【加入 DSH】，也能开启同步后把改动【同步回原工具】（默认只读，只能看不能改）。",
      "refresh": "刷新扫描",
      "refreshing": "扫描中…",
      "adoptSelected": "加入选中",
      "selectAllNew": "全选新增项",
      "clearSel": "清空勾选",
      "loading": "正在首次扫描…",
      "empty": "没有发现任何 MCP 条目。",
      "sumTotal": "条目",
      "sumNew": "新发现",
      "sumChanged": "有变化",
      "sumGone": "源里已删",
      "sumSame": "一致",
      "sumInDsh": "DSH 已管",
      "sumDisabled": "已停用",
      "sumFiles": "存在的文件",
      "sumErrors": "读取失败",
      "secDsh": "DSH 侧（cordis.patch.yml）",
      "secTools": "各工具的 MCP 配置",
      "searchPh": "搜索服务名 / 命令…",
      "filterAll": "全部",
      "grpToggleHint": "点击折叠 / 展开这个工具",
      "secSources": "扫描的源（点开管理）",
      "secBackups": "备份",
      "backupFiles": "个文件",
      "dshAdd": "新增 DSH 条目",
      "dshEdit": "编辑",
      "dshSave": "保存",
      "dshCancel": "取消",
      "dshRemove": "删除",
      "dshToggleOn": "停用",
      "dshToggleOff": "启用",
      "adopt": "加入 DSH",
      "editForm": "改配置",
      "pushUpsert": "同步回原工具",
      "pushRemove": "从该工具删除",
      "pushBackAllow": "允许同步回",
      "confirmPush": "这一步会直接改写这个工具自己的配置文件（改之前会先备份一份）。确认同步：",
      "pushBackDeny": "禁止写回",
      "statusNew": "新",
      "statusChanged": "变",
      "statusGone": "缺",
      "goneHint": "源文件里已经没有这条了；按约定只标记、不自动删。点「清除标记」可让它从列表消失",
      "forgetMark": "清除标记",
      "statusSame": "同",
      "yes": "是",
      "no": "否",
      "noteGone": "工具里已经找不到这条了；DSH 的行保留着，要删请手动点删除。",
      "noteRenamed": "服务名已规范化",
      "noteDuplicate": "同名存在于",
      "noteCwd": "命令用了相对路径，加入时会自动补 cwd",
      "noteReadOnly": "这个工具设为只读，不能改它的配置文件",
      "noteMasked": "密钥以 •••• 掩码显示，不改动就保持原值",
      "fName": "服务名",
      "fTransport": "传输方式",
      "fCommand": "命令",
      "fArgs": "参数（每行一个）",
      "fCwd": "工作目录",
      "fUrl": "URL",
      "fEnv": "环境变量",
      "fHeaders": "请求头",
      "sId": "源 id",
      "sLabel": "显示名",
      "sFormat": "格式",
      "sContainer": "容器键",
      "sDialect": "方言",
      "sPaths": "候选路径（每行一个，支持 %APPDATA% 等）",
      "sWriteBack": "允许同步回",
      "sAdd": "添加源",
      "sRemove": "移除",
      "selftest": "自检",
      "patch": "补丁文件",
      "scannedAt": "扫描于",
      "stYaml": "yaml 解析",
      "stBundle": "安装包",
      "stRows": "DSH 受管行",
      "stStale": "冷启动字段缺失：当前进程仍在跑安装前的旧代码，重启 DSH 后再点自检",
      // ── 弹窗表单 ──
      "modalAdd": "新增 MCP 服务",
      "modalEdit": "编辑 MCP 服务",
      "grpBasic": "第 1 步 · 基本信息",
      "grpLaunch": "第 2 步 · 怎么启动（本地命令）",
      "grpEnv": "第 3 步 · 环境变量（可选）",
      "grpRemote": "第 2 步 · 远程地址",
      "grpHeaders": "第 3 步 · 请求头（可选）",
      "grpAdvanced": "高级（一般不用填）",
      "fNameHint": "给它起个名字：只用字母、数字、- 和 _，例如 filesystem、pencil",
      "fTransportHint": "本地装的工具选「本地命令」；只有一个网址的在线服务选「远程 URL」",
      "tpStdio": "本地命令（stdio）—— 最常见",
      "tpHttp": "远程 URL（Streamable HTTP）",
      "tpSse": "远程 URL（SSE，旧协议）",
      "pasteLine": "偷懒填法：把文档里的整行命令或网址粘贴到这里，点「识别」自动拆好",
      "pasteBtn": "识别",
      "fCommandHint": "填第一个词就好，例如 npx、uvx、node、python",
      "argAdd": "＋ 加一个参数",
      "argRemove": "删掉这个参数",
      "kvAdd": "＋ 加一条",
      "kvRemove": "删掉这条",
      "fCwdHint": "只有命令里写了相对路径才需要填",
      "envHint": "名字带 KEY / TOKEN / SECRET 的值会自动打码显示；不改它，保存时自动保留原值",
      "preview": "将要写入的内容（预览）",
      "saving": "保存中…",
      "loadFail": "加载失败：点上方「刷新扫描」重试",
      "selNone": "先在列表里勾选要加入的条目",
      "toastDismiss": "点击关闭",
      "fUrlHint": "要以 http:// 或 https:// 开头",
      "kvKeyHint": "名字部分不要带空格或 = 号",
      "vNameReq": "服务名不能为空",
      "vNameRule": "服务名只能用字母、数字、- 和 _（最长 32 个字符），例如 filesystem",
      "vNameDup": "DSH 里已经有同名服务了，换一个名字",
      "vCmdReq": "本地命令方式必须填「命令」，例如 npx",
      "vCmdSpace": "「命令」只填第一个词，不要带空格和参数；其余放「参数」里，或用上方整行粘贴识别",
      "vUrlReq": "远程方式必须填 URL",
      "vUrlRule": "URL 要以 http:// 或 https:// 开头",
      "vEnvLine": "每行要写成 名字=值，例如 API_TOKEN=abc",
      "vEnvKey": "名字里不要带空格",
      "vFixCount": "有 %n 处不符合规则，已标红"
    };
    var en = {
      "entry.label": "MCP Global",
      "title": "MCP Global Manager",
      "hint": "Scans MCP configs of the tools on this machine: adopt into DSH, push back after authorizing, and add/edit/remove on the DSH side. Entries deleted inside other tools are only flagged, never auto-removed from DSH.",
      "refresh": "Rescan",
      "refreshing": "Scanning…",
      "adoptSelected": "Adopt selected",
      "selectAllNew": "Select all new",
      "clearSel": "Clear selection",
      "loading": "Running the first scan…",
      "empty": "No MCP entries found.",
      "sumTotal": "entries",
      "sumNew": "new",
      "sumChanged": "changed",
      "sumGone": "gone from source",
      "sumSame": "same",
      "sumInDsh": "in DSH",
      "sumDisabled": "disabled",
      "sumFiles": "files present",
      "sumErrors": "read errors",
      "secDsh": "DSH side (cordis.patch.yml)",
      "secTools": "MCP configs of other tools",
      "searchPh": "Search name / command…",
      "filterAll": "All",
      "grpToggleHint": "Click to collapse / expand this tool",
      "secSources": "Scanned sources (open to manage)",
      "secBackups": "Backups",
      "backupFiles": "files",
      "dshAdd": "New DSH entry",
      "dshEdit": "Edit",
      "dshSave": "Save",
      "dshCancel": "Cancel",
      "dshRemove": "Remove",
      "dshToggleOn": "Disable",
      "dshToggleOff": "Enable",
      "adopt": "Adopt into DSH",
      "editForm": "Edit config",
      "pushUpsert": "Push back to this tool",
      "pushRemove": "Remove from this tool",
      "pushBackAllow": "Allow push-back",
      "confirmPush": "This edits that tool's own config file (a backup is taken first). Confirm push-back:",
      "pushBackDeny": "Deny push-back",
      "statusNew": "new",
      "statusChanged": "chg",
      "statusGone": "gone",
      "goneHint": "Entry no longer exists in the source file. Marked only, never auto-deleted. Use Dismiss to hide it.",
      "forgetMark": "Dismiss",
      "statusSame": "same",
      "yes": "yes",
      "no": "no",
      "noteGone": "No longer present in the tool; the DSH row is kept. Remove it manually if you want.",
      "noteRenamed": "Server name normalized",
      "noteDuplicate": "Same name also in",
      "noteCwd": "Command uses a relative path; cwd will be filled in on adopt",
      "noteReadOnly": "This source is read-only in the registry",
      "noteMasked": "Secrets are masked with ••••; leave untouched to keep the original value",
      "fName": "Server name",
      "fTransport": "Transport",
      "fCommand": "Command",
      "fArgs": "Arguments (one per line)",
      "fCwd": "Working directory",
      "fUrl": "URL",
      "fEnv": "Environment variables",
      "fHeaders": "Headers",
      "sId": "Source id",
      "sLabel": "Label",
      "sFormat": "Format",
      "sContainer": "Container key",
      "sDialect": "Dialect",
      "sPaths": "Candidate paths (one per line; %APPDATA% etc. supported)",
      "sWriteBack": "Allow push-back",
      "sAdd": "Add source",
      "sRemove": "Remove",
      "selftest": "Self-test",
      "patch": "Patch file",
      "scannedAt": "Scanned at",
      "stYaml": "yaml parsing",
      "stBundle": "bundle",
      "stRows": "managed DSH rows",
      "stStale": "Cold-start fields missing: this process is still running pre-install code. Restart DSH, then run the self-test again.",
      "modalAdd": "New MCP server",
      "modalEdit": "Edit MCP server",
      "grpBasic": "Step 1 · Basics",
      "grpLaunch": "Step 2 · How it starts (local command)",
      "grpEnv": "Step 3 · Environment variables (optional)",
      "grpRemote": "Step 2 · Remote address",
      "grpHeaders": "Step 3 · Headers (optional)",
      "grpAdvanced": "Advanced (usually empty)",
      "fNameHint": "Pick a name: letters, digits, - and _ only, e.g. filesystem, pencil",
      "fTransportHint": "Choose “local command” for tools installed on this machine; “remote URL” for online services.",
      "tpStdio": "Local command (stdio) — most common",
      "tpHttp": "Remote URL (Streamable HTTP)",
      "tpSse": "Remote URL (SSE, legacy)",
      "pasteLine": "Shortcut: paste a whole command line or URL from the docs and click “Detect”.",
      "pasteBtn": "Detect",
      "fCommandHint": "Just the first word, e.g. npx, uvx, node, python",
      "argAdd": "＋ Add argument",
      "argRemove": "Remove this argument",
      "kvAdd": "＋ Add entry",
      "kvRemove": "Remove this entry",
      "fCwdHint": "Only needed when the command uses a relative path",
      "envHint": "Values whose name contains KEY / TOKEN / SECRET are masked; leave them untouched to keep the originals.",
      "preview": "What will be written (preview)",
      "saving": "Saving…",
      "loadFail": "Load failed — click “Rescan” above to retry",
      "selNone": "Tick the entries you want to adopt first",
      "toastDismiss": "Click to dismiss",
      "fUrlHint": "Must start with http:// or https://",
      "kvKeyHint": "No spaces or = in the name part",
      "vNameReq": "Server name is required",
      "vNameRule": "Server name: letters, digits, - and _ only (max 32 chars), e.g. filesystem",
      "vNameDup": "DSH already has a server with this name — pick another",
      "vCmdReq": "Local command requires the “Command” field, e.g. npx",
      "vCmdSpace": "Put only the first word in “Command”; the rest belongs in “Arguments” (or use paste-detect above)",
      "vUrlReq": "Remote transport requires a URL",
      "vUrlRule": "URL must start with http:// or https://",
      "vEnvLine": "Write each line as NAME=value, e.g. API_TOKEN=abc",
      "vEnvKey": "The name part cannot contain spaces",
      "vFixCount": "%n field(s) need fixing — highlighted in red"
    };

    // ── 小工具 ──────────────────────────────────────────────────────────────
    function cssUrl(path) {
      return API + path;
    }

    // 自检结果说人话：整段 JSON 又长又难读，摘要只看三件事——
    // yaml 能不能解析（冷启动会不会崩）、客户端包齐不齐（侧栏条目出不来）、DSH 里有几行。
    function yesNo(v) {
      return v ? "✓" : "✗";
    }

    function selftestSummary(st, translate) {
      var T = typeof translate === "function" ? translate : function (k) { return k; };
      var y = (st && st.yaml) || {};
      var r = y.resolved || {};
      var c = (st && st.client) || {};
      var rows = (st && st.dshRows) || [];
      // 接口是旧的（进程没重启）≠ 插件坏了，别报成一堆 ✗ 吓人
      if (!st || (st.yaml === undefined && st.client === undefined)) return T("stStale");
      return T("stYaml") + " js-yaml " + (r.version || "?") + " " + (y.ok ? "OK" : "FAIL")
        + "  |  " + T("stBundle") + " " + yesNo(c.installed) + " / bundles " + yesNo(c.listedInBundles) + " / client.js " + yesNo(c.clientFileExists)
        + (c.manifest && c.manifest.platform ? " (" + c.manifest.platform + ")" : "")
        + "  |  " + T("stRows") + " " + rows.length;
    }

    function parseMap(text) {
      var out = {};
      String(text || "").split("\n").forEach(function (line) {
        var idx = line.indexOf("=");
        if (idx < 1) return;
        out[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
      });
      return out;
    }

    function formatMap(map) {
      return Object.keys(map || {}).map(function (key) { return key + "=" + map[key]; }).join("\n");
    }

    function parseList(text) {
      return String(text || "").split("\n").map(function (line) { return line.trim(); }).filter(function (line) { return line !== ""; });
    }

    /**
     * 把整行命令拆成 [命令, 参数...]：尊重双引号/单引号（引号内的空格不拆）。
     * 新手最常干的事就是从文档里复制一整行 `npx -y @scope/pkg --flag "带 空格 的路径"`，
     * 让他们自己分「命令」和「每行一个参数」纯属折磨。
     */
    function splitCommandLine(line) {
      var out = [];
      var cur = "";
      var quote = null;
      var text = String(line || "").trim();
      for (var i = 0; i < text.length; i += 1) {
        var ch = text[i];
        if (quote !== null) {
          if (ch === quote) quote = null;
          else cur += ch;
        } else if (ch === '"' || ch === "'") {
          quote = ch;
        } else if (ch === " " || ch === "\t") {
          if (cur !== "") { out.push(cur); cur = ""; }
        } else {
          cur += ch;
        }
      }
      if (cur !== "") out.push(cur);
      return out;
    }

    function targetOf(server) {
      if (server.transport === "stdio") {
        return [server.command].concat(server.args || []).filter(function (x) { return x !== ""; }).join(" ");
      }
      return server.url || "";
    }

    // ── args 行编辑：数组是唯一事实来源 ──
    // 旧版存 join 后的文本，concat+join 会把空行吞掉——「加一个参数」按钮没反应的根源。
    function addArgRow(rows) {
      return (rows || []).concat([""]);
    }
    function setArgRow(rows, index, value) {
      var next = (rows || []).slice();
      next[index] = value;
      return next;
    }
    function delArgRow(rows, index) {
      var next = (rows || []).slice();
      next.splice(index, 1);
      return next;
    }

    // K=V 文本逐行校验：返回 i18n key 或 null。
    // 缺 = 的行会被 parseMap 静默丢弃（数据凭空消失），所以提前拦；掩码值只查名字部分，不会误伤。
    function checkMapText(text) {
      var lines = String(text || "").split("\n");
      for (var i = 0; i < lines.length; i += 1) {
        var line = lines[i].trim();
        if (line === "") continue;
        var idx = line.indexOf("=");
        if (idx < 1) return "vEnvLine";
        if (/\s/.test(line.slice(0, idx))) return "vEnvKey";
      }
      return null;
    }

    // 表单校验：与服务端 dshAdd 同一口径（服务名 /^[A-Za-z0-9_-]{1,32}$/、stdio 必填 command、远程必填 url）。
    // strictName=false（写回别人工具的配置）时只要求名字非空——别的平台命名规则更宽。
    // 返回 { 字段: 提示文案 }；空对象 = 通过。translate 用来把 key 换成人话。
    function validateServerForm(form, opts, translate) {
      var T = typeof translate === "function" ? translate : function (k) { return k; };
      var o = opts || {};
      var errors = {};
      var name = String(form.serverName || "").trim();
      if (name === "") {
        errors.serverName = T("vNameReq");
      } else if (o.strictName !== false) {
        if (!/^[A-Za-z0-9_-]{1,32}$/.test(name)) {
          errors.serverName = T("vNameRule");
        } else if (name !== o.selfName && Object.prototype.toString.call(o.existingNames) === "[object Array]" && o.existingNames.indexOf(name) !== -1) {
          errors.serverName = T("vNameDup");
        }
      }
      if ((form.transport || "stdio") === "stdio") {
        var cmd = String(form.command || "").trim();
        if (cmd === "") {
          errors.command = T("vCmdReq");
        } else if (/\s/.test(cmd)) {
          errors.command = T("vCmdSpace");
        }
      } else {
        var url = String(form.url || "").trim();
        if (url === "") {
          errors.url = T("vUrlReq");
        } else if (!/^https?:\/\//i.test(url)) {
          errors.url = T("vUrlRule");
        }
      }
      var envBad = checkMapText(form.envText);
      if (envBad !== null) errors.env = T(envBad);
      var headBad = checkMapText(form.headersText);
      if (headBad !== null) errors.headers = T(headBad);
      return errors;
    }

    function formFromServer(server) {
      var s = server || {};
      return {
        serverName: s.serverName || "",
        transport: s.transport || "stdio",
        command: s.command || "",
        // args 存数组：每个元素就是界面上的一行，空行不再被 join 吞掉。
        args: (s.args || []).slice(),
        cwd: s.cwd || "",
        url: s.url || "",
        envText: formatMap(s.env || {}),
        headersText: formatMap(s.headers || {})
      };
    }

    function payloadFromForm(form) {
      var payload = {
        serverName: String(form.serverName || "").trim(),
        transport: form.transport || "stdio",
        command: String(form.command || "").trim(),
        args: (form.args || []).map(function (item) { return String(item == null ? "" : item).trim(); }).filter(function (item) { return item !== ""; }),
        cwd: String(form.cwd || "").trim(),
        url: String(form.url || "").trim(),
        env: parseMap(form.envText),
        headers: parseMap(form.headersText)
      };
      // 掩码值原样送回：服务端会用磁盘上的真实值还原，不会被 •••• 覆盖。
      return payload;
    }

    // DSH 受管行的 id 由服务名派生（mcp-<名字>）。旧宿主进程没重启时 /scan 可能不带 id，
    // 客户端按同一规则兜底，保证停用/删除/编辑在重启前也能用。
    function dshIdOf(server) {
      if (server && server.id) return server.id;
      if (server && server.inDsh && server.serverName) return "mcp-" + server.serverName;
      return null;
    }

    // 方案C：状态筛选 + 关键词搜索。纯函数，冒烟测试直接调。
    function filterRows(rows, query, status) {
      var q = String(query == null ? "" : query).trim().toLowerCase();
      return (rows || []).filter(function (r) {
        if (status && status !== "all" && r.status !== status) return false;
        if (q === "") return true;
        var hay = (String(r.serverName || "") + " " + String(r.command || r.url || "")).toLowerCase();
        return hay.indexOf(q) !== -1;
      });
    }

    function countByStatus(rows) {
      var c = { total: 0, nu: 0, changed: 0, gone: 0, same: 0 };
      (rows || []).forEach(function (r) {
        c.total += 1;
        if (r.status === "new") c.nu += 1;
        else if (r.status === "changed") c.changed += 1;
        else if (r.status === "gone") c.gone += 1;
        else c.same += 1;
      });
      return c;
    }

    // 方案A：分组默认折叠；有异常（新/变/缺）的组默认展开；筛选时全部强制展开，别把结果藏起来。
    function isGroupOpen(openMap, group, counts, filtering) {
      if (filtering) return true;
      if (openMap && Object.prototype.hasOwnProperty.call(openMap, group.id)) return !!openMap[group.id];
      return counts.nu > 0 || counts.changed > 0 || counts.gone > 0 || counts.total === 0;
    }

    // ── 主题自适应语义色 ────────────────────────────────────────────────────
    // 深色底上用 #137a3d/#b52a21 这类「亮底色」会糊成一片；按明暗各给一组。
    // matchMedia 必须特性守卫：无 DOM 环境的冒烟桩里没有它。
    var isDark = false;
    try {
      isDark = !!(window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);
    } catch (err) {
      isDark = false;
    }
    function statusInk(kind) {
      if (kind === "ok") return isDark ? "#5ad48c" : "#137a3d";
      if (kind === "warn") return isDark ? "#e8b352" : "#a35b00";
      if (kind === "bad") return isDark ? "#ff7b72" : "#b52a21";
      return "inherit";
    }

    // ── 样式 ────────────────────────────────────────────────────────────────
    var S = {
      wrap: { padding: "16px 18px", maxWidth: "1200px", display: "flex", flexDirection: "column", gap: "16px", height: "100%", overflowY: "auto", boxSizing: "border-box" },
      h2: { margin: 0, fontSize: "18px", fontWeight: 600 },
      small: { fontSize: "11px", color: "rgba(128,128,128,0.95)", overflowWrap: "anywhere" },
      toolbar: { display: "flex", flexWrap: "wrap", gap: "8px", alignItems: "center" },
      summary: { display: "flex", flexWrap: "wrap", gap: "6px", fontSize: "12px", alignItems: "center" },
      chip: { padding: "2px 8px", borderRadius: "999px", fontSize: "11px", border: "1px solid rgba(128,128,128,0.35)" },
      section: { border: "1px solid rgba(128,128,128,0.28)", borderRadius: "8px", padding: "10px 12px", marginBottom: "14px" },
      h3: { margin: "0 0 8px 0", fontSize: "13px", fontWeight: 600 },
      row: { display: "flex", gap: "8px", alignItems: "center", padding: "6px 0", borderTop: "1px solid rgba(128,128,128,0.14)", flexWrap: "wrap" },
      rowName: { fontWeight: 600, fontSize: "13px" },
      btn: { padding: "3px 9px", borderRadius: "6px", fontSize: "12px", cursor: "pointer", border: "1px solid rgba(128,128,128,0.45)", background: "transparent", color: "inherit" },
      btnPrimary: { padding: "3px 9px", borderRadius: "6px", fontSize: "12px", cursor: "pointer", border: "1px solid rgba(128,128,128,0.45)", background: "rgba(128,128,128,0.18)", color: "inherit", fontWeight: 600 },
      grid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "8px" },
      field: { display: "flex", flexDirection: "column", gap: "3px" },
      label: { fontSize: "11px", color: "rgba(128,128,128,0.95)" },
      hint: { fontSize: "11px", color: "rgba(128,128,128,0.95)", margin: 0, lineHeight: 1.5 },
      input: { padding: "4px 7px", borderRadius: "6px", fontSize: "12px", fontFamily: "inherit", border: "1px solid rgba(128,128,128,0.45)", background: "transparent", color: "inherit" },
      textarea: { padding: "4px 7px", borderRadius: "6px", fontSize: "11px", minHeight: "54px", resize: "vertical", fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace", border: "1px solid rgba(128,128,128,0.45)", background: "transparent", color: "inherit" },
      notice: { fontSize: "12px", padding: "8px 10px", border: "1px solid rgba(128,128,128,0.35)", borderRadius: "8px", whiteSpace: "pre-wrap" },
      error: { fontSize: "12px", padding: "8px 10px", border: "1px solid " + statusInk("bad"), borderRadius: "8px", color: statusInk("bad"), whiteSpace: "pre-wrap" },
      // ── 气泡提示（toast）：错误/成功弹悬浮气泡，自动消失、点一下也能关 ──
      toastWrap: { position: "fixed", top: "18px", left: "50%", transform: "translateX(-50%)", zIndex: 1200, display: "flex", flexDirection: "column", gap: "8px", maxWidth: "min(92vw, 480px)", alignItems: "stretch" },
      toast: { display: "flex", gap: "8px", alignItems: "flex-start", padding: "9px 12px", borderRadius: "10px", border: "1px solid rgba(128,128,128,0.45)", background: "Canvas", color: "CanvasText", boxShadow: "0 6px 20px rgba(0,0,0,0.25)", fontSize: "12px", lineHeight: 1.5, whiteSpace: "pre-wrap", wordBreak: "break-word", cursor: "pointer" },
      toastErr: { borderColor: statusInk("bad"), borderLeft: "3px solid " + statusInk("bad") },
      toastOk: { borderColor: statusInk("ok"), borderLeft: "3px solid " + statusInk("ok") },
      toastX: { marginLeft: "auto", opacity: 0.65, padding: "0 2px", flex: "0 0 auto" },
      fieldErr: { fontSize: "11px", color: statusInk("bad"), margin: 0, lineHeight: 1.5 },
      inputBad: { borderColor: statusInk("bad") },
      // ── 弹窗 ──
      overlay: { position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "6vh 12px 24px", boxSizing: "border-box" },
      dialog: { width: "100%", maxWidth: "620px", maxHeight: "88vh", overflowY: "auto", background: "Canvas", color: "CanvasText", border: "1px solid rgba(128,128,128,0.45)", borderRadius: "12px", padding: "16px 18px", boxShadow: "0 12px 40px rgba(0,0,0,0.35)", boxSizing: "border-box" },
      modalHead: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px", fontSize: "15px", fontWeight: 600 },
      btnX: { padding: "0 8px", borderRadius: "6px", fontSize: "16px", cursor: "pointer", border: "1px solid rgba(128,128,128,0.45)", background: "transparent", color: "inherit", lineHeight: "22px" },
      grp: { border: "1px solid rgba(128,128,128,0.3)", borderRadius: "8px", padding: "10px 12px", margin: "0 0 12px" },
      legend: { fontSize: "12px", fontWeight: 600, padding: "0 6px" },
      pasteRow: { display: "flex", gap: "6px", alignItems: "center", margin: "0 0 12px" },
      kvRow: { display: "flex", gap: "6px", alignItems: "center", marginBottom: "6px" },
      preBox: { margin: 0, padding: "8px 10px", borderRadius: "8px", border: "1px solid rgba(128,128,128,0.3)", background: "rgba(128,128,128,0.08)", fontSize: "11px", fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace", whiteSpace: "pre-wrap", wordBreak: "break-all", maxHeight: "160px", overflowY: "auto" },
      saveBar: { display: "flex", gap: "8px", justifyContent: "flex-end", marginTop: "14px", alignItems: "center" }
    };

    var toastSeq = 0;

    // ── 图标（内联 SVG，不依赖图标库） ───────────────────────────────────────
    function GlobalGlyph(props) {
      var size = props && props.size ? props.size : 18;
      return h("svg", {
        width: size,
        height: size,
        viewBox: "0 0 24 24",
        fill: "none",
        stroke: "currentColor",
        strokeWidth: "1.6",
        strokeLinecap: "round",
        strokeLinejoin: "round",
        "aria-hidden": "true",
        focusable: "false"
      },
      h("circle", { cx: 12, cy: 12, r: 9 }),
      h("path", { d: "M3 12h18" }),
      h("path", { d: "M12 3c3 3.6 3 14.4 0 18" }),
      h("path", { d: "M12 3c-3 3.6-3 14.4 0 18" }));
    }

    // ── 弹窗壳：Esc / 点遮罩关闭 ────────────────────────────────────────────
    function Modal(props) {
      useEffect(function () {
        function onKey(event) {
          if (event && event.key === "Escape") props.onClose();
        }
        window.addEventListener("keydown", onKey);
        return function () { window.removeEventListener("keydown", onKey); };
      }, [props.onClose]);
      return h("div", {
        style: S.overlay,
        onClick: function (event) {
          if (event.target === event.currentTarget) props.onClose();
        }
      }, h("div", {
        style: S.dialog,
        role: "dialog",
        "aria-modal": "true",
        tabIndex: -1,
        ref: function (el) {
          // 打开即聚焦：否则 Esc 前 Tab 会跑到面板背后的页面元素上。
          if (el && typeof el.focus === "function") { try { el.focus(); } catch (err) { /* 忽略 */ } }
        }
      }, props.children));
    }

    // ── K=V 行编辑器：替代"每行一个 K=V"的裸文本框 ──────────────────────────
    function MapRows(props) {
      var initial = parseMap(props.text);
      var rowsState = useState(Object.keys(initial).map(function (key) { return { k: key, v: initial[key] }; }));
      var rows = rowsState[0];
      var setRows = rowsState[1];
      function commit(next) {
        setRows(next);
        var map = {};
        next.forEach(function (item) {
          var key = String(item.k || "").trim();
          if (key !== "") map[key] = item.v;
        });
        props.onChange(formatMap(map));
      }
      return h("div", null,
        rows.map(function (item, index) {
          return h("div", { style: S.kvRow, key: index },
            h("input", {
              style: Object.assign({}, S.input, { flex: "0 0 38%" }),
              placeholder: "API_TOKEN",
              value: item.k,
              onChange: function (event) {
                var next = rows.slice();
                next[index] = { k: event.target.value, v: item.v };
                commit(next);
              }
            }),
            h("input", {
              style: Object.assign({}, S.input, { flex: "1 1 auto" }),
              placeholder: props.valuePh || "",
              value: item.v,
              onChange: function (event) {
                var next = rows.slice();
                next[index] = { k: item.k, v: event.target.value };
                commit(next);
              }
            }),
            h("button", {
              style: S.btn,
              title: props.removeLabel,
              onClick: function () {
                var next = rows.slice();
                next.splice(index, 1);
                commit(next);
              }
            }, "×"));
        }),
        h("button", { style: S.btn, onClick: function () { commit(rows.concat([{ k: "", v: "" }])); } }, props.addLabel));
    }

    // ── 表单（弹窗内容）：分组 + 按类型显隐 + 整行粘贴识别 + 实时预览 ────────
    function ServerForm(props) {
      var t = props.t;
      var form = props.form;
      var errors = props.errors || {};
      function bad(fieldName) { return errors[fieldName] ? S.inputBad : null; }
      function patch(next) {
        props.setForm(Object.assign({}, form, next));
      }
      var isStdio = form.transport === "stdio";
      var pasteState = useState("");
      var paste = pasteState[0];
      var setPaste = pasteState[1];

      // 「识别」：整行 URL → 自动切远程；整行命令 → 拆成 命令 + 参数
      function applyPaste() {
        var line = String(paste || "").trim();
        if (line === "") return;
        if (/^https?:\/\//iu.test(line)) {
          patch({ transport: "streamable-http", url: line });
        } else {
          var parts = splitCommandLine(line);
          if (parts.length === 0) return;
          patch({ transport: "stdio", command: parts[0], args: parts.slice(1) });
        }
        setPaste("");
      }

      var argRows = form.args || [];
      function setArg(index, value) { patch({ args: setArgRow(form.args, index, value) }); }
      function delArg(index) { patch({ args: delArgRow(form.args, index) }); }

      function field(label, control, hintText, errText) {
        return h("label", { style: S.field },
          h("span", { style: S.label }, label),
          control,
          errText ? h("p", { style: S.fieldErr }, errText) : null,
          hintText ? h("p", { style: S.hint }, hintText) : null);
      }

      var preview = payloadFromForm(form);
      var previewObj = { serverName: preview.serverName, transport: preview.transport };
      if (isStdio) {
        previewObj.command = preview.command;
        if (preview.args.length > 0) previewObj.args = preview.args;
        if (Object.keys(preview.env).length > 0) previewObj.env = preview.env;
        if (preview.cwd !== "") previewObj.cwd = preview.cwd;
      } else {
        previewObj.url = preview.url;
        if (Object.keys(preview.headers).length > 0) previewObj.headers = preview.headers;
      }

      return h("div", null,
        h("div", { style: S.modalHead },
          h("span", null, props.title),
          h("button", { style: S.btnX, onClick: props.onCancel, "aria-label": t("dshCancel") }, "×")),

        // ── 第 1 步：基本信息 ──
        h("fieldset", { style: S.grp },
          h("legend", { style: S.legend }, t("grpBasic")),
          h("div", { style: { display: "flex", flexDirection: "column", gap: "10px" } },
            field(t("fName"),
              h("input", {
                style: Object.assign({}, S.input, bad("serverName")),
                placeholder: "filesystem",
                value: form.serverName,
                onChange: function (event) { patch({ serverName: event.target.value }); }
              }),
              t("fNameHint"),
              errors.serverName),
            field(t("fTransport"),
              h("select", {
                style: S.input,
                value: form.transport,
                onChange: function (event) { patch({ transport: event.target.value }); }
              },
              h("option", { value: "stdio" }, t("tpStdio")),
              h("option", { value: "streamable-http" }, t("tpHttp")),
              h("option", { value: "sse" }, t("tpSse"))),
              t("fTransportHint")))),

        // ── 整行粘贴识别（新手最快路径） ──
        h("div", { style: S.pasteRow },
          h("input", {
            style: Object.assign({}, S.input, { flex: "1 1 auto", fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace" }),
            placeholder: "npx -y @modelcontextprotocol/server-filesystem C:\\data",
            value: paste,
            onChange: function (event) { setPaste(event.target.value); }
          }),
          h("button", { style: S.btnPrimary, onClick: applyPaste }, t("pasteBtn"))),
        h("p", { style: Object.assign({}, S.hint, { marginTop: "-6px", marginBottom: "12px" }) }, t("pasteLine")),

        // ── 第 2 步：本地命令 或 远程地址 ──
        isStdio ? h("fieldset", { style: S.grp },
          h("legend", { style: S.legend }, t("grpLaunch")),
          h("div", { style: { display: "flex", flexDirection: "column", gap: "10px" } },
            field(t("fCommand"),
              h("input", {
                style: Object.assign({}, S.input, { fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace" }, bad("command")),
                placeholder: "npx",
                value: form.command,
                onChange: function (event) { patch({ command: event.target.value }); }
              }),
              t("fCommandHint"),
              errors.command),
            h("div", { style: S.field },
              h("span", { style: S.label }, t("fArgs")),
              argRows.map(function (line, index) {
                return h("div", { style: S.kvRow, key: index },
                  h("input", {
                    style: Object.assign({}, S.input, { flex: "1 1 auto", fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace" }),
                    placeholder: index === 0 ? "-y" : "",
                    value: line,
                    onChange: function (event) { setArg(index, event.target.value); }
                  }),
                  h("button", { style: S.btn, title: t("argRemove"), onClick: function () { delArg(index); } }, "×"));
              }),
              h("div", null,
                h("button", { style: S.btn, onClick: function () { patch({ args: addArgRow(form.args) }); } }, t("argAdd"))
              )
            )
          )
        ) : h("fieldset", { style: S.grp },
          h("legend", { style: S.legend }, t("grpRemote")),
          field(t("fUrl"),
            h("input", {
              style: Object.assign({}, S.input, { fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace" }, bad("url")),
              placeholder: "https://example.com/mcp",
              value: form.url,
              onChange: function (event) { patch({ url: event.target.value }); }
            }),
            t("fUrlHint"),
            errors.url)),

        // ── 第 3 步：环境变量 / 请求头（K=V 行编辑） ──
        isStdio ? h("fieldset", { style: S.grp },
          h("legend", { style: S.legend }, t("grpEnv")),
          h(MapRows, {
            text: form.envText,
            valuePh: "value",
            addLabel: t("kvAdd"),
            removeLabel: t("kvRemove"),
            onChange: function (value) { patch({ envText: value }); }
          }),
          errors.env ? h("p", { style: S.fieldErr }, errors.env) : null,
          h("p", { style: S.hint }, t("kvKeyHint")),
          h("p", { style: S.hint }, t("envHint")),
          h("p", { style: S.hint }, t("noteMasked"))
        ) : h("fieldset", { style: S.grp },
          h("legend", { style: S.legend }, t("grpHeaders")),
          h(MapRows, {
            text: form.headersText,
            valuePh: "value",
            addLabel: t("kvAdd"),
            removeLabel: t("kvRemove"),
            onChange: function (value) { patch({ headersText: value }); }
          }),
          errors.headers ? h("p", { style: S.fieldErr }, errors.headers) : null,
          h("p", { style: S.hint }, t("kvKeyHint")),
          h("p", { style: S.hint }, t("noteMasked"))),

        // ── 高级 ──
        h("details", { style: { marginBottom: "4px" } },
          h("summary", { style: Object.assign({}, S.label, { cursor: "pointer" }) }, t("grpAdvanced")),
          isStdio ? h("div", { style: { paddingTop: "8px" } },
            field(t("fCwd"),
              h("input", {
                style: Object.assign({}, S.input, { fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace" }),
                placeholder: "C:\\tools\\my-server",
                value: form.cwd,
                onChange: function (event) { patch({ cwd: event.target.value }); }
              }),
              t("fCwdHint")))
          : h("p", { style: S.hint }, "—")),

        // ── 实时预览 ──
        h("div", { style: S.field },
          h("span", { style: S.label }, t("preview")),
          h("pre", { style: S.preBox }, JSON.stringify(previewObj, null, 2))),

        // ── 底部按钮 ──
        h("div", { style: S.saveBar },
          h("button", { style: S.btn, disabled: props.busy, onClick: props.onCancel }, t("dshCancel")),
          h("button", { style: S.btnPrimary, disabled: props.busy, onClick: props.onSave }, props.busy ? t("saving") : t("dshSave"))));
    }

    function ExternalRow(props) {
      var t = props.t;
      var server = props.server;
      var checked = !!props.selected;
      var canPush = server.pushBack === true;
      return h("div", { style: S.row },
        h("input", {
          type: "checkbox",
          checked: checked,
          disabled: props.busy || server.inDsh || server.status === "gone",
          onChange: function () { props.onToggleSelect(server.key); }
        }),
        h("span", { style: S.rowName }, server.serverName),
        h("span", { style: Object.assign({}, S.chip, {
          color: server.status === "new" ? statusInk("ok") : server.status === "changed" ? statusInk("warn") : server.status === "gone" ? statusInk("bad") : "inherit"
        }), title: server.status === "gone" ? t("goneHint") : undefined },
        server.status === "new" ? t("statusNew") : server.status === "changed" ? t("statusChanged") : server.status === "gone" ? t("statusGone") : t("statusSame")),
        h("span", { style: S.small, key: "target" }, targetOf(server)),
        server.inDsh ? h("span", { style: S.chip, key: "d" }, t("sumInDsh")) : null,
        server.duplicateOf ? h("span", { style: S.small, key: "dup" }, t("noteDuplicate") + ": " + server.duplicateOf.join(", ")) : null,
        server.suggestedName && server.suggestedName !== server.serverName ? h("span", { style: S.small, key: "ren" }, t("noteRenamed") + ": " + server.suggestedName) : null,
        h("span", { style: { display: "flex", gap: "6px", marginLeft: "auto" }, key: "a" },
          server.status === "gone" ? h("button", { style: S.btn, disabled: props.busy, onClick: function () { props.onForget(server); } }, t("forgetMark")) : null,
          !server.inDsh && server.status !== "gone" ? h("button", { style: S.btnPrimary, disabled: props.busy, onClick: function () { props.onAdopt(server); } }, t("adopt")) : null,
          h("button", { style: S.btn, disabled: props.busy, onClick: function () { props.onEdit(server); } }, t("editForm")),
          canPush ? h("button", { style: S.btn, disabled: props.busy, onClick: function () { props.onPush(server); } }, t("pushUpsert")) : null,
          canPush && server.status !== "gone" ? h("button", { style: S.btn, disabled: props.busy, onClick: function () { props.onPushRemove(server); } }, t("pushRemove")) : null,
          h("button", { style: S.btn, disabled: props.busy, onClick: function () { props.onPushBack(server, !canPush); } }, canPush ? t("pushBackDeny") : t("pushBackAllow"))));
    }

    function DshRow(props) {
      var t = props.t;
      var server = props.server;
      var rid = dshIdOf(server);
      return h("div", { style: S.row },
        h("span", { style: S.rowName }, server.serverName),
        rid ? h("span", { style: S.small, key: "id" }, rid) : null,
        h("span", { style: S.small, key: "t" }, targetOf(server)),
        server.disabled ? h("span", { style: Object.assign({}, S.chip, { color: statusInk("bad") }), key: "d" }, t("sumDisabled")) : null,
        h("span", { style: { display: "flex", gap: "6px", marginLeft: "auto" }, key: "a" },
          h("button", { style: S.btn, disabled: props.busy, onClick: function () { props.onEdit(server); } }, t("dshEdit")),
          h("button", { style: S.btn, disabled: props.busy, onClick: function () { props.onToggle(server); } }, server.disabled ? t("dshToggleOff") : t("dshToggleOn")),
          h("button", { style: S.btn, disabled: props.busy, onClick: function () { props.onRemove(server); } }, t("dshRemove"))));
    }

    // ── 主面板 ──────────────────────────────────────────────────────────────
    function MCPGlobalPanel(props) {
      var t = props.t;
      var dataState = useState(null);
      var data = dataState[0];
      var setData = dataState[1];
      var busyState = useState(false);
      var busy = busyState[0];
      var setBusy = busyState[1];
      var toastState = useState([]);
      var toasts = toastState[0];
      var setToasts = toastState[1];
      var feState = useState({});
      var formErrors = feState[0];
      var setFormErrors = feState[1];

      // 气泡提示：4.2 秒自动消失，点一下也能关；旧的 setError/setNotice 调用点全部改道到这里。
      function pushToast(kind, text) {
        toastSeq += 1;
        var id = toastSeq;
        setToasts(function (list) { return list.concat([{ id: id, kind: kind, text: text }]); });
        setTimeout(function () {
          setToasts(function (list) { return list.filter(function (x) { return x.id !== id; }); });
        }, 4200);
      }
      function dismissToast(id) {
        setToasts(function (list) { return list.filter(function (x) { return x.id !== id; }); });
      }
      function setError(msg) { if (msg) pushToast("err", String(msg)); }
      function setNotice(msg) { if (msg) pushToast("ok", String(msg)); }
      var selState = useState({});
      var sel = selState[0];
      var setSel = selState[1];
      var editState = useState(null);
      var edit = editState[0];
      var setEdit = editState[1];
      var addState = useState(false);
      var adding = addState[0];
      var setAdding = addState[1];
      var srcState = useState(null);
      var sourcesView = srcState[0];
      var setSourcesView = srcState[1];
      var selfState = useState(null);
      var selftest = selfState[0];
      var setSelftest = selfState[1];
      // 方案A+C：搜索词、状态筛选、分组折叠状态（都只在客户端，不动账本）。
      var queryState = useState("");
      var query = queryState[0];
      var setQuery = queryState[1];
      var filterState = useState("all");
      var statusFilter = filterState[0];
      var setStatusFilter = filterState[1];
      var openState = useState({});
      var openMap = openState[0];
      var setOpenMap = openState[1];
      function toggleGroup(id, open) {
        var next = Object.assign({}, openMap);
        next[id] = open;
        setOpenMap(next);
      }

      var load = useCallback(function (refresh) {
        setBusy(true);
        setError("");
        return getJson("/scan" + (refresh ? "?refresh=1" : "")).then(function (body) {
          setData(body);
          setSel({});
          setBusy(false);
        }).catch(function (e) {
          setError(t("loadFail") + "：" + String(e && e.message ? e.message : e));
          setBusy(false);
        });
      }, []);

      useEffect(function () { load(false); }, [load]);

      function run(label, action) {
        setBusy(true);
        setError("");
        setNotice("");
        return action().then(function (result) {
          setNotice(label + " ✓" + (result && result.message ? "：" + result.message : ""));
          return load(true);
        }).catch(function (e) {
          var msg = String(e && e.message ? e.message : e);
          // 新路由在旧宿主进程里不存在：直接说人话，别让「未知接口」当谜语。
          if (msg.indexOf("未知接口") !== -1) msg += "（当前 DSH 进程还是旧代码，完整重启一次再试）";
          setError(label + " ✗ " + msg);
        }).then(function () {
          setBusy(false);
        });
      }

      var servers = (data && data.servers) || [];
      var summary = (data && data.summary) || {};
      var groups = useMemo(function () {
        var byId = {};
        var order = [];
        servers.forEach(function (server) {
          var id = server.sourceId || "?";
          if (!byId[id]) {
            byId[id] = { id: id, label: server.sourceLabel || id, file: server.sourceFile || server.file, error: server.sourceError, list: [] };
            order.push(id);
          }
          byId[id].list.push(server);
        });
        return order.map(function (id) { return byId[id]; });
      }, [servers]);
      var dshGroup = groups.filter(function (g) { return g.id === "dsh"; })[0] || { id: "dsh", label: "DSH", list: [] };
      var otherGroups = groups.filter(function (g) { return g.id !== "dsh"; });
      var newKeys = servers.filter(function (s) { return !s.inDsh && s.status === "new"; }).map(function (s) { return s.key; });

      function toggleSelect(key) {
        var next = {};
        Object.keys(sel).forEach(function (k) { next[k] = sel[k]; });
        next[key] = !next[key];
        setSel(next);
      }

      function selectAllNew() {
        var next = {};
        newKeys.forEach(function (k) { next[k] = true; });
        setSel(next);
      }

      var selKeys = Object.keys(sel).filter(function (k) { return sel[k]; });

      function adoptKeys(keys) {
        if (keys.length === 0) { setError(t("selNone")); return Promise.resolve(); }
        return run(t("adoptSelected") + " " + keys.length + " " + t("sumTotal"), function () {
          return postJson("/adopt", { keys: keys }).then(function (out) {
            return { message: "created=" + ((out.created || []).length) + " skipped=" + ((out.skipped || []).length) };
          });
        });
      }

      var formState = useState(formFromServer({}));
      var form = formState[0];
      var setForm = formState[1];

      function openEdit(server) {
        setEdit(server);
        setAdding(false);
        setFormErrors({});
        setForm(formFromServer(server));
      }

      function openAdd() {
        setEdit(null);
        setAdding(true);
        setFormErrors({});
        setForm(formFromServer({}));
      }

      function cancelEdit() {
        setEdit(null);
        setAdding(false);
        setFormErrors({});
      }

      // 提交前先过一遍客户端校验：错误就地标红 + 气泡汇总，不再把请求发出去等服务端骂回来。
      function validateCurrentForm(strictName) {
        var errors = validateServerForm(form, {
          strictName: strictName,
          existingNames: dshGroup.list.map(function (s) { return s.serverName; }),
          selfName: edit ? edit.serverName : undefined
        }, t);
        setFormErrors(errors);
        var count = Object.keys(errors).length;
        if (count > 0) pushToast("err", t("vFixCount").replace("%n", count));
        return count === 0;
      }

      function submitEdit() {
        if (!edit) return Promise.resolve();
        var editId = dshIdOf(edit);
        // 写回 DSH 用严格命名规则；写回别人工具的配置沿用对方的宽松规则。
        if (!validateCurrentForm(!!editId)) return Promise.resolve();
        var payload = payloadFromForm(form);
        if (editId) {
          return run(t("dshSave"), function () { return postJson("/dsh/update", { id: editId, server: payload }); });
        }
        // 写回别人工具的配置是危险动作：必须显式确认，并且不再用 force 绕过服务端的逐条授权。
        if (!window.confirm(t("confirmPush") + " " + (edit.sourceLabel || edit.label || "") + " → " + payload.serverName + "？")) return;
        return run(t("pushUpsert") + " → " + (edit.sourceLabel || edit.label || ""), function () {
          return postJson("/push", { key: edit.key, action: "upsert", server: payload });
        });
      }

      function submitAdd() {
        if (!validateCurrentForm(true)) return Promise.resolve();
        var payload = payloadFromForm(form);
        return run(t("dshAdd"), function () { return postJson("/dsh/add", { server: payload }); });
      }

      function removeDsh(server) {
        if (!window.confirm(t("dshRemove") + " " + server.serverName + "?")) return;
        return run(t("dshRemove"), function () { return postJson("/dsh/remove", { id: dshIdOf(server) }); });
      }

      function toggleDsh(server) {
        return run(server.disabled ? t("dshToggleOff") : t("dshToggleOn"), function () {
          return postJson("/dsh/toggle", { id: dshIdOf(server), disabled: !server.disabled });
        });
      }

      // 「缺」标记只是账本里的快照残留：清除它只删我们自己的账本条目，不碰任何工具的配置文件。
      function forgetGone(server) {
        return run(t("forgetMark"), function () { return postJson("/forget", { key: server.key }); });
      }

      function pushRemove(server) {
        // 危险动作：从别人工具的配置文件里删条目，先确认；不再带 force 绕过服务端授权。
        if (!window.confirm(t("pushRemove") + " " + server.sourceLabel + " → " + server.serverName + "？")) return;
        return run(t("pushRemove"), function () { return postJson("/push", { key: server.key, action: "remove" }); });
      }

      function setPushBackFor(server, enabled) {
        return run(enabled ? t("pushBackAllow") : t("pushBackDeny"), function () {
          return postJson("/pushback", { key: server.key, enabled: enabled });
        });
      }

      function runSelftest() {
        setBusy(true);
        setError("");
        return getJson("/selftest").then(function (body) {
          setSelftest(body);
          setBusy(false);
        }).catch(function (e) {
          setError(t("selftest") + " ✗ " + String(e && e.message ? e.message : e));
          setBusy(false);
        });
      }

      function summaryChip(label, value, color) {
        if (!value) return null;
        return h("span", { style: Object.assign({}, S.chip, color ? { color: color } : null) }, label + " " + value);
      }

      return h("div", { style: S.wrap },
        h("header", null,
          h("h2", { style: S.h2 }, t("title")),
          h("p", { style: S.small }, t("hint"))),

        h("div", { style: Object.assign({}, S.toastWrap, { pointerEvents: "none" }), role: "status" }, toasts.map(function (x) {
          return h("div", {
            key: x.id,
            style: Object.assign({}, S.toast, x.kind === "err" ? S.toastErr : S.toastOk, { pointerEvents: "auto" }),
            title: t("toastDismiss"),
            onClick: function () { dismissToast(x.id); }
          },
            h("span", null, x.text),
            h("span", { style: S.toastX }, "×"));
        })),

        h("div", { style: S.toolbar },
          h("button", { style: S.btnPrimary, disabled: busy, onClick: function () { load(true); } }, busy ? t("refreshing") : t("refresh")),
          h("button", { style: S.btn, disabled: busy, onClick: runSelftest }, t("selftest")),
          h("button", { style: S.btnPrimary, disabled: busy || selKeys.length === 0, onClick: function () { adoptKeys(selKeys); } }, t("adoptSelected") + (selKeys.length ? " (" + selKeys.length + ")" : "")),
          h("button", { style: S.btn, disabled: busy || newKeys.length === 0, onClick: selectAllNew }, t("selectAllNew")),
          h("button", { style: S.btn, disabled: busy || selKeys.length === 0, onClick: function () { setSel({}); } }, t("clearSel")),
          data && data.scannedAt ? h("span", { style: S.small }, t("scannedAt") + " " + new Date(data.scannedAt).toLocaleString()) : null),

        selftest ? h("div", { style: S.notice, title: JSON.stringify(selftest, null, 2) }, selftestSummary(selftest, t)) : null,

        data ? h("div", { style: S.summary },
          summaryChip(t("sumTotal"), summary.total),
          summaryChip(t("sumNew"), summary.new, statusInk("ok")),
          summaryChip(t("sumChanged"), summary.changed, statusInk("warn")),
          summaryChip(t("sumGone"), summary.gone, statusInk("bad")),
          summaryChip(t("sumSame"), summary.same),
          summaryChip(t("sumInDsh"), summary.inDsh),
          summaryChip(t("sumFiles"), summary.files),
          summaryChip(t("sumErrors"), summary.errors, summary.errors ? statusInk("bad") : undefined)
        ) : null,

        data && data.patchPath ? h("div", { style: S.small }, t("patch") + ": " + data.patchPath) : null,

        !data ? h("div", { style: S.small }, t("loading")) : null,
        data && servers.length === 0 ? h("div", { style: S.small }, t("empty")) : null,

        // ── DSH 侧 ──
        h("section", { style: S.section },
          h("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" } },
            h("h3", { style: Object.assign({}, S.h3, { marginBottom: 0 }) }, t("secDsh")),
            h("button", { style: S.btnPrimary, disabled: busy, onClick: openAdd }, t("dshAdd"))),
          dshGroup.list.map(function (server) {
            return h(DshRow, {
              key: dshIdOf(server) || server.key,
              t: t,
              server: server,
              busy: busy,
              onEdit: openEdit,
              onToggle: toggleDsh,
              onRemove: removeDsh
            });
          }),
          dshGroup.list.length === 0 ? h("div", { style: S.small }, t("empty")) : null),

        // ── 各工具（方案A：分组折叠 + 方案C：状态筛选/搜索） ──
        h("section", { style: S.section },
          h("div", { style: { display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap", marginBottom: "8px" } },
            h("h3", { style: Object.assign({}, S.h3, { marginBottom: 0 }) }, t("secTools")),
            ["all", "new", "changed", "gone", "same"].map(function (sf) {
              var active = statusFilter === sf;
              return h("button", {
                key: sf,
                type: "button",
                style: Object.assign({}, S.chip, { cursor: "pointer", background: active ? "rgba(122,167,255,0.28)" : "transparent", borderColor: active ? "#7aa7ff" : "rgba(128,128,128,0.35)", fontWeight: active ? 600 : 400, color: "inherit" }),
                onClick: function () { setStatusFilter(sf); }
              }, sf === "all" ? t("filterAll") : t(sf === "new" ? "statusNew" : sf === "changed" ? "statusChanged" : sf === "gone" ? "statusGone" : "statusSame"));
            }),
            h("input", {
              style: Object.assign({}, S.input, { marginLeft: "auto", width: "220px" }),
              value: query,
              placeholder: t("searchPh"),
              onChange: function (e) { setQuery(e && e.target ? String(e.target.value) : ""); }
            })),
          otherGroups.map(function (group) {
            var counts = countByStatus(group.list);
            var filtering = statusFilter !== "all" || String(query == null ? "" : query).trim() !== "";
            // 「缺」的行沉到每组末尾：活着的条目先露脸，消失的不挡路。
            var rows = filterRows(group.list, query, statusFilter).slice().sort(function (a, b) {
              return (a.status === "gone" ? 1 : 0) - (b.status === "gone" ? 1 : 0);
            });
            if (filtering && rows.length === 0) return null; // 筛选时没命中的组整个藏起来
            var isOpen = isGroupOpen(openMap, group, counts, filtering);
            return h("div", { key: group.id, style: { marginBottom: "10px" } },
              h("div", {
                style: { display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap", cursor: "pointer", userSelect: "none" },
                title: t("grpToggleHint"),
                role: "button",
                tabIndex: 0,
                "aria-expanded": isOpen,
                onClick: function () { toggleGroup(group.id, !isOpen); },
                onKeyDown: function (e) {
                  if (e && (e.key === "Enter" || e.key === " " || e.key === "Spacebar")) {
                    if (e.preventDefault) e.preventDefault();
                    toggleGroup(group.id, !isOpen);
                  }
                }
              },
                h("span", { style: { fontSize: "10px", width: "10px" }, key: "c" }, isOpen ? "▾" : "▸"),
                h("strong", { style: { fontSize: "12px" }, key: "l" }, group.label),
                h("span", { style: S.small, key: "n" }, counts.total + " " + t("sumTotal")),
                counts.nu > 0 ? h("span", { style: Object.assign({}, S.chip, { color: statusInk("ok") }), key: "cn" }, t("statusNew") + " " + counts.nu) : null,
                counts.changed > 0 ? h("span", { style: Object.assign({}, S.chip, { color: statusInk("warn") }), key: "cc" }, t("statusChanged") + " " + counts.changed) : null,
                counts.gone > 0 ? h("span", { style: Object.assign({}, S.chip, { color: statusInk("bad") }), key: "cg" }, t("statusGone") + " " + counts.gone) : null,
                h("span", { style: S.small, key: "f" }, group.file || ""),
                group.error ? h("span", { style: Object.assign({}, S.small, { color: statusInk("bad") }), key: "e" }, group.error) : null),
              isOpen ? rows.map(function (server) {
                return h(ExternalRow, {
                  key: server.key,
                  t: t,
                  server: server,
                  busy: busy,
                  selected: !!sel[server.key],
                  onToggleSelect: toggleSelect,
                  onAdopt: function (s) { return adoptKeys([s.key]); },
                  onForget: forgetGone,
                  onEdit: openEdit,
                  onPush: function (s) {
                    // 危险动作：直接改别人工具的配置文件，先确认，且靠「允许同步回」授权过门。
                    if (!window.confirm(t("confirmPush") + " " + s.sourceLabel + " → " + s.serverName + "？")) return;
                    return run(t("pushUpsert") + " → " + s.sourceLabel, function () {
                      return postJson("/push", { key: s.key, action: "upsert", server: s });
                    });
                  },
                  onPushRemove: pushRemove,
                  onPushBack: setPushBackFor
                });
              }) : null);
          })),

        // ── 源管理（折叠） ──
        h("details", { style: S.section },
          h("summary", { style: Object.assign({}, S.h3, { cursor: "pointer" }) }, t("secSources")),
          h(SourceList, { t: t, busy: busy, view: sourcesView, setView: setSourcesView, setError: setError, setNotice: setNotice, reload: function () { return getJson("/sources").then(setSourcesView).catch(function (e) { setError(t("loadFail") + "：" + String(e && e.message ? e.message : e)); }); } })),

        // ── 备份（折叠；直接用 /scan 带回的 data.backups，不再单独请求） ──
        h("details", { style: S.section },
          h("summary", { style: Object.assign({}, S.h3, { cursor: "pointer" }) }, t("secBackups")),
          ((data && data.backups) || []).length === 0 ? h("div", { style: S.small }, "—") : null,
          ((data && data.backups) || []).map(function (b) {
            // 后端契约是 {stamp, count, files[]}：曾经按 name/bytes/files(数字) 读，整行渲染成空白。
            var fileNames = Array.isArray(b.files) ? b.files : [];
            return h("div", { style: S.row, key: b.stamp },
              h("span", { style: { fontSize: "11px", fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace" }, key: "p" }, b.stamp),
              h("span", { style: S.small, key: "s" }, (b.count || 0) + " " + t("backupFiles") + (fileNames.length ? "：" + fileNames.slice(0, 2).join("、") + (fileNames.length > 2 ? " …" : "") : "")));
          })),

        h("p", { style: S.small }, t("noteGone")),

        // ── 弹窗表单（新增 / 编辑共用） ──
        (edit || adding) ? h(Modal, { onClose: cancelEdit },
          h(ServerForm, {
            key: (edit && (edit.key || dshIdOf(edit))) || "dsh-add",
            t: t,
            form: form,
            setForm: setForm,
            errors: formErrors,
            busy: busy,
            title: edit ? t("modalEdit") + " · " + (edit.serverName || edit.label || "") : t("modalAdd"),
            onCancel: cancelEdit,
            onSave: function () { return edit ? submitEdit() : submitAdd(); }
          })) : null);
    }

    function SourceList(props) {
      var t = props.t;
      var view = props.view;

      useEffect(function () {
        props.reload();
      }, []);

      var formState = useState({ id: "", label: "", format: "json", containerHint: "", dialect: "", pathsText: "", writeBack: false });
      var form = formState[0];
      var setForm = formState[1];

      function patch(next) {
        setForm(Object.assign({}, form, next));
      }

      function addSource() {
        if (!form.id) { props.setError(t("sId") + ": —"); return; }
        postJson("/sources/add", {
          id: form.id,
          label: form.label || form.id,
          format: form.format,
          containerHint: form.containerHint,
          dialect: form.dialect,
          paths: parseList(form.pathsText),
          writeBack: !!form.writeBack
        }).then(function () {
          props.setNotice(t("sAdd") + " ✓ " + form.id);
          return props.reload();
        }).catch(function (e) {
          props.setError(t("sAdd") + " ✗ " + String(e && e.message ? e.message : e));
        });
      }

      function removeSource(id) {
        postJson("/sources/remove", { id: id }).then(function () {
          props.setNotice(t("sRemove") + " ✓ " + id);
          return props.reload();
        }).catch(function (e) {
          props.setError(t("sRemove") + " ✗ " + String(e && e.message ? e.message : e));
        });
      }

      if (!view) return h("div", { style: S.small }, "…");

      return h("div", null,
        (view.sources || []).map(function (source) {
          return h("div", { style: S.row, key: source.id },
            h("span", { style: S.rowName }, source.label),
            h("span", { style: S.small }, source.id),
            h("span", { style: S.chip }, source.format),
            source.builtin ? h("span", { style: S.small }, "builtin") : h("span", { style: S.small }, "custom"),
            h("span", { style: S.small }, (source.paths || []).join(" | ")),
            h("span", { style: { marginLeft: "auto" } },
              source.builtin ? null : h("button", { style: S.btn, disabled: props.busy, onClick: function () { removeSource(source.id); } }, t("sRemove"))));
        }),
        h("div", { style: Object.assign({}, S.section, { marginTop: "10px" }) },
          h("h3", { style: S.h3 }, t("sAdd")),
          h("div", { style: S.grid },
            h("label", { style: S.field }, h("span", { style: S.label }, t("sId")), h("input", { style: S.input, value: form.id, onChange: function (e) { patch({ id: e.target.value }); } })),
            h("label", { style: S.field }, h("span", { style: S.label }, t("sLabel")), h("input", { style: S.input, value: form.label, onChange: function (e) { patch({ label: e.target.value }); } })),
            h("label", { style: S.field }, h("span", { style: S.label }, t("sFormat")),
              h("select", { style: S.input, value: form.format, onChange: function (e) { patch({ format: e.target.value }); } },
                h("option", { value: "json" }, "json"),
                h("option", { value: "toml" }, "toml"),
                h("option", { value: "opencode" }, "opencode"))),
            h("label", { style: S.field }, h("span", { style: S.label }, t("sContainer")), h("input", { style: S.input, value: form.containerHint, onChange: function (e) { patch({ containerHint: e.target.value }); } })),
            h("label", { style: S.field }, h("span", { style: S.label }, t("sDialect")), h("input", { style: S.input, value: form.dialect, onChange: function (e) { patch({ dialect: e.target.value }); } }))),
          h("label", { style: Object.assign({}, S.field, { marginTop: "8px" }) },
            h("span", { style: S.label }, t("sPaths")),
            h("textarea", { style: S.textarea, value: form.pathsText, onChange: function (e) { patch({ pathsText: e.target.value }); } })),
          h("label", { style: Object.assign({}, S.field, { marginTop: "8px", flexDirection: "row", alignItems: "center", gap: "6px" }) },
            h("input", { type: "checkbox", checked: !!form.writeBack, onChange: function (e) { patch({ writeBack: e.target.checked }); } }),
            h("span", { style: S.label }, t("sWriteBack"))),
          h("div", { style: { marginTop: "8px" } },
            h("button", { style: S.btnPrimary, disabled: props.busy, onClick: addSource }, t("sAdd")))));
    }

    // ── 网络 ────────────────────────────────────────────────────────────────
    function getJson(path) {
      return fetch(cssUrl(path), { credentials: "include" }).then(function (res) {
        if (!res.ok) return res.text().then(function (text) { throw new Error("HTTP " + res.status + " " + text); });
        return res.json();
      });
    }

    function postJson(path, body) {
      return fetch(cssUrl(path), {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body || {})
      }).then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (parsed) {
          if (!res.ok) throw new Error(parsed && parsed.error ? parsed.error : "HTTP " + res.status);
          return parsed;
        });
      });
    }


    // ── v11 原型 UI：CSS / HTML / 交互原样移植，仅在 .mg-host 内生效 ──────
    var MG_CSS = ".mg-host{\n\n    \n    --mg-bg:          var(--dsw-alias-bg-base,    Canvas);\n    --mg-surface:     var(--dsw-alias-bg-layer-1,    Canvas);\n    --mg-surface-1:   var(--dsw-alias-bg-layer-2,  rgba(128,128,128,.07));\n    --mg-surface-2:   var(--dsw-alias-bg-layer-3,  rgba(128,128,128,.13));\n    --mg-surface-3:   var(--dsw-alias-bg-layer-4,   rgba(128,128,128,.20));\n    --mg-text:        var(--dsw-alias-label-primary,    CanvasText);\n    --mg-text-2:      var(--dsw-alias-label-secondary,  CanvasText);\n    --mg-text-3:      var(--dsw-alias-label-tertiary,   CanvasText);\n    --mg-dialog-bg:   var(--dsw-alias-bg-overlay, Canvas);\n    --mg-dialog-shade:var(--dsw-alias-bg-mask-1,           rgba(128,128,128,.45));\n\n    \n    --mg-border:var(--dsw-alias-border-l2,rgba(128,128,128,.30)); --mg-border-strong:var(--dsw-alias-border-l3,rgba(128,128,128,.48));\n    --mg-accent:var(--dsw-alias-accent,#3b6cf6); --mg-accent-soft:var(--dsw-alias-accent-soft,rgba(59,108,246,.13)); --mg-accent-text:var(--dsw-alias-accent-ink,#2352cf);\n    --mg-new:#5cb2f2;      --mg-new-soft:rgba(92,178,242,.12);      --mg-new-line:rgba(92,178,242,.26);\n    --mg-changed:#eab268;  --mg-changed-soft:rgba(234,178,104,.12);  --mg-changed-line:rgba(234,178,104,.26);\n    --mg-missing:#f08080;  --mg-missing-soft:rgba(240,128,128,.12);  --mg-missing-line:rgba(240,128,128,.26);\n    --mg-same:#69c3a0;     --mg-same-soft:rgba(105,195,160,.11);     --mg-same-line:rgba(105,195,160,.24);\n    --mg-danger:#ef7070;   --mg-danger-soft:rgba(239,112,112,.12);   --mg-danger-line:rgba(239,112,112,.38);\n    --mg-ok:#5dc79b;       --mg-ok-soft:rgba(93,199,155,.14);\n    --mg-shadow:0 28px 90px rgba(0,0,0,.55);\n    --mg-mono:ui-monospace,\"Cascadia Code\",Consolas,\"SF Mono\",monospace;\n  \n}\n.mg-host,.mg-host *{\nbox-sizing:border-box\n}\n.mg-host, .mg-host{\nmargin:0;padding:0\n}\n.mg-host{\nbackground:var(--mg-bg);color:var(--mg-text);height:100%;box-sizing:border-box;padding:14px;overflow:hidden;\n    font:14px/1.5 \"Segoe UI\",system-ui,-apple-system,\"Microsoft YaHei\",sans-serif;-webkit-font-smoothing:antialiased\n}\n.mg-host .app{\nposition:relative;width:1180px;max-width:100%;height:100%;margin:0 auto;\n    display:flex;flex-direction:column;\n    background-color:var(--mg-surface);border:1px solid var(--mg-border);border-radius:14px;\n    box-shadow:var(--mg-shadow);overflow:hidden;isolation:isolate\n}\n.mg-host .chrome, .mg-host .head, .mg-host .tabs{\nflex:none\n}\n.mg-host .chrome{\nheight:36px;background:var(--mg-surface-1);border-bottom:1px solid var(--mg-border);\n    display:flex;align-items:center;justify-content:space-between;padding:0 14px\n}\n.mg-host .chrome-left{\ndisplay:flex;align-items:center;gap:9px;font-size:12px;color:var(--mg-text-3)\n}\n.mg-host .chrome-left .dot{\nwidth:9px;height:9px;border-radius:50%;background:var(--mg-accent);box-shadow:0 0 0 3px var(--mg-accent-soft)\n}\n.mg-host .proto-tag{\nfont-size:11px;color:var(--mg-accent-text);background:var(--mg-accent-soft);\n    border:1px solid var(--mg-new-line);border-radius:5px;padding:2px 8px\n}\n.mg-host .head{\ndisplay:flex;align-items:center;justify-content:space-between;gap:24px;padding:18px 24px 15px;background:var(--mg-surface)\n}\n.mg-host .brand{\ndisplay:flex;align-items:center;gap:14px\n}\n.mg-host .brand-icon{\nwidth:38px;height:38px;border-radius:11px;background:var(--mg-accent-soft);\n    border:1px solid var(--mg-new-line);display:grid;place-items:center;color:var(--mg-accent-text);flex:none\n}\n.mg-host .brand h1{\nmargin:0;font-size:19px;letter-spacing:.2px;font-weight:650\n}\n.mg-host .head-actions{\ndisplay:flex;align-items:center;gap:12px\n}\n.mg-host .scan-time{\nfont-size:12px;color:var(--mg-text-3);white-space:nowrap\n}\n.mg-host .btn{\nborder:1px solid var(--mg-border-strong);background:var(--mg-surface-2);color:var(--mg-text);\n    border-radius:8px;padding:8px 14px;font-size:13px;cursor:pointer;display:inline-flex;align-items:center;gap:7px;transition:.15s;white-space:nowrap\n}\n.mg-host .btn:hover{\nborder-color:var(--mg-accent);color:var(--mg-accent-text)\n}\n.mg-host .btn.primary{\nbackground:var(--mg-accent);border-color:var(--mg-accent);color:#fff;font-weight:600\n}\n.mg-host .btn.primary:hover{\nfilter:brightness(1.1)\n}\n.mg-host .btn.danger{\nbackground:var(--mg-danger-soft);border-color:var(--mg-danger-line);color:var(--mg-danger)\n}\n.mg-host .btn.ghost{\nbackground:transparent;border-color:transparent;color:var(--mg-text-2)\n}\n.mg-host .btn.ghost:hover{\nbackground:var(--mg-surface-2);color:var(--mg-text)\n}\n.mg-host .btn.sm{\npadding:5px 10px;font-size:12px;border-radius:7px\n}\n.mg-host .btn:disabled{\nopacity:.42;cursor:not-allowed\n}\n.mg-host .btn.active{\nbackground:var(--mg-accent-soft);border-color:var(--mg-accent);color:var(--mg-accent-text)\n}\n.mg-host .btn .ic{\nwidth:13px;height:13px;display:block\n}\n.mg-host .tabs{\ndisplay:flex;align-items:center;gap:4px;padding:0 20px;background:var(--mg-surface);border-bottom:1px solid var(--mg-border)\n}\n.mg-host .tab{\nposition:relative;background:transparent;border:0;color:var(--mg-text-3);padding:11px 14px 12px;\n    font-size:13px;cursor:pointer;border-radius:8px 8px 0 0;transition:.15s;display:flex;align-items:center;gap:7px\n}\n.mg-host .tab:hover{\ncolor:var(--mg-text-2);background:var(--mg-surface-1)\n}\n.mg-host .tab.active{\ncolor:var(--mg-text);font-weight:600\n}\n.mg-host .tab.active::after{\ncontent:\"\";position:absolute;left:12px;right:12px;bottom:-1px;height:2px;background:var(--mg-accent);border-radius:2px\n}\n.mg-host .tab-badge{\nfont-size:10.5px;min-width:18px;text-align:center;padding:1px 5px;border-radius:20px;\n    background:var(--mg-surface-2);color:var(--mg-text-3);font-weight:500\n}\n.mg-host .tab.active .tab-badge{\nbackground:var(--mg-accent-soft);color:var(--mg-accent-text)\n}\n.mg-host .tabs-right{\nmargin-left:auto\n}\n.mg-host .scope-pill{\nfont-family:var(--mg-mono);font-size:11px;color:var(--mg-text-3);border:1px solid var(--mg-border);\n    background:var(--mg-surface-1);padding:3px 9px;border-radius:20px\n}\n.mg-host .view{\ndisplay:none;flex:1;min-height:0;flex-direction:column;padding:14px 20px 18px;\n    background:var(--mg-surface);overflow:hidden\n}\n.mg-host .view.active{\ndisplay:flex\n}\n.mg-host .stat-grid{\ndisplay:flex;align-items:center;gap:20px;flex:none;padding:0 2px 10px;\n    font-size:12px;color:var(--mg-text-3)\n}\n.mg-host .stat{\ndisplay:inline-flex;align-items:center;gap:6px;white-space:nowrap\n}\n.mg-host .stat i{\nwidth:6px;height:6px;border-radius:50%;background:var(--tone);flex:none;opacity:.85\n}\n.mg-host .stat b{\nfont:600 12px var(--mg-mono);color:var(--mg-text-2)\n}\n.mg-host .stat[data-tone=\"new\"]{\n--tone:var(--mg-new)\n}\n.mg-host .stat[data-tone=\"changed\"]{\n--tone:var(--mg-changed)\n}\n.mg-host .stat[data-tone=\"missing\"]{\n--tone:var(--mg-missing)\n}\n.mg-host .stat[data-tone=\"same\"]{\n--tone:var(--mg-same)\n}\n.mg-host .head-note{\nfont-size:11.5px;color:var(--mg-text-3);margin-top:3px;letter-spacing:.1px\n}\n.mg-host .workspace{\ndisplay:grid;grid-template-columns:var(--rail-w,246px) 6px minmax(0,1fr);border:1px solid var(--mg-border);\n    border-radius:11px;overflow:hidden;flex:1;min-height:0;background:var(--mg-surface-1)\n}\n.mg-host .rail{\ndisplay:flex;flex-direction:column;background:var(--mg-surface-1);min-height:0;min-width:0\n}\n.mg-host .resizer{\nposition:relative;background:var(--mg-surface-1);cursor:col-resize;z-index:2;touch-action:none\n}\n.mg-host .resizer::after{\ncontent:\"\";position:absolute;left:2px;top:0;bottom:0;width:1px;background:var(--mg-border);transition:background .15s\n}\n.mg-host .resizer:hover::after, .mg-host .resizer.dragging::after{\nleft:1px;width:2px;background:var(--mg-accent)\n}\n.mg-host .rail-head{\npadding:11px 14px 9px;display:flex;justify-content:space-between;align-items:center;font-size:12px;font-weight:600;color:var(--mg-text-2)\n}\n.mg-host .rail-head span{\nfont-family:var(--mg-mono);font-weight:400;color:var(--mg-text-3);font-size:11px\n}\n.mg-host .rail-search{\nmargin:0 12px 9px;background:var(--mg-surface);border:1px solid var(--mg-border);border-radius:7px;\n    color:var(--mg-text);padding:6px 9px;font-size:12px;outline:none\n}\n.mg-host .rail-search:focus{\nborder-color:var(--mg-accent)\n}\n.mg-host .rail-list{\nlist-style:none;margin:0;padding:0 6px 8px;overflow:auto;flex:1\n}\n.mg-host .rail-item{\ndisplay:flex;align-items:center;gap:9px;padding:8px 9px;border-radius:7px;cursor:pointer;\n    color:var(--mg-text-2);font-size:12.5px;transition:.12s;margin-bottom:2px\n}\n.mg-host .rail-item:hover{\nbackground:var(--mg-surface-2);color:var(--mg-text)\n}\n.mg-host .rail-item.active{\nbackground:var(--mg-accent-soft);color:var(--mg-accent-text);font-weight:600\n}\n.mg-host .rail-item .sicon{\nwidth:20px;height:20px;border-radius:5px;background:transparent;display:grid;\n    place-items:center;font-size:10px;font-weight:700;color:var(--mg-text-3);flex:none;font-family:var(--mg-mono)\n}\n.mg-host .rail-item:hover .sicon{\nbackground:rgba(128,128,128,.14);color:var(--mg-text)\n}\n/* 兼容：只有被点击(active)的工具才显示彩色图标块，其余一律透明，避免浅色主题下满屏深色方块 */\n.mg-host .rail-item.active .sicon{\nbackground:var(--mg-accent);color:Canvas;font-weight:700\n}\n.mg-host .rail-item .sname{\noverflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1\n}\n.mg-host .rail-item .scount{\nfont-family:var(--mg-mono);font-size:11px;color:var(--mg-text-3)\n}\n.mg-host .rail-item .sstate{\nwidth:6px;height:6px;border-radius:50%;background:var(--tone);flex:none\n}\n.mg-host .rail-item.off{\nopacity:.48\n}\n.mg-host .detail{\ndisplay:flex;flex-direction:column;min-width:0;min-height:0;background:var(--mg-surface)\n}\n.mg-host .detail-head{\ndisplay:flex;align-items:center;justify-content:space-between;gap:14px;padding:12px 16px 10px;border-bottom:1px solid var(--mg-border)\n}\n.mg-host .detail-head h2{\nmargin:0;font-size:15px;font-weight:650\n}\n.mg-host .detail-head .src-meta{\ndisplay:block;margin-top:3px;font-size:11.5px;color:var(--mg-text-3);font-family:var(--mg-mono)\n}\n.mg-host .detail-actions{\ndisplay:flex;gap:8px;align-items:center\n}\n.mg-host .filterbar{\ndisplay:flex;align-items:center;gap:5px;padding:9px 16px;border-bottom:1px solid var(--mg-border);background:var(--mg-surface-1)\n}\n.mg-host .chip{\nborder:1px solid transparent;background:transparent;color:var(--mg-text-3);font-size:12px;padding:4px 10px;border-radius:7px;cursor:pointer;white-space:nowrap\n}\n.mg-host .chip:hover{\ncolor:var(--mg-text-2);background:var(--mg-surface-2)\n}\n.mg-host .chip.active{\nbackground:var(--mg-surface-3);border-color:var(--mg-border-strong);color:var(--mg-text);font-weight:600\n}\n.mg-host .chip .cnt{\nfont-family:var(--mg-mono);font-size:10.5px;color:var(--mg-text-3);margin-left:5px\n}\n.mg-host .chip.active .cnt{\ncolor:var(--mg-text-2)\n}\n.mg-host .filterbar .grow{\nflex:1\n}\n.mg-host .mini-search{\nbackground:var(--mg-surface);border:1px solid var(--mg-border);border-radius:7px;color:var(--mg-text);\n    padding:5px 9px;font-size:11.5px;width:150px;outline:none\n}\n.mg-host .mini-search:focus{\nborder-color:var(--mg-accent)\n}\n.mg-host .table-scroll, .mg-host .tscroll{\nflex:1;overflow:auto;min-height:0\n}\n.mg-host table{\nwidth:100%;border-collapse:collapse;font-size:12.5px\n}\n.mg-host #view-sync table{\nmin-width:940px\n}\n.mg-host #view-dsh table{\nmin-width:900px\n}\n.mg-host #view-sources table{\nmin-width:980px\n}\n.mg-host thead th{\n/* 表头必须完全不透明：DSH 的浅色/壁纸主题常不注入 --dsw-alias-bg-layer-2，\n   --mg-surface-1 会退化成 rgba(128,128,128,.07)。sticky 表头一旦半透明，\n   滚动时下方数据行会透过表头，与表头文字叠印（用户反馈的「表头和数据重合」）。\n   用「不透明 Canvas 底 + 半透明主题色层」叠加：既挡住下层文字，又保留主题观感。\n   z-index 提到 2，确保盖过 tbody 里的徽章/按钮等建立了层叠上下文的元素。 */\nposition:sticky;top:0;z-index:2;background-color:Canvas;\n    background-image:linear-gradient(var(--mg-surface-1),var(--mg-surface-1));\n    color:var(--mg-text-3);font-weight:500;\n    font-size:11px;text-align:left;padding:8px 10px;\n    border-bottom:1px solid var(--mg-border);box-shadow:inset 0 -1px 0 var(--mg-border);white-space:nowrap\n}\n.mg-host tbody tr{\nborder-bottom:1px solid var(--mg-border);transition:background .12s\n}\n.mg-host tbody tr:hover{\nbackground:var(--mg-surface-1)\n}\n.mg-host tbody td{\npadding:9px 10px;vertical-align:middle;color:var(--mg-text-2);white-space:nowrap\n}\n.mg-host td.c-check{\nwidth:32px;padding-left:14px\n}\n.mg-host td.c-name{\nmin-width:190px\n}\n.mg-host td.c-status{\nwidth:88px\n}\n.mg-host td.c-transport{\nwidth:92px\n}\n.mg-host td.c-cmd{\nmin-width:240px\n}\n.mg-host td.c-ops{\nmin-width:214px\n}\n.mg-host .nm{\ncolor:var(--mg-text);font-weight:550;font-family:var(--mg-mono);font-size:12px;display:block;white-space:nowrap\n}\n.mg-host .nm-sub{\nfont-size:10.5px;color:var(--mg-text-3);display:block;margin-top:2px;white-space:nowrap\n}\n.mg-host .cmd{\nfont-family:var(--mg-mono);font-size:11px;color:var(--mg-text-3);display:block;white-space:nowrap\n}\n.mg-host .badge{\ndisplay:inline-flex;align-items:center;gap:5px;font-size:10.5px;padding:2px 7px;border-radius:20px;\n    border:1px solid transparent;white-space:nowrap;line-height:1.6\n}\n.mg-host .badge::before{\ncontent:\"\";width:5px;height:5px;border-radius:50%;background:currentColor\n}\n.mg-host .badge[data-tone=\"new\"]{\ncolor:var(--mg-new);background:var(--mg-new-soft);border-color:var(--mg-new-line)\n}\n.mg-host .badge[data-tone=\"changed\"]{\ncolor:var(--mg-changed);background:var(--mg-changed-soft);border-color:var(--mg-changed-line)\n}\n.mg-host .badge[data-tone=\"missing\"]{\ncolor:var(--mg-missing);background:var(--mg-missing-soft);border-color:var(--mg-missing-line)\n}\n.mg-host .badge[data-tone=\"same\"]{\ncolor:var(--mg-same);background:var(--mg-same-soft);border-color:var(--mg-same-line)\n}\n.mg-host .badge.quiet{\ncolor:var(--mg-text-3);background:var(--mg-surface-2);border-color:var(--mg-border)\n}\n.mg-host .badge.quiet::before{\ndisplay:none\n}\n.mg-host .secret{\nfont-family:var(--mg-mono);font-size:10.5px;color:var(--mg-text-3);background:var(--mg-surface-2);\n    border:1px solid var(--mg-border);border-radius:5px;padding:1px 6px\n}\n.mg-host .ops{\ndisplay:flex;align-items:center;gap:5px;justify-content:flex-end;flex-wrap:nowrap\n}\n.mg-host .op{\nfont-size:11px;padding:4px 8px;border-radius:6px;border:1px solid var(--mg-border);background:var(--mg-surface-2);\n    color:var(--mg-text-2);cursor:pointer;white-space:nowrap\n}\n.mg-host .op:hover{\nborder-color:var(--mg-border-strong);color:var(--mg-text)\n}\n.mg-host .op.primary{\nbackground:var(--mg-accent-soft);border-color:var(--mg-new-line);color:var(--mg-accent-text)\n}\n.mg-host .op.warn{\nbackground:var(--mg-danger-soft);border-color:var(--mg-danger-line);color:var(--mg-danger)\n}\n.mg-host .op.hidden{\ndisplay:none\n}\n.mg-host .op:disabled{\nopacity:.4;cursor:not-allowed\n}\n.mg-host .write-toggle{\ndisplay:inline-flex;align-items:center;gap:6px;font-size:10.5px;color:var(--mg-text-3);cursor:pointer;user-select:none\n}\n.mg-host .switch{\nwidth:26px;height:15px;border-radius:20px;background:var(--mg-surface-3);border:1px solid var(--mg-border-strong);position:relative;transition:.18s;flex:none\n}\n.mg-host .switch::after{\ncontent:\"\";position:absolute;top:2px;left:2px;width:9px;height:9px;border-radius:50%;background:var(--mg-text-3);transition:.18s\n}\n.mg-host .write-toggle.on .switch{\nbackground:var(--mg-danger-soft);border-color:var(--mg-danger)\n}\n.mg-host .write-toggle.on .switch::after{\nleft:13px;background:var(--mg-danger)\n}\n.mg-host .write-toggle.on{\ncolor:var(--mg-danger)\n}\n.mg-host .write-toggle.ro{\nopacity:.4;cursor:not-allowed\n}\n.mg-host input[type=checkbox]{\naccent-color:var(--mg-accent);width:14px;height:14px;cursor:pointer\n}\n.mg-host .empty{\npadding:44px 20px;text-align:center;color:var(--mg-text-3);font-size:12.5px\n}\n.mg-host .actionbar{\ndisplay:flex;align-items:center;gap:12px;padding:10px 16px;border-top:1px solid var(--mg-border);\n    background:var(--mg-surface-1);font-size:12px;color:var(--mg-text-2)\n}\n.mg-host .actionbar .sel{\nfont-weight:600;color:var(--mg-text)\n}\n.mg-host .actionbar .grow{\nflex:1\n}\n.mg-host .panel{\nbackground:var(--mg-surface-1);border:1px solid var(--mg-border);border-radius:11px;overflow:hidden;margin-bottom:14px\n}\n.mg-host .panel-head{\ndisplay:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 16px;border-bottom:1px solid var(--mg-border)\n}\n.mg-host .panel-head h3{\nmargin:0;font-size:14px;font-weight:650\n}\n.mg-host .panel-head .side{\ndisplay:flex;align-items:center;gap:9px\n}\n.mg-host .panel-body{\npadding:14px 16px;flex:1;min-height:0;overflow:auto\n}\n.mg-host .view > .panel{\nflex:1;min-height:0;display:flex;flex-direction:column;margin-bottom:0\n}\n.mg-host .view > .panel + .panel{\nmargin-top:14px\n}\n.mg-host #view-maint{\noverflow:auto\n}\n.mg-host #view-maint > .panel{\nflex:none\n}\n.mg-host .panel-head{\nflex:none\n}\n.mg-host .check-list{\nalign-content:start\n}\n.mg-host .tscroll{\nflex:1;min-height:0;overflow:auto\n}\n.mg-host .subtle{\nfont-size:12px;color:var(--mg-text-3)\n}\n.mg-host .mono{\nfont-family:var(--mg-mono);font-size:11.5px\n}\n.mg-host .row-actions{\ndisplay:flex;gap:6px;justify-content:flex-end\n}\n.mg-host .check-list{\ndisplay:grid;grid-template-columns:repeat(3,1fr);gap:9px\n}\n.mg-host .check-item{\ndisplay:flex;align-items:center;gap:10px;background:var(--mg-surface);border:1px solid var(--mg-border);\n    border-radius:8px;padding:10px 12px;font-size:12.5px;color:var(--mg-text)\n}\n.mg-host .check-mark{\nwidth:19px;height:19px;border-radius:50%;display:grid;place-items:center;flex:none;font-size:11px;font-weight:700\n}\n.mg-host .check-mark.ok{\nbackground:var(--mg-ok-soft);color:var(--mg-ok)\n}\n.mg-host .check-mark.warn{\nbackground:var(--mg-changed-soft);color:var(--mg-changed)\n}\n.mg-host .check-mark.run{\nbackground:var(--mg-accent-soft);color:var(--mg-accent-text)\n}\n.mg-host .backup-row{\ndisplay:flex;align-items:center;gap:12px;padding:9px 0;border-bottom:1px solid var(--mg-border);font-size:12px\n}\n.mg-host .backup-row:last-child{\nborder-bottom:0\n}\n.mg-host .backup-row .grow{\nflex:1;color:var(--mg-text-2)\n}\n.mg-host .backup-row.rolled{\nopacity:.45\n}\n.mg-host .backup-row .grow{\nmin-width:0;display:flex;align-items:center;gap:8px\n}\n.mg-host .backup-row .bf{\nflex:none;color:var(--mg-text)\n}\n.mg-host .bdir{\nmin-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;\n    font-family:var(--mg-mono);font-size:10.5px;color:var(--mg-text-3)\n}\n.mg-host .backup-dir{\ndisplay:flex;align-items:center;gap:8px;padding:8px 2px;margin-top:12px;\n    max-width:520px;font-size:12px;color:var(--mg-text-2)\n}\n.mg-host .backup-dir .lbl{\nflex:none;color:var(--mg-text-3)\n}\n.mg-host .backup-dir .cell-input{\nflex:1;min-width:140px;width:auto;padding:4px 7px;\n    font-family:var(--mg-mono);color:var(--mg-text);\n    border:1px solid transparent;background:transparent\n}\n.mg-host .backup-dir .cell-input:hover{\nborder-color:var(--mg-border);background:var(--mg-surface)\n}\n.mg-host .backup-dir .cell-input:focus, .mg-host .backup-dir .cell-input.dirty{\nborder-color:var(--mg-accent);background:var(--mg-surface)\n}\n.mg-host .backup-dir .dir-dot{\nflex:none;width:6px;height:6px;border-radius:50%;background:var(--mg-accent)\n}\n.mg-host .backup-dir .op{\nflex:none\n}\n.mg-host .tip{\nposition:fixed;z-index:2147483000;display:none;max-width:290px;padding:7px 10px;border-radius:7px;\n    background:var(--mg-dialog-bg);color:var(--mg-text);border:1px solid var(--mg-border-strong);\n    box-shadow:var(--mg-shadow);font-size:11.5px;line-height:1.55;white-space:normal;word-break:break-word;\n    pointer-events:none\n}\n.mg-host .tip.show{\ndisplay:block\n}\n.mg-host .hidden{\ndisplay:none\n}\n.mg-host .spin{\nanimation:spin 1s linear infinite;display:inline-block\n}\n\n  @keyframes spin{to{transform:rotate(360deg)}}\n.mg-host .cell-input{\nbackground:var(--mg-surface);border:1px solid var(--mg-border);border-radius:6px;\n    color:var(--mg-text);padding:5px 8px;font-size:11.5px;width:100%;outline:none;font-family:var(--mg-mono)\n}\n.mg-host .cell-input:focus{\nborder-color:var(--mg-accent)\n}\n.mg-host select.cell-input{\nfont-family:inherit\n}\n.mg-host .src-form td{\npadding:10px 12px;background:var(--mg-surface-2)\n}\n.mg-host .src-form .lbl{\nfont-size:10.5px;color:var(--mg-text-3);display:block;margin-bottom:4px\n}\n.mg-host .src-detail td{\npadding:11px 16px;background:var(--mg-surface-2)\n}\n.mg-host .src-detail .mono{\ndisplay:block;padding:3px 0;color:var(--mg-text-2)\n}\n.mg-host .src-detail .lbl{\nfont-size:10.5px;color:var(--mg-text-3);margin-bottom:5px\n}\n.mg-host .overlay{\nposition:absolute;inset:0;background:var(--mg-dialog-shade);z-index:20;display:none\n}\n.mg-host .overlay.show{\ndisplay:block\n}\n.mg-host .drawer{\nposition:absolute;right:0;top:0;bottom:0;width:492px;max-width:100%;background:var(--mg-dialog-bg);\n    border-left:1px solid var(--mg-border-strong);z-index:21;transform:translateX(101%);transition:transform .24s ease;\n    display:flex;flex-direction:column;box-shadow:-20px 0 60px rgba(0,0,0,.35)\n}\n.mg-host .drawer.show{\ntransform:translateX(0)\n}\n.mg-host .drawer-head{\npadding:15px 18px 12px;border-bottom:1px solid var(--mg-border);display:flex;align-items:center;justify-content:space-between\n}\n.mg-host .drawer-head h3{\nmargin:0;font-size:15px;font-weight:650\n}\n.mg-host .x{\nbackground:none;border:0;color:var(--mg-text-3);font-size:18px;line-height:1;cursor:pointer;padding:2px 4px\n}\n.mg-host .x:hover{\ncolor:var(--mg-text)\n}\n.mg-host .seg{\ndisplay:flex;gap:4px;padding:10px 18px;border-bottom:1px solid var(--mg-border);background:var(--mg-surface-1)\n}\n.mg-host .seg button{\nflex:1;border:1px solid transparent;background:transparent;color:var(--mg-text-3);font-size:12.5px;\n    padding:6px 10px;border-radius:7px;cursor:pointer\n}\n.mg-host .seg button.active{\nbackground:var(--mg-surface-3);border-color:var(--mg-border-strong);color:var(--mg-text);font-weight:600\n}\n.mg-host .pane{\ndisplay:none;padding:14px 18px;overflow:auto;flex:1\n}\n.mg-host .pane.active{\ndisplay:block\n}\n.mg-host .stepper{\ndisplay:flex;gap:6px;margin-bottom:12px\n}\n.mg-host .step{\nflex:1;font-size:11px;color:var(--mg-text-3);border-top:2px solid var(--mg-border-strong);padding-top:7px\n}\n.mg-host .step.active{\ncolor:var(--mg-accent-text);border-top-color:var(--mg-accent)\n}\n.mg-host .section{\nborder:1px solid var(--mg-border);border-radius:9px;padding:12px 14px;margin-bottom:11px;background:var(--mg-surface-1)\n}\n.mg-host .section h4{\nmargin:0 0 10px;font-size:12px;color:var(--mg-text-2);font-weight:600\n}\n.mg-host .field{\nmargin-bottom:10px\n}\n.mg-host .field:last-child{\nmargin-bottom:0\n}\n.mg-host .field label{\ndisplay:block;font-size:11.5px;color:var(--mg-text-2);margin-bottom:5px\n}\n.mg-host .field input, .mg-host .field select, .mg-host .field textarea{\nwidth:100%;background:var(--mg-surface);border:1px solid var(--mg-border);\n    border-radius:7px;color:var(--mg-text);padding:7px 9px;font-size:12.5px;outline:none;font-family:inherit\n}\n.mg-host .field input:focus, .mg-host .field select:focus, .mg-host .field textarea:focus{\nborder-color:var(--mg-accent)\n}\n.mg-host .env-row{\ndisplay:flex;gap:7px;margin-bottom:7px;align-items:center\n}\n.mg-host .env-row input{\nflex:1;min-width:0;font-family:var(--mg-mono);font-size:11px\n}\n.mg-host .env-row .k{\nflex:0 0 40%\n}\n.mg-host .env-row .del{\nbackground:none;border:0;color:var(--mg-text-3);font-size:15px;cursor:pointer;padding:0 3px;line-height:1\n}\n.mg-host .env-row .del:hover{\ncolor:var(--mg-danger)\n}\n.mg-host .paste{\ndisplay:flex;gap:7px\n}\n.mg-host .paste input{\nflex:1;font-family:var(--mg-mono);font-size:11px\n}\n.mg-host .import-area{\nwidth:100%;min-height:172px;resize:vertical;background:var(--mg-surface);border:1px solid var(--mg-border);\n    border-radius:8px;color:var(--mg-text);padding:11px 12px;font-family:var(--mg-mono);font-size:11.5px;line-height:1.6;outline:none\n}\n.mg-host .import-area:focus{\nborder-color:var(--mg-accent)\n}\n.mg-host .fmt{\ndisplay:flex;align-items:center;gap:6px;flex-wrap:wrap;margin:9px 0 12px\n}\n.mg-host .fmt .fchip{\nfont-family:var(--mg-mono);font-size:10.5px;color:var(--mg-text-3);background:var(--mg-surface-2);\n    border:1px solid var(--mg-border);border-radius:5px;padding:2px 7px\n}\n.mg-host .fmt .grow{\nflex:1\n}\n.mg-host .parse-meta{\nfont-size:11.5px;color:var(--mg-text-3);font-family:var(--mg-mono);margin-bottom:8px\n}\n.mg-host .import-table{\nwidth:100%;min-width:560px;border-collapse:collapse;font-size:11.5px\n}\n.mg-host #importResult{\noverflow-x:auto\n}\n.mg-host .import-table th{\n/* 与全局 thead th 保持一致：本表同为 sticky 表头，背景必须不透明，\n   否则导入预览滚动时数据行文字会透过表头叠印。 */\nbackground-color:Canvas;\n    background-image:linear-gradient(var(--mg-surface-1),var(--mg-surface-1));\n    color:var(--mg-text-3);font-weight:500;text-align:left;\n    padding:7px 8px;border-bottom:1px solid var(--mg-border);\n    box-shadow:inset 0 -1px 0 var(--mg-border);font-size:10.5px\n}\n.mg-host .import-table td{\npadding:7px 8px;border-bottom:1px solid var(--mg-border);color:var(--mg-text-2);vertical-align:middle\n}\n.mg-host .import-table .ic-cell{\nwidth:26px\n}\n.mg-host .import-table .icmd{\nfont-family:var(--mg-mono);font-size:10.5px;color:var(--mg-text-3);display:block;white-space:nowrap\n}\n.mg-host .preview{\nbackground:var(--mg-surface);border:1px solid var(--mg-border);border-radius:8px;padding:11px 12px;\n    font-family:var(--mg-mono);font-size:11px;color:var(--mg-text-2);white-space:pre;line-height:1.65;overflow:auto\n}\n.mg-host .preview .k{\ncolor:var(--mg-accent-text)\n}\n.mg-host .preview .v{\ncolor:var(--mg-same)\n}\n.mg-host .drawer-foot{\npadding:11px 18px;border-top:1px solid var(--mg-border);display:flex;justify-content:flex-end;gap:8px;background:var(--mg-surface-1)\n}\n.mg-host .modal{\nposition:absolute;left:50%;top:50%;transform:translate(-50%,-46%) scale(.97);width:430px;max-width:calc(100% - 40px);\n    background:var(--mg-dialog-bg);border:1px solid var(--mg-border-strong);border-radius:12px;z-index:22;\n    box-shadow:0 24px 70px rgba(0,0,0,.5);opacity:0;pointer-events:none;transition:.2s\n}\n.mg-host .modal.show{\nopacity:1;pointer-events:auto;transform:translate(-50%,-50%) scale(1)\n}\n.mg-host .modal-head{\npadding:15px 18px 12px;display:flex;gap:11px;align-items:flex-start\n}\n.mg-host .warn-icon{\nwidth:32px;height:32px;border-radius:9px;background:var(--mg-danger-soft);color:var(--mg-danger);\n    display:grid;place-items:center;flex:none;font-size:17px;font-weight:700\n}\n.mg-host .modal-head h3{\nmargin:0;font-size:15px\n}\n.mg-host .modal-head p{\nmargin:4px 0 0;font-size:12px;color:var(--mg-text-3)\n}\n.mg-host .modal-body{\npadding:0 18px 14px\n}\n.mg-host .kv{\ndisplay:flex;justify-content:space-between;gap:12px;font-size:11.5px;padding:6px 0;border-bottom:1px solid var(--mg-border)\n}\n.mg-host .kv span:first-child{\ncolor:var(--mg-text-3)\n}\n.mg-host .kv span:last-child{\ncolor:var(--mg-text-2);font-family:var(--mg-mono);text-align:right;word-break:break-all\n}\n.mg-host .modal-foot{\npadding:11px 18px;border-top:1px solid var(--mg-border);display:flex;justify-content:flex-end;gap:8px;\n    background:var(--mg-surface-1);border-radius:0 0 12px 12px\n}\n.mg-host .toast{\nposition:absolute;left:50%;bottom:22px;transform:translate(-50%,16px);background:var(--mg-dialog-bg);\n    border:1px solid var(--mg-border-strong);color:var(--mg-text);font-size:12.5px;padding:9px 16px;border-radius:9px;\n    box-shadow:var(--mg-shadow);opacity:0;pointer-events:none;transition:.22s;z-index:99\n}\n.mg-host .toast.show{\nopacity:1;transform:translate(-50%,0)\n}\n.mg-host ::-webkit-scrollbar{\nwidth:9px;height:9px\n}\n.mg-host ::-webkit-scrollbar-thumb{\nbackground:rgba(128,128,128,.34);border-radius:8px;border:2px solid transparent;background-clip:padding-box\n}\n.mg-host ::-webkit-scrollbar-thumb:hover{\nbackground:rgba(128,128,128,.58);background-clip:padding-box\n}\n.mg-host ::-webkit-scrollbar-track{\nbackground:transparent\n}\n\n";
    var MG_HTML = "\n<div class=\"app\" id=\"app\">\n  <header class=\"head\">\n    <div class=\"brand\">\n      <div class=\"brand-icon\">\n        <svg width=\"21\" height=\"21\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.6\">\n          <circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"M3 12h18M12 3c2.6 2.5 4 5.6 4 9s-1.4 6.5-4 9c-2.6-2.5-4-5.6-4-9s1.4-6.5 4-9z\"/>\n        </svg>\n      </div>\n      <div>\n        <h1>MCP 全局管理</h1>\n        <div class=\"head-note\">默认只读 · 写回需授权 · 密钥打码 · 写前备份</div>\n      </div>\n    </div>\n    <div class=\"head-actions\">\n      <span class=\"scan-time\" id=\"scanTime\">扫描于 11-04 15:26</span>\n      <button class=\"btn primary\" id=\"rescanBtn\">\n        <svg class=\"ic\" id=\"rescanIcon\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\"><path d=\"M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7\"/></svg>\n        <span id=\"rescanLabel\">刷新扫描</span>\n      </button>\n    </div>\n  </header>\n\n  <nav class=\"tabs\" id=\"tabs\">\n    <button class=\"tab active\" data-view=\"sync\">同步台 <span class=\"tab-badge\" id=\"syncBadge\">5</span></button>\n    <button class=\"tab\" data-view=\"dsh\">DSH 条目 <span class=\"tab-badge\" id=\"dshBadge\">2</span></button>\n    <button class=\"tab\" data-view=\"sources\">来源注册表 <span class=\"tab-badge\" id=\"srcBadge\">11</span></button>\n    <button class=\"tab\" data-view=\"maint\">维护与自检</button>\n    <div class=\"tabs-right\"><span class=\"scope-pill\">profile / desktop</span></div>\n  </nav>\n\n  <!-- 同步台 -->\n  <section class=\"view active\" id=\"view-sync\">\n    <div class=\"stat-grid\">\n      <span class=\"stat\" data-tone=\"new\"><i></i>新发现 <b id=\"cntNew\">3</b></span>\n      <span class=\"stat\" data-tone=\"changed\"><i></i>有变化 <b id=\"cntChanged\">2</b></span>\n      <span class=\"stat\" data-tone=\"missing\"><i></i>源里已删 <b id=\"cntMissing\">1</b></span>\n      <span class=\"stat\" data-tone=\"same\"><i></i>无变化 <b id=\"cntSame\">17</b></span>\n    </div>\n\n    <div class=\"workspace\" id=\"workspace\">\n      <aside class=\"rail\">\n        <div class=\"rail-head\">工具 <span id=\"railMeta\"></span></div>\n        <input class=\"rail-search\" id=\"railSearch\" placeholder=\"筛选\">\n        <ul class=\"rail-list\" id=\"railList\"></ul>\n      </aside>\n      <div class=\"resizer\" id=\"resizer\"></div>\n      <div class=\"detail\">\n        <div class=\"detail-head\">\n          <div><h2 id=\"srcTitle\">VS Code</h2><span class=\"src-meta\" id=\"srcMeta\"></span></div>\n          <div class=\"detail-actions\">\n            <span class=\"badge quiet\" id=\"srcWrite\">可同步</span>\n          </div>\n        </div>\n        <div class=\"filterbar\" id=\"chips\">\n          <button class=\"chip active\" data-filter=\"all\">全部<span class=\"cnt\"></span></button>\n          <button class=\"chip\" data-filter=\"new\">新发现<span class=\"cnt\"></span></button>\n          <button class=\"chip\" data-filter=\"changed\">有变化<span class=\"cnt\"></span></button>\n          <button class=\"chip\" data-filter=\"missing\">源里已删<span class=\"cnt\"></span></button>\n          <button class=\"chip\" data-filter=\"same\">无变化<span class=\"cnt\"></span></button>\n          <span class=\"grow\"></span>\n          <input class=\"mini-search\" id=\"tableSearch\" placeholder=\"搜索\">\n        </div>\n        <div class=\"table-scroll\">\n          <table>\n            <thead><tr><th class=\"c-check\"></th><th>服务名</th><th>状态</th><th>传输</th><th>命令 / 地址</th><th style=\"text-align:right\">操作</th></tr></thead>\n            <tbody id=\"itemBody\"></tbody>\n          </table>\n        </div>\n        <div class=\"actionbar\">\n          <span>已选 <span class=\"sel\" id=\"selCount\">0</span></span>\n          <button class=\"btn ghost sm\" id=\"selectAll\">全选</button>\n          <button class=\"btn ghost sm\" id=\"clearSel\">清空</button>\n          <span class=\"grow\"></span>\n          <button class=\"btn primary sm\" id=\"adoptBtn\" disabled>加入选中</button>\n        </div>\n      </div>\n    </div>\n  </section>\n\n  <!-- DSH 条目 -->\n  <section class=\"view\" id=\"view-dsh\">\n    <div class=\"panel\">\n      <div class=\"panel-head\">\n        <h3>DSH 条目</h3>\n        <button class=\"btn primary sm\" id=\"addDshBtn\">+ 新增</button>\n      </div>\n      <div class=\"tscroll\">\n      <table>\n        <thead><tr><th style=\"padding-left:16px\">服务名</th><th>传输</th><th>命令 / 地址</th><th>状态</th><th style=\"text-align:right;padding-right:16px\">操作</th></tr></thead>\n        <tbody id=\"dshBody\"></tbody>\n      </table>\n      </div>\n    </div>\n  </section>\n\n  <!-- 来源注册表 -->\n  <section class=\"view\" id=\"view-sources\">\n    <div class=\"panel\">\n      <div class=\"panel-head\">\n        <h3>扫描的源</h3>\n        <div class=\"side\">\n          <button class=\"btn sm\" id=\"onlyCustomBtn\">仅看自定义</button>\n          <button class=\"btn primary sm\" id=\"addSourceBtn\">+ 自定义源</button>\n        </div>\n      </div>\n      <div class=\"tscroll\">\n      <table>\n        <thead><tr><th style=\"padding-left:16px\">工具</th><th>id / 格式</th><th>类型</th><th>命中文件</th><th>条目</th><th>写回</th><th style=\"text-align:right;padding-right:16px\">操作</th></tr></thead>\n        <tbody id=\"sourceBody\"></tbody>\n      </table>\n      </div>\n    </div>\n  </section>\n\n  <!-- 维护与自检 -->\n  <section class=\"view\" id=\"view-maint\">\n    <div class=\"panel\">\n      <div class=\"panel-head\">\n        <h3>自检</h3>\n        <div class=\"side\"><span class=\"subtle\" id=\"checkSummary\"></span><button class=\"btn primary sm\" id=\"selfCheckBtn\">运行自检</button></div>\n      </div>\n      <div class=\"panel-body check-list\" id=\"checkList\"></div>\n    </div>\n    <div class=\"panel\">\n      <div class=\"panel-head\"><h3>写前备份</h3></div>\n      <div class=\"panel-body\" id=\"backupList\"></div>\n    </div>\n    <div class=\"backup-dir\" id=\"backupDirRow\"></div>\n  </section>\n\n  <!-- 新增 / 编辑抽屉 -->\n  <div class=\"overlay\" id=\"overlay\"></div>\n  <aside class=\"drawer\" id=\"drawer\">\n    <div class=\"drawer-head\">\n      <h3 id=\"drawerTitle\">新增 MCP 服务</h3>\n      <button class=\"x\" id=\"closeDrawer\">✕</button>\n    </div>\n    <div class=\"seg\" id=\"seg\">\n      <button class=\"active\" data-pane=\"manual\">手工填写</button>\n      <button data-pane=\"import\">粘贴导入</button>\n    </div>\n\n    <div class=\"pane active\" id=\"pane-manual\">\n      <div class=\"stepper\"><div class=\"step active\">1 · 基本信息</div><div class=\"step\">2 · 启动</div><div class=\"step\">3 · 环境变量</div></div>\n      <div class=\"section\">\n        <h4>基本信息</h4>\n        <div class=\"field\"><label>服务名</label><input id=\"manualName\"></div>\n        <div class=\"field\"><label>传输方式</label><select id=\"manualTransport\"><option value=\"stdio\">本地命令（stdio）</option><option value=\"http\">远程 URL（http / sse）</option></select></div>\n      </div>\n      <div class=\"section\" id=\"localSection\">\n        <h4>启动</h4>\n        <div class=\"field\"><label>命令</label><input id=\"manualCmd\"></div>\n        <div class=\"field\"><label>参数（每行一个）</label><textarea id=\"manualArgs\" rows=\"3\"></textarea></div>\n      </div>\n      <div class=\"section hidden\" id=\"remoteSection\">\n        <h4>远程地址</h4>\n        <div class=\"field\"><label>URL</label><input id=\"manualUrl\" placeholder=\"https://mcp.example.com/mcp\"></div>\n      </div>\n      <div class=\"section\">\n        <h4>环境变量</h4>\n        <div id=\"envRows\"></div>\n        <button class=\"btn sm\" id=\"addEnvBtn\" style=\"margin-top:4px\">+ 加一条</button>\n      </div>\n      <div class=\"section\">\n        <h4>预览</h4>\n        <div class=\"preview\" id=\"manualPreview\"></div>\n      </div>\n    </div>\n\n    <div class=\"pane\" id=\"pane-import\">\n      <textarea class=\"import-area\" id=\"importText\" spellcheck=\"false\">{\n  \"mcpServers\": {\n    \"filesystem\": {\n      \"command\": \"npx\",\n      \"args\": [\"-y\", \"@modelcontextprotocol/server-filesystem\", \"C:\\\\data\"]\n    },\n    \"context7\": {\n      \"command\": \"npx\",\n      \"args\": [\"-y\", \"@upstash/context7-mcp\"],\n      \"env\": { \"API_KEY\": \"sk-xxxx\" }\n    },\n    \"API 文档\": {\n      \"type\": \"sse\",\n      \"url\": \"https://mcp.example.com/sse\",\n      \"headers\": { \"Authorization\": \"Bearer xxx\" }\n    }\n  }\n}</textarea>\n      <div class=\"fmt\">\n        <span class=\"fchip\">JSON / JSONC</span><span class=\"fchip\">TOML</span><span class=\"fchip\">数组</span><span class=\"fchip\">命令行</span><span class=\"fchip\">URL</span>\n        <span class=\"grow\"></span>\n        <button class=\"btn primary sm\" id=\"parseBtn\">识别</button>\n      </div>\n      <div class=\"parse-meta\" id=\"parseMeta\"></div>\n      <div id=\"importResult\"></div>\n    </div>\n\n    <div class=\"drawer-foot\">\n      <button class=\"btn sm\" id=\"cancelDrawer\">取消</button>\n      <button class=\"btn primary sm\" id=\"drawerSubmit\">写入 DSH</button>\n    </div>\n  </aside>\n\n  <!-- 通用确认 -->\n  <div class=\"modal\" id=\"modal\">\n    <div class=\"modal-head\">\n      <div class=\"warn-icon\">!</div>\n      <div><h3 id=\"modalTitle\"></h3><p id=\"modalDesc\"></p></div>\n    </div>\n    <div class=\"modal-body\" id=\"modalBody\"></div>\n    <div class=\"modal-foot\"><button class=\"btn sm\" id=\"cancelModal\">取消</button><button class=\"btn danger sm\" id=\"confirmModal\">确认</button></div>\n  </div>\n\n  <div class=\"toast\" id=\"toast\"></div>\n</div>\n<div class=\"tip\" id=\"tip\" role=\"tooltip\"></div>\n<input type=\"file\" id=\"backupDirPicker\" webkitdirectory directory multiple style=\"display:none\">\n\n";
    function MG_mountUI(host) {
      MG_HOST = host; // 兼容：记录当前挂载容器，供「API 不可用」横幅渲染（此前从未赋值，导致横幅永不显示）
      if (!document.getElementById("mg-ui-style")) {
        var st = document.createElement("style");
        st.id = "mg-ui-style";
        st.textContent = MG_CSS;
        document.head.appendChild(st);
      }
      host.innerHTML = MG_HTML;

  var $ = function(s,r){return (r||host).querySelector(s)};
  var $$ = function(s,r){return Array.prototype.slice.call((r||host).querySelectorAll(s))};
  function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function now(){
    var d=new Date(),p=function(n){return n<10?'0'+n:''+n;};
    return p(d.getMonth()+1)+'-'+p(d.getDate())+' '+p(d.getHours())+':'+p(d.getMinutes());
  }
  var toastTimer;
  function toast(msg){
    var t=$('#toast'); t.textContent=msg; t.classList.add('show');
    clearTimeout(toastTimer); toastTimer=setTimeout(function(){t.classList.remove('show')},2200);
  }

  /* ── 可变数据源：所有操作都改这里，再由 renderAll() 重算全部视图 ── */
  var SOURCES = [
    {id:'dsh',           label:'DeepSeek Harness', fmt:'dsh',      meta:'dsh · 可同步', ro:false, off:false, custom:false},
    {id:'claude-code',   label:'Claude Code',      fmt:'json',     meta:'claude-code · json · mcpServers', ro:false, off:false, custom:false},
    {id:'codex',         label:'Codex CLI',        fmt:'toml',     meta:'codex · toml · mcp_servers', ro:false, off:false, custom:false},
    {id:'vscode',        label:'VS Code',          fmt:'json',     meta:'vscode · json · servers', ro:false, off:false, custom:false},
    {id:'trae-cn',       label:'Trae CN',          fmt:'json',     meta:'trae-cn · json · mcpServers', ro:false, off:false, custom:false},
    {id:'marscode',      label:'MarsCode',         fmt:'json',     meta:'marscode · json · mcpServers', ro:false, off:false, custom:false},
    {id:'opencode',      label:'OpenCode',         fmt:'opencode', meta:'opencode · 数组形态', ro:false, off:false, custom:false},
    {id:'oplus-connect', label:'O+ Connect',       fmt:'json',     meta:'oplus-connect · 只读', ro:true,  off:false, custom:false},
    {id:'claude-desktop',label:'Claude Desktop',   fmt:'json',     meta:'claude-desktop', ro:false, off:true,  custom:false},
    {id:'cursor',        label:'Cursor',           fmt:'json',     meta:'cursor', ro:false, off:true,  custom:false},
    {id:'zed',           label:'Zed',              fmt:'json',     meta:'zed · 只读', ro:true,  off:true,  custom:false}
  ];
  var NAMES = {
    'dsh':['word-document-server','44'],
    'claude-code':['playwright'],
    'codex':['node_repl','playwright'],
    'vscode':['datacloud_bigquery_toolbox','datacloud_spanner_toolbox','datacloud_alloydb-postgres_toolbox','datacloud_cloud-sql-postgresql_toolbox','datacloud_knowledge_catalog_toolbox','datacloud_dataproc_toolbox','datacloud_serverless-spark_toolbox','datacloud_alloydb-postgres-admin_toolbox','datacloud_cloud-sql-postgresql-admin_toolbox'],
    'trae-cn':['playwright','mcp-pdf-reader','word-document-server','API 文档'],
    'marscode':['pwa-debug-layer','context7','sequential-thinking','fetch','doc-reader'],
    'opencode':['playwright'],
    'oplus-connect':['12306-mcp','tencent-meeting']
  };
  var LABEL = {new:'新发现',changed:'有变化',missing:'源里已删',same:'无变化'};
  var OVERRIDE = {
    'vscode::datacloud_bigquery_toolbox':'new',
    'trae-cn::API 文档':'new',
    'oplus-connect::12306-mcp':'new',
    'codex::playwright':'changed',
    'marscode::fetch':'changed',
    'dsh::44':'missing'
  };
  var CMD = {
    'playwright':'cmd /c npx @playwright/mcp@latest',
    'node_repl':'.../bin/node_repl.exe',
    'word-document-server':'uvx --from office-word-mcp-server word_mcp_server',
    'fetch':'uvx mcp-server-fetch',
    'context7':'npx -y @upstash/context7-mcp',
    'tencent-meeting':'npx -y tencent-meeting-mcp',
    '12306-mcp':'uvx 12306-mcp',
    'API 文档':'https://api.example.com/mcp'
  };
  var ITEMS = {};
  SOURCES.forEach(function(s){
    ITEMS[s.id] = (NAMES[s.id]||[]).map(function(n){
      var cmd = CMD[n] || (s.id==='vscode' ? 'npx -y @google-cloud/mcp-'+n.replace('datacloud_','').replace('_toolbox','') : 'npx -y @modelcontextprotocol/server-'+n);
      return {
        name:n, status:OVERRIDE[s.id+'::'+n]||'same',
        transport:cmd.indexOf('http')===0?'sse':'stdio', cmd:cmd,
        dup:n==='playwright'?'重复于: Codex CLI, Trae CN, OpenCode':n==='word-document-server'?'重复于: Trae CN':'',
        secret:(s.id==='oplus-connect'||n==='tencent-meeting'||n==='API 文档')
      };
    });
  });
  var DSH_ROWS = [
    {name:'word-document-server', transport:'stdio', cmd:'uvx --from office-word-mcp-server word_mcp_server', tone:'same', label:'已启用'},
    {name:'44',                   transport:'stdio', cmd:'node ./mcp/44.js', tone:'missing', label:'待处理'}
  ];
  var BACKUPS = [
    {time:'11-04 15:02:18', file:'cordis.patch.yml', size:'2.4 KB', rolled:false},
    {time:'11-03 21:40:06', file:'config.toml',      size:'1.8 KB', rolled:false},
    {time:'11-02 09:11:52', file:'mcp.json',         size:'3.1 KB', rolled:false}
  ];
  var CHECKS = [
    {label:'js-yaml 4.3.2',    state:'ok'},
    {label:'安装包 / bundles', state:'ok'},
    {label:'client.js (web)',  state:'ok'},
    {label:'DSH 受管行 2',     state:'ok'},
    {label:'冷启动演练',        state:'warn'},
    {label:'账本 26 条指纹',   state:'ok'}
  ];
  var PENDING_SCAN = [
    {sid:'vscode',   name:'vscode-remote-mcp', cmd:'npx -y @example/vscode-remote-mcp'},
    {sid:'marscode', name:'marscode-fs',       cmd:'uvx mcp-server-fs'}
  ];

  var DEFAULT_BACKUP_DIR = '~/.dsh/mcp-global-manager/backups';
  function loadBackupDir(){
    try{return localStorage.getItem('mg-backup-dir')||DEFAULT_BACKUP_DIR;}catch(e){return DEFAULT_BACKUP_DIR;}
  }
  function storeBackupDir(v){try{localStorage.setItem('mg-backup-dir',v);}catch(e){}}
  var state = {
    src:'vscode', filter:'all', q:'', sel:{}, wb:{}, pane:'manual', parsed:[], picked:{},
    onlyCustom:false, expanded:{}, srcCreating:false, srcEdit:null, srcDraft:{},
    edit:null, scanAt:'11-04 15:26', modalAction:null,
    backupDir:loadBackupDir(), backupDirConfigured:false, dirDirty:false, dirPicking:false, dirPartial:false
  };

  function srcById(id){return SOURCES.filter(function(s){return s.id===id})[0];}
  function itemsFor(id){return ITEMS[id]||[];}
  function allItems(){var a=[];SOURCES.forEach(function(s){a=a.concat(itemsFor(s.id));});return a;}
  function counts(){
    var c={new:0,changed:0,missing:0,same:0};
    allItems().forEach(function(it){c[it.status]=(c[it.status]||0)+1;});
    return c;
  }
  function pathsFor(s){
    if(s.customPath)return [s.customPath];
    if(s.id==='dsh')return ['~/.dsh/profiles/desktop/cordis.patch.yml','~/.dsh/mcp-global-manager/state.json'];
    if(s.fmt==='toml')return ['~/.codex/config.toml','~/.config/'+s.id+'/config.toml'];
    return ['%APPDATA%/'+s.label+'/User/mcp.json','~/.config/'+s.id+'/mcp.json','~/.'+s.id+'.json'];
  }
  function visibleItems(src){
    return itemsFor(src.id).filter(function(it){
      return (state.filter==='all'||it.status===state.filter) &&
             (!state.q || (it.name+' '+it.cmd).toLowerCase().indexOf(state.q)>=0);
    });
  }

  /* ── 同步台 ── */
  function renderRail(){
    var q=$('#railSearch').value.trim().toLowerCase();
    var scanned = SOURCES.some(function(s){return typeof s.exists==='boolean';});
    $('#railList').innerHTML = SOURCES.filter(function(s){
      if(scanned && s.off) return false;            // 扫描后只列本机存在的工具
      if(q) return s.label.toLowerCase().indexOf(q)>=0 || s.id.indexOf(q)>=0;
      return true;
    }).map(function(s){
      var its=itemsFor(s.id),tone='same';
      if(its.some(function(i){return i.status==='missing';}))tone='missing';
      else if(its.some(function(i){return i.status==='changed';}))tone='changed';
      else if(its.some(function(i){return i.status==='new';}))tone='new';
      return '<li class="rail-item'+(state.src===s.id?' active':'')+(s.off?' off':'')+'" data-src="'+esc(s.id)+'">'+
        '<span class="sicon">'+esc(s.label.slice(0,2).toUpperCase())+'</span>'+
        '<span class="sname">'+esc(s.label)+(s.ro?' <span class="secret">只读</span>':'')+'</span>'+
        '<span class="scount">'+its.length+'</span>'+
        '<span class="sstate" style="--tone:var(--mg-'+tone+')"></span></li>';
    }).join('') || '<li class="empty">无匹配</li>';
    $$('.rail-item').forEach(function(el){el.onclick=function(){
      state.src=el.dataset.src;state.sel={};renderAll();
    };});
    var found=SOURCES.filter(function(s){return !s.off;}).length; $('#railMeta').textContent=(scanned?found:SOURCES.length)+' / '+allItems().length;
  }
  function renderStats(){
    var c=counts();
    $('#cntNew').textContent=c.new;$('#cntChanged').textContent=c.changed;
    $('#cntMissing').textContent=c.missing;$('#cntSame').textContent=c.same;
    $('#syncBadge').textContent=c.new+c.changed+c.missing;
    $('#dshBadge').textContent=DSH_ROWS.length;
    $('#srcBadge').textContent=SOURCES.length;
    $('#scanTime').textContent='扫描于 '+state.scanAt;
  }
  function updateChipCounts(){
    var all=itemsFor(state.src),c={all:all.length,new:0,changed:0,missing:0,same:0};
    all.forEach(function(it){c[it.status]=(c[it.status]||0)+1;});
    $$('#chips .chip').forEach(function(ch){$('.cnt',ch).textContent=c[ch.dataset.filter]||0;});
  }
  function renderTable(){
    var src=srcById(state.src)||SOURCES[0];
    $('#srcTitle').textContent=src.label;
    $('#srcMeta').textContent=src.meta;
    var w=$('#srcWrite');
    w.textContent=src.ro?'只读':'可同步';
    if(src.ro){w.classList.remove('quiet');w.setAttribute('data-tone','missing');}
    else{w.classList.add('quiet');w.removeAttribute('data-tone');}
    var rows=visibleItems(src);
    if(!rows.length){$('#itemBody').innerHTML='<tr><td colspan="6" class="empty">无条目</td></tr>';return;}
    $('#itemBody').innerHTML=rows.map(function(it){
      var key=src.id+'::'+it.name, on=!!state.wb[key];
      var sub=it.dup||(it.status==='missing'?'源里已删':'');
      if(it.secret)sub+=(sub?' · ':'')+'<span class="secret">•••• 已打码</span>';
      return '<tr data-key="'+esc(key)+'">'+
        '<td class="c-check"><input type="checkbox" class="rowcheck" '+(state.sel[key]?'checked':'')+'></td>'+
        '<td class="c-name"><span class="nm">'+esc(it.name)+'</span><span class="nm-sub">'+sub+'</span></td>'+
        '<td class="c-status"><span class="badge" data-tone="'+it.status+'">'+LABEL[it.status]+'</span></td>'+
        '<td class="c-transport"><span class="badge quiet">'+esc(it.transport)+'</span></td>'+
        '<td class="c-cmd"><span class="cmd">'+esc(it.cmd)+'</span></td>'+
        '<td class="c-ops"><div class="ops">'+
          (it.status==='new'?'<button class="op primary" data-adopt="'+esc(key)+'">加入</button>':'')+
          '<button class="op" data-edit="'+esc(it.name)+'">改配置</button>'+
          '<span class="write-toggle'+(on?' on':'')+(src.ro?' ro':'')+'" data-wb="'+esc(key)+'"><span class="switch"></span>允许同步回</span>'+
          '<button class="op warn'+(on?'':' hidden')+' wb-action" data-modal="'+esc(key)+'">同步回原工具</button>'+
        '</div></td></tr>';
    }).join('');
    $$('.rowcheck').forEach(function(cb){cb.onchange=function(){
      var key=cb.closest('tr').dataset.key;
      if(cb.checked)state.sel[key]=true;else delete state.sel[key];
      updateSel();
    };});
    $$('.write-toggle').forEach(function(t){t.onclick=function(){
      if(src.ro){toast('该源只读');return;}
      var key=t.dataset.wb;
      if(state.wb[key])delete state.wb[key];else state.wb[key]=true;
      renderTable();
    };});
    $$('[data-adopt]').forEach(function(b){b.onclick=function(){adoptKeys([b.dataset.adopt]);};});
    $$('[data-modal]').forEach(function(b){b.onclick=function(){
      var key=b.dataset.modal,name=key.split('::').slice(1).join('::');
      openConfirm({
        title:'确认同步 '+src.label+'？',desc:'需要本条已开启「允许同步回」',confirm:'确认同步',
        rows:[['目标文件',fileFor(src)],['条目',name],['备份目录',state.backupDir]],
        onConfirm:function(){
          delete state.wb[key];
          var it=itemsFor(src.id).filter(function(x){return x.name===name;})[0];
          if(it)it.status='same';
          BACKUPS.unshift({time:now(),file:fileFor(src).split('/').pop(),size:'2.5 KB',rolled:false,dir:state.backupDir});
          renderAll();toast('已同步回 '+name);
        }
      });
    };});
    $$('[data-edit]').forEach(function(b){b.onclick=function(){
      var name=b.dataset.edit;
      var it=itemsFor(state.src).filter(function(x){return x.name===name;})[0]||{cmd:'',transport:'stdio'};
      openDrawerFor({kind:'item',key:state.src+'::'+name},name,it.cmd,it.transport);
    };});
  }
  function fileFor(s){
    if(s.id==='dsh')return '~/.dsh/profiles/desktop/cordis.patch.yml';
    if(s.id==='trae-cn')return '%APPDATA%/Trae CN/User/mcp.json';
    return pathsFor(s)[0];
  }
  function updateSel(){
    var n=Object.keys(state.sel).length;
    $('#selCount').textContent=n;
    $('#adoptBtn').disabled=n===0;
    $('#adoptBtn').textContent=n?'加入选中 '+n+' 条':'加入选中';
  }
  function adoptKeys(keys){
    var added=0,skipped=0;
    keys.forEach(function(key){
      var sid=key.split('::')[0],name=key.split('::').slice(1).join('::');
      var it=itemsFor(sid).filter(function(x){return x.name===name;})[0];
      if(!it)return;
      if(DSH_ROWS.some(function(r){return r.name===name;})){skipped++;it.status='same';}
      else{
        DSH_ROWS.push({name:name,transport:it.transport,cmd:it.cmd,tone:'same',label:'已启用'});
        it.status='same';added++;
      }
      delete state.sel[key];
    });
    renderAll();
    toast('已加入 '+added+' 条'+(skipped?' · '+skipped+' 条已存在':''));
  }

  /* ── DSH 条目 ── */
  function renderDsh(){
    $('#dshBody').innerHTML=DSH_ROWS.map(function(r,i){
      return '<tr><td style="padding-left:16px"><span class="nm">'+esc(r.name)+'</span></td>'+
        '<td><span class="badge quiet">'+esc(r.transport)+'</span></td>'+
        '<td><span class="cmd">'+esc(r.cmd)+'</span></td>'+
        '<td><span class="badge" data-tone="'+r.tone+'">'+esc(r.label)+'</span></td>'+
        '<td style="padding-right:16px"><div class="row-actions">'+
          '<button class="op" data-dsh="edit" data-i="'+i+'">编辑</button>'+
          '<button class="op" data-dsh="toggle" data-i="'+i+'">'+(r.label==='已停用'?'启用':'停用')+'</button>'+
          '<button class="op warn" data-dsh="del" data-i="'+i+'">删除</button>'+
        '</div></td></tr>';
    }).join('')||'<tr><td colspan="5" class="empty">无条目</td></tr>';
    $$('[data-dsh]').forEach(function(b){b.onclick=function(){
      var i=Number(b.dataset.i),r=DSH_ROWS[i],act=b.dataset.dsh;
      if(act==='edit')openDrawerFor({kind:'dsh',key:r.name},r.name,r.cmd,r.transport);
      else if(act==='toggle'){
        var off=r.label==='已停用';
        r.label=off?'已启用':'已停用';r.tone=off?'same':'changed';
        renderAll();toast(r.name+' 已'+(off?'启用':'停用'));
      }else{
        var target=r.name;
        openConfirm({title:'删除 '+target+'？',desc:'从 DSH 条目移除',confirm:'删除',
          rows:[['条目',target],['命令',r.cmd]],
          onConfirm:function(){
            var j=-1;DSH_ROWS.forEach(function(x,k){if(x.name===target)j=k;});
            if(j>=0)DSH_ROWS.splice(j,1);
            renderAll();toast('已删除 '+target);
          }});
      }
    };});
  }

  /* ── 来源注册表 ── */
  function sourceForm(mode){
    var d=state.srcDraft;
    return '<tr class="src-form"><td colspan="7">'+
      '<div style="display:grid;grid-template-columns:1.3fr 1.2fr .8fr 1.8fr auto;gap:9px;align-items:end">'+
      '<div><span class="lbl">工具名</span><input class="cell-input" data-draft="label" value="'+esc(d.label||'')+'" placeholder="My Tool"></div>'+
      '<div><span class="lbl">id</span><input class="cell-input" data-draft="id" value="'+esc(d.id||'')+'" placeholder="my-tool"></div>'+
      '<div><span class="lbl">格式</span><select class="cell-input" data-draft="fmt">'+
        ['json','toml','yaml','opencode','dsh'].map(function(f){return '<option'+(d.fmt===f?' selected':'')+'>'+f+'</option>';}).join('')+'</select></div>'+
      '<div><span class="lbl">命中文件</span><input class="cell-input" data-draft="path" value="'+esc(d.path||'')+'" placeholder="~/.config/my-tool/mcp.json"></div>'+
      '<div style="display:flex;gap:6px"><button class="btn primary sm" id="saveSource">保存</button><button class="btn sm" id="cancelSource">取消</button></div>'+
      '</div></td></tr>';
  }
  function renderSources(){
    var list=SOURCES.filter(function(s){return !state.onlyCustom||s.custom;});
    var html='';
    if(state.srcCreating)html+=sourceForm('new');
    if(!list.length)html+='<tr><td colspan="7" class="empty">无自定义源</td></tr>';
    list.forEach(function(s){
      if(state.srcEdit===s.id){html+=sourceForm('edit');return;}
      var open=!!state.expanded[s.id];
      html+='<tr><td style="padding-left:16px"><span class="nm">'+esc(s.label)+'</span></td>'+
        '<td><span class="mono">'+esc(s.id)+'</span> <span class="badge quiet">'+esc(s.fmt)+'</span></td>'+
        '<td><span class="badge quiet">'+(s.custom?'自定义':'builtin')+'</span></td>'+
        '<td>'+(s.off?'<span class="subtle">—</span>':'<span class="mono">'+esc(pathsFor(s)[0])+'</span>')+'</td>'+
        '<td><span class="mono">'+itemsFor(s.id).length+'</span></td>'+
        '<td>'+(s.ro?'<span class="badge" data-tone="missing">只读</span>':'<span class="badge" data-tone="same">可同步</span>')+'</td>'+
        '<td style="padding-right:16px"><div class="row-actions">'+
          '<button class="op" data-sact="expand" data-sid="'+esc(s.id)+'">'+(open?'收起':'展开')+'</button>'+
          '<button class="op" data-sact="edit" data-sid="'+esc(s.id)+'">编辑源</button>'+
        '</div></td></tr>';
      if(open)html+='<tr class="src-detail"><td colspan="7"><div class="lbl">候选路径</div>'+
        pathsFor(s).map(function(p){return '<span class="mono">'+esc(p)+'</span>';}).join('')+
        '<div class="lbl" style="margin-top:8px">容器键</div><span class="mono">'+esc(s.fmt==='toml'?'mcp_servers':'mcpServers / servers')+'</span></td></tr>';
    });
    $('#sourceBody').innerHTML=html;
    $('#onlyCustomBtn').classList.toggle('active',state.onlyCustom);
    $('#onlyCustomBtn').textContent=state.onlyCustom?'显示全部':'仅看自定义';
    $$('[data-draft]',$('#sourceBody')).forEach(function(el){el.oninput=el.onchange=function(){
      state.srcDraft[el.dataset.draft]=el.value;
    };});
    var sv=$('#saveSource');
    if(sv)sv.onclick=saveSource;
    var cc=$('#cancelSource');
    if(cc)cc.onclick=function(){state.srcCreating=false;state.srcEdit=null;state.srcDraft={};renderSources();};
    /* 属性名与左侧工具列表的 data-src 隔离，且限定在来源表内查询 */
    $$('[data-sact]',$('#sourceBody')).forEach(function(b){b.onclick=function(){
      var id=b.dataset.sid,act=b.dataset.sact;
      if(!srcById(id))return;
      if(act==='expand'){if(state.expanded[id])delete state.expanded[id];else state.expanded[id]=true;renderSources();}
      else{
        var s=srcById(id);
        state.srcEdit=id;state.srcCreating=false;
        state.srcDraft={label:s.label,id:s.id,fmt:s.fmt,path:pathsFor(s)[0]};
        renderSources();
      }
    };});
  }
  function saveSource(){
    var d=state.srcDraft,label=String(d.label||'').trim(),id=String(d.id||'').trim();
    if(!label||!id){toast('工具名与 id 不能为空');return;}
    var wasEdit=!!state.srcEdit,msg;
    if(wasEdit){
      var oldId=state.srcEdit,s=srcById(oldId);
      if(srcById(id)&&id!==oldId){toast('id 已存在');return;}
      if(s){
        if(id!==oldId){
          ITEMS[id]=ITEMS[oldId]||[];delete ITEMS[oldId];
          if(state.expanded[oldId]){state.expanded[id]=true;delete state.expanded[oldId];}
          if(state.src===oldId)state.src=id;
          Object.keys(state.sel).forEach(function(k){if(k.indexOf(oldId+'::')===0){
            state.sel[id+k.slice(oldId.length)]=true;delete state.sel[k];}});
        }
        s.id=id;s.label=label;s.fmt=d.fmt||'json';s.meta=id+' · '+s.fmt;
        s.customPath=d.path||'';
      }
      msg='已保存 '+label;
    }else{
      if(srcById(id)){toast('id 已存在');return;}
      SOURCES.push({id:id,label:label,fmt:d.fmt||'json',meta:id+' · '+(d.fmt||'json'),
        ro:false,off:false,custom:true,customPath:d.path||''});
      ITEMS[id]=[];
      msg='已添加 '+label;
    }
    state.srcCreating=false;state.srcEdit=null;state.srcDraft={};
    renderAll();toast(msg);
  }

  /* ── 维护与自检 ── */
  function renderChecks(){
    $('#checkList').innerHTML=CHECKS.map(function(c){
      var cls=c.state==='ok'?'ok':c.state==='warn'?'warn':'run';
      var mark=c.state==='ok'?'✓':c.state==='warn'?'!':'·';
      return '<div class="check-item"><span class="check-mark '+cls+'">'+mark+'</span>'+esc(c.label)+'</div>';
    }).join('');
    var warn=CHECKS.filter(function(c){return c.state==='warn';}).length;
    var run=CHECKS.filter(function(c){return c.state==='run';}).length;
    $('#checkSummary').textContent=run?'检查中':(warn?warn+' 项警告':'全部通过');
  }
  /* 备份文件目录：输入框常驻；手动输入回车 / 失焦保存、Esc 还原；浏览选完直接保存 */
  function setDirDirty(on){
    state.dirDirty=!!on;
    var inp=$('#backupDirInput');
    if(inp)inp.classList.toggle('dirty',state.dirDirty);
    var dot=$('#dirDirty');
    if(dot)dot.style.visibility=state.dirDirty?'visible':'hidden';
  }
  function saveBackupDir(v){
    var s=String(v||'').trim();
    var inp=$('#backupDirInput');
    if(!s){
      if(inp)inp.value=state.backupDir;
      setDirDirty(false);state.dirPartial=false;
      toast('目录不能为空');
      return;
    }
    var changed=s!==state.backupDir;
    state.backupDir=s;
    state.backupDirConfigured=true;
    if(inp)inp.value=s;
    setDirDirty(false);state.dirPartial=false;
    if(changed){storeBackupDir(s);toast('备份目录已保存');}
  }
  function onDirBlur(){
    if(state.dirPicking)return;
    var inp=$('#backupDirInput');
    /* 只有目录名的回退态不自动落盘，等用户补全 */
    if(inp&&state.dirDirty&&!state.dirPartial)saveBackupDir(inp.value);
  }
  /* 宿主桥契约（真实落地由宿主注入 window.dshHost）：
     pickDirectory(): Promise<string>              原生目录窗口，直接给绝对路径
     getPathForFile(file): string                 Electron >=32 webUtils.getPathForFile，给文件绝对路径
     渲染进程自身在标准浏览器里永远拿不到绝对路径（webkitRelativePath 只有目录名）。 */
  function hostBridge(){return window.dshHost||null;}
  /* 统一 Windows 反斜杠；折叠重复斜杠（宿主可能返回被双重转义的路径）；保留 UNC 前缀 */
  function normDir(p){
    var s=String(p||'').trim(),unc=/^\\\\/.test(s);
    s=s.replace(/\\/g,'/').replace(/\/{2,}/g,'/');
    if(unc)s='//'+s.replace(/^\/+/,'');
    return s.replace(/\/$/,'');
  }
  function resolvePickedDir(f){
    if(!f)return null;
    var p='',host=hostBridge();
    if(host&&typeof host.getPathForFile==='function'){
      try{p=String(host.getPathForFile(f)||'');}catch(e){}
    }
    if(!p&&f.path)p=String(f.path);           /* Electron <32 的非标准 File.path */
    if(p){
      p=normDir(p);
      /* 若末段就是文件名则取父目录；宿主若直接给目录路径则原样使用 */
      var last=p.split('/').pop(),d=(String(f.name||'')===last)?p.replace(/\/[^/]*$/,''):p;
      return {dir:d||p,partial:false};
    }
    var rel=String(f.webkitRelativePath||'').split('/')[0];
    return rel?{dir:rel,partial:true}:null;   /* 浏览器沙箱：只有目录名 */
  }
  function applyPickedDir(res){
    if(!res||!res.dir){toast('未能读取目录');return;}
    var inp=$('#backupDirInput');
    if(inp)inp.onblur=null;                    /* 摘掉失焦保存，避免一次选择写两次 */
    if(document.activeElement&&document.activeElement.blur)document.activeElement.blur();
    if(inp)inp.value=res.dir;
    if(!res.partial){
      saveBackupDir(res.dir);                  /* 完整绝对路径：选完即保存 */
    }else{
      /* 兼容：浏览器沙箱只给目录名（空文件夹时连文件都没有）。
         不再让用户手敲绝对路径——交给 /settings 在可信根目录下按名字解析；
         解析失败时保留输入并给出可操作的提示。 */
      state.dirPartial=false;
      saveBackupDir(res.dir, true);
    }
    if(inp)inp.onblur=onDirBlur;
  }
    function openDirDialog(){
    /* 首选：宿主原生目录窗口（POST /browse-dir 直接给绝对路径），不经浏览器上传控件 */
    postJson('/browse-dir', {}).then(function(j){
      if(j && j.ok && j.path){ applyPickedDir({ dir: normDir(j.path), partial: false }); }
      else { browserPickDir(); }
    }).catch(function(){ browserPickDir(); });
  }
  function browserPickDir(){
    state.dirPicking=true;
    if(window.showDirectoryPicker){
      window.showDirectoryPicker().then(function(x){
        state.dirPicking=false;
        if(x)applyPickedDir({dir:x.name||'',partial:true});
      }).catch(function(){state.dirPicking=false;});
      return;
    }
    var picker=$('#backupDirPicker');
    if(picker&&'webkitdirectory' in picker){picker.value='';picker.click();return;}
    state.dirPicking=false;toast('当前环境不支持目录选择，请手动输入路径');
  }
  (function(){
    var picker=$('#backupDirPicker');
    if(!picker)return;
    picker.addEventListener('change',function(){
      /* 先快照再清空 value：部分 Chromium 清空后 FileList 会跟着变空 */
      var list=picker.files, count=list?list.length:0, first=count?list[0]:null;
      var fallbackName='';
      try{fallbackName=String(picker.value||'').split(/[\\/]/).pop()||'';}catch(e){}
      picker.value='';
      state.dirPicking=false;
      if(!count){
        /* 空文件夹：Chrome 的 value 常带 C:\fakepath\<目录名>，取出来照样能解析；
           但部分 Chromium 对空目录连 fakepath 都不给（files / value 全空），
           沙箱里此时已无任何可用信息。别再弹一句无法执行的提示——把焦点
           交回输入框，引导粘贴完整路径后回车，由 /settings 直接落盘。 */
        if(fallbackName){applyPickedDir({dir:fallbackName,partial:true});return;}
        state.dirPartial=false;setDirDirty(false);
        var manual=$('#backupDirInput');
        if(manual){manual.focus();manual.select();}
        toast('空文件夹读不到路径：请粘贴完整路径后按回车（例如 '+DEFAULT_BACKUP_DIR+'）');
        return;
      }
      applyPickedDir(resolvePickedDir(first));
    });
    picker.addEventListener('cancel',function(){state.dirPicking=false;});
    /* 系统窗口关闭后浏览器窗口重新聚焦：兜底复位（部分 Chromium 不发 cancel） */
    onWin('focus',function(){
      if(!state.dirPicking)return;
      setTimeout(function(){state.dirPicking=false;},150);
    });
  })();
  function renderBackupDir(){
    var row=$('#backupDirRow');
    var cur=$('#backupDirInput');
    /* 幂等：已渲染则不重建 DOM，避免 renderAll 打断正在输入的内容 */
    if(cur){
      if(document.activeElement!==cur&&!state.dirDirty)cur.value=state.backupDirConfigured?state.backupDir:'';
      setDirDirty(state.dirDirty);
      return;
    }
    row.innerHTML='<span class="lbl">备份文件目录</span>'+
      '<input class="cell-input" id="backupDirInput" data-tip="直接输入路径，回车保存；Esc 还原" spellcheck="false" placeholder="'+esc(DEFAULT_BACKUP_DIR)+'" value="'+esc(state.backupDirConfigured?state.backupDir:'')+'">'+
      '<span class="dir-dot" id="dirDirty" style="visibility:hidden"></span>'+
      '<button class="op dir-browse">浏览</button>';
    var inp=$('#backupDirInput');
    inp.oninput=function(){
      state.dirPartial=false;                 /* 一旦动手补全，就按正常未保存态处理 */
      setDirDirty(this.value.trim()!==state.backupDir);
    };
    inp.onkeydown=function(e){
      if(e.key==='Enter'){e.preventDefault();state.dirPartial=false;saveBackupDir(this.value);}
      else if(e.key==='Escape'){e.preventDefault();state.dirPartial=false;this.value=state.backupDir;setDirDirty(false);}
    };
    inp.onblur=onDirBlur;
    /* 点「浏览」不抢输入框焦点，避免半截输入被失焦保存 */
    var browse=$('.dir-browse',row);
    browse.onmousedown=function(e){e.preventDefault();};
    browse.onclick=openDirDialog;
  }
  function renderBackups(){
    $('#backupList').innerHTML=BACKUPS.map(function(b,i){
      return '<div class="backup-row'+(b.rolled?' rolled':'')+'">'+
        '<span class="mono">'+esc(b.time)+'</span><span class="grow"><span class="bf">'+esc(b.file)+'</span>'+
        (b.dir?'<span class="bdir" title="'+esc(b.dir)+'">'+esc(b.dir)+'</span>':'')+'</span>'+
        '<span class="subtle">'+esc(b.size)+'</span>'+
        (b.rolled?'<span class="badge quiet">已回滚</span>':'<button class="op" data-rollback="'+i+'">回滚</button>')+
      '</div>';
    }).join('')||'<div class="empty">无备份</div>';
    $$('[data-rollback]').forEach(function(b){b.onclick=function(){
      var i=Number(b.dataset.rollback),bk=BACKUPS[i];
      openConfirm({title:'回滚 '+bk.file+'？',desc:'恢复该备份，回滚前自动快照',confirm:'回滚',
        rows:[['备份时间',bk.time],['目标文件',bk.file],['备份目录',state.backupDir]],
        onConfirm:function(){
          BACKUPS[i].rolled=true;
          BACKUPS.unshift({time:now(),file:bk.file+'.before-rollback',size:bk.size,rolled:false,dir:state.backupDir});
          DSH_ROWS.forEach(function(r){if(r.tone==='missing'){r.tone='same';r.label='已启用';}});
          renderAll();toast('已回滚 '+bk.file);
        }});
    };});
  }
  function runSelfCheck(){
    var btn=$('#selfCheckBtn');btn.disabled=true;btn.textContent='自检中…';
    CHECKS.forEach(function(c){c.state='run';});renderChecks();
    CHECKS.forEach(function(c,i){
      setTimeout(function(){
        c.state='ok';
        renderChecks();
        if(i===CHECKS.length-1){btn.disabled=false;btn.textContent='运行自检';toast('自检完成 · 全部通过');}
      },220*(i+1));
    });
  }
  function rescan(){
    var btn=$('#rescanBtn');btn.disabled=true;
    $('#rescanLabel').textContent='扫描中…';$('#rescanIcon').classList.add('spin');
    setTimeout(function(){
      var found=0;
      if(PENDING_SCAN.length){
        var p=PENDING_SCAN.shift();
        if(ITEMS[p.sid])ITEMS[p.sid].push({name:p.name,status:'new',transport:'stdio',cmd:p.cmd,dup:'',secret:false});
        found=1;
      }
      state.scanAt=now();
      renderAll();
      btn.disabled=false;$('#rescanLabel').textContent='刷新扫描';$('#rescanIcon').classList.remove('spin');
      toast(found?'扫描完成 · 新增 '+found+' 条':'扫描完成 · 无新增');
    },620);
  }

  function renderAll(){
    renderRail();renderStats();updateChipCounts();renderTable();updateSel();
    renderDsh();renderSources();renderChecks();renderBackups();renderBackupDir();updateSubmit();
  }

  /* ── 确认弹窗（写回 / 删除 / 回滚共用） ── */
  function openConfirm(o){
    state.modalAction=o.onConfirm;
    $('#modalTitle').textContent=o.title;
    $('#modalDesc').textContent=o.desc||'';
    $('#modalBody').innerHTML=(o.rows||[]).map(function(r){
      return '<div class="kv"><span>'+esc(r[0])+'</span><span>'+esc(r[1])+'</span></div>';
    }).join('');
    $('#confirmModal').textContent=o.confirm||'确认';
    $('#modal').classList.add('show');$('#overlay').classList.add('show');
  }
  function closeAll(){
    $('#overlay').classList.remove('show');$('#drawer').classList.remove('show');
    $('#modal').classList.remove('show');state.modalAction=null;
  }

  /* ── 抽屉：新增 / 编辑 DSH / 改配置 共用一套表单 ── */
  function renderEnvRows(list){
    $('#envRows').innerHTML=(list||[]).map(function(e,i){
      return '<div class="env-row" data-env="'+i+'">'+
        '<input class="k" data-envk placeholder="KEY" value="'+esc(e.k)+'">'+
        '<input data-envv placeholder="VALUE" value="'+esc(e.v)+'">'+
        '<button class="del" data-envdel="'+i+'">✕</button></div>';
    }).join('');
    $$('[data-envk],[data-envv]').forEach(function(el){el.oninput=updateManualPreview;});
    $$('[data-envdel]').forEach(function(b){b.onclick=function(){
      $$('.env-row').forEach(function(r){if(r.dataset.env===b.dataset.envdel)r.remove();});
      updateManualPreview();
    };});
  }
  function readEnv(){
    return $$('.env-row').map(function(r){
      return {k:$('[data-envk]',r).value.trim(),v:$('[data-envv]',r).value.trim()};
    }).filter(function(e){return e.k;});
  }
  function readManual(){
    var t=$('#manualTransport').value;
    var args=$('#manualArgs').value.split(/\r?\n/).map(function(x){return x.trim();}).filter(Boolean);
    var cmd=t==='http'?$('#manualUrl').value.trim():[$('#manualCmd').value.trim()].concat(args).filter(Boolean).join(' ');
    return {name:$('#manualName').value.trim(),transport:t==='http'?'http':'stdio',cmd:cmd,
      args:args,url:t==='http'?$('#manualUrl').value.trim():'',env:readEnv()};
  }
  function updateManualPreview(){
    var m=readManual(),env={};m.env.forEach(function(e){env[e.k]=e.v?'••••':'';});
    var body={serverName:m.name,transport:m.transport,command:m.transport==='http'?'':(m.cmd.split(' ')[0]||''),
      args:m.transport==='http'?[]:m.args,env:env};
    if(m.transport==='http')body.url=m.url;
    var txt=Object.keys(body).map(function(k){
      return '<span class="k">"'+esc(k)+'"</span>: <span class="v">'+esc(JSON.stringify(body[k]))+'</span>';
    }).join(',\n');
    $('#manualPreview').innerHTML=txt;
  }
  function syncTransport(){
    var http=$('#manualTransport').value==='http';
    $('#localSection').classList.toggle('hidden',http);
    $('#remoteSection').classList.toggle('hidden',!http);
    updateManualPreview();
  }
  function openDrawerFor(edit,name,cmd,transport){
    state.edit=edit||{kind:'new'};
    var kind=state.edit.kind;
    $('#drawerTitle').textContent=kind==='new'?'新增 MCP 服务':kind==='dsh'?'编辑 · '+name:'改配置 · '+name;
    $('#manualName').value=name||'';
    var http=transport==='http'||transport==='sse'||transport==='streamable-http';
    $('#manualTransport').value=http?'http':'stdio';
    var parts=String(cmd||'').split(' ');
    $('#manualCmd').value=http?'':(parts[0]||'');
    $('#manualArgs').value=http?'':parts.slice(1).join('\n');
    $('#manualUrl').value=http?String(cmd||''):'';
    renderEnvRows([]);
    setPane('manual');syncTransport();openDrawer();
  }
  function openDrawer(){$('#overlay').classList.add('show');$('#drawer').classList.add('show');}
  function setPane(name){
    state.pane=name;
    $$('#seg button').forEach(function(x){x.classList.toggle('active',x.dataset.pane===name);});
    $$('.pane').forEach(function(p){p.classList.toggle('active',p.id==='pane-'+name);});
    updateSubmit();
  }
  function updateSubmit(){
    var btn=$('#drawerSubmit'),n=Object.keys(state.picked).length;
    if(state.pane==='import'){btn.textContent='导入选中 '+n+' 条';btn.disabled=n===0;}
    else{btn.textContent=(state.edit&&state.edit.kind!=='new')?'保存修改':'写入 DSH';btn.disabled=false;}
  }
  function submitManual(){
    var m=readManual();
    if(!m.name){toast('服务名不能为空');return;}
    if(!m.cmd){toast(m.transport==='http'?'URL 不能为空':'命令不能为空');return;}
    var k=state.edit?state.edit.kind:'new';
    if(k==='new'){
      if(DSH_ROWS.some(function(r){return r.name===m.name;})){toast('服务名已存在');return;}
      DSH_ROWS.push({name:m.name,transport:m.transport,cmd:m.cmd,tone:'same',label:'已启用',env:m.env});
      toast('已写入 '+m.name);
    }else if(k==='dsh'){
      var row=DSH_ROWS.filter(function(r){return r.name===state.edit.key;})[0];
      if(row){row.name=m.name;row.transport=m.transport;row.cmd=m.cmd;row.env=m.env;}
      toast('已保存 '+m.name);
    }else{
      var sid=state.edit.key.split('::')[0],nm=state.edit.key.split('::').slice(1).join('::');
      var it=itemsFor(sid).filter(function(x){return x.name===nm;})[0];
      if(it){it.name=m.name;it.cmd=m.cmd;it.transport=m.transport;
        delete state.sel[sid+'::'+nm];delete state.wb[sid+'::'+nm];}
      toast('已保存 '+m.name);
    }
    closeAll();renderAll();
  }

  /* ── 粘贴导入：按 lib/dialect.js 的容器键、方言字段与远程判定规则解析 ── */
  var MAP_KEYS = ['mcpServers','mcp_servers','servers','mcp','mcpServersList','context_servers'];
  var CONTAINER_KEYS = MAP_KEYS.concat(['settings','projects','$schema','imports','version']);
  var REMOTE_TYPES = {http:1,https:1,'streamable-http':1,streamablehttp:1,sse:1,remote:1};
  var LOCAL_TYPES = {stdio:1,local:1,command:1};
  var SECRET_RE = /KEY|PASSWORD|SECRET|TOKEN|AUTH|BEARER|COOKIE|CRED/i;

  function pickStr(){for(var i=0;i<arguments.length;i++){var v=arguments[i];if(typeof v==='string'&&v.trim())return v.trim();}return '';}
  function pickMap(){for(var i=0;i<arguments.length;i++){var v=arguments[i];if(v&&typeof v==='object'&&!Array.isArray(v))return v;}return {};}
  function isEntry(v){return !!v&&typeof v==='object'&&!Array.isArray(v)&&
    ['command','url','serverUrl','server_url','endpoint','args','transport','type','http_headers'].some(function(k){return v[k]!==undefined;});}
  function normName(n){
    var s=String(n||'').replace(/[^A-Za-z0-9_-]/g,'');
    if(!s){var h=0,t=String(n||'mcp');for(var i=0;i<t.length;i++)h=(h*31+t.charCodeAt(i))>>>0;s='server-'+h.toString(36).slice(0,6);}
    return s;
  }
  function splitLine(line){
    var out=[],cur='',q=null,t=String(line||'').trim();
    for(var i=0;i<t.length;i++){var c=t[i];
      if(q!==null){if(c===q)q=null;else cur+=c;}
      else if(c==='"'||c==="'")q=c;
      else if(c===' '||c==='\t'){if(cur!==''){out.push(cur);cur='';}}
      else cur+=c;
    }
    if(cur!=='')out.push(cur);
    return out;
  }
  function normalize(name,raw){
    var type=String(raw.type||'').toLowerCase(),decl=String(raw.transport||'').toLowerCase();
    var remote=!!REMOTE_TYPES[type]||!!REMOTE_TYPES[decl],local=!!LOCAL_TYPES[type]||!!LOCAL_TYPES[decl];
    var url=pickStr(raw.url,raw.serverUrl,raw.server_url,raw.endpoint);
    var cmd = typeof raw.command==='string' ? raw.command : (Array.isArray(raw.command)?(raw.command.filter(function(x){return typeof x==='string';})[0]||''):'');
    var args = Array.isArray(raw.command)&&raw.command.length>1 ? raw.command.slice(1).filter(function(x){return typeof x==='string';})
            : Array.isArray(raw.args) ? raw.args.filter(function(x){return typeof x==='string';}) : [];
    var isRemote = remote ? true : local ? false : (url!==''&&!cmd);
    return {
      name:name, finalName:normName(name),
      transport:isRemote?'streamable-http':'stdio',
      command:isRemote?'':cmd, args:isRemote?[]:args, url:isRemote?url:'',
      env:pickMap(raw.env,raw.environment,raw.envVars),
      headers:pickMap(raw.headers,raw.http_headers,raw.httpHeaders,raw.requestHeaders),
      cwd:pickStr(raw.cwd,raw.workingDirectory,raw.workdir)
    };
  }
  function looseJson(text){
    var out='',q=null,i=0,c,n;
    while(i<text.length){
      c=text[i];n=text[i+1];
      if(q){if(c==='\\'){out+=c+(n||'');i+=2;continue;}if(c===q){q=null;out+='"';i++;continue;}out+=c;i++;continue;}
      if(c==='"'||c==="'"){q=c;out+='"';i++;continue;}
      if(c==='/'&&n==='/'){while(i<text.length&&text[i]!=='\n')i++;continue;}
      if(c==='/'&&n==='*'){i+=2;while(i<text.length&&!(text[i]==='*'&&text[i+1]==='/'))i++;i+=2;continue;}
      out+=c;i++;
    }
    return out.replace(/,\s*([}\]])/g,'$1');
  }
  function collect(obj,key){
    var container=null,used=key||'';
    if(!used){for(var i=0;i<MAP_KEYS.length;i++){if(obj[MAP_KEYS[i]]!=null){container=obj[MAP_KEYS[i]];used=MAP_KEYS[i];break;}}}
    else container=obj[used];
    if(used==='mcp'&&container&&container.servers&&!Array.isArray(container.servers))container=container.servers;
    if(container==null){container=obj;used='';}
    var out=[];
    if(Array.isArray(container)){
      container.forEach(function(it){if(isEntry(it))out.push(normalize(pickStr(it.name,it.serverName,it.id)||'mcp-server',it));});
    }else if(container&&typeof container==='object'){
      Object.keys(container).forEach(function(n){if(CONTAINER_KEYS.indexOf(n)<0&&isEntry(container[n]))out.push(normalize(n,container[n]));});
    }
    if(!out.length&&isEntry(obj))out.push(normalize('mcp-server',obj));
    return {entries:out,key:used};
  }
  function tomlVal(v){
    v=String(v).trim();
    if(/^"(.*)"$/.test(v))return RegExp.$1;
    if(/^'(.*)'$/.test(v))return RegExp.$1;
    if(v==='true')return true; if(v==='false')return false;
    if(/^\[.*\]$/.test(v)){var s=v.slice(1,-1).trim();return s?s.split(',').map(function(x){return tomlVal(x);}):[];}
    if(/^\{.*\}$/.test(v)){var o={};v.slice(1,-1).split(',').forEach(function(p){var e=p.indexOf('=');if(e>0)o[p.slice(0,e).trim().replace(/^['"]|['"]$/g,'')]=tomlVal(p.slice(e+1));});return o;}
    return v;
  }
  function parseToml(text){
    var tables={},cur=null;
    text.split(/\r?\n/).forEach(function(line){
      var t=line.trim(); if(!t||t.charAt(0)==='#')return;
      var m=t.match(/^\[([^\]]+)\]\s*$/);
      if(m){cur=m[1].trim();if(!tables[cur])tables[cur]={};return;}
      var e=t.indexOf('='); if(e<0||!cur)return;
      tables[cur][t.slice(0,e).trim()]=tomlVal(t.slice(e+1));
    });
    var out=[];
    Object.keys(tables).forEach(function(path){
      var p=path.split('.'); if(p.length!==2||p[0]!=='mcp_servers')return;
      var raw={},base=tables[path];
      Object.keys(base).forEach(function(k){raw[k]=base[k];});
      if(tables[path+'.env'])raw.env=tables[path+'.env'];
      if(tables[path+'.http_headers'])raw.http_headers=tables[path+'.http_headers'];
      out.push(normalize(p[1],raw));
    });
    return {entries:out,key:'mcp_servers'};
  }
  function parseImport(text){
    text=String(text||'').trim();
    if(!text)return {fmt:'',key:'',entries:[]};
    if(/^https?:\/\/\S+$/i.test(text))
      return {fmt:'URL',key:'',entries:[normalize('mcp-server',{url:text,type:'streamable-http'})]};
    var looksToml = /^\s*\[\s*[A-Za-z0-9_.-]+\s*\]\s*$/m.test(text) && !/^\s*\{/.test(text);
    if(looksToml){
      var t=parseToml(text);t.fmt='TOML';
      if(!t.entries.length)t.error='未识别到 mcp_servers 表';
      return t;
    }
    if(text.charAt(0)==='{'||text.charAt(0)==='['){
      var obj;
      try{obj=JSON.parse(looseJson(text));}
      catch(e){return {fmt:'JSON',key:'',entries:[],error:'解析失败'};}
      var r=collect(obj,'');r.fmt='JSON';return r;
    }
    var parts=splitLine(text);
    if(parts.length){
      var rest=parts.slice(1).filter(function(p){return p.charAt(0)!=='-';});
      var guess=rest.filter(function(p){return /[@/\\]|\.js$|\.py$/.test(p);})[0]||rest[0]||parts[0];
      var nm=normName(guess.split(/[/\\]/).pop().replace(/[^A-Za-z0-9_-]/g,''))||'mcp-server';
      return {fmt:'命令行',key:'',entries:[normalize(nm,{command:parts[0],args:parts.slice(1)})]};
    }
    return {fmt:'',key:'',entries:[]};
  }
  function hasSecret(it){
    var keys=Object.keys(it.env||{}).concat(Object.keys(it.headers||{}));
    return keys.some(function(k){return SECRET_RE.test(k);});
  }
  function renderImport(res){
    state.parsed=res.entries;state.picked={};
    $('#parseMeta').textContent = res.error ? res.error
      : res.fmt+' · '+(res.key||'裸映射')+' · '+res.entries.length+' 条';
    if(!res.entries.length){$('#importResult').innerHTML='<div class="empty">未识别到条目</div>';updateSubmit();return;}
    $('#importResult').innerHTML='<table class="import-table"><thead><tr><th class="ic-cell"></th><th>服务名</th><th>传输</th><th>命令 / 地址</th><th>状态</th></tr></thead><tbody>'+
      res.entries.map(function(it,i){
        var exists=DSH_ROWS.some(function(r){return r.name===it.finalName;});
        var renamed=it.name!==it.finalName;
        var cmd=it.transport==='streamable-http'?it.url:[it.command].concat(it.args).join(' ');
        var tags=[];
        if(exists)tags.push('<span class="badge" data-tone="missing">已存在</span>');
        if(renamed)tags.push('<span class="badge" data-tone="changed">需改名</span>');
        if(hasSecret(it))tags.push('<span class="badge quiet">••••</span>');
        if(!tags.length)tags.push('<span class="badge" data-tone="same">可导入</span>');
        return '<tr><td class="ic-cell"><input type="checkbox" class="impcheck" data-i="'+i+'" '+(exists?'':'checked')+'></td>'+
          '<td><span class="nm">'+esc(it.finalName)+'</span>'+(renamed?'<span class="nm-sub">'+esc(it.name)+'</span>':'')+'</td>'+
          '<td><span class="badge quiet">'+esc(it.transport)+'</span></td>'+
          '<td><span class="icmd" title="'+esc(cmd)+'">'+esc(cmd)+'</span></td>'+
          '<td>'+tags.join(' ')+'</td></tr>';
      }).join('')+'</tbody></table>';
    $$('.impcheck').forEach(function(cb){
      if(cb.checked)state.picked[cb.dataset.i]=true;
      cb.onchange=function(){if(cb.checked)state.picked[cb.dataset.i]=true;else delete state.picked[cb.dataset.i];updateSubmit();};
    });
    updateSubmit();
  }

  /* ── 静态事件绑定 ── */
  $$('.tab').forEach(function(t){t.onclick=function(){
    $$('.tab').forEach(function(x){x.classList.remove('active')});t.classList.add('active');
    $$('.view').forEach(function(v){v.classList.remove('active')});$('#view-'+t.dataset.view).classList.add('active');
  };});
  /* 唯一筛选入口：chip。只改自身高亮与表格，不动统计卡、不动 tab、不动 view */
  function applyFilter(f){
    state.filter=f;
    $$('#chips .chip').forEach(function(x){x.classList.toggle('active',x.dataset.filter===f);});
    renderTable();
  }
  $$('#chips .chip').forEach(function(c){c.onclick=function(){applyFilter(c.dataset.filter);};});

  $('#rescanBtn').onclick=rescan;
  $('#selfCheckBtn').onclick=runSelfCheck;
  $('#railSearch').oninput=renderRail;
  $('#tableSearch').oninput=function(){state.q=this.value.trim().toLowerCase();renderTable();};
  $('#clearSel').onclick=function(){state.sel={};renderTable();updateSel();};
  $('#selectAll').onclick=function(){
    var src=srcById(state.src)||SOURCES[0];
    visibleItems(src).forEach(function(it){state.sel[state.src+'::'+it.name]=true;});
    renderTable();updateSel();
  };
  $('#adoptBtn').onclick=function(){adoptKeys(Object.keys(state.sel));};

  $('#addDshBtn').onclick=function(){openDrawerFor({kind:'new'},'','npx -y @modelcontextprotocol/server-example','stdio');};
  $('#onlyCustomBtn').onclick=function(){state.onlyCustom=!state.onlyCustom;renderSources();};
  $('#addSourceBtn').onclick=function(){
    state.srcCreating=true;state.srcEdit=null;state.srcDraft={label:'',id:'',fmt:'json',path:''};
    state.onlyCustom=false;renderSources();
  };

  $('#closeDrawer').onclick=closeAll;$('#cancelDrawer').onclick=closeAll;
  $('#overlay').onclick=closeAll;
  $('#cancelModal').onclick=closeAll;
  $('#confirmModal').onclick=function(){
    var f=state.modalAction;closeAll();if(f)f();
  };

  $$('#seg button').forEach(function(b){b.onclick=function(){setPane(b.dataset.pane);};});
  $('#parseBtn').onclick=function(){renderImport(parseImport($('#importText').value));};
  $('#addEnvBtn').onclick=function(){
    var d=document.createElement('div');d.className='env-row';
    var i=$$('.env-row').length;d.dataset.env=i;
    d.innerHTML='<input class="k" data-envk placeholder="KEY"><input data-envv placeholder="VALUE"><button class="del">✕</button>';
    $('#envRows').appendChild(d);
    $('[data-envk]',d).oninput=updateManualPreview;
    $('[data-envv]',d).oninput=updateManualPreview;
    $('.del',d).onclick=function(){d.remove();updateManualPreview();};
    updateManualPreview();
  };
  ['#manualName','#manualCmd','#manualArgs','#manualUrl'].forEach(function(s){$(s).oninput=updateManualPreview;});
  $('#manualTransport').onchange=syncTransport;
  $('#drawerSubmit').onclick=function(){
    if(state.pane==='import'){
      var picked=Object.keys(state.picked).map(function(i){return state.parsed[Number(i)];});
      var added=0;
      picked.forEach(function(it){
        if(DSH_ROWS.some(function(r){return r.name===it.finalName;}))return;
        DSH_ROWS.push({name:it.finalName,transport:it.transport==='streamable-http'?'http':it.transport,
          cmd:it.transport==='streamable-http'?it.url:[it.command].concat(it.args).join(' '),tone:'same',label:'已启用'});
        added++;
      });
      closeAll();renderAll();toast('已导入 '+added+' 条');
    }else submitManual();
  };

  /* 左侧工具列宽度可拖拽：CSS 变量 --rail-w，pointer capture 保证拖出元素也不断 */
  (function(){
    var rz=$('#resizer'),ws=$('#workspace'),startX=0,startW=0,on=false;
    function width(w){ws.style.setProperty('--rail-w',Math.max(180,Math.min(420,w))+'px');}
    rz.addEventListener('pointerdown',function(e){
      on=true;startX=e.clientX;startW=$('.rail',ws).getBoundingClientRect().width;
      rz.classList.add('dragging');document.body.style.userSelect='none';
      try{rz.setPointerCapture(e.pointerId);}catch(err){}
      e.preventDefault();
    });
    rz.addEventListener('pointermove',function(e){if(on)width(startW+e.clientX-startX);});
    function end(){if(!on)return;on=false;rz.classList.remove('dragging');document.body.style.userSelect='';}
    rz.addEventListener('pointerup',end);
    rz.addEventListener('pointercancel',end);
  })();
  /* 按钮功能提示：鼠标停留 550ms 后出现；规则表集中维护，动态渲染的按钮自动生效 */
  var TIP_RULES=[
    ['#rescanBtn',function(){return '重新扫描所有工具的 MCP 配置，刷新差异统计';}],
    ['[data-view="sync"]',function(){return '按工具查看扫描差异，加入新条目';}],
    ['[data-view="dsh"]',function(){return '查看和管理已写入 DSH 的条目';}],
    ['[data-view="sources"]',function(){return '管理扫描来源与自定义路径';}],
    ['[data-view="maint"]',function(){return '运行自检、查看并恢复改动前的备份';}],
    ['[data-filter="all"]',function(){return '显示全部条目';}],
    ['[data-filter="new"]',function(){return '只看源里有、DSH 里还没有的条目';}],
    ['[data-filter="changed"]',function(){return '只看两边配置不一致的条目';}],
    ['[data-filter="missing"]',function(){return '只看 DSH 有、源里已删除的条目';}],
    ['[data-filter="same"]',function(){return '只看两边一致的条目';}],
    ['#selectAll',function(){return '勾选当前工具下的所有条目';}],
    ['#clearSel',function(){return '清除所有勾选';}],
    ['#adoptBtn',function(){return '把勾选的条目写入 DSH 配置';}],
    ['#addDshBtn',function(){return '手工填写或粘贴导入一条 MCP 服务';}],
    ['#onlyCustomBtn',function(){return '只显示手动添加的来源';}],
    ['#addSourceBtn',function(){return '添加一个自定义扫描来源';}],
    ['#selfCheckBtn',function(){return '检查配置、依赖与同步链路';}],
    ['#closeDrawer',function(){return '关闭抽屉，不保存';}],
    ['[data-pane="manual"]',function(){return '逐字段填写一条服务';}],
    ['[data-pane="import"]',function(){return '粘贴配置文本，批量识别条目';}],
    ['#addEnvBtn',function(){return '增加一行环境变量';}],
    ['#parseBtn',function(){return '解析粘贴内容，列出可导入的条目';}],
    ['#cancelDrawer',function(){return '关闭抽屉，不保存';}],
    ['#drawerSubmit',function(){return '按当前表单写入或更新 DSH 条目';}],
    ['#cancelModal',function(){return '取消本次操作';}],
    ['#confirmModal',function(){return '确认执行本次操作';}],
    ['#saveSource',function(){return '保存来源设置';}],
    ['#cancelSource',function(){return '放弃编辑来源';}],
    ['[data-adopt]',function(){return '把这一条写入 DSH 配置';}],
    ['[data-edit]',function(){return '编辑这一条的命令 / 地址与参数';}],
    ['[data-modal]',function(){return '把这里的配置同步回这个工具自己的文件';}],
    ['[data-wb]',function(el){return el.classList.contains('on')?'关闭同步权限':'开启同步权限，默认只读';}],
    ['[data-dsh="edit"]',function(){return '编辑这条 DSH 条目';}],
    ['[data-dsh="toggle"]',function(el){return el.textContent.trim()==='停用'?'停用这条条目':'重新启用这条条目';}],
    ['[data-dsh="del"]',function(){return '删除这条 DSH 条目';}],
    ['[data-sact="expand"]',function(el){return el.textContent.trim()==='展开'?'查看该来源的候选路径与容器键':'收起候选路径';}],
    ['[data-sact="edit"]',function(){return '修改来源的工具名、id、格式与命中路径';}],
    ['[data-rollback]',function(){return '用这份备份恢复配置，恢复前会再生成一份快照';}],
    ['.dir-browse',function(){return '打开系统目录窗口选择备份文件夹，选完自动保存';}],
    ['[data-envdel],.del',function(){return '删除这一行环境变量';}],
    ['.rowcheck',function(){return '勾选这一条，可批量加入';}],
    ['.impcheck',function(){return '勾选后导入这一条';}],
    ['.rail-item',function(){return '查看这个工具扫描到的条目';}]
  ];
  function tipFor(el){
    var t=el.getAttribute('data-tip');
    if(t)return function(){return t;};
    for(var i=0;i<TIP_RULES.length;i++){
      try{if(el.matches(TIP_RULES[i][0]))return TIP_RULES[i][1];}catch(e){}
    }
    return null;
  }
  (function(){
    var box=$('#tip'),timer=null,target=null;
    function hide(){clearTimeout(timer);timer=null;target=null;box.classList.remove('show');}
    function show(el,fn){
      var txt=fn(el);if(!txt)return;
      box.textContent=txt;box.classList.add('show');
      var r=el.getBoundingClientRect(),b=box.getBoundingClientRect();
      var x=Math.min(Math.max(8,r.left+r.width/2-b.width/2),innerWidth-b.width-8);
      var y=r.bottom+8;
      if(y+b.height>innerHeight-8)y=Math.max(8,r.top-b.height-8);
      box.style.left=x+'px';box.style.top=y+'px';
    }
    function pick(node){
      if(!node||!node.closest)return null;
      var el=node.closest('button,input[type=checkbox],.rail-item,.write-toggle,[data-tip]');
      if(!el)return null;
      var fn=tipFor(el);
      return fn?{el:el,fn:fn}:null;
    }
    host.addEventListener('mouseover',function(e){
      var hit=pick(e.target);
      if(!hit){if(target&&!box.contains(e.target))hide();return;}
      if(target===hit.el)return;
      hide();target=hit.el;
      var el=hit.el,fn=hit.fn;
      timer=setTimeout(function(){if(target===el&&el.isConnected)show(el,fn);},550);
    });
    host.addEventListener('mouseout',function(e){
      if(!target)return;
      var to=e.relatedTarget;
      if(to&&target.contains(to))return;
      hide();
    });
    host.addEventListener('mousedown',hide,true);
    /* 滚动只收起已显示的提示，不打断尚未出现的延时计时（避免自动滚到按钮时提示被吞掉） */
    host.addEventListener('scroll',function(){if(box.classList.contains('show'))hide();},true);
    onWin('blur',hide);
  })();
  /* 初始渲染由适配层在 host 就绪后统一执行 */

/* ══════════════════════════════════════════════════════════════════════════
   真实数据适配层。
   利用同一函数作用域内函数声明提升，下面同名函数会覆盖原型里的内存实现；
   其余渲染 / 筛选 / 抽屉 / 提示 / 拖拽逻辑保持 v11 原型一字不改。
   ══════════════════════════════════════════════════════════════════════ */
var MG_API = '/mcp-global';
var MG_FIRST = true;
var RAW = {};
var UI_WIN;

function onWin(type, fn) {
  if (!UI_WIN) UI_WIN = [];
  window.addEventListener(type, fn);
  UI_WIN.push([type, fn]);
}
function disposeUI() {
  (UI_WIN || []).forEach(function (p) { try { window.removeEventListener(p[0], p[1]); } catch (e) {} });
  UI_WIN = [];
}
function apiGet(path) {
  return fetch(MG_API + path, { credentials: 'include' }).then(function (r) {
    if (!r.ok) return r.text().then(function (t) { throw new Error('HTTP ' + r.status + ' ' + t); });
    return r.json();
  });
}
function apiPost(path, body) {
  return fetch(MG_API + path, {
    method: 'POST', credentials: 'include',
    headers: { 'content-type': 'application/json' }, body: JSON.stringify(body || {})
  }).then(function (r) {
    return r.json().catch(function () { return {}; }).then(function (j) {
      if (!r.ok) throw new Error(j && j.error ? j.error : 'HTTP ' + r.status);
      return j;
    });
  });
}
function fail(e) { toast('操作失败：' + String(e && e.message ? e.message : e)); }
function busy(on, label) {
  var b = $('#rescanBtn'); if (!b) return;
  b.disabled = !!on;
  $('#rescanLabel').textContent = on ? (label || '处理中…') : '刷新扫描';
  if (on) $('#rescanIcon').classList.add('spin'); else $('#rescanIcon').classList.remove('spin');
}
function cmdOf(s) {
  var t = s.transport || 'stdio';
  if (t === 'stdio' || (!s.url && s.command)) return [s.command || ''].concat(s.args || []).filter(Boolean).join(' ');
  return s.url || '';
}
function hasSecret(s) {
  var keys = Object.keys(s.env || {}).concat(Object.keys(s.headers || {}));
  return keys.some(function (k) { return /KEY|PASSWORD|SECRET|TOKEN|AUTH|BEARER|COOKIE|CRED/i.test(k); })
    || String(s.url || '').indexOf('••') >= 0;
}
function serverPayload(s) {
  return {
    serverName: s.serverName || s.name || '', transport: s.transport || 'stdio',
    command: s.command || '', args: s.args || [], cwd: s.cwd || '', url: s.url || '',
    env: s.env || {}, headers: s.headers || {}
  };
}
function fmtTime(v) {
  if (!v) return '—';
  var d = new Date(v);
  if (isNaN(d.getTime())) return String(v);
  var p = function (n) { return n < 10 ? '0' + n : '' + n; };
  return p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
}
function fmtStamp(v) {
  var s = String(v || '');
  if (s.length >= 19 && s.charAt(4) === '-') return s.slice(5, 10) + ' ' + s.slice(11, 19).replace(/-/g, ':');
  return s;
}
function fmtSize(n) {
  var b = Number(n) || 0;
  return b < 1024 ? b + ' B' : b < 1048576 ? (b / 1024).toFixed(1) + ' KB' : (b / 1048576).toFixed(1) + ' MB';
}

function hydrate(scan, srcInfo) {
  var info = {};
  ((srcInfo && srcInfo.sources) || []).forEach(function (s) { info[s.id] = s; });
  RAW = {};
  SOURCES = (scan.sources || []).map(function (s) {
    return {
      id: s.id, label: s.label, fmt: s.format,
      meta: s.id + ' · ' + s.format + (s.containerKey ? ' · ' + s.containerKey : ''),
      ro: !s.writeBack, off: !s.exists,
      custom: !!(info[s.id] && info[s.id].custom),
      customPath: s.file || '', candidates: s.candidates || [], file: s.file || '',
      exists: !!s.exists, error: s.error || '', containerKey: s.containerKey || '', raw: s
    };
  });
  ITEMS = {};
  SOURCES.forEach(function (s) { ITEMS[s.id] = []; });
  (scan.servers || []).forEach(function (s) {
    var key = s.key; if (!key) return;
    if (!ITEMS[s.sourceId]) ITEMS[s.sourceId] = [];
    var st = s.status === 'gone' ? 'missing' : (s.status || 'same');
    if (!LABEL[st]) st = 'same';
    ITEMS[s.sourceId].push({
      key: key, name: s.serverName || s.name || key, status: st,
      transport: s.transport || 'stdio', cmd: cmdOf(s),
      dup: s.duplicateOf && s.duplicateOf.length ? '重复于: ' + s.duplicateOf.join(', ') : '',
      secret: hasSecret(s), raw: s
    });
    RAW[key] = s;
  });
  DSH_ROWS = (scan.servers || []).filter(function (s) { return s.inDsh; }).map(function (s) {
    return {
      id: s.id || '', name: s.serverName || s.name, transport: s.transport || 'stdio', cmd: cmdOf(s),
      tone: s.status === 'gone' ? 'missing' : (s.status === 'new' || s.status === 'changed' ? s.status : 'same'),
      label: (s.disabled || s.enabled === false) ? '已停用' : '已启用', raw: s
    };
  });
  BACKUPS = (scan.backups || []).map(function (b) {
    var files = b.files || [], targets = b.targets || [];
    var f = targets[0] ? targets[0].file : (files[0] || '');
    var base = String(f).split(/[\\/]/).pop() || '备份';
    return {
      time: fmtStamp(b.stamp), file: base,
      size: b.bytes ? fmtSize(b.bytes) : files.length + ' 个文件',
      rolled: false, dir: '', stamp: b.stamp, count: files.length
    };
  });
  CHECKS = [
    { label: 'js-yaml 解析', state: 'run' },
    { label: '安装包 / bundles', state: 'run' },
    { label: 'client.js (web)', state: 'run' },
    { label: 'DSH 受管行 ' + DSH_ROWS.length, state: 'run' },
    { label: '冷启动演练', state: 'run' },
    { label: '账本指纹', state: 'run' }
  ];
  state.backupDir = scan.backupDir || loadBackupDir();
  state.backupDirConfigured = !!(scan.backupDirConfigured);
  state.scanAt = fmtTime(scan.scannedAt);
  if (!SOURCES.some(function (s) { return s.id === state.src; })) state.src = (SOURCES[0] || {}).id || '';
  state.sel = {};
  state.wb = {};
  Object.keys(RAW).forEach(function (k) { if (RAW[k].pushBack) state.wb[k] = true; });
}

function applySelfTest(st) {
  var y = st.yaml || {}, r = y.resolved || {}, c = st.client || {}, rows = st.dshRows || [];
  CHECKS = [
    { label: 'js-yaml ' + (r.version || '?'), state: y.ok ? 'ok' : 'warn' },
    { label: '安装包 / bundles ' + (c.listedInBundles ? '✓' : '✗'), state: c.listedInBundles ? 'ok' : 'warn' },
    { label: 'client.js (web) ' + (c.clientFileExists ? '✓' : '✗'), state: c.clientFileExists ? 'ok' : 'warn' },
    { label: 'DSH 受管行 ' + rows.length, state: 'ok' },
    { label: '冷启动演练 ' + (st.patchExists ? '✓' : '✗'), state: st.patchExists && y.ok ? 'ok' : 'warn' },
    { label: '账本 ' + ((st.ledger && st.ledger.fingerprints) || 0) + ' 条指纹', state: 'ok' }
  ];
  renderChecks();
}

function reload(refresh, quiet) {
  MG_API_DOWN = false; // 兼容：先假设 API 可用；本函数失败再置位（横幅判定用）
  if (!quiet) busy(true, refresh ? '扫描中…' : '加载中…');
  return Promise.all([
    apiGet('/scan' + (refresh ? '?refresh=1' : '')),
    apiGet('/sources')
  ]).then(function (r) {
    if (!r) return; // catch 之后 .then 也会执行，此时 r 为 undefined，直接跳过避免二次渲染
    // 兼容：若此前显示过「API 不可用」横幅，恢复骨架可见性并移除横幅
    if (MG_HOST) {
      var app = MG_HOST.querySelector('#app');
      if (app) app.style.display = '';
      var bd = MG_HOST.querySelector('.mg-apidown');
      if (bd && bd.parentNode) bd.parentNode.removeChild(bd);
    }
    hydrate(r[0], r[1]);
    renderAll();
    if (!quiet && refresh) toast('扫描完成');
    if (MG_FIRST) {
      MG_FIRST = false;
      return apiGet('/selftest').then(applySelfTest).catch(function () {});
    }
  }).catch(function (e) {
    fail(e);
    MG_API_DOWN = true;
    // 兼容：首次引导失败且面板已挂载 → 多半本机 API 不可用，显示横幅而非静默空白
    if (!MG_BOOTED && MG_HOST) showApiUnavailable(e);
  }).then(function () {
    MG_BOOTED = true;
    if (!quiet) busy(false);
  });
}

/* ── 覆盖：路径取真实扫描结果 ── */
function pathsFor(s) {
  if (s && s.candidates && s.candidates.length) return s.candidates;
  return s && s.customPath ? [s.customPath] : [];
}
function fileFor(s) {
  return (s && s.file) || (s && s.candidates && s.candidates[0]) || (s && s.customPath) || '';
}

/* ── 覆盖：同步台表格（key 用真实 sourceId::name，动作走 API） ── */
function renderTable() {
  var src = srcById(state.src) || SOURCES[0] || { id: '', label: '—', meta: '', ro: true, file: '', candidates: [] };
  $('#srcTitle').textContent = src.label;
  $('#srcMeta').textContent = src.meta;
  var w = $('#srcWrite');
  w.textContent = src.ro ? '只读' : '可同步';
  if (src.ro) { w.classList.remove('quiet'); w.setAttribute('data-tone', 'missing'); }
  else { w.classList.add('quiet'); w.removeAttribute('data-tone'); }
  var rows = visibleItems(src);
  if (!rows.length) { $('#itemBody').innerHTML = '<tr><td colspan="6" class="empty">无条目</td></tr>'; return; }
  $('#itemBody').innerHTML = rows.map(function (it) {
    var key = it.key, on = !!state.wb[key];
    var sub = it.dup || (it.status === 'missing' ? '源里已删' : '');
    if (it.secret) sub += (sub ? ' · ' : '') + '<span class="secret">•••• 已打码</span>';
    return '<tr data-key="' + esc(key) + '">' +
      '<td class="c-check"><input type="checkbox" class="rowcheck" ' + (state.sel[key] ? 'checked' : '') + '></td>' +
      '<td class="c-name"><span class="nm">' + esc(it.name) + '</span><span class="nm-sub">' + sub + '</span></td>' +
      '<td class="c-status"><span class="badge" data-tone="' + it.status + '">' + LABEL[it.status] + '</span></td>' +
      '<td class="c-transport"><span class="badge quiet">' + esc(it.transport) + '</span></td>' +
      '<td class="c-cmd"><span class="cmd">' + esc(it.cmd) + '</span></td>' +
      '<td class="c-ops"><div class="ops">' +
        (it.status === 'new' ? '<button class="op primary" data-adopt="' + esc(key) + '">加入</button>' : '') +
        '<button class="op" data-edit="' + esc(key) + '">改配置</button>' +
        '<span class="write-toggle' + (on ? ' on' : '') + (src.ro ? ' ro' : '') + '" data-wb="' + esc(key) + '"><span class="switch"></span>允许同步回</span>' +
        '<button class="op warn' + (on ? '' : ' hidden') + ' wb-action" data-modal="' + esc(key) + '">同步回原工具</button>' +
      '</div></td></tr>';
  }).join('');
  $$('.rowcheck').forEach(function (cb) {
    cb.onchange = function () {
      var key = cb.closest('tr').dataset.key;
      if (cb.checked) state.sel[key] = true; else delete state.sel[key];
      updateSel();
    };
  });
  $$('.write-toggle').forEach(function (t) {
    t.onclick = function () {
      if (src.ro) { toast('该源只读'); return; }
      var key = t.dataset.wb, enabled = !state.wb[key];
      busy(true, '保存授权…');
      apiPost('/pushback', { key: key, enabled: enabled })
        .then(function () { return reload(false, true); })
        .catch(fail).then(function () { busy(false); });
    };
  });
  $$('[data-adopt]').forEach(function (b) {
    b.onclick = function () { adoptKeys([b.dataset.adopt]); };
  });
  $$('[data-modal]').forEach(function (b) {
    b.onclick = function () {
      var key = b.dataset.modal, raw = RAW[key] || {};
      var name = raw.serverName || raw.name || key.split('::').slice(1).join('::');
      openConfirm({
        title: '确认同步 ' + src.label + '？', desc: '需要本条已开启「允许同步回」', confirm: '确认同步',
        rows: [['目标文件', fileFor(src) || '—'], ['条目', name], ['备份目录', state.backupDir]],
        onConfirm: function () {
          busy(true, '写回中…');
          apiPost('/push', { key: key, action: 'upsert', server: serverPayload(raw) })
            .then(function () { return reload(true, true); })
            .then(function () { toast('已同步回 ' + name); })
            .catch(fail).then(function () { busy(false); });
        }
      });
    };
  });
  $$('[data-edit]').forEach(function (b) {
    b.onclick = function () {
      var key = b.dataset.edit;
      var it = (itemsFor(state.src) || []).filter(function (x) { return x.key === key; })[0] || { name: '', cmd: '', transport: 'stdio' };
      openDrawerFor({ kind: 'item', key: key }, it.name, it.cmd, it.transport);
    };
  });
}

/* ── 覆盖：加入 ── */
function adoptKeys(keys) {
  if (!keys.length) { toast('请先勾选条目'); return; }
  busy(true, '加入中…');
  apiPost('/adopt', { keys: keys }).then(function (out) {
    return reload(true, true).then(function () {
      var n = (out.created || []).length, s = (out.skipped || []).length;
      toast('已加入 ' + n + ' 条' + (s ? ' · ' + s + ' 条已存在' : ''));
    });
  }).catch(fail).then(function () { busy(false); });
}

/* ── 覆盖：DSH 条目 ── */
function renderDsh() {
  $('#dshBody').innerHTML = DSH_ROWS.map(function (r, i) {
    return '<tr><td style="padding-left:16px"><span class="nm">' + esc(r.name) + '</span></td>' +
      '<td><span class="badge quiet">' + esc(r.transport) + '</span></td>' +
      '<td><span class="cmd">' + esc(r.cmd) + '</span></td>' +
      '<td><span class="badge" data-tone="' + r.tone + '">' + esc(r.label) + '</span></td>' +
      '<td style="padding-right:16px"><div class="row-actions">' +
        '<button class="op" data-dsh="edit" data-i="' + i + '">编辑</button>' +
        '<button class="op" data-dsh="toggle" data-i="' + i + '">' + (r.label === '已停用' ? '启用' : '停用') + '</button>' +
        '<button class="op warn" data-dsh="del" data-i="' + i + '">删除</button>' +
      '</div></td></tr>';
  }).join('') || '<tr><td colspan="5" class="empty">无条目</td></tr>';
  $$('[data-dsh]').forEach(function (b) {
    b.onclick = function () {
      var i = Number(b.dataset.i), r = DSH_ROWS[i], act = b.dataset.dsh;
      if (!r) return;
      if (act === 'edit') openDrawerFor({ kind: 'dsh', key: r.id || r.name }, r.name, r.cmd, r.transport);
      else if (act === 'toggle') {
        var disabling = r.label !== '已停用';
        busy(true, '切换中…');
        apiPost('/dsh/toggle', { id: r.id, disabled: disabling })
          .then(function () { return reload(true, true); })
          .then(function () { toast(r.name + (disabling ? ' 已停用' : ' 已启用')); })
          .catch(fail).then(function () { busy(false); });
      } else {
        var target = r.name, id = r.id;
        openConfirm({
          title: '删除 ' + target + '？', desc: '从 DSH 条目移除', confirm: '删除',
          rows: [['条目', target], ['命令', r.cmd]],
          onConfirm: function () {
            busy(true, '删除中…');
            apiPost('/dsh/remove', { id: id })
              .then(function () { return reload(true, true); })
              .then(function () { toast('已删除 ' + target); })
              .catch(fail).then(function () { busy(false); });
          }
        });
      }
    };
  });
}

/* ── 覆盖：来源保存 ── */
function saveSource() {
  var d = state.srcDraft, label = String(d.label || '').trim(), id = String(d.id || '').trim();
  if (!label || !id) { toast('工具名与 id 不能为空'); return; }
  var path = String(d.path || '').trim();
  if (!path) { toast('命中文件路径不能为空'); return; }
  var wasEdit = !!state.srcEdit;
  busy(true, '保存源…');
  apiPost('/sources/add', { id: id, label: label, format: d.fmt || 'json', path: path, writeBack: false })
    .then(function () {
      state.srcCreating = false; state.srcEdit = null; state.srcDraft = {};
      return reload(true, true);
    })
    .then(function () { renderSources(); toast(wasEdit ? '已保存 ' + label : '已添加 ' + label); })
    .catch(fail).then(function () { busy(false); });
}

/* ── 覆盖：备份列表 / 回滚 ── */
function renderBackups() {
  $('#backupList').innerHTML = BACKUPS.map(function (b, i) {
    return '<div class="backup-row' + (b.rolled ? ' rolled' : '') + '">' +
      '<span class="mono">' + esc(b.time) + '</span><span class="grow"><span class="bf">' + esc(b.file) + '</span>' +
      (b.dir ? '<span class="bdir" title="' + esc(b.dir) + '">' + esc(b.dir) + '</span>' : '') + '</span>' +
      '<span class="subtle">' + esc(b.size) + '</span>' +
      (b.rolled ? '<span class="badge quiet">已回滚</span>' : '<button class="op" data-rollback="' + i + '">回滚</button>') +
    '</div>';
  }).join('') || '<div class="empty">无备份</div>';
  $$('[data-rollback]').forEach(function (b) {
    b.onclick = function () {
      var i = Number(b.dataset.rollback), bk = BACKUPS[i];
      openConfirm({
        title: '回滚 ' + bk.file + '？', desc: '恢复该备份，回滚前自动快照', confirm: '回滚',
        rows: [['备份时间', bk.time], ['目标文件', bk.file], ['备份目录', state.backupDir]],
        onConfirm: function () {
          busy(true, '回滚中…');
          apiPost('/backups/rollback', { stamp: bk.stamp })
            .then(function () { return reload(true, true); })
            .then(function () { toast('已回滚 ' + bk.file); })
            .catch(fail).then(function () { busy(false); });
        }
      });
    };
  });
}

/* ── 覆盖：自检 / 刷新扫描 ── */
function runSelfCheck() {
  var btn = $('#selfCheckBtn'); btn.disabled = true; btn.textContent = '自检中…';
  CHECKS.forEach(function (c) { c.state = 'run'; }); renderChecks();
  apiGet('/selftest').then(function (st) { applySelfTest(st); toast('自检完成'); })
    .catch(fail).then(function () { btn.disabled = false; btn.textContent = '运行自检'; });
}
function rescan() { reload(true); }

/* ── 覆盖：手工表单提交 ── */
function submitManual() {
  var m = readManual();
  if (!m.name) { toast('服务名不能为空'); return; }
  if (!m.cmd) { toast(m.transport === 'http' ? 'URL 不能为空' : '命令不能为空'); return; }
  var isHttp = m.transport === 'http';
  var payload = {
    serverName: m.name, transport: isHttp ? 'streamable-http' : 'stdio',
    command: isHttp ? '' : (m.cmd.split(/\s+/)[0] || ''),
    args: isHttp ? [] : (m.args || []), cwd: '', url: isHttp ? m.cmd : '',
    env: {}, headers: {}
  };
  m.env.forEach(function (e) { payload.env[e.k] = e.v; });
  var k = state.edit ? state.edit.kind : 'new';
  var req;
  if (k === 'new') req = apiPost('/dsh/add', { server: payload });
  else if (k === 'dsh') req = apiPost('/dsh/update', { id: state.edit.key, server: payload });
  else {
    if (!state.wb[state.edit.key]) { toast('请先开启该条目的「允许同步回」'); return; }
    req = apiPost('/push', { key: state.edit.key, action: 'upsert', server: payload });
  }
  busy(true, '保存中…');
  req.then(function () { closeAll(); return reload(true, true); })
    .then(function () { toast('已保存 ' + m.name); })
    .catch(fail).then(function () { busy(false); });
}

/* ── 覆盖：粘贴导入提交（逐条真实写入 DSH） ── */
$('#drawerSubmit').onclick = function () {
  if (state.pane !== 'import') { submitManual(); return; }
  var picked = Object.keys(state.picked).map(function (i) { return state.parsed[Number(i)]; }).filter(Boolean);
  if (!picked.length) { toast('请先勾选要导入的条目'); return; }
  busy(true, '导入中…');
  var chain = Promise.resolve(), added = 0;
  picked.forEach(function (it) {
    chain = chain.then(function () {
      if (DSH_ROWS.some(function (r) { return r.name === it.finalName; })) return null;
      var p = {
        serverName: it.finalName, transport: it.transport === 'streamable-http' ? 'streamable-http' : 'stdio',
        command: it.command || '', args: it.args || [], cwd: it.cwd || '', url: it.url || '',
        env: it.env || {}, headers: it.headers || {}
      };
      return apiPost('/dsh/add', { server: p }).then(function () { added += 1; });
    });
  });
  chain.then(function () { closeAll(); return reload(true, true); })
    .then(function () { toast('已导入 ' + added + ' 条'); })
    .catch(fail).then(function () { busy(false); });
};

/* ── 覆盖：备份目录保存 ── */
function saveBackupDir(v, keepOnError) {
  var s = String(v || '').trim(), inp = $('#backupDirInput');
  if (!s) {
    if (inp) inp.value = state.backupDir;
    setDirDirty(false); state.dirPartial = false; toast('目录不能为空'); return;
  }
  /* 兼容：localStorage 里可能残留上一次的值，但服务端 state.json 并未配置
     （例如上次保存失败）。此时即使用户输入的路径与本地值相同，也必须真正
     POST 一次 /settings，否则界面显示「已设置」而磁盘上其实没有。 */
  if (s === state.backupDir && state.backupDirConfigured) { setDirDirty(false); state.dirPartial = false; return; }
  busy(true, '保存目录…');
  apiPost('/settings', { backupDir: s }).then(function (out) {
    state.backupDir = out.backupDir || s;
    if (inp) inp.value = state.backupDir;
    setDirDirty(false); state.dirPartial = false;
    storeBackupDir(state.backupDir);
    toast('备份目录已保存');
  }).catch(function (e) {
    if (inp && !keepOnError) inp.value = state.backupDir;
    if (keepOnError) { state.dirPartial = true; setDirDirty(true); }
    else setDirDirty(false);
    fail(e);
  }).then(function () { busy(false); });
}

/* ── 覆盖：系统目录窗口（宿主原生对话框优先，拿完整绝对路径） ── */
function fallbackDirDialog() {
  var host = hostBridge();
  if (host && typeof host.pickDirectory === 'function') {
    state.dirPicking = true;
    Promise.resolve(host.pickDirectory()).then(function (p) {
      state.dirPicking = false;
      if (p) applyPickedDir({ dir: normDir(p), partial: false });
    }).catch(function () { state.dirPicking = false; });
    return;
  }
  /* 最后一级兜底：聚焦输入框，明确告诉用户粘贴完整路径即可，而不是给一句
     「重新选择」把人送回同一个拿不到路径的死循环。 */
  function manualHint() {
    state.dirPicking = false; state.dirPartial = false; setDirDirty(false);
    var manual = $('#backupDirInput');
    if (manual) { manual.focus(); manual.select(); }
    toast('当前环境无法弹出目录窗口：请粘贴完整路径后按回车（例如 ' + DEFAULT_BACKUP_DIR + '）');
  }
  /* <input webkitdirectory> 对空文件夹给不出任何信息，放在最末级。 */
  function webkitPick() {
    var picker = $('#backupDirPicker');
    if (!picker || !('webkitdirectory' in picker)) { manualHint(); return; }
    state.dirPicking = true;
    picker.value = ''; picker.click();
  }
  /* File System Access API 对空文件夹也能返回目录名，交给 /settings 在可信
     根目录下按名字解析成绝对路径；Electron 里可能抛 SecurityError，此时降级。 */
  if (window.showDirectoryPicker) {
    state.dirPicking = true;
    window.showDirectoryPicker().then(function (x) {
      state.dirPicking = false;
      if (x) applyPickedDir({ dir: x.name || '', partial: true });
    }).catch(function () { webkitPick(); });
    return;
  }
  webkitPick();
}
function openDirDialog() {
  state.dirPicking = true;
  apiPost('/browse-dir', {}).then(function (out) {
    state.dirPicking = false;
    if (out && out.ok && out.path) { applyPickedDir({ dir: normDir(out.path), partial: false }); return; }
    /* 用户在系统目录窗口里点了取消：尊重选择，不要再弹第二个窗口。 */
    if (out && out.reason === 'canceled') return;
    fallbackDirDialog();
  }).catch(function () { state.dirPicking = false; fallbackDirDialog(); });
}

/* ── 初始渲染（原型末尾的 renderAll 已移到此处，确保 ROOT 已就绪） ── */
renderEnvRows([]);
syncTransport();
renderImport(parseImport($('#importText').value));
renderAll();
reload(false);
return disposeUI;

    }
    function MGFace() {
      var ref = react.useRef(null);
      react.useEffect(function () {
        if (!ref.current) return;
        var dispose = MG_mountUI(ref.current);
        return function () { try { dispose && dispose(); } catch (e) {} };
      }, []);
      return h("div", { className: "mg-host", ref: ref,
        style: { height: "100%", minHeight: "calc(100vh - 28px)" } });
    }

    // ── 挂载：侧栏条目 + 主区面板 ──────────────────────────────────────────
    var inject = ["slots", "locale"];

    function apply(ctx) {
      ctx.effect(function () {
        try {
          return ctx.locale.register(NS, { zh: zh, en: en });
        } catch {
          return function () {};
        }
      }, NS + ": dictionaries");

      // 兼容：DSH < 0.1.x 可能未注入 locale；缺失时回退内置中文，避免界面变成 key 名。
      var t;
      try { t = ctx.locale ? ctx.locale.bind(NS) : null; } catch { t = null; }
      if (typeof t !== 'function') {
        t = function (k) { return zh[k] != null ? zh[k] : (en[k] != null ? en[k] : k); };
      }
      // 兼容：老版本 DSH 可能没有 ctx.slots（早期 0.1.x），无法注册侧栏入口。
      // 静默跳过，避免抛错导致插件整体加载失败（这类宿主本就无本面板入口，需 DSH ≥ 0.1.5）。
      if (!ctx.slots || typeof ctx.slots.inject !== 'function') {
        try { console.warn('[mcp-global-manager] 当前 DSH 缺少 slots 能力，未注册侧栏入口（需 DSH ≥ 0.1.5）'); } catch (e) {}
        return;
      }
      var label = function () {
        var value = t("entry.label");
        return typeof value === "string" && value !== "" && value !== "entry.label" ? value : "MCP全局管理";
      };
      var Face = function () { return h(MGFace, {}); };

      ctx.slots.inject("sidebar.panellist", function () {
        var disposeEntry;
        var disposeMain;
        try {
          disposeEntry = ctx.slots.register({
            name: "sidebar.panellist",
            id: ENTRY_ID,
            order: 22,
            label: label,
            locale: NS
          }, GlobalGlyph);
          disposeMain = ctx.slots.inject("main", function () {
            return ctx.slots.register({ name: "main", key: ENTRY_ID, locale: NS }, Face);
          });
        } catch {
          /* 宿主插槽不匹配时静默，别把整个界面带崩 */
        }
        return function () {
          try { disposeEntry && disposeEntry(); } catch {}
          try { disposeMain && disposeMain(); } catch {}
        };
      });
    }

    exports.apply = apply;
    exports.inject = inject;
    exports.name = "dsh-mcp-global-manager/client";
    // 仅供离线冒烟测试（tools/smoke-client.mjs）使用；宿主只读 apply/inject。
    exports.internals = {
      zh: zh,
      en: en,
      ENTRY_ID: ENTRY_ID,
      API: API,
      parseMap: parseMap,
      formatMap: formatMap,
      parseList: parseList,
      splitCommandLine: splitCommandLine,
      targetOf: targetOf,
      dshIdOf: dshIdOf,
      filterRows: filterRows,
      countByStatus: countByStatus,
      isGroupOpen: isGroupOpen,
      addArgRow: addArgRow,
      checkMapText: checkMapText,
      validateServerForm: validateServerForm,
      formFromServer: formFromServer,
      payloadFromForm: payloadFromForm,
      selftestSummary: selftestSummary,
      GlobalGlyph: GlobalGlyph,
      Modal: Modal,
      MapRows: MapRows,
      ServerForm: ServerForm,
      ExternalRow: ExternalRow,
      DshRow: DshRow,
      MCPGlobalPanel: MCPGlobalPanel,
      MGFace: MGFace,
      MG_mountUI: MG_mountUI
    };
    return module.exports;
  }
});
