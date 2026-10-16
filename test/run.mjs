#!/usr/bin/env node
/**
 * 单元测试：只测纯函数与临时目录里的读写，绝不碰真实的 profile 或任何工具配置。
 * 跑法：`node test/run.mjs`（或 `npm test`）。
 *
 * @module tools/test-run
 */

import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { buildSchema, diagnoseYaml, dshHome, fingerprint, parseJsonLoose, parseToml, resolveYaml, stripJsonNoise } from '../lib/util.js';
import {
  MCP_CLIENT_PACKAGE,
  appendRow,
  emitInsertBlock,
  findBlockIndexOfRow,
  readManagedRows,
  removeRow,
  rowId,
  safeServerName,
  scalar,
  plainValue,
  plainMap,
  serverToConfig,
  setDisabled,
  splitTopLevel,
  joinTopLevel,
  updateRow,
  validateDocument,
} from '../lib/patch.js';
import { normalizeEntry, readJsonDialect, readTomlDialect, readOpenCodeDialect, toDialectEntry, writeJsonDialect, writeTomlDialect } from '../lib/dialect.js';
import { backupDir, commitSnapshot, forgetEntry, listSources, scanAll, serverKey, statePath, writeState } from '../lib/scan.js';
import {
  dshAdd,
  dshRemove,
  dshToggle,
  dshUpdate,
  importToDsh,
  pushToSource,
  removeFromSource,
  setPushBack,
} from '../lib/sync.js';

const profileDir = join(dshHome(), 'profiles', process.env.DSH_PROFILE ?? 'desktop');
const yaml = await resolveYaml([profileDir, join(dshHome(), 'profiles'), dirname(new URL(import.meta.url).pathname)]);
if (yaml === null || yaml === undefined) {
  console.error('找不到 js-yaml（DSH 的 profile 依赖不在预期位置）。可以用 MCPGM_YAML 环境变量或先安装 DSH。');
  process.exit(1);
}
const schema = buildSchema(yaml);

let passed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (error) {
    failures.push({ name, error });
    console.log(`  ✗ ${name}\n      ${String(error?.message ?? error).split('\n')[0]}`);
  }
}

console.log('\npatch.js');

test('safeServerName 规范化空格与中文', () => {
  assert.equal(safeServerName('API 文档').name, 'API');
  assert.equal(safeServerName('API 文档').changed, true);
  assert.equal(safeServerName('playwright-mcp').name, 'playwright-mcp');
  assert.equal(safeServerName('playwright-mcp').changed, false);
  assert.equal(safeServerName('  datacloud_bigquery_toolbox  ').name, 'datacloud_bigquery_toolbox');
  assert.ok(safeServerName('datacloud_bigquery_toolbox_very_long_server_name_over_32').name.length <= 32);
});

test('safeServerName 对纯中文给出稳定兜底名', () => {
  const a = safeServerName('文档阅读器');
  const b = safeServerName('文档阅读器');
  assert.match(a.name, /^server-[0-9a-f]{6}$/u);
  assert.equal(a.changed, true);
  assert.equal(a.name, b.name);
});

test('splitTopLevel/joinTopLevel 往返无损', () => {
  const text = '# 头部注释\n- insert:\n    - id: mcp-a\n      name: x\n- replace:\n    - id: other\n';
  const doc = splitTopLevel(text);
  assert.equal(doc.items.length, 2);
  assert.equal(joinTopLevel(doc), text);
});

test('appendRow 追加独立 insert 块且文档仍合法', () => {
  const start = '- insert:\n    - id: other\n      name: some-plugin\n';
  const next = appendRow(start, { id: rowId('pencil'), name: MCP_CLIENT_PACKAGE, config: { serverName: 'pencil', transport: 'stdio', command: 'C:\\x\\mcp.exe' } }, yaml, schema);
  assert.equal(validateDocument(next, yaml, schema), null);
  const { rows } = readManagedRows(next, yaml, schema);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].config.command, 'C:\\x\\mcp.exe');
  assert.ok(next.includes('- insert:'), '别人的块要原样保留');
  assert.ok(next.includes('some-plugin'));
});

test('反斜杠与多行值发射后仍能被 js-yaml 读回', () => {
  const row = { id: rowId('a'), name: MCP_CLIENT_PACKAGE, config: { serverName: 'a', transport: 'stdio', command: 'cmd', args: ['/c', 'npx -y "x y"'], env: { KEY: 'a"b\\c' }, cwd: 'C:\\Users\\x\\y' } };
  const text = appendRow('', row, yaml, schema);
  const parsed = yaml.load(text, { schema });
  assert.equal(parsed[0].insert[0].config.cwd, 'C:\\Users\\x\\y');
  assert.deepEqual(parsed[0].insert[0].config.args, ['/c', 'npx -y "x y"']);
  assert.equal(parsed[0].insert[0].config.env.KEY, 'a"b\\c');
});

test('updateRow 只改目标行，同块兄弟行不动', () => {
  const block = emitInsertBlock([
    { id: rowId('one'), name: MCP_CLIENT_PACKAGE, config: { serverName: 'one', transport: 'stdio', command: 'a' } },
    { id: rowId('two'), name: MCP_CLIENT_PACKAGE, config: { serverName: 'two', transport: 'stdio', command: 'b' } },
  ]);
  const text = `${block}\n`;
  const { text: next } = updateRow(text, rowId('two'), { name: MCP_CLIENT_PACKAGE, config: { serverName: 'two', transport: 'streamable-http', url: 'http://127.0.0.1:1/mcp' } }, yaml, schema);
  assert.equal(validateDocument(next, yaml, schema), null);
  const { rows } = readManagedRows(next, yaml, schema);
  const two = rows.find((r) => r.id === rowId('two'));
  assert.equal(two.config.url, 'http://127.0.0.1:1/mcp');
  const one = rows.find((r) => r.id === rowId('one'));
  assert.equal(one.config.command, 'a', '兄弟行必须完好');
});

