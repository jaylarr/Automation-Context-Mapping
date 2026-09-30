import { getJob } from '@/lib/jobs'
import { getSettings } from '@/lib/settings'
import { listInstances } from '@/lib/instances'
import { relativeTime } from '@/lib/format'
import { isMaintenanceRunning, lastMaintenanceResult, readMaintenanceStatus } from '@/lib/maintenance'
import { LiveRefresh } from './live-refresh'

export function JobStatus() {
  const settings = getSettings()
  const definitions = [
    ...listInstances().filter(i => i.hasKey).map(i => ({ id: `sync:${i.id}`, name: `Sync: ${i.name}`, interval: settings.syncIntervalMinutes * 60_000 })),
    { id: 'auto-export', name: 'Workflow export', interval: settings.autoExportHours * 3_600_000 },
    { id: 'retention', name: 'Log retention', interval: 3_600_000 },
  ]
  const maintenance = readMaintenanceStatus()
  return <section className="card" id="jobs"><div className="card-head"><h2>Background activity</h2><LiveRefresh /></div>
    <div className="table-wrap"><table className="table"><thead><tr><th>Job</th><th>Status</th><th>Last successful attempt</th><th>Next attempt</th></tr></thead><tbody>{definitions.map(d => {
      const j = getJob(d.id)
      const normal = d.interval && j?.finishedAt ? Date.parse(j.finishedAt) + d.interval : 0
      const retry = j?.nextRetry ? Date.parse(j.nextRetry) : 0
      const next = normal || retry ? new Date(Math.max(normal, retry)).toISOString() : null
      return <tr key={d.id}><td>{d.name}{j?.message && <div className="small muted">{j.message}</div>}</td><td>{j?.state ?? 'Not run yet'}{j && <div className="small faint">Started {relativeTime(j.startedAt)}</div>}</td><td>{j?.lastSuccess ? relativeTime(j.lastSuccess) : 'None recorded'}</td><td>{j?.state === 'running' ? 'In progress' : !d.interval ? 'Manual only' : next ? relativeTime(next) : 'Next scheduler check'}</td></tr>
    })}<tr><td>App maintenance{maintenance?.message && <div className="small muted">{maintenance.message}</div>}</td><td>{isMaintenanceRunning() ? 'running' : lastMaintenanceResult()}</td><td>{maintenance?.state === 'ok' && maintenance.finishedAt ? relativeTime(maintenance.finishedAt) : 'See maintenance log'}</td><td>Manual only</td></tr></tbody></table></div>
    <p className="small faint">Job success and history coverage are separate. Check installation sync status for pending history or gaps. Failed automatic jobs back off before retrying. Status refreshes when Live is enabled.</p>
  </section>
}
