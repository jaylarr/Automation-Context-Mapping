<#
.SYNOPSIS
  Run the Control Center (app/) as a background app that starts at Windows login.

.DESCRIPTION
  install    Install dependencies, build, register the login task, and start it now.
  update     Rebuild safely (after code changes or a git pull): the current version keeps running
             while the new one builds; then it swaps in. Rolls back automatically if it fails.
  start      Start the background server now.
  stop       Stop the background server.
  restart    Restart the server (about 1-2 seconds offline).
  status     Is the task registered? Is the server answering?
  logs       Show the last 60 lines of app/data/server.log.
  open       Open http://127.0.0.1:3100 in the browser.
  uninstall  Stop the server and remove the login task (the app files and data are kept).

  How it runs: the login task starts "run", a small supervisor loop that starts the server and
  restarts it whenever it exits. restart/update only stop the server process, and the supervisor
  brings it back (swapping in a new build first when one is pending). So they work the same
  from a terminal or from the app's Settings page.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts/control-center.ps1 install
#>
param(
  [Parameter(Position = 0)]
  [ValidateSet('install', 'update', 'start', 'stop', 'restart', 'status', 'logs', 'open', 'uninstall', 'run')]
  [string]$Action = 'status'
)

$ErrorActionPreference = 'Stop'
# Keep build output readable when this script's output is redirected to a log file.
try { [Console]::OutputEncoding = [Text.Encoding]::UTF8 } catch { }

$repo      = Split-Path -Parent $PSScriptRoot
$app       = Join-Path $repo 'app'
$dataDir   = Join-Path $app 'data'
$logFile   = Join-Path $dataDir 'server.log'
$stopFlag  = Join-Path $dataDir 'stop.flag'       # supervisor: exit instead of restarting
$swapFlag  = Join-Path $dataDir 'swap.pending'    # supervisor: swap .next-staging in before starting
$backFlag  = Join-Path $dataDir 'rollback.flag'   # supervisor: restore .next-old before starting
$lockFile  = Join-Path $dataDir 'maintenance.lock'
$taskName  = 'Automation Control Center'
$port      = 3100
$url       = "http://127.0.0.1:$port"

function Say([string]$msg) { Write-Host "$(Get-Date -Format s) $msg" }

function Test-Up {
  try { (Invoke-WebRequest -Uri "$url/api/health" -UseBasicParsing -TimeoutSec 3).StatusCode -eq 200 } catch { $false }
}

function Get-ServerPids {
  try {
    @(Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction Stop | Select-Object -ExpandProperty OwningProcess -Unique)
  } catch { @() }
}

function Wait-Up([int]$seconds = 45) {
  for ($i = 0; $i -lt $seconds; $i++) { if (Test-Up) { return $true }; Start-Sleep -Seconds 1 }
  $false
}

function Wait-Down([int]$seconds = 15) {
  for ($i = 0; $i -lt $seconds; $i++) { if (-not (Get-ServerPids).Count) { return $true }; Start-Sleep -Seconds 1 }
  $false
}

function Test-SupervisorRunning {
  $t = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
  if ($t -and $t.State -eq 'Running') { return $true }
  # Also detect a supervisor started without the task (hidden "run" process).
  $me = $PID
  [bool](Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.ProcessId -ne $me -and $_.CommandLine -match 'control-center\.ps1.*\srun(\s|$)' })
}

function Stop-NodeServer {
  $pids = Get-ServerPids
  foreach ($p in $pids) { Stop-Process -Id $p -Force -ErrorAction SilentlyContinue }
  $pids
}

function Invoke-Build([string]$distDir = '.next') {
  Push-Location $app
  try {
    if (-not (Test-Path 'node_modules')) {
      Say 'Installing dependencies...'
      npm install --no-audit --no-fund
      if ($LASTEXITCODE -ne 0) { throw 'npm install failed' }
    }
    if ($distDir -ne '.next') { Remove-Item $distDir -Recurse -Force -ErrorAction SilentlyContinue }
    $env:NEXT_DIST_DIR = $distDir
    try { npm run build; $code = $LASTEXITCODE } finally { Remove-Item Env:NEXT_DIST_DIR -ErrorAction SilentlyContinue }
    if ($code -ne 0) {
      if ($distDir -ne '.next') { Remove-Item $distDir -Recurse -Force -ErrorAction SilentlyContinue }
      throw 'Build failed. The running version was left untouched.'
    }
  } finally { Pop-Location }
}

