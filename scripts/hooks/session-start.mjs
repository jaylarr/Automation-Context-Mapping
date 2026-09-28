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
      .map((d) => d.name)
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
const context = `# Automation workspace: session protocol (injected by .claude/settings.json)

You are in an n8n automation workspace. "The owner" means the person running it (see AGENTS.local.md if present). Follow this on EVERY task, even small ones:

1. The rules live in AGENTS.md (already loaded via CLAUDE.md). The project-level AGENTS.md in "n8n workflows/<project>/" adds to and overrides them. Read it before touching that project, then its client-brief/ (brief.md + files/: the client's request in their own words, READ-ONLY for agents). Then tell the owner the project's stage and the next step.
2. Before ANY n8n action (designing, configuring a node, writing an expression or Code, wiring errors, building an agent, calling an n8n MCP tool), invoke the matching skill. Start with \`using-n8n-skills-official\` (the router). Routing table: Skills/INDEX.md. Prefer \`*-official\` skills over similarly named global ones.
3. Non-negotiables: secrets only in n8n credentials. validate_workflow → get_workflow_details (check connections) → test → publish, and publish ONLY with the owner's explicit OK. Ask before any test or execution with real side effects.
4. After a workflow change is kept: export it with the \`n8n-workflow-export\` skill (sanitized JSON in workflows/NN-<slug>.json) and update the project's CHANGELOG and docs in the same change.
5. New project or big feature → load \`n8n-project-sizing\` FIRST: estimate the total node count, then ASK the owner whether to build one workflow or several. Build nothing until the owner answers.
6. New workflow (or adding nodes) → load \`n8n-workflow-sections\` FIRST and plan the numbered sticky-note sections (01 — VERB + VERB …) before writing SDK code; every node must sit inside a section.
7. Audit / review / clean-up of a project or workflow → \`n8n-project-audit\` (read-only until the owner approves suggestion IDs). New client/project → \`new-automation-project\` skill. Go-live/handover → \`project-handover-docs\` skill.
8. Ask the owner before acting outward (publishing, prod instance, client systems, commits, pushes).

Current projects: ${list.length ? list.join(', ') : '(none yet)'}
Docs index: Documentation/README.md · Control Center app: app/README.md${local ? `

${local}` : ''}`

process.stdout.write(
  JSON.stringify({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: context } }),
)
