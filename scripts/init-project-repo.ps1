<#
.SYNOPSIS
  Give a project folder its own private git repo ("n8n workflows/<Name>/.git").

.DESCRIPTION
  The workspace repo is public and ignores "n8n workflows/*", so each project is versioned in its
  own repo. This writes a project .gitignore and runs "git init". It never commits, adds a remote,
  or pushes: commits need the owner's OK (AGENTS.md), and a remote must be a PRIVATE repo.
  Safe to re-run: an existing repo or .gitignore is left alone.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts/init-project-repo.ps1 -Name acme-lead-intake
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$Name,
  [string]$ProjectsRoot
)

$ErrorActionPreference = 'Stop'

$repo = Split-Path -Parent $PSScriptRoot
if (-not $ProjectsRoot) { $ProjectsRoot = Join-Path $repo 'n8n workflows' }
$dest = Join-Path $ProjectsRoot $Name
if (-not (Test-Path $dest)) { throw "Project not found: $dest" }

$ignore = Join-Path $dest '.gitignore'
if (-not (Test-Path $ignore)) {
  $content = @'
# Private project repo. Never commit secrets or real client data.
.env
.env.*
!.env.example
*.pem
*.key
credentials*.json
!**/credentials*.example.json

# Client files too sensitive for git (customer records, contracts): keep them out of the repo
client-brief/files/private/

# Raw n8n downloads (sanitize into NN-<slug>.json first)
*.raw.json

# Website builds
node_modules/
dist/
build/
.next/
.vercel/

# OS / editor
.DS_Store
Thumbs.db
desktop.ini
*.log
'@
  [System.IO.File]::WriteAllText($ignore, $content, (New-Object System.Text.UTF8Encoding $false))
  Write-Host "Wrote $ignore"
}

if (Test-Path (Join-Path $dest '.git')) {
  Write-Host "Already a git repo: $dest"
} else {
  git -C $dest init -b main | Out-Null
  Write-Host "Initialized private repo: $dest"
}
Write-Host "Next: first commit '$($Name): initial import' (with the owner's OK). Remote, if any: a PRIVATE repo only."
