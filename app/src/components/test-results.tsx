'use client'

import { useRef, useState, useTransition } from 'react'
import { ChevronDown, ChevronRight, FileText, FlaskConical, Loader2, Plus, Upload, X } from 'lucide-react'
import { type ActionState, addToTestRunAction, createTestRunAction, deleteTestFileAction } from '@/app/actions'
import type { Outcome, RunFile } from '@/lib/test-results'
import { relativeTime } from '@/lib/format'
import { ConfirmDialog } from './confirm-dialog'

export type RunView = { id: string; title: string; date: string | null; outcome: Outcome; files: RunFile[]; modified: string; body: React.ReactNode }

const OUTCOME: Record<Outcome, { label: string; tone: string }> = {
  pass: { label: 'Pass', tone: 'ok' },
  fail: { label: 'Fail', tone: 'err' },
  unknown: { label: 'No outcome', tone: 'neutral' },
}

function bytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

function Message({ state }: { state: ActionState }) {
  if (!state) return null
  return (
    <span className="small" role={state.ok ? 'status' : 'alert'} style={{ color: state.ok ? 'var(--text-2)' : 'var(--err)' }}>
      {state.message}
    </span>
  )
}

const spin = { animation: 'spin 0.9s linear infinite' }

/** Text + files form, used both for a new run and for adding to an existing one. Files can be dropped or pasted (screenshots). */
function EvidenceForm({
  fields,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  fields?: React.ReactNode
  submitLabel: string
  onSubmit: (form: FormData) => Promise<ActionState>
  onCancel: () => void
}) {
  const [files, setFiles] = useState<File[]>([])
  const [message, setMessage] = useState<ActionState>(null)
  const [dragging, setDragging] = useState(false)
  const [busy, start] = useTransition()
  const input = useRef<HTMLInputElement>(null)
  const add = (list: FileList | File[]) => setFiles((prev) => [...prev, ...Array.from(list).filter((f) => f.size > 0)])

  return (
    <form
      className="stack-sm"
      onSubmit={(e) => {
        e.preventDefault()
        const form = new FormData(e.currentTarget)
        form.delete('files')
        for (const f of files) form.append('files', f)
        start(async () => {
          const r = await onSubmit(form)
          setMessage(r)
          if (r?.ok) {
            setFiles([])
            onCancel()
          }
        })
      }}
      onPaste={(e) => {
        if (e.clipboardData.files.length) {
          e.preventDefault()
          add(e.clipboardData.files)
        }
      }}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes('Files')) return
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false)
      }}
      onDrop={(e) => {
        e.preventDefault()
        setDragging(false)
        add(e.dataTransfer.files)
      }}
      style={{
        padding: 'var(--s-3)',
        borderRadius: 'var(--radius-sm)',
        border: '1px solid var(--border)',
        outline: dragging ? '2px dashed var(--border-strong)' : '2px dashed transparent',
        outlineOffset: 'var(--s-1)',
      }}
    >
      {fields}
      <textarea
        name="notes"
        className="textarea"
        aria-label="Notes"
        rows={5}
        placeholder="What you tested, what happened, anything you noticed. Markdown works. No passwords or API keys."
      />
      <div className="row" style={{ gap: 'var(--s-2)', flexWrap: 'wrap' }}>
        <button type="button" className="btn btn-ghost" onClick={() => input.current?.click()} disabled={busy}>
          <Upload aria-hidden /> Add files
        </button>
        <span className="faint small">or drop / paste screenshots here (up to 25 MB each)</span>
        <input
          ref={input}
          type="file"
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files) add(e.target.files)
            e.target.value = ''
          }}
        />
      </div>
      {files.length > 0 && (
        <div className="row small" style={{ gap: 'var(--s-2)', flexWrap: 'wrap' }}>
          {files.map((f, i) => (
            <span key={`${f.name}-${i}`} className="badge" data-tone="neutral">
              {f.name}
              <button
                type="button"
                className="btn btn-ghost btn-icon"
                aria-label={`Don't add ${f.name}`}
                onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}
                style={{ height: 18, width: 18 }}
              >
                <X aria-hidden />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="row">
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? (
            <>
              <Loader2 aria-hidden style={spin} /> Saving…
            </>
          ) : (
            submitLabel
          )}
        </button>
        <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        <Message state={message} />
      </div>
    </form>
  )
}

function Run({ slug, run, open, onToggle }: { slug: string; run: RunView; open: boolean; onToggle: () => void }) {
  const [adding, setAdding] = useState(false)
  const [removing, setRemoving] = useState<string | null>(null)
  const [message, setMessage] = useState<ActionState>(null)
  const [busy, start] = useTransition()
  const o = OUTCOME[run.outcome]
  const fileUrl = (name: string) => `/api/projects/${slug}/test-files/${run.id}/${encodeURIComponent(name)}`
  const images = run.files.filter((f) => f.image)

  return (
    <div className="list-item" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 'var(--s-3)' }}>
      <button type="button" className="row" onClick={onToggle} aria-expanded={open} style={{ gap: 'var(--s-2)', textAlign: 'left', background: 'none', border: 0, padding: 0, color: 'inherit', cursor: 'pointer' }}>
        {open ? <ChevronDown size={14} aria-hidden /> : <ChevronRight size={14} aria-hidden />}
        <span className="list-body">
          <span className="truncate">{run.title}</span>
          <span className="list-meta">
            {run.date ?? run.id} · {run.files.length} file{run.files.length === 1 ? '' : 's'} · updated {relativeTime(run.modified)}
          </span>
        </span>
        <span className="badge" data-tone={o.tone}>
          {o.label}
        </span>
      </button>

      {open && (
        <div className="stack-sm">
          {run.body}
          {images.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 'var(--s-2)' }}>
              {images.map((f) => (
                <a key={f.name} href={fileUrl(f.name)} target="_blank" rel="noreferrer" title={f.name}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={fileUrl(f.name)} alt={f.name} loading="lazy" style={{ width: '100%', aspectRatio: '4 / 3', objectFit: 'cover', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }} />
                </a>
              ))}
            </div>
          )}
          {run.files.length > 0 && (
            <div className="list">
              {run.files.map((f) => (
                <div key={f.name} className="list-item" style={{ alignItems: 'center' }}>
                  <FileText size={14} aria-hidden />
                  <div className="list-body">
                    <a href={fileUrl(f.name)} target="_blank" rel="noreferrer" className="truncate small">
                      {f.name}
                    </a>
                    <span className="list-meta">
                      {bytes(f.size)} · {relativeTime(f.modified)}
                    </span>
                  </div>
                  <button type="button" className="btn btn-ghost btn-icon" aria-label={`Remove ${f.name}`} onClick={() => setRemoving(f.name)} disabled={busy}>
                    <X aria-hidden />
                  </button>
                </div>
              ))}
            </div>
          )}
          {adding ? (
            <EvidenceForm submitLabel="Add to this test" onSubmit={(form) => addToTestRunAction(slug, run.id, form)} onCancel={() => setAdding(false)} />
          ) : (
            <div className="row">
              <button type="button" className="btn btn-ghost" onClick={() => (setAdding(true), setMessage(null))}>
                <Plus aria-hidden /> Add screenshots, files, or a note
              </button>
              <Message state={message} />
            </div>
          )}
        </div>
      )}

      <ConfirmDialog
        open={removing !== null}
        title="Remove this file?"
        confirmLabel="Remove file"
        tone="warn"
        onConfirm={() => {
          const name = removing
          setRemoving(null)
          if (name) start(async () => setMessage(await deleteTestFileAction(slug, run.id, name)))
        }}
        onCancel={() => setRemoving(null)}
      >
        <p>
          <strong>{removing}</strong> is deleted from <code>test-results/{run.id}/</code>. If it was committed to the project&rsquo;s git repo, it stays in
          the history there.
        </p>
      </ConfirmDialog>
    </div>
  )
}

