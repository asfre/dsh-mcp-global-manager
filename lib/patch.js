/**
 * dsh-mcp-global-manager — DSH 侧账本层。
 *
 * DSH 的 MCP 服务器不是存在某个 `servers.json` 里，而是作为 **loader 补丁行**
 * 写在 profile 的 `cordis.patch.yml` 中：一行 `- insert:` 块里放若干
 * `{ id, name: '@deepseek-ai/dsh-mcp-client', config: {...} }`，停用则是同级的
 * `- id: …\n  disabled: true`。这个文件同时装着这台机器上所有其它插件的装配，
 * 所以本层的纪律是：只重 emission 自己关心的那一个块，其余字节原样保留。
 *
 * 行形状与 `dsh-mcp-manager-plus` 完全一致，两个面板看到的是同一份真相，
 * 谁写的对方都能认出、都能改。
 *
 * @module dsh-mcp-global-manager/patch
 */

import { createHash } from 'node:crypto';
import { buildSchema, fromFileUrl, readTextSafe } from './util.js';

export const MCP_CLIENT_PACKAGE = '@deepseek-ai/dsh-mcp-client';
export const ROW_ID_PREFIX = 'mcp-';

/** 由服务名得到补丁行 id。 */
export function rowId(serverName) {
  const safe = String(serverName ?? '').trim().replace(/[^A-Za-z0-9_.\-]/gu, '-');
  return `${ROW_ID_PREFIX}${safe}`;
}

/**
 * 把各家随手起的名字收敛成 DSH 能安全使用的服务名。
 * 生态里的真实名字有 `API 文档`、`mcp-pdf-reader`、`datacloud_bigquery_toolbox`…
 * 空格与中文一旦进入 `serverName`，会顺着工具名前缀漏到模型侧，所以这里只保留
 * `A-Za-z0-9_-`；被清空的（比如纯中文名字）用一个稳定短哈希兜底，保证同一名字
 * 每次得到同一个结果。原始名作为展示名（`displayName`）另存。
 * @param {string} raw
 * @returns {{ name: string, changed: boolean }}
 */
export function safeServerName(raw) {
  const original = String(raw ?? '').trim();
  let candidate = original
    .replace(/[^\w\-]+/gu, '-')
    .replace(/-{2,}/gu, '-')
    .replace(/^[-_]+|[-_]+$/gu, '')
    .slice(0, 32);
  if (candidate === '') {
    const digest = createHash('sha1').update(original).digest('hex').slice(0, 6);
    candidate = `server-${digest}`;
  }
  if (!/^[A-Za-z0-9_-]{1,32}$/u.test(candidate)) {
    const digest = createHash('sha1').update(original).digest('hex').slice(0, 6);
    candidate = `server-${digest}`;
  }
  return { name: candidate, changed: candidate !== original };
}

/** 从补丁行 id 反推服务名。 */
export function nameOfRowId(id) {
  return String(id ?? '').startsWith(ROW_ID_PREFIX) ? id.slice(ROW_ID_PREFIX.length) : String(id ?? '');
}

/**
 * 把补丁文本切成「文件头 + 每个顶层数组项的原文」。顶层项以列 0 的 `- ` 开始，
 * 到下一个列 0 的 `- `（或文档结尾）为止；项内部的缩进行与项尾部的空行都跟着项走，
 * 使得 `preamble + items.join('')` 恒等于原文 —— 我们只重写自己那一个块，别人
 * 一个字都不动。
 * @param {string} text
 */
export function splitTopLevel(text) {
  const normalized = String(text ?? '');
  const eol = normalized.includes('\r\n') ? '\r\n' : '\n';
  const lines = normalized.split(/\r?\n/u);
  const starts = [];
  for (let i = 0; i < lines.length; i += 1) {
    if (/^- /u.test(lines[i]) || lines[i] === '-') starts.push(i);
  }
  const preamble = lines.slice(0, starts.length === 0 ? lines.length : starts[0]).join(eol);
  const items = [];
  for (let s = 0; s < starts.length; s += 1) {
    const from = starts[s];
    const to = s + 1 < starts.length ? starts[s + 1] : lines.length;
    const chunk = lines.slice(from, to).join(eol);
    // 非末项：把紧接其后的那个换行收进来，拼接时才接得上下一项的行首。
    items.push(s + 1 < starts.length ? `${chunk}${eol}` : chunk);
  }
  return { eol, preamble, items };
}

