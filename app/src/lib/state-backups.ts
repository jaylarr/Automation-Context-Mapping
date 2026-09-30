import fs from 'node:fs'
import path from 'node:path'
import Database from 'better-sqlite3'
import { createHash, randomUUID } from 'node:crypto'
import { db } from './db'
import { DATABASE_PATH, WORKSPACE_ROOT, isInside } from './paths'
import { atomicWrite } from './file-safety'

const root = path.join(path.dirname(DATABASE_PATH), 'snapshots')
const ID = /^\d+-[a-f0-9-]{36}$/
export type StateBackup = { id: string; createdAt: string; schema: number; includesCredentials: boolean; verifiedAt?: string; integrity: string }
function directory(id: string) {
  const dir = path.join(root, id)
  if (!ID.test(id) || !isInside(root, dir) || fs.lstatSync(dir).isSymbolicLink()) throw new Error('Invalid backup.')
  return dir
}
export function stateBackups(): StateBackup[] {
  if (!fs.existsSync(root)) return []
  return fs.readdirSync(root).filter(id => ID.test(id)).flatMap(id => {
    try { return [{ ...JSON.parse(fs.readFileSync(path.join(directory(id), 'snapshot.json'), 'utf8')), id } as StateBackup] }
    catch { return [] }
  }).sort((a,b) => b.createdAt.localeCompare(a.createdAt))
}
export async function createStateBackup() {
  fs.mkdirSync(root, { recursive: true, mode: 0o700 })
  const id = `${Date.now()}-${randomUUID()}`
  const dir = path.join(root, id)
  fs.mkdirSync(dir, { mode: 0o700 })
  const target = path.join(dir, 'control-center.db')
  await db.backup(target)
  fs.chmodSync(target, 0o600)
  const env = process.env.CONTROL_CENTER_ENV_FILE || path.join(WORKSPACE_ROOT, 'app', '.env.local')
  const includesCredentials = fs.existsSync(/* turbopackIgnore: true */ env)
  const credentials = includesCredentials ? fs.readFileSync(/* turbopackIgnore: true */ env) : null
  if (credentials) fs.writeFileSync(path.join(dir, '.env.local'), credentials, { mode: 0o600, flag: 'wx' })
  const manifest = { version: 1, createdAt: new Date().toISOString(), schema: db.pragma('user_version', { simple: true }), databaseSha256: createHash('sha256').update(fs.readFileSync(target)).digest('hex'), credentialSha256: credentials ? createHash('sha256').update(credentials).digest('hex') : undefined, includesCredentials, integrity: 'unchecked' }
  atomicWrite(path.join(dir, 'snapshot.json'), JSON.stringify(manifest, null, 2))
  await verifyStateBackup(id)
  return id
}
/** Verify an independent disposable database without loading credentials or running migrations. */
export async function verifyStateBackup(id: string) {
  const dir = directory(id)
  const manifestFile = path.join(dir, 'snapshot.json')
  const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'))
  const source = path.join(dir, 'control-center.db')
  if (fs.lstatSync(source).isSymbolicLink()) throw new Error('Unsupported backup file.')
  const bytes = fs.readFileSync(source)
  const drill = path.join(dir, `.verify-${randomUUID()}.db`)
  try {
    if (createHash('sha256').update(bytes).digest('hex') !== manifest.databaseSha256) throw new Error('Backup checksum mismatch. Preserve this backup for inspection.')
    if (manifest.credentialSha256) {
      const credentialFile = path.join(dir, '.env.local')
      if (fs.lstatSync(credentialFile).isSymbolicLink() || createHash('sha256').update(fs.readFileSync(/* turbopackIgnore: true */ credentialFile)).digest('hex') !== manifest.credentialSha256) throw new Error('Private credential backup checksum mismatch.')
    }
    fs.writeFileSync(drill, bytes, { mode: 0o600, flag: 'wx' })
    const restored = new Database(drill, { readonly: true, fileMustExist: true })
    try {
      if (restored.pragma('integrity_check', { simple: true }) !== 'ok' || restored.pragma('user_version', { simple: true }) !== manifest.schema) throw new Error('Backup integrity or schema check failed.')
      restored.prepare('SELECT COUNT(*) FROM settings').get()
    } finally { restored.close() }
    atomicWrite(manifestFile, JSON.stringify({ ...manifest, integrity: 'ok', verifiedAt: new Date().toISOString() }, null, 2))
  } catch (e) {
    atomicWrite(manifestFile, JSON.stringify({ ...manifest, integrity: 'failed', verifiedAt: new Date().toISOString() }, null, 2))
    throw e
  } finally { fs.rmSync(drill, { force: true }) }
}
