---
name: n8n-workflow-export
description: Export an n8n workflow into this workspace's repo as a sanitized, importable JSON file, and update the project CHANGELOG. Use when the user says "export", "save the workflow to the repo", "pull the workflow", "sync workflow to git", "back up the workflow", "sanitize this JSON", "commit the workflow", after any create_workflow_from_code / update_workflow that should be kept, or when a raw n8n download (*.raw.json) needs cleaning.
---

# n8n Workflow Export

Turns a live workflow (via the n8n MCP) or a raw UI download into
`n8n workflows/<project>/workflows/NN-<slug>.json`. The file is importable, has no secrets, and is
diff-friendly. The full rules are in `Documentation/05-export-and-versioning.md`. This skill is the
procedure.

## Non-negotiables

1. **Never write secrets to disk.** If you find a hardcoded token, key, or password anywhere in the
   workflow (header values, Set nodes, Code, URLs, `$vars` used as auth), **stop**. Tell the owner
   which node has it, and have it moved into an n8n credential
   (`n8n-credentials-and-security-official`) before exporting. Don't write a "redacted" copy and
   carry on. The live workflow is still leaking.
2. **Remove `pinData`.** It usually holds real client data. If fake samples are useful, save them
   separately in `assets/samples/`.
3. **The output must stay importable.** Only remove the fields listed below. Never rename nodes or
   change parameters while exporting.

## Procedure

1. **Identify the project and file.** Which project folder (`n8n workflows/<slug>/`)? Read its
   `AGENTS.md` and `README.md` workflows table.
   - Existing workflow: reuse its file name/number.
   - New workflow: next free number (numbers are never reused, so check `workflows/_archive/`
     too). Slug = the n8n name without the `[project]` prefix, kebab-cased.
2. **Get the JSON.**
   - From n8n: `get_workflow_details({ workflowId })`. Take the workflow object (name, nodes,
     connections, settings, and the rest).
   - From a file: read `workflows/<slug>.raw.json` (gitignored).
3. **Sanitize** (only these changes):

   | Field | Action |
   |---|---|
   | `pinData` | delete |
   | `meta.instanceId` (and `meta` if it becomes empty, but keep `meta.templateCredsSetupCompleted` if present) | delete |
   | `active`, `versionId`, `activeVersionId`, `shared`, `createdAt`, `updatedAt`, `triggerCount`, `isArchived` | delete |
   | `staticData` | delete unless the workflow relies on seeded state (ask) |
   | `nodes[].credentials` | **keep**: `{ id, name }` references only |
   | `id`, `name`, `nodes`, `connections`, `settings`, `tags`, `description` | keep |

4. **Secret scan** the sanitized JSON before writing. Look for `sk-`, `Bearer `, `api_key`,
   `apikey`, `password`, `secret`, `token` with literal values (not `{{ }}` expressions, and not
   inside `credentials`), and long base64/hex strings in header or query parameters. Any hit
   means going back to Non-negotiable 1.
5. **Write** pretty-printed JSON (2-space indent, UTF-8, trailing newline) to
   `workflows/NN-<slug>.json`. Delete the `.raw.json` source if one was used.
6. **Verify importability:** the file parses as JSON, and has `nodes` (array), `connections`
   (object), and `name`. Every connection source and target names an existing node.
7. **Update docs in the same change:**
   - `documentation/CHANGELOG.md` → an entry under `[Unreleased]` (Added / Changed / Fixed).
   - Project `README.md` workflows table (new workflow → new row).
   - Project `AGENTS.md` → the workflow ID for dev/prod.
   - The workflow's spec, if behavior changed. **No spec yet?** Write the *Quick spec* block
     (`Documentation/templates/workflow-spec.md`) from the workflow itself and mark it `draft`.
8. **Generate the doc tables from the JSON** (don't make the owner type them). Replace only the
   rows for this workflow, and leave prose written by hand alone:
   - `documentation/architecture.md` → workflow list: name, trigger type, sub-workflows it
     calls (`executeWorkflow` nodes), systems touched (node types / credential types), Data Tables used.
   - `documentation/handover-sop.md` → **How it starts** (one row per trigger, in plain language)
     and **Accounts and access** (one row per credential *name*; owner = `TODO` if unknown).
   - Replace leftover template placeholders (`{{…}}`, `e.g. …` example rows) that the JSON can
     answer. List the ones it can't as "pending on the owner's side".
9. **Standards check** (report, don't fix silently): does the workflow have section stickies
   (`n8n-workflow-sections`), an error workflow in `settings.errorWorkflow` if it's published,
   and credential names that follow `Documentation/03-naming-conventions.md`? Flag each miss.
10. **Report** the file written, the fields stripped, any credential references (by name) the
    importer will need to re-bind, the standards-check results, and a suggested commit message:
    `<project-slug>: <what changed>`. Projects are versioned in their **own private repo**
    (`n8n workflows/<slug>/.git`, see `Documentation/05-export-and-versioning.md`). **Don't commit**
    unless the owner asks.

## Anti-patterns

| Mistake | What goes wrong | Fix |
|---|---|---|
| Keeping `pinData` "for testing" | Client PII in git forever | Fake samples in `assets/samples/` |
| Stripping `credentials` blocks | The importer can't tell which credential each node needs | Keep them; they hold no secrets |
| Minified JSON | Unreadable diffs | 2-space pretty print |
| New file per version (`01-intake-v2.json`) | History belongs to git | Overwrite the same file; CHANGELOG + commit |
| Exporting without a CHANGELOG entry | Nobody knows what changed or why | Same-change doc update (step 7) |