/** 项尾部补一个换行，避免和下一项黏在同一行上。 */
function pushItem(doc, text) {
  const { eol } = doc;
  const last = doc.items[doc.items.length - 1];
  if (typeof last === 'string' && last !== '' && !last.endsWith(eol)) doc.items[doc.items.length - 1] = `${last}${eol}`;
  doc.items.push(text.endsWith(eol) ? text : `${text}${eol}`);
}

/** 还原文本（与 splitTopLevel 严格互逆，并在缺失时补一个末行换行）。 */
export function joinTopLevel(doc) {
  const { eol, preamble, items } = doc;
  if (items.length === 0) return preamble === '' ? '' : `${preamble}${preamble.endsWith(eol) ? '' : eol}`;
  const head = preamble === '' ? '' : `${preamble}${preamble.endsWith(eol) ? '' : eol}`;
  const out = head + items.join('');
  return out.endsWith(eol) ? out : `${out}${eol}`;
}

/** 顶层项的原文（就是字符串本身，留着是为了调用点读起来清楚）。 */
export function itemText(item) {
  return item;
}

/**
 * 解析一个顶层项成对象。
 *
 * 坑在这里：每一项的原文都以列 0 的 `- ` 开头，单独喂给 js-yaml 得到的是
 * **数组** `[{ insert: [...] }]`，不是映射。直接读 `.insert` 会永远是 undefined，
 * 于是查找/更新/删除全部静默失效。所以必须先脱掉这层序列壳。
 * @returns {object|null} 解析失败或形态不对时返回 null，让调用方跳过它。
 */
export function parseItem(text, yaml, schema) {
  let value;
  try {
    value = yaml.load(text, { schema });
  } catch {
    return null;
  }
  if (Array.isArray(value)) return value.length === 1 ? value[0] : null;
  if (value !== null && typeof value === 'object') return value;
  return null;
}

/**
 * 写盘前的守门校验：文档必须仍是「顶层数组，元素是对象」。这是防止一次坏编辑
 * 把整个 profile 的启动搞挂的唯一硬保险 —— 不通过就绝不落盘。
 * @returns {string|null} 错误信息，或 null 表示通过。
 */
export function validateDocument(text, yaml, schema) {
  if (text.trim() === '') return null;
  let doc;
  try {
    doc = yaml.load(text, { schema });
  } catch (error) {
    return `YAML 解析失败：${error?.message ?? error}`;
  }
  if (doc === null || doc === undefined) return null;
  if (!Array.isArray(doc)) return '顶层不是数组，本插件不敢写';
  for (const item of doc) {
    if (item === null || typeof item !== 'object' || Array.isArray(item)) {
      return '顶层元素不是映射（对象），本插件不敢写';
    }
  }
  return null;
}

/** 读补丁原文；文件不存在按空文档处理。 */
export function readPatchText(patchPath) {
  return readTextSafe(patchPath) ?? '';
}

// ── 发射 YAML ───────────────────────────────────────────────────────────────

/** 标量：字符串一律 JSON 引号化（YAML 双引号是 JSON 的超集，最不容易出事）。 */
export function scalar(value) {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (typeof value === 'object' && typeof value.__jsExpr === 'string') return `!!js ${value.__jsExpr}`;
  const text = String(value);
  if (text.includes('\n')) {
    const body = text
      .split('\n')
      .map((line) => `  ${line}`)
      .join('\n');
    return `|-\n${body}`;
  }
  return JSON.stringify(text);
}

/** 把普通对象发射成缩进好的 YAML 映射行（数组走 flow 风格，读起来更像手写）。 */
export function emitMapping(object, indent, lines) {
  const pad = ' '.repeat(indent);
  for (const [key, value] of Object.entries(object ?? {})) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      const flow = `[${value.map((item) => scalar(item)).join(', ')}]`;
      lines.push(`${pad}${key}: ${flow}`);
      continue;
    }
    if (value !== null && typeof value === 'object' && typeof value.__jsExpr !== 'string') {
      const inner = Object.keys(value);
      if (inner.length === 0) {
        lines.push(`${pad}${key}: {}`);
        continue;
      }
      lines.push(`${pad}${key}:`);
      emitMapping(value, indent + 2, lines);
      continue;
    }
    const emitted = scalar(value);
    if (emitted.startsWith('|-')) {
      lines.push(`${pad}${key}: ${emitted.split('\n')[0]}`);
      lines.push(...emitted.split('\n').slice(1).map((l) => `${pad}  ${l.trimStart()}`));
      continue;
    }
    lines.push(`${pad}${key}: ${emitted}`);
  }
}

