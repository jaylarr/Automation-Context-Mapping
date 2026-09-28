# 03 — Naming Conventions

Names exist so things can be **found** later, by humans and by agents running `search_workflows`.
Consistency beats cleverness.

## Summary table

| Thing | Convention | Example |
|---|---|---|
| Project folder / slug | `kebab-case`: `<client>-<purpose>` | `acme-lead-intake` |
| Workflow JSON file | `NN-<workflow-slug>.json`, 2-digit order | `01-intake-webhook.json` |
| Sub-workflow JSON file | `sub-<slug>.json` (or `workflows/subworkflows/`) | `sub-enrich-company.json` |
| Error workflow file | `00-error-handler.json` | `00-error-handler.json` |
| n8n workflow **name** | `[project-slug] Verb object`, sentence case | `[acme-lead-intake] Qualify inbound lead` |
| n8n sub-workflow name | `[project-slug] Verb object` + `subworkflow` tag | `[acme-lead-intake] Enrich company from domain` |
| n8n **folder** (in the instance) | project slug | `acme-lead-intake` |
| Node | what it **does here**, sentence case | `Fetch active customers` |
| Webhook node | `Webhook: <path or purpose>` | `Webhook: lead-intake` |
| Tags | lowercase, 2–4 per workflow | `acme-lead-intake`, `subworkflow` |
| Credential (in n8n) | `<client> <service> <env>` | `Acme HubSpot prod` |
| Webhook path | `<project-slug>/<purpose>` | `acme-lead-intake/new-lead` |
| Data Table | `<project_slug>_<entity>` (snake case, since n8n tables read like DB tables) | `acme_lead_intake_leads` |
| Data Table columns | camelCase, `_object` suffix for stringified JSON | `leadId`, `rawPayload_object` |
| Git tag (release) | `<project-slug>/vMAJOR.MINOR.PATCH` | `acme-lead-intake/v1.2.0` |
| Docs file | kebab-case `.md` (except `README`, `AGENTS`, `CHANGELOG`) | `handover-sop.md` |

## Project slug

- Format: `<client>-<purpose>`, lowercase, hyphens, no spaces, and **max ~40 characters**.
- Internal or own projects use `internal-<purpose>` (e.g. `internal-invoice-reminders`).
- The slug is used **everywhere**: the folder, the n8n folder, the workflow name prefix, tags,
  webhook paths, Data Tables, and git tags. Pick it once and never rename it.

## Workflow file numbering

- The number reflects the **execution or reading order** of the project (entry points first).
- `00-` is reserved for the project's error-handler workflow.
- Numbers are never reused. If `03` is retired, its file moves to `workflows/_archive/` and the
  next new workflow is `04`.
- The file slug should match the n8n name: `[acme-lead-intake] Qualify inbound lead` →
  `02-qualify-inbound-lead.json`.

## n8n workflow names

Follows the official lifecycle skill (`n8n-workflow-lifecycle-official` →
`references/NAMING_CONVENTIONS.md`), plus our project prefix:

- **Verb first**, sentence case: `Send weekly report`, not `Weekly Report Sender`.
- Scheduled workflows can add a cadence after the prefix: `[acme-lead-intake] Daily: sync CRM contacts`.
- No emojis, no `v2` / `final` / `copy`. Versioning lives in git.

## Node names

- Describe the **action in this workflow**: `Fetch order details`, `Build Slack message`, `Upsert lead to HubSpot`.
- Never leave defaults (`HTTP Request1`, `Code`, `Set2`). Error messages quote node names, so a
  good name tells you where it broke.
- Loops are named after what they iterate: `Loop through orders`. Merges are named after what they
  merge: `Merge lead + enrichment`.

## Tags (instance-level)

- Always: the **project slug**.
- Plus the type, when it applies: `subworkflow` (reusable building block), `tool` (MCP/agent-callable),
  `error-handler`, `scheduled`, `webhook`.
- Check existing tags (`list_workflow_tags`) before creating new ones, to avoid near-duplicates
  (`customer` vs `customers`).

## Credentials

- `<Client> <Service> <env>`: `Acme HubSpot prod`, `Acme HubSpot dev`, `Internal OpenAI prod`.
- One credential per client per service per environment. Never share a credential across clients.
- **Exception: the owner's own existing credentials** keep their current names (renaming breaks
  every workflow that uses them). They're listed in `AGENTS.local.md`. Use them for internal work.
