#!/usr/bin/env node
// This process owns its child. Stop requests never kill arbitrary listeners on port 3100.
import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { REPO } from './lib/common.mjs'
import { activeRelease, atomicJson } from './lib/releases.mjs'
const envFile = path.join(REPO,'app','.env.local')
if (fs.existsSync(envFile)) process.loadEnvFile(envFile)
const data = path.join(REPO,'app','data')
fs.mkdirSync(data, { recursive: true })
const lock = path.join(data,'runtime.lock')
if (fs.existsSync(lock)) {
  const recorded = fs.readFileSync(lock, 'utf8').trim()
  const pid = Number(recorded)
  if (!Number.isSafeInteger(pid) || pid <= 0) throw new Error('Runtime lock is invalid; inspect it manually.')
  let alive = true
  try { process.kill(pid,0) } catch (e) { if (e.code === 'ESRCH') alive = false; else throw e }
  if (!alive && fs.readFileSync(lock,'utf8').trim() === recorded) fs.unlinkSync(lock)
}
try { fs.writeFileSync(lock, String(process.pid), { flag: 'wx' }) }
catch { throw new Error('A runtime lock exists. Verify the recorded process before removing a stale lock.') }
const stop = path.join(data,'stop.flag')
let child
let stopping = false
const finish = () => { fs.rmSync(lock, { force: true }); fs.rmSync(stop, { force: true }); process.exit(0) }
const requestStop = () => { stopping = true; if (child && child.exitCode === null) child.kill(); else finish() }
process.on('SIGTERM', requestStop); process.on('SIGINT', requestStop)
fs.rmSync(stop, { force: true })
let failures = 0
function start() {
  const release = activeRelease(REPO)
  const nonce = randomUUID()
  const log = fs.openSync(path.join(data,'server.log'),'a')
  const started = Date.now()
  child = spawn(process.execPath, [path.join(release.app,'node_modules','next','dist','bin','next'),'start','-H','127.0.0.1','-p','3100'], {
    cwd: release.app, windowsHide: true, stdio: ['ignore',log,log],
    env: { ...process.env, NODE_ENV: 'production', WORKSPACE_ROOT: REPO, DATABASE_PATH: path.join(data,'control-center.db'), CONTROL_CENTER_ENV_FILE: path.join(REPO,'app','.env.local'), CONTROL_CENTER_RELEASE_ID: release.id, CONTROL_CENTER_RUNTIME_NONCE: nonce, CONTROL_CENTER_BACKGROUND: 'on', CONTROL_CENTER_OFFLINE: '0' },
  })
  fs.closeSync(log)
  atomicJson(path.join(data,'runtime.json'), { pid: child.pid, supervisor: process.pid, nonce, release: release.id })
  child.on('error', (error) => { fs.appendFileSync(path.join(data,'server.log'), `Runtime failed: ${error.message}\n`) })
  child.on('exit', () => {
    if (stopping || fs.existsSync(stop)) return finish()
    failures = Date.now() - started < 15000 ? failures + 1 : 0
    if (failures >= 5) { fs.rmSync(lock, { force: true }); process.exit(1) }
    setTimeout(start, Math.min(20000, 1000 + failures * 3000))
  })
}
setInterval(() => { if (fs.existsSync(stop)) requestStop() }, 500).unref()
try { start() } catch (e) { fs.rmSync(lock, { force: true }); throw e }
