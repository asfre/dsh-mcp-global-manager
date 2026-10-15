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

    // ── 文案 ────────────────────────────────────────────────────────────────
    var zh = {
      "entry.label": "MCP全局管理",
      "title": "MCP 全局管理",
      "hint": "扫描本机各工具的 MCP 配置：采纳进 DSH、授权后写回、DSH 侧直接增删改。外部工具里删掉的条目只标记提示，不会自动删 DSH 的行。",
      "refresh": "刷新扫描",
      "refreshing": "扫描中…",
      "adoptSelected": "采纳选中",
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
      "dshAdd": "新增 DSH 条目",
      "dshEdit": "编辑",
      "dshSave": "保存",
      "dshCancel": "取消",
      "dshRemove": "删除",
      "dshToggleOn": "停用",
      "dshToggleOff": "启用",
      "adopt": "采纳到 DSH",
      "editForm": "改配置",
      "pushUpsert": "写回该工具",
      "pushRemove": "从该工具删除",
      "pushBackAllow": "允许写回",
      "confirmPush": "这一步会直接修改那个工具自己的配置文件（写之前先备份一份）。确认写回：",
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
      "noteCwd": "命令用了相对路径，采纳时会自动补 cwd",
      "noteReadOnly": "该源在注册表里被标为只读",
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
      "sWriteBack": "允许写回",
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
      "selNone": "先在列表里勾选要采纳的条目",
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

    // ── 样式 ────────────────────────────────────────────────────────────────
    var S = {
      wrap: { padding: "16px 18px", maxWidth: "1200px", display: "flex", flexDirection: "column", gap: "16px", height: "100%", overflowY: "auto", boxSizing: "border-box" },
      h2: { margin: 0, fontSize: "18px", fontWeight: 600 },
      small: { fontSize: "11px", color: "rgba(128,128,128,0.95)" },
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
      error: { fontSize: "12px", padding: "8px 10px", border: "1px solid #b52a21", borderRadius: "8px", color: "#b52a21", whiteSpace: "pre-wrap" },
      // ── 气泡提示（toast）：错误/成功弹悬浮气泡，自动消失、点一下也能关 ──
      toastWrap: { position: "fixed", top: "18px", left: "50%", transform: "translateX(-50%)", zIndex: 1200, display: "flex", flexDirection: "column", gap: "8px", maxWidth: "min(92vw, 480px)", alignItems: "stretch" },
      toast: { display: "flex", gap: "8px", alignItems: "flex-start", padding: "9px 12px", borderRadius: "10px", border: "1px solid rgba(128,128,128,0.45)", background: "Canvas", color: "CanvasText", boxShadow: "0 6px 20px rgba(0,0,0,0.25)", fontSize: "12px", lineHeight: 1.5, whiteSpace: "pre-wrap", wordBreak: "break-word", cursor: "pointer" },
      toastErr: { borderColor: "#b52a21", borderLeft: "3px solid #b52a21" },
      toastOk: { borderColor: "#137a3d", borderLeft: "3px solid #137a3d" },
      toastX: { marginLeft: "auto", opacity: 0.65, padding: "0 2px", flex: "0 0 auto" },
      fieldErr: { fontSize: "11px", color: "#b52a21", margin: 0, lineHeight: 1.5 },
      inputBad: { borderColor: "#b52a21" },
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
      }, h("div", { style: S.dialog, role: "dialog", "aria-modal": "true" }, props.children));
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
          color: server.status === "new" ? "#137a3d" : server.status === "changed" ? "#a35b00" : server.status === "gone" ? "#b52a21" : "inherit"
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
        server.disabled ? h("span", { style: Object.assign({}, S.chip, { color: "#b52a21" }), key: "d" }, t("sumDisabled")) : null,
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
          summaryChip(t("sumNew"), summary.new, "#137a3d"),
          summaryChip(t("sumChanged"), summary.changed, "#a35b00"),
          summaryChip(t("sumGone"), summary.gone, "#b52a21"),
          summaryChip(t("sumSame"), summary.same),
          summaryChip(t("sumInDsh"), summary.inDsh),
          summaryChip(t("sumFiles"), summary.files),
          summaryChip(t("sumErrors"), summary.errors, summary.errors ? "#b52a21" : undefined)
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
                style: Object.assign({}, S.chip, { cursor: "pointer", background: active ? "#eaf1ff" : "transparent", borderColor: active ? "#7aa7ff" : "rgba(128,128,128,0.35)", fontWeight: active ? 600 : 400, color: "inherit" }),
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
                onClick: function () { toggleGroup(group.id, !isOpen); }
              },
                h("span", { style: { fontSize: "10px", width: "10px" }, key: "c" }, isOpen ? "▾" : "▸"),
                h("strong", { style: { fontSize: "12px" }, key: "l" }, group.label),
                h("span", { style: S.small, key: "n" }, counts.total + " " + t("sumTotal")),
                counts.nu > 0 ? h("span", { style: Object.assign({}, S.chip, { color: "#137a3d" }), key: "cn" }, t("statusNew") + " " + counts.nu) : null,
                counts.changed > 0 ? h("span", { style: Object.assign({}, S.chip, { color: "#a35b00" }), key: "cc" }, t("statusChanged") + " " + counts.changed) : null,
                counts.gone > 0 ? h("span", { style: Object.assign({}, S.chip, { color: "#b52a21" }), key: "cg" }, t("statusGone") + " " + counts.gone) : null,
                h("span", { style: S.small, key: "f" }, group.file || ""),
                group.error ? h("span", { style: Object.assign({}, S.small, { color: "#b52a21" }), key: "e" }, group.error) : null),
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
                    // 危险动作：直接改别人工具的配置文件，先确认，且靠「允许写回」授权过门。
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
          h(SourceList, { t: t, busy: busy, view: sourcesView, setView: setSourcesView, setError: setError, setNotice: setNotice, reload: function () { return getJson("/sources").then(setSourcesView); } })),

        // ── 备份（折叠；直接用 /scan 带回的 data.backups，不再单独请求） ──
        h("details", { style: S.section },
          h("summary", { style: Object.assign({}, S.h3, { cursor: "pointer" }) }, t("secBackups")),
          ((data && data.backups) || []).length === 0 ? h("div", { style: S.small }, "—") : null,
          ((data && data.backups) || []).map(function (b) {
            return h("div", { style: S.row, key: b.path || b.name },
              h("span", { style: { fontSize: "11px", fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace" }, key: "p" }, b.name || b.path),
              h("span", { style: S.small, key: "s" }, (b.bytes ? Math.round(b.bytes / 1024) + " KB" : "") + " " + (b.files ? b.files + " 文件" : "")));
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
        view.sources.map(function (source) {
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

      var t = ctx.locale.bind(NS);
      var label = function () {
        var value = t("entry.label");
        return typeof value === "string" && value !== "" && value !== "entry.label" ? value : "MCP全局管理";
      };
      var Face = function () { return h(MCPGlobalPanel, { t: t }); };

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
      MCPGlobalPanel: MCPGlobalPanel
    };
    return module.exports;
  }
});
