#!/usr/bin/env node
// Claude Code PreToolUse hook for n8n MCP write/run tools.
// Adds a just-in-time reminder of the matching workspace rule. For outward or destructive actions
// (publish, unpublish, archive, production runs, restores, Data Table deletes) it also forces a
// permission prompt, even if the tool was allowed earlier, so the owner's OK is always explicit.

let raw = ''
process.stdin.setEncoding('utf8')
process.stdin.on('data', (c) => (raw += c))
process.stdin.on('end', () => {
  let tool = ''
  let input = {}
  try {
    const data = JSON.parse(raw)
    tool = String(data.tool_name || '')
    input = data.tool_input || {}
  } catch {
    /* unreadable input: fall through to the generic reminder */
  }
  const name = tool.split('__').pop()

  const REMINDERS = {
    create_workflow_from_code:
      'Before creating: the workflow has a spec (documentation/spec/, the Quick spec is enough); for a new project, the n8n-project-sizing estimate was shown and the owner chose one workflow vs several; the relevant skills are loaded (n8n-workflow-sections, lifecycle, node-configuration, expressions, error-handling), the code has numbered sticky() sections (01 — VERB + VERB …) wrapping every node, validate_workflow passed, and the name follows "[project-slug] Verb object" with a 1–2 sentence description. After creating: call get_workflow_details, check the connections object and that every node sits inside its section sticky (fix with setNodePosition / sticky width+height), then export with the n8n-workflow-export skill.',
    update_workflow:
      'Before updating: validate_workflow passed on the new code; added or changed nodes sit inside a section sticky whose text still matches (n8n-workflow-sections). Single instance: if this workflow is PUBLISHED, this update changes live behavior, so the owner must have OK\'d it. After updating: get_workflow_details to verify connections, then re-export with the n8n-workflow-export skill and add a CHANGELOG entry.',
    publish_workflow:
      'Publishing makes this workflow live. Only proceed if the owner explicitly approved publishing THIS workflow in this conversation, the pre-publish checklist is done (validate → verify connections → test), and an error workflow is set. Otherwise stop and ask.',
    unpublish_workflow: 'Unpublishing stops a live workflow. Confirm the owner asked for it.',
    archive_workflow: 'Archiving removes a workflow from use. Confirm the owner asked for it.',
    restore_workflow_version:
      'Restoring replaces the current workflow version. Confirm the owner asked for it, then re-export.',
    test_workflow:
      'test_workflow only pins triggers, credentialed nodes and HTTP Request. Code, Data Tables, sub-workflow calls, etc. run for real. If any unpinned node has side effects, ask the owner first. Afterwards, tell the owner which nodes were pinned.',
    execute_workflow:
      'execute_workflow runs for real. Use executionMode "manual" for tests, and "production" only with the owner\'s explicit OK. Confirm there are no unintended side effects.',
    create_data_table:
      'Creating a Data Table: name it <project_slug_snake>_<purpose>, confirm it belongs to the current project, and record its ID in the project AGENTS.md (n8n-data-tables-official).',
    add_data_table_column: 'Changing a Data Table schema: update the project AGENTS.md / architecture.md in the same change.',
    rename_data_table: 'Renaming a Data Table can break workflows that reference it by name. Check callers first.',
    rename_data_table_column: 'Renaming a column breaks every node that maps it. Check callers first.',
    add_data_table_rows: 'Writing rows is a real side effect. Test data only, unless the owner asked for real rows.',
    delete_data_table_column: 'Deleting a column permanently drops its data. Confirm the owner asked for it.',
  }

  // Always force an explicit owner OK for these (a remembered "allow" doesn't count).
  const ALWAYS_ASK = new Set([
    'publish_workflow',
    'unpublish_workflow',
    'archive_workflow',
    'restore_workflow_version',
    'delete_data_table_column',
  ])
  const ask = ALWAYS_ASK.has(name) || (name === 'execute_workflow' && input.executionMode === 'production')

  const context =
    REMINDERS[name] ||
    'n8n write action: make sure the matching skill is loaded (Skills/INDEX.md) and the workspace rules in AGENTS.md are followed.'

  const out = { hookEventName: 'PreToolUse', additionalContext: `[workspace rule] ${context}` }
  if (ask) {
    out.permissionDecision = 'ask'
    out.permissionDecisionReason = `Workspace rule: "${name}" is an outward or destructive n8n action and needs the owner's explicit OK.`
  }
  process.stdout.write(JSON.stringify({ hookSpecificOutput: out }))
})
