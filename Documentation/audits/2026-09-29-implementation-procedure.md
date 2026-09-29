# Implementation procedure — Automation Workspace and Control Center

**Date:** 2026-09-29  
**Status:** planning only; nothing in this procedure has been implemented or authorized for execution.  
**Reference:** [Codebase audit](2026-09-29-codebase-audit.md), reviewed against checkout `faa58cc`.  
**Coverage:** every audit item, F1–F17, I1–I8, D1–D3, and P1.

This document describes how to implement the audit recommendations, in a safe dependency order. Creating this document does not approve the fixes, database migrations, project-file changes, dependency installation, commits, deployment, workflow writes, or production tests. Existing source code, configuration, dependencies, project data, workflows, and the audit report are to remain unchanged during this planning task.

Paths in the implementation instructions are relative to the workspace root unless otherwise stated. Proposed module names, schema names, and test commands are design suggestions; they do not exist until an approved implementation creates them. Existing modules named below were identified in the audit. Locate functions by name when implementing: line numbers can change.

## 1. How to use this procedure

1. Select the audit IDs approved for implementation. Record that selection in the work log.
2. Read the prerequisites for those IDs. Approval of a fix is not automatically approval of every optional improvement listed here.
3. Include narrowly necessary internal safeguards and regression tests in the selected fix. If a prerequisite becomes a materially separate feature, explain it and obtain scope approval before building it.
4. Work through one batch at a time. Finish its tests, evidence, and documentation before starting the next batch that depends on it.
5. Keep implementation verification separate from live-data migration and deployment. The latter receive a specific target, recovery plan, and approval.
6. Mark an item complete only when its acceptance conditions pass. A successful typecheck alone is not sufficient.
7. Preserve the audit's IDs in change descriptions and test evidence. Do not renumber findings.

The workspace [audit skill](../../Skills/n8n-project-audit/SKILL.md) says, “Ask before acting, per suggestion.” The owner's current instruction is stronger for this turn: produce a plan only. Do not ask for implementation approval merely to finish this document.

### 1.1 Approval boundaries for future work

| Action | Required boundary |
|---|---|
| Write this procedure | Authorized now |
| Edit app/scripts/tests/docs for selected fixes | Future approval identifying the IDs or clearly named scope |
| Add a local dependency needed by an approved implementation | Explain the dependency and include it in the selected scope; do not bundle unrelated upgrades |
| Run fixture tests/builds in an isolated sandbox | Part of approved implementation verification; must not load real credentials or production state |
| Change existing client briefs | Not authorized; agents must keep them read-only |
| Apply a migration to real Control Center state or project files | Show the dry-run result and recovery point; obtain approval for that concrete migration |
| Restore/create/update/publish a real n8n workflow | Separate explicit approval for target instance/workflow/action; identify published targets first |
| Restart/update the running Control Center | Approval for the concrete tested release and maintenance window |
| Commit or push | Follow workspace approval requirements; stage only approved files; pushing is separate |
| Remove a workflow/project or purge data outside an already approved retention policy | Separate explicit scope; preserve recovery where applicable |

No step assumes a paid n8n environment feature, `$env`, or `$vars`. Control Center process configuration is distinct from n8n workflow variables. Multi-instance tests use mock instances; they do not require contacting or changing the secondary real instance.

## 2. Recommended batch order and dependencies

The audit groups related problems. This procedure moves test isolation and minimal recovery primitives earlier because later fixes depend on them. Large optional features, such as a complete backup UI, need not block a narrowly scoped scanner fix.

| Batch | Main work | Audit IDs | Exit gate |
|---|---|---|---|
| 0 | Establish baseline, approved scope, protected sandbox | Prerequisite | Real data and running services cannot be reached by test defaults |
| 1 | Regression harness, atomic-write primitive, recovery baseline | I1, minimal I2/I3 | Tests can inject network/filesystem/database failures safely |
| 2 | Shared secret checks and preflight submissions | F2, F3, F4 | Known-secret fixtures cannot silently persist or commit |
| 3 | Instance/workflow identity, metadata comparison, restore | F1, F7, F6, F5 | Two mock instances remain isolated and restore retries are safe |
| 4 | Commit exact approved content | I4; completes F3 integration | Approved snapshot equals committed snapshot |
| 5 | Catch-up sync, health calculations, metrics and retention | F10, F8, F9, F11, F12, F13 | Gaps, duplicates, late completions and clock boundaries behave correctly |
| 6 | Complete operation recovery, settings persistence, state backups | Remaining I2, I5, remaining I3 | Failure injection and independent restore drill pass |
| 7 | Release staging, rollback, service definitions | F14, F15 | Every supported platform has tested failure recovery or an explicit unverified status |
| 8 | Bounded inbox, brief text, UI behavior, background visibility | F16, F17, P1, I6 | Request limits and UX checks pass; background failures are visible |
| 9 | Consolidation, dependency maintenance, documentation closure | I8, I7, D1, D2, D3 | Clean isolated build and coherent documentation |
| 10 | Owner review, approved migrations, release, observation | Selected IDs only | Evidence supports completion; remaining gaps are stated |

Dependencies to preserve:

- F5 depends on F1 identity, F2/F4-style preflight validation, F6 structural serialization, F7 comparison, and minimal I2 recovery records.
- F3's full commit guarantee depends on I4. A scanner-only patch must not claim that committed bytes are verified if the commit flow still races.
- F8 and F11 depend on the execution-state model established by F10. Do not add a second independent counting mechanism.
- F12 must clean up every new instance-owned table/cache introduced by F1/F10.
- F13 must handle the monitoring ledger and aggregates from F10/F11, not only the original tables.
- F14 depends on a verified backup/restore baseline and a clear schema-compatibility policy.
- I8 is incremental consolidation after behavior tests exist, not a prerequisite rewrite.
- D1–D3 are updated alongside behavior changes; batch 9 is the final consistency pass.

## 3. Design decisions to record before coding

These are recommended defaults for a future approved implementation. They are proposals, not existing behavior. Change them only with a written reason and corresponding acceptance tests.

| Decision | Recommended default | Reason |
|---|---|---|
| Workflow identity | Local logical workflow key plus `(installation UID, remote workflow ID)` bindings | Names, URLs and remote IDs alone do not establish ownership |
| Where bindings live | Versioned, non-secret project manifest; SQLite holds local installation connection details and cached indices | Project association remains recoverable with project files |
| Ambiguous legacy identity | Show unresolved candidates and block writes until explicitly resolved | Never guess which project's backup can be overwritten |
| Cross-instance restore | Explicit target mapping; source binding remains intact | Copying to another instance must not transfer source ownership |
| Unsupported target API capability | Report the limitation and block the affected action or require a clearly scoped manual mapping | Never invent an endpoint or assume credential rebinding |
| Unscannable file | Distinct result requiring visible policy treatment; never call it scanned/clean | Pattern scanning does not cover arbitrary binary content |
| Success rate | Successes divided by successes plus failed/crashed terminal runs, with canceled/other shown separately | Running and canceled work must not masquerade as failure or success |
| Failure-streak order | Start-time order, with deterministic ID tie-break; reconcile later terminal changes | Maintains the current conceptual ordering while making overlap/retries explicit |
| Canceled/unknown terminal outcome | Break the claim of consecutive failures and show an indeterminate boundary | An unknown result does not prove another failure or success |
| Log filtering versus health | Minimal execution facts power health; detailed logging is separately filtered | Errors-only logging must not imply a 0% real success rate |
| Retention versus trash | Ordinary time-based log retention still applies while a project is in trash | Project recovery must not silently extend sensitive-data retention |
| Partial remote success | Durable operation state and reconciliation; no automatic create retry after uncertainty | The remote server may have succeeded even when the response was lost |
| Release update | Complete isolated release, including dependencies; shared data remains outside releases | Swapping only compiled files cannot restore a dependency change |

If preserving a different success-rate or streak definition is preferred, decide before schema implementation and use that definition consistently in cards, logs, chart, table, documentation, and tests.

## 4. Batch 0 — Establish a clean, isolated starting point

### 4.1 Record the approved work and current state

1. Read root `AGENTS.md`, optional `AGENTS.local.md`, `Skills/INDEX.md`, this procedure, and the original audit.
2. For work touching a private project, read its own `AGENTS.md`, spec, decisions, and client brief without editing the brief.
3. Reload relevant skills at the actual decision point. Before live n8n work, use the official router and the relevant lifecycle/credential/subworkflow/export skills.
4. Record the current commit, branch, Git status, package-lock hash, runtime versions, and IDs in scope. Treat audit test results as historical until rerun for the new implementation.
5. Preserve unrelated changes. At plan creation, `.claude/settings.local.json` and the audit directory were untracked. Do not stage, delete, or overwrite unrelated files.
6. Inspect attached worktrees before creating an isolated checkout. Prefer a suitable free checkout; use the managed worktree tool if a new one is necessary. Use a `codex/` branch unless the owner requests another name.
7. Ensure the selected checkout contains the current audit/procedure even if those files are not committed. Copy only the authorized documentation, not private data or local credentials.
8. Record implementation batches as not started. Keep live migration and deployment fields separately unapproved.

### 4.2 Build the test boundary before importing application services

