# DailyFlow 跨机白屏诊断脚本
# 用法：双击 tools\cross-pc-diagnostic.bat（或右键本文件 → 用 PowerShell 运行）
# 只读检查，不会修改任何东西。

$ErrorActionPreference = "Continue"
Write-Host "================ DailyFlow 跨机诊断 ================" -ForegroundColor Cyan

# 1. Windows 版本 / 架构
Write-Host "`n[1] Windows 版本 / 架构" -ForegroundColor Yellow
try {
  $os = Get-CimInstance Win32_OperatingSystem
  Write-Host ("  OS: {0}  Build: {1}  Arch: {2}" -f $os.Caption, $os.BuildNumber, $env:PROCESSOR_ARCHITECTURE)
} catch {
  Write-Host ("  获取失败: {0}" -f $_.Exception.Message)
}

# 2. WebView2 Runtime 是否存在 + 版本（参考信息）
Write-Host "`n[2] WebView2 Runtime（系统级，参考）" -ForegroundColor Yellow
$wv2 = @(
  "HKLM:\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}",
  "HKLM:\SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}",
  "HKCU:\SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}"
)
$wv2Found = $false
foreach ($k in $wv2) {
  if (Test-Path $k) {
    $v = (Get-ItemProperty $k -ErrorAction SilentlyContinue).pv
    Write-Host "  WebView2 Runtime 版本: $v  ($k)"
    $wv2Found = $true
  }
}
if (-not $wv2Found) { Write-Host "  WebView2 Runtime: 系统未安装（应用自带固定运行时，不受影响）" -ForegroundColor Yellow }

# 3. DailyFlow 安装位置与固定运行时（关键）
Write-Host "`n[3] DailyFlow 安装与固定运行时（关键）" -ForegroundColor Yellow
$installDir = $null
$regKeys = @("HKCU:\Software\dailyflow\DailyFlow", "HKLM:\Software\dailyflow\DailyFlow")
foreach ($k in $regKeys) {
  if (Test-Path $k) {
    $v = (Get-ItemProperty $k -ErrorAction SilentlyContinue).'(default)'
    if ($v) { $installDir = $v; Write-Host "  安装位置(注册表): $v" }
  }
}
if (-not $installDir -and (Test-Path "$env:LOCALAPPDATA\DailyFlow\dailyflow.exe")) {
  $installDir = "$env:LOCALAPPDATA\DailyFlow"
}
if ($installDir) {
  Write-Host "  安装位置: $installDir"
  $exe = Join-Path $installDir "dailyflow.exe"
  $rt = Join-Path $installDir "webview2\msedgewebview2.exe"
  Write-Host ("  dailyflow.exe: {0}" -f (Test-Path $exe))
  Write-Host ("  webview2\msedgewebview2.exe: {0}  <- 应用自带的固定运行时，必须存在" -f (Test-Path $rt))
  if (Test-Path $rt) {
    $rtSize = [math]::Round((Get-ChildItem (Join-Path $installDir "webview2") -Recurse -File | Measure-Object Length -Sum).Sum / 1MB, 1)
    Write-Host "  固定运行时大小: ${rtSize} MB（正常约 420 MB，太小说明安装不完整）"
  }
} else {
  Write-Host "  未找到 DailyFlow 安装（可能未安装或装在其它位置）" -ForegroundColor Red
}

# 4. 数据目录 / 数据库 / 启动日志（关键）
Write-Host "`n[4] 数据目录 / 启动日志" -ForegroundColor Yellow
$data = Join-Path $env:LOCALAPPDATA "DailyFlow"
if (Test-Path $data) {
  Write-Host "  数据目录存在: $data"
  $db = Join-Path $data "dailyflow.db"
  if (Test-Path $db) {
    $size = (Get-Item $db).Length
    Write-Host "  dailyflow.db 存在（$size 字节）→ JS 已执行到建库阶段"
  } else { Write-Host "  dailyflow.db 不存在" }
  $log = Join-Path $data "startup.log"
  if (Test-Path $log) {
    Write-Host "`n  ==== startup.log 内容（应用自诊断日志，最重要）====" -ForegroundColor Green
    Get-Content $log -Encoding UTF8
    Write-Host "  ==== startup.log 结束 ====" -ForegroundColor Green
  } else {
    Write-Host "  startup.log 不存在 → 应用 Rust 层可能根本没启动" -ForegroundColor Red
  }
} else {
  Write-Host "  数据目录不存在 → 应用可能未运行过" -ForegroundColor Red
}

# 5. 抓取 WebView2 控制台（可选）
Write-Host "`n[5] 抓取 WebView2 Console（可选）" -ForegroundColor Yellow
Write-Host "  方法A：打开 Edge/Chrome 访问 http://localhost:9222 ，然后运行："
Write-Host '  $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = "--remote-debugging-port=9222 --remote-allow-origins=*"'
Write-Host '  & "<安装位置>\dailyflow.exe"'
Write-Host "  把 Console 里的红色错误复制回来。"

