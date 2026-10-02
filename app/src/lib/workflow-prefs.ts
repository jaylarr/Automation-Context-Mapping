import { db } from './db'
import { type CaptureSpec, parseCaptures } from './capture'

/**
 * Per-workflow settings, keyed by (instance, workflow id). Local to the Control Center only:
 * none of this changes anything in n8n. Unpublishing is a separate, explicit action (n8n.ts).
 */

export type LogMode = 'all' | 'errors' | 'success' | 'off'
export const LOG_MODES: { id: LogMode; label: string; hint: string }[] = [
  { id: 'all', label: 'All runs', hint: 'Log every execution (default).' },
  { id: 'errors', label: 'Errors only', hint: 'Only failed and crashed runs are logged.' },
  { id: 'success', label: 'Success only', hint: 'Only successful runs are logged.' },
  { id: 'off', label: 'Stop tracking', hint: 'Record nothing: no execution logs, statistics, captured values or health updates.' },
]

export type WorkflowPrefs = {
  instanceId: string
  workflowId: string
  workflowName: string | null
  logMode: LogMode
  ignoreManual: boolean
  excludeFromStats: boolean
  expectEveryHours: number | null
  expectSince: string | null
  alertAfterFailures: number | null
  snoozedUntil: string | null
  /** Days to keep this workflow's logged runs; null = the global setting. */
  retentionDays: number | null
  /** Free text: client, owner, what to do when it fails. */
  notes: string | null
  /** Optional link to a doc with the full fix steps. */
  runbookUrl: string | null
  /** Node output fields to keep from each run (read from n8n execution data). */
  captures: CaptureSpec[]
  lastRunAt: string | null
  lastSuccessAt: string | null
  failStreak: number
}

type Row = {
  instance_id: string
  workflow_id: string
  workflow_name: string | null
  log_mode: LogMode
  ignore_manual: number
  exclude_from_stats: number
  expect_every_hours: number | null
  expect_since: string | null
  alert_after_failures: number | null
  snoozed_until: string | null
  retention_days: number | null
  notes: string | null
  runbook_url: string | null
  captures: string | null
  last_run_at: string | null
  last_success_at: string | null
  fail_streak: number
}

const fromRow = (r: Row): WorkflowPrefs => ({
  instanceId: r.instance_id,
  workflowId: r.workflow_id,
  workflowName: r.workflow_name,
  logMode: r.log_mode,
  ignoreManual: Boolean(r.ignore_manual),
  excludeFromStats: Boolean(r.exclude_from_stats),
  expectEveryHours: r.expect_every_hours,
  expectSince: r.expect_since,
  alertAfterFailures: r.alert_after_failures,
  snoozedUntil: r.snoozed_until,
  retentionDays: r.retention_days,
  notes: r.notes,
  runbookUrl: r.runbook_url,
  captures: parseCaptures(r.captures),
  lastRunAt: r.last_run_at,
  lastSuccessAt: r.last_success_at,
  failStreak: r.fail_streak,
})

export const prefsKey = (instanceId: string, workflowId: string) => `${instanceId}:${workflowId}`

export function defaultPrefs(instanceId: string, workflowId: string, workflowName: string | null = null): WorkflowPrefs {
  return {
    instanceId,
    workflowId,
    workflowName,
    logMode: 'all',
    ignoreManual: false,
    excludeFromStats: false,
    expectEveryHours: null,
    expectSince: null,
    alertAfterFailures: null,
    snoozedUntil: null,
    retentionDays: null,
    notes: null,
    runbookUrl: null,
    captures: [],
    lastRunAt: null,
    lastSuccessAt: null,
    failStreak: 0,
  }
}

/** True when the prefs differ from the defaults (so the row is worth keeping and badging). */
export function isCustomized(p: WorkflowPrefs): boolean {
  return (
    p.logMode !== 'all' ||
    p.ignoreManual ||
    p.excludeFromStats ||
    p.expectEveryHours !== null ||
    p.alertAfterFailures !== null ||
    p.retentionDays !== null ||
    Boolean(p.notes) ||
    Boolean(p.runbookUrl) ||
    p.captures.length > 0 ||
    isSnoozed(p)
  )
}