test('removeRow 删掉块里最后一行时整块消失', () => {
  const text = `${emitInsertBlock([{ id: rowId('solo'), name: MCP_CLIENT_PACKAGE, config: { serverName: 'solo' } }])}\n`;
  const { text: next } = removeRow(text, rowId('solo'), yaml, schema);
  assert.equal(next.trim(), '');
  assert.equal(validateDocument(next, yaml, schema), null);
});

test('setDisabled 增加/移除同级 disabled 覆盖行', () => {
  let text = `${emitInsertBlock([{ id: rowId('x'), name: MCP_CLIENT_PACKAGE, config: { serverName: 'x' } }])}\n`;
  text = setDisabled(text, rowId('x'), true, yaml, schema).text;
  const { disabledIds } = readManagedRows(text, yaml, schema);
  assert.equal(disabledIds.has(rowId('x')), true);
  text = setDisabled(text, rowId('x'), false, yaml, schema).text;
  assert.equal(readManagedRows(text, yaml, schema).disabledIds.size, 0);
});

test('setDisabled 拒绝没有对应服务器行的 mcp- 停用行（隔壁插件的配置行）', () => {
  const text = `${emitInsertBlock([{ id: rowId('x'), name: MCP_CLIENT_PACKAGE, config: { serverName: 'x' } }])}\n- id: mcp-manager-plus\n  disabled: true\n`;
  assert.equal(readManagedRows(text, yaml, schema).disabledIds.has('mcp-manager-plus'), false);
  const refusal = setDisabled(text, 'mcp-manager-plus', false, yaml, schema);
  assert.equal(refusal.changed, false);
  assert.match(String(refusal.error), /别的插件/u, String(refusal.error));
  assert.equal(refusal.text, text, '拒绝时必须原样返回文本');
  assert.equal(setDisabled(text, rowId('x'), true, yaml, schema).changed, true, '自己的行照常可停用');
});

test('validateDocument 拒绝非数组顶层，保护启动', () => {
  assert.notEqual(validateDocument('a: 1\n', yaml, schema), null);
  assert.notEqual(validateDocument('- "just a string"\n', yaml, schema), null);
  assert.notEqual(validateDocument('{ broken', yaml, schema), null);
});

test('serverToConfig 只保留必要键', () => {
  const config = serverToConfig({ serverName: 'a', transport: 'stdio', command: 'npx', args: ['-y', 'x'], env: {}, cwd: '', url: 'ignored' });
  assert.deepEqual(Object.keys(config), ['serverName', 'transport', 'command', 'args']);
});

console.log('\ndialect.js');

test('normalizeEntry 认得 remote/url 与 serverUrl 与 http_headers', () => {
  assert.equal(normalizeEntry({ type: 'remote', url: 'http://a/mcp' }).transport, 'streamable-http');
  assert.equal(normalizeEntry({ serverUrl: 'http://a/mcp' }).url, 'http://a/mcp');
  assert.equal(normalizeEntry({ type: 'sse', url: 'http://a/sse' }).transport, 'streamable-http');
  assert.deepEqual(normalizeEntry({ serverUrl: 'http://a/mcp', http_headers: { A: '1' } }).headers, { A: '1' });
  assert.equal(normalizeEntry({ command: 'npx', args: ['-y', 'x'] }).transport, 'stdio');
});

test('normalizeEntry 把数组形式的 command 拆开（OpenCode 方言）', () => {
  const entry = normalizeEntry({ type: 'local', command: ['npx', '@playwright/mcp@latest'] });
  assert.equal(entry.command, 'npx');
  assert.deepEqual(entry.args, ['@playwright/mcp@latest']);
});

test('stripJsonNoise 去掉注释与尾逗号而不动字符串', () => {
  const raw = '{\n  // 注释\n  "mcpServers": { "a": { "command": "npx // not-a-comment" } },\n}';
  const parsed = parseJsonLoose(raw);
  assert.equal(parsed.error, null);
  assert.equal(parsed.value.mcpServers.a.command, 'npx // not-a-comment');
  assert.equal(stripJsonNoise(raw).includes('// 注释'), false);
});

test('readJsonDialect 认得 mcpServers / servers 两种容器键', () => {
  assert.equal(readJsonDialect('{"mcpServers":{"a":{"command":"x"}}}').servers[0].name, 'a');
  assert.equal(readJsonDialect('{"servers":{"b":{"command":"x"}}}').containerKey, 'servers');
});

test('readJsonDialect 支持顶层就是单个条目的裸文档（没有名字，靠面板补）', () => {
  const result = readJsonDialect('{"command":"x","args":["-y"]}');
  assert.equal(result.containerKey, null);
  assert.equal(result.servers.length, 1);
  assert.equal(result.servers[0].command, 'x');
  assert.equal(result.servers[0].name, '');
});

