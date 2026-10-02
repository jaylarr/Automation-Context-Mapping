import './test-loader.mjs'
import test, { after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { spawnSync } from 'node:child_process'
import Database from 'better-sqlite3'

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-pause-'))
process.env.WORKSPACE_ROOT = root
process.env.DATABASE_PATH = path.join(root, 'fixture.db')
process.env.CONTROL_CENTER_ENV_FILE = path.join(root, '.env.local')
process.env.CONTROL_CENTER_BACKGROUND = 'off'
process.env.CONTROL_CENTER_OFFLINE = '0'
globalThis.fetch = async () => { throw new Error('Unmocked request in pause fixture.') }
const { db } = await import('./db.ts')
const instances = await import('./instances.ts')
const n8n = await import('./n8n.ts')
const prefs = await import('./workflow-prefs.ts')
const logs = await import('./logs.ts')
const settings = await import('./settings.ts')
const jobs = await import('./jobs.ts')
const imports = await import('./workflow-import.ts')
const restore = await import('./restore.ts')
const setup = await import('./restore-setup.ts')
const exports = await import('./auto-export.ts')
const { saveBinding } = await import('./workflow-bindings.ts')
const a = instances.addInstance({ name: 'Fixture A', baseUrl: 'http://fixture-a.invalid', apiKey: 'fixture-a-key' })
const b = instances.addInstance({ name: 'Fixture B', baseUrl: 'http://fixture-b.invalid', apiKey: 'fixture-b-key' })
const project = path.join(root, 'n8n workflows', 'fixture')
fs.mkdirSync(path.join(project, 'workflows'), { recursive: true })
fs.mkdirSync(path.join(project, 'documentation'), { recursive: true })
fs.writeFileSync(path.join(project, 'README.md'), '# Fixture\n')
const workflow = { id: 'wf', name: '[fixture] Fixture', active: false, nodes: [], connections: {}, settings: {} }
const saved = path.join(project, 'workflows', '01-fixture.json')
fs.writeFileSync(saved, JSON.stringify(workflow))
saveBinding('fixture', '01-fixture.json', a.uid, 'wf')
const json = value => new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } })
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r }); return { promise, resolve } }
const pauseError = e => e instanceof instances.InstancePausedError

beforeEach(() => {
  instances.setInstancePaused(a.id, false)
  instances.setInstancePaused(b.id, false)
  n8n.invalidateWorkflowList()
  globalThis.fetch = async () => { throw new Error('Unmocked request in pause fixture.') }
})
after(() => { db.close(); fs.rmSync(root, { recursive: true, force: true }) })

test('pause is persistent, idempotent and retains credentials, identity and history', () => {
  assert.equal(a.paused, false)
  assert.equal(a.accessRevision, 0)
  const env = fs.readFileSync(process.env.CONTROL_CENTER_ENV_FILE, 'utf8')
  const at = new Date().toISOString()
  db.prepare('INSERT INTO executions(instance_id,id,workflow_id,status,started_at) VALUES(?,?,?,?,?)').run(a.id, 'saved', 'wf', 'error', at)
  db.prepare('INSERT INTO execution_facts(instance_id,id,workflow_id,status,started_at) VALUES(?,?,?,?,?)').run(a.id, 'saved', 'wf', 'error', at)
  settings.setMeta(`syncCursor:${a.id}`, 'keep-cursor')
  const first = instances.setInstancePaused(a.id, true)
  const second = instances.setInstancePaused(a.id, true)
  assert.equal(first.changed, true)
  assert.equal(second.changed, false)
  assert.equal(second.instance.accessRevision, first.instance.accessRevision)
  assert.equal(second.instance.uid, a.uid)
  assert.equal(instances.apiKeyFor(a.id), 'fixture-a-key')
  assert.equal(fs.readFileSync(process.env.CONTROL_CENTER_ENV_FILE, 'utf8'), env)
  assert.equal(settings.getMeta(`syncCursor:${a.id}`), 'keep-cursor')
  assert.equal(logs.overviewCounts(a.id).errors24h, 1)
  assert.equal(logs.recentErrors(5, a.id).length, 0)
  const reopened = new Database(process.env.DATABASE_PATH, { readonly: true })
  assert.equal(reopened.prepare('SELECT paused FROM instances WHERE id=?').get(a.id).paused, 1)
  reopened.close()
  assert.equal(instances.connectedInstances().some(i => i.id === a.id), false)
  assert.equal(instances.connectedInstances().some(i => i.id === b.id), true)
  instances.setInstancePaused(a.id, false)
  assert.equal(logs.recentErrors(5, a.id).length, 1)
})

