'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { FileText, Loader2, Paperclip, Pencil, Upload, X } from 'lucide-react'
import { type ActionState, deleteBriefFileAction, saveBriefAction, uploadBriefFilesAction } from '@/app/actions'
import type { BriefFile, BriefState } from '@/lib/brief'
import { relativeTime } from '@/lib/format'
import { ConfirmDialog } from './confirm-dialog'
import { DocumentPreview } from './document-preview'

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

/**
 * The project's client brief: rendered view (server-rendered children), an in-place markdown editor,
 * and the client's files (upload by button or drag and drop, open, remove).
 */
export function ClientBrief({
  slug,
  state,
  source,
  template,
  files,
  updatedAt,
  children,
}: {
  slug: string
  state: BriefState
  source: string | null
  template: string
  files: BriefFile[]
  updatedAt: string | null
  children: React.ReactNode
}) {
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState('')
  const [message, setMessage] = useState<ActionState>(null)
  const [fileMessage, setFileMessage] = useState<ActionState>(null)
  const [removing, setRemoving] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const [saving, startSave] = useTransition()
  const [uploading, startUpload] = useTransition()
  const input = useRef<HTMLInputElement>(null)
  const dirty = editing && text !== (source ?? template)

  useEffect(() => {
    if (!dirty) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  const edit = () => {
    setText(source ?? template)
    setMessage(null)
    setEditing(true)
  }

  const save = () =>
    startSave(async () => {
      const r = await saveBriefAction(slug, text)
      setMessage(r)
      if (r?.ok || r?.message.startsWith('Saved')) setEditing(false)
    })

  const upload = (list: FileList | File[]) => {
    const picked = Array.from(list).filter((f) => f.size > 0)
    if (!picked.length) return
    const form = new FormData()
    for (const f of picked) form.append('files', f)
    startUpload(async () => setFileMessage(await uploadBriefFilesAction(slug, form)))
  }

  const remove = (name: string) => {
    setRemoving(null)
    startUpload(async () => setFileMessage(await deleteBriefFileAction(slug, name)))
  }

  return (
    <div className="card">
      <div className="card-head">
        <h2>Client brief</h2>
        <span className="row" style={{ gap: 'var(--s-3)' }}>
          {updatedAt && <span className="faint small">updated {relativeTime(updatedAt)}</span>}
          {!editing && (
            <button type="button" className="btn btn-ghost" onClick={edit}>
              <Pencil aria-hidden /> {state === 'filled' ? 'Edit' : 'Write the brief'}
            </button>
          )}
        </span>
      </div>

      {editing ? (
        <div className="stack-sm">
          <textarea
            className="textarea mono"
            aria-label="Client brief (markdown)"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={24}
            spellCheck
            autoFocus
            style={{ fontSize: 'var(--t-xs)', lineHeight: 1.6 }}
          />
          <span className="hint">
            Markdown, saved to <code>client-brief/brief.md</code>. Paste the client&rsquo;s words as they are. Agents read this first and never edit it. No
            passwords or API keys.
          </span>
          <div className="row">
            <button type="button" className="btn btn-primary" onClick={save} disabled={saving}>
              {saving ? (
                <>
                  <Loader2 aria-hidden style={{ animation: 'spin 0.9s linear infinite' }} /> Saving…
                </>
              ) : (
                'Save brief'
              )}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => (setEditing(false), setMessage(null))} disabled={saving}>
              Cancel
            </button>
            <Message state={message} />
          </div>
        </div>
      ) : (
        <>
          {state === 'filled' ? (
            <DocumentPreview source={source ?? ''} label="client brief">{children}</DocumentPreview>
          ) : (
            <p className="muted small">
              No brief yet. Paste what the client asked for (their email, message, or call notes) and add the files they sent. Agents read this before
              anything else, so starting a session on this project needs no extra context.
            </p>
          )}
          {message && <Message state={message} />}
        </>
      )}

      <hr className="divider" />

      <div
        className="stack-sm"
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
          upload(e.dataTransfer.files)
        }}
        style={{
          borderRadius: 'var(--radius-sm)',
          outline: dragging ? '2px dashed var(--border-strong)' : '2px dashed transparent',
          outlineOffset: 'var(--s-1)',
        }}
      >
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <span className="row small" style={{ gap: 'var(--s-2)' }}>
            <Paperclip size={14} aria-hidden /> Files from the client
            <span className="faint mono">client-brief/files/</span>
          </span>
          <button type="button" className="btn btn-ghost" onClick={() => input.current?.click()} disabled={uploading}>
            {uploading ? <Loader2 aria-hidden style={{ animation: 'spin 0.9s linear infinite' }} /> : <Upload aria-hidden />} Add files
          </button>
          <input
            ref={input}
            type="file"
            multiple
            hidden
            onChange={(e) => {
              if (e.target.files) upload(e.target.files)
              e.target.value = ''
            }}
          />
        </div>

        {files.length === 0 ? (
          <p className="faint small">Drop sanitized UTF-8 text extracts here (up to 25 MB each). Keep binary originals outside the repository.</p>
        ) : (
          <div className="list">
            {files.map((f) => (
              <div key={f.name} className="list-item" style={{ alignItems: 'center' }}>
                <FileText size={14} aria-hidden />
                <div className="list-body">
                  <a href={`/api/projects/${slug}/brief-files/${encodeURIComponent(f.name)}`} target="_blank" rel="noreferrer" className="truncate small">
                    {f.name}
                  </a>
                  <span className="list-meta">
                    {bytes(f.size)} · {relativeTime(f.modified)}
                  </span>
                </div>
                <button type="button" className="btn btn-ghost btn-icon" aria-label={`Remove ${f.name}`} onClick={() => setRemoving(f.name)} disabled={uploading}>
                  <X aria-hidden />
                </button>
              </div>
            ))}
          </div>
        )}
        <Message state={fileMessage} />
      </div>

      <ConfirmDialog
        open={removing !== null}
        title="Remove this file?"
        confirmLabel="Remove file"
        tone="warn"
        onConfirm={() => removing && remove(removing)}
        onCancel={() => setRemoving(null)}
      >
        <p>
          <strong>{removing}</strong> is deleted from <code>client-brief/files/</code>. If it was committed to the project&rsquo;s git repo, it
          stays in the history there.
        </p>
      </ConfirmDialog>
    </div>
  )
}
