import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { spawnSync } from 'node:child_process'

export const xml = (s) => String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&apos;')
export function systemdQuote(s, command = true) {
  if (/[\r\n\0]/.test(s)) throw new Error('Service paths cannot contain newlines or NUL.')
  const escaped = String(s).replaceAll('\\','\\\\').replaceAll('"','\\"').replaceAll('%','%%')
  return '"' + (command ? escaped.replaceAll('$', () => '$$') : escaped) + '"'
}
export function atomicJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const temp = `${file}.${randomUUID()}.tmp`
  try { fs.writeFileSync(temp, JSON.stringify(value, null, 2), { mode: 0o600, flag: 'wx' }); fs.renameSync(temp, file) }
  finally { fs.rmSync(temp, { force: true }) }
}
export function resolveRelease(repo, value) {
  if (!value) return { id: 'legacy', app: path.join(repo, 'app'), schema: 5 }
  if (!/^[a-z0-9-]+$/.test(value.id)) throw new Error('Invalid release ID.')
  const app = path.join(repo, 'app', 'data', 'releases', value.id, 'app')
  if (!fs.existsSync(path.join(app, '.next', 'BUILD_ID'))) throw new Error('Release is incomplete.')
  return { ...value, app }
}
export function activeRelease(repo) {
  const pointer = path.join(repo, 'app', 'data', 'active-release.json')
  return resolveRelease(repo, fs.existsSync(pointer) ? JSON.parse(fs.readFileSync(pointer, 'utf8')) : null)
}
export function stageRelease(repo, runner = spawnSync) {
  const id = `${Date.now()}-${randomUUID()}`
  const root = path.join(repo, 'app', 'data', 'releases', id)
  const app = path.join(root, 'app')
  const source = path.join(repo, 'app')
  fs.mkdirSync(root, { recursive: true })
  const excluded = new Set(['data','node_modules','.git','.next','.next-staging','.next-old'])
  fs.mkdirSync(app, { recursive: true })
  for (const entry of fs.readdirSync(source)) {
    if (excluded.has(entry) || entry.startsWith('.next') || entry.startsWith('.env') || entry.endsWith('.tsbuildinfo')) continue
    fs.cpSync(path.join(source,entry), path.join(app,entry), { recursive: true, dereference: false, filter: (file) => {
      if (fs.lstatSync(file).isSymbolicLink()) throw new Error('Release input contains a symlink. Review it before staging.')
      return true
    } })
  }
  if (fs.existsSync(path.join(repo, 'scripts'))) fs.cpSync(path.join(repo, 'scripts'), path.join(root, 'scripts'), { recursive: true })
  const fixture = path.join(root, 'build-fixture')
  fs.mkdirSync(fixture, { recursive: true })
  const cleanEnv = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(N8N_|INGEST_TOKEN|DATABASE_PATH|WORKSPACE_ROOT|CONTROL_CENTER_|NEXT_DIST_DIR)/.test(k)))
  const env = { ...cleanEnv, WORKSPACE_ROOT: fixture, DATABASE_PATH: path.join(fixture, 'build.db'), CONTROL_CENTER_ENV_FILE: path.join(fixture, '.env.local'), CONTROL_CENTER_BACKGROUND: 'off', CONTROL_CENTER_OFFLINE: '1' }
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
  for (const args of [['ci'], ['run','typecheck'], ['test'], ['run','build']]) {
    const result = runner(npm, args, { cwd: app, env, shell: process.platform === 'win32', stdio: ['ignore','inherit','inherit'], windowsHide: true })
    if (result.status !== 0) throw new Error(`Release ${id}: ${args.join(' ')} failed. Active release unchanged.`)
  }
  if (!fs.existsSync(path.join(app,'.next','BUILD_ID'))) throw new Error('Build produced no BUILD_ID.')
  const release = { id, schema: 6, rollbackCompatibleFrom: 5, createdAt: new Date().toISOString() }
  atomicJson(path.join(root,'release.json'), release)
  atomicJson(path.join(repo,'app','data','candidate-release.json'), release)
  return release
}
export function activateRelease(repo, candidate) {
  const release = resolveRelease(repo, candidate)
  const previous = activeRelease(repo)
  if (previous.schema < (candidate.rollbackCompatibleFrom ?? candidate.schema)) throw new Error('Schema rollback is not compatible. Plan an approved database migration and recovery first.')
  atomicJson(path.join(repo,'app','data','previous-release.json'), previous)
  atomicJson(path.join(repo,'app','data','active-release.json'), { id: release.id, schema: release.schema })
  return previous
}
export function rollbackRelease(repo, previous) {
  const file = path.join(repo,'app','data','active-release.json')
  if (previous.id === 'legacy') fs.rmSync(file, { force: true })
  else atomicJson(file, { id: previous.id, schema: previous.schema })
}
