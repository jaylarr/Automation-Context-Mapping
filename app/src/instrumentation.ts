/**
 * Runs once when the server starts. Schedules the background n8n execution sync.
 * The interval is read from settings on every tick, so changes apply without a restart.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs' || process.env.CONTROL_CENTER_BACKGROUND === 'off') return
  const state = globalThis as typeof globalThis & { __ccScheduled?: boolean }
  if (state.__ccScheduled) return
  state.__ccScheduled = true

  const { getSettings, getMeta } = await import('./lib/settings')
  const { isConfigured, syncExecutions } = await import('./lib/n8n')
  const { listProjects } = await import('./lib/projects')
  const { logActivity, pruneOlderThan } = await import('./lib/logs')
  const prune = () => {
    try { pruneOlderThan(getSettings().retentionDays) }
    catch { logActivity({ level: 'error', action: 'retention.failed', message: 'Local log retention failed; will retry.' }) }
  }
  prune()
  setInterval(prune, 60 * 60_000).unref()

  const { purgeExpiredTrashAndRows } = await import('./lib/trash-cleanup')

  logActivity({ level: 'info', action: 'app.start', message: 'Control center started' })

  // Deleted projects older than 30 days: checked at start, then hourly.
  const purgeTrash = () => {
    try {
      purgeExpiredTrashAndRows()
    } catch (e) {
      logActivity({ level: 'error', action: 'project.purge', message: `Emptying the trash failed: ${e instanceof Error ? e.message : e}` })
    }
  }
  purgeTrash()
  setInterval(purgeTrash, 60 * 60_000).unref()

  // Scheduled auto-export of changed workflows (Settings → Backups). Checked every minute.
  const { autoExportDue, runAutoExport } = await import('./lib/auto-export')
  setInterval(() => {
    try {
      if (autoExportDue() && isConfigured()) runAutoExport('auto').catch(() => {
        /* recorded in the activity log */
      })
    } catch {
      /* never crash the server from the scheduler */
    }
  }, 60_000).unref()

  const TICK_MS = 60_000
  setInterval(() => {
    try {
      const { syncIntervalMinutes } = getSettings()
      if (!syncIntervalMinutes || !isConfigured()) return
      const last = Date.parse(getMeta('lastSyncAt') ?? '') || 0
      if (Date.now() - last < syncIntervalMinutes * 60_000) return
      syncExecutions('auto', listProjects().map((p) => p.slug)).catch(() => {
        /* failure is recorded in the activity log */
      })
    } catch {
      /* never crash the server from the scheduler */
    }
  }, TICK_MS).unref()
}
