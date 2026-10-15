#!/usr/bin/env node
/**
 * 离线冒烟测试：给 lib/client.js 装一套 React / slots / locale 桩，把渲染路径整个跑一遍。
 *
 * 目的不是测样式，是在**不重启 DSH** 的前提下排掉三类会白屏的事故：
 *   1. 语法/引用错误（宿主 combo 里一个 ReferenceError 就能整页崩）
 *   2. 侧栏注册形状不对（order / id / label 与「远程链接」的相对位置是硬需求）
 *   3. 文案 key 拼错（t('xxx') 找不到就显示原始 key，等于面板上冒英文乱码）
 *
 *   node tools/smoke-client.mjs
 *
 * @module tools/smoke-client
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(root, 'lib', 'client.js'), 'utf8');

let failures = 0;
const ok = (cond, label, extra) => {
  if (cond) console.log(`  ✓ ${label}`);
  else {
    failures += 1;
    console.log(`  ✗ ${label}${extra === undefined ? '' : `  → ${JSON.stringify(extra)}`}`);
  }
};

// ── React 桩 ────────────────────────────────────────────────────────────────
let hookValues = [];
let hookIndex = 0;
const renderCounts = { elements: 0, components: 0 };

const react = {
  createElement(type, props, ...children) {
    renderCounts.elements += 1;
    const node = { type, props: props ?? {}, children: children.flat(Infinity) };
    if (typeof type === 'function') {
      renderCounts.components += 1;
      const savedValues = hookValues;
      const savedIndex = hookIndex;
      hookValues = [];
      hookIndex = 0;
      node.rendered = type(props);
      hookValues = savedValues;
      hookIndex = savedIndex;
    }
    return node;
  },
  useState(initial) {
    const value = hookIndex < hookValues.length ? hookValues[hookIndex] : initial;
    hookIndex += 1;
    return [value, () => {}];
  },
  useEffect() {},
  useCallback: (fn) => fn,
  useMemo: (fn) => fn(),
};

// ── 载入 client.js ──────────────────────────────────────────────────────────
const loaded = [];
const fakeWindow = {
  __ModuleLoader__: { load: (entry) => loaded.push(entry) },
  addEventListener() {},
  removeEventListener() {},
  confirm: () => true,
  location: { origin: 'http://127.0.0.1:19387' },
};
const requireShim = (id) => {
  if (id === 'react') return react;
  throw new Error(`冒烟测试未预置依赖：${id}`);
};

new Function('window', 'require', src)(fakeWindow, requireShim);

console.log('=== 自注册 ===');
ok(loaded.length === 1, '只注册一个模块', loaded.map((m) => m.id));
ok(loaded[0]?.id === 'dsh-mcp-global-manager', 'id = 包名（与宿主 ModuleLoader 约定一致）', loaded[0]?.id);
ok(!/^\s*(export|import)\s/m.test(src), '文件内没有 export / import 语句（否则 combo 会整体语法崩）');

const instance = loaded[0].factory(requireShim);
ok(typeof instance.apply === 'function', 'exports.apply 是函数');
ok(Array.isArray(instance.inject) && instance.inject.includes('slots') && instance.inject.includes('locale'), 'exports.inject 含 slots + locale', instance.inject);
const I = instance.internals;
ok(I !== undefined, 'exports.internals 暴露给冒烟测试');

// ── 文案 key 全覆盖 ─────────────────────────────────────────────────────────
console.log('\n=== 文案 ===');
const usedKeys = new Set();
const oddities = [];
// 只认「合法 key 形状」的调用：t('a.b') / t("a.b")，跨行书写也认；
// 其余形如 t( ... ) 的非字面量调用单独记下来，避免把 split('\n') 之类误判成缺文案。
for (const match of src.matchAll(/\bt\(\s*(['"])([\w.\-]+)\1/g)) {
  usedKeys.add(match[2]);
}
for (const match of src.matchAll(/\bvar t = |\bfunction t\(|\bt\(\s*[^'")\s]/g)) {
  oddities.push(src.slice(Math.max(0, match.index - 40), match.index + 40).replace(/\s+/g, ' '));
}
const missing = [...usedKeys].filter((key) => I.zh[key] === undefined);
ok(missing.length === 0, `zh 覆盖全部 ${usedKeys.size} 个 t() key`, missing);
ok(I.zh['entry.label'] === 'MCP全局管理', '侧栏文案 = MCP全局管理', I.zh['entry.label']);
console.log(`  · 非字面量的 t( 调用 ${oddities.length} 处${oddities.length === 0 ? '' : '：' + oddities.join(' ⏎ ')}`);

// ── 侧栏注册形状 ────────────────────────────────────────────────────────────
console.log('\n=== 侧栏注册 ===');
const dicts = {};
const specs = [];
let mainSpec = null;
const ctx = {
  effect: (fn) => fn() ?? (() => {}),
  get: () => undefined,
  locale: {
    register: (ns, table) => {
      dicts[ns] = table;
      return () => {};
    },
    bind: (ns) => (key) => dicts[ns]?.zh?.[key] ?? key,
  },
  slots: {
    register: (spec, component) => {
      if (spec.name === 'main') mainSpec = { spec, component };
      else specs.push({ spec, component });
      return () => {};
    },
    inject: (slot, build) => build(),
  },
};

instance.apply(ctx);

const entry = specs.find((item) => item.spec.name === 'sidebar.panellist');
ok(entry !== undefined, '注册了 sidebar.panellist 条目');
ok(entry?.spec.order === 22, 'order = 22（紧跟「远程链接」的 21）', entry?.spec.order);
ok(entry?.spec.id === 'mcp-global-manager', 'id = mcp-global-manager', entry?.spec.id);
ok(entry?.spec.locale === 'dsh-mcp-global-manager', 'locale 命名空间挂上', entry?.spec.locale);
ok(typeof entry?.spec.label === 'function' && entry.spec.label() === 'MCP全局管理', 'label() 渲染出中文', entry && entry.spec.label());
ok(mainSpec !== null && mainSpec.spec.key === entry?.spec.id, 'main 面版与条目同 key（点了才有页面）', mainSpec && mainSpec.spec.key);
ok(react.createElement(I.GlobalGlyph, { size: 16 })?.rendered !== undefined, '图标组件可渲染');

// ── 渲染：空态 ──────────────────────────────────────────────────────────────
console.log('\n=== 渲染 ===');
const t = ctx.locale.bind('dsh-mcp-global-manager');
try {
  react.createElement(I.MCPGlobalPanel, { t });
  ok(true, '首屏（未扫描到数据）不抛错');
} catch (error) {
  ok(false, '首屏（未扫描到数据）不抛错', String(error?.stack ?? error));
}

// ── 渲染：带数据 ────────────────────────────────────────────────────────────
const fakeServer = (over) => ({
  key: 'vscode::pencil',
  sourceId: 'vscode',
  sourceLabel: 'VS Code',
  sourceFile: 'C:/x/mcp.json',
  name: 'pencil',
  serverName: 'pencil',
  displayName: 'pencil',
  transport: 'stdio',
  command: 'npx',
  args: ['-y', 'x'],
  env: { API_TOKEN: '••••••••' },
  headers: {},
  cwd: '',
  url: '',
  status: 'new',
  inDsh: false,
  nameChanged: false,
  duplicateOf: ['Kiro'],
  pushBack: false,
  ...over,
});
const fakeData = {
  scannedAt: '2026-10-14T04:29:22.356Z',
  patchPath: 'C:/x/cordis.patch.yml',
  patchExists: true,
  summary: { total: 28, new: 28, changed: 0, gone: 0, same: 0, inDsh: 1, disabled: 0, errors: 0, files: 9 },
  servers: [
    fakeServer({}),
    fakeServer({ key: 'trae-cn::API', sourceId: 'trae-cn', sourceLabel: 'Trae CN', name: 'API', serverName: 'API', displayName: 'API 文档', nameChanged: true, needsCwd: true }),
    fakeServer({ key: 'codex::node_repl', sourceId: 'codex', sourceLabel: 'Codex CLI', status: 'gone' }),
    fakeServer({ key: 'kiro::http', sourceId: 'kiro', sourceLabel: 'Kiro', transport: 'streamable-http', url: 'http://127.0.0.1:9/mcp', headers: { Authorization: '••••••••' }, pushBack: true, status: 'changed' }),
    { ...fakeServer({ key: 'dsh::pencil', sourceId: 'dsh', sourceLabel: 'DSH', inDsh: true, status: 'same' }), id: 'mcp-pencil', serverName: 'pencil', disabled: true },
  ],
  sources: [],
  backups: [{ name: 'cordis.patch.yml.2026-10-14.bak', bytes: 4096, files: 1 }],
};
try {
  hookValues = [fakeData];
  react.createElement(I.MCPGlobalPanel, { t });
  ok(true, '带数据（含 gone / 改名 / 掩码 / 写回开启 / DSH 行）不抛错');
} catch (error) {
  ok(false, '带数据不抛错', String(error?.stack ?? error));
} finally {
  hookValues = [];
}

try {
  react.createElement(I.ExternalRow, {
    t, server: fakeServer({}), busy: false, selected: true,
    onSelect() {}, onAdoptOne() {}, onEdit() {}, onPushBack() {}, onPush() {}, onPushRemove() {},
  });
  react.createElement(I.ExternalRow, {
    t, server: fakeServer({ status: 'gone', pushBack: true }), busy: false, selected: false,
    onSelect() {}, onAdoptOne() {}, onEdit() {}, onPushBack() {}, onPush() {}, onPushRemove() {},
  });
  react.createElement(I.DshRow, { t, server: { ...fakeServer({}), id: 'mcp-pencil', disabled: true }, busy: false, onEdit() {}, onToggle() {}, onRemove() {} });
  ok(true, '行组件（外部 / 已消失 / DSH）不抛错');
} catch (error) {
  ok(false, '行组件不抛错', String(error?.stack ?? error));
}

for (const transport of ['stdio', 'streamable-http']) {
  try {
    react.createElement(I.ServerForm, {
      t, form: I.formFromServer({ serverName: 'x', transport, command: 'npx', args: ['-y'], env: {}, headers: { A: '1' } }),
      onChange() {}, onSubmit() {}, onCancel() {}, submitLabel: '保存',
    });
    ok(true, `编辑表单可渲染（${transport}）`);
  } catch (error) {
    ok(false, `编辑表单可渲染（${transport}）`, String(error?.stack ?? error));
  }
}

// ── 表单往返 ────────────────────────────────────────────────────────────────
console.log('\n=== 表单数据往返 ===');
const round = I.payloadFromForm(I.formFromServer({
  serverName: 'pencil', transport: 'stdio', command: 'npx', args: ['-y', 'pkg@1'], env: { A: '1', B: '2' }, headers: {}, cwd: 'C:/x', url: '',
}));
ok(round.serverName === 'pencil' && round.command === 'npx', 'serverName / command 原样回来', round);
ok(round.args.length === 2 && round.args[1] === 'pkg@1', 'args 每行一个，往返不丢', round.args);
ok(Object.keys(round.env).length === 2 && round.env.B === '2', 'env K=V 往返不丢', round.env);
const httpRound = I.payloadFromForm(I.formFromServer({ serverName: 'a', transport: 'streamable-http', url: 'http://h/mcp', headers: { Authorization: '••••••••' } }));
ok(httpRound.transport === 'streamable-http' && httpRound.headers.Authorization === '••••••••', '掩码值原样回传（后端据此还原真值）', httpRound.headers);
ok(I.parseList(' a \n\n b ').join('|') === 'a|b', 'parseList 去空行与空白');
ok(I.targetOf({ transport: 'streamable-http', url: 'http://h' }) === 'http://h', 'targetOf：远程显示 URL');
ok(I.targetOf({ transport: 'stdio', command: 'npx', args: ['-y'] }) === 'npx -y', 'targetOf：本地显示命令');

// 整行命令识别（新手粘贴文档命令行的唯一入口，拆错=填错）
ok(I.splitCommandLine('npx -y @scope/pkg "C:\\a b\\c"').join('|') === 'npx|-y|@scope/pkg|C:\\a b\\c', 'splitCommandLine：双引号内的空格不拆');
ok(I.splitCommandLine("uvx 'my pkg' run").join('|') === 'uvx|my pkg|run', 'splitCommandLine：单引号也认');
ok(I.splitCommandLine('   ').length === 0, 'splitCommandLine：全空白返回空数组');
ok(I.splitCommandLine(null).length === 0, 'splitCommandLine：null 不炸');
ok(I.splitCommandLine('npx   -y\t pkg ').join('|') === 'npx|-y|pkg', 'splitCommandLine：连续空白与首尾空白');

// 弹窗与 K=V 行编辑器：渲染安全（宿主里抛错 = 白屏）
ok(/role: "dialog"/.test(src), '弹窗带 role=dialog');
ok(/"aria-modal": "true"/.test(src), '弹窗带 aria-modal');
try {
  react.createElement(I.Modal, { onClose() {} }, 'child');
  ok(true, 'Modal 可渲染');
} catch (error) {
  ok(false, 'Modal 可渲染', String(error?.stack ?? error));
}
try {
  react.createElement(I.MapRows, { text: 'A=1\nTOKEN=••••••••', onChange() {}, addLabel: '＋', removeLabel: '×' });
  ok(true, 'MapRows 可渲染（含掩码值行）');
} catch (error) {
  ok(false, 'MapRows 可渲染（含掩码值行）', String(error?.stack ?? error));
}

// 自检摘要：面板上唯一会读后端任意形状的地方，缺字段绝不能抛（抛了就白屏）
const stFull = { yaml: { ok: true, resolved: { version: '4.3.2', usable: true } }, client: { installed: true, listedInBundles: true, clientFileExists: true, manifest: { platform: 'web' } }, dshRows: [{ id: 'mcp-a' }] };
const stText = I.selftestSummary(stFull, (k) => I.zh[k]);
ok(stText.includes('4.3.2') && stText.includes('OK') && stText.includes('DSH 受管行 1'), 'selftestSummary：完整数据说人话（走 zh 词典）', stText);
ok(I.selftestSummary(stFull).includes('stYaml'), 'selftestSummary：没有 t 时退回 key 而不抛');
ok(I.selftestSummary({}, (k) => I.zh[k]) === I.zh.stStale, 'selftestSummary：旧接口字段缺失时说"进程旧"而不是 FAIL');
ok(I.selftestSummary({ dshRows: [] }, (k) => I.zh[k]) === I.zh.stStale, 'selftestSummary：只有 dshRows 也算旧接口');
for (const junk of [{}, null, undefined, { yaml: null }, { client: {} }, { dshRows: null }]) {
  let out;
  try {
    out = I.selftestSummary(junk);
  } catch (error) {
    ok(false, `selftestSummary 遇到残缺数据抛了：${JSON.stringify(junk)} → ${error && error.message}`);
    continue;
  }
  ok(typeof out === 'string' && out.length > 0, `selftestSummary 扛住残缺输入 ${JSON.stringify(junk) ?? 'null'}`, out);
}

// ── 危险动作门禁：写回别人工具的配置文件必须逐个确认，且不绕服务端授权 ──────────
console.log('\n=== 危险动作门禁 ===');
const pushCalls = [...src.matchAll(/postJson\("\/push"/g)];
ok(pushCalls.length >= 3, `写回/删除的调用点齐全（${pushCalls.length} 处）`, pushCalls.length);
ok(!/force:\s*true/.test(src), '前端不许无条件 force: true（那会绕掉服务端的逐条写回授权）');
for (const call of pushCalls) {
  const before = src.slice(Math.max(0, call.index - 340), call.index);
  ok(before.includes('window.confirm'), `第 ${call.index} 字符处的 /push 调用有确认框`, before.slice(-80).replace(/\s+/g, ' '));
}

// ── 2026-10 反馈修复：加参数行 / DSH 行 id 兜底 / 表单校验 / 气泡提示 ──────────
console.log('\n=== 反馈修复（加参数、id 兜底、校验、气泡） ===');
ok(JSON.stringify(I.addArgRow([])) === '[""]', 'addArgRow：参数为空也能加出一行（旧版按钮没反应的根源）');
ok(JSON.stringify(I.addArgRow(['-y'])) === '["-y",""]', 'addArgRow：已有参数原样保留再加一行');
ok(I.dshIdOf({ id: 'mcp-x', serverName: 'x' }) === 'mcp-x', 'dshIdOf：优先用服务端返回的 id');
ok(I.dshIdOf({ inDsh: true, serverName: '44' }) === 'mcp-44', 'dshIdOf：旧宿主 /scan 没带 id 时按服务名派生（停用/删除不再发幽灵 id）');
ok(I.dshIdOf({ inDsh: false, serverName: 'y' }) === null, 'dshIdOf：外部行不派生 id');
ok(I.dshIdOf(null) === null, 'dshIdOf：null 不炸');
ok(I.checkMapText('A=1\n\nB=2') === null, 'checkMapText：正常 K=V（含空行）通过');
ok(I.checkMapText('BROKEN_LINE') === 'vEnvLine', 'checkMapText：缺 = 号的行被拦');
ok(I.checkMapText('A B=1') === 'vEnvKey', 'checkMapText：名字带空格被拦');
const vt = (k) => I.zh[k];
ok(I.validateServerForm({ serverName: '', transport: 'stdio', command: 'npx' }, { strictName: true }, vt).serverName !== undefined, '校验：空服务名被拦');
ok(I.validateServerForm({ serverName: '有 空格', transport: 'stdio', command: 'npx' }, { strictName: true }, vt).serverName !== undefined, '校验：服务名非法字符被拦');
ok(I.validateServerForm({ serverName: 'dup', transport: 'stdio', command: 'npx' }, { strictName: true, existingNames: ['dup'] }, vt).serverName !== undefined, '校验：DSH 里已有同名被拦');
ok(I.validateServerForm({ serverName: 'dup', transport: 'stdio', command: 'npx' }, { strictName: true, existingNames: ['dup'], selfName: 'dup' }, vt).serverName === undefined, '校验：编辑自己不改名不算撞名');
ok(I.validateServerForm({ serverName: 'ok', transport: 'stdio', command: '' }, { strictName: true }, vt).command !== undefined, '校验：stdio 缺命令被拦');
ok(I.validateServerForm({ serverName: 'ok', transport: 'stdio', command: 'npx -y foo' }, { strictName: true }, vt).command !== undefined, '校验：命令里混进参数（带空格）被拦');
ok(I.validateServerForm({ serverName: 'ok', transport: 'streamable-http', url: 'ftp://x' }, { strictName: true }, vt).url !== undefined, '校验：URL 不是 http(s) 被拦');
ok(I.validateServerForm({ serverName: 'ok', transport: 'stdio', command: 'npx', envText: 'BROKEN' }, { strictName: true }, vt).env !== undefined, '校验：env 缺 = 号被拦');
ok(Object.keys(I.validateServerForm({ serverName: 'ok', transport: 'streamable-http', url: 'https://h/mcp', headersText: 'Authorization=Bearer x' }, { strictName: true }, vt)).length === 0, '校验：完整的远程表单通过');
ok(I.validateServerForm({ serverName: '随便什么名字都行', transport: 'stdio', command: 'npx' }, { strictName: false }, vt).serverName === undefined, '校验：写回外部工具时名字规则放宽');
ok(I.filterRows([{ serverName: 'Pencil', status: 'same', command: 'npx pencil' }, { serverName: 'playwright', status: 'new', command: 'npx' }], '', 'all').length === 2, '筛选：无筛选全返回');
ok(I.filterRows([{ serverName: 'Pencil', status: 'same' }, { serverName: 'playwright', status: 'new' }], '', 'new').length === 1, '筛选：状态筛选生效');
ok(I.filterRows([{ serverName: 'Pencil', status: 'same', command: 'x' }], 'pencil', 'all').length === 1, '筛选：搜名字不分大小写');
ok(I.filterRows([{ serverName: 'a', status: 'same', command: 'pencil-run' }], 'PENCIL', 'all').length === 1, '筛选：命令行也能搜到');
ok(I.filterRows([{ serverName: 'a', status: 'same' }], 'zzz', 'all').length === 0, '筛选：没命中返回空');
const cnt = I.countByStatus([{ status: 'new' }, { status: 'gone' }, { status: 'same' }, { status: 'same' }]);
ok(cnt.total === 4 && cnt.nu === 1 && cnt.gone === 1 && cnt.same === 2 && cnt.changed === 0, '分组统计：各状态计数正确');
ok(I.isGroupOpen({}, { id: 'g1' }, cnt, false) === true, '折叠：有异常的组默认展开');
ok(I.isGroupOpen({}, { id: 'g2' }, { total: 3, nu: 0, changed: 0, gone: 0, same: 3 }, false) === false, '折叠：全「同」的组默认收起');
ok(I.isGroupOpen({ g2: true }, { id: 'g2' }, { total: 3, nu: 0, changed: 0, gone: 0, same: 3 }, false) === true, '折叠：用户手动展开的保持展开');
ok(I.isGroupOpen({ g1: false }, { id: 'g1' }, cnt, false) === false, '折叠：用户手动收起的异常组保持收起');
ok(I.isGroupOpen({}, { id: 'g3' }, { total: 3, nu: 0, changed: 0, gone: 0, same: 3 }, true) === true, '折叠：筛选中强制全展开，别把结果藏了');
ok(/role: "status"/.test(src), '气泡容器带 role="status"（读屏器可感知）');
ok(/function pushToast/.test(src), 'pushToast 存在（错误改气泡展示）');

console.log(`\n渲染元素 ${renderCounts.elements} 个 / 组件 ${renderCounts.components} 次`);
if (failures > 0) {
  console.log(`\n失败 ${failures} 项`);
  process.exit(1);
}
console.log('\n冒烟通过：客户端包可以安全注入宿主。');
