/**
 * dsh-mcp-global-manager — 基础设施层。
 *
 * 这里放着整件插件唯一会「动你磁盘上别人的文件」所需的全部原语：路径解析、
 * 原子写、写前备份、内容指纹，以及三种配置方言（带注释的 JSON、Codex 的
 * TOML 子集、profile 的 YAML 补丁层）的读与写。
 *
 * 两条铁律贯穿所有实现：
 *   1. 写入永远是「先写临时文件再 rename」，中途崩溃不会留下半个文件；
 *   2. 覆盖任何非本插件自管的数据文件之前，先落一份带时间戳的备份。
 *
 * @module dsh-mcp-global-manager/util
 */

import { createHash } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { homedir } from 'node:os';

// ── paths ───────────────────────────────────────────────────────────────────

/** 尊重 `DSH_HOME` 覆盖的 harness home。 */
export function dshHome() {
  const override = process.env.DSH_HOME;
  return override && override.trim() !== '' ? override : join(homedir(), '.dsh');
}

/** 本进程启动时的 `--profile <name>`，缺省 web。 */
export function argvProfile() {
  const argv = process.argv;
  const flag = argv.indexOf('--profile');
  if (flag !== -1 && flag + 1 < argv.length && !argv[flag + 1].startsWith('-')) {
    return argv[flag + 1];
  }
  return undefined;
}

/**
 * 展开 `~`、`$HOME`/`%USERPROFILE%` 一类的写法成绝对路径。
 * 配置里的源路径允许写成 `~/.claude.json`，这样换机器也不用改。
 * @param {string} raw
 * @returns {string}
 */
export function expandPath(raw) {
  let text = String(raw ?? '').trim();
  if (text === '') return text;
  const home = homedir();
  text = text.replace(/%(USERPROFILE|HOME|APPDATA|LOCALAPPDATA|TEMP)%/giu, (_, name) => {
    const envKey = name.toUpperCase();
    if (envKey === 'USERPROFILE' || envKey === 'HOME') return home;
    return process.env[envKey] ?? home;
  });
  if (text === '~') return home;
  if (text.startsWith('~/') || text.startsWith('~\\')) return join(home, text.slice(2));
  if (text.startsWith('$HOME/')) return join(home, text.slice(6));
  return text;
}

