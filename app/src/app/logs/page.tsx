import Link from 'next/link'
import type { Metadata } from 'next'
import { Activity, Inbox, ScrollText } from 'lucide-react'
import { ActionButton } from '@/components/action-button'
import { LogToolbar } from '@/components/log-toolbar'
import { ExecutionFocus } from '@/components/execution-focus'
import { EmptyState, PageHeader, Pager, StatusBadge } from '@/components/ui'
import { syncNowAction } from '../actions'
import { dateTime, duration, relativeTime } from '@/lib/format'
import { LEVELS, knownProjectsInLogs, listActivity, listEvents, listExecutions } from '@/lib/logs'
import { isConfigured } from '@/lib/n8n'
import { getInstanceFilter } from '@/lib/instance-filter'
import { listInstances } from '@/lib/instances'
import { PausedInstancesNotice } from '@/components/paused-instances-notice'
import { listProjects } from '@/lib/projects'
import { listWorkflowPrefs } from '@/lib/workflow-prefs'
import { parseCaptured } from '@/lib/capture'

export const metadata: Metadata = { title: 'Logs' }

const TABS = [
  { id: 'executions', label: 'n8n executions', icon: Activity },
  { id: 'events', label: 'Event inbox', icon: Inbox },
  { id: 'activity', label: 'App activity', icon: ScrollText },
] as const
type Tab = (typeof TABS)[number]['id']

const EXEC_STATUSES = ['success', 'failed', 'error', 'crashed', 'running', 'waiting', 'canceled']

function pretty(json: string | null): string | null {
  if (!json) return null
  try {
    return JSON.stringify(JSON.parse(json), null, 2)
  } catch {
    return json
  }
}

export default async function LogsPage(props: PageProps<'/logs'>) {
  const sp = await props.searchParams
  const get = (k: string) => (typeof sp[k] === 'string' ? (sp[k] as string) : undefined)
  const tab: Tab = (TABS.find((t) => t.id === get('tab'))?.id ?? 'executions') as Tab
  const instances = listInstances()
  const requestedInstance = get('instance')
  const instanceFilter = requestedInstance && instances.some(i => i.id === requestedInstance) ? requestedInstance : await getInstanceFilter()
  const instanceNames = Object.fromEntries(instances.map((i) => [i.id, `${i.name}${i.paused ? ' (Paused)' : ''}`]))
  const showInstance = !instanceFilter && instances.filter((i) => i.hasKey).length > 1
  const filters = { q: get('q'), level: get('level'), project: get('project'), page: Number(get('page')) || 1, instance: instanceFilter, day: get('day'), focus: get('focus') }
  const projects = [...new Set([...listProjects().map((p) => p.slug), ...knownProjectsInLogs()])].sort()

  const href = (patch: Record<string, string | number | undefined>) => {
    const p = new URLSearchParams()
    for (const [k, v] of Object.entries({ tab, q: filters.q, level: filters.level, project: filters.project, day: filters.day, instance: requestedInstance, ...patch }))
      if (v !== undefined && v !== '') p.set(k, String(v))
    return `/logs?${p.toString()}`
  }

  return (
    <>
      <PageHeader
        title="Logs"
        description="n8n executions synced from your instance, events posted by workflows, and everything this app did."
        actions={
          tab === 'executions' && isConfigured() && !instances.find(i => i.id === instanceFilter)?.paused ? (
            <ActionButton action={syncNowAction} pendingLabel="Syncing…">
              Sync now
            </ActionButton>
          ) : undefined
        }
      />

      <PausedInstancesNotice instances={instances} filter={instanceFilter} />
      <nav className="tabs" aria-label="Log type">
        {TABS.map(({ id, label, icon: Icon }) => (
          <Link key={id} href={`/logs?tab=${id}`} className="tab" aria-current={tab === id ? 'page' : undefined}>
            <Icon size={15} aria-hidden /> {label}
          </Link>
        ))}
      </nav>

      <LogToolbar
        key={tab}
        levels={tab === 'executions' ? EXEC_STATUSES : LEVELS}
        levelLabel={tab === 'executions' ? 'Statuses' : 'Levels'}
        projects={projects}
      />

      {tab === 'executions' && <FilteredNote instance={instanceFilter} />}
      {tab === 'executions' && (filters.day || requestedInstance) && <p className="small muted">{filters.day ? `Day: ${filters.day} UTC. ` : ''}{requestedInstance && instanceFilter ? `Instance: ${instanceNames[instanceFilter]}. ` : ''}<Link href={href({ day: undefined, instance: undefined })}>Clear date and linked instance</Link></p>}
      {tab === 'executions' && <Executions filters={filters} href={href} instanceNames={instanceNames} showInstance={showInstance} />}
      {tab === 'events' && <Events filters={filters} href={href} />}
      {tab === 'activity' && <ActivityLog filters={filters} href={href} />}
    </>
  )
}

type Props = {
  filters: { q?: string; level?: string; project?: string; page: number; instance?: string | null; day?: string; focus?: string }
  href: (patch: Record<string, string | number | undefined>) => string
}

