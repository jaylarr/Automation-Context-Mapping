import Database from 'better-sqlite3'
import fs from 'node:fs'
import path from 'node:path'
import { DATABASE_PATH } from './paths'
import { normText } from './search'

/**
 * Local SQLite database (no cloud). Holds logs, settings and cached n8n data only.
 * Projects themselves are read from the filesystem; the folders are the source of truth.
 */

const MIGRATIONS: string[] = [
  // 1: initial schema
  `
  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  -- App activity / audit log
  CREATE TABLE IF NOT EXISTS activity (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    level      TEXT    NOT NULL CHECK (level IN ('info','success','warn','error')),
    action     TEXT    NOT NULL,
    message    TEXT    NOT NULL,
    project    TEXT,
    meta       TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_activity_created ON activity(created_at DESC);

  -- Events POSTed by n8n workflows to /api/events
  CREATE TABLE IF NOT EXISTS events (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    received_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    level       TEXT    NOT NULL CHECK (level IN ('info','success','warn','error')),
    project     TEXT,
    workflow    TEXT,
    message     TEXT    NOT NULL,
    data        TEXT,
    source_ip   TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_events_received ON events(received_at DESC);
  CREATE INDEX IF NOT EXISTS idx_events_project  ON events(project);

  -- n8n executions synced from the n8n REST API
  CREATE TABLE IF NOT EXISTS executions (
    id            TEXT PRIMARY KEY,
    workflow_id   TEXT NOT NULL,
    workflow_name TEXT,
    project       TEXT,
    status        TEXT NOT NULL,
    mode          TEXT,
    started_at    TEXT,
    stopped_at    TEXT,
    duration_ms   INTEGER,
    error_message TEXT,
    error_node    TEXT,
    synced_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );
  CREATE INDEX IF NOT EXISTS idx_exec_started ON executions(started_at DESC);
  CREATE INDEX IF NOT EXISTS idx_exec_status  ON executions(status);
  CREATE INDEX IF NOT EXISTS idx_exec_project ON executions(project);
  `,
  // 2: multiple n8n instances. Executions are keyed by (instance, id) since ids repeat across instances.
  `
  CREATE TABLE IF NOT EXISTS instances (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    base_url   TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );

  ALTER TABLE executions RENAME TO executions_v1;
  CREATE TABLE executions (
    instance_id   TEXT NOT NULL,
    id            TEXT NOT NULL,
    workflow_id   TEXT NOT NULL,
    workflow_name TEXT,
    project       TEXT,
    status        TEXT NOT NULL,
    mode          TEXT,
    started_at    TEXT,
    stopped_at    TEXT,
    duration_ms   INTEGER,
    error_message TEXT,
    error_node    TEXT,
    synced_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    PRIMARY KEY (instance_id, id)
  );
  INSERT INTO executions (instance_id, id, workflow_id, workflow_name, project, status, mode, started_at, stopped_at, duration_ms, error_message, error_node, synced_at)
    SELECT 'legacy', id, workflow_id, workflow_name, project, status, mode, started_at, stopped_at, duration_ms, error_message, error_node, synced_at
    FROM executions_v1;
  DROP TABLE executions_v1;
  CREATE INDEX IF NOT EXISTS idx_exec_started  ON executions(started_at DESC);
  CREATE INDEX IF NOT EXISTS idx_exec_status   ON executions(status);
  CREATE INDEX IF NOT EXISTS idx_exec_project  ON executions(project);
  CREATE INDEX IF NOT EXISTS idx_exec_instance ON executions(instance_id);
  `,
  // 3: per-workflow settings (what to log, stats, alerts, snooze). Sync keeps the health columns fresh.
  `
  CREATE TABLE IF NOT EXISTS workflow_prefs (
    instance_id          TEXT    NOT NULL,
    workflow_id          TEXT    NOT NULL,
    workflow_name        TEXT,
    log_mode             TEXT    NOT NULL DEFAULT 'all' CHECK (log_mode IN ('all','errors','success','off')),
    ignore_manual        INTEGER NOT NULL DEFAULT 0,
    exclude_from_stats   INTEGER NOT NULL DEFAULT 0,
    expect_every_hours   INTEGER,
    expect_since         TEXT,
    alert_after_failures INTEGER,
    snoozed_until        TEXT,
    retention_days       INTEGER,
    last_run_at          TEXT,
    last_success_at      TEXT,
    fail_streak          INTEGER NOT NULL DEFAULT 0,
    updated_at           TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    PRIMARY KEY (instance_id, workflow_id)
  );
  CREATE INDEX IF NOT EXISTS idx_exec_workflow ON executions(instance_id, workflow_id);
  `,
  // 4: free-text notes and a runbook link per workflow
  `
  ALTER TABLE workflow_prefs ADD COLUMN notes TEXT;
  ALTER TABLE workflow_prefs ADD COLUMN runbook_url TEXT;
  `,
  // 5: captured fields: chosen values from a node's output, read from n8n execution data
  `
  ALTER TABLE workflow_prefs ADD COLUMN captures TEXT;
  ALTER TABLE executions ADD COLUMN captured TEXT;
  ALTER TABLE executions ADD COLUMN captured_at TEXT;
  `,
  // 6: installation identities and minimal execution facts, independent of detail logging.
  `
  ALTER TABLE instances ADD COLUMN uid TEXT;
  ALTER TABLE executions ADD COLUMN first_seen_at TEXT;
  UPDATE executions SET first_seen_at = synced_at;
  UPDATE instances SET uid = lower(hex(randomblob(16)));
  CREATE UNIQUE INDEX idx_instance_uid ON instances(uid);
  CREATE TABLE execution_facts (
    instance_id TEXT NOT NULL, id TEXT NOT NULL, workflow_id TEXT NOT NULL,
    status TEXT NOT NULL, mode TEXT, started_at TEXT, stopped_at TEXT,
    first_seen_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    observed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    PRIMARY KEY(instance_id,id)
  );
  CREATE TABLE health_carry (
    instance_id TEXT NOT NULL, workflow_id TEXT NOT NULL, through_at TEXT NOT NULL,
    fail_streak INTEGER NOT NULL, ignore_manual INTEGER NOT NULL, last_success_at TEXT,
    PRIMARY KEY(instance_id,workflow_id)
  );
  CREATE INDEX idx_facts_workflow ON execution_facts(instance_id, workflow_id, started_at);
  INSERT INTO execution_facts(instance_id,id,workflow_id,status,mode,started_at,stopped_at,first_seen_at)
    SELECT instance_id,id,workflow_id,status,mode,started_at,stopped_at,COALESCE(first_seen_at,synced_at) FROM executions;
  `,
  // 7: pause access without removing credentials or history; revision invalidates old work.
  `ALTER TABLE instances ADD COLUMN paused INTEGER NOT NULL DEFAULT 0 CHECK (paused IN (0,1));
   ALTER TABLE instances ADD COLUMN access_revision INTEGER NOT NULL DEFAULT 0;`,
]