/** `file://` URL → 原生路径；普通路径原样返回（DSH Desktop 交出来的是 URL）。 */
export function fromFileUrl(value) {
  if (typeof value !== 'string' || !value.startsWith('file://')) return value;
  try {
    return fileURLToPath(value);
  } catch {
    // 继续走手工解析
  }
  try {
    const path = decodeURIComponent(new URL(value).pathname);
    return /^\/[A-Za-z]:/u.test(path) ? path.slice(1) : path;
  } catch {
    return value.replace(/^file:\/\//u, '');
  }
}

// ── fs primitives ───────────────────────────────────────────────────────────

/** 读文本，文件不存在返回 null（扫描器把「没有这个源」当常态，不是错误）。 */
export function readTextSafe(file) {
  try {
    return readFileSync(file, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT' || error?.code === 'ENOTDIR') return null;
    throw error;
  }
}

/**
 * 原子写：同目录临时文件 + rename。Windows 上 rename 会覆盖已存在文件，
 * 因此不需要先删；写完 fsync 由 writeFileSync 的默认行为兜住。
 */
export function atomicWrite(file, text) {
  const dir = dirname(file);
  mkdirSync(dir, { recursive: true });
  const tmp = join(dir, `.mcpgm-${process.pid}-${Date.now()}.tmp`);
  try {
    writeFileSync(tmp, text, 'utf8');
    renameSync(tmp, file);
  } catch (error) {
    try {
      copyFileSync(file, tmp); // 别把坏文件留下
    } catch {
      /* noop */
    }
    throw error;
  }
}

/**
 * 覆盖前备份。备份名 `<file>.<时间戳>.bak` 落在 `<backupDir>/<扁平化路径>/` 下，
 * 便于事后按「哪个工具的哪份配置」找回。返回备份文件路径。
 */
export function backupFile(file, backupDir) {
  const text = readTextSafe(file);
  if (text === null) return null; // 目标还不存在，没什么可备份
  const stamp = new Date().toISOString().replace(/[:.]/gu, '-');
  const base = basenameFlat(file);
  const folder = join(backupDir, stamp, dirnameFlat(file));
  mkdirSync(folder, { recursive: true });
  const target = join(folder, base);
  copyFileSync(file, target);
  return target;
}

function basenameFlat(file) {
  const parts = String(file).split(/[/\\]/u);
  return parts[parts.length - 1] || 'file';
}

function dirnameFlat(file) {
  const parts = String(file).split(/[/\\]/u);
  parts.pop();
  return parts.join('__').replace(/^__|:/gu, '') || 'root';
}

/** 稳定 JSON（键排序），用于指纹比对。 */
export function canonical(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
}

/** 内容的短指纹，用于判断「这个 server 的配置变没变」。 */
export function fingerprint(value) {
  return createHash('sha256').update(canonical(value)).digest('hex').slice(0, 16);
}

// ── JSON dialect (注释 + 尾逗号) ────────────────────────────────────────────

/**
 * 去掉 JSON 里的 `//`、`/* *​/` 注释与尾逗号，得到能被 JSON.parse 吃的文本。
 * 逐字符扫描，字符串字面量内部的 `//`（一条 URL！）绝不能当注释删掉 —— 这是
 * 各家 MCP 文档示例里最容易踩的雷。
 * @param {string} text
 * @returns {string}
 */
export function stripJsonNoise(text) {
  const out = [];
  let inString = false;
  let inLine = false;
  let inBlock = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const next = text[i + 1];
    if (inLine) {
      if (ch === '\n') {
        inLine = false;
        out.push(ch);
      } else if (ch === '\r') {
        continue;
      }
      continue;
    }
    if (inBlock) {
      if (ch === '*' && next === '/') {
        inBlock = false;
        i += 1;
      }
      continue;
    }
    if (inString) {
      out.push(ch);
      if (ch === '\\') {
        if (next !== undefined) {
          out.push(next);
          i += 1;
        }
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
      out.push(ch);
      continue;
    }
    if (ch === '/' && next === '/') {
      inLine = true;
      i += 1;
      continue;
    }
    if (ch === '/' && next === '*') {
      inBlock = true;
      i += 1;
      continue;
    }
    out.push(ch);
  }
  return removeTrailingCommas(out.join(''));
}

/** 删掉 `}` / `]` 前的尾逗号（同样要先保证不在字符串里）。 */
function removeTrailingCommas(text) {
  return text.replace(/,(\s*[}\]])/gu, '$1');
}

/** 宽松解析 JSON：先去噪，失败时返回 { value:null, error }。 */
export function parseJsonLoose(text) {
  try {
    return { value: JSON.parse(stripJsonNoise(text)), error: null };
  } catch (error) {
    return { value: null, error: String(error?.message ?? error) };
  }
}

// ── TOML subset（Codex 的 config.toml）──────────────────────────────────────

/**
 * TOML 的够用子集解析：`[表.名]`、`key = 值`，值支持单双引号字符串、整数、
 * 浮点、布尔、以及一层数组。行内注释（` # ...`，字符串内的 # 不算）会被剥掉。
 * 返回扁平的 `{ 'a.b': {key:value}, 'a.b.c': {...} }` 结构 + `tables` 里每个表
 * 的原文行区间，供写回时精确定位。
 * @param {string} text
 */
export function parseToml(text) {
  const lines = String(text ?? '').split(/\r?\n/u);
  const flat = {};
  const ranges = [];
  let current = '';
  let start = -1;
  for (let i = 0; i < lines.length; i += 1) {
    const raw = lines[i];
    const line = stripTomlComment(raw).trim();
    if (line === '') continue;
    const header = /^\[([^\]]+)\]$/u.exec(line);
    if (header !== null) {
      if (current !== '') ranges.push({ table: current, from: start, to: i - 1 });
      current = header[1].trim();
      start = i;
      flat[current] = flat[current] ?? {};
      continue;
    }
    if (current === '') continue; // 顶层裸键，本插件用不到
    const assign = /^([A-Za-z0-9_.\-"]+)\s*=\s*(.+)$/u.exec(line);
    if (assign === null) continue;
    flat[current][unquoteKey(assign[1])] = tomlValue(assign[2].trim());
  }
  if (current !== '') ranges.push({ table: current, from: start, to: lines.length - 1 });
  return { flat, ranges, lines };
}

/** 去掉 TOML 行尾注释；引号内部的 `#` 不碰。 */
function stripTomlComment(line) {
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (inSingle) {
      if (ch === "'") inSingle = false;
      continue;
    }
    if (inDouble) {
      if (ch === '\\' && line[i + 1] === '"') {
        i += 1;
        continue;
      }
      if (ch === '"') inDouble = false;
      continue;
    }
    if (ch === "'") {
      inSingle = true;
      continue;
    }
    if (ch === '"') {
      inDouble = true;
      continue;
    }
    if (ch === '#') return line.slice(0, i);
  }
  return line;
}

