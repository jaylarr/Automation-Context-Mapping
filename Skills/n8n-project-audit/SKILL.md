---
name: n8n-project-audit
description: "Review an n8n project or workflow against its brief, specs, exports and available live evidence. Use for audits, health checks, cleanup reviews and handover readiness; propose numbered changes and apply only explicitly approved scope, keeping reports outside Git."
---

# n8n Project Audit (read everything → report → ask → apply only what's approved)

For supplied internet/client JSON in a `workflow-audit` project, use
[n8n-workflow-audit-intake](../n8n-workflow-audit-intake/SKILL.md) instead. That path supports
optional context, immutable originals, translations and industry/commercial assessment without
requiring a client brief, live installation or spec.

A full audit of a project in `n8n workflows/<slug>/`: the live workflows, the repo exports, and the
project documents, checked against each other and against our standards. The output is a report
with **numbered suggestions**. Nothing gets changed, archived, or removed until the owner approves
that specific suggestion.

This skill **orchestrates**. The per-workflow checks come from the official
`n8n-workflow-lifecycle-official` → `references/REVIEW_CHECKLIST.md`. This skill adds the project
context, the workspace standards, the "is this still needed?" review, and the approval loop.

## Non-negotiables

1. **The audit phase is read-only.** Load `n8n-workspace-access` and use authorized API GETs,
   local JSON inspection, or available official MCP reads. MCP examples: `search_workflows`,
   `get_workflow_details`, `search_workflow_executions`, `get_workflow_execution`,
   `list_credentials`. **Not allowed while auditing:** `update_workflow`, `create_workflow_from_code`,
   `test_workflow`, `execute_workflow`, publish/unpublish/archive, and file edits other than the
   external private audit report/index. *Why:* an audit must never cause a side effect, and a test run can send real emails.
2. **The project documents are the reference.** Judge each workflow against what the project says it
   should do (spec, architecture, decisions), not only against generic best practice. If a
   `decisions.md` entry explains a deviation, it isn't a finding. Mention it at most as context.
3. **Every finding has evidence**: the workflow and node name, what was seen (JSON terms, e.g.
   "`Send Alert` has `onError: continueRegularOutput` and nothing checks the result"), and which
   doc or standard it breaks. No vague "could be better".
4. **Apply only authorized scope.** Present numbered suggestions. Explicit IDs, "all fixes", or
   an unambiguous "proceed" to a concrete scoped proposal authorize that scope. Ask only if scope
   is unclear. Do not repeat approval already given; tests/publishing still need authorization for
   their distinct effects. A review request alone never authorizes remediation.
5. **Removal means archive, never delete, and only after a safety check** (Removal checks, below).
   Export first, so the repo keeps a copy in `workflows/_archive/`.
6. **Confirm the instance** before reading (dev vs prod, from the project `AGENTS.md`). Auditing
   prod read-only is fine; applying changes happens in dev unless the owner says otherwise.

## Procedure

### Phase 1: Gather context (read-only)

1. **Scope:** whole project (default) or named workflows. Read the project's `AGENTS.md` first
   (instances, workflow IDs, credentials, constraints).
2. **Read the project documents:** `client-brief/` (what the client actually asked for; the
   top reference for "does it do what they wanted"), `README.md` (workflows table, status), `documentation/spec/*`,
   `architecture.md`, `decisions.md`, `CHANGELOG.md`, `discovery.md`, `handover-sop.md`, if they
   exist. Note what each workflow is **supposed** to do. Missing docs are findings themselves (D-items).
3. **Read the repo exports** in `workflows/` (and note `_archive/`).
4. **Read the live workflows:** `search_workflows` (by project prefix `[slug]` and by tag), then
   `get_workflow_details` for each one. Also catch workflows that belong to the project but lack
   the prefix or tag (IDs in `AGENTS.md`, or names matching the repo files).
5. **Read recent activity:** `search_workflow_executions` per workflow (last ~30 days): run count,
   error rate, last run, recurring error nodes. Open 1–2 failed executions with
   `get_workflow_execution` if errors repeat.

API mode uses documented workflow/execution GETs with pagination instead of MCP calls. Do not
invent credential-list or validation endpoints. Verify credentials manually where necessary.
Local-only audits cannot establish publication, traffic, execution counts or current live drift;
mark those checks unverified. Record inspected time range and missing/truncated history.

### Phase 2: Check (see [references/AUDIT_CHECKS.md](references/AUDIT_CHECKS.md))

6. **Per workflow:** walk `REVIEW_CHECKLIST.md` (MUST FIX → SHOULD FIX → NICE TO HAVE).
7. **Workspace standards:** naming and tags, error workflow set, sticky-note sections
   (`n8n-workflow-sections`), secrets and credential names, no `$env`/`$vars`, the Code node as
   a last resort, description with the *why*.
8. **Docs vs reality:** spec vs behavior, README/AGENTS tables vs live, repo export vs live (drift),
   CHANGELOG up to date.
9. **Is everything still needed?** Unused, duplicate, superseded, orphaned, or temporary workflows,
   and dead or redundant nodes inside workflows.

### Phase 3: Report and ask

