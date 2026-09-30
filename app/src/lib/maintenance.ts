import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { WORKSPACE_ROOT, DATABASE_PATH } from './paths'

/**
 * Restart / update the app from its own Settings page.
 *
 * The work is done by scripts/control-center.ps1. The login task runs a supervisor loop that
 * restarts the server whenever it exits, so "restart" only stops this server process and
 * "update" builds into .next-staging, flags a swap, then stops it. The script is launched as a
 * child process; it survives this server stopping because the supervisor (and its job) keeps running.
 */

export type MaintenanceAction = 'restart' | 'update'

const APP_DIR = path.join(/* turbopackIgnore: true */ process.cwd())
const SCRIPT = path.join(WORKSPACE_ROOT, 'scripts', 'control-center.ps1')
export const MAINTENANCE_LOG = path.join(path.dirname(DATABASE_PATH), 'maintenance.log')
const LOCK = path.join(path.dirname(DATABASE_PATH), 'maintenance.lock')
const STATUS = path.join(path.dirname(DATABASE_PATH), 'maintenance-status.json')
export function readMaintenanceStatus(): { state: 'running' | 'ok' | 'failed'; startedAt: string; finishedAt?: string; message?: string } | null {
  try { return JSON.parse(fs.readFileSync(STATUS, 'utf8')) } catch { return null }
}

/** When this server process started; changes after every restart (the page polls it). */
export const SERVER_STARTED_AT = new Date().toISOString()

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

export function isMaintenanceRunning(): boolean {
  try {
    const pid = Number(fs.readFileSync(LOCK, 'utf8').trim())
    return Number.isFinite(pid) && pid > 0 && pidAlive(pid)
  } catch {
    return false
  }
}

export function readMaintenanceLog(lines = 40): string {
  try {
    const text = fs.readFileSync(MAINTENANCE_LOG, 'utf8')
    return text.split(/\r?\n/).slice(-lines).join('\n').trim()
  } catch {
    return ''
  }
}

/** Outcome of the most recent run, read from the log's last section. */
export function lastMaintenanceResult(): 'ok' | 'failed' | 'unknown' {
  const status = readMaintenanceStatus()
  if (status?.state === 'ok' || status?.state === 'failed') return status.state
  const tail = readMaintenanceLog(60)
  const last = tail.split('=====').pop() ?? ''
  const failed = /Build failed|rolled back|Release .* failed|npm install failed|already running|Not answering yet|Candidate failed/i
  if (failed.test(last)) return 'failed'
  if (/Update complete|Running at http/i.test(last)) return 'ok'
  return 'unknown'
}

export function canSelfManage(): { ok: boolean; reason?: string } {
  if (process.platform !== 'win32') return { ok: false, reason: 'In-app restart/update is only available on Windows.' }
  if (!fs.existsSync(SCRIPT)) return { ok: false, reason: 'scripts/control-center.ps1 was not found.' }
  return { ok: true }
}

export function launchMaintenance(action: MaintenanceAction): void {
  const check = canSelfManage()
  if (!check.ok) throw new Error(check.reason)
  if (isMaintenanceRunning()) throw new Error('An update or restart is already running.')

  fs.mkdirSync(path.dirname(MAINTENANCE_LOG), { recursive: true })
  fs.appendFileSync(MAINTENANCE_LOG, `
===== ${new Date().toISOString()} ${action} requested from the app =====
`)

  // cmd /s /c "<cmd>" strips only the outer quotes, so quoted paths with spaces survive.
  const inner = `"powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "${SCRIPT}" ${action} >> "${MAINTENANCE_LOG}" 2>&1`
  const child = spawn('cmd.exe', ['/d', '/s', '/c', `"${inner}"`], {
    cwd: APP_DIR,
    windowsHide: true,
    windowsVerbatimArguments: true,
    stdio: 'ignore', // not detached: PowerShell needs a console
  })
  child.unref()
}