export function isSnoozed(p: Pick<WorkflowPrefs, 'snoozedUntil'>, now = Date.now()): boolean {
  return Boolean(p.snoozedUntil && Date.parse(p.snoozedUntil) > now)
}

export function listWorkflowPrefs(instanceId?: string | null): WorkflowPrefs[] {
  const rows = db
    .prepare('SELECT * FROM workflow_prefs WHERE (? IS NULL OR instance_id = ?)')
    .all(instanceId ?? null, instanceId ?? null) as Row[]
  return rows.map(fromRow)
}

export function prefsMap(instanceId?: string | null): Map<string, WorkflowPrefs> {
  return new Map(listWorkflowPrefs(instanceId).map((p) => [prefsKey(p.instanceId, p.workflowId), p]))
}

export type PrefsInput = Pick<
  WorkflowPrefs,
  'logMode' | 'ignoreManual' | 'excludeFromStats' | 'expectEveryHours' | 'alertAfterFailures' | 'snoozedUntil' | 'retentionDays' | 'notes' | 'runbookUrl' | 'captures'
>

export function saveWorkflowPrefs(instanceId: string, workflowId: string, workflowName: string | null, input: PrefsInput): WorkflowPrefs {
  const prev = db.prepare('SELECT * FROM workflow_prefs WHERE instance_id = ? AND workflow_id = ?').get(instanceId, workflowId) as Row | undefined
  // The missed-run clock starts when the expectation is first set (or changed), not at some old run.
  const expectSince =
    input.expectEveryHours === null
      ? null
      : prev && prev.expect_every_hours === input.expectEveryHours && prev.expect_since
        ? prev.expect_since
        : new Date().toISOString()
  db.prepare(
    `INSERT INTO workflow_prefs (instance_id, workflow_id, workflow_name, log_mode, ignore_manual, exclude_from_stats,
       expect_every_hours, expect_since, alert_after_failures, snoozed_until, retention_days, notes, runbook_url, captures, updated_at)
     VALUES (@instance_id, @workflow_id, @workflow_name, @log_mode, @ignore_manual, @exclude_from_stats,
       @expect_every_hours, @expect_since, @alert_after_failures, @snoozed_until, @retention_days, @notes, @runbook_url, @captures, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
     ON CONFLICT(instance_id, workflow_id) DO UPDATE SET
       workflow_name = COALESCE(excluded.workflow_name, workflow_name), log_mode = excluded.log_mode,
       ignore_manual = excluded.ignore_manual, exclude_from_stats = excluded.exclude_from_stats,
       expect_every_hours = excluded.expect_every_hours, expect_since = excluded.expect_since,
       alert_after_failures = excluded.alert_after_failures, snoozed_until = excluded.snoozed_until, retention_days = excluded.retention_days,
       notes = excluded.notes, runbook_url = excluded.runbook_url, captures = excluded.captures,
       updated_at = excluded.updated_at`,
  ).run({
    instance_id: instanceId,
    workflow_id: workflowId,
    workflow_name: workflowName,
    log_mode: input.logMode,
    ignore_manual: input.ignoreManual ? 1 : 0,
    exclude_from_stats: input.excludeFromStats ? 1 : 0,
    expect_every_hours: input.expectEveryHours,
    expect_since: expectSince,
    alert_after_failures: input.alertAfterFailures,
    snoozed_until: input.snoozedUntil,
    retention_days: input.retentionDays,
    notes: input.notes,
    runbook_url: input.runbookUrl,
    captures: input.captures.length ? JSON.stringify(input.captures) : null,
  })
  // New or changed captures: re-read the runs already logged (while n8n still has their data).
  if (JSON.stringify(parseCaptures(prev?.captures ?? null)) !== JSON.stringify(input.captures))
    db.prepare('UPDATE executions SET captured = NULL, captured_at = NULL WHERE instance_id = ? AND workflow_id = ?').run(instanceId, workflowId)
  recordHealth(instanceId, new Map([[workflowId, {name: workflowName, runs: []}]]), prefsMap(instanceId))
  return fromRow(db.prepare('SELECT * FROM workflow_prefs WHERE instance_id = ? AND workflow_id = ?').get(instanceId, workflowId) as Row)
}