test('readJsonDialect 支持 Continue 那种数组内嵌 name 的形态', () => {
  const result = readJsonDialect('[{"name":"flow","serverUrl":"http://127.0.0.1:8787/mcp"}]');
  assert.equal(result.servers[0].name, 'flow');
  assert.equal(result.servers[0].transport, 'streamable-http');
});

test('readTomlDialect 不会把 .env 子表当成服务器', () => {
  const toml = '[mcp_servers.node_repl]\ncommand = "node"\nargs = ["a.js"]\n\n[mcp_servers.node_repl.env]\nNODE_ENV = "production"\n\n[mcp_servers.pencil]\ncommand = "pencil.exe"\n';
  const result = readTomlDialect(toml);
  assert.deepEqual(result.servers.map((s) => s.name).sort(), ['node_repl', 'pencil']);
  assert.deepEqual(result.servers.find((s) => s.name === 'node_repl').env, { NODE_ENV: 'production' });
});

test('writeTomlDialect upsert 后可被读回', () => {
  const start = '[mcp_servers.node_repl]\ncommand = "node"\n\n[other]\nx = 1\n';
  const { text } = writeTomlDialect(start, { action: 'upsert', name: 'pencil', entry: { command: 'pencil.exe', args: ['--stdio'], env: { A: 'b' } } });
  const result = readTomlDialect(text);
  assert.ok(result.servers.some((s) => s.name === 'pencil'));
  assert.equal(text.includes('[other]'), true, '别的表不能被弄丢');
});

test('writeJsonDialect 保留容器外的其他键', () => {
  const start = JSON.stringify({ telemetry: true, mcpServers: { a: { command: 'x' } } }, null, 2);
  const { text } = writeJsonDialect(start, { action: 'upsert', containerKey: 'mcpServers', name: 'b', entry: { command: 'y' } });
  const parsed = JSON.parse(text);
  assert.equal(parsed.telemetry, true);
  assert.ok(parsed.mcpServers.a);
  assert.ok(parsed.mcpServers.b);
  assert.equal(writeJsonDialect(start, { action: 'remove', containerKey: 'mcpServers', name: 'a' }).text.includes('"a"'), false);
});

test('toDialectEntry 各方言形状符合自家写法', () => {
  const stdio = { serverName: 'a', transport: 'stdio', command: 'npx', args: ['-y', 'x'], env: { K: 'v' }, cwd: '' };
  assert.deepEqual(toDialectEntry('opencode', stdio).command, ['npx', '-y', 'x']);
  assert.equal(toDialectEntry('opencode', stdio).type, 'local');
  assert.deepEqual(toDialectEntry('opencode', stdio).environment, { K: 'v' });
  assert.equal(toDialectEntry('opencode', stdio).cwd, undefined, '空 cwd 不该写成空串');
  assert.equal(toDialectEntry('vscode', stdio).type, 'stdio');
  assert.equal(toDialectEntry('codex', stdio).type, 'stdio');
  assert.equal(toDialectEntry('claude', stdio).type, undefined, 'Claude 方言不写 type');
  const remote = { serverName: 'a', transport: 'streamable-http', url: 'http://h/mcp', headers: { A: '1' } };
  assert.equal(toDialectEntry('vscode', remote).type, 'http');
  assert.deepEqual(toDialectEntry('codex', remote).http_headers, { A: '1' });
  assert.deepEqual(toDialectEntry('claude', remote).headers, { A: '1' });
});

test('readOpenCodeDialect 从 mcp 容器读取', () => {
  const result = readOpenCodeDialect('{"mcp":{"playwright":{"type":"local","command":["npx","@playwright/mcp@latest"]}}}');
  assert.equal(result.servers[0].name, 'playwright');
  assert.equal(result.servers[0].command, 'npx');
});

console.log('\nutil.js');

test('fingerprint 对键序不敏感、对值敏感', () => {
  assert.equal(fingerprint({ a: 1, b: 2 }), fingerprint({ b: 2, a: 1 }));
  assert.notEqual(fingerprint({ a: 1 }), fingerprint({ a: 2 }));
});

test('parseToml 支持基础类型与一级数组', () => {
  const { flat } = parseToml('[a.b]\nk = "v"\nn = 3\nbool = true\narr = ["x", "y"]\n');
  assert.deepEqual(flat['a.b'], { k: 'v', n: 3, bool: true, arr: ['x', 'y'] });
});

test('findBlockIndexOfRow 定位正确的块', () => {
  const text = `${emitInsertBlock([{ id: rowId('a'), name: MCP_CLIENT_PACKAGE, config: {} }])}\n${emitInsertBlock([{ id: rowId('b'), name: MCP_CLIENT_PACKAGE, config: {} }])}\n`;
  const doc = splitTopLevel(text);
  assert.equal(findBlockIndexOfRow(doc, rowId('b'), yaml, schema), 1);
});

// 冷启动依赖探测：上面的 resolveYaml 可能命中 import 缓存，看不出 pnpm 把磁盘副本换了；
// diagnoseYaml 现场解析一遍，是唯一能在重启前预警「补丁解析要崩」的信号。
const diag = await diagnoseYaml([profileDir, join(dshHome(), 'profiles')]);

test('diagnoseYaml 现场找到可用的 js-yaml 4.x（补丁方言依赖 Type 构造器）', () => {
  assert.equal(diag.ok, true, `解析不到带 Type 的 js-yaml，tried=${JSON.stringify(diag.tried)}`);
  assert.match(String(diag.resolved.version), /^4\./u, `需要 4.x，实际拿到 ${diag.resolved.version}（${diag.resolved.path}）`);
  assert.equal(diag.resolved.usable, true);
  console.log(`  js-yaml 现场解析：${diag.resolved.version} @ ${String(diag.resolved.path).replace(profileDir, '<profile>')}`);
});

