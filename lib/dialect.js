/**
 * dsh-mcp-global-manager — 方言层。
 *
 * 生态里每个工具的 MCP 配置都是同一个意思、不同的写法：容器键不一样
 * （`mcpServers` / `servers` / `mcp_servers` / `mcp`）、语法不一样（JSON /
 * TOML / YAML）、command 有时是字符串有时是数组。本层负责两件事：
 *
 *   读：任何方言 → 统一的 server 形状 `{ serverName, transport, command, args,
 *        env, cwd, url, headers }`
 *   写：统一形状 → 指定方言的条目，并把它放回原文本的容器里（其余内容不动）
 *
 * @module dsh-mcp-global-manager/dialect
 */

import { parseJsonLoose, parseToml, upsertTomlTable, removeTomlTable } from './util.js';

/** 装「名字 → 服务器」映射的容器键，按偏好顺序尝试。 */
export const MAP_CONTAINERS = ['mcpServers', 'mcp_servers', 'servers', 'mcp', 'mcpServersList'];

/** 是容器或元数据、不是服务器条目的键。 */
const CONTAINER_KEYS = new Set([...MAP_CONTAINERS, 'settings', 'projects', '$schema', 'imports', 'version']);

/** 表示「远程 HTTP」的 transport 词，各家方言通吃。 */
const HTTP_TYPES = new Set(['http', 'https', 'streamable-http', 'streamablehttp', 'sse', 'remote']);
/** 明确写了「本地子进程」的词（不含空串：空串是「没声明」，不能当声明用）。 */
const STDIO_TYPES = new Set(['stdio', 'local', 'command']);

/**
 * 把一条各家写法归一成统一形状。
 * @param {Record<string, any>} raw
 */
export function normalizeEntry(raw) {
  const type = typeof raw?.type === 'string' ? raw.type.toLowerCase() : '';
  const declared = typeof raw?.transport === 'string' ? raw.transport.toLowerCase() : '';
  const remote = HTTP_TYPES.has(type) || HTTP_TYPES.has(declared);
  const explicitStdio = STDIO_TYPES.has(type) || STDIO_TYPES.has(declared);

  const url = firstString(raw?.url, raw?.serverUrl, raw?.server_url, raw?.endpoint);
  const commandValue = raw?.command;
  const commandList = Array.isArray(commandValue)
    ? commandValue.filter((part) => typeof part === 'string')
    : null;
  const command =
    typeof commandValue === 'string'
      ? commandValue
      : commandList !== null && commandList.length > 0
        ? commandList[0]
        : '';
  const hasCommand = command !== '';

  // 判定顺序：声明了远程 → 远程；声明了本地 → 本地；什么都没声明 → 只有 URL
  // 才算远程。Windsurf 的 `serverUrl`、Continue 的数组条目都不写 type，靠这条。
  const isRemote = remote ? true : explicitStdio ? false : url !== '' && !hasCommand;

  if (isRemote) {
    return {
      transport: 'streamable-http',
      url,
      headers: firstMap(raw?.headers, raw?.http_headers, raw?.httpHeaders, raw?.requestHeaders),
    };
  }
  return {
    transport: 'stdio',
    command,
    args:
      commandList !== null && commandList.length > 1
        ? commandList.slice(1)
        : Array.isArray(raw?.args)
          ? raw.args.filter((part) => typeof part === 'string')
          : [],
    env: firstMap(raw?.env, raw?.environment, raw?.envVars),
    cwd: firstString(raw?.cwd, raw?.workingDirectory, raw?.workdir),
  };
}

