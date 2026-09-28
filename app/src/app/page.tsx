import Link from 'next/link'
import { Activity, AlertOctagon, ArrowRight, FolderKanban, Inbox, Percent, Plus, Workflow } from 'lucide-react'
import { ExecChart } from '@/components/exec-chart'
import { ActionButton } from '@/components/action-button'
import { EmptyState, PageHeader, ProjectStatusBadge, Stat, StatusBadge } from '@/components/ui'
import { syncNowAction } from './actions'
import { compact, percent, relativeTime } from '@/lib/format'
import { executionsPerDay, overviewCounts, recentActivity, recentErrors, recentEvents } from '@/lib/logs'
import { isConfigured } from '@/lib/n8n'
import { getInstanceFilter } from '@/lib/instance-filter'
import { listInstances } from '@/lib/instances'
import { listProjects } from '@/lib/projects'
import { workflowAlerts } from '@/lib/workflow-prefs'
import { getMeta } from '@/lib/settings'

export default async function OverviewPage() {
  const instanceFilter = await getInstanceFilter()
  const instanceName = instanceFilter ? listInstances().find((i) => i.id === instanceFilter)?.name : null
  const projects = listProjects()
  const counts = overviewCounts(instanceFilter)
  const perDay = executionsPerDay(14, instanceFilter)
  const errors = recentErrors(4, instanceFilter)
  const alerts = workflowAlerts(instanceFilter)
  const events = recentEvents(6)
  const activity = recentActivity(6)
  const configured = isConfigured()
  const lastSync = getMeta('lastSyncAt')
  const workflowCount = projects.reduce((n, p) => n + p.workflows.length, 0)
  const active = projects.filter((p) => !['archived', 'paused'].includes(p.status))

  return (
    <>
      <PageHeader
        eyebrow={
          <>
            {instanceName ? `Showing ${instanceName}` : 'All instances'} · {lastSync ? `last sync ${relativeTime(lastSync)}` : 'not synced yet'}
          </>
        }
        title="Overview"
        description="Projects, workflow health, and what just happened across the automation workspace."
        actions={
          <>
            {configured && (
              <ActionButton action={syncNowAction} pendingLabel="Syncing…">
                Sync n8n
              </ActionButton>
            )}
            <Link href="/projects/new" className="btn btn-primary">
              <Plus aria-hidden /> New project
            </Link>
          </>
        }
      />

      {alerts.length > 0 && (
        <div className="notice" data-tone="err" role="alert">
          <AlertOctagon aria-hidden />
          <div className="stack-sm" style={{ gap: 'var(--s-1)' }}>
            <strong>
              {alerts.length} workflow alert{alerts.length === 1 ? '' : 's'}
            </strong>
            {alerts.slice(0, 6).map((a) => (
              <div key={`${a.instanceId}:${a.workflowId}:${a.kind}`} className="small">
                <span>
                  {a.workflowName}: {a.message}
                </span>
                {(a.notes || a.runbookUrl) && (
                  <div className="muted" style={{ whiteSpace: 'pre-wrap', paddingLeft: 'var(--s-3)', borderLeft: '2px solid var(--border-strong)', marginTop: 'var(--s-1)' }}>
                    {a.notes}
                    {a.runbookUrl && (
                      <>
                        {a.notes ? ' ' : ''}
                        <a href={a.runbookUrl} target="_blank" rel="noreferrer">
                          Runbook →
                        </a>
                      </>
                    )}
                  </div>
                )}
              </div>
            ))}
            <Link href="/workflows" className="small">
              Open Workflows to fix or snooze →
            </Link>
          </div>
        </div>
      )}

      <section className="grid grid-stats" aria-label="Key numbers">
        <Stat icon={FolderKanban} label="Active projects" value={active.length} note={`${projects.length} total`} />
        <Stat icon={Workflow} label="Workflows in repo" value={workflowCount} note="exported JSON files" />
        <Stat icon={Activity} label="Executions · 24 h" value={compact(counts.executions24h)} note={`${counts.errors24h} failed`} />
        <Stat icon={Percent} label="Success rate · 7 d" value={percent(counts.successRate7d)} note="finished executions" />
        <Stat icon={Inbox} label="Events · 24 h" value={compact(counts.events24h)} note="from the webhook inbox" />
      </section>

      <section className="grid grid-main-side">
        <div className="card">
          <div className="card-head">
            <h2>Executions · last 14 days</h2>
            <Link href="/logs?tab=executions" className="card-link">
              All executions <ArrowRight size={14} aria-hidden />
            </Link>
          </div>
          {configured ? (
            <ExecChart data={perDay} />
          ) : (
            <EmptyState icon={Activity} title="Connect n8n to see executions" action={<Link href="/settings" className="btn">Open settings</Link>}>
              Add an n8n instance with its API key in Settings. No restart needed.
            </EmptyState>
          )}
        </div>

        <div className="card">
          <div className="card-head">
            <h2>Recent failures</h2>
            <Link href="/logs?tab=executions&level=error" className="card-link">
              View <ArrowRight size={14} aria-hidden />
            </Link>
          </div>
          {errors.length === 0 ? (
            <p className="muted small">No failed executions recorded. </p>
          ) : (
            <div className="list">
              {errors.map((e) => (
                <div key={e.id} className="list-item">
                  <AlertOctagon size={16} style={{ color: 'var(--err)', flex: 'none', marginTop: '0.2rem' }} aria-hidden />
                  <div className="list-body">
                    <span className="truncate">{e.workflow_name ?? `Workflow ${e.workflow_id}`}</span>
                    <span className="list-meta truncate">
                      {e.error_node ? `${e.error_node}: ` : ''}
                      {e.error_message ?? 'No details'}
                    </span>
                    <span className="list-meta">{relativeTime(e.started_at)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="grid grid-3">
        <div className="card">
          <div className="card-head">
            <h2>Projects</h2>
            <Link href="/projects" className="card-link">
              All projects <ArrowRight size={14} aria-hidden />
            </Link>
          </div>
          {projects.length === 0 ? (
            <p className="muted small">No projects yet. Create one to get started.</p>
          ) : (
            <div className="list">
              {projects.slice(0, 6).map((p) => (
                <Link key={p.slug} href={`/projects/${p.slug}`} className="list-item">
                  <div className="list-body">
                    <span className="truncate">{p.name}</span>
                    <span className="list-meta truncate">
                      {p.client || '—'} · {p.workflows.length} workflow{p.workflows.length === 1 ? '' : 's'}
                    </span>
                  </div>
                  <ProjectStatusBadge status={p.status} />
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <div className="card-head">
            <h2>Latest events</h2>
            <Link href="/logs?tab=events" className="card-link">
              Inbox <ArrowRight size={14} aria-hidden />
            </Link>
          </div>
          {events.length === 0 ? (
            <p className="muted small">
              No events yet. n8n workflows can POST to <code>/api/events</code> to log what happened. See Settings.
            </p>
          ) : (
            <div className="list">
              {events.map((e) => (
                <div key={e.id} className="list-item">
                  <StatusBadge status={e.level} />
                  <div className="list-body">
                    <span className="truncate">{e.message}</span>
                    <span className="list-meta">
                      {[e.project, e.workflow].filter(Boolean).join(' · ') || 'event'} · {relativeTime(e.received_at)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <div className="card-head">
            <h2>App activity</h2>
            <Link href="/logs?tab=activity" className="card-link">
              Activity log <ArrowRight size={14} aria-hidden />
            </Link>
          </div>
          {activity.length === 0 ? (
            <p className="muted small">Nothing logged yet.</p>
          ) : (
            <div className="list">
              {activity.map((a) => (
                <div key={a.id} className="list-item">
                  <StatusBadge status={a.level} />
                  <div className="list-body">
                    <span className="truncate">{a.message}</span>
                    <span className="list-meta">
                      {a.action} · {relativeTime(a.created_at)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </>
  )
}
