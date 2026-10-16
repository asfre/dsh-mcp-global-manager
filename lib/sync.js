/**
 * dsh-mcp-global-manager — 同步动作层。
 *
 * 三类动作，都遵循同一条安全流水线：**读原文 → 纯函数改 → 结构校验 → 回读验证 →
 * 备份 → 原子写**。任何一步不过就整笔取消，磁盘上一个字节都不改。
 *
 *   1. 采纳（import）：外部工具的条目 → DSH 的 `cordis.patch.yml`
 *   2. 写回（push）  ：DSH 的条目 → 当初采纳它的那个工具文件
 *   3. 直接管理（DSH 侧 CRUD）：在面板里增 / 改 / 删 / 停用 DSH 的 MCP 行
 *
 * 「删除只标记不自动删」在这层落地：扫描发现源里没了的条目，只在面板标 `gone`，
 * 绝不去动 DSH 那一行；要删得用户亲手点删除。
 *
 * @module dsh-mcp-global-manager/sync
 */

import { readdirSync, rmdirSync, statSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { atomicWrite, backupFile, readTextSafe } from './util.js';
import {
  MCP_CLIENT_PACKAGE,
  appendRow,
  readManagedRows,
  readPatchText,
  removeRow,
  rowId,
  safeServerName,
  serverToConfig,
  setDisabled,
  updateRow,
  validateDocument,
} from './patch.js';
import {
  readJsonDialect,
  readTomlDialect,
  toDialectEntry,
  writeJsonDialect,
  writeTomlDialect,
} from './dialect.js';
import { backupDir, commitSnapshot, serverKey, writeState } from './scan.js';

/** 备份目录里最多留多少份时间戳（防止把盘写满）。 */
const KEEP_BACKUPS = 40;

/** 补丁里已有的受管行 id，用于查重。 */
function rowIds(text, yaml, schema) {
  const { rows } = readManagedRows(text, yaml, schema);
  return rows.map((row) => row.id);
}

/** 统一的写入入口：校验 + 备份 + 原子写。 */
function commitText(target, next, options = {}) {
  const current = readTextSafe(target) ?? '';
  if (next === current) return { ok: true, changed: false, backup: null };
  const invalid = options.validate?.(next);
  if (invalid) return { ok: false, changed: false, error: `${invalid}（已取消写入）` };
  let backup = null;
  if (options.backup !== false) {
    try {
      backup = backupFile(target, backupDir());
    } catch (error) {
      return { ok: false, changed: false, error: `备份失败，已取消写入：${String(error?.message ?? error)}` };
    }
    pruneBackups();
  }
  try {
    atomicWrite(target, next);
  } catch (error) {
    return { ok: false, changed: false, error: `写入失败：${String(error?.message ?? error)}` };
  }
  return { ok: true, changed: true, backup };
}

// ── 备份维护 ────────────────────────────────────────────────────────────────

/** 只保留最近 KEEP_BACKUPS 个时间戳目录。 */
function pruneBackups() {
  const root = backupDir();
  let names;
  try {
    names = readdirSync(root);
  } catch {
    return;
  }
  const dirs = names
    .map((name) => ({ name, path: join(root, name) }))
    .filter((entry) => {
      try {
        return statSync(entry.path).isDirectory();
      } catch {
        return false;
      }
    })
    .sort((a, b) => (a.name < b.name ? 1 : -1)); // ISO 时间戳字典序 = 新的在前
  for (const entry of dirs.slice(KEEP_BACKUPS)) {
    try {
      for (const child of collectFiles(entry.path)) unlinkSync(child);
      removeEmptyDirs(entry.path);
    } catch {
      // 清不掉旧备份不该阻塞本次写入
    }
  }
}

function collectFiles(root) {
  const out = [];
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
      else out.push(full);
    }
  }
  return out;
}

function removeEmptyDirs(root) {
  const stack = [root];
  while (stack.length > 0) {
    const dir = stack.pop();
    try {
      if (readdirSync(dir).length === 0) rmdirSync(dir);
    } catch {
      // 非空或已消失，都不碍事
    }
  }
}

/**
 * 有些工具的配置里写的是相对路径（实测本机 O+ Connect 就是 `node dist/mcp-servers/…`）。
 * 这类条目搬进 DSH 之后，工作目录变成了 DSH 的，命令必然找不到文件 —— 所以按「它
 * 自己配置文件所在的目录」补一个 cwd。补不出来就照原样搬，让面板显示警告。
 * @param {any} server
 */