// ── sync.js 写路径演练 ────────────────────────────────────────────────────────
// 全套测试里唯一真的会「改文件」的一段，所以整个搬进临时沙箱：把 DSH_HOME 指到 temp，
// 插件的 state.json 与 backups/ 也跟着进沙箱，绝不碰真 profile 或任何工具配置。
console.log('\nsync.js 写路径（沙箱演练）');

const sandbox = mkdtempSync(join(tmpdir(), 'mcpgm-write-'));
process.env.DSH_HOME = sandbox;
const patchPath = join(sandbox, 'cordis.patch.yml');
// 抄一段真实补丁的形状：头部注释 + 流式 disable 条目 + 宿主自己的配置行。
// 这些都是「别人的东西」，我们的每次写入都必须让它们原封不动。
writeFileSync(
  patchPath,
  `# 用户自己的注释，一个字都不许丢
- { id: some-plugin, disabled: false }
- id: ui-settings
  name: "@deepseek-ai/dsh-client-ui-settings"
  config:
    enabled: true
- id: mcp-manager-plus
  disabled: true
`,
  'utf8',
);
const cleanState = { version: 1, adopted: {}, customSources: [] };

function countFiles(root) {
  let total = 0;
  const stack = [root];
  while (stack.length > 0) {
    const dir = stack.pop();
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else total += 1;
    }
  }
  return total;
}

test('importToDsh：插进行、记账本，别人的补丁内容原封不动', () => {
  const out = importToDsh({
    patchPath,
    yaml,
    schema,
    state: cleanState,
    servers: [
      { key: serverKey('trae', 'pencil'), sourceId: 'trae', serverName: 'pencil', transport: 'stdio', command: 'npx', args: ['-y', 'pencil-mcp'] },
      { key: serverKey('trae', 'API 文档'), sourceId: 'trae', serverName: 'API 文档', transport: 'streamable-http', url: 'http://127.0.0.1:8080/mcp' },
    ],
  });
  assert.equal(out.ok, true, String(out.error ?? ''));
  assert.equal(out.created.length, 2, JSON.stringify(out.skipped));
  const text = readFileSync(patchPath, 'utf8');
  assert.ok(text.includes('# 用户自己的注释'), '头部注释必须原样保留');
  assert.ok(text.includes('- { id: some-plugin, disabled: false }'), '别人的流式条目不许被改写');
  assert.ok(text.includes('ui-settings'), '宿主自己的配置行不许被吃掉');
  const { rows } = readManagedRows(text, yaml, schema);
  assert.equal(rows.length, 2, `只应多出我们自己的 2 行，实际 ${rows.length}`);
  assert.equal(rows.find((row) => row.id === rowId('pencil')).config.command, 'npx');
  assert.equal(out.state.adopted[serverKey('trae', 'API 文档')].dshId, rowId('API'), '中文名规范化后账本要指向新 id');
  assert.equal(existsSync(statePath()), true, 'state 落在沙箱，不是真 profile');
});

test('重复采纳幂等：created 归零、字节不动', () => {
  const before = readFileSync(patchPath, 'utf8');
  const out = importToDsh({
    patchPath,
    yaml,
    schema,
    state: cleanState,
    servers: [{ key: serverKey('trae', 'pencil'), sourceId: 'trae', serverName: 'pencil', transport: 'stdio', command: 'npx' }],
  });
  assert.equal(out.ok, true, String(out.error ?? ''));
  assert.equal(out.changed, false);
  assert.equal(out.created.length, 0);
  assert.equal(out.skipped.length, 1);
  assert.equal(readFileSync(patchPath, 'utf8'), before, '幂等：一个字节都不该动');
});

test('同批次同名只插一行（同一个 pencil 在 5 个工具里都有）', () => {
  const out = importToDsh({
    patchPath,
    yaml,
    schema,
    state: cleanState,
    servers: [
      { key: serverKey('trae', 'dup'), sourceId: 'trae', serverName: 'dup', transport: 'stdio', command: 'a' },
      { key: serverKey('cursor', 'dup'), sourceId: 'cursor', serverName: 'dup', transport: 'stdio', command: 'b' },
    ],
  });
  assert.equal(out.created.length, 1, JSON.stringify(out.created));
  assert.equal(out.skipped.length, 1);
});

test('dshToggle：停用与恢复只增删同级覆盖行', () => {
  const id = rowId('pencil');
  const off = dshToggle({ patchPath, yaml, schema, id, disabled: true });
  assert.equal(off.ok, true, String(off.error ?? ''));
  let view = readManagedRows(readFileSync(patchPath, 'utf8'), yaml, schema);
  assert.equal(view.disabledIds.has(id), true);
  assert.ok(readFileSync(patchPath, 'utf8').includes('- { id: some-plugin'), '加覆盖行不许碰坏别人的条目');
  const on = dshToggle({ patchPath, yaml, schema, id, disabled: false });
  assert.equal(on.ok, true, String(on.error ?? ''));
  view = readManagedRows(readFileSync(patchPath, 'utf8'), yaml, schema);
  assert.equal(view.disabledIds.has(id), false);
});