# 6. 实时启动测试：启动应用，观察 WebView2 浏览器进程是否真的被拉起（关键）
Write-Host "`n[6] 实时启动测试（自动运行，约 20 秒）" -ForegroundColor Yellow
$appExe = $null
if ($installDir -and (Test-Path (Join-Path $installDir "dailyflow.exe"))) {
  $appExe = Join-Path $installDir "dailyflow.exe"
} elseif (Test-Path "$env:LOCALAPPDATA\DailyFlow\dailyflow.exe") {
  $appExe = "$env:LOCALAPPDATA\DailyFlow\dailyflow.exe"
}
if ($appExe) {
  Write-Host "  正在启动: $appExe"
  $before = @(Get-Process msedgewebview2 -ErrorAction SilentlyContinue | ForEach-Object { $_.Id })
  $proc = Start-Process -FilePath $appExe -PassThru
  Start-Sleep -Seconds 12
  $app = Get-Process -Id $proc.Id -ErrorAction SilentlyContinue
  $after = @(Get-Process msedgewebview2 -ErrorAction SilentlyContinue | Where-Object { $_.Id -notin $before })
  Write-Host ("  DailyFlow 进程存活: {0}" -f [bool]$app)
  Write-Host ("  新增 msedgewebview2 进程数: {0}" -f @($after).Count)
  if (@($after).Count -gt 0) {
    @($after) | Select-Object -First 3 | ForEach-Object { Write-Host ("    PID {0} -> {1}" -f $_.Id, $_.Path) }
  } else {
    Write-Host "  没有任何 WebView2 浏览器进程 → 浏览器进程未被拉起（安全软件拦截/环境创建失败）" -ForegroundColor Red
  }
  if ($app) { Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue }
  # 再读一次 startup.log（探测结果可能刚写入）
  $log = Join-Path $env:LOCALAPPDATA "DailyFlow\startup.log"
  if (Test-Path $log) {
    Write-Host "`n  ==== startup.log（运行后重读，注意 env probe 行）====" -ForegroundColor Green
    Get-Content $log -Encoding UTF8
    Write-Host "  ==== startup.log 结束 ====" -ForegroundColor Green
  }
} else {
  Write-Host "  未找到 dailyflow.exe，跳过启动测试" -ForegroundColor Yellow
}

# 7. 事件日志扫描（浏览器进程崩溃/加载失败的证据）
Write-Host "`n[7] 事件日志（最近 2 小时，dailyflow/msedgewebview2 相关）" -ForegroundColor Yellow
try {
  $since = (Get-Date).AddHours(-2)
  $events = Get-WinEvent -LogName Application -MaxEvents 200 -ErrorAction SilentlyContinue |
    Where-Object { $_.TimeCreated -gt $since -and $_.Message -match 'msedgewebview2|dailyflow|WebView2' }
  if ($events) {
    $events | Select-Object -First 10 | ForEach-Object {
      Write-Host ("  [{0}] {1}" -f $_.TimeCreated.ToString("HH:mm:ss"), $_.ProviderName)
      $msg = ($_.Message -replace "`r`n", " ")
      if ($msg.Length -gt 220) { $msg = $msg.Substring(0, 220) }
      Write-Host ("    " + $msg)
    }
  } else {
    Write-Host "  无相关事件（说明没有崩溃记录）"
  }
} catch {
  Write-Host ("  读取失败: {0}" -f $_.Exception.Message)
}

# 8. 受控文件夹访问（可能拦截应用写数据）
Write-Host "`n[8] 安全软件状态" -ForegroundColor Yellow
try {
  $mp = Get-MpPreference -ErrorAction SilentlyContinue
  Write-Host ("  Defender 受控文件夹访问: {0}" -f $mp.EnableControlledFolderAccess)
  Write-Host ("  排除项: {0}" -f ($mp.ExclusionPath -join '; '))
} catch {
  Write-Host "  无法读取 Defender 配置（非管理员或已卸载）"
}
try {
  $av = Get-CimInstance -Namespace "root\SecurityCenter2" -ClassName AntiVirusProduct -ErrorAction SilentlyContinue
  if ($av) { Write-Host ("  杀软: {0}" -f (($av | ForEach-Object { $_.displayName }) -join ', ')) }
  else { Write-Host "  未检测到第三方杀软（仅 Windows Defender）" }
} catch {
  Write-Host "  无法枚举杀软"
}

Write-Host "`n================ 诊断完成 ================" -ForegroundColor Cyan
Write-Host "请把以上输出（尤其[3][4][6]和 startup.log）截图/复制发给开发者。"