export function inferCwd(server) {
  if (typeof server?.cwd === 'string' && server.cwd !== '') return server.cwd;
  if (server?.transport === 'streamable-http') return '';
  const relative = (server?.args ?? []).some((arg) => looksRelative(arg));
  if (!relative) return '';
  return typeof server?.sourceDir === 'string' ? server.sourceDir : '';
}

/** 是否像一个相对路径（而不是 npx 包名、开关、绝对路径）。 */
function looksRelative(arg) {
  const text = String(arg ?? '');
  if (text === '' || text.startsWith('-')) return false;
  if (/^([A-Za-z]:[\\/]|[\\\\/])/u.test(text)) return false;
  return /[\\/]/u.test(text) || /^\.{1,2}[\\/]/u.test(text);
}

// ── DSH 侧 CRUD ─────────────────────────────────────────────────────────────

/**
 * 在 DSH 补丁里新增一条 MCP 服务器。同名会失败（不静默覆盖）。
 * @param {{ patchPath: string, yaml: any, schema: any, state: any, server: any, adoptKey?: string }} input
 */
export function dshAdd({ patchPath, yaml, schema, state, server, adoptKey }) {
  const name = String(server?.serverName ?? '').trim();
  if (name === '') return { ok: false, error: '服务名不能为空' };
  // 手工新建时不静默改名，直接告诉用户哪个名字能用（导入路径才会自动规范化）。
  const suggestion = safeServerName(name);
  if (suggestion.changed) return { ok: false, error: `服务名只能用字母、数字、_ 和 -，建议改成：${suggestion.name}` };
  const id = rowId(name);
  const text = readPatchText(patchPath);
  if (rowIds(text, yaml, schema).includes(id)) return { ok: false, error: `服务名 ${name} 已存在` };
  const next = appendRow(
    text,
    { id, name: MCP_CLIENT_PACKAGE, config: serverToConfig({ ...server, serverName: name }) },
    yaml,
    schema,
  );
  const result = commitText(patchPath, next, { validate: (t) => validateDocument(t, yaml, schema) });
  if (!result.ok) return result;
  let nextState = state;
  if (adoptKey) {
    const adopted = { ...(state.adopted ?? {}) };
    adopted[adoptKey] = { dshId: id, adoptedAt: new Date().toISOString(), pushBack: false };
    nextState = writeState({ ...state, adopted });
  }
  return { ...result, id, state: nextState };
}

/**
 * 更新一条。改服务名 = 重命名：删旧行 + 追加新行，并把采纳关系迁到新 id 上
 * （行 id 由服务名派生，硬改 id 会让补丁里出现两行同名的东西）。
 */
export function dshUpdate({ patchPath, yaml, schema, state, id, server }) {
  const name = String(server?.serverName ?? '').trim();
  if (name === '') return { ok: false, error: '服务名不能为空' };
  const suggestion = safeServerName(name);
  if (suggestion.changed) return { ok: false, error: `服务名只能用字母、数字、_ 和 -，建议改成：${suggestion.name}` };
  const config = serverToConfig({ ...server, serverName: name });
  const text = readPatchText(patchPath);
  const targetId = rowId(name);

  // id 命名空间是全插件共享的：传进来的 id 可能属于别的插件，也可能早被删了。
  // 没有这条受管行就一个字节都不动，并且**绝不返回成功**（commitText 对相同内容
  // 会短路成 ok:true，改名分支甚至会 appendRow 凭空造一行出来）。
  if (!rowIds(text, yaml, schema).includes(id)) {
    return { ok: false, changed: false, error: `补丁里没有 id 为 ${id} 的 MCP 服务器行（可能是别的插件的行，或已被删除），没有改动任何文件` };
  }

  if (targetId === id) {
    const next = updateRow(text, id, { name: MCP_CLIENT_PACKAGE, config }, yaml, schema).text;
    return commitText(patchPath, next, { validate: (t) => validateDocument(t, yaml, schema) });
  }

  if (rowIds(text, yaml, schema).includes(targetId)) {
    return { ok: false, error: `服务名 ${name} 已存在，无法重命名` };
  }
  const renamed = appendRow(
    removeRow(text, id, yaml, schema).text,
    { id: targetId, name: MCP_CLIENT_PACKAGE, config },
    yaml,
    schema,
  );
  const result = commitText(patchPath, renamed, { validate: (t) => validateDocument(t, yaml, schema) });
  if (!result.ok) return result;
  const adopted = { ...(state.adopted ?? {}) };
  for (const [key, value] of Object.entries(adopted)) {
    if (value?.dshId === id) adopted[key] = { ...value, dshId: targetId };
  }
  return { ...result, id: targetId, state: writeState({ ...state, adopted }) };
}