// ---------------------------------------------------------------- logging filter (used by sync)

const FAILED = new Set(['error', 'crashed'])

/** Should this execution be stored? Runs started from the n8n editor have mode "manual". */
export function shouldLog(p: WorkflowPrefs | undefined, status: string, mode: string | null | undefined): boolean {
  if (!p) return true
  if (p.logMode === 'off') return false
  if (p.ignoreManual && mode === 'manual') return false
  if (p.logMode === 'errors') return FAILED.has(status)
  if (p.logMode === 'success') return status === 'success'
  return true
}

/** Deletes stored executions that the workflow's current settings would no longer log. */
export function purgeNonMatching(p: WorkflowPrefs): number {
  if (p.logMode === 'off') return db.transaction(() => {
    const removed = db.prepare('DELETE FROM executions WHERE instance_id=? AND workflow_id=?').run(p.instanceId,p.workflowId).changes
    db.prepare('DELETE FROM execution_facts WHERE instance_id=? AND workflow_id=?').run(p.instanceId,p.workflowId)
    db.prepare('DELETE FROM health_carry WHERE instance_id=? AND workflow_id=?').run(p.instanceId,p.workflowId)
    db.prepare('UPDATE workflow_prefs SET last_run_at=NULL,last_success_at=NULL,fail_streak=0 WHERE instance_id=? AND workflow_id=?').run(p.instanceId,p.workflowId)
    return removed
  })()
  const where: string[] = []
  if (p.logMode === 'errors') where.push("status NOT IN ('error','crashed')")
  if (p.logMode === 'success') where.push("status <> 'success'")
  if (p.ignoreManual) where.push("mode = 'manual'")
  if (!where.length) return 0
  return db
    .prepare(`DELETE FROM executions WHERE instance_id = ? AND workflow_id = ? AND (${where.join(' OR ')})`)
    .run(p.instanceId, p.workflowId).changes
}

/**
 * Updates last run / last success / failure streak from one sync's executions (newest first).
 * Runs before detailed-log filtering; fully stopped workflows do not update health.
 */
export function recordHealth(
  instanceId: string,
  byWorkflow: Map<string, { name: string | null; runs: { status: string; mode: string | null; startedAt: string | null }[] }>,
  prefs: Map<string, WorkflowPrefs>,
): void {
  const update = db.prepare(
    `UPDATE workflow_prefs SET
       workflow_name = COALESCE(?, workflow_name),
       last_run_at = MAX(COALESCE(last_run_at, ''), COALESCE(?, '')),
       last_success_at = ?,
       fail_streak = ?
     WHERE instance_id = ? AND workflow_id = ?`,
  )
  db.transaction(() => {
    for (const [workflowId, { name, runs }] of byWorkflow) {
      const p = prefs.get(prefsKey(instanceId, workflowId))
      if (!p || p.logMode === 'off') continue
      const carry = db.prepare('SELECT through_at,fail_streak,ignore_manual,last_success_at FROM health_carry WHERE instance_id=? AND workflow_id=?').get(instanceId,workflowId) as {through_at:string;fail_streak:number;ignore_manual:number;last_success_at:string|null} | undefined
      const counted = db.prepare(`SELECT status, mode, started_at AS startedAt FROM execution_facts
        WHERE instance_id = ? AND workflow_id = ? AND started_at IS NOT NULL
        AND (? = 0 OR mode IS NOT 'manual') AND started_at > ? ORDER BY started_at DESC, id DESC`).all(instanceId, workflowId, p.ignoreManual ? 1 : 0, carry?.through_at ?? '') as { status: string; startedAt: string }[]
      if (!counted.length) {
        if (carry) update.run(name, null, (carry.ignore_manual === (p.ignoreManual ? 1 : 0) ? carry.last_success_at : null), carry.ignore_manual === (p.ignoreManual ? 1 : 0) ? carry.fail_streak : 0, instanceId, workflowId)
        continue
      }
      const lastRun = counted[0].startedAt
      const lastSuccess = counted.find((r) => r.status === 'success')?.startedAt ?? (carry?.ignore_manual === (p.ignoreManual ? 1 : 0) ? carry.last_success_at : null)
      let streak = 0
      let boundary = false
      for (const r of counted) {
        if (FAILED.has(r.status)) streak++
        else if (!['running', 'waiting', 'new'].includes(r.status)) { boundary = true; break }
      }
      if (!boundary && carry?.ignore_manual === (p.ignoreManual ? 1 : 0)) streak += carry.fail_streak
      update.run(name, lastRun, lastSuccess, streak, instanceId, workflowId)
    }
  })()
}

