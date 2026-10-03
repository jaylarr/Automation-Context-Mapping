---
name: n8n-workflow-approved-revision
description: "Create a separately approved translated, corrected, simplified or adapted version of an audited n8n workflow while preserving the original, validating references and saving a distinct reviewed version without live deployment."
---

# Approved workflow revision

Use only after the owner approves specific audit recommendations or a concrete revision scope.
Read the private report, owner decision, project metadata and original integrity first.
An audit kickoff or a review request does not authorize this step.

## Prepare and validate the copy

- Load [n8n-workspace-access](../n8n-workspace-access/SKILL.md) and skills matching the changes.
  Work locally unless live access is explicitly authorized. Copy an intact source to a new draft;
  never overwrite originals or owner context. State the chosen source and intended scope.
- Faithful translation changes only approved human-readable text. Renaming nodes must update all
  connection keys/targets and expression references, including `$()`/`$node` names, tool links and
  code references. Preserve IDs, API/field keys, credentials, positions and semantic behavior unless
  separately approved. Treat model prompts/user messages as behavior changes when appropriate.
- For improvement/simplification, explain equivalence or intended behavior changes. Keep useful
  error paths, deduplication, batching and rate-limit safeguards. Never reduce nodes just for a score.
- For a substantial new build or ~10+ added nodes, follow sizing/spec/section skills before building;
  a faithful translation of an existing graph alone does not require rebuilding its architecture.
- Check valid JSON, connection targets, duplicate identifiers, expressions and changed data paths.
  Use available structural/mock checks without executing source code or contacting providers.
  Name limits of local validation. Live tests, imports, publication and sending remain separate.

## Save a distinct version

After approval and validation, save the new draft in a separate file and run:

```text
node scripts/workflow-audit.mjs version --project <slug> --file <draft.json> --source <original-source-id> --label "English copy with approved fixes" --approved
```

The explicit flag records the save choice; it does not grant authorization by itself. The command
removes instance state and workflow identity from the candidate, verifies connection targets and
saves versions/<id>.json with a checksum and source association. No live bindings are invented.
The original remains unchanged, and Control Center displays the separate version for download.

Update the private report with approved scope, changes, checks and remaining limitations by saving
a new report. Update the project CHANGELOG with behavior changes without private report paths/IDs.
Do not commit, push or deploy without their own authorized scope. To build from this candidate in
n8n, create/use a regular project with explicit installation/credential mappings and the normal
validated export lifecycle; an audit project is not a live restore target.
