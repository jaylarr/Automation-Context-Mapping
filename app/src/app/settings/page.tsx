import type { Metadata } from 'next'
import { SettingsForm } from '@/components/forms'
import { TokenControls } from '@/components/connection-forms'
import { InstancesManager } from '@/components/instances-manager'
import { MaintenanceCard } from '@/components/maintenance-card'
import { canSelfManage, readMaintenanceLog } from '@/lib/maintenance'
import { PageHeader, StatusBadge } from '@/components/ui'
import { listInstances } from '@/lib/instances'
import { DATABASE_PATH, WORKSPACE_ROOT } from '@/lib/paths'
import { env, getArchivedDisplay, getSettings } from '@/lib/settings'
import { ArchivedDisplaySelect } from '@/components/archived-display-select'
import { db } from '@/lib/db'
import { TRASH_DAYS, listTrash } from '@/lib/projects'
import { TrashList } from '@/components/trash-list'

export const metadata: Metadata = { title: 'Settings' }

function count(table: 'activity' | 'events' | 'executions'): number {
  return (db.prepare(`SELECT COUNT(*) n FROM ${table}`).get() as { n: number }).n
}

export default function SettingsPage() {
  const instances = listInstances()
  const connected = instances.filter((i) => i.hasKey).length
  const hasToken = Boolean(env.ingestToken())
  const selfManage = canSelfManage()

  const curl = `curl -X POST http://127.0.0.1:3100/api/events \\
  -H "content-type: application/json" \\
  -H "x-ingest-token: <INGEST_TOKEN>" \\
  -d '{"level":"success","project":"acme-lead-intake","workflow":"Qualify inbound lead","message":"Lead qualified","data":{"leadId":"123"}}'`

  return (
    <>
      <PageHeader title="Settings" description="Connections, sync behavior, and the local database. Keys you save here are written to app/.env.local (gitignored), never to the database." />

      <section className="grid grid-main-side">
        <div className="card" id="instances">
          <div className="card-head">
            <h2>n8n instances</h2>
            <StatusBadge status={connected ? `${connected} connected` : 'none connected'} tone={connected ? 'ok' : 'warn'} />
          </div>
          <InstancesManager instances={instances} />
          <p className="small faint">
            Every connected instance is synced in the background. Executions link to a project when the workflow is named{' '}
            <code>[project-slug] …</code> or tagged with the slug. Syncing is read-only: it never changes anything in n8n.
          </p>
        </div>

        <div className="card">
          <div className="card-head">
            <h2>Sync & retention</h2>
          </div>
          <SettingsForm settings={getSettings()} />
          <hr className="divider" />
          <ArchivedDisplaySelect value={getArchivedDisplay()} />
        </div>
      </section>

      <section className="card" id="inbox">
        <div className="card-head">
          <h2>Webhook event inbox</h2>
          <StatusBadge status={hasToken ? 'token set' : 'token missing'} tone={hasToken ? 'ok' : 'warn'} />
        </div>
        <TokenControls hasToken={hasToken} />
        <p className="small muted">
          <strong>Easiest:</strong> call the <code>[shared-utilities] Report event to Control Center</code> sub-workflow from any workflow
          (import it from <code>app/n8n/report-event-to-control-center.json</code>; Execute Workflow node, &ldquo;Wait for Sub-Workflow Completion&rdquo; off). It needs one n8n credential: type <strong>Header Auth</strong>,
          named <code>Control Center ingest</code>, with Name <code>x-ingest-token</code> and Value = the token above.
        </p>
        <p className="small muted">
          Or call the endpoint yourself: <code>POST http://host.docker.internal:3100/api/events</code> from n8n in Docker on this PC
          (<code>http://127.0.0.1:3100</code> from this machine). <code>level</code> is one of info, success, warn, error.
        </p>
        <pre className="mono" style={{ margin: 0, padding: 'var(--s-4)', background: 'var(--field)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', overflowX: 'auto' }}>
          {curl}
        </pre>
      </section>

      <section className="card" id="trash">
        <div className="card-head">
          <h2>Recently deleted</h2>
          <span className="faint small">kept {TRASH_DAYS} days</span>
        </div>
        <TrashList items={listTrash()} />
      </section>

      <MaintenanceCard available={selfManage.ok} reason={selfManage.reason} log={readMaintenanceLog()} />

      <section className="card">
        <div className="card-head">
          <h2>Local database</h2>
          <span className="faint small">SQLite · no cloud</span>
        </div>
        <dl className="dl">
          <dt>File</dt>
          <dd className="mono">{DATABASE_PATH}</dd>
          <dt>Workspace</dt>
          <dd className="mono">{WORKSPACE_ROOT}</dd>
          <dt>Executions</dt>
          <dd>{count('executions').toLocaleString()}</dd>
          <dt>Events</dt>
          <dd>{count('events').toLocaleString()}</dd>
          <dt>Activity</dt>
          <dd>{count('activity').toLocaleString()}</dd>
        </dl>
      </section>
    </>
  )
}
