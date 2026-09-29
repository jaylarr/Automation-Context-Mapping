import fs from 'node:fs'
import path from 'node:path'
import { atomicWrite } from './file-safety'

/**
 * Reads and updates app/.env.local so secrets can be managed from the Settings page.
 * Secrets stay in this gitignored file (never in SQLite), and process.env is updated
 * in place, so changes apply without restarting the app.
 */

export const ENV_FILE = process.env.CONTROL_CENTER_ENV_FILE || path.join(/* turbopackIgnore: true */ process.cwd(), '.env.local')

/** Keys the app may write: the inbox token, legacy single-instance keys, and one API key per n8n instance. */
const WRITABLE = /^(INGEST_TOKEN|N8N_BASE_URL|N8N_API_KEY|N8N_API_KEY__[A-Z0-9_]+)$/

function read(): string {
  try {
    return fs.readFileSync(ENV_FILE, 'utf8')
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e
    return '# Control Center secrets. Gitignored: never commit this file.\n'
  }
}

function write(text: string): void {
  // Write to a temp file, then rename, so a crash can't leave a half-written file.
  atomicWrite(ENV_FILE, text)
}

/** Sets keys in .env.local (keeping comments and other lines) and in process.env. */
export function setEnvValues(values: Record<string, string>): void {
  let text = read()
  for (const [key, raw] of Object.entries(values)) {
    if (!WRITABLE.test(key)) throw new Error(`Refusing to write ${key}`)
    const value = raw.replace(/[\r\n]/g, '').trim()
    const line = `${key}=${value}`
    const re = new RegExp(`^${key}=.*$`, 'm')
    text = re.test(text) ? text.replace(re, () => line) : `${text.replace(/\n*$/, '\n')}${line}\n`
  }
  write(text)
  for (const [key, raw] of Object.entries(values)) process.env[key] = raw.replace(/[\r\n]/g, '').trim()
}

/** Removes keys from .env.local and process.env. */
export function deleteEnvKeys(keys: string[]): void {
  let text = read()
  for (const key of keys) {
    if (!WRITABLE.test(key)) throw new Error(`Refusing to remove ${key}`)
    text = text.replace(new RegExp(`^${key}=.*(\\r?\\n)?`, 'm'), '')
  }
  write(text)
  for (const key of keys) delete process.env[key]
}