// ---------------------------------------------------------------- alerts

export type WorkflowAlert = {
  instanceId: string
  workflowId: string
  workflowName: string
  kind: 'missed' | 'failing'
  message: string
  notes: string | null
  runbookUrl: string | null
}

export function workflowAlerts(instanceId?: string | null, now = Date.now()): WorkflowAlert[] {
  const out: WorkflowAlert[] = []
  const paused = new Set((db.prepare('SELECT id FROM instances WHERE paused = 1').all() as { id: string }[]).map(i => i.id))
  for (const p of listWorkflowPrefs(instanceId)) {
    if (paused.has(p.instanceId)) continue
    if (p.logMode === 'off' || isSnoozed(p, now)) continue
    const name = p.workflowName ?? `Workflow ${p.workflowId}`
    if (p.alertAfterFailures && p.failStreak >= p.alertAfterFailures)
      out.push({ instanceId: p.instanceId, workflowId: p.workflowId, workflowName: name, kind: 'failing', message: `${p.failStreak} failed runs in a row`, notes: p.notes, runbookUrl: p.runbookUrl })
    if (p.expectEveryHours) {
      const clocks = [p.lastSuccessAt, p.expectSince].map((v) => Date.parse(v ?? '')).filter(Number.isFinite)
      const due = clocks.length ? Math.max(...clocks) + p.expectEveryHours * 3_600_000 : NaN
      if (Number.isFinite(due) && due < now)
        out.push({
          instanceId: p.instanceId,
          workflowId: p.workflowId,
          workflowName: name,
          kind: 'missed',
          notes: p.notes,
          runbookUrl: p.runbookUrl,
          message: p.lastSuccessAt
            ? `No successful run for over ${p.expectEveryHours} h`
            : `No successful run in the ${p.expectEveryHours} h since this alert was set`,
        })
    }
  }
  return out
}

/** SQL fragment that drops executions of workflows hidden from stats. Alias the executions table as `e`. */
export const NOT_EXCLUDED_SQL = `NOT EXISTS (SELECT 1 FROM workflow_prefs wp WHERE wp.instance_id = e.instance_id AND wp.workflow_id = e.workflow_id AND (wp.log_mode = 'off' OR wp.exclude_from_stats = 1 OR (wp.ignore_manual = 1 AND e.mode = 'manual')))`

/** All-statistics view still respects the owner's ignore-test-runs preference. */
export const ALL_STATISTICS_SQL = `NOT EXISTS (SELECT 1 FROM workflow_prefs wp WHERE wp.instance_id = e.instance_id AND wp.workflow_id = e.workflow_id AND wp.ignore_manual = 1 AND e.mode = 'manual')`

/** Same, and also hides snoozed workflows (for "recent failures" style lists). */
export const NOT_EXCLUDED_OR_SNOOZED_SQL = `NOT EXISTS (SELECT 1 FROM instances i WHERE i.id = e.instance_id AND i.paused = 1) AND NOT EXISTS (SELECT 1 FROM workflow_prefs wp WHERE wp.instance_id = e.instance_id AND wp.workflow_id = e.workflow_id AND (wp.log_mode = 'off' OR wp.exclude_from_stats = 1 OR wp.snoozed_until > strftime('%Y-%m-%dT%H:%M:%fZ','now')))`