1. Use a dedicated scratch workspace containing fictional project folders and a dedicated temporary SQLite database.
2. Make filesystem roots and service dependencies explicit in tests. Never let a missing test setting fall back to the real `WORKSPACE_ROOT`, `DATABASE_PATH`, `.env.local`, or project registry.
3. Use an isolated app working directory for integration tests. `envfile.ts` currently derives its target from `process.cwd()`, so setting only a database path is insufficient.
4. Do not copy real `.env.local`, `AGENTS.local.md`, SQLite files, client attachments, or workflow exports into routine fixtures.
5. Fake n8n through an injected transport or loopback mock server. Reject all other outbound network requests. Fake tokens are generated at test runtime.
6. Disable real scheduler startup, trash purge, automatic export/commit and real service management in the harness before calling `register()` or importing modules with side effects. Dependency injection is preferable to relying on a developer remembering several switches.
7. Route CLI project operations to a sandbox projects root. Verify every helper respects it; some scripts derive roots from their own file location and must be made injectable before testing mutations.
8. Use temporary Git repositories only for commit tests. If selected scope includes these tests, disclose that they create disposable fixture commits, never project/workspace commits or pushes.
9. Use a different loopback port for the fixture application. Leave port 3100 and the user's running app untouched.
10. Add a startup assertion that prints only the non-secret scratch location and refuses a production path. Teardown removes only the verified scratch directory, using native path-safe operations.

**Gate:** intentionally omit a sandbox setting once and verify that the harness refuses to start rather than discovering the real data directory.

## 5. Batch 1 — Testing and recovery foundations

### I1 — Build a regression harness around the risky behavior

**Primary files:** `app/package.json`, `app/src/lib/sanitize-core.test.mjs`, domain modules under `app/src/lib/`, `.github/workflows/ci.yml`. New test folders/runner choices are proposed.

1. Keep the existing 14 sanitizer tests and record their baseline result in the isolated checkout.
2. Select one test approach capable of loading the repository's TypeScript on supported Node versions. Do not rely on Node 24-only stripping if CI still supports Node 22. Prefer a small established runner or compiling test inputs with the existing toolchain; document any new development dependency.
3. Extract minimal injectable boundaries: filesystem, database connection, n8n transport, clock, Git executor, and service/process runner. Keep production defaults unchanged until their replacement is tested.
4. Create builders for two mock instances, two fictional projects, workflows with identical remote IDs, terminal/nonterminal executions, uploads, and temporary Git repositories.
5. Add failing regression tests before fixing each selected defect. Assert externally meaningful outcomes: unchanged neighboring files, persisted identity, count accuracy, no unwanted API request, or preserved approved bytes.
6. Add failure injection at file creation, rename, DB commit, HTTP response, Git commit, scheduler lease, and health-check boundaries.
7. Add a small browser integration suite once the relevant actions are stable. Exercise normal, pending, invalid, stale-preview, and partial-failure states.
8. Update CI to run unit/integration tests, typecheck, and isolated build. Add platform-specific service-definition tests; do not claim service installation was tested just because syntax checking passed.
9. Store sanitized summaries and fixture screenshots as test evidence, with execution date, source commit, runtime, and limitations.
10. Run focused tests after each change, then the full required suite once at the batch gate. Re-run only where subsequent changes invalidate evidence.

**Done when:** the harness refuses production resources, each selected fix has a meaningful regression case, and CI collects a pass/fail result for every required test category.

### I2 — Establish atomic writes and recoverable operations

**Primary files:** `app/src/lib/projects.ts`, `workflow-import.ts`, `restore.ts`, `changelog.ts`, `envfile.ts`, `test-results.ts`, `brief.ts`, plus a small shared file-operation module.

Implement the atomic-file helper early; finish its multi-step callers in batch 6.

1. Define a single-file write operation: validate destination, create a unique temporary file in the same directory, write the complete bytes, flush where supported, verify, then replace the destination using tested OS behavior.
2. Do not truncate or delete the old destination before a replacement is ready. A failed write must leave either the prior complete file or the new complete file, not an empty intermediate file.
3. Validate resolved paths against their allowed root. Where symlinks/junctions are possible, verify the actual destination parent and refuse traversal outside the project/scratch root.
4. Add per-project coordination across application mutation paths and CLI operations. A process-local boolean alone is insufficient where CLI and app can run concurrently. Use ownership, bounded leases or OS locks, and a clear stale-lock recovery policy.
5. Define operation records for multi-step work: operation ID, kind, non-secret target IDs, expected before/after hashes, state, timestamps, error class, and recovery instructions. Do not put secrets, client payloads, or raw workflow content in the journal.
6. Use explicit states such as prepared, remote outcome unknown, remote applied, local applied, completed, and needs recovery. Make transitions durable and idempotent.
7. Refactor workflow export plus changelog/bindings updates to use this boundary. A partial local update must remain visible and resumable.
8. For trash moves, retain `.registry-row` until the folder move and registry update succeed. On copy fallback, copy to a temporary destination, validate it, promote it, then remove the source. Handle failure to remove the source as an incomplete move, not a successful delete.
9. Never hold a long SQLite transaction across network requests or filesystem copying. Use short transactions and durable operation states.
10. Add startup recovery that reports interrupted work. Automatically finish only deterministic local steps with verified hashes; never retry an uncertain remote create automatically.

**Tests:** write denial, disk-full simulation, failed rename, concurrent writers, process interruption after each state, partial copy, and registry failure. Existing client brief contents must not be changed by these tests or by recovery without owner action.

**Rollback:** preserve the previous complete bytes and operation record. If new writes have occurred, reconcile them; do not roll an entire project back silently to an older folder copy.

### I3 — Establish and later productize a Control Center recovery point

**Primary files:** `app/src/lib/db.ts`, `paths.ts`, settings/maintenance modules, service scripts, app README. A backup module and optional UI are proposed.

1. Inventory what must be recoverable: SQLite, project bindings, project files/Git history, protected secret configuration, release identity, schema version, runtime version, and service configuration.
2. Define backup destination, retention, access restrictions, and operator ownership. Keep backups out of the public workspace repository and ordinary test fixtures.
3. Use a database-consistent snapshot through the library's supported backup mechanism or a verified SQLite backup operation. Do not assume copying a live main database file captures WAL state. SQLite documents its [Online Backup API](https://www.sqlite.org/backup.html) for consistent snapshots.
4. Coordinate file/DB snapshots with a brief mutation pause or versioned snapshot protocol so a binding manifest and its database references correspond to the same recovery point.
5. Save non-secret metadata and checksums beside the snapshot. Store secrets separately with restrictive OS permissions and an approved protected-storage method. Never include secret values in evidence or activity logs.
6. Verify the snapshot using integrity checks and an isolated restore. Check schema version, instance IDs, workflow preferences, representative counts and local project associations.
7. Restore first into a disposable environment with credentials disabled and schedulers off. Confirm that it does not call n8n or start purge/export jobs.
8. Record what a project Git backup does and does not cover. A local commit, a pushed private remote, and a state snapshot are separate states.
9. In batch 6, add the user-facing backup/restore workflow only if I3's product scope is approved. Expose completion, last verified restore, and failures accurately.
10. Before any real migration/release, produce a fresh recovery point and confirm it can be opened. Do not overwrite the sole existing known-good backup.

**Done when:** an isolated restore reproduces required configuration and history, secrets remain protected, and the owner has a usable recovery procedure. A snapshot file alone is not completion.

## 6. Batch 2 — Prevent secret leakage before persistence

### F2 — Fix expression scanning and cover retained workflow content

**Primary files:** `app/src/lib/sanitize-core.mjs`, its declarations/tests, `workflow-import.ts`, `restore.ts`, `scripts/export-workflow.mjs`.

1. Add a failing fixture with a generated fake token inside an expression literal; verify that the existing scanner incorrectly accepts it.
2. Separate two checks: known token-format detection anywhere in text, and context-sensitive checks for suspicious literal values in credential-like fields.
3. Run known-format detection before deciding whether the string is an expression. A leading `=` must never skip all inspection.
4. Permit references such as incoming data or credential-bound parameters without declaring every expression trustworthy. Do not attempt to execute an expression to inspect it.
5. Traverse every retained export field: node parameters, code strings, URLs, node notes, workflow description, sticky content and additional retained properties. Apply depth/size bounds and return a clear scan-incomplete result when they are exceeded.
6. Keep credentials as permitted references only. Validate their shape; never retain embedded credential material merely because it is under a credentials property.
7. Return structured diagnostics containing field path, node name when applicable, and secret category. Never include the matching value or a source excerpt containing it.
8. Reuse exactly the same scanner in app import, restore, scheduled export, CLI export, and commit preflight where applicable.
9. Test positive and negative cases, including expression literals, ordinary references, escaped text, nested arrays, notes, large input, and strings resembling placeholders.

**Pass criteria:** all known-secret fixtures are blocked before writing; ordinary workflows still import; no test output contains the generated secret value.

### F3 — Scan every proposed commit candidate honestly

**Primary files:** `app/src/lib/git.ts`, `leak-scan.ts`, shared scanner, backup UI and I4's snapshot service.

1. Replace the implicit clean/null result with explicit outcomes: clean, detected, unsupported, and read-error.
2. Inspect content and encoding rather than using only the filename extension. Handle extensionless text and UTF-8/UTF-16 fixtures deliberately.
3. Replace the silent 2 MiB skip with bounded scanning. For supported large text, scan chunks with sufficient carryover/state to detect matches spanning boundaries. If the detector cannot safely support the size/encoding, return unsupported.
4. Treat unreadable files as blocked candidates with a path-only error. Deleted paths have no new blob to scan, but their deletion must still be in the approved snapshot.
5. Define a binary policy in the preview. Initially keep unsupported attachments in explicitly private/untracked storage unless the owner separately chooses a documented inclusion policy. Do not label binary evidence secret-free.
6. Scan the exact candidate Git blobs prepared by I4, not files that can change between scanning and staging.
7. Prevent automatic commits when any candidate is detected, unreadable, unsupported without an approved policy, or different from the reviewed snapshot.
8. Show an actionable explanation with file and issue category. Do not echo the matching bytes.
9. Test oversized text, unknown extension, UTF-16, matches across chunk boundaries, unreadable files, binary files, deletions, renames, and changed-after-preview content.

