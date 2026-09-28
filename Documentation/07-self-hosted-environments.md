# 07 — Self-Hosted Environments

We run **self-hosted n8n** (Docker). This doc covers how environments are organized and operated.
For hands-on server work (provisioning, Docker Compose, Caddy/TLS, queue mode, backups, updates),
load the **`n8n-self-hosting`** skill.

## Environments

| Env | Purpose | Rules |
|---|---|---|
| **dev** | Building and testing | Test credentials / sandbox accounts. Break things freely |
| **prod** | Client workflows running for real | Only tested, exported, committed workflows. Changes are imported from the repo, not hand-edited |

- **Ideal:** one dev instance for building and one prod instance for running.
- **Single instance (dev = prod)**, the current setup until a VPS exists. The rule that replaces
  "never build in prod":
  - **Draft (unpublished) = dev.** Agents may create and update drafts in the project's n8n folder.
  - **Published = prod.** Changing a published workflow changes live behavior, so an
    `update_workflow` on a published workflow needs the owner's OK first. Safer: build the change
    as a draft copy (`[slug] … (draft)`), test it, then swap with the owner's OK.
  - Use **test credentials / test chats / test sheets** for drafts wherever the service allows it.
  - **Never** publish an untested workflow, and every published workflow has an error workflow set.
  - Record the instance in the project `AGENTS.md` as `dev+prod (single instance)`.
- **Per-client instances** (client pays or owns the server): recorded in that project's AGENTS.md.

`TODO(owner)`: list your instances here.

| Name | URL | Mode (single/queue) | Host | Used for |
|---|---|---|---|---|
| `dev` | `https://…` | single | … | all development |
| `prod` | `https://…` | … | … | … |

## Instance essentials

| Setting | Why it matters |
|---|---|
| `N8N_ENCRYPTION_KEY` | Encrypts stored credentials. **Back it up separately.** Lose it and every credential is gone |
| `GENERIC_TIMEZONE` / `TZ` | Schedule triggers use it. Set it explicitly |
| `WEBHOOK_URL` | The public base URL behind the reverse proxy. Webhooks break without it |
| `EXECUTIONS_DATA_PRUNE` + `EXECUTIONS_DATA_MAX_AGE` | Keeps the DB small and limits PII retention |
| `N8N_BLOCK_ENV_ACCESS_IN_NODE` | Keep env vars away from Code nodes |
| Postgres (not SQLite) for prod | Reliability, backups, queue mode |

## Backups

- **What:** the database (workflows, credentials, executions) + the encryption key + the
  `.n8n` volume. Workflows are *also* in git, but credentials and Data Tables are not.
- **How often:** `TODO(owner)`, daily at minimum for prod.
- **Test a restore** at least once per quarter. An untested backup is a hope, not a backup.

## Updating n8n

1. Read the release notes for breaking changes.
2. Update **dev** first. Run each project's key workflows.
3. Back up prod → update prod → watch the executions.
4. After updating, check skill drift: the MCP tool names and node parameters that skills describe
   may have changed ([10-skills-system.md](10-skills-system.md)).

## MCP access

- The official instance-level MCP is enabled per instance (Settings → MCP). Record which instance
  the agent's MCP connection points to in the project AGENTS.md.
- **Before any write via MCP, confirm which instance you're connected to.** Building in prod by
  accident is the #1 environment mistake. On a single instance, the check is instead "is this
  workflow published?" (`get_workflow_details` → `active`). If it is, ask before updating it.
- Workflows created in the UI may have MCP access **off** by default. Toggle it per workflow if the
  agent needs to see it.