function Rename-WithRetry([string]$from, [string]$to) {
  for ($i = 0; $i -lt 10; $i++) {
    try { Rename-Item -LiteralPath $from -NewName $to -ErrorAction Stop; return } catch { Start-Sleep -Milliseconds 500 }
  }
  throw "Could not rename $from to $to (files in use?)"
}

function Start-Supervisor {
  if (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue) {
    Start-ScheduledTask -TaskName $taskName
  } else {
    Start-Process -FilePath 'conhost.exe' -WindowStyle Hidden -ArgumentList @(
      '--headless', 'powershell.exe', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', "`"$PSCommandPath`"", 'run')
  }
}

function Start-Server {
  if (Test-Up) { Say "Already running at $url"; return }
  if (-not (Test-SupervisorRunning)) { Start-Supervisor }
  if (Wait-Up) { Say "Running at $url" } else { Write-Warning 'Not answering yet. Check: scripts/control-center.ps1 logs' }
}

function Stop-Server {
  New-Item -ItemType File -Force -Path $stopFlag | Out-Null
  $pids = Stop-NodeServer
  try { Stop-ScheduledTask -TaskName $taskName -ErrorAction Stop } catch { }
  Wait-Down | Out-Null
  Remove-Item $stopFlag -Force -ErrorAction SilentlyContinue
  if ($pids.Count) { Say "Stopped server (pid $($pids -join ', '))." } else { Say 'Server was not running.' }
}

function Restart-Server {
  if (-not (Test-SupervisorRunning)) { Say 'Supervisor not running; starting it.'; Start-Server; return }
  $pids = Stop-NodeServer
  Say "Stopped server (pid $($pids -join ', ')); the supervisor restarts it."
  if (Wait-Up) { Say "Running at $url" } else { Write-Warning 'Not answering yet. Check: scripts/control-center.ps1 logs' }
}

function Invoke-SafeUpdate {
  if (Test-Path $lockFile) {
    $owner = Get-Content $lockFile -ErrorAction SilentlyContinue
    if ($owner -and (Get-Process -Id $owner -ErrorAction SilentlyContinue)) { throw 'Another update is already running.' }
  }
  New-Item -ItemType Directory -Force -Path $dataDir | Out-Null
  Set-Content -Path $lockFile -Value $PID
  try {
    Say 'Building the new version (the current one keeps running)...'
    Invoke-Build '.next-staging'
    Say 'Build OK. Switching to the new version...'

    if (-not (Test-SupervisorRunning)) {
      # No supervisor (e.g. the app isn't running): swap directly, then start it.
      Push-Location $app
      try {
        Remove-Item '.next-old' -Recurse -Force -ErrorAction SilentlyContinue
        if (Test-Path '.next') { Rename-WithRetry '.next' '.next-old' }
        Rename-WithRetry '.next-staging' '.next'
        Remove-Item '.next-old' -Recurse -Force -ErrorAction SilentlyContinue
      } finally { Pop-Location }
      Start-Server
      Say 'Update complete.'
      return
    }

    New-Item -ItemType File -Force -Path $swapFlag | Out-Null
    Stop-NodeServer | Out-Null
    Wait-Down | Out-Null
    if (Wait-Up 60) {
      Remove-Item (Join-Path $app '.next-old') -Recurse -Force -ErrorAction SilentlyContinue
      Say "Running at $url"
      Say 'Update complete.'
    } else {
      Write-Warning 'The new version did not come up. Rolling back...'
      New-Item -ItemType File -Force -Path $backFlag | Out-Null
      Stop-NodeServer | Out-Null
      Wait-Down | Out-Null
      if (Wait-Up 60) { Say 'Update rolled back: the previous version is running again. See data/server.log.' }
      else { Say 'Update rolled back, but the app is not answering yet. See data/server.log.' }
    }
  } finally {
    Remove-Item $lockFile -Force -ErrorAction SilentlyContinue
  }
}

switch ($Action) {
  # ------------------------------------------------------------------ run: the supervisor (login task)
  'run' {
    if ((Get-ServerPids).Count) { exit 0 }   # a server is already up
    Set-Location $app
    New-Item -ItemType Directory -Force -Path $dataDir | Out-Null
    Remove-Item $stopFlag -Force -ErrorAction SilentlyContinue
    $fastFails = 0
    while ($true) {
      if ((Test-Path $logFile) -and (Get-Item $logFile).Length -gt 5MB) { Move-Item $logFile "$logFile.1" -Force }
      $note = { param($m) [IO.File]::AppendAllText($logFile, "`r`n===== $(Get-Date -Format s) $m =====`r`n") }

      if (Test-Path $backFlag) {
        Remove-Item $backFlag -Force
        if (Test-Path '.next-old') {
          Remove-Item '.next' -Recurse -Force -ErrorAction SilentlyContinue
          Rename-WithRetry '.next-old' '.next'
          & $note 'rolled back to the previous version'
        }
      } elseif ((Test-Path $swapFlag) -and (Test-Path '.next-staging\BUILD_ID')) {
        Remove-Item $swapFlag -Force
        Remove-Item '.next-old' -Recurse -Force -ErrorAction SilentlyContinue
        if (Test-Path '.next') { Rename-WithRetry '.next' '.next-old' }
        Rename-WithRetry '.next-staging' '.next'
        & $note 'switched to the new version'
      }
      if (-not (Test-Path '.next\BUILD_ID')) { cmd /c "npm run build >> data\server.log 2>&1" }

      & $note 'starting Control Center'
      $started = Get-Date
      cmd /c "node node_modules\next\dist\bin\next start -H 127.0.0.1 -p $port >> data\server.log 2>&1"

      if (Test-Path $stopFlag) { Remove-Item $stopFlag -Force; & $note 'stopped'; break }
      # Crash-loop protection: back off, and give up after 5 quick failures in a row.
      if (((Get-Date) - $started).TotalSeconds -lt 15) { $fastFails++ } else { $fastFails = 0 }
      if ($fastFails -ge 5) { & $note 'crashed 5 times in a row; giving up (see errors above)'; exit 1 }
      Start-Sleep -Seconds ([Math]::Min(20, [Math]::Max(1, 3 * $fastFails)))
    }
    exit 0
  }

  # ------------------------------------------------------------------ install
  'install' {
    if (-not (Test-Path (Join-Path $app '.env.local'))) {
      Write-Warning 'app/.env.local not found. You can set the n8n connection later on the Settings page.'
    }
    Stop-Server | Out-Null
    Invoke-Build '.next'

    $taskAction = New-ScheduledTaskAction -Execute 'conhost.exe' `
      -Argument "--headless powershell.exe -NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`" run" `
      -WorkingDirectory $app
    $trigger = New-ScheduledTaskTrigger -AtLogOn -User "$env:USERDOMAIN\$env:USERNAME"
    $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
      -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) `
      -MultipleInstances IgnoreNew -StartWhenAvailable
    $principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited
    Register-ScheduledTask -TaskName $taskName -Action $taskAction -Trigger $trigger -Settings $settings -Principal $principal `
      -Description 'Starts the Automation Control Center (local Next.js app) at login.' -Force | Out-Null
    Say "Registered login task '$taskName'."

    Start-Server
    Write-Host ''
    Write-Host "Done. Open $url and click 'Install' in the Chrome/Edge address bar to get an app window."
  }

  'update'    { Invoke-SafeUpdate }
  'start'     { Start-Server }
  'stop'      { Stop-Server }
  'restart'   { Restart-Server }
  'open'      { Start-Process $url }

  'logs' {
    if (Test-Path $logFile) { Get-Content $logFile -Tail 60 -Encoding UTF8 } else { Write-Host 'No log yet.' }
  }

  'status' {
    $task = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
    Write-Host ("Login task : " + $(if ($task) { "registered ($($task.State))" } else { 'not installed' }))
    Write-Host ("Server     : " + $(if (Test-Up) { "running at $url" } else { 'not running' }))
    Write-Host ("Build      : " + $(if (Test-Path (Join-Path $app '.next\BUILD_ID')) { 'present' } else { 'missing (run install or update)' }))
  }

  'uninstall' {
    Stop-Server | Out-Null
    if (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue) {
      Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
      Say "Removed login task '$taskName'."
    } else { Say 'Login task was not installed.' }
    Say 'App files and data (app/data) were kept.'
  }
}
