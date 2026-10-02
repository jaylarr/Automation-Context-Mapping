import { workflowKey } from './workflow-bindings'
import { startJob, finishJob } from './jobs'
import { db } from './db'
import { type Instance, apiKeyFor, connectedInstances, getInstance, assertInstanceAccess, registerInstanceRequest, InstancePausedError } from './instances'
import { logActivity, pruneOlderThan } from './logs'
import { getSettings, getMeta, setMeta } from './settings'
import { prefsKey, prefsMap, recordHealth, shouldLog } from './workflow-prefs'
import { MAX_CAPTURES, type RunData, extractCaptures } from './capture'
import { workflowProjects } from './projects'

/**
 * Client for the n8n public REST API (/api/v1), for any number of instances.
 * Pulls executions into the local SQLite database. The only writes to n8n are publish / unpublish
 * (setWorkflowPublished), which run solely from an explicit, confirmed click in the UI.
 */

type N8nExecution = {
  id: string | number
  workflowId: string | number
  status?: string
  finished?: boolean
  mode?: string
  startedAt?: string | null
  stoppedAt?: string | null
}

type N8nWorkflow = { id: string; name: string; tags?: { name: string }[] }

type Paged<T> = { data: T[]; nextCursor?: string | null }

/** True when at least one instance has a key and access is not paused. */
export function isConfigured(): boolean {
  return connectedInstances().length > 0
}

