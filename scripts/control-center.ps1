<# Control Center login service. Releases include their own dependencies and builds. #>
param(
  [Parameter(Position = 0)]
  [ValidateSet('install','update','start','stop','restart','status','logs','open','uninstall','run')]
  [string]$Action = 'status'
)
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$app = Join-Path $repo 'app'
$dataDir = Join-Path $app 'data'
$taskName = 'Automation Control Center'
$url = 'http://127.0.0.1:3100'
$runtime = Join-Path $PSScriptRoot 'control-center-runtime.mjs'
$releaseScript = Join-Path $PSScriptRoot 'control-center-release.mjs'
New-Item -ItemType Directory -Force -Path $dataDir | Out-Null
function Say([string]$message) { Write-Host "$(Get-Date -Format s) $message" }
$statusFile = Join-Path $dataDir 'maintenance-status.json'
$statusStart = [DateTime]::UtcNow.ToString('o')
function Write-MaintenanceStatus([string]$state, [string]$message) {
  $record = @{ action = $Action; state = $state; startedAt = $statusStart; message = $message }
  if ($state -ne 'running') { $record.finishedAt = [DateTime]::UtcNow.ToString('o') }
  $temp = "$statusFile.$PID.tmp"
  $backup = "$statusFile.$PID.bak"
  try {
    [IO.File]::WriteAllText($temp, ($record | ConvertTo-Json), [Text.UTF8Encoding]::new($false))
    # Windows PowerShell converts a null string argument to an empty path.
    # Give File.Replace a real backup path, then remove only this write's temporary files.
    if (Test-Path -LiteralPath $statusFile) { [IO.File]::Replace($temp, $statusFile, $backup) } else { [IO.File]::Move($temp, $statusFile) }
  } finally {
    Remove-Item -LiteralPath $temp, $backup -Force -ErrorAction SilentlyContinue
  }
}
function Test-Up([string]$release = '') {
  try {
    $health = Invoke-RestMethod -Uri "$url/api/health" -TimeoutSec 3
    return $health.ok -and (-not $release -or $health.releaseId -eq $release)
  } catch { return $false }
}
function Wait-Up([string]$release = '') {
  for ($i = 0; $i -lt 45; $i++) { if (Test-Up $release) { return $true }; Start-Sleep -Seconds 1 }
  return $false
}
function Start-Server {
  if (Test-Up) { return }
  if (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue) { Start-ScheduledTask -TaskName $taskName }
  else { Start-Process -FilePath 'powershell.exe' -WindowStyle Hidden -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-File',"`"$PSCommandPath`"",'run') }
}
function Stop-Server {
  $runtimeLock = Join-Path $dataDir 'runtime.lock'
  if (-not (Test-Path -LiteralPath $runtimeLock)) {
    if (Test-Up) { throw 'The legacy server is running. Stop its old supervisor once before installing the release runtime. No arbitrary port listener was killed.' }
    return
  }
  Set-Content -LiteralPath (Join-Path $dataDir 'stop.flag') -Value 'stop'
  for ($i = 0; $i -lt 45; $i++) {
    if (-not (Test-Path -LiteralPath $runtimeLock)) { return }
    Start-Sleep -Seconds 1
  }
  throw 'The owned runtime did not stop. Inspect runtime.lock and server.log; no other process was killed.'
}
function Invoke-Release([string]$operation) {
  & node $releaseScript $operation
  if ($LASTEXITCODE -ne 0) { throw "Release $operation failed." }
}
function Update-Server {
  $lock = Join-Path $dataDir 'maintenance.lock'
  $stream = [IO.File]::Open($lock, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::Read)
  try {
    $bytes = [Text.Encoding]::UTF8.GetBytes([string]$PID)
    $stream.Write($bytes, 0, $bytes.Length)
    $stream.Flush()
    Write-MaintenanceStatus 'running' 'Installing dependencies and checking the isolated candidate.'
    Invoke-Release 'stage'
    $candidate = Get-Content -LiteralPath (Join-Path $dataDir 'candidate-release.json') -Raw | ConvertFrom-Json
    $stopped = $false
    $activated = $false
    try {
      Stop-Server
      $stopped = $true
      Invoke-Release 'activate'
      $activated = $true
      Start-Server
      Write-MaintenanceStatus 'running' 'Checking the new release health.'
      if (-not (Wait-Up $candidate.id)) { throw 'Candidate failed release-specific health verification.' }
      Say "Update complete. Running release $($candidate.id) at $url"
    } catch {
      $failure = $_.Exception.Message
      if ($stopped) {
        Stop-Server
        if ($activated) { Invoke-Release 'rollback' }
        Start-Server
        $expected = if ($activated) { (Get-Content -LiteralPath (Join-Path $dataDir 'previous-release.json') -Raw | ConvertFrom-Json).id } else { '' }
        $verified = Wait-Up $expected
        throw "$failure Update rolled back. Previous release health verified: $verified. Inspect server.log."
      }
      throw
    }
  } finally { $stream.Dispose(); Remove-Item -LiteralPath $lock -Force }
}
try {
if ($Action -eq 'restart') { Write-MaintenanceStatus 'running' 'Restarting the owned Control Center runtime.' }
switch ($Action) {
  'run' { & node $runtime; exit $LASTEXITCODE }
  'install' {
    Update-Server
    $taskAction = New-ScheduledTaskAction -Execute 'conhost.exe' -Argument "--headless powershell.exe -NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`" run" -WorkingDirectory $app
    $trigger = New-ScheduledTaskTrigger -AtLogOn -User "$env:USERDOMAIN\$env:USERNAME"
    $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew -StartWhenAvailable
    $principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited
    Register-ScheduledTask -TaskName $taskName -Action $taskAction -Trigger $trigger -Settings $settings -Principal $principal -Force | Out-Null
    Say "Running at $url"
  }
  'update' { Update-Server }
  'start' { Start-Server; if (-not (Wait-Up)) { throw 'Not answering yet.' }; Say "Running at $url" }
  'stop' { Stop-Server; Say 'Stopped.' }
  'restart' { Stop-Server; Start-Server; if (-not (Wait-Up)) { throw 'Not answering yet.' }; Say "Running at $url" }
  'status' { Write-Host "Answering: $(Test-Up)" }
  'logs' { Get-Content -LiteralPath (Join-Path $dataDir 'server.log') -Tail 60 -ErrorAction SilentlyContinue }
  'open' { Start-Process $url }
  'uninstall' { Stop-Server; Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue; Say 'Service removed; releases and data retained.' }
}
if ($Action -in @('update','install','restart')) { Write-MaintenanceStatus 'ok' 'Requested maintenance completed and health checked.' }
} catch {
  if ($Action -in @('update','install','restart')) { Write-MaintenanceStatus 'failed' $_.Exception.Message }
  throw
}
