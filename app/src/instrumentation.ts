/**
 * Runs once when the server starts. Schedules the background n8n execution sync.
 * The interval is read from settings on every tick, so changes apply without a restart.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return

  const { getSettings, getMeta } = await import('./lib/settings')
  const { isConfigured, syncExecutions } = await import('./lib/n8n')
  const { listProjects } = await import('./lib/projects')
  const { logActivity } = await import('./lib/logs')

  logActivity({ level: 'info', action: 'app.start', message: 'Control center started' })

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
