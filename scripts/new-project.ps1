<#
.SYNOPSIS
  Scaffold a new automation project in "n8n workflows/<Name>".

.DESCRIPTION
  Copies the folder skeleton from "n8n workflows/_template", fills in the doc templates from
  "Documentation/templates" (replacing {{PLACEHOLDERS}}), and adds a row to the project registry.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts/new-project.ps1 -Name acme-lead-intake -Client "Acme Co"

.EXAMPLE
  # Preview only - nothing is written
  powershell -ExecutionPolicy Bypass -File scripts/new-project.ps1 -Name acme-lead-intake -Client "Acme Co" -DryRun
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$Name,
  [string]$Client = "TODO",
  [string]$Purpose = "TODO: one-line purpose",
  [string]$DisplayName,
  [switch]$NoWebsite,
  [switch]$DryRun,
  # Override the destination root (used for testing). Defaults to "<repo>/n8n workflows".
  [string]$ProjectsRoot
)

$ErrorActionPreference = 'Stop'

if ($Name -notmatch '^[a-z0-9]+(-[a-z0-9]+)*$' -or $Name.Length -gt 40) {
  throw "Name must be kebab-case (lowercase letters, digits, single hyphens), max 40 chars. Got: '$Name'"
}

$repo      = Split-Path -Parent $PSScriptRoot
$templates = Join-Path $repo 'Documentation\templates'
$skeleton  = Join-Path $repo 'n8n workflows\_template'
if (-not $ProjectsRoot) { $ProjectsRoot = Join-Path $repo 'n8n workflows' }
$dest      = Join-Path $ProjectsRoot $Name
$registry  = Join-Path $repo 'n8n workflows\REGISTRY.md'  # local-only, gitignored

if (Test-Path $dest) { throw "Project already exists: $dest" }
if (-not $DisplayName) {
  $DisplayName = (($Name -split '-') | ForEach-Object { $_.Substring(0,1).ToUpper() + $_.Substring(1) }) -join ' '
}
$today = Get-Date -Format 'yyyy-MM-dd'

$tokens = @{
  '{{PROJECT_SLUG}}'       = $Name
  '{{PROJECT_SLUG_SNAKE}}' = $Name -replace '-', '_'
  '{{PROJECT_NAME}}'       = $DisplayName
  '{{CLIENT}}'             = $Client
  '{{ONE_LINE_PURPOSE}}'   = $Purpose
  '{{DATE}}'               = $today
}

# template file -> destination path (relative to project root)
$files = [ordered]@{
  'project-README.md' = 'README.md'
  'project-AGENTS.md' = 'AGENTS.md'
  'architecture.md'   = 'documentation\architecture.md'
  'CHANGELOG.md'      = 'documentation\CHANGELOG.md'
  'decision-log.md'   = 'documentation\decisions.md'
  'handover-sop.md'   = 'documentation\handover-sop.md'
}

Write-Host "Project : $DisplayName ($Name)"
Write-Host "Client  : $Client"
Write-Host "Target  : $dest"
if ($DryRun) {
  Write-Host "`n[DryRun] Would copy skeleton from: $skeleton"
  $files.GetEnumerator() | ForEach-Object { Write-Host "[DryRun] Would write: $($_.Value)  (from templates/$($_.Key))" }
  if ($NoWebsite) { Write-Host "[DryRun] Would remove: website\" }
  Write-Host "[DryRun] Would add a row to: $registry"
  return
}

# 1. Folder skeleton
Copy-Item -Path $skeleton -Destination $dest -Recurse
Remove-Item (Join-Path $dest 'TEMPLATE-README.md') -ErrorAction SilentlyContinue
if ($NoWebsite) { Remove-Item (Join-Path $dest 'website') -Recurse -Force }

# 2. Docs from templates, with placeholders filled
foreach ($entry in $files.GetEnumerator()) {
  $content = Get-Content -Raw -Encoding UTF8 (Join-Path $templates $entry.Key)
  foreach ($t in $tokens.GetEnumerator()) { $content = $content.Replace($t.Key, $t.Value) }
  $out = Join-Path $dest $entry.Value
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $out) | Out-Null
  [System.IO.File]::WriteAllText($out, $content, (New-Object System.Text.UTF8Encoding $false))
}

# 3. Registry row (only when creating inside the real projects root)
if ((Resolve-Path $ProjectsRoot).Path -eq (Resolve-Path (Join-Path $repo 'n8n workflows')).Path) {
  if (-not (Test-Path $registry)) {
    $header = "# Automation Projects — Registry (local only, gitignored)`n`n| Project | Client | Status | Started | Purpose |`n|---|---|---|---|---|"
    [System.IO.File]::WriteAllText($registry, "$header`n", (New-Object System.Text.UTF8Encoding $false))
  }
  $row = "| [$Name]($Name/README.md) | $Client | ``discovery`` | $today | $Purpose |"
  Add-Content -Path $registry -Value $row -Encoding UTF8
}

Write-Host "`nCreated $dest"
Write-Host "Next: fill in AGENTS.md (instances, credentials), then write specs in documentation\spec\."
