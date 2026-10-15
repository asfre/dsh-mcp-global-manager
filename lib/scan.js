/**
 * dsh-mcp-global-manager — 扫描器与状态账本。
 *
 * 一次扫描 = 遍历源清单 → 逐个读文件 → 按方言解析成统一形状 → 和上一次扫描的
 * 快照（`state.json`）做指纹比对，得出每个条目的状态：
 *
 *   new      这次才有（别的工具刚加的）
 *   changed  配置变了
 *   gone     上次有这次没（被删了 —— 只标记，绝不自动删 DSH 侧）
 *   same     没动
 *
 * 快照持久化在 `~/.dsh/mcp-global-manager/state.json`，另外记着「哪些条目是
 * 本插件采纳进 DSH 的」以及「是否允许写回这个源」—— 只有被采纳且明确允许写回的
 * 条目才会被改到别人的文件里，避免把用户手写的配置覆盖掉。
 *
 * @module dsh-mcp-global-manager/scan
 */

import { dirname, join } from 'node:path';
import { mkdirSync } from 'node:fs';
import {
  atomicWrite,
  dshHome,
  expandPath,
  fingerprint,
  readTextSafe,
} from './util.js';
import { readJsonDialect, readOpenCodeDialect, readTomlDialect } from './dialect.js';
import { MCP_CLIENT_PACKAGE, ROW_ID_PREFIX, nameOfRowId, readManagedRows, rowToServer, safeServerName } from './patch.js';
import { BUILTIN_SOURCES } from './sources.js';

export const STATE_VERSION = 1;

/** 插件自己的数据目录。 */
export function dataDir() {
  return join(dshHome(), 'mcp-global-manager');
}

/** 快照与设置文件。 */
export function statePath() {
  return join(dataDir(), 'state.json');
}

/** 写回别人文件之前的备份目录。 */
export function backupDir() {
  return join(dataDir(), 'backups');
}

/** 读状态；文件缺失或损坏都当作全新开始（绝不因为账本坏了就拒绝工作）。 */
export function readState() {
  const text = readTextSafe(statePath());
  if (text === null || text.trim() === '') return defaultState();
  try {
    const parsed = JSON.parse(text);
    return { ...defaultState(), ...parsed };
  } catch {
    return defaultState();
  }
}

function defaultState() {
  return {
    version: STATE_VERSION,
    updatedAt: null,
    /** key → 上次扫描到的配置指纹 */
    fingerprints: {},
    /** key → 上次扫描到的显示信息（gone 的条目靠它显示名字） */
    lastSeen: {},
    /** key → { dshId, adoptedAt, pushBack } */
    adopted: {},
    /** 用户手工补充的源 */
    customSources: [],
    /** 面板偏好 */
    settings: { sidebarOrder: 22, maskSecrets: true, autoBackup: true },
  };
}

/** 写状态（原子写）。 */
export function writeState(state) {
  mkdirSync(dataDir(), { recursive: true });
  const next = { ...state, version: STATE_VERSION, updatedAt: new Date().toISOString() };
  atomicWrite(statePath(), `${JSON.stringify(next, null, 2)}\n`);
  return next;
}

/**
 * 清除「源里已删」标记：只删账本里该条目的指纹与上次快照，
 * 让它在下次扫描时彻底从列表消失。不碰任何工具的配置文件，
 * 也不动 adopted（写回授权是用户显式给的，留着由用户自己在条目上关）。
 */
export function forgetEntry(key) {
  const state = readState();
  const fingerprints = { ...(state.fingerprints ?? {}) };
  const lastSeen = { ...(state.lastSeen ?? {}) };
  const had = Object.prototype.hasOwnProperty.call(fingerprints, key) || Object.prototype.hasOwnProperty.call(lastSeen, key);
  delete fingerprints[key];
  delete lastSeen[key];
  writeState({ ...state, fingerprints, lastSeen });
  return { ok: true, forgot: had };
}

/** 稳定地算一个条目的配置指纹（只取影响运行行为的字段）。 */
export function serverFingerprint(server) {
  return fingerprint({
    transport: server.transport ?? '',
    command: server.command ?? '',
    args: server.args ?? [],
    env: server.env ?? {},
    cwd: server.cwd ?? '',
    url: server.url ?? '',
    headers: server.headers ?? {},
  });
}

/** `sourceId::serverName` —— 条目的全局键。 */
export function serverKey(sourceId, name) {
  return `${sourceId}::${name}`;
}