function open(): Database.Database {
  fs.mkdirSync(path.dirname(DATABASE_PATH), { recursive: true })
  const db = new Database(DATABASE_PATH)
  db.pragma('journal_mode = WAL')
  db.pragma('synchronous = NORMAL')
  db.pragma('foreign_keys = ON')
  db.pragma('busy_timeout = 3000')

  // Read the schema version and migrate under one write lock (BEGIN IMMEDIATE). Several processes can
  // open a brand-new database at once (the build runs parallel workers); without the lock two of them
  // read the same version and both apply the same ALTER TABLE ("duplicate column name").
  db.transaction(() => {
    const current = db.pragma('user_version', { simple: true }) as number
    for (let v = current; v < MIGRATIONS.length; v++) {
      db.exec(MIGRATIONS[v])
      db.pragma(`user_version = ${v + 1}`)
    }
  }).immediate()
  return db
}

// Reuse one connection across hot reloads in dev.
const g = globalThis as unknown as { __ccDb?: Database.Database }
export const db: Database.Database = g.__ccDb ?? (g.__ccDb = open())

// SQLite's lower()/LIKE only fold ASCII, so "übersetzer" wouldn't find "Übersetzer". Registered on
// every load (not in open()) so a connection reused across hot reloads also gets it.
// unorm: lowercase + separators collapsed to one space (see lib/search.ts), for "test project" ≈ "test-project".
db.function('unorm', { deterministic: true }, (s: unknown) => (s == null ? null : normText(String(s))))
db.function('ulower', { deterministic: true }, (s: unknown) => (s == null ? null : String(s).toLowerCase()))
