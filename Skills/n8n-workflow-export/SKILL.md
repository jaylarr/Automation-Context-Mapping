---
name: n8n-workflow-export
description: "Export an n8n workflow into this workspace's repo as a sanitized, importable JSON file, and update the project CHANGELOG. Use when the user says \"export\", \"save the workflow to the repo\", \"pull the workflow\", \"sync workflow to git\", \"back up the workflow\", \"sanitize this JSON\", \"commit the workflow\", after any create_workflow_from_code / update_workflow that should be kept, or when a raw n8n download (*.raw.json) needs cleaning."
---

# n8n Workflow Export

Turns a live workflow (via the public API or optional official MCP) or a raw UI download into
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

1. **Identify the project.** Which project folder (`n8n workflows/<slug>/`)? Read its
   `AGENTS.md` and `README.md` workflows table.
2. **Confirm source and preflight before writing a new raw file.** Load `n8n-workspace-access`.
   Read the workflow through the selected API/MCP method; for a supplied UI download, inspect its
   existing content without copying it. Sanitize in memory with `sanitizeWorkflow`, then call
   `findHardcodedSecret` and `checkImportable` from `app/src/lib/sanitize-core.mjs`. Reject hardcoded
   secrets before saving. Remove pin data/runtime state and review client data in parameters/notes.
   Save only that checked input as `n8n workflows/<slug>/workflows/<name>.raw.json` (gitignored).
   The exporter scans again. Never echo raw private JSON, credential values or execution data.
   Resolve the immutable source installation UID from verified project records/Control Center
   Settings; a workflow ID or name alone is insufficient. Existing exports need matching bindings;
   unresolved legacy files use the binding preview/confirmation procedure in the operations guide.
3. **Run the shared exporter** (same rules as the Control Center's Import, one implementation in
   `app/src/lib/sanitize-core.mjs`, covered by tests):

   ```bash
   node scripts/export-workflow.mjs --project <slug> --installation <installation-uid> --raw "n8n workflows/<slug>/workflows/<name>.raw.json" --changelog "<what changed and why>" --dry-run
   ```

   Inspect the dry-run result, then repeat without `--dry-run` to save. It sanitizes, scans for
   secrets, checks every connection names an existing node, and picks the file belonging to this
   source installation UID plus workflow ID, else the next free number (archive included). It writes
   pretty JSON, adds the CHANGELOG line under [Unreleased], deletes the raw file, and prints a JSON
   summary (file, action, credentials) and records `documentation/workflow-bindings.json`.
   It refuses overwriting files without matching source bindings. It never commits or pushes.
   - **Exit code 2** = a secret is typed into a node, or a connection points at a missing node.
     Nothing was written. Go back to Non-negotiable 1 (or fix the wiring), then run it again.
   - `"action": "unchanged"` = the saved file already matches; nothing to do.

   What the exporter keeps and removes (for reference; don't do it by hand):

   | Field | Action |
   |---|---|
   | `pinData`, `meta`, `staticData` | removed |
   | `active`, `versionId`, `activeVersionId`, `shared`, `createdAt`, `updatedAt`, `triggerCount`, `isArchived` | removed |
   | `nodes[].credentials` | **kept**: `{ id, name }` references only |
   | `id`, `name`, `description`, `settings`, `tags` (names), `nodes`, `connections`, `nodeGroups` | kept |

   **No Node available?** Only then sanitize by hand with the table above and scan for the formats
   in `sanitize-core.mjs` (`SECRET_PATTERNS`).
4. **Update the rest of the docs in the same change:**
   - `documentation/CHANGELOG.md`: the exporter added a line; move or reword it (Added / Fixed) if needed.
   - Project `README.md` workflows table (new workflow → new row).
   - Project `AGENTS.md` → the workflow ID for dev/prod.
   - The workflow's spec, if behavior changed. **No spec yet?** Write the *Quick spec* block
     (`Documentation/templates/workflow-spec.md`) from the workflow itself and mark it `draft`.
5. **Generate the doc tables from the JSON** (don't make the owner type them). Replace only the
   rows for this workflow, and leave prose written by hand alone:
   - `documentation/architecture.md` → workflow list: name, trigger type, sub-workflows it
     calls (`executeWorkflow` nodes), systems touched (node types / credential types), Data Tables used.
   - `documentation/handover-sop.md` → **How it starts** (one row per trigger, in plain language)
     and **Accounts and access** (one row per credential *name*; owner = `TODO` if unknown).
   - Replace leftover template placeholders (`{{…}}`, `e.g. …` example rows) that the JSON can
     answer. List the ones it can't as "pending on the owner's side".
6. **Standards check** (report, don't fix silently): does the workflow have section stickies
   (`n8n-workflow-sections`), an error workflow in `settings.errorWorkflow` if it's published,
   and credential names that follow `Documentation/03-naming-conventions.md`? Flag each miss.
7. **Report** the file written, the fields stripped, any credential references (by name) the
    importer will need to verify or re-bind, the source installation/binding, standards-check results,
    evidence level (local/API read-back/MCP read-back), and a suggested commit message:
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
