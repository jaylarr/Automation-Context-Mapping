# 11 — AI Agent Workflow (building via the n8n MCP)

How an AI agent (Codex, Cursor, Claude Code…) builds and edits n8n workflows in this workspace
through the **official n8n instance-level MCP**. The entry-point skill is
**`using-n8n-skills-official`**. Load it first on any n8n task.

## Before touching the MCP

1. **Read the project `AGENTS.md`.** It tells you which client, which instance, which credentials,
   and any exceptions.
2. **Confirm the target instance** against the project `AGENTS.md`. With separate instances: build
   on **dev**, never prod. With a **single instance** (dev = prod): unpublished drafts are "dev",
   and anything published is "prod". Never edit a published workflow's live behavior without
   the owner's OK ([07-self-hosted-environments.md](07-self-hosted-environments.md)).
3. **Is there a spec?** (`documentation/spec/NN-<slug>.md`, the short template is enough). No spec
   means you write one with the owner first ([02-how-i-work.md](02-how-i-work.md)). "It's small"
   is not an exception. Three filled-in fields beat a chat transcript.
4. **Sized and decided?** New project or a big feature: run `n8n-project-sizing` (estimate nodes,
   then ask the owner: one workflow or several). Don't build until the owner answers.
5. **Search before building:** `search_workflows` for existing workflows and sub-workflows
   (project slug tag, `subworkflow` tag).

## The build loop

| Step | MCP tool(s) | Skill to load |
|---|---|---|
| 1. Learn the SDK (once per session) | `get_workflow_sdk_reference` (sections: `patterns`, `guidelines`, `design`) | `n8n-workflow-lifecycle-official` |
| 1b. Best practices per technique | `get_workflow_best_practices` (`technique: "list"` first if unsure; once per technique, e.g. `chatbot`, `scheduling`) | `n8n-workflow-lifecycle-official` |
| 2. Find nodes | `search_nodes` (note the resource/operation discriminators) | `n8n-node-configuration-official` |
| 3. Get exact parameter shapes | `get_node_types` (with resource/operation discriminators) | `n8n-node-configuration-official` |
| 3a. Ground dropdown / resource-locator values | `list_credentials` → `explore_node_resources` (real Sheets tabs, channels, model IDs; never invent IDs) | `n8n-node-configuration-official` |
| 3b. **Plan canvas sections** (before any code) | — | **`n8n-workflow-sections`** |
| 4. Write SDK code (incl. `sticky(...)` sections) | — | expressions / code-nodes / loops / agents / error-handling, as needed |
| 5. Validate | `validate_workflow` (fix → re-validate until clean); `validate_node_config` for a single node | `n8n-workflow-lifecycle-official` |
| 6. Create or update | `create_workflow_from_code` (with `description`) / `update_workflow` | — |
| 7. **Verify wiring + layout** | `get_workflow_details` → check `connections`, and that every node sits inside its section note | `n8n-workflow-sections` |
| 8. User wire-up | The owner binds/verifies credentials per node in the UI | `n8n-credentials-and-security-official` |
| 9. Test | `prepare_workflow_pin_data` → `test_workflow` (**ask first** if unpinned side effects exist) | `n8n-workflow-lifecycle-official` → `references/TESTING.md` |
| 10. Debug failures | `search_workflow_executions` → `get_workflow_execution` | `n8n-debugging-official` |
| 10b. What changed? / undo | `get_workflow_history`, `get_workflow_versions_diff`, `restore_workflow_version` | `n8n-debugging-official` |
| 11. Export to repo, then commit in the project's private repo | `get_workflow_details` → sanitize → write JSON | **`n8n-workflow-export`** |
| 12. Publish | `publish_workflow`, **only with the owner's explicit OK** | — |

> **Tool-name drift.** Names above were checked against the live official MCP on 2026-09-28.
> They change between n8n versions (older docs said `get_sdk_reference`, `prepare_test_pin_data`,
> `get_execution`, `get_suggested_nodes`). **Trust the live tool list**, and fix this table when
> it drifts. Community-pack skills (czlonkowski) use the *community* n8n-mcp names
> (`n8n_create_workflow`, `get_node` …), which don't exist here.

## Loading skills: the right amount

Load the router (`using-n8n-skills-official`) plus the **2–4 skills that match this step**, and
re-load one at the moment you need it. Don't preload the whole index: every skill is ~150–400
lines, and a context full of skills pushes out the spec and the project `AGENTS.md`, which matter
more.

## What agents may do without asking

- Read anything in the repo; search and read workflows, executions, and node types via MCP.
- Validate code; create or update **draft** workflows in the **dev** instance for the current project.
- Write and edit files in the current project folder (workflows JSON, docs).

## What agents must ask before doing

- `publish_workflow` / `unpublish_workflow` / `archive_workflow`
- `execute_workflow` in production mode, or any test run with real side effects (emails, CRM
  writes, payments, Slack messages)
- Anything touching the **prod** instance
- Creating Data Tables or workflows **outside** the current project
- Git commits and pushes
- Editing global `Documentation/`, root `AGENTS.md`, or vendored skills

## Session hygiene

- **Capture the why.** Put context that only exists in chat into the workflow `description`,
  `decisions.md`, or the spec before the session ends.
- **End every build session with:** exported JSON, a CHANGELOG entry, updated docs, and a short
  summary of what's pending on the owner's side (credentials to create, toggles to flip).
- **Lessons learned** → propose a doc update or a new custom skill ([10-skills-system.md](10-skills-system.md)).

## How the rules reach every agent, every time

| Layer | Claude Code | Codex / Cursor / others |
|---|---|---|
| Global pointer (any folder) | `~/.claude/CLAUDE.md` | `~/.codex/AGENTS.md` |
| Workspace rules | `CLAUDE.md` → `AGENTS.md` | `AGENTS.md` (§0 checklist is mandatory) |
| Project rules | `n8n workflows/<slug>/AGENTS.md` | same |
| Skills | `.claude/skills` → `Skills/` | `.agents/skills` → `Skills/` |
| Session start | **Hook** injects the protocol + project list (`scripts/hooks/session-start.mjs`) | the checklist in AGENTS.md |
| Before n8n write/run MCP calls | **Hook** adds a rule reminder (`scripts/hooks/n8n-guard.mjs`), and forces a permission prompt for publish / unpublish / archive / production runs / Data Table deletes | the checklist in AGENTS.md |
| End of a turn | **Hook** (`scripts/hooks/export-check.mjs`): if a workflow was created or updated but no export JSON / CHANGELOG was written, it sends the agent back once to export or say why not | the Finish item in AGENTS.md §0 |

Hooks are configured in `.claude/settings.json` (committed). Claude Code asks you to trust the
project's hooks the first time you open the workspace. To review or disable them, use `/hooks` in
an interactive `claude` terminal. The skill junctions are recreated with `scripts/link-skills.mjs`.
