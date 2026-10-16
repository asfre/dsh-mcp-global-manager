/**
 * dsh-mcp-global-manager — 宿主半（node 侧）。
 *
 * 在 harness 的 web server 上挂一个**仅本机可访问**的 HTTP API，供浏览器半
 * （lib/client.js，侧栏「MCP 全局管理」页面）调用：扫描各工具的 MCP 配置、
 * 与上次快照比对出新增/变更/已删、采纳进 DSH、写回原工具、以及 DSH 侧的增删改。
 *
 * profile 的 `cordis.patch.yml` 是 DSH 侧唯一真相，且该 profile 以
 * `patchReload: live` 运行 —— 本插件从不直接改运行中的装载器树，只写文件，
 * 装载器约一秒后自行收敛；写入前一律结构校验，坏编辑不可能把下次启动搞挂。
 *
 * 安全约定：
 *   - 只回应来自 loopback 的请求，并且拒绝带跨站 `Origin` 的请求（挡本机恶意网页的 CSRF）；
 *   - 写回别的工具配置必须**逐条**授权（面板上的「允许写回」落进账本），服务端
 *     不提供 force 一类的绕过开关——越权请求一律 403；
 *   - 凭据形状的键（`KEY|PASSWORD|SECRET|TOKEN`）读出时打码，回写时若值仍是
 *     那个码，就用磁盘上的原值补回，绝不让明文走一趟浏览器再写回去变成码；
 *   - 写任何非本插件自管的文件之前，先落一份带时间戳的备份。
 *
 * @module dsh-mcp-global-manager
 */

import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { argvProfile, buildSchema, diagnoseYaml, dshHome, expandPath, fromFileUrl, readTextSafe, resolveYaml } from './util.js';
import { MCP_CLIENT_PACKAGE, readManagedRows, rowId } from './patch.js';
import { listSources, readState, scanAll, writeState, forgetEntry } from './scan.js';
import {
  dshAdd,
  dshRemove,
  dshToggle,
  dshUpdate,
  importToDsh,
  listBackups,
  persistScan,
  pushToSource,
  removeFromSource,
  setPushBack,
} from './sync.js';
import { builtinById, mergedSources } from './sources.js';

export const name = 'dsh-mcp-global-manager';
export const inject = ['webServer'];

const API_PREFIX = '/mcp-global';
const SECRET_KEY_RE = /KEY|PASSWORD|SECRET|TOKEN|AUTH|BEARER|COOKIE|CRED/iu;
const SECRET_MASK = '••••••••';
/** 同一份扫描结果的复用窗口，避免面板连续点按把磁盘扫穿。 */
const CACHE_TTL_MS = 400;

/** 上一次扫描的缓存：`{ at, result }`。 */
let cache = null;

// ── 路径解析 ────────────────────────────────────────────────────────────────

/**
 * DSH 侧补丁文件的位置。权威答案是装载器真正读到的那条 `cordis:include`；
 * DSH Desktop 会把路径以 `file://` URL 交出来，直接取 pathname 会让带空格的
 * 安装目录变成 `%20`，所以必须走 fromFileUrl。
 * @param {any} ctx
 * @returns {{ patchPath: string, profileDir: string }}
 */
function resolvePatchPath(ctx) {
  try {
    const loader = ctx.get('loader');
    if (loader !== undefined && typeof loader.entries === 'function') {
      for (const entry of loader.entries()) {
        const options = entry.options ?? {};
        if (options.name !== 'cordis:include') continue;
        const config = options.config;
        if (config === null || typeof config !== 'object') continue;
        const path = config.path;
        if (typeof path !== 'string' || !path.includes('cordis.yml')) continue;
        const patchPath = fromFileUrl(path).replace(/cordis\.yml$/u, 'cordis.patch.yml');
        return { patchPath, profileDir: dirname(patchPath) };
      }
    }
  } catch {
    // 落到约定路径
  }
  const profileDir = join(dshHome(), 'profiles', argvProfile() ?? 'web');
  return { patchPath: join(profileDir, 'cordis.patch.yml'), profileDir };
}