/** 删除一条（连带它的停用覆盖行与采纳关系）。 */
export function dshRemove({ patchPath, yaml, schema, state, id }) {
  const text = readPatchText(patchPath);
  const outcome = removeRow(text, id, yaml, schema);
  // removeRow 找不到这条受管行时返回 changed:false（同名的顶层停用行属于别的插件，
  // 我们不碰）。这里必须把它当失败：commitText 对相同内容会短路成 ok:true，
  // 面板就会显示「删除 ✓」而文件一行没动，还会顺手清掉账本。
  if (!outcome.changed) {
    return { ok: false, changed: false, error: `补丁里没有 id 为 ${id} 的 MCP 服务器行（可能是别的插件的行，或已被删除），没有改动任何文件` };
  }
  const result = commitText(patchPath, outcome.text, { validate: (t) => validateDocument(t, yaml, schema) });
  if (!result.ok) return result;
  const adopted = { ...(state.adopted ?? {}) };
  for (const key of Object.keys(adopted)) {
    if (adopted[key]?.dshId === id) delete adopted[key];
  }
  return { ...result, state: writeState({ ...state, adopted }) };
}

/** 启用 / 停用一条（写的是同级 `disabled: true` 覆盖行，不动原 insert 块）。 */
export function dshToggle({ patchPath, yaml, schema, id, disabled }) {
  const text = readPatchText(patchPath);
  const outcome = setDisabled(text, id, disabled === true, yaml, schema);
  // 被拒绝时不写盘，也绝不返回成功：否则面板显示「已停用」而文件根本没变，比崩还难查。
  if (outcome.error) return { ok: false, changed: false, error: outcome.error };
  return commitText(patchPath, outcome.text, { validate: (t) => validateDocument(t, yaml, schema) });
}

// ── 采纳：外部 → DSH ────────────────────────────────────────────────────────

/**
 * 纯函数版的「采纳」：在给定文本上试算，返回新文本与创建/跳过清单，**不碰磁盘**。
 * `importToDsh` 和 CLI 的 `--emit` 预览共用它 —— 预览和真写必须是同一套代码，
 * 否则「面板说会写 3 行、实际写了 5 行」这种事故迟早会来（我们已经被咬过一次：
 * pencil 在 5 个工具里都有，批次内不去重就会重复插 5 行）。
 * @returns {{ working: string, created: object[], skipped: object[] }}
 */
export function planImport(text, servers, { yaml, schema }) {
  const list = Array.isArray(servers) ? servers : [servers];
  const taken = new Set(rowIds(text, yaml, schema));
  let working = text;
  const created = [];
  const skipped = [];
  for (const server of list) {
    const rawName = String(server.serverName ?? server.name ?? '').trim();
    if (rawName === '') {
      skipped.push({ name: '(空)', reason: '服务名为空' });
      continue;
    }
    // 名字可能被规范化过（`API 文档` → `API`），行 id 与展示名都要跟着对齐。
    const safe = safeServerName(rawName);
    const name = safe.name;
    const id = rowId(name);
    if (taken.has(id)) {
      skipped.push({ name, reason: '同名条目已存在（DSH 里或本批次前面已采纳）' });
      continue;
    }
    const config = serverToConfig({
      ...server,
      serverName: name,
      cwd: server.cwd !== undefined && server.cwd !== '' ? server.cwd : inferCwd(server),
    });
    working = appendRow(working, { id, name: MCP_CLIENT_PACKAGE, config }, yaml, schema);
    taken.add(id);
    created.push({
      name,
      displayName: server.displayName ?? rawName,
      renamed: safe.changed,
      cwd: config.cwd ?? '',
      id,
      key: server.key ?? serverKey(server.sourceId ?? 'unknown', server.name ?? name),
    });
  }
  return { working, created, skipped };
}

/**
 * 把若干外部条目一次性采纳进 DSH。DSH 里已有同名的跳过（不覆盖用户手改的东西）。
 * @param {{ patchPath, yaml, schema, state, servers: any[] }} input
 */