**Pass criteria:** there is no path that silently equates not scanned with clean. The commit result identifies the actual scanned/approved content.

### F4 — Preflight briefs, uploads, and test evidence before saving

**Primary files:** `app/src/lib/brief.ts`, `test-results.ts`, `app/src/app/actions.ts`, client brief/test-result forms, new-project form.

1. Build a submission plan in memory containing all text fields, proposed filenames, sizes, types, destination, and scan outcomes.
2. Validate file count, per-file size, aggregate size, names and reserved filenames before creating permanent directories or files. Reconcile the form limits with the server-action body limit.
3. Scan all supported text, including title/workflow fields and readable attachments, not just the notes field.
4. Apply F3's unsupported/binary policy explicitly. Provide a private destination option if that feature is selected; ensure it is excluded from automatic Git commits and clearly identified to the user.
5. If any required preflight fails, save nothing from that submission and leave the editable form intact. Avoid returning a generic failure after some files have already been saved.
6. Persist the accepted submission with I2's atomic/staged operation. If multiple files are involved, retain a recoverable manifest until completion.
7. For project creation, validate the submitted brief/files before scaffolding or make partial project creation an explicit resumable state. Do not auto-commit rejected or unscanned content.
8. Replace the ambiguous saved-but-`ok:false` result with typed outcomes: rejected, saved, or saved-with-explicit-limited-scan policy. The UI must describe the real state.
9. Update documented claims to match implemented coverage. Pattern scanning does not establish that arbitrary PII, screenshots, PDFs or encrypted documents contain no secrets.
10. Test a mixed valid/invalid batch, duplicate filenames, generated secret text, large files, unsupported binary, write failure midway, and retry without duplicate attachments.

**Pass criteria:** a rejected submission causes no permanent write/commit; accepted content is saved once; original client brief files are never rewritten by an agent as part of remediation.

## 7. Batch 3 — Identity, export comparison, and restore

### F1 — Introduce a stable instance/workflow binding model

**Primary files:** `app/src/lib/instances.ts`, `db.ts`, `projects.ts`, `workflow-import.ts`, `n8n.ts`, `auto-export.ts`, restore service and workflow/project UI.

1. Define an immutable local installation UID separate from the editable instance label, URL, or slug. Re-adding a different installation must not reuse its predecessor's identity.
2. Define a logical workflow key independent of any one n8n workflow ID. Keep the portable export filename stable.
3. Propose a versioned non-secret project manifest, for example `documentation/workflow-bindings.json`, containing logical key, relative export path, source binding, target bindings, and mapping status. Do not store URLs with credentials, API keys, or local absolute paths.
4. Make `(installation UID, remote workflow ID)` resolve to at most one logical workflow in a workspace. If duplicates exist across project manifests, report a conflict and block writes.
5. Keep local connection details in SQLite. Back up installation identity and preserve it when moving the same installation to another host; require explicit reconciliation when importing a project manifest into a different Control Center installation.
6. Add an additive SQLite migration for immutable identity and index/operation support. Do not assign a legacy source solely from a matching name or ID.
7. Build a read-only migration report listing files with unique evidence, ambiguous matches, missing exports, duplicate mappings, or unreachable instances. Missing access means unresolved, not permission to guess.
8. Have the owner approve the real binding decisions. Apply manifests atomically with a saved before-state; verify each result by reading it back.
9. Replace ID-only lookup in import, workflow rows, scheduled export, project association, and restore with the common resolver. Prefix/tag fallback may remain a read-only suggestion, never authorization to overwrite an existing tracked export.
10. Treat connection URL changes as either a verified move of the same installation or a new installation identity. Do not silently transfer cache/preferences/history to a different server.
11. Preserve the source export's remote ID for compatibility while making the manifest authoritative for association. Update portable serialization rules explicitly rather than mixing metadata into n8n node content.
12. Add migration diagnostics and a visible unresolved state; unresolved workflows can be viewed but cannot auto-export/restore over a file.

**Tests:** identical IDs on instances A/B; same names/different IDs; same ID in two project folders; removed/re-added instance; changed URL; project moved to another machine; ambiguous old export; interrupted manifest migration; repeated migration.

**Pass criteria:** importing B never changes A's file or logs, and a second migration run makes no additional changes.

**Rollback:** disable new write paths, preserve migrated manifests/DB snapshot, and restore only the coordinated pre-migration state if no later work would be lost. Otherwise use a forward correction; do not re-enable the old ambiguous ID-only writer.

### F7 — Compare everything that the export promises to preserve

**Primary files:** `sanitize-core.mjs`, declarations/tests, import/auto-export/CLI consumers.

1. List every retained portable field and distinguish it from runtime-only data and source association.
2. Define canonical comparison over that portable content, including description, tags and node groups when supported.
3. Sort object keys deterministically. Preserve array order unless the target API semantics prove it is a set; tag names may be normalized as a set if order is confirmed irrelevant.
4. Keep remote identity checks in F1's resolver. Do not use a content hash as proof of source ownership.
5. Reuse one comparison function for UI status, scheduled export, CLI export and restore verification where appropriate.
6. Decide how old files are normalized. Display a one-time metadata refresh as such; do not auto-commit an unexpected workspace-wide rewrite.
7. Ensure no-change exports do not append duplicate changelog entries. Actual retained metadata changes must append one entry.
8. Test each retained field changed alone, object-key reorder, runtime timestamps, pin data, and malformed nodes/connections.

**Pass criteria:** all intended backup content triggers change detection; runtime-only changes do not.

### F6 — Replace IDs through structured serialization

**Primary files:** `app/src/lib/restore.ts`, F1 manifest service, shared serialization tests.

1. Write failing tests for minified JSON, different indentation, reordered properties, absent ID, and nested node IDs with similar text.
2. Remove raw-string ID replacement from restore.
3. For a cross-instance create, update only the target binding; leave the source export ID and source binding intact.
4. For an explicitly approved replacement of the source workflow, update the top-level source identity using parsed objects and the binding operation, preserving an auditable previous association.
5. Serialize with the agreed pretty-print convention, persist atomically, parse the saved result and verify its intended ID/binding.
6. Make identity persistence resumable through the restore operation record rather than repeating the remote create.

**Pass criteria:** formatting never controls whether an identity update succeeds, nested node IDs do not change, and subsequent restore targets the already-created remote workflow.

### F5 — Implement a target-aware restore plan and recovery flow

**Primary files:** `restore.ts`, `n8n.ts`, `app/src/app/actions.ts`, `components/restore-button.tsx`, binding/operation modules.

#### A. Establish the target API contract