function unquoteKey(key) {
  const t = key.trim();
  if (t.startsWith('"') && t.endsWith('"') && t.length > 1) return t.slice(1, -1);
  return t;
}

/** 解析一个 TOML 右值。 */
function tomlValue(raw) {
  const text = raw.trim();
  if (text === '') return '';
  if (text.startsWith("'") && text.endsWith("'") && text.length > 1) return text.slice(1, -1);
  if (text.startsWith('"') && text.endsWith('"') && text.length > 1) {
    try {
      return JSON.parse(text);
    } catch {
      return text.slice(1, -1);
    }
  }
  if (text.startsWith('[')) return tomlArray(text);
  if (text === 'true' || text === 'false') return text === 'true';
  if (/^-?\d+(?:\.\d+)?$/u.test(text)) return Number(text);
  return text;
}

/** 一层数组：`["a", "b"]`；元素不是字符串时按字符串收。 */
function tomlArray(text) {
  const body = text.trim().replace(/^\[/u, '').replace(/\]$/u, '').trim();
  if (body === '') return [];
  const items = [];
  let depth = 0;
  let buf = '';
  for (const ch of body) {
    if (ch === '[') depth += 1;
    if (ch === ']') depth -= 1;
    if (ch === ',' && depth === 0) {
      items.push(tomlValue(buf));
      buf = '';
      continue;
    }
    buf += ch;
  }
  if (buf.trim() !== '') items.push(tomlValue(buf));
  return items.map((v) => (typeof v === 'string' ? v : String(v)));
}

/** TOML 字符串字面量（Codex 的惯用写法是单引号，含反斜杠路径时最稳）。 */
export function tomlString(value) {
  const text = String(value ?? '');
  if (!/['\\\r\n]/u.test(text)) return `'${text}'`;
  return JSON.stringify(text);
}

/**
 * 在 TOML 文本里新增/替换一个表块，其余行原样保留。
 * @param {string} text - 原文。
 * @param {string} table - 形如 `mcp_servers.foo` 的表名。
 * @param {Record<string, string|number|boolean|string[]>} fields - 键值。
 * @param {{ subTables?: string[] }} [options] - subTables: 写回时要一并清掉的旧子表。
 * @returns {string} 新文本。
 */
export function upsertTomlTable(text, table, fields, options = {}) {
  const lines = String(text ?? '').split(/\r?\n/u);
  const block = [`[${table}]`];
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined || value === null) continue;
    block.push(`${key} = ${emitTomlValue(value)}`);
  }
  const bounds = findTomlTable(lines, table);
  const extras = [];
  for (const sub of options.subTables ?? []) {
    const b = findTomlTable(lines, sub);
    if (b !== null) extras.push(b);
  }
  if (bounds === null) {
    // 追加到文件末尾，前面补一个空行，风格与手写 TOML 一致。
    while (lines.length > 0 && lines[lines.length - 1].trim() === '') lines.pop();
    const rebuilt = [...lines, '', ...block];
    return `${rebuilt.join('\n')}\n`;
  }
  // 删除既有块 + 它的旧子表，然后把新块插在原位置。
  const cut = new Set();
  const ranges = [bounds, ...extras].sort((a, b) => a.from - b.from);
  for (const range of ranges) {
    for (let i = range.from; i <= range.to; i += 1) cut.add(i);
  }
  const kept = [];
  for (let i = 0; i < lines.length; i += 1) {
    if (cut.has(i)) continue;
    kept.push(lines[i]);
  }
  const insertAt = Math.min(bounds.from, kept.length);
  const merged = [...kept.slice(0, insertAt), ...block, '', ...kept.slice(insertAt)];
  // 清掉连续空行，保持文件紧凑。
  const cleaned = merged.filter((line, index) => !(line.trim() === '' && merged[index - 1]?.trim() === ''));
  return `${cleaned.join('\n').replace(/\s+$/u, '')}\n`;
}