10. **Write the report privately** under the external audit/update folder configured in
    `AGENTS.local.md`, with date and project slug, and maintain its index (format:
    [references/REPORT_TEMPLATE.md](references/REPORT_TEMPLATE.md)). Never save audit reports in
    the public workspace or project Git repositories. If no private location is configured,
    report in chat and ask for its location; do not invent an in-repo fallback.
11. **Show the summary in chat:** a health line, then the suggestions grouped by type, each with
    its ID, one-line what/why, effort (S/M/L), and risk.
12. **Ask for approval:** *"Which suggestions should I apply? Reply with IDs (e.g. F1, I2, R1), 'all
    fixes', or 'none'."* Use `AskUserQuestion` in Claude Code; in other agents ask in chat and **stop**.

### Phase 4: Apply only what's approved

13. For each approved ID, in order Fix → Improve → Docs → Polish → Remove:
    - load the matching skills and access router, prepare in **dev** or locally, use the chosen
      method's available validation, and read back authorized saves (connections + layout + settings);
    - tests with side effects still need their own OK (`Documentation/08-testing-and-qa.md`);
    - export with source installation UID and add a CHANGELOG describing the behavior change;
      private report IDs, paths and evidence stay in the external report, not public documentation.
14. **Publishing is separate.** Do not assume a live update ends in a draft: verify the installed
    version and access method, and treat published-target changes as potentially live. Prepare a
    separate unpublished candidate when live modification is not authorized. Publishing needs
    the owner's explicit OK for that workflow.
15. **Update the report:** mark each suggestion `applied` / `declined` / `deferred`. Report what's
    pending on the owner's side.

## Suggestion types (IDs)

| ID | Type | Covers | From checklist tier |
|---|---|---|---|
| `F#` | **Fix** | Bugs, security holes, broken connections, silent failures, spec violations | MUST FIX |
| `I#` | **Improve** | Error handling, retries, idempotency, performance, splitting/merging workflows, removing redundant nodes | SHOULD FIX |
| `P#` | **Polish** | Naming, sections and sticky text, descriptions, node notes, tags, tidy layout | NICE TO HAVE |
| `D#` | **Docs** | Spec, README, AGENTS IDs, CHANGELOG, architecture out of sync; repo export drifted from live | — |
| `R#` | **Remove** | Whole workflows (or large dead branches) that aren't needed anymore | — |

Each suggestion states: **what** to change, **why** (evidence + the doc or standard), **effort**
(S < 15 min, M < 1 h, L > 1 h), and **risk** (what could break, e.g. "active webhook, clients call it").

## Removal checks (before proposing any `R#`)

A workflow is a removal candidate only with evidence, e.g. `TEMP`/`test` in the name, no
executions in 30+ days while inactive, a newer workflow that replaced it, or no caller for a
sub-workflow. Before proposing it, confirm and list in the suggestion:

- **No callers:** no other workflow references its ID in an `Execute Workflow` node, and none uses
  it as `settings.errorWorkflow` (search the project's live workflows and repo JSON).
- **No inbound traffic:** if it has a webhook/form trigger, whether it's active and had recent
  executions (someone may still call it).
- **Not in the docs as current:** or name the doc lines that need updating if it goes.
- **What's lost:** Data Tables/credentials only it uses. **Never** suggest deleting those in the
  same step. They're a separate `R#` if at all.

Applying an approved `R#`: export first → unpublish if active (this is outward, so confirm again
right before) → `archive_workflow` → move its JSON to `workflows/_archive/` → update README, AGENTS,
and CHANGELOG. Archived workflows can be restored; nothing is deleted.

## Anti-patterns

| Mistake | What goes wrong | Fix |
|---|---|---|
| Fixing things during the audit | Unapproved changes, and side effects in live workflows | Read-only until approval (Non-negotiable 1) |
| Generic best-practice findings that the project deliberately chose against | Noise; it contradicts the owner's decisions | Check `decisions.md` first (Non-negotiable 2) |
| "Consider improving error handling" | Can't act on it, can't approve it | Evidence + exact change + ID |
| Expanding a scoped "go ahead" to unrelated changes | Changes the owner didn't mean | Apply only the concrete approved proposal (Non-negotiable 4) |
| Deleting a workflow | Irreversible; a client webhook may still call it | Archive after the removal checks |
| Test runs to "confirm" a finding | Real emails/messages sent | Read past executions instead |
| Report only in chat or committed to Git | Lost history or private evidence exposure | External dated private report and index |
| Auditing only the live workflows | Misses doc drift and repo exports that are out of date | Phase 1 reads all three sources |

## References

| File | Read when |
|---|---|
| [references/AUDIT_CHECKS.md](references/AUDIT_CHECKS.md) | Phase 2: the full list of project-level checks |
| [references/REPORT_TEMPLATE.md](references/REPORT_TEMPLATE.md) | Phase 3: writing the report |
| `n8n-workflow-lifecycle-official` → `references/REVIEW_CHECKLIST.md` | Phase 2 step 6: per-workflow checks and severity tiers |
| `n8n-workflow-sections`, `n8n-project-sizing` | Checking layout, and whether a workflow should be split or merged |
| `n8n-workflow-export` | Applying changes: export + CHANGELOG |