/** 从统一形状反向生成某方言的条目。 */
export function toDialectEntry(dialect, server) {
  if (dialect === 'opencode') {
    if (server.transport === 'streamable-http') {
      return { type: 'remote', url: server.url ?? '', enabled: true };
    }
    const command = [server.command ?? '', ...(server.args ?? [])].filter((x) => x !== '');
    const entry = { type: 'local', command, enabled: true };
    if (Object.keys(server.env ?? {}).length > 0) entry.environment = server.env;
    return entry;
  }
  if (server.transport === 'streamable-http') {
    if (dialect === 'vscode') return { type: 'http', url: server.url ?? '', headers: server.headers ?? {} };
    if (dialect === 'codex') {
      const entry = { url: server.url ?? '' };
      if (Object.keys(server.headers ?? {}).length > 0) entry.http_headers = server.headers;
      return entry;
    }
    const entry = { url: server.url ?? '' };
    if (Object.keys(server.headers ?? {}).length > 0) entry.headers = server.headers;
    return entry;
  }
  const entry = { command: server.command ?? '' };
  if (Array.isArray(server.args) && server.args.length > 0) entry.args = server.args;
  if (Object.keys(server.env ?? {}).length > 0) entry.env = server.env;
  if (typeof server.cwd === 'string' && server.cwd !== '') entry.cwd = server.cwd;
  if (dialect === 'vscode') entry.type = 'stdio';
  if (dialect === 'codex') entry.type = 'stdio';
  return entry;
}

function firstString(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim() !== '') return value.trim();
  }
  return '';
}

function firstMap(...values) {
  for (const value of values) {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) continue;
    const out = {};
    for (const [key, inner] of Object.entries(value)) {
      if (typeof inner === 'string') out[key] = inner;
      else if (typeof inner === 'number' || typeof inner === 'boolean') out[key] = String(inner);
    }
    if (Object.keys(out).length > 0) return out;
  }
  return {};
}

// ── 读取 ────────────────────────────────────────────────────────────────────

/**
 * 从一个 JSON 文档里找出服务器容器。
 * @returns {{ container: Record<string, any>|any[]|null, key: string|null }}
 */
export function findContainer(decoded) {
  if (decoded === null || typeof decoded !== 'object') return { container: null, key: null };
  for (const key of MAP_CONTAINERS) {
    const value = decoded[key];
    if (value === null || value === undefined) continue;
    if (Array.isArray(value)) {
      // Continue 的 `mcpServers` 是数组，名字在条目里。
      return { container: value, key };
    }
    if (typeof value !== 'object') continue;
    // OpenCode v2 把表嵌一层：`mcp.servers`。
    if (key === 'mcp' && value.servers && typeof value.servers === 'object' && !Array.isArray(value.servers)) {
      return { container: value.servers, key };
    }
    return { container: value, key };
  }
  // 没有容器键：整个文档可能就是「一个服务器条目」或「名字→条目」的裸映射。
  if (isServerEntry(decoded)) return { container: { '': decoded }, key: null };
  return { container: decoded, key: null };
}

/** 值像不像一条带传输信息的服务器条目。 */
function isServerEntry(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  return ['command', 'url', 'serverUrl', 'args', 'transport', 'type', 'http_headers'].some(
    (key) => value[key] !== undefined,
  );
}

/**
 * 读 JSON 方言（Claude / Cursor / Trae / Kiro / MarsCode / VS Code / Cline…）。
 * @param {string} text - 文件原文。
 * @param {{ containerHint?: string }} [options]
 * @returns {{ servers: Array, error: string|null, containerKey: string|null, hasComments: boolean }}
 */
export function readJsonDialect(text, options = {}) {
  const hadNoise = /\/\/|\/\*|[,\s]+\}/u.test(text) && /\/\/|\/\*/u.test(stripStrings(text));
  const { value, error } = parseJsonLoose(text);
  if (error !== null) return { servers: [], error, containerKey: null, hasComments: hadNoise };
  const { container, key } = options.containerHint
    ? { container: value?.[options.containerHint] ?? null, key: options.containerHint }
    : findContainer(value);
  const entries = collectEntries(container);
  return {
    servers: entries.map(([name, raw]) => buildServer(name, raw)),
    error: entries.length === 0 ? null : null,
    containerKey: key,
    hasComments: hadNoise,
  };
}