test('upgrade from schema 6 retains existing rows and defaults to unpaused', async () => {
  const file = path.join(root, 'upgrade.db')
  await db.backup(file)
  const old = new Database(file)
  old.exec('ALTER TABLE instances DROP COLUMN paused; ALTER TABLE instances DROP COLUMN access_revision; PRAGMA user_version = 6;')
  old.close()
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', "import './src/lib/test-loader.mjs'; const {db}=await import('./src/lib/db.ts'); db.close()"], {
    cwd: path.resolve(import.meta.dirname, '../..'), encoding: 'utf8', windowsHide: true,
    env: { ...process.env, DATABASE_PATH: file },
  })
  assert.equal(result.status, 0, result.stderr)
  const migrated = new Database(file, { readonly: true })
  assert.equal(migrated.pragma('user_version', { simple: true }), 7)
  assert.deepEqual(migrated.prepare('SELECT paused,access_revision FROM instances WHERE id=?').get(a.id), { paused: 0, access_revision: 0 })
  assert.ok(migrated.prepare('SELECT id FROM executions WHERE id=?').get('saved'))
  migrated.close()
})

test('every remote entry point refuses a paused instance without a request', async () => {
  instances.setInstancePaused(a.id, true)
  let requests = 0
  globalThis.fetch = async () => { requests++; throw new Error('Must not contact paused instance') }
  const inst = instances.getInstance(a.id)
  for (const method of ['GET', 'POST', 'PUT']) await assert.rejects(n8n.api(inst, '/workflows', method), pauseError)
  await assert.rejects(n8n.listWorkflows(inst), pauseError)
  await assert.rejects(n8n.syncExecutions('manual', [], a.id), pauseError)
  await assert.rejects(n8n.setWorkflowPublished(a.id, 'wf', true), pauseError)
  await assert.rejects(n8n.setWorkflowPublished(a.id, 'wf', false), pauseError)
  await assert.rejects(imports.importWorkflow(a.id, 'wf', 'fixture'), pauseError)
  await assert.rejects(restore.previewRestore('fixture', '01-fixture.json', a.id), pauseError)
  await assert.rejects(restore.restoreWorkflow('fixture', '01-fixture.json', a.id, false, 'stale'), pauseError)
  assert.throws(() => setup.restoreSetup('fixture', '01-fixture.json', a.id), pauseError)
  await assert.rejects(setup.saveRestoreSetup('fixture', '01-fixture.json', a.id, {}), pauseError)
  assert.deepEqual(await n8n.testConnection(a.id), { ok: false, error: 'Instance paused. Resume it in Settings.' })
  assert.equal(requests, 0)
})

test('paused editing preserves state and replaces its key without requesting n8n', () => {
  instances.setInstancePaused(a.id, true)
  const updated = instances.updateInstance(a.id, { name: a.name, baseUrl: a.baseUrl, apiKey: 'fixture-replaced-key' })
  assert.equal(updated.paused, true)
  assert.equal(instances.apiKeyFor(a.id), 'fixture-replaced-key')
})

test('pause aborts requests and rapid resume cannot revive their responses', async () => {
  const pending = deferred()
  let signal
  globalThis.fetch = async (_url, options) => { signal = options.signal; return pending.promise }
  const snapshot = instances.getInstance(a.id)
  const result = n8n.api(snapshot, '/workflows')
  const rejected = assert.rejects(result, pauseError)
  instances.setInstancePaused(a.id, true)
  assert.equal(signal.aborted, true)
  instances.setInstancePaused(a.id, false)
  pending.resolve(json({ data: [] }))
  await rejected
  assert.throws(() => instances.assertInstanceAccess(snapshot), pauseError)
})

test('pause during pagination cannot repopulate cache or request another page', async () => {
  const entered = deferred(), pending = deferred()
  let requests = 0
  globalThis.fetch = async () => {
    requests++
    if (requests === 1) return json({ data: [workflow], nextCursor: 'page-2' })
    entered.resolve(); return pending.promise
  }
  const result = n8n.listWorkflows(instances.getInstance(a.id), { fresh: true })
  const rejected = assert.rejects(result, pauseError)
  await entered.promise
  instances.setInstancePaused(a.id, true)
  pending.resolve(json({ data: [workflow], nextCursor: 'page-3' }))
  await rejected
  assert.equal(requests, 2)
  assert.equal(globalThis.__ccWorkflowCache.has(a.id), false)
})

test('interrupted sync preserves checkpoints and successful status, without failure backoff', async () => {
  const entered = deferred(), pending = deferred()
  const at = '2026-10-01T00:00:00Z'
  settings.setMeta(`lastSyncAt:${a.id}`, at)
  settings.setMeta(`lastSyncStatus:${a.id}`, 'ok')
  settings.setMeta(`syncCursor:${a.id}`, '')
  globalThis.fetch = async url => {
    if (url.includes('/workflows')) return json({ data: [workflow] })
    entered.resolve(); return pending.promise
  }
  const count = db.prepare('SELECT COUNT(*) n FROM executions WHERE instance_id=?').get(a.id).n
  const result = n8n.syncExecutions('manual', ['fixture'], a.id)
  const rejected = assert.rejects(result, pauseError)
  await entered.promise
  instances.setInstancePaused(a.id, true)
  instances.setInstancePaused(a.id, false)
  pending.resolve(json({ data: [{ id: 'stale', workflowId: 'wf', status: 'success', startedAt: new Date().toISOString() }] }))
  await rejected
  assert.equal(settings.getMeta(`lastSyncAt:${a.id}`), at)
  assert.equal(settings.getMeta(`lastSyncStatus:${a.id}`), 'ok')
  assert.equal(db.prepare('SELECT COUNT(*) n FROM executions WHERE instance_id=?').get(a.id).n, count)
  assert.equal(db.prepare("SELECT COUNT(*) n FROM execution_facts WHERE id='stale'").get().n, 0)
  assert.equal(jobs.getJob(`sync:${a.id}`).state, 'canceled')
  assert.equal(jobs.getJob(`sync:${a.id}`).failures, 0)
  assert.equal(jobs.getJob(`sync:${a.id}`).nextRetry, undefined)
  assert.equal(jobs.jobCanRetry(`sync:${a.id}`), true)
  assert.equal(db.prepare("SELECT COUNT(*) n FROM activity WHERE action='n8n.sync' AND level='error'").get().n, 0)
})