export function importToDsh({ patchPath, yaml, schema, state, servers }) {
  const list = Array.isArray(servers) ? servers : [servers];
  if (list.length === 0) return { ok: false, error: '没有要导入的条目' };
  const text = readPatchText(patchPath);
  const { working, created, skipped } = planImport(text, list, { yaml, schema });
  if (created.length === 0) return { ok: true, changed: false, created, skipped, state };
  const result = commitText(patchPath, working, { validate: (t) => validateDocument(t, yaml, schema) });
  if (!result.ok) return result;
  const adopted = { ...(state.adopted ?? {}) };
  for (const item of created) {
    adopted[item.key] = { dshId: item.id, adoptedAt: new Date().toISOString(), pushBack: false };
  }
  return { ...result, created, skipped, state: writeState({ ...state, adopted }) };
}

// ── 写回：DSH → 外部工具 ────────────────────────────────────────────────────

/**
 * 把一个条目写回指定源文件。写回前用同一方言回读验证条目确实存在 —— 校验不过
 * 就不落盘。源是否「允许写」由调用方按注册表 + 用户的显式授权决定。
 * @param {{ file, format, containerHint, dialect, name, server }} input
 */
export function pushToSource({ file, format, containerHint, dialect, name, server }) {
  if (typeof file !== 'string' || file === '') return { ok: false, error: '目标文件不存在，无法写回' };
  const original = readTextSafe(file);
  if (original === null) return { ok: false, error: '目标文件读不到（可能刚被删）' };
  const entry = toDialectEntry(dialect ?? 'claude', { ...server, serverName: name });
  let next;
  try {
    if (format === 'toml') next = writeTomlDialect(original, { action: 'upsert', name, entry }).text;
    else next = writeJsonDialect(original, { action: 'upsert', containerKey: containerHint ?? 'mcpServers', name, entry }).text;
  } catch (error) {
    return { ok: false, error: `生成新内容失败：${String(error?.message ?? error)}` };
  }
  const verify = format === 'toml' ? readTomlDialect(next) : readJsonDialect(next, { containerHint });
  if (!(verify.servers ?? []).some((item) => item.name === name)) {
    return { ok: false, error: '写回后回读校验未通过，已取消' };
  }
  // 永远先备份再写：历史版有个 backup:false 逃生门，请求方一句话就能关掉「写前必有备份」的承诺。
  return commitText(file, next);
}

/** 从外部源删掉一个由本插件写回的条目。 */
export function removeFromSource({ file, format, containerHint, name }) {
  const original = readTextSafe(file);
  if (original === null) return { ok: false, error: '目标文件读不到' };
  let next;
  try {
    if (format === 'toml') next = writeTomlDialect(original, { action: 'remove', name }).text;
    else next = writeJsonDialect(original, { action: 'remove', containerKey: containerHint ?? 'mcpServers', name }).text;
  } catch (error) {
    return { ok: false, error: `生成新内容失败：${String(error?.message ?? error)}` };
  }
  const verify = format === 'toml' ? readTomlDialect(next) : readJsonDialect(next, { containerHint });
  if ((verify.servers ?? []).some((item) => item.name === name)) {
    return { ok: false, error: '删除后回读仍能读到该条目，已取消' };
  }
  return commitText(file, next);
}

// ── 账本小工具 ──────────────────────────────────────────────────────────────

/** 打开/关闭某个条目的「写回该源」开关（默认关，用户逐个显式授权）。 */
export function setPushBack(state, key, enabled) {
  const adopted = { ...(state.adopted ?? {}) };
  adopted[key] = {
    ...(adopted[key] ?? { dshId: null, adoptedAt: new Date().toISOString() }),
    pushBack: enabled === true,
  };
  return writeState({ ...state, adopted });
}

/** 扫描后刷新账本基线。 */
export function persistScan(state, result) {
  return writeState(commitSnapshot(state, result));
}

/** 列出备份（面板上的「找回去过」入口）。 */
export function listBackups(limit = 30) {
  const root = backupDir();
  let names;
  try {
    names = readdirSync(root);
  } catch {
    return [];
  }
  return names
    .sort((a, b) => (a < b ? 1 : -1))
    .slice(0, limit)
    .map((name) => {
      const files = collectFiles(join(root, name));
      return { stamp: name, count: files.length, files: files.map((f) => f.replace(root, '')) };
    });
}
