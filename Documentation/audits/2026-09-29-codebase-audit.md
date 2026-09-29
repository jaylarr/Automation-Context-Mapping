# Codebase audit — Automation Workspace and Control Center

Date: 2026-09-29. Reviewed checkout: `faa58cc`.

## Scope and conclusion

**Health: needs attention.** The application has a sensible structure and useful safeguards, but backup/restore identity, secret handling, monitoring correctness, and release recovery need work before these features can be treated as dependable safeguards.

This is a codebase audit of the workspace infrastructure: the Next.js Control Center, its persistence and server actions, workflow import/export/restore, project files and Git handling, service scripts, CI, and supporting policy documentation. The inventory contains 297 tracked files, including 94 app-source/script files and approximately 13,374 lines of source/scripts/styles. This is an inventory count, not a claim that every line received equal scrutiny. Review concentrated on mutation, security, data-loss, monitoring, and recovery paths; selected UI components and pages received static review.

Individual private client projects under `n8n workflows/` are separate repositories. Their briefs, business logic, live workflow graphs, execution histories, and external accounts were not audited. No live n8n calls were made. No workflows were run, published, edited, archived, or deleted. No commits, dependency installs, application restart, or code fixes were performed. This report is the only intentional source-tree addition; typechecking also generated its normal ignored artifacts. The pre-existing untracked `.claude/settings.local.json` was left alone.

Prior workspace notes helped identify conventions; conclusions below were checked against current source. This is a bounded source review, not a penetration test or a guarantee that every defect has been found.

## Verification

| Check | Result |
|---|---|
| `npm.cmd test` | 14/14 passed; all are sanitizer/helper tests |
| `npm.cmd run typecheck` | Passed, including Next route type generation |
| `node --check` on tracked workspace `.mjs` scripts/hooks | 10/10 passed |
| `npm.cmd audit --json` | Reported zero known vulnerabilities |
| `npm.cmd outdated --json` | Next.js installed 16.3.6; wanted/latest 16.3.7; no other outdated direct package reported |
| Fake-data probes | Confirmed expression scanner bypass, missed metadata changes, capped failure streak, incorrect alert start date, failed minified-JSON ID replacement, skipped large-file scanning, and brief text corruption |
| Production build / app update | Not run; audit did not replace running build artifacts or start maintenance |
| Browser / accessibility / mobile / macOS / Linux service execution | Not exercised; related observations are source-based |

The probes loaded existing helpers into an isolated JavaScript context with mocked filesystem/database/API dependencies. They did not write project data or contact n8n. An initial restore probe hit a test-harness cross-context `Error` mismatch; it was corrected and rerun successfully. These probes are evidence, not a committed regression suite.