test('外来同前缀停用行不被认领；切换它会被拒绝且一个字节都不动', () => {
  const before = readFileSync(patchPath, 'utf8');
  assert.equal(readManagedRows(before, yaml, schema).disabledIds.has('mcp-manager-plus'), false, '没有对应服务器行的停用行不属于我们');
  const out = dshToggle({ patchPath, yaml, schema, id: 'mcp-manager-plus', disabled: true });
  assert.equal(out.ok, false, JSON.stringify(out));
  assert.match(String(out.error), /别的插件/u, String(out.error));
  assert.equal(readFileSync(patchPath, 'utf8'), before, '拒绝就不能动一个字节');
});

test('外来/不存在的 id：删除与改名都被拒绝，文件与账本都不动', () => {
  const before = readFileSync(patchPath, 'utf8');
  const state = { ...cleanState, adopted: { 'trae::pencil': { dshId: 'mcp-manager-plus', adoptedAt: 'x', pushBack: false } } };
  const out = dshRemove({ patchPath, yaml, schema, state, id: 'mcp-manager-plus' });
  assert.equal(out.ok, false, JSON.stringify(out));
  assert.match(String(out.error), /没有改动任何文件/u, String(out.error));
  assert.equal(readFileSync(patchPath, 'utf8'), before, '拒绝就不能动一个字节');
  assert.equal(out.state, undefined, '拒绝就不该顺手清账本（旧代码会写 state）');
  const upd = dshUpdate({ patchPath, yaml, schema, state, id: 'mcp-manager-plus', server: { serverName: 'ghost', transport: 'stdio', command: 'true' } });
  assert.equal(upd.ok, false, JSON.stringify(upd));
  assert.match(String(upd.error), /没有改动任何文件/u, String(upd.error));
  assert.equal(readFileSync(patchPath, 'utf8'), before, '改名分支也不许 appendRow 凭空造一行');
});

test('dshUpdate 改名：旧行消失、账本迁移、兄弟行完好', () => {
  const state = { ...cleanState, adopted: { [serverKey('trae', 'pencil')]: { dshId: rowId('pencil'), adoptedAt: 'x', pushBack: false } } };
  const out = dshUpdate({
    patchPath,
    yaml,
    schema,
    state,
    id: rowId('pencil'),
    server: { serverName: 'pencil2', transport: 'stdio', command: 'npx', args: ['-y', 'pencil-mcp'] },
  });
  assert.equal(out.ok, true, String(out.error ?? ''));
  assert.equal(out.id, rowId('pencil2'));
  const view = readManagedRows(readFileSync(patchPath, 'utf8'), yaml, schema);
  assert.equal(view.rows.some((row) => row.id === rowId('pencil')), false, '旧行必须消失');
  assert.equal(view.rows.some((row) => row.id === rowId('pencil2')), true);
  assert.equal(view.rows.some((row) => row.id === rowId('API')), true, '同补丁里的兄弟行必须完好');
  assert.equal(out.state.adopted[serverKey('trae', 'pencil')].dshId, rowId('pencil2'), '采纳关系要迁到新 id');
});

test('dshRemove：只删自己那行，宿主补丁与我们的其它行都不受牵连', () => {
  const out = dshRemove({
    patchPath,
    yaml,
    schema,
    state: { ...cleanState, adopted: { 'trae::pencil2': { dshId: rowId('pencil2') } } },
    id: rowId('API'),
  });
  assert.equal(out.ok, true, String(out.error ?? ''));
  const text = readFileSync(patchPath, 'utf8');
  const view = readManagedRows(text, yaml, schema);
  assert.equal(view.rows.some((row) => row.id === rowId('API')), false);
  assert.ok(text.includes('ui-settings') && text.includes('some-plugin'), '删除后宿主自己的补丁必须还在');
  assert.equal(view.rows.some((row) => row.id === rowId('pencil2')), true, '我们自己的其它行不该被牵连');
});

test('手工新建遇到非法服务名：拒绝并给出可用建议（不静默改名）', () => {
  const out = dshAdd({ patchPath, yaml, schema, state: cleanState, server: { serverName: 'API 文档2', transport: 'stdio', command: 'x' } });
  assert.equal(out.ok, false);
  assert.match(String(out.error), /建议改成/u, String(out.error));
});

test('同名不静默覆盖：已存在就报错', () => {
  const out = dshAdd({ patchPath, yaml, schema, state: cleanState, server: { serverName: 'pencil2', transport: 'stdio', command: 'x' } });
  assert.equal(out.ok, false);
  assert.match(String(out.error), /已存在/u, String(out.error));
});

test('补丁坏掉时拒绝写入，原字节一个都不动（保险丝）', () => {
  const broken = join(sandbox, 'broken.patch.yml');
  writeFileSync(broken, 'a: 1\n', 'utf8');
  const before = readFileSync(broken, 'utf8');
  let rejected = false;
  try {
    const out = dshAdd({ patchPath: broken, yaml, schema, state: cleanState, server: { serverName: 'boom', transport: 'stdio', command: 'x' } });
    rejected = out.ok !== true;
  } catch {
    rejected = true; // 抛错也算拒绝，但绝不能写坏文件
  }
  assert.equal(rejected, true, '非数组顶层的补丁必须被拦住');
  assert.equal(readFileSync(broken, 'utf8'), before, '拒绝写入时不许动一个字节');
});

