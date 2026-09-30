# Control Center operations

## Setup

Use Node 22.18 or later and Git. Run `node scripts/setup.mjs --demo` for a fictional example,
or omit `--demo` for an empty workspace. Configure local connections, then run
`node scripts/control-center.mjs install`. Open Settings and follow the setup checklist.
Client projects and app state stay outside the public Git history.

The app is local and has no login. A Host allowlist is not authentication. Keep the dashboard
on loopback or behind authenticated access. An event-inbox token protects ingestion only.

## Four different kinds of backup

1. Workflow exports preserve sanitized definitions and credential references, not credential values.
2. Project Git commits preserve local project history.
3. A private remote preserves those commits away from this computer. Push deliberately; the app never pushes.
4. App recovery backups preserve SQLite state and the configured credential file. They do not include project folders.

Settings → App recovery backups creates a consistent SQLite snapshot, checks its hash/schema/integrity
using an independent disposable copy, and shows recent backups. The private snapshots are stored in
`app/data/snapshots/`, are unencrypted, and are not pushed. Protect this folder and copy recovery
points to protected storage elsewhere. Backups remain until manually archived; the UI does not
silently delete older recovery points. Existing CLI snapshots appear in the same panel.

Before restoring real app state: stop the owned service, preserve the current database/WAL/SHM
and credentials, verify the chosen snapshot, then replace the database. Keep old WAL/SHM files
with the old database; never combine them with a restored database. Restore credentials only if
needed. Start the app and verify connections/data before resuming jobs. Application release rollback
does not revert the database or discard data written after activation.

## Workflow bindings

Installation UIDs identify the actual source installation. Existing exports require an explicit
binding based on independent project records and verified source content, not name/ID guessing.
Preview a binding before applying it:

```powershell
node scripts/bind-workflow.mjs --project example-project --file 01-intake.json --installation INSTALLATION-UID
node scripts/bind-workflow.mjs --project example-project --file 01-intake.json --installation INSTALLATION-UID --confirm --expected PREVIEW-HASH
```

The source JSON remains unchanged. CLI exports require `--installation`. Automatic export only
updates bound source exports. Do not repurpose an existing connection URL for a different installation.

## Guided workflow restore

Open a saved workflow's Restore dialog, deliberately select its target, then open reference setup.
Enter target credential IDs/names and explicitly attest that you checked their type/ID/name in the
target n8n UI. Same-installation IDs are preserved. Credential verification is manual; matching names
are insufficient. Required error/subworkflow references are fetched from the target before saving.
Dynamic references and cross-installation caller restrictions require manual review.

Saving references writes `documentation/restore-mappings.json` in the project and does not restore.
Review the fresh preview, then confirm. New workflows are unpublished; existing published targets
remain published and can change live behavior. Published updates require typed confirmation.
The preview expires after ten minutes and is invalidated by source/target/mapping changes.

The restore API payload includes name, nodes, connections and supported settings. Description, tags
and node groups remain in the local backup. Target IDs are recorded separately; source IDs stay intact.
If a remote write has an uncertain outcome, retain `app/data/restore-journal/`, identify the actual
remote result, and reconcile it before retrying. Never repeat an uncertain create blindly.

## Background work and recovery

Settings → Background activity displays sync/export/retention attempt state, last success, message
and next scheduled attempt. Failed automatic sync/export jobs back off. A successful request is
separate from complete history: installation status reports backfill or missing checkpoints.
History deleted upstream cannot be reconstructed by sync. Metrics use observed minimal facts;
detailed log filtering does not remove those facts. Days are UTC.

Project detail/registry changes and trash moves retain private recovery records under
`app/data/project-operations/`. A failed rename preserves the source; no copy/remove fallback
deletes a partially copied project. Settings shows interrupted changes and permits an explicit
resume when current files match the expected before/after contents. Conflicting edits require
manual reconciliation. Inspect the recorded process before removing a stale operation lock.

## Updates and validation

`node scripts/control-center.mjs update` stages source, locked dependencies and a production build
in a separate release. Checks use a disposable database/workspace with jobs and remote requests off.
Before promotion, a private app snapshot is taken. Health must report the expected release ID.
Failed activation attempts restore the prior application pointer and check the previous release.
Future incompatible database migrations require their own recovery plan.

The first old Windows launcher transition needs a deliberate stop of its verified supervisor.
The updater does not kill an arbitrary listener on port 3100. Subsequent stop/start requests target
the runtime's owned child. macOS/Linux use native user services; verify native transitions on each
platform before relying on them. In-app maintenance currently supports Windows.

Run `npm run typecheck` and `npm test` in `app/`. For browser smoke tests, run
`npx playwright install chromium`, create an isolated build/release, then run `npm run test:browser`.
Set `CONTROL_CENTER_TEST_APP` to a staged app directory when testing a release; Windows can use
`CONTROL_CENTER_BROWSER_CHANNEL=msedge` for installed Edge. The suite always uses disposable
projects/database/keys and a local GET-only n8n mock. It never presses the final remote restore button.
Screenshots/logs are private under `app/data/browser-tests/`.

## Private audit and update history

Maintain audit reports, implementation notes and operational verification outside this repository.
Keep a chronological private index with dates, scope, findings, changes, tests, remaining limits and
commit/release references. Do not record credentials. Public docs describe supported usage and
recovery procedures; private notes hold installation/project-specific audit evidence.