export async function api<T>(
  instance: Pick<Instance, 'id' | 'name' | 'baseUrl'> & Partial<Pick<Instance, 'uid' | 'accessRevision'>>,
  pathAndQuery: string,
  method: 'GET' | 'POST' | 'PUT' = 'GET',
  body?: unknown,
): Promise<T> {
  if (process.env.CONTROL_CENTER_OFFLINE === '1') throw new Error('Remote requests are disabled in this validation process.')
  const snapshot = assertInstanceAccess(instance)
  const key = apiKeyFor(instance.id)
  if (!key) throw new Error(`No API key saved for "${instance.name}". Add it in Settings.`)
  const controller = new AbortController()
  const release = registerInstanceRequest(instance.id, controller)
  try {
    const res = await fetch(`${instance.baseUrl}/api/v1${pathAndQuery}`, {
      method,
      headers: { 'X-N8N-API-KEY': key, accept: 'application/json', ...(method !== 'GET' ? { 'content-type': 'application/json' } : {}) },
      body: method === 'GET' ? undefined : JSON.stringify(body ?? {}),
      cache: 'no-store',
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      assertInstanceAccess(snapshot)
      throw new Error(`n8n API ${res.status} ${res.statusText}${body ? `: ${body.slice(0, 200)}` : ''}`)
    }
    const result = (await res.json()) as T
    assertInstanceAccess(snapshot)
    return result
  } catch (e) {
    assertInstanceAccess(snapshot)
    throw e
  } finally { release() }
}

/**
 * Maps a workflow to a project slug: the project whose workflows/ folder holds its JSON (same rule
 * as the Workflows page), else the "[project-slug] Name" prefix, else a tag matching a slug.
 */
function projectFor(wf: N8nWorkflow | undefined, knownSlugs: Set<string>, tracked: Map<string, string>, installation: string): string | null {
  if (!wf) return null
  const saved = tracked.get(workflowKey(installation, String(wf.id)))
  if (saved) return saved
  const prefix = wf.name.match(/^\[([a-z0-9-]+)\]/)?.[1]
  if (prefix) return prefix
  const tag = wf.tags?.map((t) => t.name).find((t) => knownSlugs.has(t))
  return tag ?? null
}

export async function testConnection(instanceId: string): Promise<{ ok: true; workflows: number } | { ok: false; error: string }> {
  const inst = getInstance(instanceId)
  if (!inst) return { ok: false, error: 'Unknown instance.' }
  try {
    const r = await api<Paged<unknown>>(inst, '/workflows?limit=250')
    assertInstanceAccess(inst)
    return { ok: true, workflows: r.data.length }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

/** The `message` from an n8n API error ("n8n API 400 Bad Request: {"message":"…"}"), else the whole text. */
function n8nMessage(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e)
  const body = msg.match(/^n8n API \d+[^:]*: (.*)$/s)?.[1]
  try {
    const m = body ? (JSON.parse(body) as { message?: string }).message : undefined
    if (m) return m
  } catch {
    /* body not JSON (or cut off) */
  }
  return msg
}

/**
 * Publishes or unpublishes (n8n v1: activates / deactivates) a workflow. Unpublishing stops its
 * triggers; nothing is deleted. Needs the workflow:activate / workflow:deactivate API key scopes.
 * Runs only from an explicit, confirmed click in the UI.
 */
export async function setWorkflowPublished(instanceId: string, workflowId: string, publish: boolean): Promise<{ name: string }> {
  const inst = getInstance(instanceId)
  if (!inst) throw new Error('Unknown instance.')
  const base = `/workflows/${encodeURIComponent(workflowId)}`
  const call = (op: string) => api<{ name?: string }>(inst, `${base}/${op}`, 'POST')
  try {
    let w: { name?: string }
    try {
      w = await call(publish ? 'publish' : 'unpublish')
    } catch (e) {
      // n8n v1 only has the older names for the same actions.
      if (!(e instanceof Error && /n8n API 404/.test(e.message))) throw e
      w = await call(publish ? 'activate' : 'deactivate')
    }
    assertInstanceAccess(inst)
    return { name: w.name ?? workflowId }
  } catch (e) {
    const raw = e instanceof Error ? e.message : String(e)
    if (e instanceof InstancePausedError) throw e
    if (/n8n API 403/.test(raw))
      throw new Error(`The API key for "${inst.name}" isn't allowed to ${publish ? 'publish (needs workflow:activate)' : 'unpublish (needs workflow:deactivate)'}.`)
    if (/n8n API 404/.test(raw)) throw new Error('n8n says this workflow no longer exists.')
    throw new Error(`n8n refused: ${n8nMessage(e)}`)
  } finally {
    invalidateWorkflowList(instanceId) // the published flag changed (or may have): don't serve the cached list
  }
}

// ---------------------------------------------------------------- workflow list cache

/**
 * The full workflow list is large (all nodes: ~4 MB / 2 s for ~100 workflows), so it's cached in
 * memory per instance, stale-while-revalidate: callers get the cached list instantly, and a copy
 * older than REVALIDATE_MS is refreshed in the background for the next request.
 */
const REVALIDATE_MS = 30_000
type CacheEntry = { baseUrl?: string; at: number; data: unknown[]; inflight?: Promise<unknown[]> }
const g = globalThis as unknown as { __ccWorkflowCache?: Map<string, CacheEntry> }
const workflowCache = (g.__ccWorkflowCache ??= new Map())

async function fetchWorkflowList(inst: Instance): Promise<unknown[]> {
  const all: unknown[] = []
  let cursor: string | undefined
  do {
    const r: Paged<unknown> = await api<Paged<unknown>>(
      inst,
      `/workflows?limit=250&excludePinnedData=true${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
    )
    all.push(...r.data)
    cursor = r.nextCursor ?? undefined
  } while (cursor)
  return all
}

function refreshWorkflowList(inst: Instance): Promise<unknown[]> {
  const entry = workflowCache.get(inst.id)
  if (entry?.inflight) return entry.inflight
  const p = fetchWorkflowList(inst)
    .then((data) => {
      assertInstanceAccess(inst)
      workflowCache.set(inst.id, { baseUrl: inst.baseUrl, at: Date.now(), data })
      return data
    })
    .catch((e) => {
      const cur = workflowCache.get(inst.id)
      if (cur?.inflight === p) delete cur.inflight
      throw e
    })
  workflowCache.set(inst.id, { at: entry?.at ?? -1, data: entry?.data ?? [], inflight: p }) // at -1: nothing cached yet
  return p
}

/** All workflows of an instance. `fresh` waits for a new fetch; otherwise a cached copy is served. */
export async function listWorkflows<T>(inst: Instance, opts: { fresh?: boolean } = {}): Promise<{ data: T[]; fetchedAt: number }> {
  assertInstanceAccess(inst)
  const entry = workflowCache.get(inst.id)
  const hasData = entry && entry.at > 0 && entry.baseUrl === inst.baseUrl
  if (opts.fresh || !hasData) {
    const data = await refreshWorkflowList(inst)
    assertInstanceAccess(inst)
    return { data: data as T[], fetchedAt: workflowCache.get(inst.id)?.at ?? Date.now() }
  }
  if (Date.now() - entry.at > REVALIDATE_MS) refreshWorkflowList(inst).catch(() => {}) // background; errors surface on the next fresh load
  return { data: entry.data as T[], fetchedAt: entry.at }
}

export function invalidateWorkflowList(instanceId?: string): void {
  if (instanceId) workflowCache.delete(instanceId)
  else workflowCache.clear()
}

export type SyncResult = { instance: string; fetched: number; inserted: number; updated: number; errorsDetailed: number; captured: number; historyPending: boolean }

const running = new Map<string, Promise<SyncResult>>()

/** Sync recent executions from one instance (or every connected one). Concurrent calls share a run. */
export async function syncExecutions(
  trigger: 'manual' | 'auto',
  knownSlugs: string[] = [],
  instanceId?: string,
): Promise<SyncResult[]> {
  if (instanceId) assertInstanceAccess({ id: instanceId })
  const targets = instanceId ? connectedInstances().filter((i) => i.id === instanceId) : connectedInstances()
  const slugs = new Set(knownSlugs)
  const results = await Promise.allSettled(
    targets.map((inst) => {
      let p = running.get(inst.id)
      if (!p) {
        p = syncOne(inst, trigger, slugs).finally(() => running.delete(inst.id))
        running.set(inst.id, p)
      }
      return p
    }),
  )
  pruneOlderThan(getSettings().retentionDays)
  const failed = results.filter((r) => r.status === 'rejected' && !(r.reason instanceof InstancePausedError)) as PromiseRejectedResult[]
  if (results.some(r => r.status === 'fulfilled') || failed.length) {
    setMeta('lastSyncAt', new Date().toISOString())
    setMeta('lastSyncStatus', failed.length ? `error: ${failed.length} of ${targets.length} instance(s) failed` : 'ok')
  }
  const canceled = results.find(r => r.status === 'rejected' && r.reason instanceof InstancePausedError)
  if (instanceId && canceled?.status === 'rejected') throw canceled.reason
  if (failed.length && failed.length === results.length) throw failed[0].reason
  return results.filter((r) => r.status === 'fulfilled').map((r) => (r as PromiseFulfilledResult<SyncResult>).value)
}

async function syncOne(inst: Instance, trigger: 'manual' | 'auto', knownSlugs: Set<string>): Promise<SyncResult> {
  assertInstanceAccess(inst)
  const operation = startJob(`sync:${inst.id}`)
  const started = Date.now()
  const settings = getSettings()
  try {
    // 1. workflow id -> workflow (for names + project mapping). Fresh fetch, which also warms the
    //    Workflows page cache.
    const workflows = new Map<string, N8nWorkflow>()
    for (const w of (await listWorkflows<N8nWorkflow>(inst, { fresh: true })).data) workflows.set(String(w.id), w)
    const tracked = workflowProjects()
    let cursor: string | undefined

    // 2. recent executions, newest first
    const execs: N8nExecution[] = []
    cursor = getMeta(`syncCursor:${inst.id}`) || undefined
    const continuing = Boolean(cursor)
    const boundary = getMeta(`syncBoundary:${inst.id}`)
    let reachedBoundary = false
    // A saved cursor walks older history. Always check the newest page as well so
    // a long backfill cannot starve new executions. Keep the original cycle head:
    // after backfill finishes, the next cycle fills any intervening pages too.
    if (continuing) {
      const latest = await api<Paged<N8nExecution>>(inst, '/executions?limit=100&includeData=false')
      execs.push(...latest.data)
    }
    const seen = new Set(execs.map((e) => String(e.id)))
    for (let page = 0; page < settings.syncLookbackPages; page++) {
      const r: Paged<N8nExecution> = await api<Paged<N8nExecution>>(
        inst,
        `/executions?limit=100&includeData=false${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
      )
      for (const e of r.data) {
        if (!seen.has(String(e.id))) { execs.push(e); seen.add(String(e.id)) }
      }
      cursor = r.nextCursor ?? undefined
      reachedBoundary = Boolean(boundary && r.data.some((e) => String(e.id) === boundary))
      if (!cursor || reachedBoundary) { cursor = undefined; break }
    }

    assertInstanceAccess(inst)
    if (boundary && !cursor && !reachedBoundary) setMeta(`syncGap:${inst.id}`, 'Previous checkpoint was not returned by n8n; historical coverage is incomplete.')

    // Reconcile unfinished runs even when they are outside the current page window.
    const pending = db.prepare("SELECT id, workflow_id FROM execution_facts e WHERE instance_id = ? AND status IN ('running','waiting','new','unknown') AND NOT EXISTS (SELECT 1 FROM workflow_prefs p WHERE p.instance_id=e.instance_id AND p.workflow_id=e.workflow_id AND p.log_mode='off') ORDER BY observed_at LIMIT 25").all(inst.id) as { id: string; workflow_id: string }[]
    for (const row of pending) {
      if (execs.some((e) => String(e.id) === row.id)) continue
      try { execs.push(await api<N8nExecution>(inst, `/executions/${encodeURIComponent(row.id)}?includeData=false`)) }
      catch (e) {
        assertInstanceAccess(inst)
        if (!(e instanceof Error && /n8n API 404/.test(e.message))) throw e
        if (prefsMap(inst.id).get(prefsKey(inst.id, row.workflow_id))?.logMode === 'off') continue
        db.prepare("UPDATE execution_facts SET status = 'unavailable' WHERE instance_id = ? AND id = ?").run(inst.id, row.id)
      }
    }
    assertInstanceAccess(inst)
    // Re-read after network requests: settings may have changed while the sync was in flight.
    const prefs = prefsMap(inst.id)
    const recorded = execs.filter(e => prefs.get(prefsKey(inst.id, String(e.workflowId)))?.logMode !== 'off')
    const fact = db.prepare(`INSERT INTO execution_facts(instance_id,id,workflow_id,status,mode,started_at,stopped_at)
      VALUES(?,?,?,?,?,?,?) ON CONFLICT(instance_id,id) DO UPDATE SET status=excluded.status,
      mode=excluded.mode, started_at=COALESCE(excluded.started_at,started_at), stopped_at=excluded.stopped_at,
      observed_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')`)
    db.transaction(() => {
      for (const e of recorded) {
        const carry = db.prepare('SELECT through_at FROM health_carry WHERE instance_id=? AND workflow_id=?').get(inst.id,String(e.workflowId)) as {through_at:string} | undefined
        if (e.startedAt && carry && e.startedAt <= carry.through_at) {
          const old = db.prepare('SELECT status FROM execution_facts WHERE instance_id=? AND id=?').get(inst.id,String(e.id)) as {status:string} | undefined
          if (!old) continue // replay of compacted history, not a new failure
          if (old.status !== e.status) {
            db.prepare('UPDATE health_carry SET fail_streak=0 WHERE instance_id=? AND workflow_id=?').run(inst.id,String(e.workflowId))
            setMeta(`syncGap:${inst.id}`, 'A late historical outcome crossed the retention checkpoint; older health history is indeterminate.')
          }
        }
        fact.run(inst.id, String(e.id), String(e.workflowId), e.status ?? 'unknown', e.mode ?? null, e.startedAt ?? null, e.stoppedAt ?? null)
      }
    })()

    // 3. Update health only for recorded workflows, then apply detailed-log filters.
    const byWorkflow = new Map<string, { name: string | null; runs: { status: string; mode: string | null; startedAt: string | null }[] }>()
    for (const e of [...recorded].sort((a, b) => (b.startedAt ?? '').localeCompare(a.startedAt ?? ''))) {
      const wid = String(e.workflowId)
      const entry = byWorkflow.get(wid) ?? { name: workflows.get(wid)?.name ?? null, runs: [] }
      entry.runs.push({ status: e.status ?? 'unknown', mode: e.mode ?? null, startedAt: e.startedAt ?? null })
      byWorkflow.set(wid, entry)
    }
    recordHealth(inst.id, byWorkflow, prefs)
    const toStore = execs.filter((e) =>
      shouldLog(prefs.get(prefsKey(inst.id, String(e.workflowId))), e.status ?? 'unknown', e.mode),
    )

    // 4. upsert
    const existing = db.prepare('SELECT status, error_message FROM executions WHERE instance_id = ? AND id = ?')
    const upsert = db.prepare(`
      INSERT INTO executions (instance_id, id, workflow_id, workflow_name, project, status, mode, started_at, stopped_at, duration_ms, synced_at, first_seen_at)
      VALUES (@instance_id, @id, @workflow_id, @workflow_name, @project, @status, @mode, @started_at, @stopped_at, @duration_ms, strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now'))
      ON CONFLICT(instance_id, id) DO UPDATE SET
        workflow_name = excluded.workflow_name, project = excluded.project, status = excluded.status,
        stopped_at = excluded.stopped_at, duration_ms = excluded.duration_ms, synced_at = excluded.synced_at`)
    let inserted = 0
    let updated = 0
    const needDetail: string[] = []
    db.transaction(() => {
      for (const e of toStore) {
        const id = String(e.id)
        const wf = workflows.get(String(e.workflowId))
        const status = e.status ?? 'unknown'
        const start = e.startedAt ? Date.parse(e.startedAt) : NaN
        const stop = e.stoppedAt ? Date.parse(e.stoppedAt) : NaN
        const prev = existing.get(inst.id, id) as { status: string; error_message: string | null } | undefined
        upsert.run({
          instance_id: inst.id,
          id,
          workflow_id: String(e.workflowId),
          workflow_name: wf?.name ?? null,
          project: projectFor(wf, knownSlugs, tracked, inst.uid),
          status,
          mode: e.mode ?? null,
          started_at: e.startedAt ?? null,
          stopped_at: e.stoppedAt ?? null,
          duration_ms: Number.isFinite(start) && Number.isFinite(stop) ? stop - start : null,
        })
        if (prev) updated++
        else inserted++
        if ((status === 'error' || status === 'crashed') && !prev?.error_message) needDetail.push(id)
      }
      // Older stored runs keep the project they were synced with; re-map them when a workflow is
      // saved into a project (or renamed/retagged) later, so the project filter finds every run.
      const remap = db.prepare('UPDATE executions SET project = ? WHERE instance_id = ? AND workflow_id = ? AND project IS NOT ?')
      for (const [wid, wf] of workflows) {
        if (prefs.get(prefsKey(inst.id, wid))?.logMode === 'off') continue
        const project = projectFor(wf, knownSlugs, tracked, inst.uid)
        remap.run(project, inst.id, wid, project)
      }
    })()

    // 5. read full execution data (read-only) for: error details of new failures, and captured fields
    //    of workflows that have them (newest first, including older logged runs after a capture is added).
    //    Both are capped per sync: execution data can be large (e.g. base64 audio).
    const captureSpecs = new Map([...prefs.values()].filter((p) => p.logMode !== 'off' && p.captures.length).map((p) => [p.workflowId, p.captures.slice(0, MAX_CAPTURES)]))
    const needCapture = captureSpecs.size
      ? (db
          .prepare(
            `SELECT id, workflow_id FROM executions WHERE instance_id = ? AND captured_at IS NULL
               AND status NOT IN ('running','waiting','new')
               AND workflow_id IN (${[...captureSpecs.keys()].map(() => '?').join(',')})
             ORDER BY started_at DESC LIMIT 25`,
          )
          .all(inst.id, ...captureSpecs.keys()) as { id: string; workflow_id: string }[])
      : []
    const captureFor = new Map(needCapture.map((r) => [r.id, r.workflow_id]))
    const noValues = (wid: string, note: string) => (captureSpecs.get(wid) ?? []).map((c) => ({ label: c.label, value: null, note }))
    const setErr = db.prepare('UPDATE executions SET error_message = ?, error_node = ? WHERE instance_id = ? AND id = ?')
    const setCaptured = db.prepare(
      `UPDATE executions SET captured = ?, captured_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE instance_id = ? AND id = ?`,
    )
    let errorsDetailed = 0
    let captured = 0
    const errIds = needDetail.slice(0, 25)
    const stillRecording = db.prepare("SELECT e.id FROM executions e WHERE e.instance_id=? AND e.id=? AND NOT EXISTS (SELECT 1 FROM workflow_prefs p WHERE p.instance_id=e.instance_id AND p.workflow_id=e.workflow_id AND p.log_mode='off')")
    for (const id of new Set([...errIds, ...captureFor.keys()])) {
      if (!stillRecording.get(inst.id, id)) continue
      try {
        const d = await api<{
          data?: {
            resultData?: { error?: { message?: string; node?: { name?: string } }; lastNodeExecuted?: string; runData?: RunData }
          }
        }>(inst, `/executions/${encodeURIComponent(id)}?includeData=true`)
        assertInstanceAccess(inst)
        if (!stillRecording.get(inst.id, id)) continue
        const rd = d.data?.resultData
        if (errIds.includes(id)) {
          setErr.run(rd?.error?.message?.slice(0, 1000) ?? 'Unknown error', rd?.error?.node?.name ?? rd?.lastNodeExecuted ?? null, inst.id, id)
          errorsDetailed++
        }
        const wid = captureFor.get(id)
        if (wid) {
          const values = rd?.runData ? extractCaptures(rd.runData, captureSpecs.get(wid) ?? []) : noValues(wid, 'no data saved in n8n')
          setCaptured.run(JSON.stringify(values), inst.id, id)
          captured++
        }
      } catch (e) {
        assertInstanceAccess(inst)
        // Best-effort: the execution row is already stored. A run n8n no longer has is marked so it isn't retried forever.
        const wid = captureFor.get(id)
        if (wid && stillRecording.get(inst.id, id) && e instanceof Error && /n8n API 404/.test(e.message)) setCaptured.run(JSON.stringify(noValues(wid, 'run no longer in n8n')), inst.id, id)
      }
    }

    const result = { instance: inst.id, fetched: execs.length, inserted, updated, errorsDetailed, captured, historyPending: Boolean(cursor) }
    assertInstanceAccess(inst)
    setMeta(`syncCursor:${inst.id}`, cursor ?? '')
    if (!continuing && execs.length) setMeta(`syncHead:${inst.id}`, String(execs[0].id))
    if (!cursor) setMeta(`syncBoundary:${inst.id}`, getMeta(`syncHead:${inst.id}`) || boundary || '')
    setMeta(`lastSyncAt:${inst.id}`, new Date().toISOString())
    setMeta(`lastSyncStatus:${inst.id}`, cursor ? 'backfill pending; history incomplete' : getMeta(`syncGap:${inst.id}`) || 'ok')
    // Auto-syncs only log when something changed, so the activity log stays readable.
    if (trigger === 'manual' || inserted > 0) {
      logActivity({
        level: 'success',
        action: 'n8n.sync',
        message: `${inst.name}: synced ${execs.length} executions (${inserted} new) in ${Date.now() - started} ms${cursor ? '; newest page checked, older history still syncing' : ''}`,
        meta: { ...result, trigger },
      })
    }
    finishJob(`sync:${inst.id}`, operation, 'ok', `${execs.length} executions inspected; ${inserted} inserted, ${updated} updated.`)
    return result
  } catch (e) {
    if (e instanceof InstancePausedError) {
      finishJob(`sync:${inst.id}`, operation, 'canceled', 'Stopped because instance access was paused.')
      throw e
    }
    const message = e instanceof Error ? e.message : String(e)
    if (!getInstance(inst.id) || getInstance(inst.id)?.baseUrl !== inst.baseUrl) throw e
    finishJob(`sync:${inst.id}`, operation, 'failed', message)
    if (/n8n API 400/.test(message) && getMeta(`syncCursor:${inst.id}`)) setMeta(`syncCursor:${inst.id}`, '')
    setMeta(`lastSyncStatus:${inst.id}`, `error: ${message}`)
    logActivity({ level: 'error', action: 'n8n.sync', message: `${inst.name}: sync failed: ${message}`, meta: { trigger, instance: inst.id } })
    throw e
  }
}
