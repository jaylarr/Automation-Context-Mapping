import { logActivity } from './logs'
import { isConfigured } from './n8n'
import { commitProject } from './projects'
import { getMeta, getSettings, setMeta } from './settings'
import { buildWorkflowRows, importWorkflow } from './workflow-import'

/**
 * Scheduled auto-export: every workflow that already belongs to a project and changed in n8n is
 * re-imported (same sanitizer and secret check as the Import button, plus a CHANGELOG line).
 * Optionally commits those files in the project's repo. Never pushes, and never imports new
 * workflows: picking a project for a new workflow stays a manual choice.
 */

export type AutoExportResult = { at: string; exported: string[]; committed: string[]; skipped: string[] }

let running = false

export async function runAutoExport(trigger: 'auto' | 'manual'): Promise<AutoExportResult> {
  const result: AutoExportResult = { at: new Date().toISOString(), exported: [], committed: [], skipped: [] }
  if (running) throw new Error('An auto-export is already running.')
  if (!isConfigured()) throw new Error('No n8n instance is connected.')
  running = true
  try {
    const { rows, errors } = await buildWorkflowRows(null, true)
    for (const e of errors) result.skipped.push(`${e.instance}: ${e.message}`)

    // Changed workflows, grouped by the project whose folder holds them.
    const touched = new Map<string, string[]>()
    for (const r of rows.filter((x) => x.status === 'changed' && x.project)) {
      try {
        const res = await importWorkflow(r.instanceId, r.id, null)
        if (!res.ok) result.skipped.push(`${r.name}: ${res.message}`)
        else if (res.message !== 'Already up to date.' && res.project && res.file) {
          result.exported.push(`${res.project}/${res.file}`)
          touched.set(res.project, [...(touched.get(res.project) ?? []), `workflows/${res.file}`, 'documentation/CHANGELOG.md'])
        }
      } catch (e) {
        result.skipped.push(`${r.name}: ${e instanceof Error ? e.message : String(e)}`)
      }
    }

    if (getSettings().autoCommit) {
      for (const [slug, paths] of touched) {
        const files = [...new Set(paths)]
        const names = files.filter((f) => f.startsWith('workflows/')).map((f) => f.slice(10).replace(/\.json$/, ''))
        try {
          const { sha } = await commitProject(slug, `${slug}: auto-export ${names.join(', ')}`, { paths: files })
          result.committed.push(`${slug} (${sha})`)
        } catch (e) {
          result.skipped.push(`${slug}: not committed (${e instanceof Error ? e.message : String(e)})`)
        }
      }
    }

    setMeta('lastAutoExport', JSON.stringify(result))
    if (result.exported.length || result.skipped.length || trigger === 'manual')
      logActivity({
        level: result.skipped.length ? 'warn' : 'success',
        action: 'workflows.auto-export',
        message: `Auto-export (${trigger}): ${result.exported.length} workflow(s) updated${result.committed.length ? `, committed in ${result.committed.length} project(s)` : ''}${result.skipped.length ? `, ${result.skipped.length} skipped` : ''}`,
        meta: result,
      })
    return result
  } finally {
    running = false
  }
}

export function lastAutoExport(): AutoExportResult | null {
  try {
    return JSON.parse(getMeta('lastAutoExport') ?? 'null') as AutoExportResult | null
  } catch {
    return null
  }
}

/** Called by the scheduler every minute: runs when the interval has passed. */
export function autoExportDue(now = Date.now()): boolean {
  const { autoExportHours } = getSettings()
  if (!autoExportHours) return false
  const last = Date.parse(lastAutoExport()?.at ?? '') || 0
  return now - last >= autoExportHours * 3_600_000
}
