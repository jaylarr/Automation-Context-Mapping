import { db } from './db'

/** Non-secret app settings. Secrets (API key, ingest token) live in .env.local only. */
export type Settings = {
  syncIntervalMinutes: number // 0 = auto-sync off
  retentionDays: number
  syncLookbackPages: number // pages of 100 executions fetched per sync
}

const DEFAULTS: Settings = {
  syncIntervalMinutes: 10,
  retentionDays: 30,
  syncLookbackPages: 3,
}

export function getSettings(): Settings {
  const rows = db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[]
  const out: Settings = { ...DEFAULTS }
  for (const r of rows) {
    if (r.key in out) (out as Record<string, number>)[r.key] = Number(JSON.parse(r.value))
  }
  return out
}

export function saveSettings(partial: Partial<Settings>): void {
  const stmt = db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
  )
  db.transaction(() => {
    for (const [k, v] of Object.entries(partial)) if (v !== undefined) stmt.run(k, JSON.stringify(v))
  })()
}

export function getMeta(key: string): string | null {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(`meta:${key}`) as
    | { value: string }
    | undefined
  return row ? (JSON.parse(row.value) as string) : null
}

export function setMeta(key: string, value: string): void {
  db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
  ).run(`meta:${key}`, JSON.stringify(value))
}

export const env = {
  ingestToken: () => process.env.INGEST_TOKEN || '',
}

/** How the Projects grid shows archived projects: hidden behind a filter (default) or dimmed in place. */
export type ArchivedDisplay = 'hidden' | 'dimmed'
export function getArchivedDisplay(): ArchivedDisplay {
  return getMeta('archivedDisplay') === 'dimmed' ? 'dimmed' : 'hidden'
}
