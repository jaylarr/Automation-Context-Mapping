#!/usr/bin/env node
// Claude Code Stop hook: if this turn created or updated an n8n workflow via MCP but never wrote
// the exported JSON (n8n workflows/<slug>/workflows/NN-*.json) or a CHANGELOG, send the agent back
// once to export it (n8n-workflow-export) or to say why not. Never blocks twice in a row, and
// never fails the session.

import fs from 'node:fs'

const WORKFLOW_WRITE = /__(create_workflow_from_code|update_workflow)$/
const EXPORT_FILE = /workflows[\\/]\d{2}-[^\\/]+\.json$/i
const CHANGELOG = /CHANGELOG\.md$/i

function done(obj) {
  if (obj) process.stdout.write(JSON.stringify(obj))
  process.exit(0)
}

let raw = ''
process.stdin.setEncoding('utf8')
process.stdin.on('data', (c) => (raw += c))
process.stdin.on('end', () => {
  let data
  try {
    data = JSON.parse(raw)
  } catch {
    return done()
  }
  if (data.stop_hook_active || !data.transcript_path) return done()

  let lines
  try {
    lines = fs.readFileSync(data.transcript_path, 'utf8').split('\n')
  } catch {
    return done()
  }

  // Walk the transcript. Reset at each real user message so only the current turn counts.
  let wroteWorkflow = false
  let wroteExport = false
  let wroteChangelog = false
  for (const line of lines) {
    if (!line.trim()) continue
    let entry
    try {
      entry = JSON.parse(line)
    } catch {
      continue
    }
    const content = entry?.message?.content
    if (entry.type === 'user') {
      const isToolResult = Array.isArray(content) && content.some((b) => b?.type === 'tool_result')
      if (!isToolResult && !entry.isMeta) {
        wroteWorkflow = wroteExport = wroteChangelog = false
      }
      continue
    }
    if (entry.type !== 'assistant' || !Array.isArray(content)) continue
    for (const block of content) {
      if (block?.type !== 'tool_use') continue
      const name = String(block.name || '')
      const input = block.input || {}
      if (WORKFLOW_WRITE.test(name)) {
        wroteWorkflow = true
        wroteExport = wroteChangelog = false // an export must come after the latest change
        continue
      }
      const target = String(input.file_path || input.path || '')
      const command = String(input.command || '')
      // scripts/export-workflow.mjs writes both the JSON and the CHANGELOG line
      if (/export-workflow\.mjs/.test(command) && !/--dry-run/.test(command)) wroteExport = wroteChangelog = true
      if (EXPORT_FILE.test(target) || /workflows[\\/]\d{2}-[^\s"']+\.json/i.test(command)) wroteExport = true
      if (CHANGELOG.test(target) || /CHANGELOG\.md/i.test(command)) wroteChangelog = true
    }
  }

  if (!wroteWorkflow || (wroteExport && wroteChangelog)) return done()

  const missing = [!wroteExport && 'the exported JSON', !wroteChangelog && 'the CHANGELOG entry'].filter(Boolean)
  done({
    decision: 'block',
    reason: `[workspace rule] This turn created or updated an n8n workflow, but ${missing.join(' and ')} ${missing.length > 1 ? 'were' : 'was'} not written. If the change is being kept, export it now with the n8n-workflow-export skill (JSON + CHANGELOG + docs). If it's a throwaway or still in progress, say so in one line and stop.`,
  })
})
