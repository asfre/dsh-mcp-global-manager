#!/usr/bin/env node
/**
 * 冷启动演练：在一个**全新进程**里加载已安装的宿主入口，挂上路由，再用假 req/res 打只读接口。
 *
 * 为什么需要它：运行中的 DSH 进程可能还握着旧的 import 缓存。js-yaml 那次就是「接口全 200、
 * 一重启就 TypeError」——因为 pnpm 把磁盘上的 hoisted 副本换成了 5.x，而进程里还是缓存的 4.x。
 * 本脚本等价于「重启之后用户的第一次点击」：前两段纯读（GET），第三段只写插件自己的
 * state 文件（临时目录里的探针源，演练完自动清掉），**绝不碰用户的任何工具配置**。
 *
 * 跑法：
 *   node tools/cold-start-check.mjs            # 默认演练已安装副本（profile/desktop/node_modules）
 *   node tools/cold-start-check.mjs --dev      # 演练源码目录（未同步时的对照）
 * 退出码 0 = 冷启动可用；1 = 重启后会崩，别等 DSH 自己告诉你。
 *
 * @module tools/cold-start-check
 */

import { existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const NAME = 'dsh-mcp-global-manager';
const devDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * 挑一个 profile 来演练：命令行 `--profile <名>` 优先，其次挑**装有本插件**的那个，
 * 再退回 desktop / web。注意宿主入口读的是 process.argv 里的 `--profile`，
 * 环境变量 DSH_PROFILE 对它无效——搞混了就会拿错目录，误判成一堆 ✗。
 * @returns {string}
 */
function pickProfile() {
  const at = process.argv.indexOf('--profile');
  if (at !== -1 && typeof process.argv[at + 1] === 'string' && !process.argv[at + 1].startsWith('-')) {
    return process.argv[at + 1];
  }
  const base = join(homedir(), '.dsh', 'profiles');
  for (const name of ['desktop', 'web']) {
    if (existsSync(join(base, name, 'node_modules', NAME))) return name;
  }
  return 'desktop';
}

const profileName = pickProfile();
const profileDir = join(homedir(), '.dsh', 'profiles', profileName);
const installedDir = join(profileDir, 'node_modules', NAME);

const useDev = process.argv.includes('--dev');
const pkgDir = useDev ? devDir : installedDir;
const entry = join(pkgDir, 'lib', 'index.js');

if (!existsSync(entry)) {
  console.error(`入口不存在：${entry}\n（先跑 tools/sync-to-profile.ps1，或改用 --dev 演练源码）`);
  process.exit(1);
}

console.log(`冷启动演练：profile=${profileName}  对象=${pkgDir}`);

// ── 假 ctx：只给宿主入口真正会碰的两样（webServer 注册 + logger）──────────────
/** @type {{ kind: string, path: string, handler: (req: any, res: any) => void } | null} */
let mounted = null;
const logs = [];
const ctx = {
  get(key) {
    if (key === 'webServer') {
      return {
        register(row) {
          mounted = row;
        },
      };
    }
    // 生产环境是靠 loader 里的 cordis:include 定位补丁的；这里伪造同一条目，
    // 让演练和宿主真实解析路径一致（少了它就退到 profiles/web，白判一票 ✗）。
    if (key === 'loader') {
      const cordisYml = join(profileDir, 'cordis.yml');
      if (!existsSync(cordisYml)) return undefined;
      return {
        entries: () => [{ options: { name: 'cordis:include', config: { path: pathToFileURL(cordisYml).href } } }],
      };
    }
    return undefined;
  },
  logger() {
    return {
      info: (m) => logs.push(`info  ${m}`),
      warn: (m) => logs.push(`warn  ${m}`),
      error: (m) => logs.push(`error ${m}`),
      debug: () => {},
    };
  },
};

try {
  const mod = await import(pathToFileURL(entry).href);
  if (typeof mod.apply !== 'function') throw new Error('模块没有导出 apply()');
  mod.apply(ctx);
  console.log(`模块加载 OK：name=${mod.name} inject=${JSON.stringify(mod.inject)}`);
} catch (error) {
  console.error(`\n✗ 模块加载/apply 就炸了 —— 重启后必然不可用：`);
  console.error(String(error?.stack ?? error));
  process.exit(1);
}

if (mounted === null) {
  console.error('✗ apply 没有注册任何路由（webServer 不可用？面板打不开）');
  process.exit(1);
}
console.log(`路由挂载 OK：kind=${mounted.kind} path=${mounted.path}`);

// ── 假 req/res：默认走回环、不带 Origin（等价于本地脚本），
//    opts 可覆盖 headers（Origin/Host）与 remoteAddress，用来演练 CSRF 门禁。
function get(pathname, opts = {}) {
  return new Promise((resolvePromise, rejectPromise) => {
    const req = {
      method: 'GET',
      url: pathname,
      socket: { remoteAddress: opts.remoteAddress ?? '127.0.0.1' },
      headers: { ...(opts.headers ?? {}) },
    };
    const res = {
      writableEnded: false,
      statusCode: 0,
      writeHead(status) {
        res.statusCode = status;
        return res;
      },
      end(chunk) {
        if (res.settled) return;
        res.settled = true;
        clearTimeout(timer);
        resolvePromise({ status: res.statusCode, body: String(chunk ?? '') });
      },
    };
    const timer = setTimeout(() => {
      if (res.settled) return;
      res.settled = true;
      rejectPromise(new Error(`${pathname} 超时`));
    }, 15000);
    try {
      mounted.handler(req, res);
    } catch (error) {
      res.settled = true;
      clearTimeout(timer);
      rejectPromise(new Error(`${pathname} 同步抛错：${String(error?.stack ?? error)}`));
    }
  });
}

/** POST：把假 req 变成能喂 body 的事件源（readBody 监听 data/end）。opts 同 get。 */
function post(pathname, payload, opts = {}) {
  return new Promise((resolvePromise, rejectPromise) => {
    const listeners = {};
    const text = JSON.stringify(payload);
    const req = {
      method: 'POST',
      url: pathname,
      socket: { remoteAddress: opts.remoteAddress ?? '127.0.0.1' },
      headers: { 'content-type': 'application/json', ...(opts.headers ?? {}) },
      on(event, cb) {
        (listeners[event] ??= []).push(cb);
      },
      destroy() {},
    };
    const res = {
      writableEnded: false,
      statusCode: 0,
      writeHead(status) {
        res.statusCode = status;
        return res;
      },
      end(chunk) {
        if (res.settled) return;
        res.settled = true;
        clearTimeout(timer);
        resolvePromise({ status: res.statusCode, body: String(chunk ?? '') });
      },
    };
    const timer = setTimeout(() => {
      if (res.settled) return;
      res.settled = true;
      rejectPromise(new Error(`${pathname} 超时`));
    }, 15000);
    try {
      mounted.handler(req, res);
    } catch (error) {
      res.settled = true;
      clearTimeout(timer);
      rejectPromise(new Error(`${pathname} 同步抛错：${String(error?.stack ?? error)}`));
    }
    setTimeout(() => {
      for (const cb of listeners.data ?? []) cb(Buffer.from(text, 'utf8'));
      for (const cb of listeners.end ?? []) cb();
    }, 0);
  });
}

let failed = 0;
function ok(cond, label, extra) {
  if (cond) {
    console.log(`  ✓ ${label}`);
    return true;
  }
  failed += 1;
  console.log(`  ✗ ${label}${extra === undefined ? '' : `  → ${JSON.stringify(extra)}`}`);
  return false;
}

// ── 演练 1：自检（冷启动下 js-yaml 与安装包状态）─────────────────────────────
console.log('\n[1] GET /selftest');
let st;
try {
  const r = await get('/mcp-global/selftest');
  ok(r.status === 200, `HTTP ${r.status}`, r.body.slice(0, 200));
  st = JSON.parse(r.body);
} catch (error) {
  ok(false, 'selftest 请求失败', String(error?.message ?? error));
}

if (st !== undefined) {
  ok(st.patchExists === true, `补丁文件存在 ${st.patchPath}`);
  ok(String(st.patchPath ?? '').replace(/\\/g, '/').includes(`/.dsh/profiles/${profileName}/`), `补丁路径落在演练的 profile（${profileName}）里`);
  const y = st.yaml ?? {};
  ok(y.ok === true, `现场解析到可用 js-yaml（${y.resolved?.version ?? '?'}）`, y.tried?.slice(0, 3));
  ok(/^4\./u.test(String(y.resolved?.version ?? '')), `版本是补丁方言要的 4.x，实际 ${y.resolved?.version}`);
  const c = st.client ?? {};
  ok(c.installed === true, '已安装副本存在');
  ok(c.clientFileExists === true, 'lib/client.js 在位（侧栏条目的代码来源）');
  ok(c.listedInBundles === true, 'profile 的 bundles 名单里有本插件');
  ok(c.manifest?.platform === 'web', `dsh.client.platform=web，实际 ${c.manifest?.platform}`);
  const injectList = Array.isArray(c.manifest?.inject) ? c.manifest.inject : [];
  ok(injectList.includes('@deepseek-ai/dsh-client-ui-slots'), `inject 含 ui-slots：${injectList.join(', ') || '(空)'}`);
  ok(Array.isArray(st.dshRows), `DSH 受管行 ${st.dshRows?.length ?? '?'}`);
}

// ── 演练 2：全量扫描（只读，不写用户的配置文件）────────────────────────────────
console.log('\n[2] GET /scan');
try {
  const r = await get('/mcp-global/scan');
  ok(r.status === 200, `HTTP ${r.status}`, r.body.slice(0, 160));
  const data = JSON.parse(r.body);
  const s = data.summary ?? {};
  ok((s.total ?? 0) > 0, `扫到 ${s.total} 个 server / ${s.files} 个文件`);
  ok((s.errors ?? 0) === 0, `解析错误 ${s.errors ?? 0} 个`, data.errors);
} catch (error) {
  ok(false, 'scan 请求失败', String(error?.message ?? error));
}

// ── 演练 3：自定义源增删是否真的落盘（历史 bug：只回给前端、没写 state）──────
// 只写插件自己的 state 文件；探针指向临时目录里一个不存在的文件，绝不碰用户的工具配置。
console.log('\n[3] POST /sources/add → GET /sources → POST /sources/remove');
const probeId = 'zz-cold-start-probe';
const probePath = join(tmpdir(), 'dsh-mcp-global-coldstart-probe.json');
try {
  const addRes = await post('/mcp-global/sources/add', { id: probeId, label: '演练探针', format: 'json', paths: [probePath] });
  ok(addRes.status === 200, `add HTTP ${addRes.status}`, addRes.body.slice(0, 160));

  const afterAdd = JSON.parse((await get('/mcp-global/sources')).body);
  ok((afterAdd.sources ?? []).some((item) => item.id === probeId), '加完再读，自定义源**真的在盘上**（不是只活在返回值里）', (afterAdd.sources ?? []).length);

  const rmRes = await post('/mcp-global/sources/remove', { id: probeId });
  ok(rmRes.status === 200, `remove HTTP ${rmRes.status}`, rmRes.body.slice(0, 160));

  const afterRm = JSON.parse((await get('/mcp-global/sources')).body);
  ok(!(afterRm.sources ?? []).some((item) => item.id === probeId), '移除也落盘了（清场成功）');
} catch (error) {
  ok(false, '自定义源演练异常', String(error?.message ?? error));
} finally {
  // 无论如何都要清掉探针，别在用户机器上留个假源
  try {
    await post('/mcp-global/sources/remove', { id: probeId });
  } catch {
    // 清场失败就算了，下面复查会说话
  }
}

// ── 演练 3b：P0-2 回归 —— 源 id 禁冒号 + 改落点路径即吊销写回授权 ──────────────
// 两条都是越权面：id 带冒号会污染 `sourceId::name` 的切分（嫁祸别的源）；
// 同一个 id 悄悄改了落点路径，之前给的逐条授权绝不能跟着搬家到新文件。
console.log('\n[3b] /sources/add 的 id 白名单与重定向吊销');
const rtId = 'zz-rt-probe';
const rtFileA = join(tmpdir(), 'dsh-mcp-global-rt-a.json');
const rtFileB = join(tmpdir(), 'dsh-mcp-global-rt-b.json');
try {
  const colonAdd = await post('/mcp-global/sources/add', { id: 'zz-evil::cursor', label: '嫁祸探针', format: 'json', paths: [join(tmpdir(), 'zz-none.json')] });
  ok(colonAdd.status === 400 && /冒号/u.test(colonAdd.body), `源 id 带冒号被直接拒 → HTTP ${colonAdd.status} ${colonAdd.body.slice(0, 90)}`);

  writeFileSync(rtFileA, JSON.stringify({ mcpServers: { probe: { command: 'true' } } }, null, 2));
  writeFileSync(rtFileB, JSON.stringify({ mcpServers: { probe: { command: 'true' } } }, null, 2));
  await post('/mcp-global/sources/add', { id: rtId, label: '重定向探针', format: 'json', writeBack: true, paths: [rtFileA] });
  const authA = await post('/mcp-global/pushback', { key: `${rtId}::probe`, enabled: true });
  ok(authA.status === 200, `落点 A 下逐条授权成功（重定向演练前置）→ HTTP ${authA.status}`);
  // 把同一个 id 的落点改到 B：原有写回授权必须被吊销。
  const readd = await post('/mcp-global/sources/add', { id: rtId, label: '重定向探针', format: 'json', writeBack: true, paths: [rtFileB] });
  ok(readd.status === 200 && /"retargeted":true/u.test(readd.body), `改路径 → 返回标记 retargeted → HTTP ${readd.status} ${readd.body.slice(0, 90)}`);
  const pushAfter = await post('/mcp-global/push', { key: `${rtId}::probe`, action: 'upsert', server: { serverName: 'probe', transport: 'stdio', command: 'true' } });
  ok(pushAfter.status === 403 && /允许写回/u.test(pushAfter.body), `改落点后原授权被吊销，写回被拒 → HTTP ${pushAfter.status} ${pushAfter.body.slice(0, 80)}`);
} catch (error) {
  ok(false, '重定向吊销演练异常', String(error?.message ?? error));
} finally {
  try {
    await post('/mcp-global/sources/remove', { id: rtId });
  } catch {
    // 清场失败下面会暴露
  }
  try {
    rmSync(rtFileA, { force: true });
    rmSync(rtFileB, { force: true });
  } catch {
    // 临时文件残留不影响断言结果
  }
  try {
    const stFile = join(homedir(), '.dsh', 'mcp-global-manager', 'state.json');
    const st = JSON.parse(readFileSync(stFile, 'utf8'));
    let touched = false;
    for (const key of Object.keys(st.adopted ?? {})) {
      if (key.startsWith(`${rtId}::`)) {
        delete st.adopted[key];
        touched = true;
      }
    }
    if (touched) writeFileSync(stFile, `${JSON.stringify(st, null, 2)}\n`);
  } catch {
    // 账本清理失败会在收尾核对时暴露
  }
}

// ── 演练 4：写回门禁（全部必须被拒绝，而且一个字节都不许写）────────────────────
// 服务端已删除 force 后门，所以这两道门（源允许写回 + 条目已授权）是唯一防线：
// 任何带着 force 的越权请求也必须被拦下，本演练就是钉这件事的。
console.log('\n[4] POST /push 门禁演练（拒绝路径）');
// 插件数据目录是 `~/.dsh/mcp-global-manager/`（scan.js 的 dataDir()），**不是包名**
// `dsh-mcp-global-manager`。早先这里拼成了包名，目录根本不存在，countBackups() 恒为 0，
// 于是「拒绝路径没产生备份」两条断言全是空断言（0 === 0 永远成立）。
const dataDir = join(homedir(), '.dsh', 'mcp-global-manager');
const backupsDir = join(dataDir, 'backups');
const countBackups = () => {
  try {
    return readdirSync(backupsDir).length;
  } catch {
    return 0;
  }
};
const backupCountBefore = countBackups();
// 门禁探针：只用临时目录里**不存在**的路径当自定义源，绝不拿用户的真工具配置做实验。
const gateProbeId = 'zz-gate-probe';
const gateWritableId = 'zz-gate-writable';
const gateFile = join(tmpdir(), 'dsh-mcp-global-gate-absent.json');
const gateCases = [
  { key: 'zz-no-such-source::x', expect: /未知源/u, label: '未知源直接拒' },
  { key: 'dsh::x', expect: /不需要写回/u, label: 'DSH 自己不写回' },
  { key: 'zed::probe', expect: /只读/u, label: '注册表标只读的源（Zed）拒写' },
  { key: 'zed::probe', body: { force: true }, expect: /只读/u, label: '带 force 也没用：服务端已不认 force，只读源照样拒写' },
  { key: 'cursor::probe', expect: /允许写回/u, label: '可写源但没逐条授权 → 拒（面板现在靠这条兜底）' },
  // FIX-1 的正主：force 后门已从服务端删掉，带着 force 的越权写回必须仍被逐条授权门拦下。
  { key: 'cursor::probe', body: { force: true }, expect: /允许写回/u, label: '带 force 也越不过逐条授权门（force 后门已删除）' },
];
for (const item of gateCases) {
  try {
    const r = await post('/mcp-global/push', { key: item.key, action: 'upsert', server: { serverName: 'probe', transport: 'stdio', command: 'true' }, ...item.body });
    const text = `${r.status} ${r.body}`;
    ok(r.status !== 200 && item.expect.test(text), `${item.label} → ${text.slice(0, 90)}`);
  } catch (error) {
    ok(false, item.label, String(error?.message ?? error));
  }
}
try {
  await post('/mcp-global/sources/add', { id: gateProbeId, label: '门禁探针（只读）', format: 'json', writeBack: false, paths: [gateFile] });
  await post('/mcp-global/sources/add', { id: gateWritableId, label: '门禁探针（可写）', format: 'json', writeBack: true, paths: [gateFile] });
  const ro = await post('/mcp-global/push', { key: `${gateProbeId}::probe`, action: 'upsert', server: { serverName: 'probe' } });
  ok(ro.status !== 200 && /只读/u.test(ro.body), `自定义源标 writeBack:false 也拒 → ${ro.status} ${ro.body.slice(0, 80)}`);
  // 可写但文件不存在：必须在碰到磁盘之前停下。
  // force 后门删除后，得先走正规逐条授权（/pushback）才触达得到后面的文件存在性校验。
  // 逐条授权门只认真实存在的条目：gateFile 不存在 → 该源扫描不到 probe → 授权必须被拒（防预置授权）。
  const authGate = await post('/mcp-global/pushback', { key: `${gateWritableId}::probe`, enabled: true });
  ok(authGate.status === 400 && /当前扫描到的真实条目/u.test(authGate.body), `文件不存在→条目不在扫描里→逐条授权被拒（防预置）→ HTTP ${authGate.status} ${authGate.body.slice(0, 80)}`);
  // 没授权成，写回自然也进不去；且绝不凭空创建目标文件。
  const missing = await post('/mcp-global/push', { key: `${gateWritableId}::probe`, action: 'upsert', server: { serverName: 'probe', transport: 'stdio', command: 'true' } });
  ok(missing.status !== 200 && /允许写回|当前不存在/u.test(missing.body), `未授权/文件不在位时拒写，不凭空创建 → ${missing.status} ${missing.body.slice(0, 80)}`);
  ok(!existsSync(gateFile), '临时路径确实没被凭空创建');
} catch (error) {
  ok(false, '自定义源门禁演练异常', String(error?.message ?? error));
} finally {
  for (const id of [gateProbeId, gateWritableId]) {
    try {
      await post('/mcp-global/sources/remove', { id });
    } catch {
      // 清场失败下面会暴露
    }
  }
}
const backupCountAfter = countBackups();
// 括号里报一下目录到底存不存在：0 → 0 既可能是「真没写」，也可能是「目录压根没建过」，
// 看清哪种情况，免得将来又有人对着一条空断言放心。
ok(backupCountAfter === backupCountBefore, `门禁演练没产生任何备份文件（${backupCountBefore} → ${backupCountAfter}；备份目录${existsSync(backupsDir) ? `存在，路径 ${backupsDir}` : '尚未创建（本机还没真写过盘）'}）`);

// 真实补丁上的越权尝试：用装着的另一个插件的行 id 来删/停，必须在碰磁盘之前就被拒。
// （removeRow 找不到受管行 → changed:false → 409；旧代码会走到 commitText 然后谎报成功。）
const realPatch = join(homedir(), '.dsh', 'profiles', profileName, 'cordis.patch.yml');
if (existsSync(realPatch)) {
  const beforeText = readFileSync(realPatch, 'utf8');
  for (const [label, pathName, payload] of [
    ['删别人的行', '/mcp-global/dsh/remove', { id: 'mcp-manager-plus' }],
    ['停别人的行', '/mcp-global/dsh/toggle', { id: 'mcp-manager-plus', disabled: true }],
    ['改别人的行', '/mcp-global/dsh/update', { id: 'mcp-manager-plus', server: { serverName: 'ghost', transport: 'stdio', command: 'true' } }],
  ]) {
    try {
      const r = await post(pathName, payload);
      ok(r.status !== 200 && /没有改动任何文件|别的插件|未找到受管行/u.test(r.body), `真实补丁：${label}被拒 → ${r.status} ${r.body.slice(0, 90)}`);
    } catch (error) {
      ok(false, `真实补丁：${label}`, String(error?.message ?? error));
    }
  }
  ok(readFileSync(realPatch, 'utf8') === beforeText, '三个越权请求跑完，真实补丁一个字节都没变');
}

console.log('\n[5] POST /push 掩码还原演练（把 •••• 写进工具配置 = 覆盖真 token）');
const maskProbeId = 'zz-mask-probe';
const maskFile = join(tmpdir(), 'dsh-mcp-global-mask-probe.json');
const MASK = '••••••••';
writeFileSync(maskFile, JSON.stringify({ mcpServers: { probe: { command: 'true', env: { API_KEY: 'real-secret-123' } } } }, null, 2));
try {
  await post('/mcp-global/sources/add', { id: maskProbeId, label: '掩码探针', format: 'json', writeBack: true, paths: [maskFile] });
  const auth = await post('/mcp-global/pushback', { key: `${maskProbeId}::probe`, enabled: true });
  ok(auth.status === 200, '给探针条目授权写回 → HTTP 200');
  // 正向：面板提交的就是打码负载，写回后磁盘上的真值必须原样保住
  const r1 = await post('/mcp-global/push', {
    key: `${maskProbeId}::probe`,
    action: 'upsert',
    backup: false,
    server: { serverName: 'probe', transport: 'stdio', command: 'true', env: { API_KEY: MASK } },
  });
  ok(r1.status === 200, `带掩码写回（应自动还原真值）→ HTTP ${r1.status} ${r1.body.slice(0, 120)}`);
  const after1 = JSON.parse(readFileSync(maskFile, 'utf8'));
  ok(after1?.mcpServers?.probe?.env?.API_KEY === 'real-secret-123', '工具配置里的真值没被 •••• 覆盖', String(after1?.mcpServers?.probe?.env?.API_KEY));
  // 反向：在真实存在且已授权的 probe 上，补一个源文件里没有、又被打码的 env 键 →
  // 无原值可还原，写回必须在落盘前被拒（409）。逐条授权门要求条目真实存在，
  // 所以这条只能在 probe 上测，不能凭空造一个源里没有的 ghost 来授权。
  const r2 = await post('/mcp-global/push', {
    key: `${maskProbeId}::probe`,
    action: 'upsert',
    server: { serverName: 'probe', transport: 'stdio', command: 'true', env: { API_KEY: MASK, BRAND_NEW_TOKEN: MASK } },
  });
  ok(r2.status === 409 && /掩码/.test(r2.body), `陌生掩码键无原值可还原时拒写 → ${r2.status} ${r2.body.slice(0, 100)}`);
  const after2 = JSON.parse(readFileSync(maskFile, 'utf8'));
  ok(after2?.mcpServers?.probe?.env?.BRAND_NEW_TOKEN === undefined, '被拒的陌生掩码键没有落进文件');
  ok(after2?.mcpServers?.probe?.env?.API_KEY === 'real-secret-123', '拒写后原真值仍没被动过');
} catch (error) {
  ok(false, '掩码写回演练异常', String(error?.message ?? error));
} finally {
  try {
    await post('/mcp-global/sources/remove', { id: maskProbeId });
  } catch {
    // 清场失败下面会暴露
  }
  try {
    rmSync(maskFile, { force: true });
  } catch {
    // 临时文件残留不影响断言结果
  }
  // /pushback 把探针授权写进了真实账本：清掉 zz- 开头的条目，不留痕
  try {
    const stateFile = join(dataDir, 'state.json');
    const st = JSON.parse(readFileSync(stateFile, 'utf8'));
    let touched = false;
    for (const key of Object.keys(st.adopted ?? {})) {
      if (key.startsWith('zz-')) {
        delete st.adopted[key];
        touched = true;
      }
    }
    if (touched) writeFileSync(stateFile, `${JSON.stringify(st, null, 2)}\n`);
  } catch {
    // 账本清理失败会在收尾核对时暴露
  }
}

// ── 演练 6：CSRF 门禁（FIX-2）：跨站 Origin 必须在路由分发之前就被拦掉 ──────────
// 恶意网页同样是从本机打过来的（remoteAddress = 127.0.0.1），isLoopback 挡不住它，
// 唯一能区分「面板/本地脚本」与「别的站点」的就是 Origin。这里验的是拦截**顺序**：
// 被 CSRF 挡下的请求绝不能走到业务逻辑，所以拿只读探针当靶子，只比对错误文案。
console.log('\n[6] Origin/Host 同源校验（CSRF 防护）');
const csrfBackupBefore = countBackups(); // 单独取基线：[5] 掩码往返正常写回会留备份，不能拿 [4] 前的旧基线来比这一段
const CSRF = '拒绝跨站请求（CSRF 防护）';
const csrfTarget = { key: 'zed::probe', action: 'upsert', server: { serverName: 'probe', transport: 'stdio', command: 'true' } };
const csrfCases = [
  { headers: { origin: 'http://evil.example.com' }, expect: 403, label: '跨站网页（evil.example.com）POST /push → 拒', route: '/mcp-global/push', payload: csrfTarget },
  { headers: { origin: 'null' }, expect: 403, label: 'file:// 之类不透明源 Origin: null → 拒', route: '/mcp-global/push', payload: csrfTarget },
  { headers: { origin: 'http://127.0.0.1' }, expect: 403, label: 'Origin 能解析但 host 不对 → 拒', route: '/mcp-global/push', payload: csrfTarget },
  { headers: { origin: 'https://evil.example.com' }, expect: 403, label: '跨站 GET /scan 也拒（只读接口同样设防）', route: '/mcp-global/scan', payload: undefined },
  { headers: { origin: 'http://127.0.0.1:19387', host: '127.0.0.1:19387' }, expect: 403, label: '同源面板放行（走到业务门才报只读，不是 CSRF）', route: '/mcp-global/push', payload: csrfTarget, not: CSRF },
  { headers: {}, expect: 403, label: '本地脚本/curl 不带 Origin → 放行（报的是业务错，不是 CSRF）', route: '/mcp-global/push', payload: csrfTarget, not: CSRF },
  { headers: { origin: 'dsh://app' }, expect: 403, label: '桌面壳自定义协议 Origin → 放行（网页发不出这种源，不该把自己人拒了）', route: '/mcp-global/push', payload: csrfTarget, not: CSRF },
];
for (const item of csrfCases) {
  try {
    const isGet = item.route === '/mcp-global/scan';
    const r = isGet
      ? await get(item.route, { headers: item.headers })
      : await post(item.route, item.payload, { headers: item.headers });
    const text = `${r.status} ${r.body}`;
    if (item.not !== undefined) ok(r.status === item.expect && !text.includes(item.not), `${item.label} → ${text.slice(0, 90)}`);
    else ok(r.status === item.expect && text.includes(CSRF), `${item.label} → ${text.slice(0, 90)}`);
  } catch (error) {
    ok(false, item.label, String(error?.message ?? error));
  }
}
// 非回环来源仍然先被本机门禁挡下（顺序：loopback → sameOrigin → 路由）
try {
  const r = await get('/mcp-global/scan', { remoteAddress: '10.1.2.3', headers: { origin: 'http://127.0.0.1:19387', host: '127.0.0.1:19387' } });
  ok(r.status === 403 && r.body.includes('仅允许本机访问'), `局域网/公网来源 → 拒（本机门禁优先）→ ${r.status} ${r.body.slice(0, 60)}`);
} catch (error) {
  ok(false, '非回环来源演练', String(error?.message ?? error));
}
ok(countBackups() === csrfBackupBefore, `CSRF 演练同样没产生任何备份文件（${csrfBackupBefore} → ${countBackups()}）`);

if (logs.length > 0) {
  console.log('\n宿主入口日志：');
  for (const line of logs) console.log(`  ${line.slice(0, 180)}`);
}

if (failed > 0) {
  console.log(`\n✗ 冷启动演练失败 ${failed} 项 —— 现在能用是假象，重启会崩。`);
  process.exit(1);
}
console.log('\n✓ 冷启动演练通过：新进程里模块能加载、路由能挂上、自检与扫描都答得上。');