/**
 * 扫一个源。返回统一形状；任何解析失败都收敛成 `{ error }` 而不是抛出 —— 一个
 * 工具的配置写坏了，不该连累其它二十六个的扫描。
 * @param {import('./sources.js').Source} source
 * @param {{ dshPatchPath?: string, yaml: any, schema: any }} context
 */
export function scanSource(source, context) {
  const base = {
    id: source.id,
    label: source.label,
    format: source.format,
    dialect: source.dialect ?? 'claude',
    writeBack: source.writeBack === true,
    note: source.note ?? '',
    candidates: (source.paths ?? []).map(expandPath),
    file: null,
    exists: false,
    error: null,
    hasComments: false,
    servers: [],
  };
  let file = null;
  for (const candidate of base.candidates) {
    if (candidate === '') continue;
    if (readTextSafe(candidate) !== null) {
      file = candidate;
      break;
    }
  }
  // DSH 侧的路径由宿主告诉我们在哪儿（loader 里挂着的那份才是真相）。
  if (source.format === 'dsh' && typeof context.dshPatchPath === 'string' && context.dshPatchPath !== '') {
    file = context.dshPatchPath;
  }
  if (file === null) {
    return { ...base, error: 'not-found' };
  }
  base.file = file;
  base.exists = true;
  const text = readTextSafe(file);
  if (text === null) return { ...base, error: '不可读（权限或正被占用）' };

  if (source.format === 'dsh') {
    try {
      const { rows, disabledIds } = readManagedRows(text, context.yaml, context.schema);
      base.servers = rows
        .filter((row) => typeof row.id === 'string' && row.id.startsWith(ROW_ID_PREFIX))
        .map((row) => {
          const server = rowToServer(row, disabledIds);
          return { ...server, name: server.serverName };
        });
      base.rowCount = rows.length;
    } catch (error) {
      base.error = `YAML 解析失败：${error?.message ?? error}`;
    }
    return base;
  }

  let parsed;
  if (source.format === 'toml') parsed = readTomlDialect(text);
  else if (source.format === 'opencode') parsed = readOpenCodeDialect(text);
  else parsed = readJsonDialect(text, { containerHint: source.containerHint });
  if (parsed.error) base.error = `JSON 解析失败：${parsed.error}`;
  base.hasComments = parsed.hasComments === true;
  base.containerKey = parsed.containerKey ?? source.containerHint ?? null;
  base.servers = (parsed.servers ?? []).map((server) => ({
    ...server,
    env: server.env ?? {},
    args: server.args ?? [],
  }));
  return base;
}

/**
 * 扫全部源 + 和快照比对。
 * @param {{ dshPatchPath?: string, yaml: any, schema: any, state?: any }} context
 */
