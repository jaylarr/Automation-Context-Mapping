import { db } from './db'
import { randomUUID } from 'node:crypto'
import { deleteEnvKeys, setEnvValues } from './envfile'
import { getMeta, setMeta } from './settings'

/**
 * n8n instances the app is connected to. Name and URL are stored in SQLite; each API key lives in
 * app/.env.local as N8N_API_KEY__<ID> (never in the database, never sent to the browser).
 */

export type Instance = {
  id: string
  uid: string
  name: string
  baseUrl: string
  hasKey: boolean
  paused: boolean
  accessRevision: number
  lastSyncAt: string | null
  lastSyncStatus: string | null
}

type Row = { id: string; uid: string; name: string; base_url: string; created_at: string; paused: number; access_revision: number }

const ID_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/

export const envKeyFor = (id: string) => `N8N_API_KEY__${id.toUpperCase().replace(/-/g, '_')}`
export const apiKeyFor = (id: string) => process.env[envKeyFor(id)] || ''
export const normalizeUrl = (url: string) => url.trim().replace(/\/+$/, '')

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 30)
      .replace(/-+$/, '') || 'n8n'
  )
}

function uniqueId(base: string): string {
  const taken = new Set((db.prepare('SELECT id FROM instances').all() as { id: string }[]).map((r) => r.id))
  let id = base
  for (let i = 2; taken.has(id) || id === 'all' || id === 'legacy'; i++) id = `${base}-${i}`
  return id
}

function friendlyName(url: string): string {
  try {
    const host = new URL(url).hostname
    if (host === 'localhost' || host === '127.0.0.1' || host === 'host.docker.internal') return 'Local (Docker)'
    if (host.includes('hstgr')) return 'Hostinger'
    return host
  } catch {
    return 'n8n'
  }
}

let migrated = false

/**
 * One-time move from the old single connection (N8N_BASE_URL / N8N_API_KEY) to the instance list.
 * Also adds "Local (Docker)" so the local n8n is one click (paste a key) away.
 */
function migrate(): void {
  if (migrated) return
  migrated = true
  const count = (db.prepare('SELECT COUNT(*) n FROM instances').get() as { n: number }).n
  if (count > 0 || getMeta('instancesInitialized') === 'yes') return

  const legacyUrl = normalizeUrl(process.env.N8N_BASE_URL || '')
  const legacyKey = process.env.N8N_API_KEY || ''
  let legacyId: string | null = null
  if (legacyUrl) {
    const name = friendlyName(legacyUrl)
    legacyId = uniqueId(name.startsWith('Local') ? 'local' : slugify(name))
    db.prepare('INSERT INTO instances (id, uid, name, base_url) VALUES (?, lower(hex(randomblob(16))), ?, ?)').run(legacyId, name, legacyUrl)
    if (legacyKey) setEnvValues({ [envKeyFor(legacyId)]: legacyKey })
  }
  const hasLocal = (db.prepare("SELECT COUNT(*) n FROM instances WHERE base_url LIKE '%localhost%' OR base_url LIKE '%127.0.0.1%'").get() as { n: number }).n
  if (!hasLocal) db.prepare('INSERT INTO instances (id, uid, name, base_url) VALUES (?, lower(hex(randomblob(16))), ?, ?)').run(uniqueId('local'), 'Local (Docker)', 'http://localhost:5678')

  setMeta('instancesInitialized', 'yes')

  // Old executions can't be attributed reliably (the single connection pointed at different n8ns over
  // time). Drop them; the next sync re-downloads each instance's history with the right label.
  db.prepare("DELETE FROM executions WHERE instance_id = 'legacy'").run()
  if (process.env.N8N_BASE_URL !== undefined || process.env.N8N_API_KEY !== undefined) deleteEnvKeys(['N8N_BASE_URL', 'N8N_API_KEY'])
}

function toInstance(r: Row): Instance {
  return {
    id: r.id,
    uid: r.uid,
    name: r.name,
    baseUrl: r.base_url,
    hasKey: Boolean(apiKeyFor(r.id)),
    paused: Boolean(r.paused),
    accessRevision: r.access_revision,
    lastSyncAt: getMeta(`lastSyncAt:${r.id}`),
    lastSyncStatus: getMeta(`lastSyncStatus:${r.id}`),
  }
}

export function listInstances(): Instance[] {
  migrate()
  return (db.prepare('SELECT * FROM instances ORDER BY created_at, id').all() as Row[]).map(toInstance)
}

/** Instances eligible for remote access (saved key and not paused). */
export function connectedInstances(): Instance[] {
  return listInstances().filter((i) => i.hasKey && !i.paused)
}

export class InstancePausedError extends Error {
  constructor() { super('Instance paused. Resume it in Settings.'); this.name = 'InstancePausedError' }
}

const state = globalThis as typeof globalThis & { __ccInstanceRequests?: Map<string, Set<AbortController>> }
const requests = state.__ccInstanceRequests ??= new Map<string, Set<AbortController>>()

