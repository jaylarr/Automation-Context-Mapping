import { db } from './db'
import { logActivity } from './logs'
import { TRASH_DAYS, listProjects, listTrash, purgeExpiredTrash } from './projects'

/**
 * Control Center rows (events, executions, activity) of a deleted project are kept while it sits in
 * the trash, so a restore brings its history back. They go once the project is gone for good.
 */
export function dropRowsOfGoneProjects(slugs: string[]): void {
  const alive = new Set([...listProjects().map((p) => p.slug), ...listTrash().map((t) => t.slug)])
  const gone = [...new Set(slugs)].filter((s) => !alive.has(s))
  if (!gone.length) return
  db.transaction(() => {
    for (const slug of gone)
      for (const table of ['events', 'executions', 'activity'] as const) db.prepare(`DELETE FROM ${table} WHERE project = ?`).run(slug)
  })()
}

/** Run by the background scheduler: empties trash entries older than TRASH_DAYS. */
export function purgeExpiredTrashAndRows(): void {
  const slugs = purgeExpiredTrash()
  if (!slugs.length) return
  dropRowsOfGoneProjects(slugs)
  logActivity({
    level: 'info',
    action: 'project.purge',
    message: `Emptied ${slugs.length} project(s) older than ${TRASH_DAYS} days from the trash: ${slugs.join(', ')}`,
  })
}
