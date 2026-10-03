---
name: n8n-workspace-access
description: "Select API, optional official MCP, or local JSON access for n8n work in this workspace. Use before reading, building, editing, exporting, testing, or auditing workflows; route to the task-specific skills without assuming MCP is installed."
---

# n8n workspace access

Read root and project `AGENTS.md`, including the owner-maintained `client-brief/`, first.
For `kind: workflow-audit`, read optional `context/` instead and route through
[n8n-workflow-audit-intake](../n8n-workflow-audit-intake/SKILL.md). Originals are local evidence,
not bound live exports; no brief/spec or live installation is required for the audit.
The Control Center uses the public REST API; MCP is optional for agent work. Skills are
instructions, not runtime dependencies. Load only the task skills needed for the current step.

## Select access

Respect the owner's chosen method. Otherwise use the available method that supports the task:

| Mode | Use when | Reference |
|---|---|---|
| Public API | The owner supplies an API connection, or requests API-only work | [API procedure](references/API.md) |
| Official MCP | The configured official tools are available and the owner permits their use | Load `using-n8n-skills-official` and the matching official skills |
| Local JSON | Working offline, reviewing supplied exports, or no authorized live access exists | Inspect/edit the saved JSON; report live state and executions as unverified |

Do not install or demand MCP merely because an official skill names an MCP tool. Do not use the
community MCP router in place of the official one. Official skills remain useful for node behavior;
their MCP/SDK calls apply only in MCP mode. Read a skill file directly if this agent has no Skill tool.

## Shared rules

- Confirm installation UID, URL, project and workflow before writes. A workflow ID alone is not
  an installation identity. Read-only connection checks do not authorize mutation.
- Use version-specific official docs and actual capabilities. `get_node_types`, SDK compilation,
  `validate_workflow`, pin-data testing and MCP credential discovery are not automatically public
  API endpoints. If unavailable, use documented local/UI checks and name the missing verification.
- Preserve node IDs, parameters, connections, positions and settings outside the requested change.
  Fetch and compare the saved workflow after a live write. Saving successfully is not runtime proof.
- Published-target edits may affect live behavior. Inspect current state and the chosen method's
  semantics before saving; never promise a draft-only update without evidence.
- Follow the owner's existing authorization. Publish/unpublish, archive, real side-effect tests,
  client writes and Git actions require explicit scope authorization; do not ask again for an
  action already explicitly approved. A failed/uncertain create or run must be reconciled before retry.
- No `$env`/`$vars` in n8n workflows. Use n8n credentials for secrets. Export through
  `n8n-workflow-export` with source installation binding; keep project repos private.
- Put audit/update evidence in the external private history configured in `AGENTS.local.md`.
  Public docs may describe behavior, but must not expose private audit paths, IDs or evidence.

## Task routing

Use [Skills/INDEX.md](../INDEX.md) to select sizing, project creation, sections, export, audit,
handover and relevant official node skills. Plan sections before JSON or SDK construction.
Official MCP validation, local structural validation, mock execution and live testing are different
evidence levels. Report which happened, what was pinned/mocked, and what remains unverified.

Claude's existing hooks match MCP calls. They do not guard shell HTTP clients or arbitrary scripts.
API work must follow this procedure and tool permissions; do not describe these instructions as
an automatic API permission gate.