/** 删除一个 TOML 表及其列出的子表。 */
export function removeTomlTable(text, table, subTables = []) {
  const lines = String(text ?? '').split(/\r?\n/u);
  const ranges = [findTomlTable(lines, table), ...subTables.map((s) => findTomlTable(lines, s))].filter(
    (r) => r !== null,
  );
  if (ranges.length === 0) return text;
  const cut = new Set();
  for (const range of ranges) {
    for (let i = range.from; i <= range.to; i += 1) cut.add(i);
  }
  const kept = lines.filter((_, index) => !cut.has(index));
  const cleaned = kept.filter((line, index) => !(line.trim() === '' && kept[index - 1]?.trim() === ''));
  return `${cleaned.join('\n').replace(/\s+$/u, '')}\n`;
}

function findTomlTable(lines, table) {
  const header = new RegExp(`^\\[${escapeRe(table)}\\]\\s*(?:#.*)?$`, 'u');
  const anyHeader = /^\s*\[/u;
  for (let i = 0; i < lines.length; i += 1) {
    if (header.test(stripTomlComment(lines[i]).trim())) {
      let to = i;
      for (let j = i + 1; j < lines.length; j += 1) {
        if (anyHeader.test(stripTomlComment(lines[j]).trim())) break;
        to = j;
      }
      return { from: i, to };
    }
  }
  return null;
}

function escapeRe(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

/** 发射一个 TOML 右值。 */
export function emitTomlValue(value) {
  if (Array.isArray(value)) return `[${value.map((v) => tomlString(v)).join(', ')}]`;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return tomlString(value);
}

// ── YAML（profile 补丁层）───────────────────────────────────────────────────

/**
 * 从 import() 的命名空间里挑出真正的 js-yaml 对象，并判断它是否可用。
 *
 * 必须校验能力而不是版本字符串：profile 的 hoisted `node_modules/js-yaml` 会被别的
 * 插件（dsh-config-manager 依赖 5.x）占位，而 5.x 的导出面没有 `Type` 构造器，
 * 拿它去 buildSchema 会直接 TypeError。DSH 加载器自己用的是 4.3.2，所以「能用」的
 * 判据就是 `Type` + `load` 同时存在。
 * @param {any} ns
 * @returns {{ yaml: any, usable: boolean }}
 */
function pickYaml(ns) {
  const options = [ns, ns?.default];
  for (const candidate of options) {
    if (candidate !== null && typeof candidate === 'object' && typeof candidate.Type === 'function' && typeof candidate.load === 'function') {
      return { yaml: candidate, usable: true };
    }
  }
  return { yaml: ns?.default ?? ns, usable: false };
}

/**
 * 在 anchor 的 pnpm 虚拟store里找一份 4.x 副本（`node_modules/.pnpm/js-yaml@4.x/node_modules/js-yaml`）。
 * hoisted 布局下根目录只能留一个版本，另一版就藏在这儿，路径稳定、可预测。
 * @param {string} anchor
 * @returns {string | null}
 */
function findLegacyYaml(anchor) {
  try {
    const virtual = join(anchor, 'node_modules', '.pnpm');
    if (!existsSync(virtual)) return null;
    for (const entry of readdirSync(virtual)) {
      if (!/^js-yaml@4\./u.test(entry)) continue;
      const dir = join(virtual, entry, 'node_modules', 'js-yaml');
      if (existsSync(join(dir, 'package.json'))) return dir;
    }
  } catch {
    // 读不动就当没有，继续下一个锚点
  }
  return null;
}

/**
 * 解析 `js-yaml`，优先用 profile 自己那份 hoisted 副本。插件被 `file:` 链接安装
 * 时自己的目录里可能没有 node_modules，所以按一串锚点逐个试；每个锚点先试标准解析，
 * 拿到不可用的 5.x 就退到 .pnpm 里的 4.x。
 * @param {string[]} anchorDirs
 */
export async function resolveYaml(anchorDirs) {
  const list = Array.isArray(anchorDirs) ? anchorDirs : [anchorDirs];
  const candidates = [...list, dirname(fileURLToPath(import.meta.url)), process.cwd()];
  /** @type {any} */
  let fallback = null;
  for (const anchor of candidates) {
    if (typeof anchor !== 'string' || anchor === '') continue;
    /** @type {string[]} */
    const specs = [];
    specs.push('js-yaml');
    const legacy = findLegacyYaml(anchor);
    if (legacy !== null) specs.push(legacy);
    for (const spec of specs) {
      try {
        const req = createRequire(join(anchor, 'package.json'));
        const loaded = await import(pathToFileURL(req.resolve(spec)).href);
        const picked = pickYaml(loaded);
        if (picked.usable) return picked.yaml;
        fallback ??= picked.yaml;
      } catch {
        // 换下一个候选
      }
    }
  }
  try {
    const picked = pickYaml(await import('js-yaml'));
    return picked.usable ? picked.yaml : (fallback ?? picked.yaml);
  } catch {
    if (fallback !== null) return fallback;
    throw new Error('找不到可用的 js-yaml（需要带 Type 构造器的 4.x，DSH 加载器同款）');
  }
}

/**
 * 自检用：绕开任何缓存，现场把 js-yaml 解析一遍，回报「拿到的到底是哪一份、能不能用」。
 *
 * 为什么需要它：pnpm 重整目录后，磁盘上的副本变了，但**运行中的进程还在用 import 缓存里的旧版**，
 * 于是接口一切正常、一重启就崩。只有冷启动现场探测才能暴露这种时间差。
 * @param {string[]} anchorDirs
 * @returns {Promise<{ok: boolean, resolved: {path: string | null, version: string | null, usable: boolean}, tried: any[]}>}
 */
export async function diagnoseYaml(anchorDirs) {
  const list = Array.isArray(anchorDirs) ? anchorDirs : [anchorDirs];
  /** @type {{path: string | null, version: string | null, usable: boolean, error?: string}[]} */
  const tried = [];
  for (const anchor of [...list, dirname(fileURLToPath(import.meta.url)), process.cwd()]) {
    if (typeof anchor !== 'string' || anchor === '') continue;
    /** @type {string[]} */
    const specs = ['js-yaml'];
    const legacy = findLegacyYaml(anchor);
    if (legacy !== null) specs.push(legacy);
    for (const spec of specs) {
      try {
        const req = createRequire(join(anchor, 'package.json'));
        const resolved = req.resolve(spec);
        const picked = pickYaml(await import(pathToFileURL(resolved).href));
        const entry = { path: resolved, version: readPkgVersion(resolved), usable: picked.usable };
        tried.push(entry);
        if (picked.usable) return { ok: true, resolved: entry, tried };
      } catch (error) {
        tried.push({ path: spec, version: null, usable: false, error: String(error?.message ?? error).slice(0, 140) });
      }
    }
  }
  return { ok: false, resolved: tried.find((item) => item.path !== null) ?? { path: null, version: null, usable: false }, tried };
}

/**
 * 从模块文件路径往上找 package.json 读版本号。
 * @param {string} modulePath
 * @returns {string | null}
 */
function readPkgVersion(modulePath) {
  try {
    let dir = dirname(modulePath);
    for (let depth = 0; depth < 6; depth += 1) {
      const pj = join(dir, 'package.json');
      if (existsSync(pj)) {
        const parsed = JSON.parse(readFileSync(pj, 'utf8'));
        if (typeof parsed.version === 'string') return parsed.version;
      }
      const parent = dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  } catch {
    // 读不到版本就算了
  }
  return null;
}

/** 带 `!!js` 表达式标签的 schema —— loader 补丁方言需要它才能原样往返。 */
export function buildSchema(yaml) {
  if (typeof yaml?.Type !== 'function') {
    throw new Error('js-yaml 版本不对：这份没有 Type 构造器（5.x），补丁方言需要 4.x');
  }
  const jsExpr = new yaml.Type('tag:yaml.org,2002:js', {
    kind: 'scalar',
    resolve: (data) => typeof data === 'string',
    construct: (data) => ({ __jsExpr: data }),
    predicate: (value) =>
      value !== null && typeof value === 'object' && typeof value.__jsExpr === 'string',
    represent: (value) => value.__jsExpr,
  });
  return yaml.JSON_SCHEMA.extend(jsExpr);
}
