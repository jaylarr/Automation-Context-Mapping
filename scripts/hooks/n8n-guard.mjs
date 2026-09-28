#!/usr/bin/env node
// Claude Code PreToolUse hook for n8n MCP write/run tools.
// Adds a just-in-time reminder of the matching workspace rule. It never blocks: the normal
// permission prompt still decides, and publishing still needs the owner's OK per AGENTS.md.

let raw = ''
process.stdin.setEncoding('utf8')
process.stdin.on('data', (c) => (raw += c))
process.stdin.on('end', () => {
  let tool = ''
  try {
    tool = String(JSON.parse(raw).tool_name || '')
  } catch {
    /* unreadable input: fall through to the generic reminder */
  }
  const name = tool.split('__').pop()

  const REMINDERS = {
    create_workflow_from_code:
      'Before creating: for a new project, the n8n-project-sizing estimate was shown and the owner chose one workflow vs several; the relevant skills are loaded (n8n-workflow-sections, lifecycle, node-configuration, expressions, error-handling), the code has numbered sticky() sections (01 — VERB + VERB …) wrapping every node, validate_workflow passed, and the name follows "[project-slug] Verb object" with a 1–2 sentence description. After creating: call get_workflow_details, check the connections object and that every node sits inside its section sticky (fix with setNodePosition / sticky width+height), then export with the n8n-workflow-export skill.',
    update_workflow:
      'Before updating: validate_workflow passed on the new code; added or changed nodes sit inside a section sticky whose text still matches (n8n-workflow-sections). After updating: get_workflow_details to verify connections, then re-export with the n8n-workflow-export skill and add a CHANGELOG entry.',
    publish_workflow:
      'Publishing makes this workflow live. Only proceed if the owner explicitly approved publishing THIS workflow in this conversation, the pre-publish checklist is done (validate → verify connections → test), and an error workflow is set. Otherwise stop and ask.',
    unpublish_workflow: 'Unpublishing stops a live workflow. Confirm the owner asked for it.',
    archive_workflow: 'Archiving removes a workflow from use. Confirm the owner asked for it.',
    test_workflow:
      'test_workflow only pins triggers, credentialed nodes and HTTP Request. Code, Data Tables, sub-workflow calls, etc. run for real. If any unpinned node has side effects, ask the owner first. Afterwards, tell the owner which nodes were pinned.',
    execute_workflow:
      'execute_workflow runs for real. Use executionMode "manual" for tests, and "production" only with the owner\'s explicit OK. Confirm there are no unintended side effects.',
  }

  const context =
    REMINDERS[name] ||
    'n8n write action: make sure the matching skill is loaded (Skills/INDEX.md) and the workspace rules in AGENTS.md are followed.'

  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: { hookEventName: 'PreToolUse', additionalContext: `[workspace rule] ${context}` },
    }),
  )
})