/** 发射一个 `- insert:` 块（可含多行）。 */
export function emitInsertBlock(rows, eol = '\n') {
  const lines = ['- insert:'];
  for (const row of rows) {
    lines.push(`    - id: ${scalar(row.id)}`);
    lines.push(`      name: ${scalar(row.name ?? MCP_CLIENT_PACKAGE)}`);
    if (row.config !== undefined && row.config !== null) {
      lines.push('      config:');
      emitMapping(row.config, 8, lines);
    }
    if (row.disabled === true) lines.push('      disabled: true');
    for (const [key, value] of Object.entries(row)) {
      if (['id', 'name', 'config', 'disabled'].includes(key)) continue;
      if (value === undefined) continue;
      lines.push(`      ${key}: ${scalar(value)}`);
    }
  }
  return lines.join(eol);
}

/** 发射一个停用覆盖行。 */
export function emitDisabledBlock(id, eol = '\n') {
  return [`- id: ${scalar(id)}`, '  disabled: true'].join(eol);
}

// ── 查询 ────────────────────────────────────────────────────────────────────

/** 本插件/兄弟面板在补丁里管理的每一行（含被停用的）。 */
export function readManagedRows(text, yaml, schema) {
  const doc = splitTopLevel(text);
  const rows = [];
  const disableCandidates = new Set();
  for (const item of doc.items) {
    const parsed = parseItem(item, yaml, schema);
    if (parsed === null || typeof parsed !== 'object') continue;
    if (Array.isArray(parsed.insert)) {
      for (const row of parsed.insert) {
        if (row?.name !== MCP_CLIENT_PACKAGE) continue;
        if (typeof row?.id !== 'string') continue;
        rows.push({ id: row.id, config: row.config ?? {}, disabled: row.disabled === true, text: item });
      }
      continue;
    }
    if (typeof parsed.id === 'string' && parsed.disabled === true && parsed.id.startsWith(ROW_ID_PREFIX)) {
      disableCandidates.add(parsed.id);
    }
  }
  // 停用行只认「补丁里确实存在的服务器行」。真实补丁里就可能有一条 `- id: mcp-manager-plus
  // / disabled: true`，是隔壁 dsh-mcp-manager-plus 自己的配置行，只是恰好也以 mcp- 开头；
  // 不加这层约束，面板切换启用状态时就会把别人的配置行当成自己的删掉。
  const managed = new Set(rows.map((row) => row.id));
  const disabledIds = new Set([...disableCandidates].filter((id) => managed.has(id)));
  return { rows, disabledIds, doc };
}

/** 已插入且未被顶层覆盖停用的行 id。 */
export function insertedIds(text, yaml, schema) {
  const { rows, disabledIds } = readManagedRows(text, yaml, schema);
  return rows.filter((r) => !disabledIds.has(r.id) && r.disabled !== true).map((r) => r.id);
}

/** 找到包含某个行 id 的那个顶层项的下标；找不到返回 -1。 */
export function findBlockIndexOfRow(doc, id, yaml, schema) {
  for (let i = 0; i < doc.items.length; i += 1) {
    const parsed = parseItem(doc.items[i], yaml, schema);
    if (!Array.isArray(parsed?.insert)) continue;
    if (parsed.insert.some((row) => row?.id === id && row?.name === MCP_CLIENT_PACKAGE)) return i;
  }
  return -1;
}

/** 找到某个 id 的停用覆盖行的下标；找不到返回 -1。 */
export function findDisabledIndexOf(doc, id, yaml, schema) {
  for (let i = 0; i < doc.items.length; i += 1) {
    const parsed = parseItem(doc.items[i], yaml, schema);
    if (parsed?.id === id && parsed?.disabled === true && !Array.isArray(parsed?.insert)) return i;
  }
  return -1;
}

// ── 变更（纯函数，返回新文本）──────────────────────────────────────────────

/** 新增一行：作为独立的 `- insert:` 块追加到文件末尾（最不碰别人的写法）。 */
export function appendRow(text, row, yaml, schema) {
  const doc = splitTopLevel(text);
  pushItem(doc, emitInsertBlock([row], doc.eol));
  return joinTopLevel(doc);
}

/** 原位替换一个顶层项，保持它原来的「结尾有没有换行」的习惯。 */
function replaceItem(doc, index, text) {
  const previous = doc.items[index] ?? '';
  const endsWithNewline = previous === '' || previous.endsWith(doc.eol);
  const stripped = text.replace(/\r?\n$/u, '');
  doc.items[index] = endsWithNewline ? `${stripped}${doc.eol}` : stripped;
}

