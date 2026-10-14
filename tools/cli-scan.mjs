#!/usr/bin/env node
/**
 * 离线自测 CLI：不启动 DSH 也能验证扫描器、方言解析与补丁写入的正确性。
 *
 *   node tools/cli-scan.mjs                # 只扫描并打印（零写入）
 *   node tools/cli-scan.mjs --emit         # 扫描 + 演示采纳全部外部条目要写的 YAML（零写入）
 *   node tools/cli-scan.mjs --adopt a::b   # 真写入 DSH 补丁（带备份）
 *   node tools/cli-scan.mjs --push key     # 真写回某个源（带备份，需 --confirm）
 *
 * @module tools/cli-scan
 */

import { join } from 'node:path';
import { homedir } from 'node:os';
import { argvProfile, buildSchema, dshHome, readTextSafe, resolveYaml } from '../lib/util.js';
import { readManagedRows, validateDocument } from '../lib/patch.js';
import { readState, scanAll } from '../lib/scan.js';
import { importToDsh, planImport } from '../lib/sync.js';

const args = process.argv.slice(2);
const has = (flag) => args.includes(flag);
const val = (flag) => {
  const i = args.indexOf(flag);
  return i === -1 ? null : args[i + 1] ?? null;
};

const profileDir = join(dshHome(), 'profiles', argvProfile() ?? 'desktop');
const patchPath = process.env.MCPGM_PATCH ?? join(profileDir, 'cordis.patch.yml');
const yaml = await resolveYaml([profileDir, homedir()]);
const schema = buildSchema(yaml);

const state = readState();
const result = scanAll({ dshPatchPath: patchPath, yaml, schema, state });

console.log(`补丁：${patchPath}  存在=${readTextSafe(patchPath) !== null}`);
console.log(`扫描时间：${result.scannedAt}\n`);

console.log('=== 源 ===');
for (const source of result.sources) {
  if (!source.exists) continue;
  const err = source.error ? `  ✗ ${source.error}` : '';
  console.log(`${String(source.servers.length).padStart(3)}  ${source.label.padEnd(18)} ${source.format.padEnd(9)} ${source.file}${err}`);
}

console.log('\n=== 条目 ===');
const byStatus = { new: [], changed: [], same: [], gone: [] };
for (const server of result.servers) (byStatus[server.status] ?? byStatus.new).push(server);
for (const [status, list] of Object.entries(byStatus)) {
  if (list.length === 0) continue;
  console.log(`\n[${status.toUpperCase()}] ${list.length}`);
  for (const server of list) {
    const target = server.transport === 'streamable-http' ? server.url : `${server.command} ${(server.args ?? []).join(' ')}`.trim();
    console.log(
      `  ${server.sourceLabel.padEnd(16)} ${server.serverName.padEnd(24)} ${target.slice(0, 70)}${
        server.duplicateOf ? `   ↳ 同名于: ${server.duplicateOf.join(', ')}` : ''
      }`,
    );
  }
}

console.log('\n=== 校验 ===');
const text = readTextSafe(patchPath) ?? '';
console.log(`现有补丁 validateDocument：${validateDocument(text, yaml, schema) ?? 'OK'}`);
console.log(`现有受管行数：${readManagedRows(text, yaml, schema).rows.length}`);

if (has('--emit')) {
  const externals = result.servers.filter((s) => !s.inDsh && s.status !== 'gone');
  // 与真实导入共用 planImport：预览写的每一个字节，都等于真点「采纳」时写的。
  const plan = planImport(text, externals, { yaml, schema });
  console.log(`\n演示采纳 ${plan.created.length} 条（跳过 ${plan.skipped.length} 条）后的补丁校验：${validateDocument(plan.working, yaml, schema) ?? 'OK'}`);
  console.log(`原文件 ${text.split('\n').length} 行 → 新文本 ${plan.working.split('\n').length} 行（未写入）`);
  if (plan.skipped.length > 0) {
    console.log('跳过：' + plan.skipped.map((s) => `${s.name}(${s.reason})`).join(', '));
  }
  const renamed = plan.created.filter((c) => c.renamed || c.cwd);
  if (renamed.length > 0) {
    console.log('导入时被调整的条目：');
    for (const c of renamed) {
      console.log(`  ${c.displayName}${c.renamed ? ` → 服务名改为 ${c.name}` : ''}${c.cwd ? `  补 cwd=${c.cwd}` : ''}`);
    }
  }
  console.log('\n--- 新增部分预览（前 60 行）---');
  const added = plan.working.slice(text.length);
  console.log(added.split('\n').slice(0, 60).join('\n'));
}

if (has('--adopt')) {
  const keys = (val('--adopt') ?? '')
    .split(',')
    .map((k) => k.trim())
    .filter(Boolean);
  const picked = result.servers.filter((s) => keys.includes(s.key));
  if (picked.length === 0) {
    console.log('\n--adopt 需要至少一个能匹配上的 key（形如 trae-cn::playwright）');
    process.exit(1);
  }
  if (!has('--confirm')) {
    console.log('\n未加 --confirm，拒绝写入。要导入的是：\n' + picked.map((p) => `  ${p.key}`).join('\n'));
    process.exit(0);
  }
  const outcome = importToDsh({ patchPath, yaml, schema, state, servers: picked });
  console.log(`\n导入结果：ok=${outcome.ok} changed=${outcome.changed} 备份=${outcome.backup ?? '无'}`);
  console.log(`创建：${(outcome.created ?? []).map((c) => c.name).join(', ') || '无'}`);
  console.log(`跳过：${(outcome.skipped ?? []).map((s) => `${s.name}(${s.reason})`).join(', ') || '无'}`);
  if (outcome.error) console.log(`错误：${outcome.error}`);
  process.exit(outcome.ok ? 0 : 1);
}
