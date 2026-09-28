'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMemo, useState, useTransition } from 'react'
import { BellOff, CheckCircle2, StickyNote, CircleDot, Download, Loader2, Power, PowerOff, RefreshCw, Search, Settings2, TriangleAlert, XCircle } from 'lucide-react'
import { importWorkflowsAction, refreshWorkflowsAction } from '@/app/actions'
import type { ImportResult, WorkflowRow } from '@/lib/workflow-import'
import { relativeTime } from '@/lib/format'
import { ConfirmDialog } from './confirm-dialog'
import { NewProjectDialog } from './new-project-dialog'
import { WorkflowSettingsDialog } from './workflow-settings-dialog'
import { PublishDialog } from './publish-dialog'
import type { WorkflowPrefs } from '@/lib/workflow-prefs'
import { matchesQuery } from '@/lib/search'

const MODE_TAG: Record<WorkflowPrefs['logMode'], string | null> = { all: null, errors: 'errors only', success: 'success only', off: 'not tracked' }

type Filter = 'all' | 'new' | 'changed' | 'uptodate' | 'unassigned' | 'attention'
type Sort = 'edited-desc' | 'edited-asc' | 'name'
type PublishedFilter = 'any' | 'published' | 'unpublished'
type ImportedFilter = 'any' | 'imported' | 'not-imported'

const SORTS: Record<Sort, (a: WorkflowRow, b: WorkflowRow) => number> = {
  'edited-desc': (a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''),
  'edited-asc': (a, b) => (a.updatedAt ?? '').localeCompare(b.updatedAt ?? ''),
  name: (a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true }),
}

const STATUS: Record<WorkflowRow['status'], { label: string; tone: 'info' | 'warn' | 'ok'; Icon: typeof CircleDot }> = {
  new: { label: 'New', tone: 'info', Icon: CircleDot },
  changed: { label: 'Changed in n8n', tone: 'warn', Icon: RefreshCw },
  uptodate: { label: 'Up to date', tone: 'ok', Icon: CheckCircle2 },
}

const keyOf = (r: WorkflowRow) => `${r.instanceId}:${r.id}`

