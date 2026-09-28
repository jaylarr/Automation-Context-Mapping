<#
.SYNOPSIS
  Give a project its own private git repo (.gitignore + git init). Never commits or pushes.

.DESCRIPTION
  Windows wrapper around scripts/init-project-repo.mjs (the cross-platform implementation).

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts/init-project-repo.ps1 -Name acme-lead-intake
#>
param(
  [Parameter(Mandatory = $true)][string]$Name,
  [string]$ProjectsRoot
)

$ErrorActionPreference = 'Stop'
$nodeArgs = @((Join-Path $PSScriptRoot 'init-project-repo.mjs'), '--name', $Name)
if ($ProjectsRoot) { $nodeArgs += @('--projects-root', $ProjectsRoot) }
& node @nodeArgs
if ($LASTEXITCODE -ne 0) { throw "init-project-repo failed (exit $LASTEXITCODE)" }
