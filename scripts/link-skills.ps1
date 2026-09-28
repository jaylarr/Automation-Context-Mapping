<#
.SYNOPSIS
  Create directory junctions so agents auto-discover the skills in Skills/.

.DESCRIPTION
  .agents/skills  -> Skills/   (Codex, Cursor, OpenCode, and other Agent Skills clients)
  .claude/skills  -> Skills/   (Claude Code)
  Junctions need no admin rights. Both paths are gitignored, so run this once per clone.
  Safe to re-run: existing junctions are left alone, and a real folder at a link path is never
  deleted.
#>
$ErrorActionPreference = 'Stop'
$repo   = Split-Path -Parent $PSScriptRoot
$target = Join-Path $repo 'Skills'

foreach ($rel in @('.agents\skills', '.claude\skills')) {
  $link = Join-Path $repo $rel
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $link) | Out-Null

  if (Test-Path $link) {
    $item = Get-Item $link -Force
    if ($item.LinkType -eq 'Junction' -or $item.LinkType -eq 'SymbolicLink') {
      Write-Host "OK      $rel -> $($item.Target)"
      continue
    }
    Write-Warning "$rel exists and is a real folder, not a link. Leaving it untouched. Move its contents into Skills\ and delete it, then re-run."
    continue
  }

  New-Item -ItemType Junction -Path $link -Target $target | Out-Null
  Write-Host "Created $rel -> $target"
}

$count = (Get-ChildItem $target -Directory | Where-Object { Test-Path (Join-Path $_.FullName 'SKILL.md') }).Count
Write-Host "$count skills available."