The first outdated-package query failed with restricted-network `EACCES`; a read-only retry with the permitted elevated execution path succeeded. No package changed. npm audit reports registry-known vulnerabilities, not application logic defects or a complete security assessment ([npm documentation](https://docs.npmjs.com/cli/v11/commands/npm-audit/)).

## Architecture and existing strengths

- Next.js App Router and server actions provide the local UI. SQLite stores settings, events, execution metadata, and workflow preferences. Project folders remain the source of truth for project documents and workflow exports.
- n8n access is centralized in `app/src/lib/n8n.ts`, with request timeouts, paginated workflow listing, caching, and per-instance synchronization deduplication.
- SQLite uses WAL, prepared statements, and an immediate transaction around migrations. Execution primary keys include the instance ID.
- The application binds to loopback by default and has a Host allowlist. This is appropriate for the stated local, single-user threat model; absence of login is not itself a defect in that mode.
- The event inbox checks a token using timing-safe comparison. Markdown does not render raw HTML. Uploaded HTML/SVG are downloaded rather than rendered inline.
- Project deletion has a recoverable trash period. Normal publish and restore flows present confirmation dialogs. Git operations do not push automatically.
- Workflow sanitization is shared between the app and CLI. CI defines clean-checkout build/test jobs for Windows, macOS, and Linux.
- UI source includes native dialogs, visible focus styling, reduced-motion rules, and a chart table alternative. Runtime accessibility still needs verification.

## Fixes

Priority: **P1** = high-impact correctness/security/data-safety issue; **P2** = material reliability/accuracy issue; **P3** = smaller defect. No P0 emergency is established. Effort: S <15 minutes, M <1 hour, L >1 hour; these are rough implementation estimates excluding full regression testing. Risk means risk of changing the code. All IDs are **proposed**, not approved.

### F1 — Include the instance in workflow identity

**P1 · effort L · change risk medium · evidence: source trace.**

`app/src/lib/workflow-import.ts:79` indexes files by workflow ID alone; line 128 looks up every instance against that one map. `importWorkflow()` also ignores the instance when finding a tracked file. `app/src/lib/projects.ts` exposes the same ID-only map to execution project association in `n8n.ts:62`.

If two connected instances contain the same workflow ID, an import from one can overwrite the other's saved workflow and attribute runs to the wrong project. Restored/cloned installations make this a concrete supported scenario, not merely a random-ID collision. Scheduled auto-export uses the same path.

**Change:** introduce durable source-instance ownership and per-instance remote IDs, preferably separate from portable workflow JSON. Migrate ambiguous files explicitly, block ambiguous writes, and use the same resolver for import, export, restore, and execution mapping. Do not silently choose the last file found.

**Accept when:** two fake instances sharing an ID can import into separate projects without changing each other's files or log associations.

### F2 — Scan secrets inside expressions and all retained export text

**P1 · effort M · change risk medium · evidence: reproduced.**

`app/src/lib/sanitize-core.mjs:68` immediately accepts every string beginning with `=`. A fake literal API key inside an expression was not detected. Expressions can contain hardcoded strings; they are not automatically safe. The scanner also walks only node parameters while the export retains other text, including descriptions and node properties.

**Change:** scan known secret patterns before treating a value as an expression, distinguish references from literal embedded secrets, and scan all retained export content. Keep diagnostics limited to location/type, never the secret itself. This enforces `Documentation/05-export-and-versioning.md`'s hardcoded-secrets-anywhere rule.

**Accept when:** fake secrets in expression literals, descriptions, notes, URLs, and code are rejected, while ordinary credential references and data expressions pass.

### F3 — Do not silently bypass the Git secret check for large or unknown files

**P1 · effort L · change risk medium · evidence: reproduced/source trace.**

`app/src/lib/git.ts:90-107` scans only listed text extensions, skips files over 2 MiB, and swallows read failures. The commit path still stages them. A mocked 3 MiB text file containing a detectable secret was accepted. Extensionless files and formats such as `.http` bypass the check too. The UI's blanket claim that files are checked is therefore too strong.

**Change:** inspect content rather than trusting extensions; stream large text files or explicitly block/report files that cannot be scanned. Define a separate binary-file policy. Verify the exact bytes to be committed, not an earlier working-tree snapshot. Document that pattern matching cannot guarantee detection of arbitrary secrets or PII.

**Accept when:** oversized text, extensionless text, read errors, and changed-after-scan files cannot silently enter a supposedly checked commit.

### F4 — Enforce the documented secret policy before saving briefs and evidence

**P1 · effort L · change risk medium · evidence: source trace.**

`app/src/lib/brief.ts:107-113` writes the brief before scanning and returns a warning. `test-results.ts:134-139` similarly saves before warning, and only checks notes. Attachment writers (`brief.ts:149`, `test-results.ts:86`) do not scan content. `SECURITY.md` says briefs and test results are scanned and refused. Newly created projects are then automatically committed through `initialCommit()`; F3 makes the omissions especially relevant to attachments.

**Change:** preflight complete submissions before writing: text fields plus readable attachments, with an explicit policy for binary/unscannable files and a private storage option. Keep a rejected submission editable and clearly state whether anything was saved. Do not promise PII detection or OCR-based secret detection unless implemented.

**Accept when:** fake secrets in supported text fields and attachments cause no write/commit, and unsupported scans are visibly identified.

### F5 — Make cross-instance restore a mapped, verifiable operation

**P1 · effort L · change risk high · evidence: source trace; target API behavior not exercised.**

`app/src/lib/restore.ts:110-111` sends original nodes and settings directly to the target. Credential IDs, Execute Workflow references, and `settings.errorWorkflow` remain source-instance values. The preview lists credential names but does not validate or remap them. The source comment assumes importer rebinding, but there is no such implementation in the app's REST path. Creating on another instance also replaces the source file's ID, losing the original association.

**Change:** retain the source identity; store target IDs separately; resolve credentials and workflow dependencies against the selected target; fail closed when mappings are absent or ambiguous. Preview the actual target name/ID and changes, then read back the saved graph. Model remote success/local-save failure distinctly so a retry does not create another copy. Preserve or explicitly disclose omitted metadata such as description/groups/tags according to the target API contract.

**Accept when:** a two-instance fixture with different credential/subworkflow/error-workflow IDs restores using approved mappings, preserves source tracking, and survives a simulated local write failure without duplicate remote creation. Live acceptance requires separate owner authorization.

### F6 — Replace workflow IDs structurally, not by whitespace-sensitive text matching

**P2 · effort S · change risk low · evidence: reproduced.**

`app/src/lib/restore.ts:130` searches for the exact text `"id": "old-id"`. Valid minified JSON uses `"id":"old-id"`; the mocked restore created a new remote ID but left the local old ID unchanged. Subsequent restores can create more workflows.

**Change:** parse the JSON, assign its top-level ID, serialize, write atomically, and verify the saved ID. Coordinate with F1/F5 so cross-instance restores do not rewrite the wrong identity.

**Accept when:** minified, pretty, reordered, and absent-ID JSON fixtures all produce the intended persisted association.

### F7 — Include exported metadata in change detection

**P2 · effort M · change risk low · evidence: reproduced.**

`app/src/lib/sanitize-core.mjs:58-59` fingerprints only name, nodes, connections, and settings. Sanitization also retains description, tags, and nodeGroups. Changing only those fields produces the same fingerprint, so Import, scheduled auto-export, and the CLI can declare an outdated backup current.

**Change:** compare a canonical representation of every field that should be backed up, excluding only deliberate runtime noise. Normalize unordered fields where appropriate.

**Accept when:** each retained field changed alone triggers an export, while runtime timestamps alone do not.

### F8 — Count failure streaks incrementally and idempotently

**P2 · effort L · change risk medium · evidence: reproduced.**

`app/src/lib/workflow-prefs.ts:236-242` computes a streak from the bounded fetched window, then uses `Math.max(windowStreak, previousStreak)`. A sliding three-error window with one additional failure still records three. Failure thresholds above the visible per-workflow window may never fire.

**Change:** record a processed execution checkpoint and increment from new terminal results exactly once, reconciling out-of-order completion. Handle gaps explicitly rather than pretending the fetched window is complete.

**Accept when:** repeated syncs do not double-count, successive new failures cross the threshold, a success resets it, and running/manual/late-finishing executions follow documented rules.

### F9 — Start missed-run alerts at the latest expectation change

**P2 · effort M · change risk low · evidence: reproduced.**

Saving expectations establishes `expectSince`, but `workflow-prefs.ts:268` always prefers an old `lastSuccessAt`. A 24-hour expectation enabled one hour ago raised an alert when the previous success was weeks old. This contradicts the documented clock reset.

**Change:** calculate the deadline from the later of expectation start and last successful execution, with explicit invalid/missing-date handling.

**Accept when:** enabling/changing the expectation grants the full interval even with older history, and a subsequent success restarts the clock.

### F10 — Detect and recover execution-sync gaps

**P2 · effort L · change risk medium · evidence: source trace.**

`app/src/lib/n8n.ts:229` always fetches only `syncLookbackPages` recent pages; the default is 300 runs across an instance. There is no durable catch-up cursor. After sufficient traffic or downtime, older runs are never ingested; previously stored long-running executions can also remain stale after they leave the window. Sync can still report success.

**Change:** persist a synchronization watermark, page to that watermark with overlap, reconcile pending executions separately, and record truncated/unrecoverable history as an explicit monitoring gap. Keep bounded work per tick but continue catch-up on later ticks.

**Accept when:** more than one window of new runs is eventually ingested exactly once, and a long-running execution is updated after completion even after leaving the recent window.

### F11 — Correct dashboard success semantics and disclose sampling

**P2 · effort M/L · change risk medium · evidence: source trace.**

`app/src/lib/logs.ts:229-239` divides successes by every stored execution, although the UI labels this as finished executions (`app/src/app/page.tsx:93`). Running/waiting rows lower the rate. `app/src/components/exec-chart.tsx:72` adds `other` to the green Successful segment. Additionally, sync filters executions before storage (`n8n.ts:250`), so errors-only logging can turn a mostly successful workflow into an apparent 0% success rate.

**Change:** define terminal-status denominators, render non-success/non-failure results separately, and either maintain aggregates before log filtering or label metrics as based on retained/filtered runs. Reflect sync gaps from F10 in the display.

**Accept when:** a fixture containing successes, failures, running/waiting/canceled runs and different log modes yields internally consistent cards, chart, tooltip, and table.

### F12 — Remove instance preferences and invalidate its cache when removing/replacing it

**P2 · effort M · change risk low · evidence: source trace.**

`app/src/lib/instances.ts:148-154` deletes executions, the instance row, and sync metadata, but leaves `workflow_prefs`. Alerts read all preference rows. Removed instances can continue to produce alerts; reusing the same generated instance slug can inherit old settings. Updates/removals also leave the workflow cache keyed by that slug.

**Change:** define transactional cleanup for all instance-owned rows, clear/rekey caches and checkpoints, and treat changing a base URL to a different installation as an identity change. Coordinate in-flight syncs so they cannot recreate removed data.

**Accept when:** removal leaves no orphan alerts/preferences, and re-adding a different installation cannot inherit cached workflows or hidden logging settings.

### F13 — Run retention independently of n8n synchronization

**P2 · effort M · change risk low · evidence: source trace.**

`pruneOlderThan()` is called from `syncExecutions()` (`n8n.ts:207`). The scheduler skips sync when disabled or no instance is connected (`instrumentation.ts:43-44`). An event-inbox-only installation can keep accumulating events/activity past the configured retention period.

**Change:** schedule retention independently with a last-run marker and an activity entry for failures. Define a policy for execution rows without a start timestamp. State whether ordinary retention also applies to projects in the trash; the present trash-history wording suggests stronger preservation than this implementation provides.

**Accept when:** expired events/activity are pruned with all n8n connections absent and automatic sync disabled.

### F14 — Make update and rollback guarantees true on every supported platform

**P1 · effort L · change risk high · evidence: source trace; service failure injection not run.**

There are three concrete weaknesses:

1. `scripts/control-center.ps1:84-94` installs packages only when `node_modules` is absent. After a pull changes the lockfile, Update can build against stale dependencies.
2. In the no-supervisor branch (`control-center.ps1:152-164`), `.next-old` is deleted before startup health is known. `Start-Server` warns on failed health rather than throwing, followed by an unconditional Update complete message. Rollback is unavailable on that path.
3. `scripts/control-center.mjs:157` runs `npm ci` against the same dependency directory used by the running Unix app before the staged build. A failed build therefore does change the runtime environment. Restoring only `.next-old` does not restore the old dependencies. Database migrations are also not included in rollback planning.

**Change:** stage a complete release with the matching dependency tree, build and validate it separately, switch only after readiness, retain the old release until verification, and handle migrations with backups/compatibility rules. Use one clear failure outcome on every path and ensure updates cannot overlap.

**Accept when:** changed-lockfile, build failure, startup failure, stopped-supervisor, and migration-failure fixtures preserve or recover the previous usable release without a false success message.

### F15 — Escape generated service definitions

**P2 · effort M · change risk low · evidence: source trace; Linux/macOS execution unverified.**

`scripts/control-center.mjs:94` interpolates executable and script paths into an unquoted systemd `ExecStart`. A checkout path containing spaces, as this workspace name does, splits the script argument. The macOS plist also interpolates paths into XML without escaping characters such as `&`.

**Change:** apply platform-correct argument/string escaping to executable paths, working directories, and log paths, and validate the generated definitions with the platform tools.

**Accept when:** installation/startup works in paths containing spaces and XML-special characters in OS-specific CI or dedicated service tests.

### F16 — Enforce event size limits in bytes while reading

**P2 · effort M · change risk low · evidence: source trace.**

`app/src/app/api/events/route.ts:42-43` reads the complete request before checking `raw.length`. This measures JavaScript characters, not bytes, and cannot prevent allocating an oversized body. Multibyte JSON can exceed the documented 64 KiB limit while passing the check. Unauthorized attempts also generate a database write per rejection without a rate limit.

**Change:** enforce a streaming byte cap, use Content-Length only as an early hint, handle aborted reads cleanly, and bound rejection logging/rates. Maintain the existing authentication-first order.

**Accept when:** ASCII, multibyte, chunked, absent-length, oversized, and aborted requests have bounded reads and appropriate responses.

### F17 — Preserve literal client-brief text and recognize valid free-form briefs

**P2 · effort M · change risk low · evidence: reproduced.**

`app/src/lib/brief.ts:103` inserts user text into a JavaScript replacement string. Literal `$&` expands to the matched heading/template instead of remaining client text; the probe confirmed corruption. `isBriefFilled()` at line 36 only counts content under `##` headings, so a meaningful plain-text brief is shown as empty.

**Change:** use a replacement callback to preserve literal text, and recognize actual non-template content without requiring a specific heading format.

**Accept when:** `$&`, `$1`, dollar/backtick/apostrophe sequences, Unicode, plain paragraphs, and the untouched empty template are handled correctly. Do not edit existing client briefs automatically as part of this fix.

## Improvements

### I1 — Add tests around operational invariants

**P1 · effort L · change risk low.** `app/package.json` runs one `.mjs` test file with 14 tests. There are no committed app integration tests for the high-impact paths above. CI's cross-platform matrix does not exercise service installation/rollback.

Build fixture-only tests for F1–F17, then a small browser smoke suite for project creation, upload, restore preview/confirmation, instance switching, and error recovery. Inject filesystem/database/n8n dependencies so ordinary tests cannot touch real projects or services. Add a clean, isolated production-build check locally or in CI and verify actual CI results before release. Avoid coverage targets that encourage testing trivial implementation details.

### I2 — Add atomic file operations and recoverable operation records

**P2 · effort L · change risk medium.** Workflow JSON, README, registry, and changelog writes are independent direct writes. Restore combines a remote write with later local writes; project move fallback uses copy then remove. Failure between steps can leave partial state or ambiguous results. `restoreFromTrash()` removes `.registry-row` before the move succeeds (`projects.ts:464`).

Use atomic replacement for individual files, per-project operation locks, durable operation IDs, and explicit partial-success/retry handling. Preserve recovery metadata until all required steps succeed. Test disk-full, denied-write, rename/copy failure, and concurrent operations using fixtures.

### I3 — Back up Control Center state and test recovery

**P2 · effort L · change risk medium.** Project Git history does not include the ignored SQLite database or `.env.local`. Losing these loses instance configuration, logging preferences, capture definitions, tokens/keys, and monitoring history. The existing backup UI mainly means workflow/project Git snapshots.

Add an explicit local-state backup/restore procedure: SQLite-consistent snapshot, settings/schema version, separately protected secrets, retention, and a restore drill. Do not push secrets into project Git. Clearly distinguish local commit, remote backup, and recoverable application backup.

### I4 — Bind commits to the approved snapshot and enforce rules on the server

**P2 · effort L · change risk medium.** The commit dialog lists files from previously rendered props. `commitProjectAction()` accepts only a slug/message/changelog, and `git.ts:123-135` recomputes changes then uses `git add --all`. Files created by another tab/editor/auto-export after the preview can enter the commit without appearing in the approved list. Changelog-required logic exists in the client (`backup-card.tsx:130,166`) but is not enforced by the commit service; `appendChangelog()` silently does nothing when the file is missing.

Send an approved file/content snapshot, reject stale previews, scan/stage only that snapshot, and enforce changelog requirements server-side. Serialize commits per project. Test concurrent edits and a missing changelog without creating real project commits.

### I5 — Make settings changes durable before reporting success

**P2 · effort M/L · change risk medium.** `envfile.ts:39` changes `process.env` before the rename succeeds. Instance creation/update writes SQLite before saving the key; the legacy migration marks itself complete before durable work completes. A write failure can leave memory, SQLite, and the file disagreeing. Unquoted env values also need round-trip tests for special characters.

Persist and verify first, then update memory; distinguish missing-file from unreadable-file errors; use compensation or an explicit recoverable state across SQLite and secrets. Add settings load validation and atomic save tests. Keep real credentials out of tests.

### I6 — Reduce repeated synchronous work and make background failures visible

**P2 · effort L · change risk medium.** Project list rendering synchronously parses project files; backup badges invoke multiple synchronous Git commands with 10-second timeouts per project. Import/export repeatedly rebuilds the repository index. Large workspaces can block unrelated requests. Workflow cache refresh errors are swallowed on stale reads; outer auto-export failures are swallowed by the scheduler even though not every exception is logged by `runAutoExport()`.

Cache request-scoped filesystem indices, use bounded asynchronous Git inspection, and invalidate cached entries on writes. Persist last attempt, last success, stale state, partial failure, and next retry for each background operation. Add backoff and visible stale/gap indicators. Benchmark first; no latency measurements were taken in this audit.

### I7 — Apply the available patch update through the tested release path

**P2 · effort M · change risk medium.** npm reports Next.js 16.3.7 available against installed 16.3.6. No known dependency vulnerabilities were reported, so this is a maintenance recommendation, not a claim of an urgent security patch.

Review the official release notes, update the lockfile deliberately, rerun tests/typecheck/isolated build and smoke checks, then update the running app after approval. Add automated dependency-update proposals and periodic vulnerability checks. Keep framework/React upgrades separate from unrelated refactors. Pin/document the supported Node runtime; current local checks used Node 24.18.0 while CI specifies Node 22.

### I8 — Consolidate validation and duplicated helpers

**P3 · effort L · change risk medium.** Server actions form one large module; validation is handwritten and scattered. Changelog insertion and workflow naming/indexing are duplicated between CLI and app; attachment response MIME maps are duplicated. The CLI calls `checkImportable()` while the app import/restore paths do not use that shared connection check.

Extract small domain services and shared portable helpers, add runtime input schemas at server boundaries, and align CLI/app validation. Retain existing URLs/UI and do this after correctness fixes, with contract tests to prevent divergence. Do not replace the stack or introduce a generalized framework unnecessarily.

## Documentation corrections

### D1 — Align capability and security claims with implementation

**P2 · effort M · change risk low.** `app/README.md` and `n8n.ts` still describe publish/unpublish as the only writes to n8n, despite Restore. README's project-association explanation omits tracked-file priority. `SECURITY.md` says brief/test-result secret content is refused, contrary to F4. Update guarantees around backup, scanning, rollback, and credential rebinding to match verified behavior.

### D2 — Correct roadmap status and add operational contracts

**P3 · effort M/L · change risk low.** `Documentation/12-roadmap.md` says features in A–D do not exist, while several sections are already marked done. Missed-run monitoring is implemented even though B2 remains presented as future work. Record contracts for sync completeness, success metrics, alert clocks, restore identity, release rollback, and retention, each with acceptance cases.

### D3 — Resolve contradictory setup guidance without exposing the whole app

**P2 · effort M · change risk low.** `SECURITY.md` says the unauthenticated app must stay local/protected. README suggests binding `0.0.0.0` or using a tunnel for the event inbox and says the token protects the endpoint. That token protects only ingestion, not the dashboard/server actions. Explain authenticated network access or an ingest-only proxy; do not imply the Host allowlist is login. Owner credential guidance also differs between supplied session instructions and the current local override; reconcile with the owner before a future workflow build, without renaming credentials automatically.

## Polish

### P1 — Make UI state and interaction behavior consistent

**P3 · effort M/L · change risk low.** Restore and backup dialogs use simpler backdrop click handlers despite the existing `useBackdropClose()` helper that protects against drag-selection dismissal. Overview's active-project count (`page.tsx:29`) ignores the separate `.archived` marker. Chart tooltips are mouse-driven, although the table is available to keyboard users.

Use the shared dialog behavior, align archive counts/filtering, and consider keyboard/touch chart inspection while preserving the table. Then verify desktop/mobile layout, light/dark themes, keyboard focus, pending/error states, and reduced motion in the browser. No visual redesign is needed on current evidence.

## What to keep / what not to remove

Keep the local-first architecture, SQLite, project-owned Git repositories, plain Markdown documentation, shared sanitizer direction, explicit outbound confirmations, and recoverable trash. There is no evidence here that a cloud database, multi-user auth, queue platform, or full rewrite is needed for the current solo/local scope.

No live workflow or private project is recommended for removal: caller graphs, inbound traffic, ownership, and recent executions were not inspected. Potential code consolidation is listed under I8; preserve behavior while removing duplication.

## Suggested implementation sequence

| Order | IDs | Deliverable and release gate |
|---|---|---|
| 1 | F1–F7, I1, I4 | Safe identity, export/restore and secret handling; fixture regression suite passes before using automated writes as a safety net |
| 2 | F8–F13 | Accurate sync, alerts, metrics, lifecycle cleanup and retention; outage/window/clock fixtures pass |
| 3 | F14–F15, I2–I3, I5 | Recoverable writes and releases; failure injection and restore drill pass |
| 4 | F16–F17, I6–I8 | Bounded ingestion, literal brief preservation, observable background jobs, measured performance, dependency patch |
| 5 | D1–D3, P1 | Reconciled documentation and verified UI behavior; update relevant docs alongside earlier fixes as well |

Start with F1, F2, F3, F4, F5, F6, F7 and I1. The broader work is several engineering sessions, not a single quick cleanup. Avoid bundling every recommendation into one change; separate code review and rollback units by domain.

## Approval record

All 29 suggestions (F1–F17, I1–I8, D1–D3, P1) are proposed. None has been applied or approved. Owner can select IDs, a named subset, or decline. Live n8n writes, publishing, real side-effect tests, service restart/update, commits, and pushes retain their own applicable approval requirements.