/**
 * 拿到带 `!!js` 标签的 yaml 与 schema。
 *
 * 进程内 memo 一次即可：js-yaml 的模块解析结果在整个进程生命周期里不会变（真正会变的是
 * 补丁文件的**内容**，那走的是 `readTextSafe`，与这里无关），而每次解析都要对每个锚点
 * `readdirSync('node_modules/.pnpm')`，属于纯浪费磁盘 IO。**别把这里当自检用**——
 * `/selftest` 走的是 `diagnoseYaml()`，绕开缓存现场重解析，那才是「重启后到底行不行」的真相。
 * @param {any} ctx
 * @returns {Promise<{ yaml: any, schema: any }>}
 */
let yamlMemo = null;
async function loadYaml(ctx) {
  if (yamlMemo !== null) return yamlMemo;
  const anchors = [resolvePatchPath(ctx).profileDir, join(dshHome(), 'profiles')];
  const pending = resolveYaml(anchors).then((yaml) => ({ yaml, schema: buildSchema(yaml) }));
  yamlMemo = pending;
  // 解析失败不能把坏 promise 供在缓存里（一次抖动会毒化此后所有请求）；
  // 只清自己这一份，别把别的请求刚建好的新 memo 抹掉。
  pending.catch(() => {
    if (yamlMemo === pending) yamlMemo = null;
  });
  return pending;
}

// ── HTTP 原语 ───────────────────────────────────────────────────────────────

function isLoopback(req) {
  const address = req.socket?.remoteAddress ?? '';
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1' || address.startsWith('127.');
}

/**
 * 同源校验（CSRF 兜底）。`isLoopback` 只看 TCP 远端地址，本机任何进程——包括浏览器里
 * 打开的恶意网页——都能对 `127.0.0.1:<port>/mcp-global/*` 发跨站请求，打到 /adopt、
 * /push、/dsh/add|remove|update|toggle 这些写盘接口上。
 *
 * 合法调用方有三种，都放行：
 *   1. DSH Web 面板：同源 fetch，`Origin` 的 host 与请求 `Host` 一致；
 *   2. 本地脚本 / CLI / curl：不带 `Origin`；
 *   3. 桌面壳的自定义协议源（`app://` 一类）：网页发不出这种 Origin，不可能是外部站点。
 * 跨站网页必然带着**别人域名**的 http(s) Origin，一律拒。端口不写死，用 `req.headers.host` 动态比。
 * @param {any} req
 * @returns {boolean}
 */
function isSameOrigin(req) {
  const origin = req.headers?.origin;
  if (typeof origin !== 'string' || origin === '') return true; // 无 Origin：本地调用，放行
  let url;
  try {
    url = new URL(origin);
  } catch {
    return false; // 'null' 之类不透明源（file:// 页面、sandbox iframe）：不是正常面板，拒
  }
  // 只有 http/https 源才可能是「别的网站」。自定义协议是宿主壳自己的源，
  // 浏览器造不出来；这里如果一并拒掉，哪天面板换了协议就是自己 403 自己。
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return true;
  // 防 DNS 重绑定：evil.com 解析到 127.0.0.1 时，Origin 和 Host 会「一致」但都是
  // 攻击者的，光比相等等于自我认证。Host 必须是回环字面量，不陪任何域名玩一致。
  const host = req.headers?.host ?? '';
  if (!/^(?:127\.\d{1,3}\.\d{1,3}\.\d{1,3}|localhost|\[::1\])(?::\d{1,5})?$/iu.test(host)) return false;
  return url.host === host;
}

function sendJson(res, status, payload) {
  // 全防护：这个函数经常在兜底路径（.catch）里被调，绝不能反过来把宿主炸了。
  // 典型事故：扫描进行中客户端断开/刷新 → res.end 抛错 → 兜底再 writeHead
  // → ERR_HTTP_HEADERS_SENT 未捕获 → 宿主进程整个崩掉。
  try {
    if (res.writableEnded || res.destroyed) return;
    if (res.headersSent) {
      // 头已经出去过，就绝不再写头；能补个尾巴就补，补不了就拆连接。
      try { res.end(); } catch { try { res.destroy(); } catch { /* ignore */ } }
      return;
    }
    const body = JSON.stringify(payload);
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
    res.end(body);
  } catch {
    try { res.destroy(); } catch { /* ignore */ }
  }
}

