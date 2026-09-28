'use client'

import { useEffect, useState, useTransition } from 'react'
import { Loader2, Plus, ScanSearch, X } from 'lucide-react'
import { type NodeSample, inspectWorkflowOutputAction } from '@/app/actions'
import { type CaptureSpec, MAX_CAPTURES } from '@/lib/capture'
import { relativeTime } from '@/lib/format'

/**
 * Edits a workflow's captured fields. On open it reads the workflow and its latest execution from
 * n8n (read-only) and offers every node and field it output. Typing by hand is only the fallback
 * when n8n can't be reached.
 */
export function CaptureEditor({
  instanceId,
  workflowId,
  value,
  onChange,
}: {
  instanceId: string
  workflowId: string
  value: CaptureSpec[]
  onChange: (next: CaptureSpec[]) => void
}) {
  const [nodes, setNodes] = useState<NodeSample[] | null>(null)
  const [source, setSource] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [node, setNode] = useState('')
  const [path, setPath] = useState('')
  const [label, setLabel] = useState('')
  const [loading, start] = useTransition()

  const load = () =>
    start(async () => {
      setMessage(null)
      const r = await inspectWorkflowOutputAction(instanceId, workflowId)
      if (!r.ok) return setMessage(r.message ?? 'Could not load from n8n.')
      setNodes(r.nodes)
      setSource(r.executionId ? `run #${r.executionId}, ${relativeTime(r.startedAt ?? null)}` : null)
      setMessage(r.message ?? null)
      const firstRan = r.nodes.find((n) => n.ran && n.paths.length)
      if (!node && firstRan) setNode(firstRan.name)
    })

  // Load the nodes as soon as the settings dialog opens.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [instanceId, workflowId])

  const sample = nodes?.find((n) => n.name === node)
  const preview = sample?.paths.find((p) => p.path === path)?.preview
  const full = value.length >= MAX_CAPTURES
  const add = () => {
    if (!node.trim() || !path.trim()) return
    onChange([...value, { node: node.trim(), path: path.trim(), label: label.trim() || path.trim().split('.').pop() || path.trim() }])
    setPath('')
    setLabel('')
  }
  const missing = (c: CaptureSpec) => nodes && !nodes.some((n) => n.name === c.node)

  return (
    <div className="stack-sm">
      {value.length > 0 && (
        <div className="list">
          {value.map((c, i) => (
            <div key={`${c.node}|${c.path}|${i}`} className="list-item" style={{ alignItems: 'center' }}>
              <div className="list-body">
                <span>{c.label}</span>
                <span className="list-meta mono">
                  {c.node} › {c.path}
                  {missing(c) && <span style={{ color: 'var(--err)' }}> · node not in the workflow anymore</span>}
                </span>
              </div>
              <button
                type="button"
                className="btn btn-ghost btn-icon"
                aria-label={`Remove ${c.label}`}
                onClick={() => onChange(value.filter((_, j) => j !== i))}
              >
                <X aria-hidden />
              </button>
            </div>
          ))}
        </div>
      )}

      {!full && (
        <div className="stack-sm" style={{ gap: 'var(--s-2)' }}>
          <div className="row" style={{ gap: 'var(--s-2)' }}>
            {loading ? (
              <span className="faint small row" style={{ gap: 'var(--s-1)' }}>
                <Loader2 size={14} aria-hidden style={{ animation: 'spin 0.9s linear infinite' }} /> Loading nodes from n8n…
              </span>
            ) : (
              <>
                {source && <span className="faint small">Fields from the latest {source}</span>}
                <button type="button" className="btn btn-ghost" onClick={load}>
                  <ScanSearch aria-hidden /> Reload
                </button>
              </>
            )}
          </div>
          {message && <p className="small muted">{message}</p>}

          <div className="field">
            <label htmlFor="cap-node">Node</label>
            {nodes || loading ? (
              <select id="cap-node" disabled={loading} className="select" value={node} onChange={(e) => (setNode(e.target.value), setPath(''))}>
                <option value="">{loading ? 'Loading…' : 'Choose a node…'}</option>
                {(nodes ?? []).map((n) => (
                  <option key={n.name} value={n.name}>
                    {n.name} ({n.type}){n.ran ? '' : ' · didn’t run'}
                  </option>
                ))}
              </select>
            ) : (
              <input id="cap-node" className="input" value={node} onChange={(e) => setNode(e.target.value)} placeholder="Node name" />
            )}
          </div>

          <div className="field">
            <label htmlFor="cap-path">Field</label>
            {sample && sample.paths.length > 0 ? (
              <select id="cap-path" className="select mono" value={path} onChange={(e) => setPath(e.target.value)}>
                <option value="">Choose a field…</option>
                {sample.paths.map((p) => (
                  <option key={p.path} value={p.path}>
                    {p.path}
                  </option>
                ))}
              </select>
            ) : (
              <input id="cap-path" className="input mono" value={path} onChange={(e) => setPath(e.target.value)} placeholder="Field path" spellCheck={false} />
            )}
            {preview !== undefined ? (
              <span className="hint">
                Latest value: <span className="mono">{preview}</span>
              </span>
            ) : (
              <span className="hint">A dot path inside the node&rsquo;s output. Use [0] for the first item of a list, e.g. items[0].name.</span>
            )}
          </div>

          <div className="row" style={{ gap: 'var(--s-2)', alignItems: 'flex-end' }}>
            <div className="field" style={{ flex: '1 1 12rem' }}>
              <label htmlFor="cap-label">Column name (optional)</label>
              <input id="cap-label" className="input" value={label} maxLength={60} onChange={(e) => setLabel(e.target.value)} placeholder={path.split('.').pop() || 'Column name'} />
            </div>
            <button type="button" className="btn" onClick={add} disabled={!node.trim() || !path.trim()}>
              <Plus aria-hidden /> Add field
            </button>
          </div>
        </div>
      )}
      {full && <p className="faint small">Up to {MAX_CAPTURES} fields per workflow.</p>}
      {value.length > 0 && <p className="faint small">Saving re-reads the runs already logged, as long as n8n still has their data.</p>}
    </div>
  )
}
