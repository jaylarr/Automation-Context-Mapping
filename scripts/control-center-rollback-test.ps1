# Exercise the real Windows update control flow with disposable pointers and fake service callbacks.
# No scheduled tasks, listeners, n8n calls or real app-state files are used.
$ErrorActionPreference = 'Stop'
$fixtureRoot = Join-Path ([IO.Path]::GetTempPath()) ('cc-rollback-' + [guid]::NewGuid())
$dataDir = $fixtureRoot
New-Item -ItemType Directory -Path $fixtureRoot | Out-Null
$source = Join-Path $PSScriptRoot 'control-center.ps1'
$tokens = $null; $parseErrors = $null
$ast = [System.Management.Automation.Language.Parser]::ParseFile($source,[ref]$tokens,[ref]$parseErrors)
if ($parseErrors.Count) { throw 'Service script did not parse.' }
$function = $ast.Find({param($node) $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq 'Update-Server'},$true)
Invoke-Expression $function.Extent.Text
$script:pointer = 'previous-fixture'
$script:starts = @()
$script:verified = @()
function Say([string]$message) {}
function Write-MaintenanceStatus([string]$state,[string]$message) {}
function Stop-Server {}
function Start-Server { $script:starts += $script:pointer }
function Wait-Up([string]$release = '') { $script:verified += $release; return $release -eq 'previous-fixture' }
function Invoke-Release([string]$operation) {
  switch ($operation) {
    'stage' { Set-Content -LiteralPath (Join-Path $dataDir 'candidate-release.json') -Value '{"id":"candidate-fixture"}' }
    'activate' { Set-Content -LiteralPath (Join-Path $dataDir 'previous-release.json') -Value '{"id":"previous-fixture"}'; $script:pointer = 'candidate-fixture' }
    'rollback' { $script:pointer = 'previous-fixture' }
  }
}
try {
  $failure = ''
  try { Update-Server } catch { $failure = $_.Exception.Message }
  if ($failure -notmatch 'Update rolled back.*verified: True') { throw "Unexpected result: $failure" }
  if ($script:pointer -ne 'previous-fixture') { throw 'Previous pointer was not restored.' }
  if (($script:starts -join ',') -ne 'candidate-fixture,previous-fixture') { throw 'Expected candidate then previous starts.' }
  if (($script:verified -join ',') -ne 'candidate-fixture,previous-fixture') { throw 'Expected release-specific candidate then previous health checks.' }
  if (Test-Path -LiteralPath (Join-Path $dataDir 'maintenance.lock')) { throw 'Maintenance lock leaked.' }
  Write-Output 'Windows failed-candidate rollback control-flow fixture passed.'
} finally {
  $resolved = [IO.Path]::GetFullPath($fixtureRoot)
  $tempRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
  if (-not $resolved.StartsWith($tempRoot,[StringComparison]::OrdinalIgnoreCase) -or (Split-Path $resolved -Leaf) -notlike 'cc-rollback-*') { throw 'Unsafe fixture cleanup path.' }
  Remove-Item -LiteralPath $resolved -Recurse -Force
}
