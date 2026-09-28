import { db } from './db'
import { NOT_EXCLUDED_OR_SNOOZED_SQL, NOT_EXCLUDED_SQL } from './workflow-prefs'

export type Level = 'info' | 'success' | 'warn' | 'error'
export const LEVELS: Level[] = ['info', 'success', 'warn', 'error']

export type ActivityRow = {
  id: number
  created_at: string
  level: Level
  action: string
  message: string
  project: string | null
  meta: string | null
}

export type EventRow = {
  id: number
  received_at: string
  level: Level
  project: string | null
  workflow: string | null
  message: string
  data: string | null
  source_ip: string | null
}

export type ExecutionRow = {
  instance_id: string
  id: string
  workflow_id: string
  workflow_name: string | null
  project: string | null
  status: string
  mode: string | null
  started_at: string | null
  stopped_at: string | null
  duration_ms: number | null
  error_message: string | null
  error_node: string | null
  /** JSON CapturedValue[] (see lib/capture.ts), or null. */
  captured: string | null
}

export type Page<T> = { rows: T[]; total: number; page: number; pageSize: number }

export const PAGE_SIZE = 25

// ---------------------------------------------------------------- activity

export function logActivity(entry: {
  level?: Level
  action: string
  message: string
  project?: string | null
  meta?: unknown
}): void {
  db.prepare(
    `INSERT INTO activity (level, action, message, project, meta) VALUES (?, ?, ?, ?, ?)`,
  ).run(
    entry.level ?? 'info',
    entry.action,
    entry.message,
    entry.project ?? null,
    entry.meta === undefined ? null : JSON.stringify(entry.meta),
  )
}

// ---------------------------------------------------------------- shared query builder

type Filters = { q?: string; level?: string; project?: string; page?: number; instance?: string | null }

