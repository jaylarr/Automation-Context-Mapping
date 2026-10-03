# Existing workflow audit projects

## Create and add context

Projects → New project → **Audit an existing workflow instead**. Paste JSON or upload one `.json`
file (up to 10 MB). Description is optional. The project name and unique folder slug are derived
from the workflow name; repeated names create separate folders.

Expand **Add context** for optional client, purpose, brief/general notes and supporting documents.
These fields can be edited later on the project page. **Add related workflow** preserves additional
originals separately; this is useful for subworkflows/dependencies.

Documents support PDF, Word `.docx`, Markdown, TXT, CSV, JSON and EML. Upload up to 20 documents,
25 MB each, 50 MB total per batch. PDF/Word extraction runs locally in a time/memory-limited child
process. PDF limits: 250 pages and one million extracted characters. Text is checked for known
secret formats before saving. Binary originals are stored privately outside project Git; checked
extracts live in `context/files/`. Images/diagrams are not analyzed and scanned pages are flagged
for OCR/visual review. Password-protected, malformed and unsupported documents are rejected.

The original workflow is never sanitized or rewritten. Inputs containing recognized secret formats
or hardcoded authentication values are rejected before source storage; the owner must supply a
safe copy. These checks are not a guarantee that every secret or personal-data format is recognized.

## Audit with an agent

Copy **Start an agent → Copy audit prompt** into Codex/Claude Code in the workspace folder.
The prompt instructs a read-only audit using five discoverable workspace skills: intake, discovery,
technical quality, business/industry fit, and approved revision (used only after approval).

The audit covers purpose, English translations, tool/database/API inventory, dependencies, quality,
industry use cases, reuse and possible offerings. It distinguishes observed configuration, inferred
usefulness and unverified runtime behavior. Commercial potential does not establish resale rights:
source/license uncertainty must be shown explicitly.

## Private reports

Set the external private audit folder in `AGENTS.local.md` under **Private audit and update history**
(an absolute path on its own line), or set the Control Center process variable
`WORKFLOW_AUDIT_PRIVATE_ROOT`. This is app configuration, not an n8n workflow variable.
The application never falls back to a public repository report folder.

From the workspace root:

```text
node scripts/workflow-audit.mjs info --project <slug>
node scripts/workflow-audit.mjs report --project <slug> --file <absolute-private-report.md> --title "Workflow audit"
```

The info command verifies source integrity and prints the configured private project directory.
Reports are stored under `workflow-audits/<slug>--<project-id>/reports/`, with metadata and checksums.
The private working report must also be outside workspace Git. The CLI registers it for the page.
**Import a report** accepts a Markdown/text report when working with an agent that cannot run the CLI.
Reports are immutable dated snapshots; source/context changes flag earlier reports as stale.

## Separate reviewed versions

After approving a concrete change, ask the agent to create a new draft and register it:

```text
node scripts/workflow-audit.mjs version --project <slug> --file <draft.json> --source <original-source-id> --label "Approved English copy" --approved
```

The version is stored separately, with instance state/workflow identity removed and connection
targets checked. **Add reviewed version** supports manually supplied approved candidates too.
These structural checks do not establish live/provider behavior or validate every expression.
Versions can be downloaded but audit projects cannot be live backup/restore targets. Use a regular
project with explicit installation/credential mappings for subsequent n8n implementation.

Creation and auditing do not commit, push, call providers or execute/publish workflows. Source hashes
are checked before download/reporting and before associating versions. Disk files remain editable
by the owner outside the app; the checks detect changes, rather than claiming filesystem immutability.

## Recovery and retention

Project folders remain the source of truth. Archive/trash uses the existing reversible project
controls. External reports/document originals are retained independently; private storage is not
automatically purged when a project is trashed. Restore the project folder to recover access.
Back up private storage separately: source originals are excluded from project Git, and ordinary
live workflow exports do not back them up. No live installation is guessed from a copied JSON ID.
