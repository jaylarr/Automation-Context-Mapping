import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { randomUUID, createHash } from 'node:crypto'
import { atomicJson } from './releases.mjs'

export async function snapshotState(repo, Database) {
  const app = path.join(repo,'app')
  const source = path.join(app,'data','control-center.db')
  if (!fs.existsSync(source)) return null
  Database ??= createRequire(path.join(app,'package.json'))('better-sqlite3')
  const directory = path.join(app,'data','snapshots',`${Date.now()}-${randomUUID()}`)
  fs.mkdirSync(directory,{recursive:true,mode:0o700})
  const target = path.join(directory,'control-center.db')
  const db = new Database(source,{readonly:true,fileMustExist:true})
  try { await db.backup(target) } finally { db.close() }
  fs.chmodSync(target,0o600)
  const restored = new Database(target,{readonly:true,fileMustExist:true})
  let schema
  try {
    if (restored.pragma('integrity_check',{simple:true}) !== 'ok') throw new Error('Snapshot failed SQLite integrity check.')
    schema = restored.pragma('user_version',{simple:true})
  } finally { restored.close() }
  const env = path.join(app,'.env.local')
  const credentials = fs.existsSync(env) ? fs.readFileSync(env) : null
  if (credentials) fs.writeFileSync(path.join(directory,'.env.local'),credentials,{flag:'wx',mode:0o600})
  atomicJson(path.join(directory,'snapshot.json'),{version:1,createdAt:new Date().toISOString(),schema,databaseSha256:createHash('sha256').update(fs.readFileSync(target)).digest('hex'),credentialSha256:credentials ? createHash('sha256').update(credentials).digest('hex') : undefined,includesCredentials:Boolean(credentials),integrity:'ok'})
  return directory
}
