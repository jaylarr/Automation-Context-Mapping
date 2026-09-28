<#
.SYNOPSIS
  Link .agents/skills and .claude/skills to Skills/ so agents auto-discover the skills.

.DESCRIPTION
  Windows wrapper around scripts/link-skills.mjs (the cross-platform implementation). Safe to re-run.
#>
$ErrorActionPreference = 'Stop'
& node (Join-Path $PSScriptRoot 'link-skills.mjs')
if ($LASTEXITCODE -ne 0) { throw "link-skills failed (exit $LASTEXITCODE)" }