export function scanAll(context) {
  const state = context.state ?? readState();
  const sources = [...BUILTIN_SOURCES, ...(state.customSources ?? [])];
  const scanned = sources.map((source) => scanSource(source, context));

  const flat = [];
  for (const source of scanned) {
    const sourceDir = source.file === null ? '' : dirname(source.file);
    for (const server of source.servers) {
      if (!server.name) continue;
      const key = serverKey(source.id, server.name);
      const fp = serverFingerprint(server);
      // 账本可能缺字段（state.json 被手改过、或旧版本写过没有 fingerprints 的文件），
      // 这里必须当空表处理：读快照绝不能因为账本形状而整个拒绝工作。
      const previous = (state.fingerprints ?? {})[key];
      const adopted = state.adopted?.[key];
      let status = 'same';
      if (previous === undefined) status = 'new';
      else if (previous !== fp) status = 'changed';
      const displayName = server.serverName ?? server.name;
      // DSH 里的行本来就该是安全名，不再二次改写；外部条目导入前才需要规范化。
      const safe = source.format === 'dsh' ? { name: displayName, changed: false } : safeServerName(displayName);
      flat.push({
        key,
        // DSH 行的 id 是面板「停用/删除/编辑」定位目标行的钥匙：合并时绝不能丢。
        id: typeof server.id === 'string' ? server.id : null,
        sourceId: source.id,
        sourceLabel: source.label,
        format: source.format,
        writeBack: source.writeBack,
        inDsh: source.format === 'dsh',
        name: server.name,
        displayName,
        serverName: safe.name,
        nameChanged: safe.changed,
        sourceDir,
        transport: server.transport,
        command: server.command ?? '',
        args: server.args ?? [],
        env: server.env ?? {},
        cwd: server.cwd ?? '',
        url: server.url ?? '',
        headers: server.headers ?? {},
        enabled: server.enabled !== false && server.disabled !== true,
        disabled: server.disabled === true,
        fingerprint: fp,
        status,
        adoptedDshId: adopted?.dshId ?? null,
        pushBack: adopted?.pushBack === true,
      });
    }
  }

  // 上次见到、这次没了的条目：标 gone，保留显示信息。
  const seenKeys = new Set(flat.map((item) => item.key));
  const missing = [];
  for (const [key, previousFp] of Object.entries(state.fingerprints ?? {})) {
    if (seenKeys.has(key)) continue;
    const info = state.lastSeen?.[key] ?? {};
    if (info.inDsh) continue; // DSH 自己的行不算「消失」
    missing.push({
      key,
      sourceId: info.sourceId ?? key.split('::')[0],
      sourceLabel: info.sourceLabel ?? '',
      name: info.name ?? key.split('::')[1] ?? key,
      serverName: info.serverName ?? info.name ?? key.split('::')[1] ?? key,
      displayName: info.displayName ?? info.serverName ?? info.name ?? key.split('::')[1] ?? key,
      nameChanged: false,
      sourceDir: info.sourceDir ?? '',
      transport: info.transport ?? 'stdio',
      command: info.command ?? '',
      args: info.args ?? [],
      env: info.env ?? {},
      url: info.url ?? '',
      enabled: false,
      fingerprint: previousFp,
      status: 'gone',
      adoptedDshId: state.adopted?.[key]?.dshId ?? null,
      writeBack: false,
      inDsh: false,
      format: info.format ?? 'json',
      sourceMissing: true,
    });
  }

  const all = [...flat, ...missing];

  // 同名出现在多个源里 → 标 duplicate（用户最关心的「pencil 到底有几份」）。
  const byName = new Map();
  for (const item of all) {
    if (item.status === 'gone') continue;
    const list = byName.get(item.serverName) ?? [];
    list.push(item);
    byName.set(item.serverName, list);
  }
  for (const [name, list] of byName) {
    if (list.length < 2) continue;
    for (const item of list) {
      item.duplicateOf = list.filter((other) => other.key !== item.key).map((other) => other.sourceLabel);
    }
    void name;
  }

  return { sources: scanned, servers: all, state, scannedAt: new Date().toISOString() };
}

/** 扫描完成后把指纹写回账本，作为下次的基线。 */
export function commitSnapshot(state, result) {
  const fingerprints = {};
  const lastSeen = {};
  for (const item of result.servers) {
    if (item.status === 'gone') continue; // gone 的保留在原账本里
    fingerprints[item.key] = item.fingerprint;
    lastSeen[item.key] = {
      sourceId: item.sourceId,
      sourceLabel: item.sourceLabel,
      name: item.name,
      displayName: item.displayName ?? item.name,
      serverName: item.serverName,
      sourceDir: item.sourceDir ?? '',
      transport: item.transport,
      command: item.command,
      args: item.args,
      env: item.env,
      url: item.url,
      format: item.format,
      inDsh: item.inDsh,
    };
  }
  // gone 的条目：基线继续留着，这样它回来时不会被误判成「新增」。
  // 注意判断的是**上一份账本**里的 lastSeen：新建的 lastSeen 在这种条目上一定是空的，
  // 早先写成 `lastSeen[key] !== undefined` 会让这个分支永远进不去，基线说丢就丢。
  for (const [key, fp] of Object.entries(state.fingerprints ?? {})) {
    if (fingerprints[key] === undefined && (state.lastSeen ?? {})[key] !== undefined) {
      fingerprints[key] = fp;
      lastSeen[key] = state.lastSeen[key];
    }
  }
  return { ...state, fingerprints, lastSeen };
}

/** 源清单（内置 + 自定义），供面板展示「去哪儿找」。 */
export function listSources(state) {
  return [...BUILTIN_SOURCES, ...(state.customSources ?? [])].map((source) => ({
    id: source.id,
    label: source.label,
    format: source.format,
    writeBack: source.writeBack === true,
    paths: source.paths ?? [],
    note: source.note ?? '',
    custom: !BUILTIN_SOURCES.some((builtin) => builtin.id === source.id),
  }));
}

export { MCP_CLIENT_PACKAGE };