function readBody(req, limit = 4 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error('body-too-large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

// ── 打码 / 还原 ─────────────────────────────────────────────────────────────

function maskSecretMap(map) {
  const out = {};
  for (const [key, value] of Object.entries(map ?? {})) {
    out[key] = SECRET_KEY_RE.test(key) && typeof value === 'string' && value !== '' ? SECRET_MASK : value;
  }
  return out;
}

/** URL 查询串里嵌的令牌（`?key=…`、`?authorization=…`）显示时同样打码。 */
function maskUrl(value) {
  if (typeof value !== 'string' || value === '') return value;
  try {
    const u = new URL(value);
    for (const [key] of u.searchParams) {
      if (SECRET_KEY_RE.test(key)) u.searchParams.set(key, SECRET_MASK);
    }
    return u.toString();
  } catch {
    return value; // 非绝对 URL：原样
  }
}

function maskServer(server) {
  const out = { ...server, env: maskSecretMap(server.env), headers: maskSecretMap(server.headers) };
  if (typeof out.url === 'string') out.url = maskUrl(out.url);
  // raw 是磁盘上的原始条目，同样带 env/headers——浏览器能看到它，就得过同一道码。
  if (out.raw !== null && typeof out.raw === 'object' && !Array.isArray(out.raw)) {
    const raw = { ...out.raw };
    if (raw.env !== undefined) raw.env = maskSecretMap(raw.env);
    if (raw.headers !== undefined) raw.headers = maskSecretMap(raw.headers);
    if (typeof raw.url === 'string') raw.url = maskUrl(raw.url);
    out.raw = raw;
  }
  return out;
}

/**
 * 把浏览器里仍是掩码的值，用磁盘上那份的真实值补回来。
 * @param {Record<string,string>} incoming 面板提交的 map
 * @param {Record<string,string>} existing  磁盘上的 map
 */
function restoreSecrets(incoming, existing) {
  const out = { ...(incoming ?? {}) };
  for (const [key, value] of Object.entries(out)) {
    if (value === SECRET_MASK && typeof existing?.[key] === 'string') out[key] = existing[key];
  }
  return out;
}

/**
 * 还原之后仍带着掩码 = 拿不到原值。这种值绝不能落盘：写进工具配置就把真 token
 * 覆盖成八个圆点了。返回第一个命中的字段名，没有则返回 null。
 */
function findMasked(server) {
  for (const field of ['env', 'headers']) {
    for (const [key, value] of Object.entries(server?.[field] ?? {})) {
      if (value === SECRET_MASK) return `${field}.${key}`;
    }
  }
  if (typeof server?.url === 'string' && server.url.includes(SECRET_MASK)) return 'url';
  return null;
}

// ── 业务动作 ────────────────────────────────────────────────────────────────

/**
 * 一次完整扫描（可选强制刷新并写回账本基线）。
 * @param {any} ctx
 * @param {boolean} force 强制重扫并写基线
 * @param {{ yaml: any, schema: any }=} preloaded 路由层已经解析过的 yaml/schema。
 *   `handle()` 对每个请求都先 `loadYaml` 一次，扫描再解析一遍就是**同一请求内读两遍补丁方言依赖**
 *   （顺带每次都 `readdirSync('.pnpm')`）。传进来就复用同一份，语义完全不变。
 */
async function doScan(ctx, force, preloaded) {
  if (!force && cache !== null && Date.now() - cache.at < CACHE_TTL_MS) return cache.result;
  const { yaml, schema } = preloaded ?? (await loadYaml(ctx));
  const { patchPath } = resolvePatchPath(ctx);
  const state = readState();
  const result = scanAll({ dshPatchPath: patchPath, yaml, schema, state });
  if (force) result.state = persistScan(state, result);
  cache = { at: Date.now(), result };
  return result;
}

/** 摘要计数，面板顶部那一排徽章就靠它。 */
function summarize(result) {
  const counts = { total: 0, new: 0, changed: 0, gone: 0, same: 0, inDsh: 0, disabled: 0, errors: 0, files: 0 };
  for (const server of result.servers) {
    counts.total += 1;
    counts[server.status] = (counts[server.status] ?? 0) + 1;
    if (server.inDsh) counts.inDsh += 1;
    if (server.disabled || server.enabled === false) counts.disabled += 1;
  }
  for (const source of result.sources) {
    if (source.exists) counts.files += 1;
    if (source.error !== null && source.error !== 'not-found') counts.errors += 1;
  }
  return counts;
}

/** DSH 侧现有的行（写操作之后要重新读一遍，保证面板看到的是落盘结果）。 */
function dshServersOf(patchPath, yaml, schema) {
  const text = readTextSafe(patchPath) ?? '';
  const { rows, disabledIds } = readManagedRows(text, yaml, schema);
  return { rows, disabledIds, text };
}

/**
 * 把提交的表单与磁盘原值合并：掩码还原 + 保留没在表单里出现的其它 config 键。
 */
function mergeConfig(existingConfig, incoming) {
  const base = existingConfig && typeof existingConfig === 'object' ? { ...existingConfig } : {};
  const config = { ...base };
  if (incoming.serverName !== undefined) config.serverName = incoming.serverName;
  if (incoming.transport !== undefined) config.transport = incoming.transport;
  if (incoming.command !== undefined) config.command = incoming.command;
  if (incoming.args !== undefined) config.args = incoming.args;
  if (incoming.cwd !== undefined) config.cwd = incoming.cwd;
  if (incoming.url !== undefined) {
    // 显示时 URL 查询串里的令牌被打码成 •••；表单原样提交回来就用磁盘上的原 URL 补回，
    // 掩码 URL 绝不落盘（和 env/headers 同一套路）。
    config.url = typeof incoming.url === 'string' && incoming.url.includes(SECRET_MASK) ? String(base.url ?? '') : incoming.url;
  }
  if (incoming.env !== undefined) config.env = restoreSecrets(incoming.env, base.env);
  if (incoming.headers !== undefined) config.headers = restoreSecrets(incoming.headers, base.headers);
  return config;
}

/** 从统一形状提交过来的写入意图 → 走 sync 层；掩码在这里落地还原。 */
function serverFromInput(input, existingRow) {
  const base = existingRow?.config ?? {};
  const config = mergeConfig(base, input);
  return {
    serverName: String(input.serverName ?? config.serverName ?? '').trim(),
    transport: input.transport ?? config.transport ?? (typeof config.url === 'string' && config.url !== '' ? 'streamable-http' : 'stdio'),
    command: config.command ?? '',
    args: Array.isArray(config.args) ? config.args : [],
    env: config.env && typeof config.env === 'object' ? config.env : {},
    cwd: config.cwd ?? '',
    url: config.url ?? '',
    headers: config.headers && typeof config.headers === 'object' ? config.headers : {},
  };
}

// ── 路由 ────────────────────────────────────────────────────────────────────

/**
 * 冷启动体检：这个 bundle 有没有进 profile 的加载名单、已安装副本的客户端声明长什么样。
 * 侧栏条目出不出来，答案基本就在这三项里（`file:` 安装是实拷贝，源码改了没同步也会在这儿露馅）。
 * @param {string} profileDir
 */
function inspectClientBundle(profileDir) {
  const installed = join(profileDir, 'node_modules', name);
  let listedInBundles = false;
  try {
    const profilePkg = JSON.parse(readTextSafe(join(profileDir, 'package.json')));
    const bundles = profilePkg?.dsh?.profile?.bundles;
    listedInBundles = Array.isArray(bundles) && bundles.includes(name);
  } catch {
    // profile 的 package.json 读不动就算没列上
  }
  let manifest = null;
  let dependency = null;
  try {
    const own = JSON.parse(readTextSafe(join(installed, 'package.json')));
    manifest = own?.dsh?.client ?? null;
  } catch {
    // 已安装副本读不到就留 null
  }
  try {
    const profilePkg = JSON.parse(readTextSafe(join(profileDir, 'package.json')));
    dependency = profilePkg?.dependencies?.[name] ?? null;
  } catch {
    // 同上
  }
  return {
    installed: existsSync(installed),
    clientFileExists: existsSync(join(installed, 'lib', 'client.js')),
    listedInBundles,
    dependency,
    manifest,
  };
}

async function handle(ctx, req, res, route, query) {
  const { patchPath, profileDir } = resolvePatchPath(ctx);
  const { yaml, schema } = await loadYaml(ctx);
  const method = req.method ?? 'GET';

  // 只读：全量扫描结果
  if (method === 'GET' && route === '/scan') {
    const force = query.get('refresh') === '1';
    const result = await doScan(ctx, force, { yaml, schema });
    return sendJson(res, 200, {
      scannedAt: result.scannedAt,
      patchPath,
      patchExists: existsSync(patchPath),
      summary: summarize(result),
      sources: result.sources.map((source) => ({
        ...source,
        servers: source.servers.map(maskServer),
      })),
      servers: result.servers.map(maskServer),
      backups: listBackups(5),
    });
  }

  if (method === 'GET' && route === '/sources') {
    const state = readState();
    return sendJson(res, 200, { sources: listSources(state), registry: mergedSources(state.customSources).length });
  }

  if (method === 'GET' && route === '/backups') {
    const rawLimit = Number(query.get('limit') ?? 30);
    const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(Math.trunc(rawLimit), 1), 100) : 30;
    return sendJson(res, 200, { backups: listBackups(limit) });
  }

  if (method === 'GET' && route === '/selftest') {
    // 排障用：看插件能不能解析补丁、能不能拿到 yaml、DSH 侧有几行，外加冷启动体检。
    const { rows, disabledIds } = dshServersOf(patchPath, yaml, schema);
    return sendJson(res, 200, {
      name,
      patchPath,
      patchExists: existsSync(patchPath),
      dshRows: rows.map((row) => ({ id: row.id, serverName: row.config?.serverName, disabled: disabledIds.has(row.id) })),
      clientPackage: MCP_CLIENT_PACKAGE,
      home: dshHome(),
      // 现场解析 yaml（不走缓存）：重启后这里才是真相，接口能 200 不代表重启后也能
      yaml: await diagnoseYaml([profileDir, join(dshHome(), 'profiles')]),
      client: inspectClientBundle(profileDir),
    });
  }

  // 以下都是写操作
  if (method !== 'POST') return sendJson(res, 405, { error: `不支持的方法 ${method}` });

  let body;
  try {
    const raw = await readBody(req);
    body = raw.trim() === '' ? {} : JSON.parse(raw);
  } catch (error) {
    if (error?.message === 'body-too-large') return sendJson(res, 413, { error: '请求体过大' });
    return sendJson(res, 400, { error: `请求体不是合法 JSON：${String(error?.message ?? error)}` });
  }

  if (route === '/adopt') {
    const state = readState();
    const keys = Array.isArray(body.keys) ? body.keys : [];
    const result = await doScan(ctx, false, { yaml, schema });
    const picked = result.servers.filter((item) => keys.includes(item.key) && !item.inDsh);
    if (picked.length === 0) return sendJson(res, 400, { error: '没有可导入的条目（可能已经在 DSH 里）' });
    const outcome = importToDsh({
      patchPath,
      yaml,
      schema,
      state,
      servers: picked.map((item) => ({ ...item, env: item.env, headers: item.headers })),
    });
    cache = null;
    return sendJson(res, outcome.ok ? 200 : 409, outcome);
  }

  if (route === '/pushback') {
    const state = readState();
    const key = String(body.key ?? '');
    // 授权关只能落在真实存在的条目上：任意字符串 key 不许提前在账本里划授权（这是 /push 的上游门）。
    const scannedNow = await doScan(ctx, false, { yaml, schema });
    if (key === '' || !scannedNow.servers.some((item) => item.key === key)) {
      return sendJson(res, 400, { error: '条目不存在：key 必须是当前扫描到的真实条目' });
    }
    cache = null; // 授权变了，下次扫描（含不带 refresh 的）必须重算
    return sendJson(res, 200, { state: setPushBack(state, key, body.enabled === true) });
  }

  if (route === '/forget') {
    // 清除「源里已删」标记：只动我们自己的账本，不碰任何工具配置文件。
    const key = String(body.key ?? '');
    if (key === '' || !key.includes('::')) return sendJson(res, 400, { error: '缺少要清除标记的条目 key' });
    cache = null;
    return sendJson(res, 200, forgetEntry(key));
  }

  if (route === '/push') {
    const key = String(body.key ?? '');
    // 只按**第一个** `::` 切：服务名自己带「::」时 split('::') 会把名字拦腰砍断，
    // 写回/删除就会打到别的条目上。源 id 里不会出现冒号。
    const sep = key.indexOf('::');
    if (sep <= 0 || sep + 2 >= key.length) return sendJson(res, 400, { error: '条目 key 应为 sourceId::name 形状' });
    const sourceId = key.slice(0, sep);
    const name = key.slice(sep + 2);
    const state = readState();
    const sources = mergedSources(state.customSources);
    const source = sources.find((item) => item.id === sourceId) ?? builtinById(sourceId);
    if (!source) return sendJson(res, 400, { error: `未知源 ${sourceId}` });
    if (source.format === 'dsh') return sendJson(res, 400, { error: 'DSH 自己不需要写回' });
    if (source.writeBack !== true) return sendJson(res, 403, { error: `${source.label} 在注册表里被标为只读，不能写回` });
    // 逐条授权门是**唯一**的门。历史遗留的 `body.force` 后门已删除：它让任何能打到
    // 127.0.0.1 的调用者（含浏览器里的恶意网页）跳过「用户是否开过允许写回」，
    // 直接往 ~/.claude.json 之类的第三方配置里注入/删除条目。
    if (state.adopted?.[key]?.pushBack !== true) {
      return sendJson(res, 403, { error: `尚未授权写回到 ${source.label}（在条目上打开「允许写回」再来）` });
    }
    const scanned = await doScan(ctx, false, { yaml, schema });
    const file = scanned.sources.find((item) => item.id === sourceId)?.file;
    if (typeof file !== 'string' || file === '') return sendJson(res, 400, { error: `${source.label} 的配置文件当前不存在` });
    // 安装包内部文件（VS Code 兜底的 resources/app/mcp/package.json）只读不写：
    // 写进应用包既撑不过升级，也可能触发完整性校验。用户级 mcp.json 才是写回目标。
    if (/\/resources\/app\/mcp\/package\.json$/iu.test(file.replace(/\\/g, '/'))) {
      return sendJson(res, 403, { error: '该路径在 VS Code 安装包内部，插件不写；请创建用户级 mcp.json 后重试' });
    }
    const server = body.server ?? {};
    // 面板里的 env/headers 是打过码的（SECRET_MASK）。拿这次扫描的**未打码原始值**
    // 当底稿让 restoreSecrets 补回真值；补不回来的（源文件里压根没有这条）宁可拒写，
    // 也绝不把 •••••••• 落进用户的工具配置、覆盖掉真 token。
    const raw = scanned.servers.find((item) => item.key === key);
    const resolved = serverFromInput(
      { ...server, serverName: server.serverName ?? name },
      raw === undefined ? undefined : { config: { env: raw.env, headers: raw.headers, url: raw.url } },
    );
    if (body.action !== 'remove') {
      const stillMasked = findMasked(resolved);
      if (stillMasked !== null) {
        return sendJson(res, 409, { error: `写回被拒绝：${stillMasked} 仍是掩码且源文件里找不到原值可还原，请在表单里填回真实值再推` });
      }
    }
    const outcome =
      body.action === 'remove'
        ? removeFromSource({ file, format: source.format, containerHint: source.containerHint, name })
        : pushToSource({
            file,
            format: source.format,
            containerHint: source.containerHint,
            dialect: source.dialect,
            name,
            server: resolved,
          });
    cache = null;
    return sendJson(res, outcome.ok ? 200 : 409, { ...outcome, file });
  }

  if (route.startsWith('/dsh/')) {
    const action = route.slice('/dsh/'.length);
    const state = readState();
    const { rows } = dshServersOf(patchPath, yaml, schema);
    // id 缺失/不是字符串时直接返回 null，由上层给 400——不能再走 rowId 拼出
    // 'mcp-' 这种幽灵 id 去查行（旧行为会让停用/删除报「未找到受管行 mcp-」）。
    const idOf = (value) => {
      if (typeof value !== 'string' || value.trim() === '') return null;
      const trimmed = value.trim();
      return trimmed.startsWith('mcp-') ? trimmed : rowId(trimmed);
    };
    const missingIdError = () => sendJson(res, 400, { error: '缺少要操作的条目 id：请点上方「刷新扫描」后重试' });

    if (action === 'add') {
      const server = serverFromInput(body.server ?? body);
      const stillMasked = findMasked(server);
      if (stillMasked !== null) {
        return sendJson(res, 409, { error: `新增被拒绝：${stillMasked} 的值仍是掩码，没有可还原的原值，请填真实值` });
      }
      const outcome = dshAdd({ patchPath, yaml, schema, state, server, adoptKey: body.key });
      cache = null;
      return sendJson(res, outcome.ok ? 200 : 409, outcome);
    }
    if (action === 'update') {
      const id = idOf(body.id);
      if (id === null) return missingIdError();
      const existingRow = rows.find((row) => row.id === id);
      if (existingRow === undefined) return sendJson(res, 404, { error: `未找到受管行 ${id}` });
      const server = serverFromInput(body.server ?? body, existingRow);
      const stillMasked = findMasked(server);
      if (stillMasked !== null) {
        return sendJson(res, 409, { error: `保存被拒绝：${stillMasked} 仍是掩码且补丁里找不到原值可还原，请填真实值` });
      }
      const outcome = dshUpdate({ patchPath, yaml, schema, state, id, server });
      cache = null;
      return sendJson(res, outcome.ok ? 200 : 409, outcome);
    }
    if (action === 'remove') {
      const id = idOf(body.id);
      if (id === null) return missingIdError();
      const outcome = dshRemove({ patchPath, yaml, schema, state, id });
      cache = null;
      return sendJson(res, outcome.ok ? 200 : 409, outcome);
    }
    if (action === 'toggle') {
      const id = idOf(body.id);
      if (id === null) return missingIdError();
      const outcome = dshToggle({ patchPath, yaml, schema, id, disabled: body.disabled === true });
      cache = null;
      return sendJson(res, outcome.ok ? 200 : 409, outcome);
    }
    return sendJson(res, 404, { error: `未知操作 ${action}` });
  }

  if (route === '/sources/add') {
    const state = readState();
    const source = {
      id: String(body.id ?? '').trim(),
      label: String(body.label ?? body.id ?? '').trim(),
      format: ['json', 'toml', 'opencode', 'dsh'].includes(body.format) ? body.format : 'json',
      containerHint: body.containerHint ? String(body.containerHint) : 'mcpServers',
      dialect: body.dialect ? String(body.dialect) : 'claude',
      writeBack: body.writeBack === true,
      paths: Array.isArray(body.paths) ? body.paths.map(String) : [String(body.path ?? '')].filter(Boolean),
      note: body.note ? String(body.note) : '',
    };
    if (source.id === '' || source.paths.length === 0) return sendJson(res, 400, { error: '源 id 与路径都不能为空' });
    // 源 id 会被拼进条目 key（`sourceId::name`），而 /push 按**第一个** `::` 切回 sourceId。
    // id 里只要出现冒号，这个切分就会把授权嫁祸到别的源上（越权写到别人配置文件）。
    // 所以自定义 id 只允许安全字符集，从源头杜绝歧义 key。
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/u.test(source.id)) {
      return sendJson(res, 400, { error: '源 id 只能由字母、数字、下划线、短横线组成，且不能包含冒号（:）' });
    }
    // 禁地：自定义源不许指向 DSH 自己的目录（~/.dsh/**）——宿主设置、凭据、补丁全在里面，
    // 写坏一处就是越权。DSH 侧的条目本来就由内置 dsh 源管理，不需要自定义源绕道。
    const dshRoot = dshHome().replace(/[\\/]+$/u, '').split('\\').join('/').toLowerCase();
    for (const raw of source.paths) {
      const abs = String(expandPath(raw) ?? '').replace(/[\\/]+$/u, '').split('\\').join('/').toLowerCase();
      if (abs === '') return sendJson(res, 400, { error: `路径无法解析：${raw}` });
      if (abs === dshRoot || abs.startsWith(`${dshRoot}/`)) {
        return sendJson(res, 400, { error: '自定义源路径不能指向 DSH 目录（~/.dsh）内' });
      }
    }
    if (builtinById(source.id) !== null && source.writeBack === true) {
      // 覆盖只读内置源的「路径」是特性；把它翻成「可写」不是。
      return sendJson(res, 400, { error: '内置源被标为只读：可以覆盖路径，但不能开启写回（想可写请另起 id 自定义）' });
    }
    const custom = [...(state.customSources ?? []).filter((item) => item.id !== source.id), source];
    // 重定向防御：同一个源 id 把落点路径改了，之前逐条给的写回授权不能跟着搬家。
    // 只要路径集合变了（相对上一份自定义定义，或相对内置默认），就把这个源名下所有
    // adopted[key].pushBack 一律吊销——想往新文件写，必须重新逐条点「允许写回」。
    const pathsSig = (arr) => (Array.isArray(arr) ? arr.map((p) => String(p).trim()) : []).slice().sort().join('\u0000');
    const prior = (state.customSources ?? []).find((item) => item?.id === source.id) ?? builtinById(source.id);
    const retargeted = prior != null && pathsSig(prior.paths) !== pathsSig(source.paths);
    let adopted = state.adopted ?? {};
    if (retargeted) {
      const prefix = `${source.id}::`;
      adopted = { ...adopted };
      for (const k of Object.keys(adopted)) {
        if (k.startsWith(prefix) && adopted[k] && adopted[k].pushBack === true) {
          adopted[k] = { ...adopted[k], pushBack: false };
        }
      }
    }
    // 必须落盘：只把新 state 回给前端的话，用户一刷新自定义源就没了。
    const saved = writeState({ ...state, customSources: custom, adopted });
    cache = null;
    return sendJson(res, 200, {
      state: saved,
      source,
      retargeted,
      notice: retargeted ? '该源的落点路径已变更，原有写回授权已全部吊销，如需写回请重新逐条授权' : '',
    });
  }

  if (route === '/sources/remove') {
    const state = readState();
    const id = String(body.id ?? '');
    // 内置 id 本身不能删；但如果它挂着自定义覆盖项，删除 = 撤掉覆盖、回到内置默认，这是合法操作。
    if (builtinById(id) !== null && !(state.customSources ?? []).some((item) => item.id === id)) {
      return sendJson(res, 403, { error: '内置源不能删除，只能覆盖它的路径' });
    }
    const saved = writeState({ ...state, customSources: (state.customSources ?? []).filter((item) => item.id !== id) });
    cache = null;
    return sendJson(res, 200, { state: saved });
  }

  return sendJson(res, 404, { error: `未知接口 ${route}` });
}

