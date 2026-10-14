# dsh-mcp-global-manager：把源码同步进 desktop profile 的已安装副本。
#
# 背景：pnpm 的 file: 安装是**实拷贝**（不是软链），所以改完
# $env:USERPROFILE\dsh-plugins\dsh-mcp-global-manager 里的代码，
# profile 里那份不会自己变。跑这个脚本对齐，然后刷新 / 重启 DSH。
#
# 用法：
#   powershell -ExecutionPolicy Bypass -File "$env:USERPROFILE\dsh-plugins\dsh-mcp-global-manager\tools\sync-to-profile.ps1"
#
# 注意：DSH 运行时会独占打开部分 lib 文件，被占用的会报「正由另一进程使用」并跳过；
# 那几个文件本来内容就一致才跳得过。真要全量覆盖，先退出 DSH 再跑。

$ErrorActionPreference = 'Stop'
$dev = Join-Path $env:USERPROFILE 'dsh-plugins\dsh-mcp-global-manager'
$dst = Join-Path $env:USERPROFILE '.dsh\profiles\desktop\node_modules\dsh-mcp-global-manager'

if (-not (Test-Path -LiteralPath $dst)) {
  Write-Host "目标不存在：$dst" -ForegroundColor Red
  Write-Host "先在 profile 目录执行 pnpm add file:$($dev -replace '\\', '/')"
  exit 1
}

$files = @(
  'package.json', 'README.md', 'icon.svg', 'cordis.patch.yml',
  'lib\util.js', 'lib\patch.js', 'lib\dialect.js', 'lib\sources.js',
  'lib\scan.js', 'lib\sync.js', 'lib\index.js', 'lib\client.js'
)

$copied = 0; $same = 0; $locked = 0; $missing = 0
foreach ($f in $files) {
  $s = Join-Path $dev $f
  $d = Join-Path $dst $f
  if (-not (Test-Path -LiteralPath $s)) { Write-Host "  源缺  $f" -ForegroundColor DarkGray; $missing++; continue }
  if ((Test-Path -LiteralPath $d) -and (Get-FileHash -LiteralPath $s).Hash -eq (Get-FileHash -LiteralPath $d).Hash) {
    Write-Host "  一致  $f" -ForegroundColor DarkGray; $same++; continue
  }
  $parent = Split-Path $d -Parent
  if (-not (Test-Path -LiteralPath $parent)) { New-Item -ItemType Directory -Force -Path $parent | Out-Null }
  try {
    Copy-Item -LiteralPath $s -Destination $d -Force
    Write-Host "  覆盖  $f" -ForegroundColor Green
    $copied++
  } catch {
    Write-Host "  占用跳过  $f  ($($_.Exception.Message))" -ForegroundColor Yellow
    $locked++
  }
}

Write-Host ''
Write-Host "覆盖 $copied / 已一致 $same / 占用跳过 $locked / 源缺 $missing"

# 覆盖过东西就做个语法自检，别把语法错误送进 profile
if ($copied -gt 0) {
  $node = Join-Path $env:USERPROFILE '.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe'
  if (-not (Test-Path -LiteralPath $node)) { $node = 'node' }
  foreach ($f in @('lib\util.js','lib\index.js','lib\client.js','lib\sync.js','lib\scan.js','lib\patch.js','lib\dialect.js','lib\sources.js')) {
    $p = Join-Path $dst $f
    if (-not (Test-Path -LiteralPath $p)) { continue }
    & $node --check $p 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) { Write-Host "语法错误：$p" -ForegroundColor Red; exit 1 }
  }
  Write-Host '语法自检通过。刷新 DSH 界面（Ctrl+R）生效；改过 lib/index.js 等宿主侧文件则需要重启应用。'
}