function buildWhere(
  f: Filters,
  cols: { level: string; project: string; search: string[]; instance?: string },
): { where: string; params: unknown[] } {
  const clauses: string[] = []
  const params: unknown[] = []
  if (f.level) {
    clauses.push(`${cols.level} = ?`)
    params.push(f.level)
  }
  if (f.project) {
    clauses.push(`${cols.project} = ?`)
    params.push(f.project)
  }
  if (f.instance && cols.instance) {
    clauses.push(`${cols.instance} = ?`)
    params.push(f.instance)
  }
  if (f.q) {
    // Case-insensitive for any language (ulower, see db.ts); % and _ typed by the user match literally.
    const needle = `%${f.q.toLowerCase().replace(/[\\%_]/g, (c) => `\\${c}`)}%`
    clauses.push('(' + cols.search.map((c) => `ulower(${c}) LIKE ? ESCAPE '\\'`).join(' OR ') + ')')
    for (let i = 0; i < cols.search.length; i++) params.push(needle)
  }
  return { where: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', params }
}

function paged<T>(table: string, orderBy: string, f: Filters, cols: Parameters<typeof buildWhere>[1]): Page<T> {
  const page = Math.max(1, f.page ?? 1)
  const { where, params } = buildWhere(f, cols)
  const total = (db.prepare(`SELECT COUNT(*) n FROM ${table} ${where}`).get(...params) as { n: number }).n
  const rows = db
    .prepare(`SELECT * FROM ${table} ${where} ORDER BY ${orderBy} LIMIT ? OFFSET ?`)
    .all(...params, PAGE_SIZE, (page - 1) * PAGE_SIZE) as T[]
  return { rows, total, page, pageSize: PAGE_SIZE }
}

export function listActivity(f: Filters): Page<ActivityRow> {
  return paged('activity', 'created_at DESC, id DESC', f, {
    level: 'level',
    project: 'project',
    search: ['message', 'action', 'project', 'level'],
  })
}

export function listEvents(f: Filters): Page<EventRow> {
  return paged('events', 'received_at DESC, id DESC', f, {
    level: 'level',
    project: 'project',
    search: ['message', 'workflow', 'data', 'project', 'level'],
  })
}

export function listExecutions(f: Filters): Page<ExecutionRow> {
  return paged('executions', 'started_at DESC', f, {
    level: 'status',
    project: 'project',
    search: ['workflow_name', 'error_message', 'error_node', 'id', 'captured', 'project', 'status', 'mode'],
    instance: 'instance_id',
  })
}

// ---------------------------------------------------------------- events

export function insertEvent(e: {
  level: Level
  message: string
  project?: string | null
  workflow?: string | null
  data?: unknown
  sourceIp?: string | null
}): number {
  const info = db
    .prepare(
      `INSERT INTO events (level, project, workflow, message, data, source_ip) VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(
      e.level,
      e.project ?? null,
      e.workflow ?? null,
      e.message,
      e.data === undefined ? null : JSON.stringify(e.data),
      e.sourceIp ?? null,
    )
  return Number(info.lastInsertRowid)
}

// ---------------------------------------------------------------- retention

export function pruneOlderThan(days: number): { activity: number; events: number; executions: number } {
  const cutoff = new Date(Date.now() - days * 86_400_000).toISOString()
  return {
    activity: db.prepare(`DELETE FROM activity WHERE created_at < ?`).run(cutoff).changes,
    events: db.prepare(`DELETE FROM events WHERE received_at < ?`).run(cutoff).changes,
    executions: pruneExecutions(cutoff),
  }
}

/** Global retention, except workflows with their own retention (Workflows → ⚙), which use theirs. */
function pruneExecutions(globalCutoff: string): number {
  let n = db
    .prepare(
      `DELETE FROM executions WHERE started_at < ? AND NOT EXISTS (SELECT 1 FROM workflow_prefs wp
         WHERE wp.instance_id = executions.instance_id AND wp.workflow_id = executions.workflow_id AND wp.retention_days IS NOT NULL)`,
    )
    .run(globalCutoff).changes
  const own = db.prepare('SELECT instance_id, workflow_id, retention_days FROM workflow_prefs WHERE retention_days IS NOT NULL').all() as {
    instance_id: string
    workflow_id: string
    retention_days: number
  }[]
  const del = db.prepare('DELETE FROM executions WHERE instance_id = ? AND workflow_id = ? AND started_at < ?')
  for (const p of own) n += del.run(p.instance_id, p.workflow_id, new Date(Date.now() - p.retention_days * 86_400_000).toISOString()).changes
  return n
}

// ---------------------------------------------------------------- dashboard stats

export type DayBucket = { day: string; success: number; error: number; other: number }

/** `instance` null = all instances. */
export function executionsPerDay(days: number, instance: string | null = null): DayBucket[] {
  const since = new Date(Date.now() - (days - 1) * 86_400_000)
  since.setUTCHours(0, 0, 0, 0)
  const rows = db
    .prepare(
      `SELECT substr(started_at, 1, 10) day,
              SUM(status = 'success') success,
              SUM(status IN ('error','crashed')) error,
              SUM(status NOT IN ('success','error','crashed')) other
       FROM executions e WHERE started_at >= ? AND (? IS NULL OR instance_id = ?) AND ${NOT_EXCLUDED_SQL} GROUP BY day`,
    )
    .all(since.toISOString(), instance, instance) as DayBucket[]
  const byDay = new Map(rows.map((r) => [r.day, r]))
  const out: DayBucket[] = []
  for (let i = 0; i < days; i++) {
    const d = new Date(since.getTime() + i * 86_400_000).toISOString().slice(0, 10)
    out.push(byDay.get(d) ?? { day: d, success: 0, error: 0, other: 0 })
  }
  return out
}

export function overviewCounts(instance: string | null = null) {
  const dayAgo = new Date(Date.now() - 86_400_000).toISOString()
  const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString()
  const one = <T>(sql: string, ...p: unknown[]) => db.prepare(sql).get(...p) as T
  const exec24 = one<{ total: number; errors: number }>(
    `SELECT COUNT(*) total, COALESCE(SUM(status IN ('error','crashed')),0) errors FROM executions e WHERE started_at >= ? AND (? IS NULL OR instance_id = ?) AND ${NOT_EXCLUDED_SQL}`,
    dayAgo,
    instance,
    instance,
  )
  const exec7 = one<{ total: number; ok: number }>(
    `SELECT COUNT(*) total, COALESCE(SUM(status = 'success'),0) ok FROM executions e WHERE started_at >= ? AND (? IS NULL OR instance_id = ?) AND ${NOT_EXCLUDED_SQL}`,
    weekAgo,
    instance,
    instance,
  )
  const events24 = one<{ n: number }>(`SELECT COUNT(*) n FROM events WHERE received_at >= ?`, dayAgo).n
  return {
    executions24h: exec24.total,
    errors24h: exec24.errors,
    successRate7d: exec7.total ? exec7.ok / exec7.total : null,
    events24h: events24,
  }
}

export function recentErrors(limit = 5, instance: string | null = null): ExecutionRow[] {
  return db
    .prepare(`SELECT * FROM executions e WHERE status IN ('error','crashed') AND (? IS NULL OR instance_id = ?) AND ${NOT_EXCLUDED_OR_SNOOZED_SQL} ORDER BY started_at DESC LIMIT ?`)
    .all(instance, instance, limit) as ExecutionRow[]
}

export function recentEvents(limit = 6): EventRow[] {
  return db.prepare(`SELECT * FROM events ORDER BY received_at DESC, id DESC LIMIT ?`).all(limit) as EventRow[]
}

export function recentActivity(limit = 6): ActivityRow[] {
  return db.prepare(`SELECT * FROM activity ORDER BY created_at DESC, id DESC LIMIT ?`).all(limit) as ActivityRow[]
}

export function knownProjectsInLogs(): string[] {
  return (
    db
      .prepare(
        `SELECT project FROM events WHERE project IS NOT NULL
         UNION SELECT project FROM executions WHERE project IS NOT NULL
         UNION SELECT project FROM activity WHERE project IS NOT NULL
         ORDER BY 1`,
      )
      .all() as { project: string }[]
  ).map((r) => r.project)
}
