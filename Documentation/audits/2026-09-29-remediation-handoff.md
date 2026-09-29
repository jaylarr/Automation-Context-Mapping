# Audit remediation: implementation and operating guide

Status: activated on the owner's Windows Control Center on 2026-09-29; ten current exports were bound to their verified source installation. See the rollout evidence below. Earlier implementation-only evidence is retained as historical context.

## Rollout evidence — 2026-09-29

- Remote `main` was verified at `6f6f5c16307e261e29b531c75259e0873e0f200c`; its [GitHub CI run passed](https://github.com/jaylarr/n8n-agent-workspace/actions/runs/36587093613).
- Created private SQLite/API-credential recovery snapshots before activation; snapshot integrity checks passed. The live database migrated from schema 5 to 6 and passed `PRAGMA integrity_check` afterward.
- Active release: `1790695807563-fdce667e-6114-494b-bbb4-70c4ba877978`. Its isolated dependency install, typecheck, 30 tests, and production build passed. The first staging attempt correctly stopped before activation because its offline guard also blocked mocked API tests; fixture setup now denies unmocked fetches while allowing explicit mocks.
- Transitioned the verified legacy Windows scheduled task to the release runtime. Both initial startup and a subsequent owned-runtime stop/start passed release-ID health checks. Failure-triggered live rollback was not exercised.
- Overview, Projects, Workflows, Logs, Settings, Docs, and all four migrated project detail pages returned HTTP 200. This is HTTP verification, not visual/browser verification.
- Bound ten top-level workflow exports across portfolio-booking-alerts (2), shared-utilities (2), site-voice-photo-doc-bot (4), and test-project-instant-quality-complaint (2). Each source URL/ID was independently recorded in its project AGENTS.md, and each portable content fingerprint matched a read-only fetch from that installation. Every source JSON remained byte-for-byte unchanged. Project changelogs record the binding migration; archived helper exports remain unbound historical files.
- A primary-installation read-only sync fetched 93 executions (1 inserted, 92 updated); status was `ok`, with no pending cursor or recorded gap. This does not prove history already deleted upstream is complete. Existing monitoring settings were preserved; automatic export and automatic commits remain off.
- No n8n workflows were edited, executed, restored, or published. The secondary installation was not used for binding migration or a manual sync; existing background monitoring continues under its saved configuration.
- Top-level README and fixture-test correction are local, uncommitted changes beyond the pushed commit. Project bindings/changelog updates are local private-project changes. No commit or push was performed during rollout.
- Remaining validation limits: native Linux/macOS service operation, visual/browser review, real restore execution, and live failure/rollback. Next.js emitted a nested-lockfile root-inference warning, and Node emitted its fixed-argument Windows shell deprecation warning; neither failed the build or live checks.

This change addresses F1–F17 from the September 29 audit, with supporting regression tests, atomic writes, exact Git snapshot handling, and a private app-state snapshot helper. Optional product redesigns and dependency upgrades are not included.

## What changed

| Finding | Implemented behavior | Important boundary |
|---|---|---|
| F1 | Immutable installation UIDs and versioned project workflow bindings; import/export and project lookup use installation plus workflow ID | Legacy files require explicit binding. No real files were migrated automatically |
| F2 | Known secrets checked inside expressions, node content, and retained metadata; secret-field expressions are treated conservatively | Pattern scanning is not proof that arbitrary content contains no secrets |
| F3 | Extension-independent scanning, fail-closed unsupported files, exact staged-blob inspection, private Git index, HEAD compare-and-swap | Files over Git's 64 MiB inspection buffer fail rather than bypass inspection; hooks/signing require manual commits |
| F4 | Text and complete attachment batches preflight before persistence; exclusive file creation and failed-batch rollback | New binary/non-UTF-8 uploads are rejected. Keep originals outside the repository and upload sanitized text extracts |
| F5 | Explicit credential/workflow mappings, expiring source/target-bound restore preview, readback, durable operation journal | Credential existence is manually verified; the code does not invent a credential-list API or rebind by name |
| F6 | Source JSON ID never rewritten after cross-installation restore; target ID stored structurally in the binding manifest | Minified exports remain intact |
| F7 | Fingerprint includes retained description, tags and node groups as well as behavior/layout | Remote runtime state and source ID do not affect the content fingerprint |
| F8 | Deduplicated execution facts drive health; compacted history retains a failure checkpoint | Indeterminate terminal outcomes break a consecutive-failure claim |
| F9 | Missed-success timer uses the later of the latest success and expectation-setting time | Changing expectations starts a new clock |
| F10 | Durable pagination cursor/checkpoint, unfinished-run reconciliation, gap status | Only history still available from n8n can be recovered; pending backfill and missing checkpoints are reported |
| F11 | Metrics use facts before detailed-log filtering; rate denominator is success + error + crashed; Other has its own chart color | Metrics describe observed history, not an assertion that n8n retained every historical run; days are UTC |
| F12 | Removal clears preferences, facts, health checkpoints, sync state and workflow cache; late requests cannot repopulate a removed installation | Re-added connections receive new IDs |
| F13 | Hourly retention runs independently of n8n sync; null execution dates fall back to observation time; old facts compact into health checkpoints | Facts retain at least seven days for metrics. Pending runs remain available for reconciliation. Late outcomes crossing a checkpoint mark health history indeterminate |
| F14 | Separate release directories contain source, dependencies and build; isolated staging uses npm ci; private verified SQLite snapshot precedes promotion; release-specific health and rollback | Windows activation and owned-runtime restart verified in the rollout above; failure-triggered live rollback remains untested |
| F15 | systemd command arguments quoted; launchd XML escaped; no arbitrary listener termination | Native macOS/Linux service startup remains unverified on this Windows machine |
| F16 | Authenticated, streamed 64 KiB byte limit; malformed/aborted input handled; rejection logging rate-limited | Forwarded IP headers are not trusted as client identity |
| F17 | Callback replacement preserves literal dollar text; plain-text briefs count as filled | Existing client briefs were not edited |

## Before activating this release

1. Review the code diff and this guide. Preserve unrelated local work.
2. Run `npm.cmd run typecheck` and `npm.cmd test` in `app/` using Node 22.18 or later.
3. Build in isolation: set a disposable `WORKSPACE_ROOT`, `DATABASE_PATH`, and `CONTROL_CENTER_ENV_FILE`; set `CONTROL_CENTER_BACKGROUND=off`, `CONTROL_CENTER_OFFLINE=1`, and a separate `NEXT_DIST_DIR`. Never point a validation build at the live database.
4. Approve the maintenance window and database migration. The new schema is additive: installation UIDs, execution facts, and compacted health checkpoints. Historical detailed rows seed the facts table; this does not establish complete historical coverage until sync catches up.
5. The release helper stages into `app/data/releases/<release-id>/app`, installs from the lockfile, runs typecheck/tests/build, and keeps live dependencies untouched. Builds have an empty fixture workspace and disabled remote calls/jobs.
6. The first Windows transition is intentionally conservative: stop the existing legacy supervisor/server using the previously installed operational procedure. The new script refuses to kill an arbitrary process just because it listens on port 3100. Do not remove a runtime lock until its recorded process has been checked.
7. Run `node scripts/control-center.mjs install` for the first transition, or `update` once the release runtime is installed. These operations change the running app and need separate approval in this workspace.
8. Activation creates a private state snapshot before changing the active release pointer. A failed build never promotes a candidate. A failed candidate health check restores the prior pointer and verifies the prior release where its health endpoint exposes identity.
9. A legacy build may lack release identity in its health response: rollback then reports health as unverified, even if it answers HTTP. Inspect it explicitly rather than treating any HTTP 200 as proof of recovery.
10. Database rollback is not automatic. This migration is additive and the release declares compatibility with schema 5. A future incompatible migration must be given its own approved migration/recovery procedure; the release compatibility guard must not be bypassed.
11. Confirm `/api/health` reports the candidate release ID, inspect the maintenance log, then run a read-only sync and watch its coverage status. Binding migration follows separately below.

## Bind existing workflow exports without guessing

1. After approved activation, copy the installation UID from Settings. Identify which actual installation produced each export from independent project records; a matching remote ID or workflow name is insufficient.
2. Preview one file from the workspace root:

   ```powershell
   node scripts/bind-workflow.mjs --project example-project --file 01-intake.json --installation INSTALLATION-UID
   ```

3. Inspect the reported project, file, source tuple and `expected` hash. This preview does not write files or contact n8n.
4. Once that mapping is approved, repeat with `--confirm --expected HASH`. Changed file/manifest content invalidates the hash. The script refuses duplicate bindings and leaves source JSON unchanged.
5. Review `documentation/workflow-bindings.json` in the project's private repo. Commit only after approval. Source bindings identify export ownership; target bindings record restored copies without transferring ownership.
6. CLI exports now require `--installation INSTALLATION-UID`. An existing unbound file cannot be silently overwritten. Auto-export only updates bound source files.

## Restore mappings and recovery

Create `documentation/restore-mappings.json` in the specific project only after verifying target IDs in the target n8n installation. Its shape is:

```json
{
  "TARGET-INSTALLATION-UID": {
    "credentials": {
      "httpHeaderAuth:SOURCE-CREDENTIAL-ID": {
        "id": "TARGET-CREDENTIAL-ID",
        "name": "Verified target credential name",
        "verified": true
      }
    },
    "workflows": {
      "SOURCE-ERROR-OR-SUBWORKFLOW-ID": "TARGET-WORKFLOW-ID"
    }
  }
}
```

These are references, never credential values. `verified: true` records a deliberate manual verification, not an API-generated assurance. Credential mappings are required even on the original installation; their IDs must remain unchanged there. Cross-installation error/subworkflow mappings are checked by fetching the referenced target workflows. Dynamic/unresolved references and cross-installation `callerIds` block restore.

The Restore dialog issues a ten-minute, one-use server preview. Changed files, mappings, installation URL, or remote target invalidate it. Published targets still require the explicit typed confirmation. Restore does not call publish, but an already-published target remains published. The public-API payload sends name, nodes, connections and supported settings; tags, description and node groups remain in the source backup.

If a write times out, or readback/local recording fails, inspect the matching file in `app/data/restore-journal/`. Do not repeat POST to create another copy. A `remote-applied` record includes the known remote ID; a `pending` create may have succeeded remotely without returning it. Identify the result in the target n8n UI/API, compare its nodes/connections/settings to the intended source and mappings, and explicitly resolve which remote ID to retain. Only after an approved manual reconciliation should the manifest and journal be repaired. Preserve the original journal as recovery evidence. There is intentionally no automatic uncertain-create retry or name-based reconciliation.

## Private state snapshots

`node scripts/snapshot-control-center.mjs` creates a new directory under `app/data/snapshots/` containing:

- A SQLite backup made through SQLite's backup API, including committed WAL data.
- `.env.local`, when configured, protected as a private credential-bearing file.
- A manifest with schema version, database hash, and integrity result.

Snapshots are gitignored; they are not encrypted. Protect the directory as credential-bearing data. Project repositories and original attachments are separate backups.

For a recovery drill, copy a snapshot database into a disposable directory, verify its SHA-256 and `PRAGMA integrity_check`, and inspect expected configuration/counts. Keep credentials unloaded and background/remote access disabled. Before any real database restoration, stop the owned runtime, preserve its current database/WAL/SHM and credential file as another recovery point, confirm the desired recovery time, and approve replacement. Do not combine an older main database with newer WAL/SHM files. Automatic release rollback does not replace the database or erase post-activation data.

## Changed user-facing policies

- Briefs and evidence reject detected secrets before saving. Text attachments use UTF-8, at most 25 MiB each, 20 per submission, and 90 MiB combined. Unsupported binary/encoding content is blocked rather than declared safe. Existing attachments are not removed or rewritten.
- Git previews are content-bound. Changed content requires refresh/review. The app scans prepared Git blobs, preserves unrelated staging, and refuses hooks/signing configurations that require a manual commit. Pattern matches never echo the secret bytes.
- Detail log filters do not erase minimal monitoring facts. Facts use the longer of seven days and the workflow/global retention, then compact into a per-workflow health checkpoint. Old pending runs remain until reconciliation. Retention applies to log history even while a project sits in the trash.
- Persistent gap messages mean historical coverage needs review. They do not mean the most recent HTTP request failed. Resetting a gap must be a deliberate operational decision after inspecting coverage.
- Instance UIDs identify installations, not display names or mutable URLs. To connect a different installation, add a new connection; do not repurpose an existing connection's URL.

## Initial implementation validation evidence and limits (before rollout)

- 30 automated tests passed locally, including real temporary SQLite/Git fixtures, mocked multi-page n8n sync, late response removal, source-preserving restore/readback, uncertain-create blocking, release staging failure, and an independent WAL-backed snapshot restore.
- Typecheck passed. An isolated optimized production build passed after allowing the existing Google Fonts download. Background jobs and remote n8n calls were disabled, and the database/workspace were disposable.
- Final PowerShell parsing, JavaScript syntax checks, and Git whitespace checks passed. The final isolated production build completed without warnings.
- A disposable production server on port 3117 returned HTTP 200 for health, Overview, Projects, Workflows, Logs, Settings and Docs. Inbox checks returned 401 for missing authentication, 413 for oversized UTF-8 input, 400 for malformed JSON, and 201 for a fixture event. The fixture server was stopped afterward. This was an HTTP smoke test, not browser or native service validation.
- No real n8n writes, workflow executions, live database migrations, production restart, Git commit or push were performed.
- macOS/Linux service registration and Windows service transition/rollback have not been exercised against live services. Serializer/fixture tests do not establish native service success.
- This is not completion of every optional I1–I8/D1–D3/P1 product enhancement. It implements the fixes and the supporting safeguards described above. A full backup-management UI, generalized job dashboard, broad refactor, and dependency-update sweep remain separate work.

Service argument handling follows the upstream [systemd service command-line rules](https://github.com/systemd/systemd/blob/main/man/systemd.service.xml). Native service-manager verification remains a release gate on those platforms.