test('pushToSource 写回 JSON 源：先备份，邻居条目与容器外的键都不动', () => {
  const file = join(sandbox, 'trae.json');
  writeFileSync(file, JSON.stringify({ mcpServers: { keep: { command: 'keep', args: ['1'] } }, otherTop: { a: 1 } }, null, 2), 'utf8');
  const out = pushToSource({
    file,
    format: 'json',
    containerHint: 'mcpServers',
    dialect: 'claude',
    name: 'fresh',
    server: { transport: 'stdio', command: 'npx', args: ['-y', 'fresh'], env: { TOKEN: 'x' } },
  });
  assert.equal(out.ok, true, String(out.error ?? ''));
  assert.equal(out.changed, true);
  const parsed = JSON.parse(readFileSync(file, 'utf8'));
  assert.deepEqual(parsed.mcpServers.keep, { command: 'keep', args: ['1'] }, '邻居条目必须原样');
  assert.equal(parsed.otherTop.a, 1, '容器之外的顶层键必须原样');
  assert.equal(parsed.mcpServers.fresh.command, 'npx');
  assert.equal(countFiles(backupDir()) > 0, true, '写别人的文件之前必须先留下备份');
});

test('removeFromSource 只摘掉我们写进去的那个条目', () => {
  const out = removeFromSource({ file: join(sandbox, 'trae.json'), format: 'json', containerHint: 'mcpServers', name: 'fresh' });
  assert.equal(out.ok, true, String(out.error ?? ''));
  const parsed = JSON.parse(readFileSync(join(sandbox, 'trae.json'), 'utf8'));
  assert.equal(parsed.mcpServers.fresh, undefined);
  assert.equal(parsed.mcpServers.keep.command, 'keep');
});

test('pushToSource 认得 Codex 的 TOML 方言并保住兄弟 section', () => {
  const file = join(sandbox, 'config.toml');
  writeFileSync(file, '[mcp_servers.keep]\ncommand = "keep"\n', 'utf8');
  const out = pushToSource({ file, format: 'toml', dialect: 'codex', name: 'neo', server: { transport: 'stdio', command: 'npx', args: ['-y', 'neo'] } });
  assert.equal(out.ok, true, String(out.error ?? ''));
  const { servers } = readTomlDialect(readFileSync(file, 'utf8'));
  assert.deepEqual(servers.map((item) => item.name).sort(), ['keep', 'neo']);
});

test('setPushBack 的授权真的落盘（不是只回给前端）', () => {
  const key = serverKey('trae', 'pencil2');
  const next = setPushBack({ ...cleanState, adopted: { [key]: { dshId: rowId('pencil2'), pushBack: false } } }, key, true);
  assert.equal(next.adopted[key].pushBack, true);
  const onDisk = JSON.parse(readFileSync(statePath(), 'utf8'));
  assert.equal(onDisk.adopted[key].pushBack, true, '必须真的写在盘上，否则刷新就丢授权');
});

// ── 差异标记（刷新按钮到底在标什么）────────────────────────────────────────────
console.log('\nscan.js 差异标记（沙箱自定义源）');

const probeFile = join(sandbox, 'probe.json');
const twinFile = join(sandbox, 'twin.json');
const probeSource = { id: 'zz-probe', label: '沙箱探针', format: 'json', writeBack: true, paths: [probeFile] };
const twinSource = { id: 'zz-probe-twin', label: '沙箱探针兄弟', format: 'json', writeBack: false, paths: [twinFile] };
const probeKey = serverKey('zz-probe', 'zprobe');
const scanCtx = { dshPatchPath: patchPath, yaml, schema };
const baseState = () => ({ ...cleanState, fingerprints: {}, lastSeen: {}, customSources: [probeSource, twinSource] });
const findItem = (result, key) => result.servers.find((item) => item.key === key);
const writeProbe = (arg) => writeFileSync(probeFile, JSON.stringify({ mcpServers: { zprobe: { command: 'npx', args: ['-y', arg] } } }, null, 2), 'utf8');

writeProbe('aaa');
writeFileSync(twinFile, JSON.stringify({ mcpServers: { zprobe: { command: 'npx', args: ['-y', 'aaa'] } } }, null, 2), 'utf8');

test('首次扫描标 new；同名散落在多个源里互相点名 duplicateOf', () => {
  const item = findItem(scanAll({ ...scanCtx, state: baseState() }), probeKey);
  assert.ok(item, '探针条目必须被扫出来');
  assert.equal(item.status, 'new');
  assert.equal(item.sourceLabel, '沙箱探针');
  assert.equal(item.writeBack, true, '注册表里的「允许写回」要跟着源走');
  assert.deepEqual(item.duplicateOf, ['沙箱探针兄弟'], '同名必须点名兄弟源');
});

test('内容没变再刷新一次，不该冒出任何假「新增」', () => {
  const state0 = baseState();
  const state1 = commitSnapshot(state0, scanAll({ ...scanCtx, state: state0 }));
  const round2 = scanAll({ ...scanCtx, state: state1 });
  assert.equal(findItem(round2, probeKey).status, 'same');
  assert.equal(round2.servers.filter((item) => item.status === 'new').length, 0, JSON.stringify(round2.servers.filter((item) => item.status === 'new').map((item) => item.key)));
});

test('改了命令 → changed', () => {
  const state0 = baseState();
  const state1 = commitSnapshot(state0, scanAll({ ...scanCtx, state: state0 }));
  writeProbe('bbb');
  assert.equal(findItem(scanAll({ ...scanCtx, state: state1 }), probeKey).status, 'changed');
});