test('Sync all queries eligible instances only and resume does not launch requests', async () => {
  instances.setInstancePaused(a.id, true)
  const urls = []
  globalThis.fetch = async url => { urls.push(url); return json({ data: [] }) }
  const results = await n8n.syncExecutions('manual')
  assert.deepEqual(results.map(r => r.instance), [b.id])
  assert.ok(urls.every(url => url.startsWith(b.baseUrl)))
  const before = urls.length
  instances.setInstancePaused(a.id, false)
  assert.equal(urls.length, before)
})

test('health preferences survive pause, alerts hide and return on resume', () => {
  db.prepare('INSERT OR REPLACE INTO workflow_prefs(instance_id,workflow_id,alert_after_failures,fail_streak) VALUES(?,?,?,?)').run(a.id, 'wf', 2, 3)
  assert.equal(prefs.workflowAlerts(a.id).length, 1)
  const saved = prefs.listWorkflowPrefs(a.id)[0]
  instances.setInstancePaused(a.id, true)
  assert.deepEqual(prefs.workflowAlerts(a.id), [])
  assert.deepEqual(prefs.listWorkflowPrefs(a.id)[0], saved)
  instances.setInstancePaused(a.id, false)
  assert.equal(prefs.workflowAlerts(a.id).length, 1)
})

test('interrupted import and auto-export cannot save stale files or record success', async () => {
  const before = fs.readFileSync(saved, 'utf8')
  let pending = deferred(), entered = deferred()
  globalThis.fetch = async () => { entered.resolve(); return pending.promise }
  const result = imports.importWorkflow(a.id, 'wf', 'fixture')
  const rejected = assert.rejects(result, pauseError)
  await entered.promise
  instances.setInstancePaused(a.id, true)
  instances.setInstancePaused(a.id, false)
  pending.resolve(json({ ...workflow, name: '[fixture] Changed' }))
  await rejected
  assert.equal(fs.readFileSync(saved, 'utf8'), before)
  instances.setInstancePaused(b.id, true)
  entered = deferred(); pending = deferred()
  globalThis.fetch = async () => { entered.resolve(); return pending.promise }
  settings.setMeta('lastAutoExport', JSON.stringify({ at: '2026-10-01T00:00:00Z', exported: [], committed: [], skipped: [] }))
  const old = settings.getMeta('lastAutoExport')
  const exporting = exports.runAutoExport('auto')
  await entered.promise
  instances.setInstancePaused(a.id, true)
  pending.resolve(json({ data: [{ ...workflow, name: '[fixture] Changed' }] }))
  const exported = await exporting
  assert.equal(exported.canceled, true)
  assert.deepEqual(exported.exported, [])
  assert.equal(fs.readFileSync(saved, 'utf8'), before)
  assert.equal(settings.getMeta('lastAutoExport'), old)
  assert.equal(jobs.getJob('auto-export').state, 'canceled')
  assert.equal(jobs.getJob('auto-export').failures, 0)
})

test('restore previews expire across pause/resume and uncertain writes retain journals', async () => {
  globalThis.fetch = async () => json(workflow)
  const preview = await restore.previewRestore('fixture', '01-fixture.json', a.id)
  instances.setInstancePaused(a.id, true)
  instances.setInstancePaused(a.id, false)
  await assert.rejects(restore.restoreWorkflow('fixture', '01-fixture.json', a.id, false, preview.token), pauseError)
  const fresh = await restore.previewRestore('fixture', '01-fixture.json', a.id)
  const pending = deferred(), entered = deferred()
  globalThis.fetch = async (_url, options) => {
    if (options.method === 'PUT') { entered.resolve(); return pending.promise }
    return json(workflow)
  }
  const restoring = restore.restoreWorkflow('fixture', '01-fixture.json', a.id, false, fresh.token)
  const rejected = assert.rejects(restoring, pauseError)
  await entered.promise
  instances.setInstancePaused(a.id, true)
  pending.resolve(json({ id: 'wf' }))
  await rejected
  const dir = path.join(root, 'restore-journal')
  const records = fs.readdirSync(dir).map(file => JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8')))
  assert.ok(records.some(record => record.state === 'pending'))
  assert.equal(fs.readFileSync(saved, 'utf8'), JSON.stringify(workflow))
})