// ── 入口 ────────────────────────────────────────────────────────────────────

export function apply(ctx) {
  const log = (level, message) => {
    try {
      ctx.logger?.(name)?.[level]?.(message);
    } catch {
      // 日志不可用绝不影响功能
    }
  };

  const webServer = ctx.get('webServer') ?? ctx.webServer;
  if (webServer === undefined || typeof webServer.register !== 'function') {
    log('warn', 'webServer 不可用，MCP 全局管理面板将无法与宿主通信');
    return;
  }

  webServer.register({
    kind: 'prefix',
    path: API_PREFIX,
    handler: (req, res) => {
      const url = new URL(req.url ?? API_PREFIX, 'http://127.0.0.1');
      if (!isLoopback(req)) {
        sendJson(res, 403, { error: '仅允许本机访问' });
        return;
      }
      if (!isSameOrigin(req)) {
        log('warn', `拒绝跨站请求：origin=${req.headers?.origin} host=${req.headers?.host ?? '(缺)'}`);
        sendJson(res, 403, { error: '拒绝跨站请求（CSRF 防护）' });
        return;
      }
      const route = url.pathname.slice(API_PREFIX.length) || '/';
      handle(ctx, req, res, route, url.searchParams)
        .then((done) => {
          if (done === undefined && !res.headersSent && !res.writableEnded) sendJson(res, 500, { error: '处理器未产生响应' });
        })
        .catch((error) => {
          log('warn', `请求 ${route} 失败：${String(error?.stack ?? error)}`);
          // headersSent 而非 writableEnded：头一旦出去过，任何写头动作都会炸
          if (!res.headersSent && !res.writableEnded) sendJson(res, 500, { error: String(error?.message ?? error) });
          else { try { res.destroy(); } catch { /* ignore */ } }
        });
    },
  });

  log('info', `已挂载 ${API_PREFIX}/*（DSH 补丁：${resolvePatchPath(ctx).patchPath}）`);
  // 启动后不着急扫描：等面板第一次点进来再说，省得拖慢宿主启动。
}

export default { name, inject, apply };