/** The project's test results: one row per run in test-results/, expandable, plus a form to add your own. */
export function TestResults({ slug, runs, workflows }: { slug: string; runs: RunView[]; workflows: string[] }) {
  const [creating, setCreating] = useState(false)
  const [open, setOpen] = useState<string | null>(runs[0]?.id ?? null)

  return (
    <div className="card">
      <div className="card-head">
        <h2>Test results</h2>
        <span className="row" style={{ gap: 'var(--s-3)' }}>
          <span className="faint small mono">test-results/</span>
          {!creating && (
            <button type="button" className="btn btn-ghost" onClick={() => setCreating(true)}>
              <Plus aria-hidden /> Add test result
            </button>
          )}
        </span>
      </div>

      <div className="stack-sm">
        {creating && (
          <EvidenceForm
            submitLabel="Save test result"
            onSubmit={(form) => createTestRunAction(slug, form)}
            onCancel={() => setCreating(false)}
            fields={
              <>
                <input name="title" className="input" aria-label="Test name" placeholder="Test name, e.g. Follow-up 2 in draft mode" required maxLength={120} autoFocus />
                <div className="row" style={{ gap: 'var(--s-2)', flexWrap: 'wrap' }}>
                  <input name="workflow" className="input" aria-label="Workflow" list={`wf-${slug}`} placeholder="Workflow (optional), e.g. 01-follow-up" maxLength={120} style={{ flex: '1 1 200px' }} />
                  <datalist id={`wf-${slug}`}>
                    {workflows.map((w) => (
                      <option key={w} value={w} />
                    ))}
                  </datalist>
                  <select name="outcome" className="select" aria-label="Outcome" defaultValue="pass" style={{ flex: '0 1 160px' }}>
                    <option value="pass">Pass</option>
                    <option value="fail">Fail</option>
                    <option value="">No outcome yet</option>
                  </select>
                </div>
              </>
            }
          />
        )}

        {runs.length === 0 && !creating ? (
          <p className="faint small">
            <FlaskConical size={14} aria-hidden style={{ verticalAlign: 'middle' }} /> No test results yet. Agents save one after each test run, and you can add
            your own: screenshots, outputs, or notes.
          </p>
        ) : (
          <div className="list">
            {runs.map((r) => (
              <Run key={r.id} slug={slug} run={r} open={open === r.id} onToggle={() => setOpen(open === r.id ? null : r.id)} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
