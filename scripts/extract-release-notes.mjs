// scripts/extract-release-notes.mjs
// 用法: node scripts/extract-release-notes.mjs v0.2.0
// 从 CHANGELOG.md 抽取对应版本段落（已是中文+English 双语），作为 GitHub Release 说明。
import { readFileSync } from 'node:fs';

const ver = (process.argv[2] || '').replace(/^v/, '');
if (!ver) {
  console.error('用法 / usage: node scripts/extract-release-notes.mjs <version, e.g. 0.2.0>');
  process.exit(1);
}

const md = readFileSync(new URL('../CHANGELOG.md', import.meta.url), 'utf8');

// 匹配 `## vX.Y.Z ...` 到下一个 `## ` 或 `---` 或文件尾之间的内容
const re = new RegExp(
  `##\\s+v?${ver.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b[\\s\\S]*?(?=\\n##\\s|\\n---\\n|$)`,
  'i'
);
const m = md.match(re);
if (!m) {
  console.error(`未在 CHANGELOG.md 找到版本 v${ver}`);
  process.exit(1);
}
process.stdout.write(m[0].trim());