/**
 * 用新 config 替换某一行。整块重新发射（块内其它行也一并重新发射，但内容按解析
 * 结果原值还原）。块内注释会丢 —— 调用方负责先备份。
 */
export function updateRow(text, id, nextRow, yaml, schema) {
  const doc = splitTopLevel(text);
  const index = findBlockIndexOfRow(doc, id, yaml, schema);
  if (index === -1) return { text, changed: false };
  const parsed = parseItem(doc.items[index], yaml, schema);
  const rows = parsed.insert
    .filter((row) => typeof row?.id === 'string')
    .map((row) => ({
      id: row.id,
      name: row.name,
      config: row.config ?? {},
      disabled: row.disabled === true ? true : undefined,
      ...(row.id === id ? nextRow : {}),
    }));
  replaceItem(doc, index, emitInsertBlock(rows, doc.eol));
  return { text: joinTopLevel(doc), changed: true };
}

/** 删掉某一行；块里没别的行了就整块删除。 */
export function removeRow(text, id, yaml, schema) {
  const doc = splitTopLevel(text);
  const index = findBlockIndexOfRow(doc, id, yaml, schema);
  if (index === -1) return { text, changed: false };
  const parsed = parseItem(doc.items[index], yaml, schema);
  const rest = parsed.insert.filter((row) => row?.id !== id);
  if (rest.length === 0) {
    doc.items.splice(index, 1);
  } else {
    replaceItem(
      doc,
      index,
      emitInsertBlock(
        rest.map((row) => ({ id: row.id, name: row.name, config: row.config ?? {}, disabled: row.disabled === true ? true : undefined })),
        doc.eol,
      ),
    );
  }
  const disabledIndex = findDisabledIndexOf(doc, id, yaml, schema);
  if (disabledIndex !== -1) doc.items.splice(disabledIndex, 1);
  return { text: joinTopLevel(doc), changed: true };
}

/** 启用 / 停用：改的是覆盖行，不是原 insert 块，符合 loader 的语义。 */
export function setDisabled(text, id, disabled, yaml, schema) {
  // 先确认这条 id 真的是个 MCP 服务器行，否则一律不碰：同名的顶层停用行可能是
  // 别的插件的配置（patch 的 id 命名空间是共享的），我们没资格增删它。
  const managed = new Set(readManagedRows(text, yaml, schema).rows.map((row) => row.id));
  if (!managed.has(id)) {
    return { text, changed: false, error: `补丁里没有 id 为 ${id} 的 MCP 服务器行，同名的停用行可能属于别的插件，不动它` };
  }
  const doc = splitTopLevel(text);
  const existing = findDisabledIndexOf(doc, id, yaml, schema);
  if (disabled) {
    if (existing !== -1) return { text, changed: false };
    pushItem(doc, emitDisabledBlock(id, doc.eol));
    return { text: joinTopLevel(doc), changed: true };
  }
  if (existing === -1) return { text, changed: false };
  doc.items.splice(existing, 1);
  return { text: joinTopLevel(doc), changed: true };
}

/** 一个 DSH 行 → 面板可读的 server 形状。 */
export function rowToServer(row, disabledIds) {
  const config = row.config ?? {};
  return {
    id: row.id,
    serverName: config.serverName ?? nameOfRowId(row.id),
    transport: config.transport ?? (typeof config.url === 'string' && config.url !== '' ? 'streamable-http' : 'stdio'),
    command: config.command ?? '',
    args: Array.isArray(config.args) ? config.args : [],
    env: config.env && typeof config.env === 'object' ? config.env : {},
    cwd: config.cwd ?? '',
    url: config.url ?? '',
    headers: config.headers && typeof config.headers === 'object' ? config.headers : {},
    disabled: disabledIds.has(row.id) || row.disabled === true,
    raw: config,
  };
}

/** 面板/导入的统一形状 → 要写进补丁的 config。 */
export function serverToConfig(server) {
  const config = { serverName: server.serverName };
  if (server.transport === 'streamable-http') {
    config.transport = 'streamable-http';
    config.url = server.url ?? '';
    if (Object.keys(server.headers ?? {}).length > 0) config.headers = server.headers;
    return config;
  }
  config.transport = 'stdio';
  config.command = server.command ?? '';
  if (Array.isArray(server.args) && server.args.length > 0) config.args = server.args;
  if (Object.keys(server.env ?? {}).length > 0) config.env = server.env;
  if (typeof server.cwd === 'string' && server.cwd !== '') config.cwd = server.cwd;
  return config;
}

export { buildSchema, fromFileUrl };