/** 读 Codex 的 TOML 方言（`[mcp_servers.name]` + `[mcp_servers.name.env]`）。 */
export function readTomlDialect(text) {
  const { flat } = parseToml(text);
  const servers = [];
  for (const [table, fields] of Object.entries(flat)) {
    const parts = table.split('.');
    // 只认 `mcp_servers.<名字>` 这一种形态：`mcp_servers.<名字>.env` 是上一条的
    // 环境变量子表，不是服务器 —— 少了这道闸，面板里就会冒出一个 `xxx.env` 幽灵条目。
    if (parts.length !== 2 || parts[0] !== 'mcp_servers') continue;
    if (fields === null || typeof fields !== 'object') continue;
    const name = parts[1];
    const envTable = flat[`mcp_servers.${name}.env`];
    const headersTable = flat[`mcp_servers.${name}.http_headers`];
    const raw = { ...fields };
    if (envTable && typeof envTable === 'object') raw.env = envTable;
    if (headersTable && typeof headersTable === 'object') raw.http_headers = headersTable;
    servers.push(buildServer(name, raw));
  }
  return { servers, error: null, containerKey: 'mcp_servers', hasComments: /^\s*#/mu.test(text) };
}

/**
 * 读 OpenCode 方言：`mcp.<name>.command` 是数组，`type` 为 local/remote。
 */
export function readOpenCodeDialect(text) {
  return readJsonDialect(text, { containerHint: 'mcp' });
}

function buildServer(name, raw) {
  const normalized = normalizeEntry(raw ?? {});
  return {
    name,
    serverName: firstString(raw?.serverName, raw?.id, name),
    ...normalized,
    enabled: raw?.enabled !== false,
    raw: raw ?? {},
  };
}

function collectEntries(container) {
  if (container === null || container === undefined) return [];
  if (Array.isArray(container)) {
    return container
      .filter((item) => isServerEntry(item))
      .map((item) => [firstString(item.name, item.serverName, item.id) || '未命名', item]);
  }
  if (typeof container !== 'object') return [];
  return Object.entries(container).filter(
    ([name, value]) => !CONTAINER_KEYS.has(name) && isServerEntry(value),
  );
}

// ── 写入 ────────────────────────────────────────────────────────────────────

/**
 * 在 JSON 文档里增/改/删一个服务器条目，其余顶层键与键序保持不变。
 * 注释无法保留（会被规范化缩进吃掉），调用方需先备份并在 UI 上告知。
 * @param {string} text - 原文。
 * @param {{ action: 'upsert'|'remove', containerKey?: string, name: string, entry?: Record<string, any> }} op
 * @returns {{ text: string, error: string|null }}
 */
export function writeJsonDialect(text, op) {
  const decoded = text.trim() === '' ? {} : JSON.parse(stripJsonNoiseLocal(text));
  const hint = op.containerKey ?? 'mcpServers';
  const container = decoded[hint] ?? {};
  if (op.action === 'remove') {
    delete container[op.name];
  } else {
    container[op.name] = op.entry ?? {};
  }
  if (Object.keys(container).length === 0 && decoded[hint] === undefined) {
    // 空容器不凭空写出来，省得别的工具看到 `mcpServers: {}` 以为被谁动过。
    return { text, error: null };
  }
  decoded[hint] = container;
  return { text: `${JSON.stringify(decoded, null, 2)}\n`, error: null };
}

/**
 * 在 TOML 文本里增/改/删一个 `[mcp_servers.name]` 表（连带它的 `.env` 子表）。
 */
export function writeTomlDialect(text, op) {
  const table = `mcp_servers.${op.name}`;
  if (op.action === 'remove') {
    return { text: removeTomlTable(text, table, [`${table}.env`]), error: null };
  }
  const entry = op.entry ?? {};
  const fields = {};
  for (const [key, value] of Object.entries(entry)) {
    if (key === 'env' || key === 'http_headers') continue;
    fields[key] = value;
  }
  const next = upsertTomlTable(text, table, fields, { subTables: [`${table}.env`] });
  const env = entry.env ?? {};
  if (Object.keys(env).length === 0) return { text: next, error: null };
  return { text: upsertTomlTable(next, `${table}.env`, env), error: null };
}

/** 从 './util.js' 里拿 stripJsonNoise 需要一个不污染导出的本地别名。 */
import { stripJsonNoise } from './util.js';
function stripJsonNoiseLocal(text) {
  return stripJsonNoise(text);
}

/** 粗判「原文里有没有真注释」：把字符串内容抹掉后再找 `//`。 */
function stripStrings(text) {
  return text.replace(/"(?:[^"\\]|\\.)*"/gu, '""').replace(/'(?:[^'\\]|\\.)*'/gu, "''");
}
