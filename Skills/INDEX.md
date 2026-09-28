# Skills Index

Which skill to load for which task. Each skill is `Skills/<name>/SKILL.md`. Agents also see this
folder as `.agents/skills/` and `.claude/skills/` (junctions created by `scripts/link-skills.ps1`).
How the system works: [Documentation/10-skills-system.md](../Documentation/10-skills-system.md).

**Rule of thumb:** load the router plus the **2–4 skills that match the current step**, and
re-load one at the moment of decision. Even a 3-node webhook flow touches node configuration,
expressions, error handling and the lifecycle, but not all at once. Preloading the whole index
crowds the spec and project `AGENTS.md` out of context.

**Name clashes:** if a global skill (`~/.claude/skills`) has the same name as or overlaps a skill
here, the one in this folder wins. The czlonkowski pack's `using-n8n-mcp-skills` router targets the
*community* n8n-mcp and must not be used in this workspace.

## Start here

| Skill | Load when |
|---|---|
| [`using-n8n-skills-official`](using-n8n-skills-official/SKILL.md) | **Any n8n task.** Router + MCP tool reference + non-negotiables |
| [`n8n-project-sizing`](n8n-project-sizing/SKILL.md) | **New project / new build, before any design.** Estimate nodes → ask the owner: one workflow or several |
| [`n8n-workflow-sections`](n8n-workflow-sections/SKILL.md) | **Start of every new workflow** (before SDK code), and any edit that adds nodes. Sticky-note sections: `01 — VERB + VERB` … |

## Workspace skills (custom: ours, editable)

| Skill | Load when |
|---|---|
| [`n8n-project-sizing`](n8n-project-sizing/SKILL.md) | New project or big feature: estimate the node count, then ask single vs multiple workflows (mandatory before building) |
| [`n8n-workflow-sections`](n8n-workflow-sections/SKILL.md) | Laying out / organizing any workflow canvas with numbered sticky-note sections (mandatory for new workflows) |
| [`new-automation-project`](new-automation-project/SKILL.md) | Starting a project for a client; creating the project folder |
| [`n8n-project-audit`](n8n-project-audit/SKILL.md) | Auditing / reviewing a project or workflow against its docs; suggestions (fix, improve, polish, docs, remove) applied only after the owner approves each ID |
| [`n8n-workflow-export`](n8n-workflow-export/SKILL.md) | Saving a workflow from n8n into the repo; sanitizing a raw export |
| [`project-handover-docs`](project-handover-docs/SKILL.md) | Writing the client SOP / architecture doc; go-live |

## n8n build skills (vendored: official, n8n-io/skills)

| Skill | Load when |
|---|---|
| [`n8n-workflow-lifecycle-official`](n8n-workflow-lifecycle-official/SKILL.md) | Planning, building, validating, testing, publishing, handing off; naming; review/audit (`references/REVIEW_CHECKLIST.md`) |
| [`n8n-node-configuration-official`](n8n-node-configuration-official/SKILL.md) | Configuring any node (HTTP, webhook, DB, comms, Merge, triggers) |
| [`n8n-expressions-official`](n8n-expressions-official/SKILL.md) | `{{ }}`, `$json`, `$('Node')`, Luxon dates, mapping fields |
| [`n8n-code-nodes-official`](n8n-code-nodes-official/SKILL.md) | About to use a Code node / custom JavaScript |
| [`n8n-loops-official`](n8n-loops-official/SKILL.md) | Multiple items, batching, pagination, rate limits, "for each", parallelism |
| [`n8n-subworkflows-official`](n8n-subworkflows-official/SKILL.md) | Reuse, anything over ~10 nodes, Execute Workflow, sub-workflow inputs |
| [`n8n-error-handling-official`](n8n-error-handling-official/SKILL.md) | Webhooks/APIs, scheduled or unattended workflows, error outputs, retries, error workflow |
| [`n8n-credentials-and-security-official`](n8n-credentials-and-security-official/SKILL.md) | Any auth, API key, token, OAuth, secret |
| [`n8n-agents-official`](n8n-agents-official/SKILL.md) | AI Agent / LLM chain / classifier / extractor / RAG / structured output |
| [`n8n-binary-and-data-official`](n8n-binary-and-data-official/SKILL.md) | Files, images, PDFs, attachments, binary |
| [`n8n-data-tables-official`](n8n-data-tables-official/SKILL.md) | Data Tables: schema, dedup, idempotency, persistent state |
| [`n8n-debugging-official`](n8n-debugging-official/SKILL.md) | "It's not working", errors, unexpected output |
| [`n8n-extending-mcp-official`](n8n-extending-mcp-official/SKILL.md) | Exposing a workflow as an agent/MCP tool; filling MCP capability gaps |

## Gap-fillers (vendored: community, czlonkowski/n8n-skills)

Written for the *community* n8n-mcp. Read each skill's `SOURCE.md` for tool-name mapping.

| Skill | Load when |
|---|---|
| [`n8n-self-hosting`](n8n-self-hosting/SKILL.md) | Deploy/update/back up/harden a self-hosted n8n (Docker, Caddy, queue mode, task runners) |
| [`n8n-code-tool`](n8n-code-tool/SKILL.md) | Custom Code **Tool** attached to an AI Agent (not the Code node) |
| [`n8n-code-python`](n8n-code-python/SKILL.md) | Python in a Code node (**only** when explicitly asked for) |
| [`n8n-workflow-patterns`](n8n-workflow-patterns/SKILL.md) | Choosing an architecture: webhook, API integration, DB sync, AI agent, scheduled, batch |

## Precedence

1. Live MCP tools (`get_node_types`, SDK reference) beat every skill on parameter shapes.
2. Workspace skills + `Documentation/` win on workspace conventions (e.g. `n8n-workflow-sections`
   overrides the official "stickies annotate, don't group" rule).
3. `*-official` skills win on n8n behavior.
4. Community skills fill gaps only.

## Adding a skill

Create `Skills/<name>/SKILL.md`, add a row to the right table above, and commit
`skills: add <name>`. Guide: [Documentation/10-skills-system.md](../Documentation/10-skills-system.md).

Licenses for vendored packs: [`_licenses/`](_licenses/).