test('改 env 值算 changed；别的工具单纯重排键顺序不算变化', () => {
  writeProbe('bbb');
  const state0 = baseState();
  const state1 = commitSnapshot(state0, scanAll({ ...scanCtx, state: state0 }));
  writeFileSync(probeFile, JSON.stringify({ mcpServers: { zprobe: { command: 'npx', args: ['-y', 'bbb'], env: { K: '1' } } } }, null, 2), 'utf8');
  assert.equal(findItem(scanAll({ ...scanCtx, state: state1 }), probeKey).status, 'changed', '换了 env 必须报出来');
  const state2 = commitSnapshot(state1, scanAll({ ...scanCtx, state: state1 }));
  writeFileSync(probeFile, JSON.stringify({ mcpServers: { zprobe: { env: { K: '1' }, args: ['-y', 'bbb'], command: 'npx' } } }, null, 2), 'utf8');
  assert.equal(findItem(scanAll({ ...scanCtx, state: state2 }), probeKey).status, 'same', '只是键顺序被重排，不该误报');
});

test('源文件消失 → 只标 gone 不自动删，展示信息与采纳关系都从上次快照补回来', () => {
  const state0 = { ...baseState(), adopted: { [probeKey]: { dshId: rowId('zprobe'), pushBack: true } } };
  const state1 = commitSnapshot(state0, scanAll({ ...scanCtx, state: state0 }));
  rmSync(probeFile, { force: true });
  const item = findItem(scanAll({ ...scanCtx, state: state1 }), probeKey);
  assert.equal(item.status, 'gone');
  assert.equal(item.sourceMissing, true);
  assert.equal(item.adoptedDshId, rowId('zprobe'), 'gone 的条目要带着采纳关系，面板才知道它是谁');
  assert.equal(item.pushBack, true, 'gone 行也要带写回授权，不然「允许写回」点了按钮永远不变');
  assert.equal(item.command, 'npx', '展示信息必须从上次快照补回来');
  assert.equal(item.duplicateOf, undefined, 'gone 的条目不参与同名点名');
});

test('消失后原样回来 → same（基线不能被丢掉，这是「只标记不自动删」的下半句）', () => {
  writeProbe('bbb'); // 用例自带前置，不依赖上一个测试留下的文件状态
  const state0 = baseState();
  let state = commitSnapshot(state0, scanAll({ ...scanCtx, state: state0 }));
  rmSync(probeFile, { force: true });
  state = commitSnapshot(state, scanAll({ ...scanCtx, state }));
  assert.notEqual(state.fingerprints[probeKey], undefined, '基线必须留着');
  assert.notEqual(state.lastSeen[probeKey], undefined, '展示信息也要留着');
  writeProbe('bbb'); // 原样放回：内容跟消失前一模一样
  assert.equal(findItem(scanAll({ ...scanCtx, state }), probeKey).status, 'same', '回来≠新增');
});

test('清除标记只删账本条目：下次扫描这行彻底消失，配置文件一个字节不动', () => {
  writeProbe('bbb');
  const state0 = baseState();
  let state = commitSnapshot(state0, scanAll({ ...scanCtx, state: state0 }));
  rmSync(probeFile, { force: true });
  state = commitSnapshot(state, scanAll({ ...scanCtx, state }));
  assert.equal(findItem(scanAll({ ...scanCtx, state }), probeKey).status, 'gone');
  writeState(state); // forgetEntry 走盘上账本（和真实路由同一条路），先把gone 状态落盘
  const outcome = forgetEntry(probeKey);
  assert.equal(outcome.ok, true);
  assert.equal(outcome.forgot, true, '要报告确实清掉了东西');
  const after = JSON.parse(readFileSync(statePath(), 'utf8'));
  assert.equal(after.fingerprints[probeKey], undefined, '指纹要删');
  assert.equal(after.lastSeen[probeKey], undefined, '上次快照要删');
  assert.equal(after.adopted[probeKey], undefined, '本用例没给采纳关系，别凭空多出');
  assert.equal(findItem(scanAll({ ...scanCtx, state: after }), probeKey), undefined, '清完标记这行不再出现在列表');
  assert.equal(forgetEntry('nope::nothing').forgot, false, '清不存在的标记不报错');
});

test('账本缺字段（被手改坏的 state.json）也不许让扫描崩掉', () => {
  writeProbe('bbb');
  const crippled = { version: 1, adopted: {}, customSources: [probeSource] }; // 故意没有 fingerprints / lastSeen
  const result = scanAll({ ...scanCtx, state: crippled });
  assert.equal(findItem(result, probeKey).status, 'new', '空基线应当全部视作新增，而不是抛异常');
});

test('账本里认不出主的指纹（没有 lastSeen）会被清掉，不无限膨胀', () => {
  writeProbe('bbb');
  const state0 = baseState();
  const seeded = { ...state0, fingerprints: { 'zz-ghost::boo': 'deadbeef' } };
  const next = commitSnapshot(seeded, scanAll({ ...scanCtx, state: seeded }));
  assert.equal(next.fingerprints['zz-ghost::boo'], undefined, '只剩指纹没有上下文的条目应当丢弃');
  assert.notEqual(next.fingerprints[probeKey], undefined, '正常的基线不能被牵连');
});

// ── 安全加固（2026-10 审查）──────────────────────────────────────────────────
console.log('\n安全加固：注入消毒与单一视图');

