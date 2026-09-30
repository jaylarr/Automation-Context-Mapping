# 05 — Export & Versioning

**The repo is the source of truth.** The n8n instance is where workflows run, but it can be wiped,
upgraded, or misconfigured. Every shipped workflow lives in git as an **importable JSON** file.

> **Projects are not in this (public) workspace repo.** `n8n workflows/<project>/` is gitignored so
> client work stays private. Each project has its **own private repo** at
> `n8n workflows/<project>/.git`. `scripts/new-project.mjs` creates it, and
> `node scripts/init-project-repo.mjs --name <slug>` adds one to an existing project. The git rules
> below apply to that repo. A remote is optional and must be **private** (per client, so it can be
> handed over). Release tags are plain `v1.1.0`, since the repo is already per project.

## What an exported workflow file must be

- **Importable as-is** into n8n (Workflows → Import from File, or paste into the canvas).
- **Sanitized**: no secrets, no pinned test data with real client data, no instance-specific noise.
- **Pretty-printed** (2-space JSON), so git diffs are readable.
- Saved at `n8n workflows/<project>/workflows/NN-<slug>.json` ([03-naming-conventions.md](03-naming-conventions.md)).

## How to export

### Option A: via agent + API or optional MCP
Use **`n8n-workspace-access`** and **`n8n-workflow-export`**. Read the workflow through the chosen
method, sanitize and scan it in memory before saving checked temporary JSON, then
run `node scripts/export-workflow.mjs`, the same sanitizer the Control Center's Import uses
(`app/src/lib/sanitize-core.mjs`, covered by `npm test`). Or click **Import** on the Workflows page.

### Option B: manually from the n8n UI
1. Open the workflow → `…` menu → **Download**.
2. Keep the private download out of Git. Inspect/sanitize/scan it before copying checked input
   into the project as `<name>.raw.json`; `.gitignore` is not a secret check.
3. Resolve the immutable source installation UID from verified records/Control Center Settings.
   Preview with `node scripts/export-workflow.mjs --project <slug> --installation <installation-uid> --raw "n8n workflows/<slug>/workflows/<name>.raw.json" --dry-run`.
   Inspect the preview, then repeat without `--dry-run` to save (or ask the agent).
   Existing files must have matching source bindings. Follow the binding procedure in
   [Control Center operations](control-center-operations.md) for legacy exports; do not guess ownership.

## Sanitizing rules

| Field | Action | Why |
|---|---|---|
| `pinData` | **Remove** (or replace with fake data from `assets/samples/`) | Pinned data often holds real client data |
| `nodes[].credentials` | **Keep** (it's `{ id, name }` only, never the secret) | Import re-binds by name; the name documents what's needed |
| `meta.instanceId` | Remove | Instance-specific noise |
| `id` (workflow id) | Keep, but document it in the project `AGENTS.md` | Useful to find the live workflow; harmless on import |
| `versionId`, `active`, `shared`, `updatedAt`, `createdAt` | Remove | Instance state, not design |
| `staticData` | Remove; document any intentional seed separately | Runtime state |
| Hardcoded tokens/keys **anywhere** (headers, Set nodes, URLs, Code) | **Stop.** Move to a credential, then re-export | A secret in JSON is a leak ([06](06-credentials-and-security.md)) |
| Client PII in node parameters or sticky notes | Replace with placeholders | The repo isn't a data store |

Before committing, scan for secrets:

```powershell
Select-String -Path "n8n workflows\<project>\workflows\*.json" -Pattern 'sk-[A-Za-z0-9]{10,}|Bearer [A-Za-z0-9._-]{15,}|api[_-]?key"\s*:\s*"[^"{]+"|password"\s*:\s*"[^"{]+"' 
```

A match means something is wrong. Fix it before committing.

## Versioning

### Per project: CHANGELOG
Every change to a workflow gets an entry in `documentation/CHANGELOG.md`
([template](templates/CHANGELOG.md)) using [Keep a Changelog](https://keepachangelog.com) style
and **semantic versioning per project**:

| Bump | When |
|---|---|
| **MAJOR** (2.0.0) | Breaking: the webhook contract changed, outputs changed shape, the client must do something |
| **MINOR** (1.1.0) | New workflow, new feature, new branch of logic |
| **PATCH** (1.0.1) | Bug fix, retry tweak, wording, no behavior change for the client |

### Git

**In the Control Center:** each project card shows its backup state, and the project page has a
**Commit** button (secret check + CHANGELOG line, never pushes). Settings → Backups can export
changed workflows on a schedule and commit them. Add a **private** remote per project so the history
leaves this PC.

- **Commit messages:** `<project-slug>: <what changed>`, e.g.
  `acme-lead-intake: add retry + 429 handling to enrichment`. Workspace-level changes use
  `workspace:`, `docs:`, or `skills:` as the prefix.
- **One logical change per commit.** Workflow JSON + CHANGELOG + affected docs go in together.
- **Release tags** when a version goes to prod: `git tag v1.1.0` (in the project repo).
- **Branches** (optional for solo work): `<project-slug>/<short-change>` for bigger changes.
- Never commit: `.env`, raw exports, real client data, secrets. `.gitignore` covers the common
  cases, but it isn't a guarantee. Look at `git diff --staged` before committing.

### n8n's own version history
n8n keeps workflow history (`get_workflow_history`, `restore_workflow_version` via MCP). Use it as
an undo button. **It is not a replacement for git.** It lives and dies with the instance.

## Importing a workflow (deploy or restore)

**Easiest:** the **Restore to n8n** button on the workflow's row in the Control Center project page
(creates an unpublished workflow, or updates an existing target; a published target can remain live
and requires explicit confirmation). Use its reference setup and preview. Then do steps 2–5 below. By hand:

1. In the target instance: **Import from File** → pick `NN-<slug>.json`.
2. **Re-bind credentials** on every node that uses one (the import matches by name, so check each
   node anyway).
3. Set the **error workflow** (Settings) to the project's `00-error-handler`.
4. Check webhook paths don't collide with existing workflows.
5. Test ([08-testing-and-qa.md](08-testing-and-qa.md)), then activate.

Import sub-workflows **before** their callers, and update the callers' workflow IDs if the IDs changed.