1. Read the selected instance/version metadata and official API capabilities before implementing requests. The [n8n API documentation](https://docs.n8n.io/api/) is the starting point; do not assume all servers expose identical operations or credential discovery.
2. Verify create/update payload fields, credential reference behavior, workflow dependency fields, response shape, publication behavior, and conflict/version support on the supported version. Record unsupported capabilities.
3. If metadata-only credential enumeration is unavailable, require explicit owner-provided target mappings that can be validated with available capabilities. Never fetch credential secrets or assume matching display names are unique.
4. Preserve existing published-state safeguards. Do not promise a REST update changes only a draft until that behavior is verified for the target version. Prefer an unpublished copy where published-update semantics are uncertain.

#### B. Prepare a read-only preview

5. Resolve source and target by F1's binding model. Verify the actual target identity, current name, publication status and version/content hash.
6. Parse and validate the export using the shared schema/connection checks. Run F2's full-content scan before any remote write.
7. Enumerate target-specific references: credentials, Execute Workflow/subworkflow IDs, error workflow, caller restrictions, and any resource identifiers that require a target-specific decision. Do not silently rewrite arbitrary strings or code.
8. Build explicit source-to-target mappings. Block absent or ambiguous mappings. Dynamic expressions referencing remote resources require review and must be labeled unresolved when automatic validation cannot establish safety.
9. Produce the exact proposed target payload and a preview showing create/update, actual target ID/name, mappings, omitted unsupported fields, publication implications, and warnings.
10. Store a short-lived server-side plan token bound to source hash, target installation UID, target ID/version, mapping revision and intended action. A client boolean is not proof that this exact preview was approved.

#### C. Apply only the approved plan

11. Re-read source and target immediately before execution. If either changed, expire the plan and require a refreshed preview. Use API version preconditions if available; otherwise disclose the remaining race and prefer an unpublished copy for sensitive cases.
12. Acquire a scoped operation lease and persist a prepared record before sending the request.
13. Send only the verified payload to the verified target. Never publish implicitly; publication remains a separate operation.
14. Persist the returned remote ID/result immediately. If the request times out after possible success, record remote-outcome-unknown. Do not automatically retry POST/create.
15. Read back the saved remote graph and compare relevant portable content and resolved references. Report verification mismatch as partial/failed verification, not complete success.
16. Save target binding, changelog and operation completion atomically where possible; otherwise use I2's recoverable local transaction sequence.
17. Return typed results that distinguish remote applied/local pending, remote outcome unknown, blocked preflight, completed, and failed-before-write.
18. On retry, resume/reconcile the same operation ID. If no uniquely verifiable remote result can be identified after a lost response, require manual reconciliation rather than guessing by workflow name.

**Tests:** create/update; two instances with conflicting IDs; missing/duplicate credential names; error-workflow/subworkflow mappings; stale source/target preview; changed published state; lost HTTP response; remote success/local failure; readback mismatch; retry; unsupported payload field. All routine tests use mocks.

**Live gate:** name the target instance/workflow, show the final preview, obtain explicit write permission, use an unpublished fixture without real downstream side effects, then read it back. Do not publish or execute it automatically.

**Rollback:** local code rollback does not reverse a remote write. Preserve the prior remote version/authorized backup and propose a separate corrective restore if needed. Never delete a newly created remote workflow merely to hide an uncertain operation.

## 8. Batch 4 — Commit exactly what the owner reviewed

### I4 — Bind preview, scan, and commit to one immutable snapshot

**Primary files:** `app/src/lib/git.ts`, `projects.ts`, `auto-export.ts`, `app/src/app/actions.ts`, `components/backup-card.tsx`.

1. Define a commit preview object containing project repository identity, expected HEAD, selected paths/statuses, before/after content hashes or Git object IDs, scan outcomes, changelog proposal, expiry, and server-side preview token.
2. Build the candidate from an isolated Git index initialized from the expected HEAD, then overlay only approved additions/modifications/deletions/renames. Keep the user's actual index and unrelated staged work intact.
3. Store approved bytes as immutable candidate blobs and scan those blobs through F3. Do not re-read arbitrary working-tree content after approval and assume it is the same.
4. Handle Git attributes, line-ending normalization and clean filters explicitly. Scan the actual staged representation that will be committed; a filter must not introduce unchecked content. Block unsupported or side-effectful filter behavior until deliberately handled.
5. Enforce changelog requirements in the domain service, not just the dialog. A workflow change needs a matching changelog update; a missing changelog is either created as part of the visible candidate or blocks the operation.
6. Return the exact file list and changes to the dialog. If an editor, another browser tab, or auto-export changes a candidate afterward, invalidate the preview or retain the immutable approved version with a clear changed-since-preview notice. Default to requesting a fresh preview.
7. Acquire project commit coordination, verify repository/HEAD/preview validity, and commit the approved candidate tree. Do not use a path-based commit that substitutes unreviewed working-tree bytes. Git documents that path arguments can select working-tree content rather than the prepared index ([git commit documentation](https://git-scm.com/docs/git-commit)).
8. Respect configured hooks/signing requirements. Do not silently bypass them to make a commit work. Detect candidate-tree changes made by hooks and require review of a changed candidate. Use a tested expected-HEAD update strategy; a process-local app lock cannot prevent an external Git client from moving HEAD.
9. Verify the resulting commit tree/path set against the approved candidate. If it differs, report the mismatch and preserve evidence; never describe it as the approved successful backup.
10. Reconcile only approved paths in the real index after success, preserving unrelated staged/unstaged changes. If the real index changed concurrently, stop reconciliation and report it rather than overwriting it.
11. For scheduled auto-commit, construct an equally explicit allowlist of workflow file, binding manifest and generated changelog entries. Preserve existing manual edits to shared files; if separation is ambiguous, skip auto-commit and request review.
12. Record SHA, approved paths, operation ID and scan summary. Never push automatically.

**Tests:** an unrelated file appears after preview; selected content changes; HEAD changes externally; pre-existing staged changes; staged/unstaged differences in one file; rename/deletion; secret introduced by a filter; hook failure/modification; missing changelog; auto-export plus manual changelog edits.

**Pass criteria:** approved candidate tree equals committed tree; unrelated index/worktree content remains intact; stale previews and scan failures produce no commit.

**Rollback:** a successful commit is history, not disposable temporary state. Propose a corrective commit if necessary; do not reset or rewrite the owner's history automatically.

## 9. Batch 5 — Accurate synchronization and monitoring

### F10 — Make synchronization resumable and gap-aware

**Primary files:** `app/src/lib/n8n.ts`, `db.ts`, `settings.ts`, `instrumentation.ts`, workflow health and dashboard services.

1. Verify supported API pagination, ordering, filters and execution status semantics using the selected instance version. Treat cursors as opaque and potentially expiring; do not sort opaque IDs numerically.
2. Design additive storage for sync state and minimal execution facts. Suggested fields include immutable instance UID, execution ID, workflow binding, start/stop timestamps, last observed status, first/last observation time, and reconciliation state. Do not retain output payloads merely to count runs.
3. Separate detailed log retention/filtering from the minimal facts needed for health. Explain this distinction in settings: Stop detailed logging must not silently imply Stop all monitoring. If the owner chooses to stop monitoring entirely, honor it and label metrics incomplete/excluded.
4. Store last attempt, last fully reconciled boundary, current catch-up state, pending execution set and any known history gap per instance.
5. Start from the newest page and page backward to a verified previously processed boundary with overlap. Use durable IDs/timestamps and deduplication, not a fixed count of pages as proof that synchronization is complete.
6. Keep a bounded per-tick work budget. If the boundary is not reached, persist resumable progress and show catching up. Resume without skipping newly arriving executions; add a fresh-head overlap pass as required by the API's pagination behavior.
7. On cursor expiry, restart from a safe overlap/boundary and deduplicate. On upstream retention loss, record an unrecoverable gap with known bounds instead of claiming complete history.
8. Independently revisit known pending/running/waiting executions until terminal or unavailable. Schedule retries with backoff; a 404 from upstream is unavailable history, not a successful execution.
9. In one short transaction, upsert observed facts, apply status-transition accounting, update detailed logs according to preferences, and advance only the corresponding durable processing state.
10. Do not advance the complete watermark if a required page or transaction failed. A successful first page followed by a failed next page is partial, not an overall successful catch-up.
11. Reconcile late changes to terminal status deterministically and invalidate/recompute affected health/aggregate buckets.
12. Backfill existing data from available stored rows and n8n history without asserting that filtered/pruned history was recovered. Expose the earliest trustworthy coverage date.

**Tests:** 750 new executions with a per-tick budget smaller than the backlog; overlap duplicates; identical timestamps; newly arriving runs during pagination; crash after page write; cursor expiry; 429/500/timeout; upstream history removed; a long-running execution finishing after it leaves the newest pages; status correction after initial ingestion.

**Pass criteria:** eventual unique ingestion, explicit incomplete coverage, accurate pending reconciliation, and no watermark advancement past unpersisted work.

### F8 — Calculate failure streaks from reconciled terminal facts

**Primary files:** `app/src/lib/workflow-prefs.ts`, F10's execution fact/reconciliation service, `db.ts`.

1. Write a failing test using a three-run sliding page window followed by additional new failures; demonstrate the existing count remains capped.
2. Implement the documented order and classification from section 3. Make a pure reducer accept ordered facts and return streak, last success, last run and coverage confidence.
3. Keep stable execution identity in the reducer input. Re-reading an unchanged failure must not increment the streak again.
4. Exclude manual runs only according to the explicit health preference. Evaluate canceled/unknown outcomes according to the agreed boundary rule; never count them as proven failures.
5. Recompute the affected workflow's tail when an older running execution becomes terminal or a terminal result changes. A simple increment-on-fetch is insufficient for out-of-order completion.
6. Preserve a compact boundary/checkpoint only when enough history exists to prove it. If history before the fetched tail is missing, display a bounded or uncertain streak rather than inventing an exact count.
7. Persist the health result in the same processing transaction as the facts/checkpoint used to derive it.
8. Reset or recompute health when ignore-manual/classification settings change. Do not combine results from different definitions without recomputation.
9. Verify that detailed logging modes do not distort monitoring when health monitoring remains enabled.

**Tests:** threshold crossings across multiple windows, repeated sync, success reset, late failure, late success, manual run toggle, canceled result, missing history, same-timestamp tie, application restart.

**Pass criteria:** the count increases for distinct qualifying failures, never for duplicates, and never claims certainty across missing history.

### F9 — Use the later of expectation start and latest success

**Primary files:** `app/src/lib/workflow-prefs.ts`, workflow settings form and alert presentation.

1. Add a pure function for selecting the alert baseline from valid `expectSince` and `lastSuccessAt` timestamps.
2. Select the later valid timestamp. No prior success means use the expectation start; no valid baseline means no false overdue assertion and a diagnosable state.
3. Preserve `expectSince` when an unchanged interval is saved. Reset it when enabling monitoring after disabled or changing the interval, following the current intended contract.
4. Define the deadline boundary precisely: due at or after baseline plus interval. Use one UTC instant/clock source; do not depend on display timezone.
5. Keep snooze independent of health state. Snoozing suppresses presentation; it must not fabricate a success or move the baseline unless the UI explicitly promises that behavior.
6. Make the alert message identify whether the current deadline comes from a successful run or a newly configured expectation.
7. Handle implausible future timestamps/clock skew as a separate diagnostic with a documented tolerance, not an indefinitely postponed alert.

**Tests:** old success/new expectation; newer success; disable/re-enable; unchanged save; interval change; exact due instant; snooze expiry; invalid timestamp; clock skew; daylight-saving display changes.

**Pass criteria:** an interval starts when intended and cannot fire early because of older history.

### F11 — Make cards, chart and table express the same metrics

**Primary files:** `app/src/lib/logs.ts`, `workflow-prefs.ts`, `app/src/app/page.tsx`, `components/exec-chart.tsx`, F10 fact/aggregate service.

1. Write the metric definitions into a short contract before changing SQL: time window, timestamp basis, eligible terminal states, manual-run handling, exclusions, instance filter and known coverage gaps.
2. Use the agreed success-rate denominator: successes plus error/crashed outcomes. Show other terminal outcomes separately and exclude running/waiting/new from that rate. Show no data rather than 0% for a zero denominator.
3. Compute aggregate metrics from reconciled facts before detailed-log filtering. If opting for a smaller implementation using retained logs, explicitly label it as retained/filtered data and do not present it as complete workflow health.
4. Maintain per-day/per-workflow aggregate updates idempotently if aggregates are introduced. On status correction, remove the prior contribution and add the new one in a single transaction.
5. Keep `excludeFromStats`, ignore-manual policy, and instance selection consistent across every aggregate query.
6. Render Other as its own neutral category; stop adding it to the Successful segment. Match legend, tooltip, accessible table, totals, and rate card.
7. Add visible coverage information when history is catching up, filtered, pruned or unavailable. Never reconstruct missing successful runs as zero.
8. Backfill only facts supported by available data. Record a monitoring start date for improved aggregates instead of presenting inaccurate historic precision.
9. Keep date bucketing consistent and documented; the current code uses UTC days. A local-day enhancement is separate unless included explicitly.

**Tests:** 8 success, 2 failure, 3 running, 1 waiting and 2 canceled produces an 80% success rate under the recommended contract; other categories remain visible. Errors-only detailed logging must not turn that into 0%. Repeat for exclusions, manual runs, empty data and per-instance filtering.

**Pass criteria:** every surface agrees and explains incomplete data.

### F12 — Remove all instance-owned state and prevent resurrection

**Primary files:** `app/src/lib/instances.ts`, `n8n.ts`, `workflow-prefs.ts`, `db.ts`, binding resolver, instance UI.

1. Inventory all instance-owned state: preferences, detailed executions, health facts/aggregates, sync checkpoints, pending operations, cache entries, secrets references and connection metadata.
2. Before removal, display the local data that will be removed and the workflow bindings that will become disconnected. Remote n8n workflows remain unaffected.
3. Mark the instance as removing or increment a connection generation so new work cannot start and in-flight workers can recognize stale ownership.
4. Cancel/drain in-flight requests where possible. Before every later write, verify the same instance UID/generation still exists.
5. Delete the approved instance-owned rows within a database transaction. Coordinate secret removal through I5's recoverable settings operation.
6. Invalidate caches and sidebar selection; ensure stale asynchronous refreshes cannot repopulate removed cache entries.
7. Retain project binding history as disconnected/tombstoned non-secret metadata rather than silently assigning it to another connection.
8. Give a newly added installation a new immutable UID even if its display slug/name matches the old one.
9. Treat a base URL edit as a verified endpoint move or a new installation, as defined in F1. Credential changes on the same installation invalidate cached requests/health as needed without inventing a new remote ownership relationship.

**Tests:** remove while sync/refresh is in flight; old alerts vanish; re-add same name; edit URL to another mock installation; secret-file removal fails; cache response arrives after removal; interrupted removal resumes.

**Pass criteria:** no orphan alerts/preferences or resurrected rows; no inheritance by a different installation.

### F13 — Enforce retention even without n8n synchronization

**Primary files:** `app/src/lib/logs.ts`, `instrumentation.ts`, `settings.ts`, `trash-cleanup.ts`, F10/F11 fact and aggregate storage.

1. Extract retention into a scheduled maintenance operation independent of whether n8n is configured or sync is enabled.
2. Store last attempted/successful retention run and a bounded lease. Run at startup and periodically with a defined interval; do not start duplicate jobs under hot reload or multiple processes.
3. Compute explicit UTC cutoffs for activity, events, detailed execution logs, minimal facts, and aggregates. Preserve per-workflow overrides where they apply.
4. Define null/invalid start-time fallback for execution cleanup, such as first observed/synced time, and test it. Do not retain malformed rows forever accidentally.
5. Preserve enough deduplication/checkpoint information to prevent retained overlap pages from recreating counts after older facts are pruned. Do not prune unresolved pending facts before their terminal/unavailable policy is satisfied.
6. Keep project trash lifetime and log retention distinct. A restored folder gets whatever history remains under the normal policy; update wording to avoid promising the entire original history.
7. Process large deletes in bounded batches with resumable progress. Make a failed prune visible rather than silently swallowing it.
8. Add a dry-run summary for real policy changes: table counts and cutoff dates without row contents. Before first application to real state, show the effect and obtain approval for the selected retention behavior.
9. Record counts and failures, never deleted row contents, in the maintenance result.

**Tests:** inbox-only setup, sync disabled, no instances, per-workflow override, null start date, repeated run, interrupted prune, trashed project, pending executions, overlap after pruning, clock boundary.

**Pass criteria:** expired data is removed according to policy without depending on an n8n API call, and monitoring totals remain correct.

**Rollback:** deleted historical rows cannot be recovered by reverting code. Recovery requires an approved snapshot restore or supported upstream backfill; state the resulting data-loss/replay window before applying it.

## 10. Batch 6 — Complete settings, storage, and recovery

### I5 — Persist settings durably before updating active memory

**Primary files:** `app/src/lib/envfile.ts`, `instances.ts`, `settings.ts`, `db.ts`, connection forms/actions, operation recovery service.

1. Make the protected configuration path an explicit application dependency so isolated releases/tests do not accidentally read/write their own unexpected `.env.local` files.
2. Define a validated settings object and recognized writable keys. Reject invalid types/ranges; do not coerce malformed persisted values silently.
3. In the env-file reader, distinguish missing file from unreadable/corrupt file. Only missing-file initialization may start with an empty template; read errors must not overwrite existing secrets.
4. Serialize values with the actual loader's quoting/escaping rules. Round-trip literal dollar signs, hashes, quotes, backslashes, spaces and Unicode through the same parser used at startup. Avoid replacement-string interpolation of secret values.
5. Use a unique same-directory temporary file, appropriate OS access restrictions, verified contents and atomic replacement. Mode 600 is not a substitute for checking Windows ACL behavior.
6. Update `process.env` only after persistence succeeds. If the operation fails, preserve the prior active configuration or mark it explicitly unavailable; never announce the failed value as saved.
7. Coordinate SQLite connection changes with secret-file updates using a recoverable operation sequence. A transaction cannot atomically commit a database and a file by itself. Persist non-secret progress and compensate or resume deliberately.
8. On process crash between file and database stages, reconcile at startup from durable state. Do not log plaintext keys in the recovery journal.
9. Mark legacy migration complete only after all durable writes/readback succeed. Make each migration step idempotent.
10. Invalidate affected caches/request generations only after the selected setting becomes active. Distinguish configuration saved from connection test failed in the UI.
11. Add concurrency tests for two settings changes. Prevent shared `.tmp` collisions and lost updates.

**Tests:** denied write/rename, disk-full simulation, missing versus unreadable file, duplicate keys, special-character values, corrupted settings JSON, crash at each operation stage, two concurrent saves, failed connection test after successful persistence.

**Pass criteria:** disk, SQLite and active memory agree after success; any partial state is explicit and recoverable after restart.

### 10.1 Finish I2 across every multi-step mutation

1. Enumerate remaining direct write callers after batches 2–5. Keep simple truly independent writes simple; use the operation service only where interruption can corrupt or ambiguously apply a multi-step action.
2. Replace unsafe writes in export, project details/registry, attachment batch save, trash move/restore and settings with the appropriate atomic or staged primitive.
3. Ensure changelog/binding updates are part of the same recorded logical operation and are not silently skipped.
4. Add per-operation retry behavior and a clear recovery message with an operation ID. Expose enough detail for repair without showing secrets.
5. Verify application startup does not silently finish outward actions. Report uncertain n8n/Git actions for reconciliation.
6. Repeat failure injection at every permanent write boundary. A passing happy path is not enough.

### 10.2 Finish I3's backup and restore operating procedure

1. Decide whether the approved scope includes only a documented backup command/procedure or a backup UI as well.
2. Add snapshot creation, verification, retention and independent restore using the foundation from batch 1.
3. Define how a restored database reconnects to project manifests and immutable installation UIDs. Stop before enabling jobs when identities cannot be verified.
4. Record snapshot/release/schema compatibility. Do not automatically restore an older schema over newer data without an explicit data-loss decision.
5. Complete a fixture restore drill and record recovery steps, duration measured during that drill, remaining manual credential work, and any unsupported OS behavior.
6. For a real restore drill, obtain a concrete data-access/target approval and restore into a separate location. Keep the real app state unchanged until a separate restore approval.

## 11. Batch 7 — Safe releases and cross-platform service handling

### F14 — Stage full releases and preserve a working rollback

**Primary files:** `scripts/control-center.ps1`, `scripts/control-center.mjs`, `app/src/lib/maintenance.ts`, `app/src/app/api/health/route.ts`, `paths.ts`, env loading, shared script path resolution, CI.

#### A. Separate code releases from state

1. Define directories for immutable releases, shared data, protected secrets, configuration, logs, and the active-release pointer. Keep project/workspace roots explicit; they must not move just because the executable lives inside a release directory.
2. Update all helpers that currently rely on `process.cwd()` or the script's own parent directory. Project scaffolding, registry writes, env-file saves and maintenance scripts must resolve the intended real workspace and shared state, not a release-local copy.
3. Give each release an immutable ID, source revision, lockfile hash, runtime version, schema compatibility range and build result.
4. Acquire an exclusive maintenance lease before staging/switching. Reject overlapping update/restart attempts with a clear existing-operation reference.

#### B. Build away from the running app

5. Create a new release directory from the approved source revision; exclude local secrets, database files, project/client data and unrelated untracked files.
6. Run a reproducible dependency install using that release's lockfile in its own dependency directory. Never run `npm ci` against the live app's `node_modules` while promising that a failed build changes nothing.
7. Build inside that release using its final internal build-directory layout. Avoid renaming a build directory if generated manifests refer to the old path; validate the actual start layout.
8. Use isolated build-time state. The staged build must not run migrations, background jobs or cleanup against the real database merely because it imports app modules.
9. Run tests/typecheck and a temporary-port smoke startup against a snapshot or fixture database, with credentials and outward jobs disabled. Verify native `better-sqlite3` compatibility with the selected Node/OS runtime.
10. If install/build/smoke validation fails, leave the active release and shared data untouched. Preserve sanitized diagnostics; clean only the validated staging directory after it is no longer needed.

#### C. Switch and verify

11. Prepare a fresh verified state backup, identify pending operations and request the real update/restart approval for this release.
12. Quiesce mutation/scheduled work, drain or explicitly mark in-flight operations, and stop only the owned application/supervisor process. Do not kill an arbitrary process merely because it listens on port 3100.
13. Apply only migrations whose compatibility/rollback behavior is understood. Prefer additive migrations and defer destructive cleanup to a later release.
14. Atomically select the new release using a platform-tested pointer/service method. Preserve the complete previous release and dependencies.
15. Start the new release. Health must identify the expected release ID and indicate usable database/schema and completed readiness; HTTP 200 from another process or the old release is not sufficient.
16. Verify readiness on the real port, representative read-only pages, configuration paths, and background-job ownership. Do not trigger real restore/publish just to smoke-test the UI.
17. Mark success only after these checks pass. Retain the previous release for a defined period; do not delete it before health is established, including the no-supervisor branch.

#### D. Recover on failure

18. On failed readiness, stop the new owned process, restore the previous release pointer and restart it using its own dependencies.
19. If the schema is backward-compatible, verify the old release against the current data. If it is incompatible, halt and use the approved state-recovery plan; explain what writes since the snapshot would be lost.
20. Do not automatically roll the database back after accepting new writes. Prefer a forward fix or an explicitly approved restore with a known recovery point.
21. Record whether the update failed before switch, rolled back successfully, or needs operator recovery. Do not print Update complete after a startup warning.

**Tests:** lockfile changed with existing live dependencies; failed install; failed build; missing native binding; stopped/no supervisor; switch rename failure; new app never healthy; wrong release answers health; migration failure; overlapping update; process crash during switch; old-release restart; post-switch data writes.

**Pass criteria:** a failed staging attempt does not alter the live release, every switch has a verified fallback, and reported state matches the running release. Where a platform has not passed these tests, label it unverified rather than claiming universal rollback.

### F15 — Generate service definitions with platform-correct encoding

**Primary files:** `scripts/control-center.mjs`, `control-center.ps1`, service-definition helpers and platform tests.

1. Extract service-definition generation into pure functions accepting executable, arguments, working directory and log/config paths.
2. Apply the target format's escaping, not shell/JSON escaping: systemd argument quoting/specifier treatment, XML text escaping for launchd, and Windows process/task argument rules.
3. Test paths with spaces, Unicode, ampersands, quotes where supported, percent/specifier characters, and backslashes. Reject path characters the platform cannot represent safely.
4. Keep each program argument separate where the service format supports an argument array.
5. Generate the actual release launcher configuration selected by F14; ensure changing releases does not accidentally change workspace/data locations.
6. Validate systemd units with its native verifier and plists with the platform parser. These are planned verification steps; syntax output alone does not establish startup success.
7. Run install/start/status/stop/uninstall in disposable OS test environments, not the user's registered live service.
8. Confirm uninstallation removes only the selected service registration and preserves releases/data according to the existing product contract.

**Pass criteria:** the service starts the correct executable with intact arguments from a spaced workspace path on every claimed supported OS; native validation and startup evidence are recorded.

**Rollback:** retain the previous validated service definition and registration details. Restoring that definition must still point at a retained compatible release.

## 12. Batch 8 — Input handling, UI consistency, and background operations

### F16 — Bound event bodies during reading

**Primary files:** `app/src/app/api/events/route.ts`, event logging service, endpoint tests.

1. Preserve authentication before body processing. Return the existing configured/not-configured/authentication outcomes without reading an unauthorized request body.
2. Set the documented maximum to an exact byte count and specify whether a body exactly at that limit is allowed. Recommended contract: at most 65,536 bytes.
3. Inspect Content-Length only as an optional early rejection hint. An absent, wrong or chunked length must not bypass the actual reader limit.
4. Read the request stream incrementally, count received bytes, and cancel/abort when the bound is exceeded. Decode only the accepted bounded content and handle malformed encoding/JSON with a structured client error.
5. Catch aborted/failed reads explicitly. Never insert a partial event or return an unhandled application error merely because the sender disconnected.
6. Validate the complete event schema and string limits before database insertion. Do not trust a supplied project field to establish ownership of a real project without the intended policy.
7. Bound rejected-request logging using an aggregate/rate policy so one bad token cannot create one permanent database row per request indefinitely. Do not log the supplied token.
8. Apply a modest configurable admission/rate policy appropriate to local ingestion. Do not blindly trust `X-Forwarded-For` as an authenticated source identity; document any trusted-proxy assumption.
9. Preserve compatible success/error shapes where possible. If a stricter payload rule changes callers, record it and test the existing documented request example against the fixture endpoint.

**Tests:** limit minus one/exact/plus one bytes; multibyte characters; chunked stream; absent/incorrect Content-Length; empty/invalid JSON; malformed encoding; abort midway; unauthorized oversized request; repeated bad token; burst of authorized valid requests.

**Pass criteria:** reads and memory are bounded, rejected/aborted events create no event row, and rejection logging cannot grow without bound.

### F17 — Preserve brief text verbatim and detect meaningful content

**Primary files:** `app/src/lib/brief.ts`, project creation action, brief status UI, focused tests.

1. Add regression fixtures containing `$&`, `$1`, `$2`, dollar/backtick and dollar/apostrophe sequences, Unicode and multiline text.
2. Replace the replacement-string insertion in `withAskedText()` with a callback that inserts literal text. Keep intentional newline normalization only.
3. Define brief-filled behavior: meaningful non-template text counts even without `##` headings; headings alone, known placeholder comments and an untouched empty template do not.
4. Preserve the existing policy for an attachments-only template explicitly. Recommended default: label it attachments present/no written brief rather than pretending the written brief is complete.
5. Avoid stripping arbitrary user content while detecting placeholders. Match known template scaffolding narrowly; detection must not rewrite the document.
6. Verify project list and project detail use the same brief-state function.
7. Do not scan and automatically rewrite existing client briefs to repair past corruption. Provide a read-only diagnostic if requested; only the owner edits those source documents.

**Tests:** all literal replacement tokens, heading-free prose, headings only, comments only, template untouched, populated standard section, attachment-only brief, BOM/CRLF, Unicode.

**Pass criteria:** input text is preserved under documented newline normalization and the status accurately reflects meaningful content.

### P1 — Align dialog behavior, archive counts, and accessible chart use

**Primary files:** `components/use-modal.ts`, `restore-button.tsx`, `backup-card.tsx`, `app/src/app/page.tsx`, project lists/menus, `exec-chart.tsx`, shared styles only where needed.

1. Inventory dialog close behavior and replace duplicate simple backdrop handlers with the tested shared helper where compatible.
2. Preserve Escape, Cancel, backdrop click, focus restoration, native dialog semantics and nested scroll-lock behavior. A pending mutation must not silently close and conceal its outcome.
3. Test pressing inside a dialog, dragging outside and releasing: text selection must not dismiss it accidentally.
4. Define one archived/active predicate accounting for both project status and the `.archived` marker. Use it for Overview counts, cards, filters and relevant empty states.
5. Keep the chart's accessible table. Add keyboard/touch tooltip interaction only if it improves inspection without creating dozens of unnecessary tab stops.
6. Preserve palette, spacing tokens, routes, CTAs and existing structure. This is consistency work, not a redesign.
7. Verify at desktop, tablet and narrow mobile widths; include light/dark themes, keyboard-only use, focus visibility, reduced motion, long names and error/pending states.
8. Record browser/emulation used. Do not label emulated mobile testing as real-device verification.

**Pass criteria:** no accidental dialog dismissal, accurate archive counts, no focus trap/regression or page overflow, and chart data remains accessible without a mouse.

### I6 — Make background state observable and reduce repeated blocking work

**Primary files:** `app/src/lib/n8n.ts`, `auto-export.ts`, `projects.ts`, `git.ts`, `settings.ts`, `instrumentation.ts`, Overview/Settings/workflow pages.

1. Measure a fixture baseline before optimizing: project count, workflow count, execution count, request duration, filesystem reads and Git subprocess count. Include an intentionally slow/failing Git command fixture.
2. Build a request-scoped project/workflow index and reuse it within a render/operation. Avoid reparsing every workflow for each imported row.
3. Move Git status inspection off the synchronous request thread with bounded concurrency and timeouts. Never run unlimited subprocesses because many project cards are visible.
4. Cache results under stable repository/installation identity and invalidate them after related writes. Ensure stale results are visibly dated and cannot authorize a commit/restore.
5. Add a common background-operation status record: last attempt, last success, progress/catch-up state, sanitized error, next retry, and lease owner/generation.
6. Catch outer auto-export/scheduler failures at the actual boundary and persist them. A comment claiming a failure was already logged is not evidence it was.
7. Use bounded exponential backoff with jitter for transient failures; avoid retry storms. Configuration/authentication failures need visible corrective action rather than endless rapid retries.
8. Clear an error only after a succeeding attempt of the affected operation, not when unrelated work succeeds.
9. Protect scheduler registration and leases against dev hot reload, multi-process builds, overlapping ticks, removal of instances, and shutdown.
10. Remeasure the same fixture workload. Report actual before/after measurements, cache tradeoffs, and remaining limits; do not invent performance improvements.

**Tests:** stale cache plus fetch failure, failed outer auto-export, retry/backoff timing with fake clock, duplicate scheduler registration, many project cards, hung Git command, cache invalidation, removal during refresh, concurrent manual/automatic operation.

**Pass criteria:** users can distinguish fresh/successful, stale, catching-up and failed states; bounded work prevents one slow project from blocking the whole app indefinitely.

## 13. Batch 9 — Consolidation, dependency maintenance, and documentation

### I8 — Consolidate only after contracts are covered

**Primary files:** `app/src/app/actions.ts`, `app/src/lib/` domain helpers, `scripts/export-workflow.mjs`, `scripts/lib/`, attachment route handlers.

1. Identify duplicated behavior with overlapping tests: workflow canonicalization, naming, changelog insertion, identity lookup, path validation and attachment headers.
2. Extract the smallest shared pure/helper modules usable by both the CLI and app. Avoid importing server-only code into browser bundles or requiring Next.js to run the CLI.
3. Introduce runtime schemas at server action/API boundaries. Validate unknown objects, arrays, identifier lengths, booleans and unexpected keys before coercion or filesystem/API access.
4. Use typed action outcomes consistently for success, validation rejection, stale preview, partial completion and needs recovery. Keep user-facing errors clear and sanitized.
5. Apply shared importability/connection validation before both app import and restore; keep it separate from target-specific API validation.
6. Split large action modules by domain only when tests show call signatures and behavior are preserved. Avoid mixing this refactor with dependency upgrades or metric-definition changes.
7. Consolidate attachment MIME/header handling while retaining download treatment for active document types, no-store and nosniff behavior.
8. Remove superseded helpers only after all callers are migrated and repository search confirms no remaining use. Do not remove private workflows or project files under this item.
9. Run focused contract tests after each extraction and the full suite at the batch gate.

**Pass criteria:** CLI and app behavior agree, no route/action contract changes accidentally, and shared modules remain usable in their actual runtimes.

### I7 — Update dependencies deliberately and verify the release

**Primary files:** `app/package.json`, `app/package-lock.json`, CI runtime matrix, runtime setup docs.

1. Treat the audit's Next.js 16.3.6 → 16.3.7 result as a dated observation. Re-run a read-only package/outdated/advisory check when implementing; do not assume it is still the latest safe target.
2. Read the official release notes for the selected patch and record relevant changes. A zero-known-vulnerability result is not a reason to skip regression checks.
3. Choose/document supported Node versions. Keep tests compatible with the minimum supported version, or make a separate explicit decision to raise it.
4. Apply the narrow approved patch in the isolated checkout and update the lockfile with the selected package manager/runtime. Do not run a broad forced audit fix or unrelated major upgrades.
5. Inspect the lockfile diff for unexpected dependency churn. Explain any transitive changes and native-module rebuild implications.
6. Install from the resulting lockfile in a clean isolated release directory to prove reproducibility.
7. Run existing and new tests, typecheck, production build and fixture browser smoke checks. Include server actions, proxy/Host rules, upload handling, SQLite initialization and maintenance preview.
8. Deploy only through F14's verified release path after approval. Preserve the previous compatible release and state snapshot.
9. Add automated dependency-update proposals and advisory monitoring if included in scope; proposals should remain reviewable rather than automatically deploying updates.

**Pass criteria:** selected patch is documented, lockfile is reproducible, required checks pass on supported runtimes, and the running release is identified after deployment.

### D1 — Correct capability/security statements

**Primary files:** `app/README.md`, `SECURITY.md`, `Documentation/05-export-and-versioning.md`, comments in `n8n.ts` and restore/import helpers.

1. List all actual writes to n8n and ensure the documentation includes Restore as well as publish/unpublish.
2. Explain F1's binding precedence, unresolved-state handling and migration requirements.
3. Describe the implemented scan boundaries, binary policy and blocked/unsupported outcomes. Remove blanket guarantees that exceed the tests.
4. Explain what is backed up: workflow content, bindings, project Git, protected application state, and which pieces require separate recovery.
5. Document target credential/dependency mapping and unsupported API capabilities accurately. Do not promise automatic rebinding that has not been implemented and verified.
6. Update release/rollback wording to match tested platform paths. Label unsupported/unverified behavior explicitly.
7. Search for obsolete “only writes,” “always safe,” “everything backed up,” and equivalent claims in code/docs, then reconcile each one.

**Done when:** each operational promise maps to an implemented behavior and acceptance test, with no false claim that planned work already exists.

### D2 — Update roadmap status and record operational contracts

**Primary files:** `Documentation/12-roadmap.md`, app documentation, approved specification/decision documents.

1. Remove or qualify the statement that all A–D features are unbuilt; classify each item as implemented, partially implemented, planned or deferred.
2. Mark missed-run monitoring as present but distinguish existing implementation from the corrections in F8/F9.
3. Record decisions from section 3 with date, rationale, alternatives rejected and affected audit IDs.
4. Write short operational contracts for identity, restore, sync completeness, health counting, success metrics, retention, file scanning, commit previews and release rollback.
5. Link each contract to regression evidence and the relevant operating guide.
6. Update the audit approval/result record only for completed/approved work, with source revision and test evidence. Preserve the original findings as historical evidence.
7. Keep deferred ideas separate from known defects. Do not use a planned roadmap feature to hide an unresolved safety bug.

**Done when:** the roadmap reflects reality and a new maintainer can understand the intended semantics without relying on chat history.

### D3 — Reconcile network-access and credential guidance

**Primary files:** `SECURITY.md`, `app/README.md`, relevant setup/environment documentation and owner-local configuration guidance.

1. Preserve the local single-user default. State clearly that the ingest token authenticates `/api/events`, not the dashboard or server actions.
2. Explain that a Host allowlist is a DNS-rebinding control, not a login system or client authorization mechanism.
3. Replace casual bind-all/tunnel guidance with a documented protected option: authenticated access for the full app, or an ingress path that exposes only the event endpoint with appropriate limits and token handling.
4. Do not install a tunnel/proxy, change bind addresses, add allowed hosts or introduce a login system merely to update the documentation.
5. For Docker reachability, verify the actual intended connection path before changing setup instructions. Keep examples generic and free of real secrets/client details.
6. Resolve the owner credential naming conflict before any later workflow build. The user's direct instructions outrank local historical notes; do not choose a different live credential or rename one based solely on the document.
7. Record owner-specific facts only in the appropriate local/private location. Keep public documentation generic.

**Done when:** setup instructions cannot reasonably imply that exposing the unauthenticated whole app is safe because the inbox has a token, and credential guidance no longer contradicts the owner's chosen current setup.

## 14. Verification matrix and evidence checklist

Implement named tests based on these cases. Test names here are planned labels, not claims of existing tests. A row can be split into multiple tests. Retain separate results for unit/mocked integration, browser fixture, and authorized live verification.

| Case | IDs | Required result |
|---|---|---|
| V01 — Sandbox default denial | I1 | Missing test root/transport refuses startup; no production fallbacks |
| V02 — Two installations, identical workflow IDs | F1 | Separate files/bindings/log association; no overwrite |
| V03 — Ambiguous migration | F1 | Read-only report and blocked writes until resolution |
| V04 — Embedded expression and metadata secret | F2 | Rejected before write; no secret in diagnostics |
| V05 — Oversized/extensionless/UTF-16 candidate | F3 | Scanned or visibly blocked, never silently clean |
| V06 — Mixed upload submission | F4 | One invalid required item causes no partial permanent submission |
| V07 — Target credential/dependency conflict | F5 | No write until mappings are explicit and valid |
| V08 — Lost restore response | F5, I2 | Unknown result persisted; no automatic duplicate create |
| V09 — Remote success/local failure | F5, F6, I2 | Retry resumes local recovery using returned identity |
| V10 — Minified/reordered JSON | F6 | Correct structural binding/ID result; node IDs unchanged |
| V11 — Description/tag/group-only change | F7 | Backup becomes changed and export updates it once |
| V12 — Sliding failure window | F8 | Streak crosses threshold across pages; duplicates do not increment |
| V13 — Late completion/status correction | F8, F10, F11 | Health and aggregates reconcile to one result |
| V14 — Alert start/change/deadline | F9 | Full intended interval; exact deadline semantics |
| V15 — Backlog larger than per-tick budget | F10 | Resumable complete catch-up or explicit unavailable-history gap |
| V16 — Pending run falls out of recent pages | F10 | Eventual terminal/unavailable reconciliation |
| V17 — Mixed statuses and errors-only log mode | F11 | Agreed denominator and separate Other; no misleading 0% |
| V18 — Remove during sync then re-add same label | F12 | No resurrection, cache inheritance or orphan alerts |
| V19 — Retention with no connection/sync | F13 | Policy still runs; dedup/health remains correct |
| V20 — Failed staging build with changed dependencies | F14 | Active code/dependencies/state remain usable |
| V21 — No-supervisor/startup/migration failure | F14 | Accurate failure result and verified recovery path |
| V22 — Service paths with spaces/special characters | F15 | Native validation plus correct OS startup |
| V23 — Multibyte/chunked/aborted inbox body | F16 | Byte cap enforced while reading; no partial event |
| V24 — Literal brief text and free-form content | F17 | No replacement expansion; correct filled state |
| V25 — Atomic-file/multi-step interruption | I2 | Complete old/new file or explicit recoverable operation |
| V26 — Independent state restore | I3 | Required state recovered; jobs/credentials not activated by test |
| V27 — Preview/content/HEAD/index races | I4 | Commit matches approved tree; unrelated changes preserved |
| V28 — Env persistence/DB failure | I5 | Durable state reconciles; memory never claims an unsaved value |
| V29 — Background failure/retry/cache behavior | I6 | Last-success/failure/stale state accurate and work bounded |
| V30 — Clean install on supported runtime | I7 | Lockfile reproducible; tests/typecheck/build/smoke pass |
| V31 — CLI/app validation parity | I8 | Same accepted/rejected workflow contract |
| V32 — Documentation truth check | D1, D2, D3 | Claims match implemented/tested scope |
| V33 — Dialog/archive/chart interactions | P1 | Correct counts; keyboard/touch/focus and selection behavior |

### 14.1 Evidence to save for each completed batch

1. Approved audit IDs and any separately approved scope decision.
2. Source commit or uncommitted diff identity; changed file list; test/runtime versions.
3. Reproduction case that failed before the fix and passes afterward, when applicable.
4. Focused test output plus required typecheck/build/CI outcomes.
5. Migration dry-run counts and unresolved items, without client payloads or secrets.
6. Fixture browser screenshots for user-visible changes, labeled as fixture/emulated evidence.
7. Failure-injection/recovery results and any unverified platform paths.
8. Real deployment/version verification only if an approved deployment occurred.
9. Pending owner actions: mapping choice, live test, protected backup destination, publish decision or release approval.

### 14.2 Commands at the future verification gate

These are instructions for later, not commands run during this planning task. Run them only after the sandbox boundary is established. `npm.cmd` is appropriate on this Windows installation; use the corresponding executable on other platforms.

From the verified isolated app directory, run separately and stop on any failure:

```powershell
npm.cmd test
```

```powershell
npm.cmd run typecheck
```

```powershell
npm.cmd run build
```

Before running the build, verify that the working directory, data path, environment-file path, workspace path, network transport and scheduler mode all belong to the fixture/release-validation environment. A separate `.next` directory alone is not sufficient isolation.

Add the selected integration/browser commands to `package.json` during I1, then record their actual names here. Do not report a planned `test:integration` or `test:e2e` script as passing before it exists and has run.

For the final diff review, run `git diff --check`, inspect the changed paths and confirm no secrets, private project files, runtime databases or unrelated changes are staged. Do not commit simply because checks passed; follow the explicit commit approval.

## 15. Batch 10 — Migration, release, observation and recovery

### 15.1 Prepare the owner review package

1. Summarize behavior changes using the approved IDs, not the chronology of implementation.
2. List concrete migrations, affected files/rows, unresolved bindings, newly retained minimal monitoring data, and retention effects.
3. Present test evidence and limitations. Separate mocked n8n behavior from any authorized live readback.
4. Show the selected release ID, dependency/runtime changes, schema compatibility, backup location metadata and rollback procedure.
5. Ask only for the remaining necessary approval: exact real migration, exact live verification, exact restart/update, or commit/push. Do not ask repeatedly for already authorized local work.

### 15.2 Apply an approved real migration

1. Confirm the target workspace, database, app process and n8n instance identities without printing secrets.
2. Create and verify the coordinated recovery point. Capture counts/checksums, not payloads.
3. Quiesce affected background mutation jobs for the approved maintenance window; preserve their settings for resumption.
4. Run the migration's read-only/dry-run mode against the real target and compare it with the approved preview. Stop if affected scope differs.
5. Apply the approved additive migrations and resolved binding decisions. Leave ambiguous projects untouched and visibly unresolved.
6. Read back the results and validate referential identity/counts. Do not auto-publish workflows or automatically repair client briefs.
7. Keep old snapshots and migration records. Resume only compatible jobs after release readiness checks succeed.

### 15.3 Deploy an approved release

1. Use F14's complete staged release and verify its identity one final time.
2. Follow the stop/switch/start/readiness sequence from section 11.
3. Inspect representative read-only pages and state: Overview, project/workflow lists, logs, Settings, and a restore preview that does not apply a write.
4. Observe at least one relevant configured scheduler cycle or run an explicitly approved safe operation. Distinguish a fixture cycle from a real cycle in the evidence.
5. Verify that last-success, retry, stale state, retention and background ownership behave as intended. If an operation has not yet run, label it pending rather than verified.
6. Keep outbound actions requiring confirmation inactive until the owner deliberately uses them. Existing approved schedules are resumed according to the maintenance plan.
7. Update the audit status only after this evidence exists; mark implemented-but-not-deployed separately from deployed-and-verified.

### 15.4 Recovery decision table

| Failure point | First response | Recovery boundary |
|---|---|---|
| Before any real write | Stop affected batch; preserve diagnostics | Correct code/plan and rerun fixture tests |
| Partial local file operation | Freeze conflicting writes; inspect operation record and hashes | Resume deterministic local completion or restore the coordinated prior files |
| n8n response lost after write request | Mark remote outcome unknown | Reconcile read-only; no automatic create retry |
| n8n write verified but local binding/changelog failed | Preserve remote ID and operation | Resume local steps; no duplicate restore |
| Wrong n8n content applied | Preserve before-version and evidence | Separate owner-approved corrective restore; never assume code rollback undoes it |
| Commit differs from approved snapshot | Preserve commit/tree evidence and stop further automation | Owner-reviewed corrective history; no automatic reset/force push |
| New app not ready after switch | Stop new owned process; retain diagnostics | Restart previous full release if schema-compatible |
| New schema incompatible with old release | Keep mutations stopped | Approved snapshot restore with explicit data-loss window or forward fix |
| Retention removed required history | Stop further policy application if authorized | Approved snapshot restore/upstream recovery where possible; code rollback cannot restore rows |
| Unknown identity/mapping conflict | Block affected writes; retain files | Owner resolves exact source/target association |

## 16. Suggested review/commit units

These are boundaries for future review; they are not instructions to commit now. Each unit should include its relevant tests and documentation. If the user approves only a subset, limit the units accordingly.

| Unit | Suggested scope | Avoid combining with |
|---|---|---|
| A | Fixture harness and minimum write/recovery primitives | Real-data migrations |
| B | Scanner coverage and submission preflight | Framework upgrade |
| C | Identity model, dry-run migration and shared resolver | Running the real migration |
| D | Canonical export comparison and structured identity serialization | Live restore/publish |
| E | Mapped restore plans and operation recovery | Real credential changes |
| F | Approved Git snapshots and server-side changelog checks | Unrelated project commits |
| G | Execution fact/checkpoint model and resumable catch-up | UI redesign |
| H | Streak/clock/metrics/retention corrections | Unrelated alert delivery features |
| I | Instance cleanup, settings durability and backup recovery | Hosted/multi-user mode |
| J | Complete release staging, rollback and service encoding | Dependency patch rollout |
| K | Inbox/brief fixes, UI consistency and measured background improvements | New product features |
| L | Small helper consolidation, then isolated dependency patch | Broad architectural rewrite |
| M | Documentation/roadmap closure and final evidence index | Claiming unverified work complete |

## 17. Completion checklist

- [ ] Every approved audit ID has implementation evidence or an explicit deferred/blocked reason.
- [ ] No unapproved audit item was implemented as scope creep.
- [ ] Tests use fake data and isolated resources; real credentials were never printed or included in fixtures.
- [ ] Source-instance and target-instance identity remain distinct across import/export/restore/logs.
- [ ] Known secrets are rejected before the applicable persistence/commit boundary; unsupported scans are visible.
- [ ] Remote uncertainty and partial local completion are recoverable without duplicate outward actions.
- [ ] Approved commit content matches committed content and unrelated work remains intact.
- [ ] Sync coverage, failure streaks, alert clocks, metrics and retention match their documented definitions.
- [ ] Instance removal cannot resurrect deleted local state through an in-flight worker.
- [ ] Durable configuration survives failure/restart without memory/disk disagreement.
- [ ] App state restoration and release rollback have actual evidence for the claimed platforms.
- [ ] Input limits, literal text handling, archive counts and dialog/accessibility behavior pass their checks.
- [ ] Required tests, typecheck, isolated build and CI checks pass after the final relevant change.
- [ ] Public docs contain no local secret/client details and no claims ahead of verified implementation.
- [ ] Actual deployment/migration/live-test status is reported separately from code completion.
- [ ] Commit/push/publish actions have only occurred within explicit authorization.
- [ ] The original audit and this plan are retained as records; completion notes identify which version implements each approved ID.

## 18. Current handoff status

All procedures above are **planned**. All 29 audit suggestions remain **unimplemented by this task**. No code tests, dependency installs, migrations, app maintenance, live n8n operations, commits or pushes were run while writing this procedure.

The recommended first implementation request is a narrowly scoped foundation plus backup-safety batch: I1 and the necessary atomic/recovery primitives, followed by F1–F7. Include I4 when claiming that Git commits contain exactly the scanned/approved content. Choose the approved batch explicitly when ready; until then this document is a reviewable implementation plan only.