function Executions({
  filters,
  href,
  instanceNames,
  showInstance,
}: Props & { instanceNames: Record<string, string>; showInstance: boolean }) {
  const data = listExecutions(filters)
  const paused = filters.instance ? listInstances().find(i => i.id === filters.instance)?.paused : !isConfigured() && listInstances().some(i => i.hasKey && i.paused)
  if (data.total === 0)
    return (
      <EmptyState icon={Activity} title={paused || isConfigured() ? 'No executions match' : 'No n8n instance connected'} action={paused || !isConfigured() ? <Link className="btn" href="/settings#instances">{paused ? 'Resume in Settings' : 'Open settings'}</Link> : undefined}>
        {paused ? 'No saved executions match these filters. Resume the instance in Settings to sync new executions.' : isConfigured()
          ? 'Adjust the filters, or run a sync to pull the latest executions.'
          : 'Add an n8n instance with its API key in Settings to sync executions.'}
      </EmptyState>
    )
  return (
    <div className="stack-sm">
      {filters.focus && filters.instance && <ExecutionFocus execution={filters.focus} instance={filters.instance} />}
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Status</th>
              <th>Workflow</th>
              {showInstance && <th>Instance</th>}
              <th>Project</th>
              <th>Started</th>
              <th className="num">Duration</th>
              <th>Error</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((e) => (
              <tr key={`${e.instance_id}:${e.id}`} data-execution={e.id} data-instance={e.instance_id}>
                <td>
                  <StatusBadge status={e.status} />
                </td>
                <td className="wide">
                  <div>{e.workflow_name ?? `Workflow ${e.workflow_id}`}</div>
                  <div className="faint small mono">
                    #{e.id} · {e.mode ?? '—'}
                  </div>
                  {parseCaptured(e.captured).map((c) => (
                    <div key={c.label} className="small" style={{ marginTop: 'var(--s-1)', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                      <span className="faint">{c.label}: </span>
                      {c.value ?? <span className="faint">({c.note ?? 'empty'})</span>}
                    </div>
                  ))}
                </td>
                {showInstance && <td className="small nowrap">{instanceNames[e.instance_id] ?? e.instance_id}</td>}
                <td className="small nowrap">{e.project ?? "—"}</td>
                <td className="small nowrap" title={dateTime(e.started_at)}>
                  {relativeTime(e.started_at)}
                </td>
                <td className="num small nowrap">{duration(e.duration_ms)}</td>
                <td className="msg small">
                  {e.error_message ? (
                    <>
                      {e.error_node && <strong>{e.error_node}: </strong>}
                      {e.error_message}
                    </>
                  ) : (
                    <span className="faint">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pager page={data.page} pageSize={data.pageSize} total={data.total} href={(page) => href({ page })} />
    </div>
  )
}

function Events({ filters, href }: Props) {
  const data = listEvents(filters)
  if (data.total === 0)
    return (
      <EmptyState icon={Inbox} title="No events" action={<Link className="btn" href="/settings#inbox">How to send events</Link>}>
        Workflows POST JSON to <code>/api/events</code> with the <code>x-ingest-token</code> header. Events appear here instantly.
      </EmptyState>
    )
  return (
    <div className="stack-sm">
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Level</th>
              <th>Message</th>
              <th>Project · workflow</th>
              <th>Received</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((e) => {
              const payload = pretty(e.data)
              return (
                <tr key={e.id}>
                  <td>
                    <StatusBadge status={e.level} />
                  </td>
                  <td className="msg">
                    {e.message}
                    {payload && (
                      <details>
                        <summary>data</summary>
                        <pre>{payload}</pre>
                      </details>
                    )}
                  </td>
                  <td className="small">{[e.project, e.workflow].filter(Boolean).join(' · ') || '—'}</td>
                  <td className="small nowrap" title={dateTime(e.received_at)}>
                    {relativeTime(e.received_at)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <Pager page={data.page} pageSize={data.pageSize} total={data.total} href={(page) => href({ page })} />
    </div>
  )
}

function ActivityLog({ filters, href }: Props) {
  const data = listActivity(filters)
  if (data.total === 0) return <EmptyState icon={ScrollText} title="No activity matches">Adjust the filters.</EmptyState>
  return (
    <div className="stack-sm">
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Level</th>
              <th>Action</th>
              <th>Message</th>
              <th>Project</th>
              <th>When</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((a) => {
              const meta = pretty(a.meta)
              return (
                <tr key={a.id}>
                  <td>
                    <StatusBadge status={a.level} />
                  </td>
                  <td className="mono">{a.action}</td>
                  <td className="msg">
                    {a.message}
                    {meta && (
                      <details>
                        <summary>details</summary>
                        <pre>{meta}</pre>
                      </details>
                    )}
                  </td>
                  <td className="small">{a.project ?? '—'}</td>
                  <td className="small nowrap" title={dateTime(a.created_at)}>
                    {relativeTime(a.created_at)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <Pager page={data.page} pageSize={data.pageSize} total={data.total} href={(page) => href({ page })} />
    </div>
  )
}

/** Says when per-workflow settings keep some runs out of this log, so nothing disappears silently. */
function FilteredNote({ instance }: { instance: string | null }) {
  const n = listWorkflowPrefs(instance).filter((p) => p.logMode !== 'all' || p.ignoreManual).length
  if (!n) return null
  return (
    <p className="small faint">
      {n} workflow{n === 1 ? ' logs' : 's log'} only some runs (per-workflow settings).{' '}
      <Link href="/workflows">Change on Workflows →</Link>
    </p>
  )
}
