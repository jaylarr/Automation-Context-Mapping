import { db } from './db'
import { ALL_STATISTICS_SQL, NOT_EXCLUDED_OR_SNOOZED_SQL, NOT_EXCLUDED_SQL } from './workflow-prefs'
import { searchTerms } from './search'

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

type Filters = { q?: string; level?: string; project?: string; page?: number; instance?: string | null; day?: string; focus?: string }

function buildWhere(
  f: Filters,
  cols: { level: string; project: string; search: string[]; instance?: string },
): { where: string; params: unknown[] } {
  const clauses: string[] = []
  const params: unknown[] = []
  if (f.level) {
    if (cols.level === 'status' && f.level === 'failed') clauses.push("status IN ('error','crashed')")
    else { clauses.push(`${cols.level} = ?`); params.push(f.level) }
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
    // Every typed word must match some column; case and separators are ignored (unorm, see db.ts and
    // lib/search.ts), so "test project" finds "test-project". % and _ typed by the user match literally.
    for (const term of searchTerms(f.q)) {
      const needle = `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`
      clauses.push('(' + cols.search.map((c) => `unorm(${c}) LIKE ? ESCAPE '\\'`).join(' OR ') + ')')
      for (let i = 0; i < cols.search.length; i++) params.push(needle)
    }
  }
  if (cols.instance && f.day && /^\d{4}-\d{2}-\d{2}$/.test(f.day)) {
    clauses.push('substr(started_at, 1, 10) = ?')
    params.push(f.day)
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
  const cols = {
    level: 'status',
    project: 'project',
    search: ['workflow_name', 'error_message', 'error_node', 'id', 'captured', 'project', 'status', 'mode'],
    instance: 'instance_id',
  }
  const order = 'started_at DESC, id DESC, instance_id ASC'
  let page = f.page
  // Resolve the exact row's page inside the active filters, including its installation.
  if (f.focus && f.instance) {
    const { where, params } = buildWhere(f, cols)
    const target = db.prepare(`SELECT position FROM (SELECT id, instance_id, ROW_NUMBER() OVER (ORDER BY ${order}) position FROM executions ${where}) WHERE id = ? AND instance_id = ?`).get(...params, f.focus, f.instance) as { position: number } | undefined
    if (target) page = Math.ceil(target.position / PAGE_SIZE)
  }
  return paged('executions', order, { ...f, page }, cols)
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
  compactExecutionFacts(days)
  return {
    activity: db.prepare(`DELETE FROM activity WHERE created_at < ?`).run(cutoff).changes,
    events: db.prepare(`DELETE FROM events WHERE received_at < ?`).run(cutoff).changes,
    executions: pruneExecutions(cutoff),
  }
}

/** Keep at least seven days for dashboard metrics; compact older outcomes into a small health checkpoint. */
function compactExecutionFacts(days: number): void {
  const workflows = db.prepare('SELECT DISTINCT instance_id, workflow_id FROM execution_facts').all() as { instance_id: string; workflow_id: string }[]
  db.transaction(() => {
    for (const w of workflows) {
      const p = db.prepare('SELECT retention_days, ignore_manual FROM workflow_prefs WHERE instance_id=? AND workflow_id=?').get(w.instance_id,w.workflow_id) as { retention_days: number | null; ignore_manual: number } | undefined
      const cutoff = new Date(Date.now() - Math.max(7,p?.retention_days ?? days) * 86400000).toISOString()
      const rows = db.prepare(`SELECT id,CASE WHEN started_at IS NULL THEN 'unknown' ELSE status END status,mode,COALESCE(started_at,first_seen_at,observed_at) at FROM execution_facts
        WHERE instance_id=? AND workflow_id=? AND COALESCE(started_at,first_seen_at,observed_at) < ?
        AND status NOT IN ('running','waiting','new','unknown') ORDER BY at,id`).all(w.instance_id,w.workflow_id,cutoff) as {id:string;status:string;mode:string|null;at:string}[]
      if (!rows.length) continue
      const prev = db.prepare('SELECT * FROM health_carry WHERE instance_id=? AND workflow_id=?').get(w.instance_id,w.workflow_id) as { through_at:string; fail_streak:number; ignore_manual:number; last_success_at:string|null } | undefined
      let lastSuccess = prev?.last_success_at ?? null
      let streak = prev?.ignore_manual === (p?.ignore_manual ?? 0) ? prev.fail_streak : 0
      for (const r of rows) {
        if (prev && r.at <= prev.through_at) continue
        if (p?.ignore_manual && r.mode === 'manual') continue
        if (r.status === 'success') lastSuccess = r.at
        streak = ['error','crashed'].includes(r.status) ? streak + 1 : 0
      }
      const through = [prev?.through_at ?? '', rows[rows.length-1].at].sort().at(-1)!
      db.prepare(`INSERT INTO health_carry VALUES(?,?,?,?,?,?) ON CONFLICT(instance_id,workflow_id) DO UPDATE SET
        through_at=excluded.through_at,fail_streak=excluded.fail_streak,ignore_manual=excluded.ignore_manual,last_success_at=excluded.last_success_at`).run(w.instance_id,w.workflow_id,through,streak,p?.ignore_manual ?? 0,lastSuccess)
      const remove = db.prepare('DELETE FROM execution_facts WHERE instance_id=? AND id=?')
      for (const r of rows) remove.run(w.instance_id,r.id)
    }
  })()
}

/** Global retention, except workflows with their own retention (Workflows → ⚙), which use theirs. */
function pruneExecutions(globalCutoff: string): number {
  let n = db
    .prepare(
      `DELETE FROM executions WHERE COALESCE(started_at, first_seen_at, synced_at) < ? AND NOT EXISTS (SELECT 1 FROM workflow_prefs wp
         WHERE wp.instance_id = executions.instance_id AND wp.workflow_id = executions.workflow_id AND wp.retention_days IS NOT NULL)`,
    )
    .run(globalCutoff).changes
  const own = db.prepare('SELECT instance_id, workflow_id, retention_days FROM workflow_prefs WHERE retention_days IS NOT NULL').all() as {
    instance_id: string
    workflow_id: string
    retention_days: number
  }[]
  const del = db.prepare('DELETE FROM executions WHERE instance_id = ? AND workflow_id = ? AND COALESCE(started_at, first_seen_at, synced_at) < ?')
  for (const p of own) n += del.run(p.instance_id, p.workflow_id, new Date(Date.now() - p.retention_days * 86_400_000).toISOString()).changes
  return n
}

// ---------------------------------------------------------------- dashboard stats

export type DayBucket = { day: string; success: number; error: number; other: number }

/** `instance` null = all instances. */
export function executionsPerDay(days: number, instance: string | null = null, includeAll = false): DayBucket[] {
  const statsWhere = includeAll ? ALL_STATISTICS_SQL : NOT_EXCLUDED_SQL
  const since = new Date(Date.now() - (days - 1) * 86_400_000)
  since.setUTCHours(0, 0, 0, 0)
  const rows = db
    .prepare(
      `SELECT substr(started_at, 1, 10) day,
              SUM(status = 'success') success,
              SUM(status IN ('error','crashed')) error,
              SUM(status NOT IN ('success','error','crashed')) other
       FROM execution_facts e WHERE started_at >= ? AND (? IS NULL OR instance_id = ?) AND ${statsWhere} GROUP BY day`,
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

export function overviewCounts(instance: string | null = null, includeAll = false) {
  const statsWhere = includeAll ? ALL_STATISTICS_SQL : NOT_EXCLUDED_SQL
  const dayAgo = new Date(Date.now() - 86_400_000).toISOString()
  const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString()
  const one = <T>(sql: string, ...p: unknown[]) => db.prepare(sql).get(...p) as T
  const exec24 = one<{ total: number; errors: number }>(
    `SELECT COUNT(*) total, COALESCE(SUM(status IN ('error','crashed')),0) errors FROM execution_facts e WHERE started_at >= ? AND (? IS NULL OR instance_id = ?) AND ${statsWhere}`,
    dayAgo,
    instance,
    instance,
  )
  const exec7 = one<{ total: number; ok: number }>(
    `SELECT COALESCE(SUM(status IN ('success','error','crashed')),0) total, COALESCE(SUM(status = 'success'),0) ok FROM execution_facts e WHERE started_at >= ? AND (? IS NULL OR instance_id = ?) AND ${statsWhere}`,
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
