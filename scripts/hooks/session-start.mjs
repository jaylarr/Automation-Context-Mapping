#!/usr/bin/env node
// Claude Code SessionStart hook: injects the workspace rules + skill router into every session
// started in this workspace, so they apply even before anyone opens AGENTS.md.
// Prints JSON on stdout; never fails the session (errors fall back to a minimal message).

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = process.env.CLAUDE_PROJECT_DIR || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')

function projects() {
  try {
    const dir = path.join(root, 'n8n workflows')
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isDirectory() && !d.name.startsWith('_') && !d.name.startsWith('.'))
      .map((d) => {
        // "slug (status)" from the README info table; "archived" when the marker file exists
        let status = ''
        try {
          const readme = fs.readFileSync(path.join(dir, d.name, 'README.md'), 'utf8')
          status = readme.match(/^\|\s*\*{0,2}(?:Status|Stage)\*{0,2}\s*\|\s*`?([a-z]+)`?\s*\|/im)?.[1] ?? ''
        } catch {}
        const archived = fs.existsSync(path.join(dir, d.name, '.archived')) ? ', archived' : ''
        return status || archived ? `${d.name} (${status || '?'}${archived})` : d.name
      })
  } catch {
    return []
  }
}

const list = projects()

// Owner-specific facts (name, credential names, instance URLs) stay local: AGENTS.local.md is gitignored.
let local = ''
try {
  local = fs.readFileSync(path.join(root, 'AGENTS.local.md'), 'utf8').trim()
} catch {}
// Kept short on purpose: AGENTS.md (loaded through CLAUDE.md) is the only full copy of the rules.
// This adds what AGENTS.md can't know: the live project list and the owner's local facts.
const context = `# Automation workspace (session start)

The rules are in AGENTS.md (§0 checklist). If it isn't in your context, read it now. Three reminders:
- Load the matching skill (Skills/INDEX.md, router \`using-n8n-skills-official\`) before any n8n action.
- Ask the owner before anything outward: publishing, production runs, client systems, commits, pushes.
- A kept workflow change is exported with \`node scripts/export-workflow.mjs\` (skill \`n8n-workflow-export\`).

Projects (status): ${list.length ? list.join(', ') : '(none yet)'}${local ? `

${local}` : ''}`

process.stdout.write(
  JSON.stringify({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: context } }),
)
