<#
.SYNOPSIS
  Scaffold a new automation project in "n8n workflows/<Name>".

.DESCRIPTION
  Windows wrapper around scripts/new-project.mjs (the cross-platform implementation; macOS and
  Linux run that directly with node). Same parameters as before.

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
  [string]$ProjectsRoot
)

$ErrorActionPreference = 'Stop'
$nodeArgs = @((Join-Path $PSScriptRoot 'new-project.mjs'), '--name', $Name, '--client', $Client, '--purpose', $Purpose)
if ($DisplayName) { $nodeArgs += @('--display-name', $DisplayName) }
if ($NoWebsite) { $nodeArgs += '--no-website' }
if ($DryRun) { $nodeArgs += '--dry-run' }
if ($ProjectsRoot) { $nodeArgs += @('--projects-root', $ProjectsRoot) }
& node @nodeArgs
if ($LASTEXITCODE -ne 0) { throw "new-project failed (exit $LASTEXITCODE)" }