test('scalar：合法单行表达式放行；多行 !!js 不再裸发射', () => {
  assert.equal(scalar({ __jsExpr: 'process.env.X || "y"' }), '!!js process.env.X || "y"');
  const bad = scalar({ __jsExpr: 'a\n- id: evil' });
  assert.ok(!bad.startsWith('!!js'), `不许发射标签：${bad}`);
});

test('plainValue/Map：注入对象冻成惰性字符串；手写取值式保留', () => {
  assert.equal(typeof plainValue({ __jsExpr: "require('child_process')" }), 'string');
  assert.equal(plainValue({ __jsExpr: 'process.env.HOME' }).__jsExpr, 'process.env.HOME');
  assert.equal(plainValue('a::b'), 'a::b', '普通字符串一律不动');
  assert.deepEqual(plainMap([1, 2]), {}, '数组形状的表整体作废');
});

test('serverToConfig 消毒外来文件/表单输入：恶意 env 冻结、普通值不变', () => {
  const config = serverToConfig({
    serverName: 'p', transport: 'stdio', command: 'npx',
    args: ['-y', { __jsExpr: 'process.exit(1)' }],
    env: { EVIL: { __jsExpr: "require('fs')" }, OK: 'plain', KEEP: { __jsExpr: 'process.env.HOME' } },
  });
  assert.equal(typeof config.env.EVIL, 'string', '带函数调用的 env 被冻结');
  assert.equal(config.env.OK, 'plain');
  assert.equal(config.env.KEEP.__jsExpr, 'process.env.HOME', '用户手写表达式照常往返');
  assert.equal(typeof config.args[1], 'string', 'args 同样消毒');
});

test('自定义源覆盖内置 id：扫描与清单同一视图，授权与目标文件不分家', () => {
  const overrideFile = join(sandbox, 'trae-override.json');
  writeFileSync(overrideFile, JSON.stringify({ mcpServers: { zprobe: { command: 'npx', args: ['-y', 'aaa'] } } }), 'utf8');
  const override = { id: 'trae', label: 'trae 覆盖', format: 'json', writeBack: true, paths: [overrideFile] };
  const state = { ...cleanState, fingerprints: {}, lastSeen: {}, customSources: [override] };
  const result = scanAll({ ...scanCtx, state });
  const trae = result.sources.find((item) => item.id === 'trae');
  assert.equal(result.sources.filter((item) => item.id === 'trae').length, 1, '同一 id 不再出现两行');
  assert.equal(trae.file, overrideFile, '目标文件必须跟着覆盖路径走');
  const item = result.servers.find((s) => s.key === serverKey('trae', 'zprobe'));
  assert.equal(item.writeBack, true, '条目上的写回授权来自覆盖项');
  const listed = listSources(state).find((item2) => item2.id === 'trae');
  assert.equal(listed.custom, true, '清单里这一行标成自定义覆盖项');
  assert.equal(listed.builtin, false);
});

test('坏源（路径是目录）只标自己出错，整个扫描不许炸', () => {
  const state = { ...cleanState, fingerprints: {}, lastSeen: {}, customSources: [{ id: 'zz-bad', label: '坏源', format: 'json', writeBack: false, paths: [sandbox] }, probeSource] };
  const result = scanAll({ ...scanCtx, state });
  const bad = result.sources.find((item) => item.id === 'zz-bad');
  assert.ok(String(bad.error ?? '').includes('读取异常'), `坏源应带异常标记：${bad.error}`);
  assert.ok(findItem(result, probeKey), '其它源照常扫出来');
});

test('writeTomlDialect 挡结构注入：坏名字/坏 env 键被拒且原文一字不动', () => {
  const base = '[mcp_servers.ok]\ncommand = "npx"\n';
  const bad = writeTomlDialect(base, { action: 'upsert', name: 'x]\nfoo = 1\n[mcp_servers.evil', entry: { command: 'npx' } });
  assert.ok(bad.error, '带换行方括号的名字必须被拒');
  assert.equal(bad.text, base, '拒绝时原文一字不动');
  const badEnv = writeTomlDialect(base, { action: 'upsert', name: 'ok2', entry: { command: 'npx', env: { 'A]" = 1\nx': 'v' } } });
  assert.ok(badEnv.error && /env/.test(badEnv.error), `env 键名注入必须点名 env：${badEnv.error}`);
  assert.equal(badEnv.text, base);
});

test('pushToSource 把 TOML 恶意名的拒绝向上传递，不静默吞掉', () => {
  const file = join(sandbox, 'evil-inject.toml');
  const original = '[mcp_servers.keep]\ncommand = "keep"\n';
  writeFileSync(file, original, 'utf8');
  const result = pushToSource({ file, format: 'toml', name: 'a\nb', server: { transport: 'stdio', command: 'npx' } });
  assert.equal(result.ok, false, '必须报错而不是返回 changed:false 蒙混');
  assert.equal(readFileSync(file, 'utf8'), original, '恶意名被拒：源文件一个字节没变');
});

if (failures.length === 0) {
  rmSync(sandbox, { recursive: true, force: true });
} else {
  console.log(`（沙箱保留以便排查：${sandbox}）`);
}

if (failures.length > 0) {
  console.error(`\n${passed} 通过 / ${failures.length} 失败`);
  for (const failure of failures) console.error(`\n--- ${failure.name} ---\n${failure.error?.stack ?? failure.error}`);
  process.exit(1);
}
console.log(`\n全部通过：${passed} 项`);