export function WorkflowImporter({
  rows,
  projects,
  showInstance,
  prefs,
  alerts,
  globalRetentionDays,
  fetchedAt,
}: {
  rows: WorkflowRow[]
  projects: { slug: string; name: string }[]
  showInstance: boolean
  /** Per-workflow settings, keyed "instanceId:workflowId". */
  prefs: Record<string, WorkflowPrefs>
  /** Active alert messages, keyed "instanceId:workflowId". */
  alerts: Record<string, string[]>
  globalRetentionDays: number
  /** When the (cached) workflow list was read from n8n. */
  fetchedAt: number | null
}) {
  const router = useRouter()
  const [filter, setFilter] = useState<Filter>('all')
  const [q, setQ] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const [chosen, setChosen] = useState<Record<string, string>>({}) // id -> project for untracked rows
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [confirming, setConfirming] = useState(false)
  const [results, setResults] = useState<ImportResult[] | null>(null)
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set())
  const [pending, start] = useTransition()
  const [creatingFor, setCreatingFor] = useState<WorkflowRow | null>(null)
  const [settingsFor, setSettingsFor] = useState<WorkflowRow | null>(null)
  const [savedMsg, setSavedMsg] = useState<string | null>(null)
  const [publishFor, setPublishFor] = useState<WorkflowRow | null>(null)
  const [sort, setSort] = useState<Sort>('edited-desc')
  const [published, setPublished] = useState<PublishedFilter>('any')
  const [imported, setImported] = useState<ImportedFilter>('any')
  const [refreshing, startRefresh] = useTransition()

  const projectOf = (r: WorkflowRow): string => (r.file ? (r.project ?? '') : (chosen[keyOf(r)] ?? r.project ?? ''))
  const importable = (r: WorkflowRow) => r.status !== 'uptodate' && Boolean(projectOf(r))

  const needsAttention = (r: WorkflowRow) => Boolean(alerts[keyOf(r)]?.length) || (r.active && !r.errorWorkflow)
  const visible = useMemo(() => rows.filter((r) => showArchived || !r.archived), [rows, showArchived])
  const counts = useMemo(
    () => ({
      all: visible.length,
      new: visible.filter((r) => r.status === 'new').length,
      changed: visible.filter((r) => r.status === 'changed').length,
      uptodate: visible.filter((r) => r.status === 'uptodate').length,
      unassigned: visible.filter((r) => r.status === 'new' && !r.project).length,
      attention: visible.filter(needsAttention).length,
    }),
    [visible, alerts],
  )
  const shown = visible.filter((r) => {
    if (filter === 'attention') {
      if (!needsAttention(r)) return false
    } else if (filter === 'unassigned' ? !(r.status === 'new' && !r.project) : filter !== 'all' && r.status !== filter) return false
    if (published !== 'any' && r.active !== (published === 'published')) return false
    if (imported !== 'any' && Boolean(r.file) !== (imported === 'imported')) return false
    return matchesQuery(r.name, q)
  }).sort(SORTS[sort])
  const filtersOn = published !== 'any' || imported !== 'any' || sort !== 'edited-desc'

  const run = (keys: string[]) => {
    const items = rows.filter((r) => keys.includes(keyOf(r))).map((r) => ({ instanceId: r.instanceId, id: r.id, project: projectOf(r) || null }))
    setBusyIds(new Set(keys))
    start(async () => {
      const res = await importWorkflowsAction(items)
      setResults(res)
      setSelected(new Set())
      setBusyIds(new Set())
      router.refresh()
    })
  }

  const selectedRows = rows.filter((r) => selected.has(keyOf(r)))
  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  const selectableShown = shown.filter(importable)
  const allShownSelected = selectableShown.length > 0 && selectableShown.every((r) => selected.has(keyOf(r)))

  return (
    <div className="stack-sm" style={{ gap: 'var(--gap)' }}>
      <nav className="tabs" aria-label="Filter workflows">
        {(
          [
            ['all', 'All'],
            ['new', 'New'],
            ['changed', 'Changed'],
            ['uptodate', 'Up to date'],
            ['unassigned', 'Unassigned'],
            ['attention', 'Needs attention'],
          ] as [Filter, string][]
        ).map(([id, label]) => (
          <button key={id} type="button" className="tab" aria-current={filter === id ? 'page' : undefined} onClick={() => setFilter(id)}>
            {label} <span className="count">{counts[id]}</span>
          </button>
        ))}
      </nav>

      <div className="toolbar">
        <div style={{ position: 'relative', flex: '1 1 14rem', maxWidth: '24rem' }}>
          <Search
            aria-hidden
            style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', width: '1rem', height: '1rem', color: 'var(--text-3)' }}
          />
          <label className="sr-only" htmlFor="wf-q">
            Search workflows
          </label>
          <input id="wf-q" className="input" style={{ paddingLeft: '2.25rem', maxWidth: 'none' }} placeholder="Search workflows…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <label className="check">
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> Show archived
        </label>
        <span className="spacer" />
        <button
          type="button"
          className="btn"
          onClick={() =>
            startRefresh(async () => {
              await refreshWorkflowsAction()
              router.refresh()
            })
          }
          disabled={pending || refreshing}
          title={fetchedAt ? `Workflow list read from n8n ${relativeTime(new Date(fetchedAt).toISOString())}` : undefined}
        >
          <RefreshCw aria-hidden style={refreshing ? { animation: 'spin 0.9s linear infinite' } : undefined} /> {refreshing ? 'Refreshing…' : 'Refresh'}
        </button>
        <button type="button" className="btn btn-primary" disabled={!selected.size || pending} onClick={() => setConfirming(true)}>
          {pending && busyIds.size > 1 ? <Loader2 aria-hidden style={{ animation: 'spin 0.9s linear infinite' }} /> : <Download aria-hidden />}
          Import selected ({selected.size})
        </button>
      </div>

      <div className="toolbar filter-bar" aria-label="Sort and filter">
        <label className="filter">
          <span>Sort</span>
          <select className="select" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
            <option value="edited-desc">Latest edited</option>
            <option value="edited-asc">Oldest edited</option>
            <option value="name">Name A–Z</option>
          </select>
        </label>
        <label className="filter">
          <span>In n8n</span>
          <select className="select" value={published} onChange={(e) => setPublished(e.target.value as PublishedFilter)}>
            <option value="any">Published or not</option>
            <option value="published">Published</option>
            <option value="unpublished">Not published</option>
          </select>
        </label>
        <label className="filter">
          <span>Backup</span>
          <select className="select" value={imported} onChange={(e) => setImported(e.target.value as ImportedFilter)}>
            <option value="any">Imported or not</option>
            <option value="imported">Imported to a project</option>
            <option value="not-imported">Not imported</option>
          </select>
        </label>
        {filtersOn && (
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              setSort('edited-desc')
              setPublished('any')
              setImported('any')
            }}
          >
            Reset
          </button>
        )}
        <span className="spacer" />
        <span className="faint small">
          {shown.length} of {visible.length} shown
          {fetchedAt ? ` · read from n8n ${relativeTime(new Date(fetchedAt).toISOString())}` : ''}
        </span>
      </div>

      {savedMsg && (
        <div className="notice" data-tone="ok" role="status">
          <CheckCircle2 aria-hidden />
          <div className="row" style={{ flex: 1, justifyContent: 'space-between' }}>
            <span>{savedMsg}</span>
            <button type="button" className="btn btn-ghost" onClick={() => setSavedMsg(null)}>
              Dismiss
            </button>
          </div>
        </div>
      )}

      {results && (
        <div className="card" role="status">
          <div className="card-head">
            <h2>Import results</h2>
            <button type="button" className="btn btn-ghost" onClick={() => setResults(null)}>
              Dismiss
            </button>
          </div>
          <div className="list">
            {results.map((r) => (
              <div key={`${r.instanceId}:${r.id}`} className="list-item">
                {r.ok ? (
                  <CheckCircle2 size={16} style={{ color: 'var(--ok)', flex: 'none', marginTop: '0.2rem' }} aria-hidden />
                ) : (
                  <XCircle size={16} style={{ color: 'var(--err)', flex: 'none', marginTop: '0.2rem' }} aria-hidden />
                )}
                <div className="list-body">
                  <span>{r.name}</span>
                  <span className="list-meta">
                    {r.message}
                    {r.ok && r.project && r.file ? ` → n8n workflows/${r.project}/workflows/${r.file}` : ''}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {shown.length === 0 ? (
        <div className="empty">
          <h3>Nothing here</h3>
          <p>No workflows match this filter.</p>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: '2.5rem' }}>
                  <input
                    type="checkbox"
                    aria-label="Select all importable workflows shown"
                    checked={allShownSelected}
                    disabled={!selectableShown.length}
                    onChange={() =>
                      setSelected((s) => {
                        const n = new Set(s)
                        if (allShownSelected) selectableShown.forEach((r) => n.delete(keyOf(r)))
                        else selectableShown.forEach((r) => n.add(keyOf(r)))
                        return n
                      })
                    }
                  />
                </th>
                <th>Workflow</th>
                <th>In n8n</th>
                <th>Backup</th>
                <th>Project</th>
                <th>Edited in n8n</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => {
                const st = STATUS[r.status]
                const proj = projectOf(r)
                const busy = busyIds.has(keyOf(r)) && pending
                return (
                  <tr key={keyOf(r)}>
                    <td>
                      <input
                        type="checkbox"
                        aria-label={`Select ${r.name}`}
                        checked={selected.has(keyOf(r))}
                        disabled={!importable(r)}
                        onChange={() => toggle(keyOf(r))}
                      />
                    </td>
                    <td className="wide">
                      <div>{r.name}</div>
                      <div className="row" style={{ gap: 'var(--s-1)', marginTop: 'var(--s-1)' }}>
                        {showInstance && <span className="tag">{r.instanceName}</span>}
                        {r.archived && <span className="tag">archived</span>}
                        {(() => {
                          const p = prefs[keyOf(r)]
                          if (!p) return null
                          const snoozed = p.snoozedUntil && Date.parse(p.snoozedUntil) > Date.now()
                          return (
                            <>
                              {MODE_TAG[p.logMode] && <span className="tag">{MODE_TAG[p.logMode]}</span>}
                              {p.ignoreManual && p.logMode !== 'off' && <span className="tag">test runs ignored</span>}
                              {p.excludeFromStats && <span className="tag">not in stats</span>}
                              {p.captures.length > 0 && (
                                <span className="tag" title={p.captures.map((c) => `${c.label}: ${c.node} › ${c.path}`).join(' · ')}>
                                  {p.captures.length} captured field{p.captures.length === 1 ? '' : 's'}
                                </span>
                              )}
                              {(p.notes || p.runbookUrl) && (
                                <button
                                  type="button"
                                  className="tag"
                                  title={p.notes ?? p.runbookUrl ?? undefined}
                                  onClick={() => setSettingsFor(r)}
                                  style={{ cursor: 'pointer' }}
                                >
                                  <StickyNote size={12} aria-hidden /> note
                                </button>
                              )}
                              {snoozed && (
                                <span className="tag" title={`Snoozed until ${new Date(p.snoozedUntil!).toLocaleString()}`}>
                                  <BellOff size={12} aria-hidden /> snoozed
                                </span>
                              )}
                            </>
                          )
                        })()}
                        {r.active && !r.errorWorkflow && (
                          <span className="badge" data-tone="warn" title="Published, but no error workflow is set in its n8n settings">
                            <TriangleAlert aria-hidden />
                            No error workflow
                          </span>
                        )}
                        {alerts[keyOf(r)]?.map((a) => (
                          <span key={a} className="badge" data-tone="err">
                            <TriangleAlert aria-hidden />
                            {a}
                          </span>
                        ))}
                        {r.tags.map((t) => (
                          <span key={t} className="tag">
                            {t}
                          </span>
                        ))}
                        <span className="faint small">{r.nodeCount} nodes</span>
                      </div>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="badge badge-button"
                        data-tone={r.active ? 'ok' : undefined}
                        onClick={() => setPublishFor(r)}
                        title={r.active ? 'Published in n8n. Click to unpublish.' : 'Not published in n8n. Click to publish.'}
                      >
                        {r.active ? <Power aria-hidden /> : <PowerOff aria-hidden />}
                        {r.active ? 'Published' : 'Not published'}
                      </button>
                    </td>
                    <td>
                      <span className="badge" data-tone={st.tone}>
                        <st.Icon aria-hidden />
                        {st.label}
                      </span>
                    </td>
                    <td className="small" style={{ minWidth: '13rem' }}>
                      {r.file ? (
                        <>
                          <Link href={`/projects/${r.project}`}>{r.project}</Link>
                          <div className="faint mono">{r.file}</div>
                        </>
                      ) : (
                        <div className="stack-sm" style={{ gap: 'var(--s-1)' }}>
                          <select
                            className="select"
                            aria-label={`Project for ${r.name}`}
                            value={proj}
                            onChange={(e) => {
                              if (e.target.value === '__new__') return setCreatingFor(r)
                              setChosen((c) => ({ ...c, [keyOf(r)]: e.target.value }))
                            }}
                          >
                            <option value="__new__">＋ Add new project…</option>
                            <option value="">Choose a project…</option>
                            {projects.map((p) => (
                              <option key={p.slug} value={p.slug}>
                                {p.slug}
                              </option>
                            ))}
                          </select>
                          {r.project && !chosen[keyOf(r)] && <span className="faint">auto-matched</span>}
                          {!proj && r.suggestedSlug && (
                            <Link className="faint" href={`/projects/new?slug=${encodeURIComponent(r.suggestedSlug)}`}>
                              Create project &ldquo;{r.suggestedSlug}&rdquo;
                            </Link>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="small nowrap">{relativeTime(r.updatedAt)}</td>
                    <td className="nowrap">
                      <button
                        type="button"
                        className="btn btn-ghost btn-icon"
                        onClick={() => setSettingsFor(r)}
                        aria-label={`Settings for ${r.name}`}
                        title="Workflow settings"
                      >
                        <Settings2 aria-hidden />
                      </button>
                      {r.status !== 'uptodate' && (
                        <button type="button" className="btn" disabled={!proj || pending} onClick={() => run([keyOf(r)])} title={!proj ? 'Choose a project first' : undefined}>
                          {busy ? <Loader2 aria-hidden style={{ animation: 'spin 0.9s linear infinite' }} /> : <Download aria-hidden />}
                          {r.status === 'changed' ? 'Update' : 'Import'}
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {creatingFor && (
        <NewProjectDialog
          workflow={{ instanceId: creatingFor.instanceId, id: creatingFor.id, name: creatingFor.name, suggestedSlug: creatingFor.suggestedSlug }}
          existingSlugs={projects.map((p) => p.slug)}
          onClose={() => setCreatingFor(null)}
          onDone={(result, message) => {
            setCreatingFor(null)
            setResults([result ?? { id: creatingFor.id, name: creatingFor.name, ok: false, message }])
            router.refresh()
          }}
        />
      )}

      {settingsFor && (
        <WorkflowSettingsDialog
          workflow={{
            instanceId: settingsFor.instanceId,
            instanceName: settingsFor.instanceName,
            id: settingsFor.id,
            name: settingsFor.name,
            active: settingsFor.active,
            archived: settingsFor.archived,
            errorWorkflow: settingsFor.errorWorkflow,
            errorWorkflowName: rows.find((x) => x.instanceId === settingsFor.instanceId && x.id === settingsFor.errorWorkflow)?.name ?? null,
          }}
          prefs={prefs[keyOf(settingsFor)] ?? null}
          globalRetentionDays={globalRetentionDays}
          onClose={() => setSettingsFor(null)}
          onSaved={(message) => {
            setSettingsFor(null)
            setSavedMsg(`${settingsFor.name}: ${message}`)
            router.refresh()
          }}
        />
      )}

      {publishFor && (
        <PublishDialog
          workflow={publishFor}
          onClose={() => setPublishFor(null)}
          onDone={(message) => {
            setPublishFor(null)
            setSavedMsg(`${publishFor.name}: ${message}`)
            router.refresh()
          }}
        />
      )}

      {confirming && (
        <ConfirmDialog
          open
          title={`Import ${selectedRows.length} workflow${selectedRows.length === 1 ? '' : 's'}?`}
          confirmLabel="Import"
          onConfirm={() => {
            setConfirming(false)
            run(selectedRows.map(keyOf))
          }}
          onCancel={() => setConfirming(false)}
        >
          <p>Each one is saved as a clean backup file in its project&rsquo;s workflows/ folder and noted in that project&rsquo;s changelog:</p>
          <ul style={{ margin: 0, paddingLeft: 'var(--s-5)' }}>
            {selectedRows.slice(0, 8).map((r) => (
              <li key={keyOf(r)}>
                {r.name} → <strong>{projectOf(r)}</strong>
                {r.status === 'changed' ? ' (update)' : ''}
              </li>
            ))}
            {selectedRows.length > 8 && <li>…and {selectedRows.length - 8} more</li>}
          </ul>
          <p>Nothing changes in n8n. Workflows with a password or key typed directly into a node are skipped for safety.</p>
        </ConfirmDialog>
      )}
    </div>
  )
}