export function assertInstanceAccess(instance: Pick<Instance, 'id'> & Partial<Pick<Instance, 'uid' | 'baseUrl' | 'accessRevision'>>): Instance {
  const current = getInstance(instance.id)
  if (!current) throw new Error(instance.uid !== undefined ? 'Instance removed during request.' : 'Unknown instance.')
  if (current.paused || (instance.accessRevision !== undefined && instance.accessRevision !== current.accessRevision)) throw new InstancePausedError()
  if ((instance.uid !== undefined && current.uid !== instance.uid) || (instance.baseUrl !== undefined && current.baseUrl !== instance.baseUrl)) throw new Error('Instance removed or changed during request.')
  return current
}

export function registerInstanceRequest(id: string, controller: AbortController): () => void {
  const pending = requests.get(id) ?? new Set<AbortController>()
  pending.add(controller); requests.set(id, pending)
  return () => { pending.delete(controller); if (!pending.size) requests.delete(id) }
}

export function setInstancePaused(id: string, paused: boolean): { instance: Instance; changed: boolean } {
  if (!ID_RE.test(id) || !getInstance(id)) throw new Error('Unknown instance.')
  if (typeof paused !== 'boolean') throw new Error('Invalid pause state.')
  const changed = db.prepare('UPDATE instances SET paused = ?, access_revision = access_revision + 1 WHERE id = ? AND paused != ?').run(paused ? 1 : 0, id, paused ? 1 : 0).changes > 0
  if (changed) {
    invalidateCache(id)
    for (const controller of requests.get(id) ?? []) controller.abort(new InstancePausedError())
  }
  return { instance: getInstance(id)!, changed }
}

export function getInstance(id: string): Instance | null {
  migrate()
  const r = db.prepare('SELECT * FROM instances WHERE id = ?').get(id) as Row | undefined
  return r ? toInstance(r) : null
}

function validate(name: string, baseUrl: string): string | null {
  if (!name.trim()) return 'Give the instance a name.'
  if (!/^https?:\/\/[^\s/]+/i.test(baseUrl)) return 'The URL must start with http:// or https://'
  return null
}

export function addInstance(input: { name: string; baseUrl: string; apiKey: string }): Instance {
  migrate()
  const name = input.name.trim().slice(0, 60)
  const baseUrl = normalizeUrl(input.baseUrl)
  const err = validate(name, baseUrl)
  if (err) throw new Error(err)
  const id = randomUUID()
  if (input.apiKey.trim()) setEnvValues({ [envKeyFor(id)]: input.apiKey.trim() })
  db.prepare('INSERT INTO instances (id, uid, name, base_url) VALUES (?, ?, ?, ?)').run(id, randomUUID(), name, baseUrl)
  return getInstance(id)!
}

export function updateInstance(id: string, input: { name: string; baseUrl: string; apiKey?: string }): Instance {
  if (!ID_RE.test(id) || !getInstance(id)) throw new Error('Unknown instance.')
  const name = input.name.trim().slice(0, 60)
  const baseUrl = normalizeUrl(input.baseUrl)
  const err = validate(name, baseUrl)
  if (err) throw new Error(err)
  if (input.apiKey?.trim()) setEnvValues({ [envKeyFor(id)]: input.apiKey.trim() })
  db.prepare('UPDATE instances SET name = ?, base_url = ? WHERE id = ?').run(name, baseUrl, id)
  invalidateCache(id)
  return getInstance(id)!
}

export function clearInstanceKey(id: string): void {
  if (!ID_RE.test(id) || !getInstance(id)) throw new Error('Unknown instance.')
  deleteEnvKeys([envKeyFor(id)])
  invalidateCache(id)
}

/** Removes the instance, its API key, and its synced execution history (nothing in n8n changes). */
export function removeInstance(id: string): { executionsRemoved: number } {
  if (!ID_RE.test(id) || !getInstance(id)) throw new Error('Unknown instance.')
  if (apiKeyFor(id) || process.env[envKeyFor(id)] !== undefined) deleteEnvKeys([envKeyFor(id)])
  const executionsRemoved = db.transaction(() => {
    setMeta('instancesInitialized', 'yes')
    const removed = db.prepare('DELETE FROM executions WHERE instance_id = ?').run(id).changes
    db.prepare('DELETE FROM workflow_prefs WHERE instance_id = ?').run(id)
    db.prepare('DELETE FROM execution_facts WHERE instance_id = ?').run(id)
    db.prepare('DELETE FROM health_carry WHERE instance_id = ?').run(id)
    db.prepare('DELETE FROM instances WHERE id = ?').run(id)
    for (const key of ['lastSyncAt','lastSyncStatus','syncCursor','syncBoundary','syncHead','syncGap']) db.prepare('DELETE FROM settings WHERE key = ?').run(`meta:${key}:${id}`)
    db.prepare('DELETE FROM settings WHERE key = ?').run(`meta:job:sync:${id}`)
    return removed
  })()
  invalidateCache(id)
  return { executionsRemoved }
}
function invalidateCache(id: string): void {
  (globalThis as unknown as { __ccWorkflowCache?: Map<string, unknown> }).__ccWorkflowCache?.delete(id)
}
